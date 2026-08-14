"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { track } from "@vercel/analytics";
import { useSubscription } from "@/components/SubscriptionProvider";
import { formatMoney, type DisplayCurrency } from "@/lib/money";
import { invalidateAssetsCache, invalidateInsightCache, invalidateVitalsCache } from "@/lib/hooks";
import { bumpPortfolioRevision } from "@/lib/portfolio-revision";
import { watchPortfolioBuild, refreshAfterQuickCommit } from "@/lib/portfolio-build";
import {
  CHAT_TTL_MS, CHAT_LOAD_LIMIT, chatHistoryCacheKey, CHAT_HISTORY_PREFIX,
  CHAT_IMAGE_MAX_EDGE_PX, CHAT_IMAGE_JPEG_QUALITY, CHAT_IMAGE_MAX_INPUT_MB,
  CHAT_MAX_PDFS, CHAT_PDF_MAX_MB, CHAT_CSV_MAX_BYTES, CHAT_CSV_MAX_ROWS,
  CHAT_CSV_MAX_TEXT_LEN, CHAT_REQUEST_MAX_BASE64, CHAT_REPLY_WAIT_MS,
} from "@/lib/constants";

// Poll cadence while waiting for a reply to commit: quick at first, backing off
// over a long wait so a multi-minute window doesn't hammer /api/messages.
const replyPollDelay = (elapsedMs: number): number =>
  elapsedMs < 30_000 ? 2500 : elapsedMs < 90_000 ? 5000 : 10_000;
import type { ScenarioHandoff } from "@/lib/scenario/handoff";
import type { ScenarioResult } from "@/lib/scenario/result";
import { apiFetch } from "@/lib/api";

export interface ChatMessage {
  id?: string;
  /** Stable client-side React key — assigned on create/load so a load-more
   * prepend doesn't shift array indices and re-mount/re-animate the thread. */
  localId?: string;
  from: "user" | "assistant";
  text: string;
  imagePreviews?: string[];
  suggestedReplies?: string[] | null;
  /** Ephemeral inline scenario card (not persisted; lost on history reload). */
  scenarioResult?: ScenarioResult | null;
}

// What the current in-flight turn is chewing on, so the thinking indicator can
// name it ("Reading your screenshot…") instead of bare dots — reassuring on
// onboarding, when the user has just handed over a screenshot / statement / list
// of holdings and wants to know it landed. Transient (never persisted); captured
// at send time because the attachment arrays are wiped before the reply lands.
export type ProcessingKind = "image" | "pdf" | "csv" | "holdings";

// Monotonic counter backing the stable client-side message key (localId).
let localIdSeq = 0;
const nextLocalId = () => `m${++localIdSeq}`;

// Maps DB message rows into ChatMessages, splitting an assistant turn that was
// stored as multiple parts ("\n---\n"). Shared by the initial load, the pending-
// reply reconcile, and load-more so the three can't drift.
function mapDbMessages(
  rows: Array<{ id: string; role: "user" | "assistant"; content: string; suggested_replies?: string[] | null; tool_result?: ScenarioResult | null }>,
): ChatMessage[] {
  return rows.flatMap((m): ChatMessage[] => {
    if (m.role === "assistant" && m.content.includes("\n---\n")) {
      return m.content.split("\n---\n").map((part, i, arr) => ({
        id: i === 0 ? m.id : undefined,
        localId: nextLocalId(),
        from: "assistant" as const,
        text: part.trim(),
        suggestedReplies: i === arr.length - 1 ? (m.suggested_replies ?? null) : null,
        scenarioResult: i === arr.length - 1 ? (m.tool_result ?? null) : null,
      }));
    }
    return [{ id: m.id, localId: nextLocalId(), from: m.role, text: m.content, suggestedReplies: m.suggested_replies ?? null, scenarioResult: m.tool_result ?? null }];
  });
}

// User-turn placeholders: what the client DISPLAYS for an attachment-only turn,
// and what the server PERSISTS for one.
const ATTACHMENT_PLACEHOLDERS = new Set([
  "[file uploaded]", "[screenshot uploaded]",
  "Screenshot uploaded", "Screenshots uploaded", "File uploaded", "Files uploaded",
]);

// Counts the user turns in a thread that match the sent text (or, for an
// attachment-only turn, any known placeholder). Used to disambiguate CONSECUTIVE
// DUPLICATE sends in threadHasReply below.
function countMatchingUserTurns(msgs: ChatMessage[], sentText: string | null): number {
  const isPlaceholder = !sentText || ATTACHMENT_PLACEHOLDERS.has(sentText.trim());
  const matches = (t: string) => (isPlaceholder ? ATTACHMENT_PLACEHOLDERS.has(t) : t === sentText!.trim());
  return msgs.filter((m) => m.from === "user" && matches(m.text.trim())).length;
}

// True when a DB snapshot shows the pending turn answered: the thread tail is an
// assistant reply and the final user row matches what was sent. Matching on the
// TEXT (not on "the newest DB id changed") matters: live-sent turns never carry
// DB ids, so an id captured from the last DB *load* can be several turns stale —
// an id-inequality check then adopts a snapshot that predates the pending turn,
// dropping the user's message mid-wait (the exact vanish-and-re-add regression).
//
// `minMatches` guards the OTHER direction of the same regression: when the
// pending text is identical to the immediately preceding, already-answered turn
// ("yes" answering two intake questions in a row), the tail check alone matches
// the OLD turn on the very first poll and adopts a stale snapshot — vanishing
// the pending message and hiding its late reply. Callers pass how many matching
// user turns the client thread holds (pending included); only a snapshot that
// actually contains the NEW row can reach that count.
function threadHasReply(mapped: ChatMessage[], sentText: string | null, minMatches = 1): boolean {
  if (mapped.length === 0 || mapped[mapped.length - 1].from !== "assistant") return false;
  const lastUser = [...mapped].reverse().find((m) => m.from === "user");
  if (!lastUser) return false;
  const dbText = lastUser.text.trim();
  const isPlaceholder = !sentText || ATTACHMENT_PLACEHOLDERS.has(sentText.trim());
  const tailMatches = isPlaceholder ? ATTACHMENT_PLACEHOLDERS.has(dbText) : dbText === sentText.trim();
  if (!tailMatches) return false;
  return countMatchingUserTurns(mapped, sentText) >= Math.max(1, minMatches);
}

interface ChatResponse {
  message?: string;
  error?: string;
  suggested_replies?: string[] | null;
  scenarioResult?: ScenarioResult | null;
  scenarioPending?: Record<string, unknown> | null;
  remaining?: number;
  analyticsEvent?: string;
  /** Optional numeric properties attached to analyticsEvent (e.g.
   * minutes_since_signup on first_asset_added). */
  analyticsProps?: Record<string, number>;
  assets?: unknown;
  /** Explicit signal that the portfolio mutated this turn; preferred over
   * inferring from `assets` for cache invalidation. */
  portfolioChanged?: boolean;
  /** A past-dated add kicked off a background net-worth history rebuild; the
   * client shows a "building" indicator and auto-refreshes until it lands. */
  building?: boolean;
  /** Demo session past its hour — the server walled the turn (403). */
  demoExpired?: boolean;
  /** Demo session spent its message allowance — the server refused the turn (429). */
  demoLimitReached?: boolean;
}

const ROUND_AMOUNT: Record<DisplayCurrency, number> = {
  EUR: 10_000,
  USD: 10_000,
  GBP: 10_000,
};

const ROUND_SYMBOL: Record<DisplayCurrency, string> = {
  EUR: "€", USD: "$", GBP: "£",
};

export function getChatSuggestions(
  displayCurrency: DisplayCurrency,
  hasPortfolio: boolean,
): string[] {
  if (!hasPortfolio) {
    return [
      "List the stocks I own",
      "Add a property",
      "I have €25,000 in savings",
      "Paste a broker screenshot",
    ];
  }
  const sym = ROUND_SYMBOL[displayCurrency];
  const amt = ROUND_AMOUNT[displayCurrency].toLocaleString("en");
  return [
    "How diversified am I?",
    `Add ${sym}${amt} in S&P 500 ETF`,
    "What is my largest position?",
    "What if markets drop 20%?",
  ];
}

// Shared across ChatPopup and /chat so history persists between surfaces
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
// Conservative "this typed turn looks like a holdings list" test — a currency
// figure or a share/unit count. A plain question ("how diversified am I?") must
// NOT trip it, so it needs an amount, not just any digit.
const HOLDINGS_HINT = /[$€£]\s?\d|\d[\d,.]*\s?(k\b|shares?\b|units?\b)/i;
const CSV_TYPES = new Set(["text/csv", "application/csv", "application/vnd.ms-excel"]);
const isCsvFile = (f: File) => CSV_TYPES.has(f.type) || /\.csv$/i.test(f.name);
const isPdfFile = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

const readDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });

// Downscale + re-encode an image entirely in the browser BEFORE upload. A phone
// screenshot (2–4 MB PNG) becomes a ~150–400 KB JPEG at the model's native
// resolution (long edge ≤ CHAT_IMAGE_MAX_EDGE_PX): small enough to keep the whole
// request under the serverless body limit, large enough that packed holdings text
// stays legible for extraction. Returns null on an unreadable/oversized original
// so the caller can surface a message.
async function compressImageFile(
  file: File,
): Promise<{ base64: string; mediaType: string; previewUrl: string } | null> {
  // Reject a monster original before decoding it — a huge bitmap can OOM the
  // mobile webview's canvas.
  if (file.size > CHAT_IMAGE_MAX_INPUT_MB * 1024 * 1024) return null;
  try {
    const srcUrl = await readDataUrl(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode failed"));
      i.src = srcUrl;
    });
    let { width, height } = img;
    if (!width || !height) return null;
    const longEdge = Math.max(width, height);
    if (longEdge > CHAT_IMAGE_MAX_EDGE_PX) {
      const scale = CHAT_IMAGE_MAX_EDGE_PX / longEdge;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // White backdrop so a transparent PNG doesn't flatten to black under JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const outUrl = canvas.toDataURL("image/jpeg", CHAT_IMAGE_JPEG_QUALITY);
    const base64 = outUrl.split(",")[1] ?? "";
    if (!base64) return null;
    return { base64, mediaType: "image/jpeg", previewUrl: outUrl };
  } catch {
    return null;
  }
}

// PDF: passed to the model as a document block (it extracts the text/tables). No
// compression is possible, so this is the one attachment bounded purely by size.
async function readPdfFile(file: File): Promise<{ name: string; base64: string } | null> {
  if (file.size > CHAT_PDF_MAX_MB * 1024 * 1024) return null;
  try {
    const base64 = (await readDataUrl(file)).split(",")[1] ?? "";
    return base64 ? { name: file.name, base64 } : null;
  } catch {
    return null;
  }
}

// CSV: parsed to plain text and sent as a normal text turn (a model can't "see" a
// CSV as an image). Capped by both raw bytes and row count so a transaction-heavy
// export can't blow the context budget.
async function readCsvFile(file: File): Promise<{ name: string; text: string } | null> {
  if (file.size > CHAT_CSV_MAX_BYTES) return null;
  try {
    const raw = await file.text();
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const kept = lines.slice(0, CHAT_CSV_MAX_ROWS + 1); // +1 for a header row
    let text = kept.join("\n");
    if (lines.length > kept.length) text += `\n… (${lines.length - kept.length} more rows not shown)`;
    if (text.length > CHAT_CSV_MAX_TEXT_LEN) text = text.slice(0, CHAT_CSV_MAX_TEXT_LEN) + "\n… (truncated)";
    return { name: file.name, text };
  } catch {
    return null;
  }
}

interface Options {
  userId: string | undefined;
  onPortfolioUpdate?: () => void;
  onNewMessage?: () => void;
  /** Extra fields merged into every /api/chat request body — read at send time, so
   *  callers can attach live context (e.g. the onboarding scope). */
  extraPayload?: () => Record<string, unknown>;
  /** Start with an empty thread and don't load or persist history. Used by the
   *  onboarding flow so it always opens clean (no old transcript), matching the
   *  "no transcript restore" rule. Turns still save server-side via /api/chat. */
  skipHistory?: boolean;
}

export function useChatSession({ userId, onPortfolioUpdate, onNewMessage, extraPayload, skipHistory }: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  // Non-null only while send() is processing a data-bearing turn (attachment or a
  // holdings list), so the indicator can name what it's reading. Cleared the
  // moment the reply lands or the wait ends.
  const [processingKind, setProcessingKind] = useState<ProcessingKind | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  // The demo session is over — either past its hour (403 demoExpired) or out of
  // messages (429 demoLimitReached). The composer swaps to a quiet sign-up line.
  const [demoEnded, setDemoEnded] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageData, setImageData] = useState<Array<{ base64: string; mediaType: string }>>([]);
  const [pdfData, setPdfData] = useState<Array<{ name: string; base64: string }>>([]);
  const [csvData, setCsvData] = useState<Array<{ name: string; text: string }>>([]);
  // Transient "that file didn't work" message, shown under the composer and
  // cleared the moment the user tries another attachment or sends.
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreInFlight = useRef(false);
  // Synchronous guard against a double-send race: the `loading` state is async,
  // so two fast taps can both pass its check and fire two POSTs. This ref flips
  // synchronously, so the second tap bails before a second request goes out.
  const sendInFlightRef = useRef(false);
  // Free-typed scenario awaiting a [Show me] confirmation; echoed back to compute.
  const pendingScenarioRef = useRef<Record<string, unknown> | null>(null);
  // Latest messages, for callbacks that shouldn't re-create when messages change.
  const messagesRef = useRef<ChatMessage[]>([]);
  // Tracks whether this surface is still mounted, so a reconcile poll started in
  // send()'s error path stops itself when the user navigates away (the remount
  // effect then takes over the reconciliation).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // The server's chat allowance is a per-UTC-date bucket, but `remaining` is
  // plain state in an app-lifetime provider. iOS keeps the webview in memory
  // across days, so a composer dead on yesterday's 0 ("back tomorrow") would
  // stay dead until a force-quit. Stamp the day each server-reported balance
  // belongs to, and drop the balance when the app comes to the foreground on a
  // later date — the next send then re-learns the real balance.
  const remainingDayRef = useRef<string | null>(null);
  useEffect(() => {
    if (remaining !== null) remainingDayRef.current = new Date().toISOString().slice(0, 10);
  }, [remaining]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const today = new Date().toISOString().slice(0, 10);
      if (remainingDayRef.current && remainingDayRef.current !== today) {
        remainingDayRef.current = null;
        setRemaining(null);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Use refs for callbacks so send() doesn't recreate when parent re-renders
  const onPortfolioUpdateRef = useRef(onPortfolioUpdate);
  const onNewMessageRef = useRef(onNewMessage);
  const extraPayloadRef = useRef(extraPayload);
  useEffect(() => { onPortfolioUpdateRef.current = onPortfolioUpdate; }, [onPortfolioUpdate]);
  useEffect(() => { onNewMessageRef.current = onNewMessage; }, [onNewMessage]);
  useEffect(() => { extraPayloadRef.current = extraPayload; }, [extraPayload]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Demo funnel — one event per chat turn a DEMO visitor sends, carrying the
  // turn's 1-based index so drop-off per turn is visible (the demo session is
  // capped at DEMO_CHAT_DAILY_LIMIT turns, so the index tops out there). Read
  // through a ref so the send callbacks don't re-create when the entitlement
  // resolves. Inert for every real account — a signed-in user is never isDemo.
  const { data: subscription } = useSubscription();
  const isDemoRef = useRef(false);
  useEffect(() => { isDemoRef.current = !!subscription?.isDemo; }, [subscription?.isDemo]);
  // Derived from the thread rather than a plain counter, so a reload mid-demo
  // (the cached history is restored) continues the sequence instead of
  // restarting at 1. Called BEFORE the turn's own bubble is appended, hence +1.
  const trackDemoMessageSent = useCallback(() => {
    if (!isDemoRef.current) return;
    const index = messagesRef.current.filter((m) => m.from === "user").length + 1;
    track("demo_message_sent", { message_index: index });
  }, []);

  useEffect(() => {
    if (!userId || skipHistory) return;

    const key = chatHistoryCacheKey(userId);
    const controller = new AbortController();
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    // --- Load localStorage (instant display) ---
    let cached: ChatMessage[] = [];
    try {
      // Sweep any keys belonging to other users (check both old and new prefix)
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(CHAT_HISTORY_PREFIX) || k.startsWith("volnar_chat_history_")) && k !== key) {
          localStorage.removeItem(k);
        }
      }
      const raw = localStorage.getItem(key);
      if (raw) {
        const { messages: stored, ts } = JSON.parse(raw) as { messages: ChatMessage[]; ts: number };
        if (Date.now() - ts < CHAT_TTL_MS) {
          if (stored.length > 0) {
            // Backfill stable keys for cache entries written before localId
            // existed, then advance the seq past restored ids so freshly-minted
            // keys can't collide with them (a fresh page load resets the counter
            // to 0, so without this the next send mints a duplicate "m1").
            for (const m of stored) {
              const n = m.localId?.match(/^m(\d+)$/);
              if (n) localIdSeq = Math.max(localIdSeq, Number(n[1]));
            }
            cached = stored.map((m) => (m.localId ? m : { ...m, localId: nextLocalId() }));
            setMessages(cached);
          }
        } else {
          localStorage.removeItem(key);
        }
      }
    } catch {}

    const fetchDb = async (): Promise<ChatMessage[] | null> => {
      const r = await apiFetch(`/api/messages?limit=${CHAT_LOAD_LIMIT}`, { signal: controller.signal });
      const data = await r.json();
      if (!Array.isArray(data?.messages)) return null;
      if (data.messages.length === 0) { if (!cancelled) setHasMore(false); return []; }
      const mapped = mapDbMessages(data.messages);
      if (data.messages.length < CHAT_LOAD_LIMIT && !cancelled) setHasMore(false);
      return mapped;
    };

    // A cached thread that ends with a USER turn means a send didn't get its
    // answer persisted on THIS surface — i.e. the user switched tabs mid-request,
    // unmounting the component so its setMessages/localStorage write were no-ops.
    // The answer is saved server-side regardless, so re-show the waiting state
    // and poll the DB until the pending turn commits (a message newer than the
    // last one we already have), then adopt the reconciled thread.
    const last = cached[cached.length - 1];
    const awaitingReply = cached.length > 0 && last?.from === "user";

    if (cached.length === 0) {
      // No usable cache — plain DB load.
      fetchDb()
        .then((mapped) => { if (mapped && mapped.length > 0 && !cancelled) setMessages(mapped); })
        .catch((err) => { if (err?.name !== "AbortError") console.error("Chat history fetch failed:", err); });
    } else if (awaitingReply) {
      setLoading(true);
      setThinking(true);
      const startedAt = Date.now();
      // Duplicate-send discriminator: the snapshot must hold at least as many
      // user turns with this text as the cached thread does (pending included).
      const expectedMatches = countMatchingUserTurns(cached, last?.text ?? null);
      const poll = async () => {
        if (cancelled) return;
        let mapped: ChatMessage[] | null = null;
        try { mapped = await fetchDb(); }
        catch (err) { if ((err as { name?: string })?.name === "AbortError") return; }
        if (cancelled) return;
        // Committed = the DB snapshot contains OUR pending turn answered — never
        // "some id changed" (see threadHasReply for why id comparison drops turns).
        const committed = !!mapped && threadHasReply(mapped, last?.text ?? null, expectedMatches);
        if (committed) {
          setMessages(mapped!);
          setLoading(false);
          setThinking(false);
          return;
        }
        const elapsed = Date.now() - startedAt;
        if (elapsed < CHAT_REPLY_WAIT_MS) {
          pollTimer = setTimeout(poll, replyPollDelay(elapsed));
        } else {
          // Held the whole window without the reply committing. Stop the spinner
          // but LEAVE the user's message as the thread tail, so opening the chat
          // again re-detects the pending turn and resumes this poll — the reply is
          // never permanently lost, it just appears whenever it finally lands.
          setLoading(false);
          setThinking(false);
        }
      };
      poll();
    }

    return () => { cancelled = true; controller.abort(); if (pollTimer) clearTimeout(pollTimer); };
  }, [userId, skipHistory]);

  // Write only the latest CHAT_LOAD_LIMIT messages to localStorage — older paginated history stays out of the cache.
  useEffect(() => {
    if (!userId || skipHistory) return;
    // Never overwrite a good cache with an EMPTY thread. On the userId
    // undefined→defined commit (cold start, or a second session's first mount)
    // this effect runs in the same flush as the load effect while `messages` is
    // still [] — persisting [] here would clobber history another surface saved.
    // No path legitimately persists an empty thread (there is no clear-chat
    // feature; every emptying is a localStorage.removeItem), so this is safe.
    if (messages.length === 0) return;
    try {
      const latest = messages.slice(-CHAT_LOAD_LIMIT);
      const stripped = latest.map(({ id, localId, from, text, suggestedReplies, scenarioResult }) => ({ id, localId, from, text, suggestedReplies, scenarioResult }));
      localStorage.setItem(chatHistoryCacheKey(userId), JSON.stringify({ messages: stripped, ts: Date.now() }));
    } catch {}
  }, [messages, userId, skipHistory]);

  const loadMore = useCallback(async () => {
    if (!userId || loadMoreInFlight.current || !hasMore) return;
    const oldestId = messages.find((m) => m.id)?.id;
    if (!oldestId) return;

    loadMoreInFlight.current = true;
    setIsLoadingMore(true);

    try {
      const res = await apiFetch(`/api/messages?limit=${CHAT_LOAD_LIMIT}&before=${oldestId}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data?.messages)) return;

      if (data.messages.length === 0) {
        setHasMore(false);
        return;
      }

      const older = mapDbMessages(data.messages);

      setMessages((prev) => [...older, ...prev]);
      if (data.messages.length < CHAT_LOAD_LIMIT) setHasMore(false);
    } catch {
      // silently fail
    } finally {
      loadMoreInFlight.current = false;
      setIsLoadingMore(false);
    }
  }, [userId, hasMore, messages]);

  const MAX_IMAGES = 5;

  const clearImage = useCallback(() => {
    setImagePreviews([]);
    setImageData([]);
    setPdfData([]);
    setCsvData([]);
    setAttachmentError(null);
  }, []);

  // Clear the visible thread + composer. Used by onboarding to start each asset on a
  // fresh, focused conversation (the server still has the full history, so the
  // assistant keeps its context; only the local display resets).
  const reset = useCallback(() => {
    setMessages([]);
    setInput("");
    setImagePreviews([]);
    setImageData([]);
    setPdfData([]);
    setCsvData([]);
    setAttachmentError(null);
    pendingScenarioRef.current = null;
  }, []);

  const removeImage = useCallback((index: number) => {
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    setImageData((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removePdf = useCallback((index: number) => {
    setPdfData((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removeCsv = useCallback((index: number) => {
    setCsvData((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Single entry point for the picker, drag-drop, and the empty-state hand-off.
  // Routes by file kind, does all validation + compression up front, and — unlike
  // before — tells the user when something is rejected instead of silently
  // dropping it. Async because image compression and file reads are async.
  const MAX_CSVS = 2;
  const handleFile = useCallback(async (file: File) => {
    setAttachmentError(null);
    if (isPdfFile(file)) {
      // Cap-check BEFORE the read so a rejected file gets a message (never a silent
      // drop) and we don't spend work reading a file we won't keep.
      if (pdfData.length >= CHAT_MAX_PDFS) { setAttachmentError(`You can attach up to ${CHAT_MAX_PDFS} PDF${CHAT_MAX_PDFS > 1 ? "s" : ""} at a time.`); return; }
      const pdf = await readPdfFile(file);
      if (!pdf) { setAttachmentError(`That PDF is over ${CHAT_PDF_MAX_MB} MB — send the holdings page as a screenshot, or a smaller PDF.`); return; }
      setPdfData((prev) => (prev.length < CHAT_MAX_PDFS ? [...prev, pdf] : prev));
      return;
    }
    if (isCsvFile(file)) {
      if (csvData.length >= MAX_CSVS) { setAttachmentError(`You can attach up to ${MAX_CSVS} CSV files at a time.`); return; }
      const csv = await readCsvFile(file);
      if (!csv) { setAttachmentError("That CSV is too large — export just your holdings, or send a screenshot."); return; }
      setCsvData((prev) => (prev.length < MAX_CSVS ? [...prev, csv] : prev));
      return;
    }
    if (ALLOWED_IMAGE_TYPES.has(file.type) || /\.(jpe?g|png|gif|webp)$/i.test(file.name)) {
      if (imageData.length >= MAX_IMAGES) { setAttachmentError(`You can attach up to ${MAX_IMAGES} images at a time.`); return; }
      const compressed = await compressImageFile(file);
      if (!compressed) { setAttachmentError("Couldn't read that image — it may be too large or corrupted."); return; }
      setImageData((prev) => (prev.length < MAX_IMAGES ? [...prev, { base64: compressed.base64, mediaType: compressed.mediaType }] : prev));
      setImagePreviews((prev) => (prev.length < MAX_IMAGES ? [...prev, compressed.previewUrl] : prev));
      return;
    }
    setAttachmentError("Unsupported file. Attach an image, a PDF statement, or a CSV export.");
  }, [imageData.length, pdfData.length, csvData.length]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (ALLOWED_IMAGE_TYPES.has(item.type)) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) void handleFile(file);
        break;
      }
    }
  }, [handleFile]);

  // Map a chat API response into assistant messages, attaching any inline
  // scenario card to the final part and capturing a pending free-typed intent.
  const applyAssistantResponse = useCallback((data: ChatResponse) => {
    const parts = (data.message || "Done.").split("\n---\n").map((p) => p.trim()).filter(Boolean);
    const newMsgs: ChatMessage[] = parts.map((p, i) => ({
      localId: nextLocalId(),
      from: "assistant" as const,
      text: p,
      suggestedReplies: i === parts.length - 1 && data.suggested_replies ? data.suggested_replies : null,
      scenarioResult: i === parts.length - 1 && data.scenarioResult ? data.scenarioResult : null,
    }));
    setMessages((prev) => [...prev, ...newMsgs]);
    if (typeof data.remaining === "number") setRemaining(data.remaining);
    pendingScenarioRef.current = data.scenarioPending ?? null;
  }, []);

  // Shared timeout-reconcile for a thrown /api/chat fetch (client timeout, dropped
  // connection, tab hidden mid-request). That is NOT a definitive failure — the
  // server may still be finishing and persists the turn regardless — so the
  // optimistic user message is never yanked; poll the saved thread until OUR
  // pending turn shows an answer, then adopt it. A note never replaces the tail:
  // ending on an assistant turn would stop the remount poll from re-detecting the
  // pending turn, permanently hiding a reply that lands later.
  const reconcilePendingTurn = useCallback((sentText: string | null) => {
    const startedAt = Date.now();
    // Duplicate-send discriminator (see threadHasReply): the snapshot must hold
    // at least as many user turns with this text as the live thread does —
    // messagesRef includes the optimistic pending bubble by the time a 60s
    // timeout lands here, so a stale snapshot matching only the PREVIOUS
    // identical turn can't be adopted.
    const expectedMatches = countMatchingUserTurns(messagesRef.current, sentText);
    const finish = () => { setLoading(false); sendInFlightRef.current = false; };
    const adopt = (mapped: ChatMessage[]) => {
      if (skipHistory) {
        // Onboarding runs a clean, history-free thread — adopting the whole DB
        // transcript would pull the user's old conversation into it. Append only
        // the reply to the pending turn.
        const lastUserIdx = mapped.map((m) => m.from).lastIndexOf("user");
        setMessages((prev) => [...prev, ...mapped.slice(lastUserIdx + 1)]);
      } else {
        setMessages(mapped);
      }
    };
    const reconcile = async () => {
      if (!mountedRef.current) { finish(); return; } // left the tab — remount poll takes over
      try {
        const r = await apiFetch(`/api/messages?limit=${CHAT_LOAD_LIMIT}`);
        const d = await r.json();
        if (Array.isArray(d?.messages) && d.messages.length > 0) {
          const mapped = mapDbMessages(d.messages);
          if (threadHasReply(mapped, sentText, expectedMatches)) {
            adopt(mapped);
            setThinking(false);
            setProcessingKind(null);
            finish();
            return;
          }
        }
      } catch {}
      if (!mountedRef.current) { finish(); return; }
      const elapsed = Date.now() - startedAt;
      if (elapsed < CHAT_REPLY_WAIT_MS) {
        setTimeout(reconcile, replyPollDelay(elapsed));
      } else {
        // Held the whole window without the reply committing. Stop the spinner but
        // leave the user's message as the thread tail so any later visit resumes
        // the poll and shows the reply whenever it finally commits.
        setThinking(false);
        setProcessingKind(null);
        finish();
      }
    };
    reconcile();
  }, [skipHistory]);

  const send = useCallback(async () => {
    const text = input.trim();
    const hasAttachment = imageData.length > 0 || pdfData.length > 0 || csvData.length > 0;
    if ((!text && !hasAttachment) || loading || !userId || remaining === 0) return;

    // Total-payload guard — MUST be client-side. The whole request body has to fit
    // under the serverless body limit (~4.5 MB); a combination the per-file caps
    // allow (e.g. two 3 MB PDFs ≈ 8.4 MB base64) would be dropped by the platform
    // with an opaque 413 BEFORE the server's matching guard could run. Catch it here
    // so the user gets a clear message and keeps their attachments to trim.
    const csvBytes = csvData.reduce((n, c) => n + c.name.length + c.text.length + 8, 0);
    const totalBytes =
      imageData.reduce((n, i) => n + i.base64.length, 0) +
      pdfData.reduce((n, p) => n + p.base64.length, 0) +
      csvBytes;
    if (totalBytes > CHAT_REQUEST_MAX_BASE64) {
      setAttachmentError("That's a lot to upload at once — send fewer or smaller files (a couple of screenshots, or one PDF).");
      return;
    }

    // Synchronous double-send guard (see sendInFlightRef).
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    trackDemoMessageSent();

    const attachmentCount = imageData.length + pdfData.length + csvData.length;
    const displayText = text || (
      imageData.length > 0 && pdfData.length === 0 && csvData.length === 0
        ? (imageData.length > 1 ? "Screenshots uploaded" : "Screenshot uploaded")
        : attachmentCount > 1 ? "Files uploaded" : "File uploaded"
    );
    const userMsg: ChatMessage = { localId: nextLocalId(), from: "user", text: displayText };
    if (imagePreviews.length > 0) userMsg.imagePreviews = imagePreviews;

    setInput("");
    setLoading(true);
    setThinking(true);
    // Capture WHAT this turn is processing BEFORE clearImage() wipes the arrays,
    // so the indicator can name it ("Reading your screenshot…") instead of bare
    // dots. Attachments are the primary trigger; a holdings-list text turn is the
    // onboarding fallback.
    setProcessingKind(
      imageData.length > 0 ? "image"
      : pdfData.length > 0 ? "pdf"
      : csvData.length > 0 ? "csv"
      : HOLDINGS_HINT.test(text) ? "holdings"
      : null,
    );
    setMessages((prev) => [...prev, userMsg]);

    const payload: {
      message: string;
      images?: Array<{ base64: string; mediaType: string }>;
      pdfs?: Array<{ base64: string }>;
      csvText?: string;
    } = { message: text };
    if (imageData.length > 0) payload.images = imageData;
    if (pdfData.length > 0) payload.pdfs = pdfData.map((p) => ({ base64: p.base64 }));
    if (csvData.length > 0) {
      payload.csvText = csvData.map((c) => `--- ${c.name} ---\n${c.text}`).join("\n\n");
    }
    // Keep what's being sent so a REJECTED send can hand it back — a 429/400/500
    // (or a request that never left the device) must not cost the user their
    // staged screenshots; re-picking each one from the photo library is exactly
    // the "keeps their attachments" promise the client-side guard above makes.
    const sentImages = imageData, sentPreviews = imagePreviews, sentPdfs = pdfData, sentCsvs = csvData;
    const restoreAttachments = () => {
      if (sentImages.length) { setImageData(sentImages); setImagePreviews(sentPreviews); }
      if (sentPdfs.length) setPdfData(sentPdfs);
      if (sentCsvs.length) setCsvData(sentCsvs);
    };
    clearImage();

    // Only fetch + parse + non-ok handling live in the try/catch. A throw from a
    // post-success side-effect (track / cache invalidation / callback) must NOT
    // surface a "Connection issue" bubble after the answer already rendered.
    let data: ChatResponse;
    // Set when the catch path hands off to a reconcile poll: the finally must then
    // leave `loading` / the send-guard HELD (composer disabled) so a still-waiting
    // user can't fire a duplicate send; the poll releases them when it resolves.
    let reconciling = false;
    const sentAt = Date.now();
    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, fromChip: false, ...(extraPayloadRef.current?.() ?? {}) }),
        timeoutMs: 60000,
      });
      data = await res.json();
      setThinking(false);
      setProcessingKind(null);

      if (!res.ok) {
        const errText = res.status === 401
          ? "Session expired. Please refresh the page."
          : data.message || data.error || "Something went wrong. Please try again.";
        if (typeof data?.remaining === "number") setRemaining(data.remaining);
        if (data?.demoExpired || data?.demoLimitReached) setDemoEnded(true);
        // Restore the composer so the user's text isn't lost and can be retried,
        // and drop the orphaned optimistic user bubble.
        setInput(text);
        restoreAttachments();
        setMessages((prev) => prev.filter((m) => m.localId !== userMsg.localId));
        setMessages((prev) => [...prev, { localId: nextLocalId(), from: "assistant", text: errText }]);
        return;
      }
    } catch (err) {
      // A thrown fetch is only "maybe still processing" when the request
      // plausibly REACHED the server — the 60s client timeout, or a connection
      // that died mid-flight. An instant rejection (airplane mode, dead Wi-Fi,
      // DNS failure) never left the device; reconciling those held the composer
      // locked for four minutes with the typed text already gone, and the
      // cached user-tail re-entered the same four-minute wait on every reopen.
      // (An agent turn takes well over 5s server-side before anything persists,
      // so a sub-5s rejection cannot have a committed reply to reconcile.)
      const timedOut = err instanceof Error && err.message === "Request timed out";
      const neverLeft = !timedOut &&
        ((typeof navigator !== "undefined" && navigator.onLine === false) || Date.now() - sentAt < 5000);
      if (neverLeft) {
        setThinking(false);
        setProcessingKind(null);
        setInput(text);
        restoreAttachments();
        setMessages((prev) => prev.filter((m) => m.localId !== userMsg.localId));
        setMessages((prev) => [...prev, { localId: nextLocalId(), from: "assistant", text: "No connection — check your internet and try again." }]);
        return;
      }
      // NEVER yank the message the user typed (deleting it here is exactly what
      // made a question vanish on a tab switch and pushed users to re-ask — and
      // re-add the same holding). Reconcile instead; see reconcilePendingTurn.
      reconciling = true;
      reconcilePendingTurn(text || displayText);
      return;
    } finally {
      // The reconcile path keeps the composer disabled until its poll resolves.
      if (!reconciling) {
        setLoading(false);
        sendInFlightRef.current = false;
      }
    }

    // Success side-effects — outside the catch so a throw here can't render a
    // spurious connection-error bubble after the answer was already shown.
    applyAssistantResponse(data);
    if (data.analyticsEvent) track(data.analyticsEvent, data.analyticsProps);
    if (data.portfolioChanged ?? !!data.assets) {
      if (userId) invalidateAssetsCache(userId);
      invalidateInsightCache();
      invalidateVitalsCache();
      // Bump the shared revision so every mounted surface (Portfolio, Vitals,
      // Diary, Profile) refetches without a manual refresh.
      bumpPortfolioRevision();
      onPortfolioUpdateRef.current?.();
      // A past-dated add rebuilds the net-worth history in the background: show a
      // "building" indicator and keep refreshing until it lands. Other commits
      // still fill in market notes shortly, so give them one delayed refresh.
      if (data.building) watchPortfolioBuild();
      else refreshAfterQuickCommit();
    }
    onNewMessageRef.current?.();
  }, [input, imageData, imagePreviews, pdfData, csvData, loading, userId, remaining, clearImage, applyAssistantResponse, reconcilePendingTurn, trackDemoMessageSent]);

  // Confirm a free-typed scenario ([Show me]): echo the pending intent back so the
  // route computes and renders the card directly, skipping Claude classification.
  const sendScenarioConfirm = useCallback(async (pending: Record<string, unknown>, originalText: string) => {
    if (loading || !userId) return;
    // Synchronous double-send guard (see sendInFlightRef).
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    trackDemoMessageSent();
    setLoading(true);
    setThinking(true);

    // Only fetch + parse + non-ok handling live in the try/catch; success
    // side-effects run after so a throw there can't surface a connection error.
    let data: ChatResponse;
    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioConfirm: pending, message: originalText }),
        timeoutMs: 60000,
      });
      data = await res.json();
      setThinking(false);
      if (!res.ok) {
        if (data?.demoExpired || data?.demoLimitReached) setDemoEnded(true);
        setMessages((prev) => [...prev, { localId: nextLocalId(), from: "assistant", text: data.message || "Something went wrong. Please try again." }]);
        return;
      }
    } catch {
      setThinking(false);
      setMessages((prev) => [...prev, { localId: nextLocalId(), from: "assistant", text: "Connection issue. Please try again." }]);
      return;
    } finally {
      setLoading(false);
      sendInFlightRef.current = false;
    }

    applyAssistantResponse(data);
    onNewMessageRef.current?.();
  }, [loading, userId, applyAssistantResponse, trackDemoMessageSent]);

  // Send a specific text string without going through the input state — used by
  // suggestion chips. Chip taps are flagged (fromChip) so scenario intents compute
  // directly rather than asking to confirm.
  const sendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    // Same gates as send(): chips stay tappable in the rendered thread after the
    // daily limit / demo end, and firing anyway just burns a 429 error bubble.
    if (!trimmed || loading || !userId || remaining === 0 || demoEnded) return;

    // [Show me] / [Change it] on a pending free-typed scenario.
    const pending = pendingScenarioRef.current;
    if (pending && trimmed === "Show me") {
      pendingScenarioRef.current = null;
      const original = messagesRef.current.filter((m) => m.from === "user").slice(-1)[0]?.text ?? "Scenario";
      return sendScenarioConfirm(pending, original);
    }
    if (pending && trimmed === "Change it") {
      pendingScenarioRef.current = null;
      setMessages((prev) => [...prev, { localId: nextLocalId(), from: "assistant", text: "Sure — tell me the scenario you'd like to see." }]);
      return;
    }

    // Synchronous double-send guard (see sendInFlightRef).
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    trackDemoMessageSent();

    const userMsg: ChatMessage = { localId: nextLocalId(), from: "user", text: trimmed };
    setLoading(true);
    setThinking(true);
    setMessages((prev) => [...prev, userMsg]);

    // Only fetch + parse + non-ok handling live in the try/catch; success
    // side-effects run after so a throw there can't surface a connection error.
    let data: ChatResponse;
    // Set when the catch hands off to the reconcile poll — the finally must then
    // leave `loading` / the send-guard held until the poll resolves.
    let reconciling = false;
    const sentAt = Date.now();
    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, fromChip: true, ...(extraPayloadRef.current?.() ?? {}) }),
        timeoutMs: 60000,
      });
      data = await res.json();
      setThinking(false);

      if (!res.ok) {
        const errText = res.status === 401
          ? "Session expired. Please refresh the page."
          : data.message || data.error || "Something went wrong. Please try again.";
        if (typeof data?.remaining === "number") setRemaining(data.remaining);
        if (data?.demoExpired || data?.demoLimitReached) setDemoEnded(true);
        // Restore the composer so the chip text isn't lost, and drop the
        // orphaned optimistic user bubble.
        setInput(trimmed);
        setMessages((prev) => prev.filter((m) => m.localId !== userMsg.localId));
        setMessages((prev) => [...prev, { localId: nextLocalId(), from: "assistant", text: errText }]);
        return;
      }
    } catch (err) {
      // Same rules as send(). An instant rejection (offline, DNS failure) never
      // left the device — restore the chip text and fail fast instead of
      // holding the composer through a four-minute reconcile.
      const timedOut = err instanceof Error && err.message === "Request timed out";
      const neverLeft = !timedOut &&
        ((typeof navigator !== "undefined" && navigator.onLine === false) || Date.now() - sentAt < 5000);
      if (neverLeft) {
        setThinking(false);
        setInput(trimmed);
        setMessages((prev) => prev.filter((m) => m.localId !== userMsg.localId));
        setMessages((prev) => [...prev, { localId: nextLocalId(), from: "assistant", text: "No connection — check your internet and try again." }]);
        return;
      }
      // A thrown fetch past that point is NOT a definitive failure — a
      // "Confirm and save" chip on a big import can run past the client timeout
      // while the server finishes and persists the commit. Deleting the bubble
      // and showing "Connection issue" hid a reply that actually landed and
      // invited a duplicate confirm (a double-commit). Keep the message and
      // reconcile from the saved thread instead.
      reconciling = true;
      reconcilePendingTurn(trimmed);
      return;
    } finally {
      if (!reconciling) {
        setLoading(false);
        sendInFlightRef.current = false;
      }
    }

    // Success side-effects — outside the catch so a throw here can't render a
    // spurious connection-error bubble after the answer was already shown.
    applyAssistantResponse(data);
    if (data.analyticsEvent) track(data.analyticsEvent, data.analyticsProps);
    if (data.portfolioChanged ?? !!data.assets) {
      if (userId) invalidateAssetsCache(userId);
      invalidateInsightCache();
      invalidateVitalsCache();
      // Bump the shared revision so every mounted surface (Portfolio, Vitals,
      // Diary, Profile) refetches without a manual refresh.
      bumpPortfolioRevision();
      onPortfolioUpdateRef.current?.();
      // A past-dated add rebuilds the net-worth history in the background: show a
      // "building" indicator and keep refreshing until it lands. Other commits
      // still fill in market notes shortly, so give them one delayed refresh.
      if (data.building) watchPortfolioBuild();
      else refreshAfterQuickCommit();
    }
    onNewMessageRef.current?.();
  }, [loading, userId, remaining, demoEnded, applyAssistantResponse, sendScenarioConfirm, reconcilePendingTurn, trackDemoMessageSent]);

  // Scenario-narration handoff: posts the summarising user turn + the
  // guardrailed assistant narration into this single thread. No portfolio
  // mutation occurs (the route never enters the mutation flow).
  const sendScenario = useCallback(async (h: ScenarioHandoff) => {
    // Same gates as sendText(): scenario chips stay tappable in the rendered
    // thread after the daily limit / demo end, and firing anyway just burns a
    // request into a guaranteed 429.
    if (loading || !userId || remaining === 0 || demoEnded) return;
    // Synchronous double-send guard (see sendInFlightRef).
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    trackDemoMessageSent();

    setLoading(true);
    setThinking(true);
    setMessages((prev) => [...prev, { localId: nextLocalId(), from: "user", text: h.userMessage }]);

    // Only fetch + parse + non-ok handling live in the try/catch; success
    // side-effects run after so a throw there can't surface a connection error.
    let data: ChatResponse;
    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioHandoff: h }),
        timeoutMs: 60000,
      });
      data = await res.json();
      setThinking(false);

      if (!res.ok) {
        const errText = res.status === 401
          ? "Session expired. Please refresh the page."
          : data.message || "Something went wrong. Please try again.";
        // Mirror the other send paths so a demo session at its cap swaps the
        // composer to the sign-up wall instead of an inert error bubble.
        if (typeof data?.remaining === "number") setRemaining(data.remaining);
        if (data?.demoExpired || data?.demoLimitReached) setDemoEnded(true);
        setMessages((prev) => [...prev, { localId: nextLocalId(), from: "assistant", text: errText }]);
        return;
      }
    } catch {
      setThinking(false);
      setMessages((prev) => [...prev, { localId: nextLocalId(), from: "assistant", text: "Connection issue. Please try again." }]);
      return;
    } finally {
      setLoading(false);
      sendInFlightRef.current = false;
    }

    const parts = (data.message || "Done.").split("\n---\n").map((p: string) => p.trim()).filter(Boolean);
    const newMsgs: ChatMessage[] = parts.map((p: string) => ({ localId: nextLocalId(), from: "assistant" as const, text: p, suggestedReplies: null }));
    setMessages((prev) => [...prev, ...newMsgs]);
    if (typeof data.remaining === "number") setRemaining(data.remaining);
    onNewMessageRef.current?.();
  }, [loading, userId, remaining, demoEnded, trackDemoMessageSent]);

  return {
    messages,
    input,
    setInput,
    loading,
    thinking,
    processingKind,
    remaining,
    imagePreviews,
    imageData,
    pdfData,
    csvData,
    attachmentError,
    demoEnded,
    canSend: !loading && !demoEnded && !!(input.trim() || imageData.length || pdfData.length || csvData.length) && (remaining === null || remaining > 0),
    send,
    sendText,
    sendScenario,
    clearImage,
    removeImage,
    removePdf,
    removeCsv,
    handlePaste,
    handleFile,
    loadMore,
    hasMore,
    isLoadingMore,
    reset,
  };
}
