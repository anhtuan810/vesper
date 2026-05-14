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
- Only extract facts that are worth remembering long-term.
- Skip transactional details (adding 10 shares is not a profile fact).
- Return ONLY a JSON object with fields to add or update. Return {} if nothing new was learned.
- Never remove existing profile data — only add or refine.
- Be conservative. One conversation rarely reveals more than 1-2 facts.
- Write in warm, banker's tone — third person, present tense, plain prose. One short sentence per field max.

EXAMPLE OUTPUT:
{"life_and_direction": "Based in Amsterdam, planning a move to reduce mortgage exposure before starting a family.", "approach": "Buy-and-hold, prefers quality compounders with low turnover.", "fingerprint": "A leveraged Dutch real estate investor with concentrated tech equity exposure seeking to add stability through fixed income diversification."}

PROFILE FIELDS YOU CAN USE (all optional):
- life_and_direction: life situation and where they are headed — family, career, location, major transitions
- approach: how they invest — philosophy, style, time horizon, active vs passive, risk posture
- currently_exploring: what they are actively researching or thinking through right now
- worth_raising: recurring themes, blind spots, or tensions the assistant should proactively surface

FINGERPRINT FIELD (always attempt):
- fingerprint: a single sentence, 12–18 words, characterising the investor. Third person, present tense. No proper names, no hedging ("seems", "appears"), no emojis. Plain text only, no quotes. Captures risk posture, investment philosophy, life context. Example: "A measured, long-horizon investor with concentrated tech conviction balanced by stabilising real estate."

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

    // Pull out fingerprint before profile merge
    const rawFingerprint =
      typeof extracted.fingerprint === "string" ? extracted.fingerprint.trim() : "";
    delete extracted.fingerprint;

    const fingerprintChanged =
      rawFingerprint.length > 0 &&
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
