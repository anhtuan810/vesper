import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse, after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase, getAuthUser } from "@/lib/supabase";
import { buildStaticSystem, buildDynamicContext, buildOnboardingPrompt } from "@/lib/claude";
import { isSupportedCurrency, type DisplayCurrency } from "@/lib/money";
import { toUsd, getUsdRates } from "@/lib/fx";
import { extractProfileUpdate } from "@/lib/profile-extractor";
import { writeSnapshot, backfillSnapshots } from "@/lib/snapshot";
import { validateEnv } from "@/lib/env";
import { applyPortfolioChanges } from "@/lib/apply-changes";
import { validatePortfolioChanges } from "@/lib/validations";
import { geocodeAddress } from "@/lib/geocode";
import { venueChipsFor } from "@/lib/venues";
import { CHAT_DAILY_LIMIT } from "@/lib/constants";

validateEnv();

const anthropic = new Anthropic();
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const TAG_RE = /<(changes|update|context|goal|propose_address|propose_venue|suggested_replies)>[\s\S]*?<\/\1>/g;
function stripTags(text: string) { return text.replace(TAG_RE, "").trim(); }
function extractTag(text: string, tag: string) {
  return text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? null;
}

// Ensures user row always sorts before assistant row when both share the same
// DB-level now() value. The 1ms offset is enough for ORDER BY created_at.
function timestampedPair(userRow: Record<string, unknown>, assistantRow: Record<string, unknown>) {
  const now = Date.now();
  return [
    { ...userRow,      created_at: new Date(now).toISOString() },
    { ...assistantRow, created_at: new Date(now + 1).toISOString() },
  ];
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;

    const { message, imageData } = await req.json();

    if (!message && !imageData) {
      return NextResponse.json({ message: "No message provided" }, { status: 400 });
    }

    if (message && message.length > 500) {
      return NextResponse.json({ message: "Message is too long — keep it under 500 characters." }, { status: 400 });
    }

    // ~7 MB base64 ≈ 5 MB binary — matches the client-side paste limit
    if (imageData?.base64 && imageData.base64.length > 7_000_000) {
      return NextResponse.json({ message: "Screenshot is too large — under 5 MB please." }, { status: 400 });
    }

    if (imageData && !ALLOWED_IMAGE_TYPES.has(imageData.mediaType)) {
      return NextResponse.json({ message: "That image format isn't supported. Try PNG, JPG, GIF, or WebP." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    const today = new Date().toISOString().slice(0, 10);

    const { data: newCount, error: rpcError } = await supabase.rpc("increment_rate_limit", {
      p_user_id: userId,
      p_bucket: "chat",
      p_date: today,
    });

    if (rpcError || newCount == null) {
      return NextResponse.json({ message: "Couldn't reach the assistant. Please try again." }, { status: 500 });
    }

    if ((newCount as number) > CHAT_DAILY_LIMIT) {
      return NextResponse.json({
        message: `You've reached today's message limit (${CHAT_DAILY_LIMIT}). Come back tomorrow!`,
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
      supabase.from("assets").select("*").eq("user_id", userId),
      supabase
        .from("messages")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("users").select("profile, name, display_currency, fingerprint").eq("id", userId).single(),
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
    const displayCurrency: DisplayCurrency = isSupportedCurrency(userData?.display_currency)
      ? (userData!.display_currency as DisplayCurrency)
      : "USD";
    const isNewUser = currentAssets.length === 0;

    // --- Build system prompt ---
    const usdRates = isNewUser ? undefined : await getUsdRates();
    const systemBlocks: Anthropic.Messages.TextBlockParam[] = isNewUser
      ? [{ type: "text", text: buildOnboardingPrompt(displayCurrency), cache_control: { type: "ephemeral" } }]
      : [
          { type: "text", text: buildStaticSystem(displayCurrency), cache_control: { type: "ephemeral" } },
          { type: "text", text: buildDynamicContext(currentAssets, profile, recentMutations || [], displayCurrency, userName, usdRates) },
        ];

    // --- Build conversation history (last 6 messages) ---
    const history = (recentMessages || [])
      .slice(0, 6)
      .reverse()
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
    const proposeAddressRaw = extractTag(raw, "propose_address");
    const proposeVenueRaw = extractTag(raw, "propose_venue");
    const suggestedRepliesRaw = extractTag(raw, "suggested_replies");
    let displayText = stripTags(raw);

    let suggestedReplies: string[] | null = null;
    if (suggestedRepliesRaw) {
      try {
        const parsed = JSON.parse(suggestedRepliesRaw.trim());
        if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
          suggestedReplies = parsed;
        }
      } catch {
        // malformed — skip
      }
    }

    // --- Address proposal flow (real estate adds / address edits) ---
    // When Claude emits <propose_address>, geocode and return chips — no DB write this turn.
    if (proposeAddressRaw) {
      const proposedAddress = proposeAddressRaw.trim();
      const geo = await geocodeAddress(proposedAddress, null);

      if (!geo || !geo.hasHouseNumber) {
        const clarification = `I couldn't find "${proposedAddress}" — could you double-check the spelling or share a postcode?`;
        await supabase.from("messages").insert(timestampedPair(
          { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
          { user_id: userId, role: "assistant", content: clarification },
        ));
        return NextResponse.json({ message: clarification, assets: null, remaining: CHAT_DAILY_LIMIT - used });
      }

      const canonicalLine = `Resolved address: ${geo.canonicalAddress}`;
      const proposalText = displayText ? `${displayText}\n\n${canonicalLine}` : canonicalLine;
      const suggestedReplies = ["Confirm and save", "No, let me correct it"];

      await supabase.from("messages").insert(timestampedPair(
        { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
        { user_id: userId, role: "assistant", content: proposalText, suggested_replies: suggestedReplies },
      ));

      return NextResponse.json({
        message: proposalText,
        suggested_replies: suggestedReplies,
        assets: null,
        remaining: CHAT_DAILY_LIMIT - used,
      });
    }

    // --- Venue proposal flow (ETF adds) ---
    if (proposeVenueRaw) {
      const countryCounts = new Map<string, number>();
      for (const a of currentAssets) {
        if (a.country) countryCounts.set(a.country, (countryCounts.get(a.country) ?? 0) + 1);
      }
      let dominantCountry: string | null = null;
      let maxCount = 0;
      for (const [c, n] of countryCounts) {
        if (n > maxCount) { dominantCountry = c; maxCount = n; }
      }
      const chips = venueChipsFor(dominantCountry ?? "");

      await supabase.from("messages").insert(timestampedPair(
        { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
        { user_id: userId, role: "assistant", content: displayText, suggested_replies: chips },
      ));

      return NextResponse.json({
        message: displayText,
        suggested_replies: chips,
        assets: null,
        remaining: CHAT_DAILY_LIMIT - used,
      });
    }

    let portfolioChanged = false;
    let needsBackfill = false;
    let hasAdds = false;

    // --- Apply portfolio changes ---
    if (changesRaw) {
      try {
        const changes = JSON.parse(changesRaw.trim());
        if (Array.isArray(changes) && changes.length > 0) {
          // Trigger backfill for multi-action turns or any change with a buy_date
          // older than 30 days (historical context that affects the chart shape).
          const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
          if (
            changes.length > 1 ||
            changes.some((c) => c.buy_date && c.buy_date < thirtyDaysAgo)
          ) {
            needsBackfill = true;
          }
          hasAdds = changes.some((c) => c.action === "add");
          const validationError = validatePortfolioChanges(changes, currentAssets);
          if (validationError) {
            await supabase.from("messages").insert(timestampedPair(
              { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
              { user_id: userId, role: "assistant", content: validationError },
            ));
            return NextResponse.json({ message: validationError, assets: null, remaining: CHAT_DAILY_LIMIT - used });
          }

          // Geocoding gate: validate + resolve all real_estate addresses before any DB write.
          // All-or-nothing: a bad address on any change in the turn rejects the whole turn.
          const resolvedCanonicalAddresses: string[] = [];
          for (const change of changes) {
            if (!change.address) continue;

            const existingForEdit = change.action === "edit"
              ? currentAssets.find((a) =>
                  a.name.toLowerCase() === change.name?.toLowerCase() ||
                  (a.symbol && a.symbol.toLowerCase() === change.name?.toLowerCase())
                )
              : null;

            const isRealEstate =
              change.type === "real_estate" ||
              (change.action === "edit" && existingForEdit?.type === "real_estate");

            if (!isRealEstate) continue;

            const countryHint = change.country ?? existingForEdit?.country ?? null;
            const geo = await geocodeAddress(change.address, countryHint);

            if (!geo || !geo.hasHouseNumber) {
              const clarification = "I couldn't find that address. Could you double-check the spelling or share a postcode?";
              await supabase.from("messages").insert(timestampedPair(
                { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
                { user_id: userId, role: "assistant", content: clarification },
              ));
              return NextResponse.json({ message: clarification, assets: null, remaining: CHAT_DAILY_LIMIT - used });
            }

            // Replace user's raw input with Nominatim's canonical address and attach coords.
            change.address = geo.canonicalAddress;
            change.latitude = geo.latitude;
            change.longitude = geo.longitude;
            resolvedCanonicalAddresses.push(geo.canonicalAddress);
          }

          const { changed, duplicateWarnings, fxWarnings } = await applyPortfolioChanges({
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
          if (fxWarnings.length > 0) {
            const suffix = fxWarnings.join(" ");
            displayText = displayText ? `${displayText}\n\n${suffix}` : suffix;
          }
          if (resolvedCanonicalAddresses.length > 0 && portfolioChanged) {
            const suffix = resolvedCanonicalAddresses.map((addr) => `Saved as ${addr}.`).join(" ");
            displayText = displayText ? `${displayText}\n\n${suffix}` : suffix;
          }
        }
      } catch (parseErr) {
        if (!(parseErr instanceof SyntaxError)) throw parseErr;
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

    const postAddAssetCount = portfolioChanged
      ? (updatedAssets?.length ?? currentAssets.length)
      : currentAssets.length;

    // --- Handle goal ---
    if (goalRaw) {
      try {
        const goal = JSON.parse(goalRaw.trim());
        // Convert goal target from display currency to USD for storage.
        let targetUsd: number | null = goal.target_value ?? null;
        if (targetUsd !== null && goal.currency && goal.currency !== "USD") {
          const converted = await toUsd(targetUsd, goal.currency);
          if (converted !== null) targetUsd = Math.round(converted);
        }
        await supabase.from("goals").insert({
          user_id: userId,
          title: goal.title,
          target_value: targetUsd,
          target_date: goal.target_date || null,
        });
      } catch (err) {
        console.error("Goal parse failed:", err);
      }
    }

    // --- Save user + assistant messages together after Claude succeeds ---
    await supabase.from("messages").insert(timestampedPair(
      { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
      { user_id: userId, role: "assistant", content: displayText, suggested_replies: suggestedReplies },
    ));

    // --- Profile extraction ---
    // Onboarding transition: synchronous. User just added their first asset — run now so
    // Profile is populated when they land on it. ~1.5s latency is acceptable here.
    if (isNewUser && portfolioChanged && message && displayText) {
      try {
        await extractProfileUpdate(userId, message, displayText, profile, userData?.fingerprint ?? null, postAddAssetCount);
      } catch (err) {
        // Non-critical — silently fall back to deferred extraction on next session
        console.error("Onboarding extraction failed:", err);
      }
    }

    // Background: text-only turns for existing users
    if (message && displayText && !isNewUser && !changesRaw) {
      after(async () => {
        try {
          await extractProfileUpdate(userId, message, displayText, profile, userData?.fingerprint ?? null, postAddAssetCount);
        } catch (err) {
          Sentry.captureException(err, { tags: { background: "profile-extraction" } });
        }
      });
    }

    // Background: fire after any successful asset add for existing users
    if (!isNewUser && hasAdds && portfolioChanged && message && displayText) {
      after(async () => {
        try {
          await extractProfileUpdate(userId, message, displayText, profile, userData?.fingerprint ?? null, postAddAssetCount);
        } catch (err) {
          Sentry.captureException(err, { tags: { background: "profile-extraction" } });
        }
      });
    }
    if (portfolioChanged) {
      after(async () => {
        try {
          await writeSnapshot(userId);
        } catch (err) {
          Sentry.captureException(err, { tags: { background: "snapshot" } });
        }
      });
      if (needsBackfill) {
        after(async () => {
          try {
            await backfillSnapshots(userId);
          } catch (err) {
            Sentry.captureException(err, { tags: { background: "backfill-snapshots" } });
          }
        });
      }
    }

    return NextResponse.json({
      message: displayText || "Done.",
      assets: updatedAssets,
      remaining: CHAT_DAILY_LIMIT - used,
      suggested_replies: suggestedReplies,
    });
  } catch (err) {
    console.error("[/api/chat] unhandled error:", err);
    Sentry.captureException(err, { tags: { route: "POST /api/chat" } });
    return NextResponse.json(
      { message: "Couldn't reach the assistant. Please try again." },
      { status: 500 }
    );
  }
}
