import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "./supabase";

const anthropic = new Anthropic();

// Extract profile insights from a conversation exchange
export async function extractProfileUpdate(
  userId: string,
  userMessage: string,
  assistantResponse: string,
  currentProfile: Record<string, unknown>,
  currentFingerprint: string | null = null
): Promise<void> {
  try {
    const supabase = createServerSupabase();

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: `You analyze conversations between a user and their portfolio assistant to extract lasting facts about the user.

CURRENT PROFILE:
${JSON.stringify(currentProfile, null, 2)}

RULES:
- Only extract facts worth remembering long-term. Skip transactional details (adding 10 shares is not a profile fact).
- Return ONLY a JSON object with fields to add or update. Return {} if nothing new was learned.
- Never remove existing profile data — only add or refine.
- Be conservative. One conversation rarely reveals more than 1-2 facts.

TONE:
- Plain language. Never use: 'portfolio transition', 'execution phase', 'strategy' / 'strategic', 'concentration' as a noun phrase, 'leverage amplification', 'redeploy capital' / 'deploy capital', 'diversified asset classes', 'leveraged real estate' (say 'mortgaged property'), 'rebalance' / 'rebalancing' (say 'shift toward' / 'move into'), 'fundamentally' / 'thoughtfully' as filler adverbs.
- Observational voice — describe what's happening, not what it 'suggests' or 'indicates'. Never write 'suggesting a significant shift' — just describe the shift.
- Never use third-person clinical framing ('this client', 'the user', 'this investor's approach'). Talk about the person directly or use no subject at all.
- Concrete numbers and named things over abstractions. 'Selling six properties (~€3M)' beats 'liquidating a concentrated real estate position'.

LENGTH:
- Fingerprint: 12–18 words, one sentence.
- Each context field: 10–22 words, one sentence.

PROFILE FIELDS YOU CAN USE (all optional):
- life_and_direction: life situation and where headed — family, career, location, major changes.
  Examples: 'Selling down all Dutch property; moving toward a more balanced portfolio.' / 'Building a long-term equity position alongside the family home in Amsterdam.'
- approach: how they invest — philosophy, style, time horizon, risk posture.
  Example: 'Buy-and-hold, quality compounders, low turnover, long horizon.'
- currently_exploring: what they are actively researching or thinking through right now.
  Examples: 'Selling six properties (~€3M); deciding where the proceeds land.' / 'Considering ASML at current levels; the position would double if executed.'
- worth_raising: recurring themes, blind spots, or tensions worth surfacing.
  Examples: 'Selling property removes the leverage risk, but the proceeds need a thoughtful new home.' / 'Single-position concentration is high; worth knowing as the position grows.'

FINGERPRINT FIELD (always attempt):
- fingerprint: one sentence, 12–18 words, characterising the investor. No hedging ('seems', 'appears'). No emojis. Plain text, no quotes.
  Examples: 'A Dutch investor unwinding years of property concentration to diversify.' / 'Long-horizon equity investor with a strong semiconductor conviction.' / 'Conservative builder — steady contributions, cash buffer, no leverage.' / 'Property-focused investor with a growing public-markets position on the side.'

Return ONLY valid JSON. No markdown, no explanation.`,
      messages: [
        {
          role: "user",
          content: `USER SAID: "${userMessage}"

ASSISTANT REPLIED: "${assistantResponse}"

What lasting facts about this user (if any) can be extracted from this exchange? Return {} if nothing new.`,
        },
      ],
    });

    const raw = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    const cleaned = raw.replace(/```json|```/g, "").trim();
    const extracted = JSON.parse(cleaned);

    if (!extracted) return;

    const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

    // Pull out fingerprint before profile merge
    const rawFingerprint =
      typeof extracted.fingerprint === "string" ? extracted.fingerprint.trim() : "";
    delete extracted.fingerprint;

    const fpWords = wordCount(rawFingerprint);
    const fingerprintChanged =
      rawFingerprint.length > 0 &&
      fpWords >= 12 && fpWords <= 20 &&
      rawFingerprint.toLowerCase() !== (currentFingerprint ?? "").toLowerCase().trim();

    const hasProfileFields =
      Object.keys(extracted).length > 0 &&
      Object.values(extracted).some((v) => v);

    if (!hasProfileFields && !fingerprintChanged) {
      return;
    }

    const updateObj: Record<string, unknown> = {};

    if (hasProfileFields) {
      const mergedProfile = { ...currentProfile };
      const FIELD_MAX = 200;

      for (const [key, value] of Object.entries(extracted)) {
        if (value && typeof value === "string" && value.trim().length > 0) {
          if (wordCount(value) > 25) continue;
          if (mergedProfile[key]) {
            const existing = mergedProfile[key] as string;
            if (!existing.toLowerCase().includes((value as string).toLowerCase())) {
              const appended = `${existing}. ${value}`;
              mergedProfile[key] = appended.length > FIELD_MAX ? appended.slice(0, FIELD_MAX) : appended;
            }
          } else {
            mergedProfile[key] = (value as string).slice(0, FIELD_MAX);
          }
        }
      }

      updateObj.profile = mergedProfile;
    }

    if (fingerprintChanged) {
      updateObj.fingerprint = rawFingerprint;
    }

    const { error } = await supabase
      .from("users")
      .update(updateObj)
      .eq("id", userId);

    if (error) {
      console.error("Profile save error:", error);
    }
  } catch (err) {
    // Profile extraction is non-critical — never let it crash the main flow
    console.error("PROFILE EXTRACTION ERROR:", err);
  }
}
