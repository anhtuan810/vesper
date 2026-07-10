import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabase, getAuthUser } from "@/lib/supabase";
import { demoExpiredGate } from "@/lib/demo-session";
import { applyPortfolioChanges, ValueModeError, type PortfolioChange } from "@/lib/apply-changes";
import { writeSnapshot, backfillSnapshots } from "@/lib/snapshot";
import { generateMarketSwings } from "@/lib/diary-market-moves";

// Structured create/edit/remove path used by the reusable asset collector (in the
// onboarding flow and later in-app). Unlike the restore-only POST /api/assets, this
// runs the SAME write path the chat uses — applyPortfolioChanges — so every intake
// gate (real-estate mortgage detail, tradeable ghost-guard), symbol/price
// resolution, geocoding, the paired "add" mutation, and the history rebuild all
// apply. Persist happens here, on confirm; the Build-up (snapshots/backfill/market
// swings) is scheduled in the background so the caller never waits on pricing.
//
// Body: { changes: PortfolioChange[], displayCurrency?: "EUR" | "USD" | "GBP" }.
// One confirmed asset is one change; a several-screenshot brokerage group is one
// call with many changes (matching how the chat import batches).
const ACTIONS = new Set(["add", "edit", "remove"]);

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServerSupabase();

    // Wall an expired demo turn before any write.
    const demoGate = await demoExpiredGate(supabase, user.id);
    if (demoGate) return demoGate;

    const body = await req.json();
    const raw = Array.isArray(body?.changes) ? body.changes : null;
    if (!raw || raw.length === 0) {
      return NextResponse.json({ error: "changes[] is required" }, { status: 400 });
    }
    for (const c of raw) {
      if (!c || typeof c !== "object" || !ACTIONS.has(c.action) || typeof c.name !== "string" || !c.name.trim()) {
        return NextResponse.json(
          { error: "each change needs a valid action (add|edit|remove) and a name" },
          { status: 400 },
        );
      }
    }
    const changes = raw as PortfolioChange[];
    const displayCurrency = typeof body?.displayCurrency === "string" ? body.displayCurrency : undefined;

    // The write path needs the current holdings for dedup, the running net-worth
    // total, and edit/remove matching.
    const { data: currentAssets } = await supabase
      .from("assets")
      .select("*")
      .eq("user_id", user.id)
      .is("removed_at", null);

    const result = await applyPortfolioChanges({
      supabase,
      userId: user.id,
      changes,
      currentAssets: currentAssets ?? [],
      contextNote: null,
      displayCurrency,
    });

    // Build-up runs in the background so completion never waits on price/FX fetches;
    // the dashboard fills in progressively, exactly like the chat add path.
    if (result.changed) {
      after(() => writeSnapshot(user.id));
      if (result.rebuildFrom) {
        const from = result.rebuildFrom;
        after(() => backfillSnapshots(user.id, from));
      }
      after(() => generateMarketSwings(user.id));
    }

    return NextResponse.json({
      changed: result.changed,
      failures: result.failures,
      duplicateWarnings: result.duplicateWarnings,
      mutationCount: result.mutationMetas.length,
    });
  } catch (err) {
    // A ValueModeError carries a deterministic, user-facing intake question (e.g.
    // "Is there a mortgage on it?"). Surface it so the collector can prompt, rather
    // than a generic 500.
    if (err instanceof ValueModeError) {
      return NextResponse.json({ error: err.message, clarification: true }, { status: 422 });
    }
    Sentry.captureException(err, { tags: { route: "POST /api/assets/create" } });
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
