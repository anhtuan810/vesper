import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "./supabase";

const anthropic = new Anthropic();

// Extract profile insights from a conversation exchange
export async function extractProfileUpdate(
  userId: string,
  userMessage: string,
  assistantResponse: string,
  currentProfile: Record<string, any>
): Promise<void> {
  try {
    const supabase = createServerSupabase();

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: `You analyze conversations between a user and their portfolio assistant to extract lasting facts about the user.

CURRENT PROFILE:
${JSON.stringify(currentProfile, null, 2)}

RULES:
- Only extract facts that are worth remembering long-term.
- Skip transactional details (adding 10 shares is not a profile fact).
- Focus on: financial goals, risk attitude, life situation, concerns, preferences, decision patterns, and investment philosophy.
- Return ONLY a JSON object with fields to add or update. Return {} if nothing new was learned.
- Never remove existing profile data — only add or refine.
- Be conservative. One conversation rarely reveals more than 1-2 facts.
- Use concise language. Each value should be one short sentence max.

EXAMPLE OUTPUT:
{"risk_behaviour": "comfortable with tech stocks, cautious with crypto", "goal": "building toward early retirement", "life_context": "has two properties in Netherlands"}

FIELDS YOU CAN USE (all optional):
- risk_behaviour: how they approach risk
- investment_style: trading vs buy-and-hold, active vs passive
- goal: what they're working toward
- life_context: relevant life situation (family, career, location)
- concerns: what worries them financially
- preferences: communication style, what they care about
- blind_spots: patterns they might not notice
- decision_patterns: how they tend to make financial decisions
- interests: asset types or markets they follow closely

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

    // Parse the extraction
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const extracted = JSON.parse(cleaned);

    // Skip if nothing extracted
    if (!extracted || Object.keys(extracted).length === 0) {
      console.log("PROFILE: nothing new to extract");
      return;
    }

    console.log("PROFILE EXTRACTED:", JSON.stringify(extracted));

    // Merge with existing profile — never overwrite, only add/refine
    const mergedProfile = { ...currentProfile };

    for (const [key, value] of Object.entries(extracted)) {
      if (value && typeof value === "string" && value.trim().length > 0) {
        if (mergedProfile[key]) {
          // If field exists, append if different information
          const existing = mergedProfile[key] as string;
          if (!existing.toLowerCase().includes((value as string).toLowerCase())) {
            mergedProfile[key] = `${existing}. ${value}`;
          }
        } else {
          mergedProfile[key] = value;
        }
      }
    }

    // Save updated profile
    const { error } = await supabase
      .from("users")
      .update({ profile: mergedProfile })
      .eq("id", userId);

    if (error) {
      console.error("PROFILE SAVE ERROR:", error);
    } else {
      console.log("PROFILE UPDATED for user:", userId);
    }
  } catch (err) {
    // Profile extraction is non-critical — never let it crash the main flow
    console.error("PROFILE EXTRACTION ERROR:", err);
  }
}
