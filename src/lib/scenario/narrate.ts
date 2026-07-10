import Anthropic from "@anthropic-ai/sdk";
import { validateNarration } from "@/lib/narrate/guardrail";
import type { ScenarioHandoff } from "@/lib/scenario/handoff";

const anthropic = new Anthropic();

// Deliberately pinned to Opus while chat runs on Sonnet (CHAT_MODEL): narration
// must reproduce supplied figures verbatim under the guardrail, and this short,
// low-max_tokens call is cheap enough to keep on the strongest model.
const NARRATION_MODEL = "claude-opus-4-8";

// Narrate an already-computed scenario. Claude only rephrases; every figure is
// pre-formatted and supplied as the sole allowed set. After generation the
// guardrail checks the output; if any number isn't in the set, the deterministic
// fallback (built by the caller from the same figures) is served instead.
export async function narrateScenario(
  h: ScenarioHandoff,
): Promise<{ narration: string; usedFallback: boolean }> {
  const system =
    "You are a private banker narrating a portfolio scenario the app has already computed. " +
    "Reproduce the supplied figures EXACTLY, verbatim — never compute, round, reformat, abbreviate, or introduce any number that is not in the provided list. " +
    "Vary only the surrounding prose. Two or three sentences, banker-quiet: factual and calm, no hedging, no exclamation marks, no emoji, no advice. " +
    (h.diaryContext?.length
      ? "Weave in the user's own recorded reason for the position alongside the figure — contextualise it, do not judge it. "
      : "") +
    "Plain text only.";

  const parts = [
    h.description,
    `Figures you may use, verbatim (the ONLY numbers permitted): ${h.figures.join(" · ")}`,
  ];
  if (h.diaryContext?.length) {
    parts.push(
      "Recorded decision notes (the user's own words):\n" +
        h.diaryContext
          .map((d) => `(${d.date}) ${d.note}${d.market ? ` [context: ${d.market}]` : ""}`)
          .join("\n"),
    );
  }

  try {
    const res = await anthropic.messages.create({
      model: NARRATION_MODEL,
      max_tokens: 320,
      system,
      messages: [{ role: "user", content: parts.join("\n\n") }],
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    if (text && validateNarration(text, h.figures)) {
      return { narration: text, usedFallback: false };
    }
  } catch {
    // fall through to the deterministic fallback
  }
  return { narration: h.fallback, usedFallback: true };
}
