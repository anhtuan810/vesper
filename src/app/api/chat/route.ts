import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase";
import { STATIC_SYSTEM, buildDynamicContext, buildOnboardingPrompt } from "@/lib/claude";
import { extractProfileUpdate } from "@/lib/profile-extractor";
import { validateEnv } from "@/lib/env";
import { fetchHistoricalPrice, normalizePrice } from "@/lib/prices";

validateEnv();

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { message, userId, imageData } = await req.json();

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

    if (messageCount && messageCount >= 50) {
      return NextResponse.json({
        message: "You've reached today's message limit (50). Come back tomorrow!",
        assets: null,
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
        content: m.content
          .replace(/<changes>[\s\S]*?<\/changes>/g, "")
          .replace(/<update>[\s\S]*?<\/update>/g, "")
          .replace(/<context>[\s\S]*?<\/context>/g, "")
          .replace(/<goal>[\s\S]*?<\/goal>/g, "")
          .trim(),
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

    console.log("CLAUDE RAW:", raw.substring(0, 500));

    // --- Parse response ---
    const changesMatch = raw.match(/<changes>([\s\S]*?)<\/changes>/);
    const contextMatch = raw.match(/<context>([\s\S]*?)<\/context>/);
    const goalMatch = raw.match(/<goal>([\s\S]*?)<\/goal>/);
    const displayText = raw
      .replace(/<changes>[\s\S]*?<\/changes>/g, "")
      .replace(/<update>[\s\S]*?<\/update>/g, "")
      .replace(/<context>[\s\S]*?<\/context>/g, "")
      .replace(/<goal>[\s\S]*?<\/goal>/g, "")
      .trim();

    let portfolioChanged = false;

    // --- Handle portfolio changes ---
    if (changesMatch) {
      console.log("CHANGES FOUND:", changesMatch[1].trim());
      try {
        const changes = JSON.parse(changesMatch[1].trim());
        console.log("PARSED CHANGES:", changes.length, "operations");

        if (Array.isArray(changes) && changes.length > 0) {
          const currentTotal = currentAssets.reduce((sum, a) => {
            const net = a.type === "real_estate" && a.mortgage_balance
              ? a.value - (a.mortgage_balance || 0)
              : a.value;
            return sum + net;
          }, 0);

          for (const change of changes) {
            const action = change.action;
            const name = change.name;

            if (action === "add") {
              // Auto-fill value from historical price when value is 0 but we have symbol + units
              let resolvedValue: number = change.value || 0;
              let resolvedBuyPrice: number | null = change.buy_price || null;
              if (resolvedValue === 0 && change.symbol && change.units) {
                console.log("AUTO-FILL: fetching price for", change.symbol, "on", change.buy_date || "today");
                const priceData = await fetchHistoricalPrice(change.symbol, change.buy_date || null);
                if (priceData) {
                  const p = normalizePrice(priceData.price, priceData.currency);
                  resolvedValue = Math.round(p * change.units);
                  if (!resolvedBuyPrice) resolvedBuyPrice = Math.round(p * 100) / 100;
                  console.log("AUTO-FILL: resolved value =", resolvedValue);
                }
              }

              const insertData = {
                name: name,
                type: change.type || "other",
                value: resolvedValue,
                currency: change.currency || "EUR",
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
                user_id: userId,
              };

              console.log("ADDING:", name);
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
                  after_value: resolvedValue,
                  personal_context: contextMatch?.[1]?.trim() || null,
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

                console.log("EDITING:", name, updateData);
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
                    before_value: existing.value,
                    after_value: change.value || existing.value,
                    personal_context: contextMatch?.[1]?.trim() || null,
                    portfolio_total: currentTotal,
                    occurred_at: new Date().toISOString().split("T")[0],
                  });
                }
              } else {
                console.log("EDIT: asset not found:", name);
              }

            } else if (action === "remove") {
              const existing = currentAssets.find(
                (a) => a.name.toLowerCase() === name.toLowerCase() ||
                       (a.symbol && a.symbol.toLowerCase() === name.toLowerCase())
              );

              if (existing) {
                console.log("REMOVING:", name);
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
                    before_value: existing.value,
                    personal_context: contextMatch?.[1]?.trim() || null,
                    portfolio_total: currentTotal - existing.value,
                    occurred_at: new Date().toISOString().split("T")[0],
                  });
                }
              } else {
                console.log("REMOVE: asset not found:", name);
              }
            }
          }
        }
      } catch (parseErr) {
        console.error("Changes parse failed:", parseErr);
      }
    } else {
      console.log("NO CHANGES IN RESPONSE");
    }

    // --- Fetch updated assets if changed ---
    let updatedAssets = null;
    if (portfolioChanged) {
      const { data: newAssets } = await supabase
        .from("assets")
        .select("*")
        .eq("user_id", userId);
      updatedAssets = newAssets;
      console.log("PORTFOLIO UPDATED:", updatedAssets?.length, "assets");
    }

    // --- Handle goal ---
    if (goalMatch) {
      try {
        const goal = JSON.parse(goalMatch[1].trim());
        await supabase.from("goals").insert({
          user_id: userId,
          title: goal.title,
          target_value: goal.target_value || null,
          target_date: goal.target_date || null,
        });
        console.log("GOAL SAVED:", goal.title);
      } catch {}
    }

    // --- Save assistant response ---
    await supabase.from("messages").insert({
      user_id: userId,
      role: "assistant",
      content: displayText,
    });

    // --- Extract profile insights (fire-and-forget, non-blocking) ---
    if (message && displayText && !isNewUser && !changesMatch) {
      extractProfileUpdate(userId, message, displayText, profile).catch((err) =>
        console.error("Profile extraction background error:", err)
      );
    }

    return NextResponse.json({
      message: displayText || "Done.",
      assets: updatedAssets,
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { message: "Couldn't reach the assistant. Please try again." },
      { status: 500 }
    );
  }
}
