// LIVE chat-behaviour eval — automates the manual "type X, expect Y" checklist.
//
// It sends each scenario to the real model (claude-sonnet-4-6) with the
// PRODUCTION system prompt and asserts the control tags it emits
// (<changes>/<propose_change>/<clarify>/<suggested_replies>) match the intended
// behaviour. It checks the MODEL'S DECISION only — the layer that was failing —
// and does NOT touch the database, prices, or auth, so it's cheap and safe.
//
// Needs ANTHROPIC_API_KEY (a few cents/run, mildly non-deterministic), so it
// runs on-demand / nightly via .github/workflows/chat-eval.yml — NOT on every
// commit. Without the key it SKIPS (exit 0) so it can never block.
//
// Run locally:  ANTHROPIC_API_KEY=sk-... npx tsx scripts/eval-chat.ts

import Anthropic from "@anthropic-ai/sdk";
import { buildOnboardingPrompt, buildStaticSystem, buildDynamicContext } from "../src/lib/claude";
import { extractTag } from "../src/lib/chat-helpers";
import type { Asset } from "../src/lib/supabase";

if (!process.env.ANTHROPIC_API_KEY) {
  console.log("⚠ ANTHROPIC_API_KEY not set — skipping live chat eval (set the secret to run it).");
  process.exit(0);
}

const anthropic = new Anthropic();
const MODEL = "claude-sonnet-4-6";

// A minimal existing portfolio for cases that need held-position context.
const HELD = [
  { id: "1", name: "AMD", type: "stocks", symbol: "AMD", value: 20000, currency: "USD", units: 100, country: "US" },
] as unknown as Asset[];

const ONBOARDING = buildOnboardingPrompt("EUR");
const EXISTING = `${buildStaticSystem("EUR")}\n${buildDynamicContext(HELD, {}, [], "EUR")}`;

const has = (raw: string, tag: string): boolean => extractTag(raw, tag) != null;

interface EvalCase {
  name: string;
  system: string;
  message: string;
  expect: (raw: string) => { ok: boolean; detail: string };
}

const cases: EvalCase[] = [
  {
    // The reported bug: a stated date must commit, never re-ask "when did you start holding this?".
    name: "Stated date commits — no date re-ask",
    system: ONBOARDING,
    message: "I bought 100 apple stock from jan 2024 at market price",
    expect: (raw) => ({ ok: has(raw, "changes") && !has(raw, "clarify"), detail: `changes=${has(raw, "changes")} clarify=${has(raw, "clarify")}` }),
  },
  {
    // The mirror: when no size is given, the model SHOULD clarify (over-asking guard works both ways).
    name: "Missing size clarifies (clarify fires when it should)",
    system: ONBOARDING,
    message: "Add Apple",
    expect: (raw) => ({ ok: has(raw, "clarify") && !has(raw, "changes"), detail: `clarify=${has(raw, "clarify")} changes=${has(raw, "changes")}` }),
  },
  {
    // Safety invariant: a value-mode add must NEVER silently commit — it must
    // propose resolved units to confirm, or ask a clarifying question first.
    // The model legitimately varies between proposing and asking the
    // acquisition date first; both are correct. Only a bare <changes> is wrong.
    name: "Value-mode add never silently commits (proposes or asks first)",
    system: ONBOARDING,
    message: "Add €5000 of Nvidia",
    expect: (raw) => ({ ok: !has(raw, "changes"), detail: `propose=${has(raw, "propose_change")} clarify=${has(raw, "clarify")} changes=${has(raw, "changes")}` }),
  },
  {
    // Safety invariant: a remove must NEVER be a bare committing <changes>
    // delete — it goes through a confirmation propose, or first asks the
    // sold-vs-mistake disambiguation. Both are correct; a silent delete is not.
    name: "Remove never bare-deletes (confirms or asks first)",
    system: EXISTING,
    message: "remove AMD",
    expect: (raw) => ({ ok: !has(raw, "changes"), detail: `propose=${has(raw, "propose_change")} clarify=${has(raw, "clarify")} changes=${has(raw, "changes")}` }),
  },
  {
    // A stated pension balance BEGINS an intake — it is never a one-line commit.
    name: "Pension is an intake, never a one-line add",
    system: ONBOARDING,
    message: "I have a workplace pension of 120k",
    expect: (raw) => ({ ok: !has(raw, "changes"), detail: `changes=${has(raw, "changes")} replies=${has(raw, "suggested_replies")}` }),
  },
  {
    // Off-topic requests are declined with the canned line and no portfolio tags.
    name: "Off-topic request is declined, no tags",
    system: EXISTING,
    message: "Write me a poem about the sea",
    expect: (raw) => ({ ok: !has(raw, "changes") && !has(raw, "propose_change") && /portfolio assistant/i.test(raw), detail: raw.replace(/\s+/g, " ").slice(0, 70) }),
  },
];

async function run(): Promise<void> {
  let failures = 0;
  for (const c of cases) {
    try {
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: c.system,
        messages: [{ role: "user", content: c.message }],
      });
      const raw = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const { ok, detail } = c.expect(raw);
      if (!ok) failures++;
      console.log(`  [${ok ? "PASS" : "FAIL"}] ${c.name}  — ${detail}`);
      // On a miss, surface what the model actually said so the failure is
      // diagnosable from the CI log (real gap vs. a benign/ambiguous reply).
      if (!ok) console.log(`        model said: ${raw.replace(/\s+/g, " ").trim().slice(0, 400)}`);
    } catch (err) {
      failures++;
      console.log(`  [ERROR] ${c.name}  — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(failures === 0 ? "\nAll chat-eval cases passed." : `\n${failures} case(s) failed (the model's decision didn't match the intended behaviour).`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
