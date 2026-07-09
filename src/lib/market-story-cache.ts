import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase";
import { ADVICE_BOUNDARY } from "@/lib/claude";
import type { DiaryMarketMove } from "@/lib/diary-market-moves";

// The "story behind" an auto-logged market swing: one short, search-grounded
// sentence saying WHY a symbol moved on a given date (e.g. "Prices slid as the
// Fed signalled rates would stay higher for longer."). The templated entry
// already states the up/down move and the € impact — this adds the *reason*.
//
// The reason a market or a held asset moved on a date is GLOBAL — it does not
// depend on whose portfolio it is — so it's generated once and cached per
// (date, symbol) in `market_stories`, shared across every user (same shape as
// price_history / fx_rate_history). Two consequences:
//   • The per-user swing rebuild (generateMarketSwings) never calls the model —
//     it stays pure price/FX math. Stories are attached at read time from the
//     cache and generated in the BACKGROUND, so nothing on the hot path waits on
//     an LLM/web-search call. Adding stories does NOT slow the rebuild.
//   • Across the whole user base only a handful of new stories are generated a
//     month (the swing caps are tiny and the cache is shared), so the model cost
//     is a bounded, one-time-per-event cost — not a per-user tax.
//
// Everything here is best-effort: a missing table (before the migration is
// applied) or any error degrades to "no story" and the entry renders exactly as
// it does today. Safe to deploy ahead of the SQL.

// Lazily constructed so that importing this module (e.g. the pure-helper unit
// tests, or the read path's attachStories, which never calls the model) does not
// require an ANTHROPIC_API_KEY — only generateStory, in the background, does.
let _anthropic: Anthropic | null = null;
function client(): Anthropic {
  return (_anthropic ??= new Anthropic());
}

// Grounded, current-model market-news surface — mirrors market-highlights.ts
// (same model + web_search tool version), which already does live news lookups
// for the same kind of holding-relevant market copy.
const STORY_MODEL = "claude-sonnet-4-6";
// A story is one clause of market colour; keep it tight. Longer = drop (likely a
// rambling or hedged answer we don't want on the card).
const STORY_MAX_LEN = 180;
// Upper bound on model calls per background pass. Global sharing means the cache
// converges fast, so a small cap keeps each pass cheap while stories fill in over
// a few views/cron ticks. Asset-relevant entries are generated first (see below).
const DEFAULT_BACKFILL_LIMIT = 6;

export interface StoryTarget {
  date: string;   // YYYY-MM-DD
  symbol: string; // the swing headline symbol (index_symbol)
  label: string;  // display name (index or asset)
  kind: "index" | "asset";
  pctChange: number;
}

export function storyKey(date: string, symbol: string): string {
  return `${date}|${symbol}`;
}

// ── Pure helpers (unit-tested, no I/O) ───────────────────────────────────────

// Parses the model's reply into a story or an explicit "no story". THROWS on a
// malformed reply so the caller skips caching and retries later (a transient
// model hiccup must never be cached as a permanent "no cause"). A deliberate
// `{"reason": null}` — the model found no confident cause — returns { story:
// null }, which IS cached so a noisy day isn't re-queried forever.
export function parseStoryResponse(text: string): { story: string | null } {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    // Model wrapped the JSON in prose despite instructions — salvage the object.
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    if (s < 0 || e <= s) throw new Error("story reply is not JSON");
    obj = JSON.parse(cleaned.slice(s, e + 1));
  }

  const reason = (obj && typeof obj === "object") ? (obj as { reason?: unknown }).reason : undefined;
  if (reason === null || reason === undefined) return { story: null };
  if (typeof reason !== "string") return { story: null };

  const s = reason.trim().replace(/^["']+|["']+$/g, "").trim();
  if (!s) return { story: null };
  // Over-long → treat as no story rather than truncate mid-sentence.
  if (s.length > STORY_MAX_LEN) return { story: null };
  return { story: s };
}

// Chooses which targets to generate this pass: those with no cached row yet,
// asset-relevant entries first (the feature's explicit priority), then newest
// date first, capped at `limit`. Deduped by (date, symbol). Pure.
export function pendingStoryTargets(
  targets: StoryTarget[],
  resolvedKeys: Set<string>,
  limit: number,
): StoryTarget[] {
  const seen = new Set<string>();
  const pending: StoryTarget[] = [];
  for (const t of targets) {
    const k = storyKey(t.date, t.symbol);
    if (resolvedKeys.has(k) || seen.has(k)) continue;
    seen.add(k);
    pending.push(t);
  }
  pending.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "asset" ? -1 : 1; // asset entries first
    return b.date.localeCompare(a.date);                        // then newest first
  });
  return pending.slice(0, Math.max(0, limit));
}

// ── DB access (best-effort; table-missing tolerant) ──────────────────────────

// Reads the cached rows for the given (date, symbol) pairs. Returns a map of
// key → story (which may be null for a resolved "no cause" row). A present key
// means "already looked up"; an absent key means "not yet attempted". Any read
// error (most importantly, the table not existing pre-migration) yields an empty
// map, so callers degrade to "no story".
async function readStoryRows(
  pairs: Array<{ date: string; symbol: string }>,
  supabase: SupabaseClient,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (pairs.length === 0) return out;
  try {
    const dates = [...new Set(pairs.map((p) => p.date))];
    const symbols = [...new Set(pairs.map((p) => p.symbol))];
    const wanted = new Set(pairs.map((p) => storyKey(p.date, p.symbol)));
    const { data, error } = await supabase
      .from("market_stories")
      .select("date, symbol, story")
      .in("date", dates)
      .in("symbol", symbols);
    if (error || !data) return out;
    for (const r of data) {
      const k = storyKey(r.date as string, r.symbol as string);
      // The date×symbol `.in` filter is a cross-product; keep only the exact pairs asked for.
      if (wanted.has(k)) out.set(k, (r.story as string | null) ?? null);
    }
  } catch {
    /* table missing / transient — degrade to no cache */
  }
  return out;
}

// Attaches the cached story (when present) to each move, matched by its headline
// (date, index_symbol). Mutates and returns the same array. A no-op when nothing
// is cached yet — the entries then render without a story, exactly as before.
export async function attachStories(
  moves: DiaryMarketMove[],
  supabase: SupabaseClient = createServerSupabase(),
): Promise<DiaryMarketMove[]> {
  if (moves.length === 0) return moves;
  const rows = await readStoryRows(
    moves.map((m) => ({ date: m.date, symbol: m.index_symbol })),
    supabase,
  );
  for (const m of moves) {
    const story = rows.get(storyKey(m.date, m.index_symbol));
    if (story) m.story = story;
  }
  return moves;
}

// ── Generation (background only) ─────────────────────────────────────────────

// Asks the model, grounded by web search, WHY the headline moved that day.
// Returns the story string, or null when there is no confident single cause.
// THROWS on a transient/model error so the caller does not cache a failure.
async function generateStory(t: StoryTarget): Promise<{ story: string | null }> {
  const dir = t.pctChange >= 0 ? "rose" : "fell";
  const pct = Math.abs(t.pctChange).toFixed(1);
  const what = t.kind === "asset" ? "this holding" : "this market index";

  const system = `You explain, in one short sentence, WHY a financial instrument moved on a specific past date, for a personal portfolio diary. You have web_search.
1. Search for news from AROUND the given date that explains the move. Prefer reporting dated on or within a day or two of it.
2. Return ONE sentence of market colour — the reason the instrument moved that day — at most ${STORY_MAX_LEN} characters. Phrase it observationally, as a cause, using "as", "after", "amid", "on" (e.g. "Prices slid as the Fed signalled rates would stay higher for longer.", "Shares jumped after a strong earnings beat.").
3. If there is NO clear, well-supported single cause (a quiet or noisy day, thin coverage, or only vague macro drift), return null. Do NOT guess, invent, or force a reason. A wrong reason is worse than none.
4. Do NOT mention the percentage, the date, or the portfolio — only the reason. Do not name a source.
5. Output ONLY a JSON object, no prose, no markdown, no code fences. Schema: { "reason": string | null }

${ADVICE_BOUNDARY}`;

  const user = `Instrument: ${t.label} (${t.symbol}) — ${what}
It ${dir} about ${pct}% on ${t.date}.
Why did it move that day?`;

  let response: Anthropic.Messages.Message | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await client().messages.create({
        model: STORY_MODEL,
        max_tokens: 1024,
        system,
        tools: [{ type: "web_search_20260209", name: "web_search" }],
        messages: [{ role: "user", content: user }],
      });
      break;
    } catch (err) {
      if (attempt === 1) throw err; // transient — let the caller skip caching, retry later
    }
  }
  if (!response) throw new Error("no response");

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim();
  if (!text) throw new Error("empty story reply");

  return parseStoryResponse(text); // throws on malformed → not cached
}

// Persists a completed lookup (story or a deliberate null). Best-effort — a write
// error (table missing, transient) simply leaves the pair unresolved for a later
// pass, so nothing is lost and no failure is cached as "no story".
async function storeStory(
  t: StoryTarget,
  story: string | null,
  supabase: SupabaseClient,
): Promise<void> {
  try {
    await supabase
      .from("market_stories")
      .upsert({ date: t.date, symbol: t.symbol, story }, { onConflict: "date,symbol" });
  } catch {
    /* cache write is best-effort */
  }
}

// Fills in the missing stories for a set of swing entries — bounded per pass.
// Meant to run in the background (Next `after()` on the read path, off the hot
// path), so the user never waits: stories appear on the next view as the cache
// fills. Idempotent and safe to run concurrently (upsert dedups; a duplicate
// in-flight generation at worst wastes one call). Best-effort throughout.
export async function backfillMarketStories(
  moves: DiaryMarketMove[],
  limit: number = DEFAULT_BACKFILL_LIMIT,
): Promise<void> {
  try {
    const supabase = createServerSupabase();
    const targets: StoryTarget[] = moves.map((m) => ({
      date: m.date,
      symbol: m.index_symbol,
      label: m.index_label,
      kind: m.kind === "asset" ? "asset" : "index",
      pctChange: m.pct_change,
    }));

    const rows = await readStoryRows(
      targets.map((t) => ({ date: t.date, symbol: t.symbol })),
      supabase,
    );
    const pending = pendingStoryTargets(targets, new Set(rows.keys()), limit);
    if (pending.length === 0) return;

    await Promise.all(
      pending.map(async (t) => {
        try {
          const { story } = await generateStory(t);
          await storeStory(t, story, supabase);
        } catch (err) {
          await reportStoryError(err); // transient → leave unresolved, retried next pass
        }
      }),
    );
  } catch (err) {
    await reportStoryError(err);
  }
}

async function reportStoryError(err: unknown): Promise<void> {
  if (process.env.SENTRY_DSN) {
    try {
      const S = await import("@sentry/nextjs");
      S.captureException(err, { tags: { fn: "backfillMarketStories" } });
    } catch {
      /* noop */
    }
  }
}
