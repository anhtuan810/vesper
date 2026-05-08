import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase, getAuthUser } from "@/lib/supabase";
import { STATIC_SYSTEM, buildDynamicContext, buildOnboardingPrompt } from "@/lib/claude";
import { extractProfileUpdate } from "@/lib/profile-extractor";
import { validateEnv } from "@/lib/env";
import { fetchHistoricalPrice, normalizePrice } from "@/lib/prices";
import { geocodeAddress } from "@/lib/geocode";

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

    if (!response) {
      throw new Error("Failed to get response from Claude");
    }

    const raw = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    // --- Parse response ---
    const changesRaw = extractTag(raw, "changes");
    const contextRaw = extractTag(raw, "context");
    const goalRaw = extractTag(raw, "goal");
    let displayText = stripTags(raw);

    let portfolioChanged = false;

    // --- Handle portfolio changes ---
    if (changesRaw) {
      try {
        const changes = JSON.parse(changesRaw.trim());

        if (Array.isArray(changes) && changes.length > 0) {
          const currentTotal = currentAssets.reduce((sum, a) => {
            const net = a.type === "real_estate" && a.mortgage_balance
              ? a.value - (a.mortgage_balance || 0)
              : a.value;
            return sum + net;
          }, 0);

          // Pre-resolve historical prices for all "add" ops that need auto-fill, in parallel
          const resolvedPrices = await Promise.all(
            changes.map(async (change) => {
              if (change.action === "add" && (change.value || 0) === 0 && change.symbol && change.units) {
                const priceData = await fetchHistoricalPrice(change.symbol, change.buy_date || null);
                if (priceData) {
                  const p = normalizePrice(priceData.price, priceData.currency);
                  return {
                    value: Math.round(p * change.units),
                    buyPrice: Math.round(p * 100) / 100,
                    // Use Yahoo's reported currency so the asset is tagged correctly from the start
                    yahooCurrency: priceData.currency === "GBp" ? "GBP" : priceData.currency,
                  };
                }
              }
              return null;
            })
          );

          const duplicateRejections: string[] = [];

          for (let i = 0; i < changes.length; i++) {
            const change = changes[i];
            const action = change.action;
            const name = change.name;

            if (action === "add") {
              // Reject duplicates — do not auto-merge to preserve buy_price/buy_date intent
              const isDuplicate = change.symbol
                ? currentAssets.some(
                    (a) => a.symbol && a.symbol.toLowerCase() === change.symbol.toLowerCase()
                  )
                : currentAssets.some(
                    (a) => a.name.trim().toLowerCase() === name.trim().toLowerCase()
                  );

              if (isDuplicate) {
                const identifier = change.symbol ? change.symbol.toUpperCase() : `"${name}"`;
                duplicateRejections.push(
                  `${identifier} already exists in your portfolio. If you want to update the existing position, ask me to edit it — or give the new entry a different name to keep both.`
                );
                continue;
              }

              let resolvedValue: number = change.value || 0;
              let resolvedBuyPrice: number | null = change.buy_price || null;
              let resolvedCurrency: string = change.currency || "EUR";
              if (resolvedPrices[i]) {
                if (resolvedValue === 0) resolvedValue = resolvedPrices[i]!.value;
                if (!resolvedBuyPrice) resolvedBuyPrice = resolvedPrices[i]!.buyPrice;
                // Yahoo's currency takes precedence over Claude's guess
                if (resolvedPrices[i]!.yahooCurrency) resolvedCurrency = resolvedPrices[i]!.yahooCurrency!;
              }

              // Geocode address for real_estate assets that include one
              let resolvedLat: number | null = null;
              let resolvedLng: number | null = null;
              if ((change.type || "other") === "real_estate" && change.address) {
                const geo = await geocodeAddress(change.address, change.country || null);
                if (geo) { resolvedLat = geo.latitude; resolvedLng = geo.longitude; }
              }

              const insertData = {
                name: name,
                type: change.type || "other",
                value: resolvedValue,
                currency: resolvedCurrency,
                country: change.country || null,
                symbol: change.symbol || null,
                units: change.units || null,
                buy_price: resolvedBuyPrice,
                buy_date: change.buy_date || null,
                buy_price_source: change.buy_price_source || null,
                mortgage_balance: change.mortgage_balance || null,
                mortgage_rate: change.mortgage_rate || null,
                monthly_payment: change.monthly_payment || null,
                mortgage_type: change.mortgage_type || null,
                mortgage_start_date: change.mortgage_start_date || null,
                mortgage_end_date: change.mortgage_end_date || null,
                address: change.address || null,
                property_type: change.property_type || null,
                size_sqm: change.size_sqm || null,
                latitude: resolvedLat,
                longitude: resolvedLng,
                user_id: userId,
              };

              const { data: inserted, error } = await supabase.from("assets").insert(insertData).select("id").single();
              if (error) {
                console.error("ADD ERROR:", error);
              } else {
                portfolioChanged = true;
                await supabase.from("mutations").insert({
                  user_id: userId,
                  asset_id: inserted?.id || null,
                  asset_name: name,
                  action: "add",
                  asset_type: change.type || "other",
                  symbol: change.symbol || null,
                  after_value: resolvedValue,
                  currency: resolvedCurrency,
                  personal_context: contextRaw?.trim() || null,
                  portfolio_total: currentTotal + resolvedValue,
                  occurred_at: change.buy_date || new Date().toISOString().split("T")[0],
                });
              }

            } else if (action === "edit") {
              const existing = currentAssets.find(
                (a) => a.name.toLowerCase() === name.toLowerCase() ||
                       (a.symbol && a.symbol.toLowerCase() === name.toLowerCase())
              );

              if (existing) {
                const updateData: Record<string, unknown> = {};
                if (change.value !== undefined) updateData.value = change.value;
                if (change.type !== undefined) updateData.type = change.type;
                if (change.currency !== undefined) updateData.currency = change.currency;
                if (change.country !== undefined) updateData.country = change.country;
                if (change.symbol !== undefined) updateData.symbol = change.symbol;
                if (change.units !== undefined) updateData.units = change.units;
                if (change.buy_price !== undefined) updateData.buy_price = change.buy_price;
                if (change.buy_date !== undefined) updateData.buy_date = change.buy_date;
                if (change.mortgage_balance !== undefined) updateData.mortgage_balance = change.mortgage_balance;
                if (change.mortgage_rate !== undefined) updateData.mortgage_rate = change.mortgage_rate;
                if (change.monthly_payment !== undefined) updateData.monthly_payment = change.monthly_payment;
                if (change.mortgage_type !== undefined) updateData.mortgage_type = change.mortgage_type;
                if (change.address !== undefined) updateData.address = change.address;
                if (change.property_type !== undefined) updateData.property_type = change.property_type;
                if (change.size_sqm !== undefined) updateData.size_sqm = change.size_sqm;

                // Geocode address when it's being set or changed on a real_estate asset
                if (change.address && (existing.type === "real_estate" || change.type === "real_estate")) {
                  const geo = await geocodeAddress(change.address, change.country || existing.country || null);
                  if (geo) {
                    updateData.latitude = geo.latitude;
                    updateData.longitude = geo.longitude;
                  }
                }

                const { error } = await supabase
                  .from("assets")
                  .update(updateData)
                  .eq("id", existing.id);

                if (error) {
                  console.error("EDIT ERROR:", error);
                } else {
                  portfolioChanged = true;
                  await supabase.from("mutations").insert({
                    user_id: userId,
                    asset_id: existing.id,
                    asset_name: name,
                    action: "edit",
                    asset_type: existing.type,
                    symbol: existing.symbol || null,
                    before_value: existing.value,
                    after_value: change.value || existing.value,
                    currency: change.currency || existing.currency || "EUR",
                    personal_context: contextRaw?.trim() || null,
                    portfolio_total: currentTotal,
                    occurred_at: new Date().toISOString().split("T")[0],
                  });
                }
              }

            } else if (action === "remove") {
              const existing = currentAssets.find(
                (a) => a.name.toLowerCase() === name.toLowerCase() ||
                       (a.symbol && a.symbol.toLowerCase() === name.toLowerCase())
              );

              if (existing) {
                const { error } = await supabase
                  .from("assets")
                  .delete()
                  .eq("id", existing.id);

                if (error) {
                  console.error("REMOVE ERROR:", error);
                } else {
                  portfolioChanged = true;
                  await supabase.from("mutations").insert({
                    user_id: userId,
                    asset_id: existing.id,
                    asset_name: name,
                    action: "remove",
                    asset_type: existing.type,
                    symbol: existing.symbol || null,
                    before_value: existing.value,
                    currency: existing.currency || "EUR",
                    personal_context: contextRaw?.trim() || null,
                    portfolio_total: currentTotal - existing.value,
                    occurred_at: new Date().toISOString().split("T")[0],
                  });
                }
              }
            }
          }

          if (duplicateRejections.length > 0) {
            const suffix = duplicateRejections.join(" ");
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

    // --- Extract profile insights (fire-and-forget, non-blocking) ---
    if (message && displayText && !isNewUser && !changesRaw) {
      extractProfileUpdate(userId, message, displayText, profile).catch((err) =>
        console.error("Profile extraction background error:", err)
      );
    }

    return NextResponse.json({
      message: displayText || "Done.",
      assets: updatedAssets,
      remaining: DAILY_LIMIT - used - 1,
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { message: "Couldn't reach the assistant. Please try again." },
      { status: 500 }
    );
  }
}
