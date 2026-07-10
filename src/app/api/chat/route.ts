import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getAuthUser } from "@/lib/supabase";
import { entitledGate } from "@/lib/require-entitled";
import { getDemoSessionStatus, type DemoSessionStatus } from "@/lib/demo-session";
import { isSupportedCurrency, type DisplayCurrency } from "@/lib/money";
import { validateEnv } from "@/lib/env";
import {
  CHAT_DAILY_LIMIT, DEMO_CHAT_DAILY_LIMIT,
  CHAT_MAX_IMAGES, CHAT_MAX_PDFS, CHAT_PDF_MAX_MB, CHAT_REQUEST_MAX_BASE64, CHAT_CSV_MAX_TEXT_LEN,
} from "@/lib/constants";
import { ALLOWED_IMAGE_TYPES, stripTags, timestampedPair } from "@/lib/chat-helpers";
import { narrateScenario } from "@/lib/scenario/narrate";
import type { ScenarioHandoff } from "@/lib/scenario/handoff";
import { runAgentChat } from "@/lib/chat/agent-loop";

validateEnv();

// The graceful demo cap-hit response. Quiet, editorial tone (the client renders
// `message` and swaps the composer for the same line with a sign-up action).
function demoLimitResponse(): NextResponse {
  return NextResponse.json(
    { demoLimitReached: true, message: "Demo session ended. Start your own portfolio.", assets: null, remaining: 0 },
    { status: 429 },
  );
}

// Scenario → chat narration handoff. Narrates already-computed figures under the
// numeric guardrail (Claude produces no numbers of its own) and writes the turn.
// Self-contained: shares auth + rate limit but never enters the agent loop.
// No portfolio mutation occurs.
async function handleScenarioNarration(userId: string, raw: unknown, demo: DemoSessionStatus): Promise<NextResponse> {
  const h = raw as Partial<ScenarioHandoff>;
  if (
    !h ||
    typeof h.userMessage !== "string" ||
    typeof h.description !== "string" ||
    typeof h.fallback !== "string" ||
    !Array.isArray(h.figures)
  ) {
    return NextResponse.json({ message: "Invalid scenario handoff." }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const dailyLimit = demo.isDemo ? DEMO_CHAT_DAILY_LIMIT : CHAT_DAILY_LIMIT;
  const today = new Date().toISOString().slice(0, 10);
  const { data: newCount, error: rpcError } = await supabase.rpc("increment_rate_limit", {
    p_user_id: userId,
    p_bucket: "chat",
    p_date: today,
  });
  if (rpcError || newCount == null) {
    return NextResponse.json({ message: "Couldn't reach the assistant. Please try again." }, { status: 500 });
  }
  if ((newCount as number) > dailyLimit) {
    if (demo.isDemo) return demoLimitResponse();
    return NextResponse.json(
      { message: `You've reached today's message limit (${dailyLimit}). Come back tomorrow!`, assets: null, remaining: 0 },
      { status: 429 },
    );
  }
  const used = (newCount as number) - 1;

  const { narration } = await narrateScenario(h as ScenarioHandoff);

  await supabase.from("messages").insert(
    timestampedPair(
      { user_id: userId, role: "user", content: h.userMessage },
      { user_id: userId, role: "assistant", content: narration },
    ),
  );

  return NextResponse.json({ message: narration, assets: null, suggested_replies: null, remaining: dailyLimit - used });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;

    // Paid-access gate (server-side enforcement, not just the client paywall):
    // chat is the most cost-bearing surface (Anthropic). Covers every POST path,
    // including the scenario-narration handoff below.
    const gate = await entitledGate(createServerSupabase(), userId);
    if (gate) return gate;

    // Per-visitor demo accounts expire one hour after creation, enforced per user
    // and server-side. Wall an expired demo turn here, before any read, write, or
    // rate-limit increment — nothing is mutated on an expired demo turn. The same
    // lookup identifies a live demo session, which chats on a tighter allowance.
    const demo = await getDemoSessionStatus(createServerSupabase(), userId);
    if (demo.expired) return NextResponse.json({ demoExpired: true }, { status: 403 });

    const { message, images: rawImages, pdfs: rawPdfs, csvText: rawCsvText, scenarioHandoff, onboarding: rawOnboarding, onboardingAsset: rawOnboardingAsset } = await req.json();
    // First-run onboarding scope: keep the assistant on asset setup only, focused on
    // the chosen asset. Sanitised here so a client can't inject arbitrary prompt text.
    const onboarding = rawOnboarding === true;
    const onboardingAsset = typeof rawOnboardingAsset === "string" ? rawOnboardingAsset.slice(0, 32) : null;

    // Scenario-narration handoff — handled before the message flow.
    if (scenarioHandoff) {
      return await handleScenarioNarration(userId, scenarioHandoff, demo);
    }

    // Normalise: accept array (new) or single object (old clients)
    const images: Array<{ base64: string; mediaType: string }> = Array.isArray(rawImages)
      ? rawImages
      : rawImages ? [rawImages] : [];
    const pdfs: Array<{ base64: string }> = Array.isArray(rawPdfs)
      ? rawPdfs.filter((p): p is { base64: string } => !!p && typeof p.base64 === "string")
      : [];
    // CSV arrives already parsed to text (a model can't read a CSV as an image),
    // so it rides the normal text path; only cap its length. Kept OUT of `message`
    // so the 500-char user-text limit below still applies to what the user typed.
    const csvText = typeof rawCsvText === "string" ? rawCsvText.slice(0, CHAT_CSV_MAX_TEXT_LEN) : "";

    if (!message && images.length === 0 && pdfs.length === 0 && !csvText) {
      return NextResponse.json({ message: "No message provided" }, { status: 400 });
    }

    if (message && message.length > 500) {
      return NextResponse.json({ message: "Message is too long — keep it under 500 characters." }, { status: 400 });
    }

    // Cap screenshots per turn — each image is vision input, so an uncapped array
    // is both a memory and an Anthropic-cost amplifier.
    if (images.length > CHAT_MAX_IMAGES) {
      return NextResponse.json(
        { message: `Please attach at most ${CHAT_MAX_IMAGES} screenshots at a time.` },
        { status: 400 },
      );
    }

    for (const img of images) {
      // ~7 MB base64 ≈ 5 MB binary. The client downscales before upload, so a
      // legitimate image is far smaller; this only rejects a bypassed/oversized one.
      if (img.base64.length > 7_000_000) {
        return NextResponse.json({ message: "One of the screenshots is too large — try again." }, { status: 400 });
      }
      if (!ALLOWED_IMAGE_TYPES.has(img.mediaType)) {
        return NextResponse.json({ message: "That image format isn't supported. Try PNG, JPG, GIF, or WebP." }, { status: 400 });
      }
    }

    if (pdfs.length > CHAT_MAX_PDFS) {
      return NextResponse.json({ message: `Please attach at most ${CHAT_MAX_PDFS} PDF${CHAT_MAX_PDFS > 1 ? "s" : ""} at a time.` }, { status: 400 });
    }
    for (const pdf of pdfs) {
      // base64 is ~1.37× the raw bytes; guard a touch above the raw MB cap.
      if (pdf.base64.length > CHAT_PDF_MAX_MB * 1.4 * 1024 * 1024) {
        return NextResponse.json({ message: `That PDF is too large — keep each under ${CHAT_PDF_MAX_MB} MB, or send the holdings page as a screenshot.` }, { status: 400 });
      }
    }

    // Total-payload guard: the whole request (all base64 attachments) must stay
    // under the serverless body ceiling, or the platform rejects it opaquely
    // before this handler ever runs. Enforce it here so the failure is a clear
    // message, not a mystery 413.
    const totalBase64 = images.reduce((n, i) => n + i.base64.length, 0) + pdfs.reduce((n, p) => n + p.base64.length, 0);
    if (totalBase64 > CHAT_REQUEST_MAX_BASE64) {
      return NextResponse.json({ message: "That's a lot to upload at once — send fewer or smaller files (a couple of screenshots, or one PDF)." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    // A demo session chats on a tighter allowance. The rate-limit bucket is
    // daily, but a demo account lives at most one hour, so this is effectively
    // a session-lifetime cap.
    const dailyLimit = demo.isDemo ? DEMO_CHAT_DAILY_LIMIT : CHAT_DAILY_LIMIT;
    const today = new Date().toISOString().slice(0, 10);

    const { data: newCount, error: rpcError } = await supabase.rpc("increment_rate_limit", {
      p_user_id: userId,
      p_bucket: "chat",
      p_date: today,
    });

    if (rpcError || newCount == null) {
      return NextResponse.json({ message: "Couldn't reach the assistant. Please try again." }, { status: 500 });
    }

    if ((newCount as number) > dailyLimit) {
      if (demo.isDemo) return demoLimitResponse();
      return NextResponse.json({
        message: `You've reached today's message limit (${dailyLimit}). Come back tomorrow!`,
        assets: null,
        remaining: 0,
      }, { status: 429 });
    }

    const used = (newCount as number) - 1;

    // --- Load user context ---
    const [
      { data: assets },
      { data: recentMessages },
      { data: userData },
      { data: recentMutations },
    ] = await Promise.all([
      supabase.from("assets").select("*").eq("user_id", userId).is("removed_at", null),
      supabase
        .from("messages")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("users").select("profile, name, display_currency, fingerprint").eq("id", userId).single(),
      // Feeds only the compact recent-activity block below (newest 12 actions).
      supabase
        .from("mutations")
        .select("*")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: false })
        .limit(12),
    ]);

    const currentAssets = assets || [];
    const profile = userData?.profile || {};
    const userName = userData?.name || undefined;
    const displayCurrency: DisplayCurrency = isSupportedCurrency(userData?.display_currency)
      ? (userData!.display_currency as DisplayCurrency)
      : "USD";
    const isNewUser = currentAssets.length === 0;

    // --- Agent tool-calling loop (the chat engine) ---
    // Claude reasons over the thread and calls deterministic tools for every
    // figure and every write.
    // Compact working-memory summary of recently recorded actions. The agent's
    // own tool calls are stripped from the text history it sees next turn, so
    // without this it can't tell what it just did. Newest first, capped small.
    const recentActivity = (recentMutations ?? [])
      .slice(0, 12)
      .map((mm) => {
        const verb = mm.action === "add" ? "Added" : mm.action === "remove" ? "Removed" : "Updated";
        const when = mm.occurred_at ? ` (${String(mm.occurred_at).slice(0, 10)})` : "";
        return mm.asset_name ? `${verb} ${mm.asset_name}${when}` : null;
      })
      .filter(Boolean)
      .join("; ") || undefined;

    const result = await runAgentChat({
      userId,
      message: message ?? "",
      images,
      pdfs,
      csvText,
      // Prior-thread window: the 10 most recent real (non-empty after
      // tag-stripping) messages. Halved from 20 in the 2026-07 cost pass —
      // every prior message is re-sent on every tool round-trip, so the window
      // is the biggest per-turn input lever after the attachments themselves.
      recentMessages: (recentMessages ?? [])
        .map((mm) => ({ role: mm.role as "user" | "assistant", content: stripTags(mm.content) }))
        .filter((mm) => mm.content.length > 0)
        .slice(0, 10)
        .reverse(),
      currentAssets: currentAssets as Array<Record<string, unknown>>,
      recentActivity,
      displayCurrency,
      used,
      dailyLimit,
      profile: profile as Record<string, unknown>,
      userName,
      fingerprint: userData?.fingerprint ?? null,
      isNewUser,
      onboarding,
      onboardingAsset,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/chat] unhandled error:", err);
    Sentry.captureException(err, { tags: { route: "POST /api/chat" } });
    return NextResponse.json(
      { message: "Couldn't reach the assistant. Please try again." },
      { status: 500 }
    );
  }
}
