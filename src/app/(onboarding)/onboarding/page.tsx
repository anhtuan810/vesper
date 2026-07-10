"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { createBrowserSupabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { useUser, useDisplayCurrencyState } from "@/lib/hooks";
import { AssetCollector } from "@/components/assets/AssetCollector";
import type { PortfolioChange } from "@/lib/apply-changes";
import { VolnarLogo } from "@/components/VolnarLogo";

// The gated, chat-only onboarding flow. Confirmed assets ARE the progress: on return
// we load the assets added so far and continue from the "add another or done?" step
// with a one-line recap — no chat transcript is restored. An in-progress unconfirmed
// asset saves nothing, so it simply restarts. Completion flips the flag at Done (NOT
// at the end of any price/history build), and Done-with-no-data issues a session pass
// so the user can peek at the empty app.

interface RunningAsset {
  id: string;
  name: string;
  type: string;
}

const TYPE_EMOJI: Record<string, string> = {
  real_estate: "🏠",
  stocks: "📈",
  etf: "📈",
  crypto: "🪙",
  gold: "🪙",
  cash: "💶",
  pension: "🏦",
  bonds: "📜",
  other: "•",
};

function recapLine(assets: RunningAsset[]): string {
  if (assets.length === 0) return "";
  const names = assets.map((a) => a.name);
  let list: string;
  if (names.length === 1) list = names[0];
  else if (names.length === 2) list = `${names[0]} and ${names[1]}`;
  else list = `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  return `Welcome back — you've added ${list}.`;
}

export default function OnboardingPage() {
  const { user, loading: userLoading } = useUser();
  const { currency } = useDisplayCurrencyState();
  const [assets, setAssets] = useState<RunningAsset[] | null>(null); // null = loading
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);
  const userId = user?.id;

  const load = useCallback(async () => {
    if (!userId) return;
    const supabase = createBrowserSupabase();
    const { data } = await supabase
      .from("assets")
      .select("id, name, type")
      .eq("user_id", userId)
      .is("removed_at", null)
      .order("created_at", { ascending: true });
    setAssets(((data ?? []) as RunningAsset[]).map((a) => ({ id: a.id, name: a.name, type: a.type })));
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // Fire the funnel entry once per mount.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    safeTrack("onboarding_started");
  }, []);

  // Fine-grained drop-off events from the collector (asset type chosen, field
  // reached, confirmed/removed) — flat, PII-free props, reusing Vercel Analytics.
  const step = useCallback((event: string, props?: Record<string, string | number>) => {
    safeTrack("onboarding_step", { step: event, ...(props ?? {}) });
  }, []);

  // Persist a confirmed asset through the real write path. Returns ok:false + a
  // user-facing message (e.g. a mortgage-intake question) so the collector can keep
  // its confirm card open for a correction.
  const persist = useCallback(
    async (changes: PortfolioChange[]): Promise<{ ok: boolean; error?: string }> => {
      const res = await apiFetch("/api/assets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes, displayCurrency: currency }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: body?.error ?? "Couldn't save that — please try again." };
      }
      if (body?.changed === false) {
        const reason = Array.isArray(body?.failures) && body.failures[0]?.reason;
        return { ok: false, error: reason || "I couldn't record that — please check the details." };
      }
      await load();
      return { ok: true };
    },
    [currency, load],
  );

  // Remove-last: drop the most recently confirmed asset (a full erase — it was a
  // mistake, not a sale) and reopen for re-entry. Only an asset is written on
  // confirm, so this cleanly rewinds the running list.
  const removeLast = useCallback(async () => {
    if (!assets || assets.length === 0 || busy) return;
    const last = assets[assets.length - 1];
    setBusy(true);
    step("removed", { asset_type: last.type });
    try {
      await apiFetch("/api/assets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: [{ action: "remove", name: last.name, removal_reason: "mistake" }] }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }, [assets, busy, load, step]);

  // Done: flip the flag (with assets) or issue the empty-exit pass (with none), then
  // hard-navigate to the app so the middleware re-evaluates with the fresh cookie.
  const done = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const count = assets?.length ?? 0;
    try {
      if (count > 0) {
        safeTrack("onboarding_completed", { assets: count });
        await apiFetch("/api/onboarding/complete", { method: "POST" });
      } else {
        safeTrack("onboarding_skipped");
        await apiFetch("/api/onboarding/skip", { method: "POST" });
      }
    } catch {
      // Fall through to navigation regardless; a completed flag write that failed
      // would just land the user back here on the next cold open.
    }
    window.location.assign("/");
  }, [assets, busy]);

  if (userLoading || assets === null) {
    return (
      <div className="onb-wrap onb-center">
        <VolnarLogo size={44} className="logo-pulse" />
      </div>
    );
  }

  const hasAssets = assets.length > 0;

  return (
    <div className="onb-wrap">
      <header className="onb-head">
        <VolnarLogo size={40} />
        <h1 className="onb-title">
          {hasAssets ? "Add another, or you're done" : "Let's set up your net worth"}
        </h1>
        <p className="onb-sub">
          {hasAssets
            ? `${recapLine(assets)} Add another asset, or tap Done to open your dashboard.`
            : "Add your assets one at a time — property, investments, cash, crypto. You can stop any time; I'll never trap you here."}
        </p>
      </header>

      {hasAssets && (
        <div className="onb-list">
          <div className="onb-list-head">Added so far</div>
          {assets.map((a, i) => (
            <div key={a.id} className="onb-list-row">
              <span className="onb-list-emoji" aria-hidden>{TYPE_EMOJI[a.type] ?? "•"}</span>
              <span className="onb-list-name">{a.name}</span>
              {i === assets.length - 1 && (
                <button className="onb-remove" onClick={removeLast} disabled={busy} aria-label={`Remove ${a.name}`}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="onb-collector">
        <AssetCollector displayCurrency={currency} onConfirm={persist} onStep={step} />
      </div>

      <div className="onb-done">
        <button className="onb-done-btn" onClick={done} disabled={busy}>
          {hasAssets ? "Done" : "Done — I'll add assets later"}
        </button>
      </div>

      <style>{`
        .onb-wrap {
          max-width: 560px; margin: 0 auto;
          padding: max(env(safe-area-inset-top), var(--space-5)) 0 calc(env(safe-area-inset-bottom) + var(--space-6));
          display: flex; flex-direction: column; gap: var(--space-5);
        }
        .onb-center { min-height: 60dvh; align-items: center; justify-content: center; }
        .onb-head { display: flex; flex-direction: column; gap: var(--space-2); }
        .onb-title {
          font-family: var(--font-display); font-style: italic; font-weight: 400;
          font-size: var(--fs-title); color: var(--hero); line-height: var(--lh-snug);
          letter-spacing: var(--tracking-title); margin: var(--space-2) 0 0;
        }
        .onb-sub {
          font-family: var(--font-ui); font-size: var(--fs-body); color: var(--text-dim);
          line-height: var(--lh-body); margin: 0;
        }
        .onb-list {
          background: var(--surface); border: 0.5px solid var(--border);
          border-radius: var(--radius-lg); padding: var(--space-3) var(--space-4);
          display: flex; flex-direction: column; gap: 2px;
        }
        .onb-list-head {
          font-family: var(--font-ui); font-size: var(--fs-micro); text-transform: uppercase;
          letter-spacing: var(--tracking-label); color: var(--text-faint); margin-bottom: var(--space-2);
        }
        .onb-list-row {
          display: flex; align-items: center; gap: var(--space-2);
          padding: 8px 0; border-top: 0.5px solid var(--border);
        }
        .onb-list-row:first-of-type { border-top: none; }
        .onb-list-emoji { font-size: 18px; }
        .onb-list-name { flex: 1; min-width: 0; font-family: var(--font-ui); font-size: var(--fs-body); color: var(--text); }
        .onb-remove {
          background: none; border: none; cursor: pointer; padding: 4px 6px;
          font-family: var(--font-ui); font-size: var(--fs-caption); color: var(--negative, var(--text-faint));
          text-decoration: underline; text-underline-offset: 3px;
        }
        .onb-remove:disabled { opacity: 0.5; cursor: default; }
        .onb-collector {
          background: var(--bg); border: 0.5px solid var(--border);
          border-radius: var(--radius-xl); padding: var(--space-4);
        }
        .onb-done { display: flex; justify-content: center; padding-top: var(--space-2); }
        .onb-done-btn {
          background: none; border: none; cursor: pointer;
          font-family: var(--font-ui); font-size: var(--fs-body); font-weight: 500;
          color: var(--text-dim); padding: 10px 16px; min-height: 44px;
          text-decoration: underline; text-underline-offset: 4px;
        }
        .onb-done-btn:disabled { opacity: 0.5; cursor: default; }
      `}</style>
    </div>
  );
}

// track() throws are never allowed to break the flow (analytics is best-effort, and
// it's a no-op on the native build where <Analytics/> isn't mounted).
function safeTrack(event: string, props?: Record<string, string | number>) {
  try {
    track(event, props);
  } catch {
    /* best effort */
  }
}
