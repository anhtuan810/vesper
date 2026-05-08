import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase, getAuthUser } from "@/lib/supabase";
import { STATIC_SYSTEM, buildDynamicContext, buildOnboardingPrompt } from "@/lib/claude";
import { extractProfileUpdate } from "@/lib/profile-extractor";
import { writeSnapshot } from "@/lib/snapshot";
import { validateEnv } from "@/lib/env";
import { applyPortfolioChanges } from "@/lib/apply-changes";

validateEnv();

const anthropic = new Anthropic();

const TAG_RE = /<(changes|update|context|goal)>[\s\S]*?<\/\1>/g;
function stripTags(text: string) { return text.replace(TAG_RE, "").trim(); }
function extractTag(text: string, tag: string) {
  return text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;

    const { message, imageData } = await req.json();

    if (!message && !imageData) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    if (message && message.length > 500) {
      return NextResponse.json({ error: "Message too long (500 char max)" }, { status: 400 });
    }

    const supabase = createServerSupabase();

    // --- Rate limiting: 50 messages per day ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: messageCount } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", today.toISOString());

    const DAILY_LIMIT = 50;
    const used = messageCount ?? 0;

    if (used >= DAILY_LIMIT) {
      return NextResponse.json({
        message: "You've reached today's message limit (50). Come back tomorrow!",
        assets: null,
        remaining: 0,
      });
    }

    // --- Load user context ---
    const [
      { data: assets },
      { data: recentMessages },
      { data: userData },
      { data: recentMutations },
    ] = await Promise.all([
      supabase.from("assets").select("*").eq("user_id", userId),
      supabase
        .from("messages")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("users").select("profile, name").eq("id", userId).single(),
      supabase
        .from("mutations")
        .select("*")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: false })
        .limit(10),
    ]);

    const currentAssets = assets || [];
    const profile = userData?.profile || {};
    const userName = userData?.name || undefined;
    const isNewUser = currentAssets.length === 0;

    // --- Build system prompt ---
    const systemBlocks: Anthropic.Messages.TextBlockParam[] = isNewUser
      ? [{ type: "text", text: buildOnboardingPrompt(), cache_control: { type: "ephemeral" } }]
      : [
          { type: "text", text: STATIC_SYSTEM, cache_control: { type: "ephemeral" } },
          { type: "text", text: buildDynamicContext(currentAssets, profile, recentMutations || [], userName) },
        ];

    // --- Build conversation history (last 6 messages) ---
    const history = (recentMessages || [])
      .reverse()
      .slice(-6)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: stripTags(m.content),
      }))
      .filter((m) => m.content.length > 0);

    // --- Build current message (with optional image) ---
    const userContent: Anthropic.Messages.ContentBlockParam[] = [];

    if (imageData) {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: imageData.mediaType || "image/png",
          data: imageData.base64,
        },
      });
    }

    userContent.push({
      type: "text",
      text: message || "Extract all positions from this screenshot and add them to my portfolio.",
    });

    // --- Save user message ---
    await supabase.from("messages").insert({
      user_id: userId,
      role: "user",
      content: message || "[screenshot uploaded]",
    });

    // --- Call Claude (with retry) ---
    let response: Anthropic.Messages.Message | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          system: systemBlocks,
          messages: [
            ...history,
            { role: "user", content: userContent },
          ],
        });
        break;
      } catch (err) {
        console.error("Claude attempt", attempt, "failed:", err);
        if (attempt === 2) throw err;
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    if (!response) throw new Error("Failed to get response from Claude");

    const raw = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    // --- Parse response ---
    const changesRaw = extractTag(raw, "changes");
    const contextRaw = extractTag(raw, "context");
    const goalRaw = extractTag(raw, "goal");
    let displayText = stripTags(raw);

    let portfolioChanged = false;

    // --- Apply portfolio changes ---
    if (changesRaw) {
      try {
        const changes = JSON.parse(changesRaw.trim());
        if (Array.isArray(changes) && changes.length > 0) {
          const { changed, duplicateWarnings } = await applyPortfolioChanges({
            supabase,
            userId,
            changes,
            currentAssets,
            contextNote: contextRaw?.trim() || null,
          });
          portfolioChanged = changed;
          if (duplicateWarnings.length > 0) {
            const suffix = duplicateWarnings.join(" ");
            displayText = displayText ? `${displayText}\n\n${suffix}` : suffix;
          }
        }
      } catch (parseErr) {
        console.error("Changes parse failed:", parseErr);
      }
    }

    // --- Fetch updated assets if changed ---
    let updatedAssets = null;
    if (portfolioChanged) {
      const { data: newAssets } = await supabase
        .from("assets")
        .select("*")
        .eq("user_id", userId);
      updatedAssets = newAssets;
    }

    // --- Handle goal ---
    if (goalRaw) {
      try {
        const goal = JSON.parse(goalRaw.trim());
        await supabase.from("goals").insert({
          user_id: userId,
          title: goal.title,
          target_value: goal.target_value || null,
          target_date: goal.target_date || null,
        });
      } catch (err) {
        console.error("Goal parse failed:", err);
      }
    }

    // --- Save assistant response ---
    await supabase.from("messages").insert({
      user_id: userId,
      role: "assistant",
      content: displayText,
    });

    // --- Background: profile extraction & snapshot (both catch internally) ---
    if (message && displayText && !isNewUser && !changesRaw) {
      extractProfileUpdate(userId, message, displayText, profile);
    }
    if (portfolioChanged) {
      writeSnapshot(userId);
    }

    return NextResponse.json({
      message: displayText || "Done.",
      assets: updatedAssets,
      remaining: DAILY_LIMIT - used - 1,
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "POST /api/chat" } });
    return NextResponse.json(
      { message: "Couldn't reach the assistant. Please try again." },
      { status: 500 }
    );
  }
}
