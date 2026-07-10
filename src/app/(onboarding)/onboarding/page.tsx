"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { createBrowserSupabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { useUser } from "@/lib/hooks";
import { ChatThread, type ChatThreadHandle } from "@/components/chat/ChatThread";
import { useChatSession } from "@/lib/use-chat-session";
import { VolnarLogo } from "@/components/VolnarLogo";

// The gated onboarding flow, one asset at a time. It opens on a clean "pick an asset"
// menu — every class listed, no chat box. Choosing a class starts a FOCUSED, scoped
// chat for that single asset (free typing or a screenshot, the existing before-change
// intake); there is no way to jump to another class mid-flow. The user either
// finishes it and returns to the menu to add another, or discards the in-progress
// asset (deleting anything it added) and picks a different class. They stay inside
// onboarding until they hit Done (the middleware gate enforces this server-side).

interface AddedAsset {
  id: string;
  name: string;
  type: string;
}

const TYPE_EMOJI: Record<string, string> = {
  real_estate: "🏠", stocks: "📈", etf: "📈", crypto: "🪙", gold: "🥇",
  cash: "💶", pension: "🏦", bonds: "📜", other: "💠",
};

const PICK_TYPES: Array<{ key: string; label: string; kickoff: string }> = [
  { key: "real_estate", label: "Property", kickoff: "I want to add a property." },
  { key: "stocks", label: "Stocks & funds", kickoff: "I want to add stocks or funds." },
  { key: "cash", label: "Cash & savings", kickoff: "I want to add cash or savings." },
  { key: "crypto", label: "Crypto", kickoff: "I want to add crypto." },
  { key: "pension", label: "Pension", kickoff: "I want to add a pension." },
  { key: "gold", label: "Gold", kickoff: "I want to add gold." },
  { key: "bonds", label: "Bonds", kickoff: "I want to add bonds." },
  { key: "other", label: "Something else", kickoff: "I want to add another asset." },
];

const LABEL_OF: Record<string, string> = Object.fromEntries(PICK_TYPES.map((t) => [t.key, t.label]));

export default function OnboardingPage() {
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;

  const [assets, setAssets] = useState<AddedAsset[] | null>(null); // null = loading
  const [busy, setBusy] = useState(false);
  // null = the menu; a type key = focused collection of that one asset.
  const [activeType, setActiveType] = useState<string | null>(null);
  const scopeRef = useRef<string | null>(null);
  // Asset ids present when the current focused asset began — anything added since is
  // "the ongoing asset": it gates the "Add another" affordance and is what Discard
  // removes. State (not a ref) because the render derives from it.
  const [baseline, setBaseline] = useState<Set<string>>(() => new Set());
  const startedRef = useRef(false);

  const reload = useCallback(async () => {
    if (!userId) return;
    const supabase = createBrowserSupabase();
    const { data } = await supabase
      .from("assets")
      .select("id, name, type")
      .eq("user_id", userId)
      .is("removed_at", null)
      .order("created_at", { ascending: true });
    setAssets(((data ?? []) as AddedAsset[]).map((a) => ({ id: a.id, name: a.name, type: a.type })));
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    try { track("onboarding_started"); } catch { /* best effort */ }
  }, []);

  const session = useChatSession({
    userId,
    onPortfolioUpdate: reload,
    skipHistory: true,
    extraPayload: () => ({ onboarding: true, onboardingAsset: scopeRef.current ?? undefined }),
  });
  const { messages, thinking, reset } = session;

  // Start focused collection of one asset: clean thread, snapshot the baseline, scope
  // the chat, and open with a guided kickoff for that class.
  const pickType = useCallback((t: (typeof PICK_TYPES)[number]) => {
    reset();
    setBaseline(new Set((assets ?? []).map((a) => a.id)));
    scopeRef.current = t.key;
    setActiveType(t.key);
    try { track("onboarding_step", { step: "type_chosen", asset_type: t.key }); } catch { /* best effort */ }
    session.sendText(t.kickoff);
  }, [assets, reset, session]);

  // Finished with this asset — keep it and return to the menu.
  const backToMenu = useCallback(() => {
    reset();
    scopeRef.current = null;
    setActiveType(null);
  }, [reset]);

  // Discard the in-progress asset: delete anything added since it began, then return
  // to the menu. (Only confirmed assets are ever written, so this cleanly rewinds.)
  const discard = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const ongoing = (assets ?? []).filter((a) => !baseline.has(a.id));
    try {
      if (ongoing.length > 0) {
        try { track("onboarding_step", { step: "discarded", asset_type: activeType ?? "unknown", count: ongoing.length }); } catch { /* best effort */ }
        await apiFetch("/api/assets/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: ongoing.map((a) => ({ action: "remove", name: a.name, removal_reason: "mistake" })) }),
        });
        await reload();
      }
    } finally {
      reset();
      scopeRef.current = null;
      setActiveType(null);
      setBusy(false);
    }
  }, [assets, activeType, baseline, busy, reload, reset]);

  const done = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const count = assets?.length ?? 0;
    try {
      if (count > 0) {
        try { track("onboarding_completed", { assets: count }); } catch { /* best effort */ }
        await apiFetch("/api/onboarding/complete", { method: "POST" });
      } else {
        try { track("onboarding_skipped"); } catch { /* best effort */ }
        await apiFetch("/api/onboarding/skip", { method: "POST" });
      }
    } catch {
      /* navigate regardless */
    }
    window.location.assign("/");
  }, [assets, busy]);

  // ── Chat scaffolding ────────────────────────────────────────────────────────
  const threadRef = useRef<ChatThreadHandle>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);

  useEffect(() => {
    if (!bottomRef.current) return;
    if (!initialScrollDone.current && messages.length > 0) {
      bottomRef.current.scrollIntoView({ behavior: "instant" });
      initialScrollDone.current = true;
    } else if (initialScrollDone.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, thinking]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.dataset.kb = "";
    };
  }, []);

  if (userLoading || assets === null) {
    return (
      <div className="onb-loading">
        <VolnarLogo size={44} className="logo-pulse" />
      </div>
    );
  }

  const hasAssets = assets.length > 0;
  const collecting = activeType !== null;
  // Assets saved since this focused collection began. Zero = still mid-asset (the
  // only exits are finishing it or Discard); non-zero = finished, so the "Add
  // another" affordance appears.
  const ongoing = collecting ? assets.filter((a) => !baseline.has(a.id)) : [];

  return (
    <div className="onb-shell">
      <div className="onb-topbar">
        <div className="onb-brandline">
          <VolnarLogo size={26} />
          <span className="onb-eyebrow">Set up your portfolio</span>
        </div>
        <button className="onb-done-btn" onClick={done} disabled={busy}>
          {hasAssets ? "Done" : "Skip for now"}
        </button>
      </div>

      {!collecting ? (
        // ── Menu: pick an asset. Every class listed, no chat box. ───────────────
        <div className="onb-pick">
          {hasAssets && (
            <div className="onb-added">
              <span className="onb-added-label">Added</span>
              <div className="onb-added-chips">
                {assets.map((a) => (
                  <span key={a.id} className="onb-chip">
                    <span aria-hidden>{TYPE_EMOJI[a.type] ?? "•"}</span> {a.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          <h2 className="onb-pick-title">{hasAssets ? "Add another asset" : "What would you like to add?"}</h2>
          <div className="onb-grid">
            {PICK_TYPES.map((t) => (
              <button key={t.key} className="onb-tile" onClick={() => pickType(t)} disabled={busy}>
                <span className="onb-tile-emoji" aria-hidden>{TYPE_EMOJI[t.key] ?? "•"}</span>
                <span className="onb-tile-label">{t.label}</span>
              </button>
            ))}
          </div>
          {hasAssets && <p className="onb-pick-hint">Or tap <strong>Done</strong> when you&apos;re finished.</p>}
        </div>
      ) : (
        // ── Focused collection of one asset. No class switching, and no way back
        //    mid-asset: the user finishes it (then "Add another" appears) or
        //    discards it. ─────────────────────────────────────────────────────────
        <>
          <div className="onb-collect-bar">
            <span className="onb-collect-label">
              Adding <span aria-hidden>{TYPE_EMOJI[activeType] ?? "•"}</span> {LABEL_OF[activeType] ?? "asset"}
            </span>
            <button className="onb-discard" onClick={discard} disabled={busy}>
              {ongoing.length > 0 ? "Discard" : "Cancel"}
            </button>
          </div>
          {ongoing.length > 0 && (
            <div className="onb-saved-bar">
              <span className="onb-saved-text">
                ✓ {ongoing.length === 1 ? `${ongoing[0].name} added` : `${ongoing.length} positions added`}
              </span>
              <button className="onb-back" onClick={backToMenu} disabled={busy}>Add another ›</button>
            </div>
          )}
          <ChatThread
            variant="page"
            session={session}
            seedMessage={null}
            chatSuggestions={[]}
            hasPortfolio={false}
            bottomInset={0}
            bottomAlign
            scrollContainerRef={scrollContainerRef}
            sentinelRef={sentinelRef}
            bottomRef={bottomRef}
            onScroll={() => {}}
            ref={threadRef}
          />
        </>
      )}

      <style>{`
        .chat-dot { display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--accent);margin:0 2px; }
        @media (prefers-reduced-motion: no-preference) {
          @keyframes up { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
          @keyframes blink { 0%,100%{opacity:0.2}50%{opacity:1} }
          .chat-msg { animation: up 0.25s ease forwards; }
          .chat-dot { animation: blink 1.2s ease infinite; }
          .chat-dot:nth-child(2){animation-delay:.2s}.chat-dot:nth-child(3){animation-delay:.4s}
        }
        .chat-composer-gradient {
          background: linear-gradient(180deg, color-mix(in srgb, var(--bg) 0%, transparent) 0%, var(--bg) 30%, var(--bg) 100%);
        }
        .onb-loading { min-height: 60dvh; display: flex; align-items: center; justify-content: center; }
        .onb-shell {
          position: fixed; top: 0; left: 0; right: 0;
          height: calc(100dvh - var(--kb-inset, 0px));
          max-width: 720px; margin: 0 auto;
          padding-left: var(--space-5); padding-right: var(--space-5);
          display: flex; flex-direction: column; overflow: hidden;
          background: var(--bg);
        }
        .onb-topbar {
          flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
          gap: var(--space-3);
          padding-top: calc(var(--space-3) + env(safe-area-inset-top));
          padding-bottom: var(--space-2);
        }
        .onb-brandline { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
        .onb-eyebrow {
          font-family: var(--font-ui); font-size: var(--fs-caption); color: var(--text-faint);
          letter-spacing: var(--tracking-label); text-transform: uppercase;
        }
        .onb-done-btn {
          flex-shrink: 0; background: none; border: 0.5px solid var(--border-strong);
          border-radius: var(--radius-pill); cursor: pointer;
          font-family: var(--font-ui); font-size: var(--fs-meta); font-weight: 500;
          color: var(--text); padding: 8px 16px; min-height: 36px;
        }
        .onb-done-btn:disabled { opacity: 0.5; cursor: default; }

        /* Menu */
        .onb-pick { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; padding-top: var(--space-2); }
        .onb-added {
          flex-shrink: 0; display: flex; align-items: baseline; gap: var(--space-2);
          padding-bottom: var(--space-4); overflow-x: auto;
        }
        .onb-added-label {
          font-family: var(--font-ui); font-size: var(--fs-micro); text-transform: uppercase;
          letter-spacing: var(--tracking-label); color: var(--text-faint); flex-shrink: 0;
        }
        .onb-added-chips { display: flex; gap: var(--space-2); flex-wrap: wrap; }
        .onb-chip {
          display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
          background: var(--surface); border: 0.5px solid var(--border);
          border-radius: var(--radius-pill); padding: 4px 10px;
          font-family: var(--font-ui); font-size: var(--fs-caption); color: var(--text);
        }
        .onb-pick-title {
          font-family: var(--font-display); font-style: italic; font-weight: 400;
          font-size: var(--fs-title); color: var(--hero); line-height: var(--lh-snug);
          letter-spacing: var(--tracking-title); margin: 0 0 var(--space-4);
        }
        .onb-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-3); }
        .onb-tile {
          display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
          background: var(--surface); border: 0.5px solid var(--border-strong);
          border-radius: var(--radius-lg); padding: var(--space-4);
          cursor: pointer; min-height: 88px; text-align: left;
          transition: border-color 0.15s, background 0.12s, transform 0.1s;
        }
        .onb-tile:hover { border-color: var(--accent); }
        .onb-tile:active { transform: scale(0.98); }
        .onb-tile:disabled { opacity: 0.5; cursor: default; }
        .onb-tile-emoji { font-size: 24px; }
        .onb-tile-label { font-family: var(--font-ui); font-size: var(--fs-body); color: var(--text); font-weight: 500; }
        .onb-pick-hint { font-family: var(--font-ui); font-size: var(--fs-meta); color: var(--text-dim); margin: var(--space-4) 0 0; }

        /* Focused collect bar */
        .onb-collect-bar {
          flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
          gap: var(--space-2); padding: var(--space-1) 0 var(--space-2);
        }
        .onb-back, .onb-discard {
          background: none; border: none; cursor: pointer; padding: 6px 2px;
          font-family: var(--font-ui); font-size: var(--fs-meta);
        }
        .onb-back { color: var(--accent-text, var(--accent)); font-weight: 600; flex-shrink: 0; }
        .onb-discard { color: var(--negative, var(--text-faint)); flex-shrink: 0; }
        .onb-back:disabled, .onb-discard:disabled { opacity: 0.5; cursor: default; }
        .onb-collect-label {
          font-family: var(--font-ui); font-size: var(--fs-caption); color: var(--text-dim);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
        }
        /* "Saved — add another" bar: appears only once this asset is finished */
        .onb-saved-bar {
          flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
          gap: var(--space-2); padding: 8px 12px; margin-bottom: var(--space-2);
          background: var(--accent-soft); border: 0.5px solid var(--accent);
          border-radius: var(--radius-lg);
        }
        .onb-saved-text {
          font-family: var(--font-ui); font-size: var(--fs-caption); color: var(--accent-text);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
        }
      `}</style>
    </div>
  );
}
