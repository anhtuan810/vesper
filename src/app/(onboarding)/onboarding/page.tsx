"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { createBrowserSupabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { useUser } from "@/lib/hooks";
import { ChatThread, type ChatThreadHandle } from "@/components/chat/ChatThread";
import { useChatSession } from "@/lib/use-chat-session";
import { VolnarLogo } from "@/components/VolnarLogo";

// The gated onboarding flow: the user CHOOSES an asset type first, then the chat
// guides them through adding it — free-form typing or a screenshot, the existing
// before-change intake (real-estate mortgage detail, holdings from a statement, …).
// The chat is scoped: it does asset setup only and stays on the chosen asset (it
// won't run scenarios or answer off-topic questions), so the user is guided rather
// than dropped into an open assistant. They stay in onboarding until they hit Done
// (the middleware gate enforces this server-side).

interface AddedAsset {
  id: string;
  name: string;
  type: string;
}

const TYPE_EMOJI: Record<string, string> = {
  real_estate: "🏠", stocks: "📈", etf: "📈", crypto: "🪙", gold: "🥇",
  cash: "💶", pension: "🏦", bonds: "📜", other: "💠",
};

// The asset types the user can pick, with the kickoff message each one sends so the
// assistant opens with guidance for that specific asset.
const PICK_TYPES: Array<{ key: string; label: string; kickoff: string }> = [
  { key: "real_estate", label: "Property", kickoff: "I want to add a property." },
  { key: "stocks", label: "Stocks & funds", kickoff: "I want to add stocks or funds." },
  { key: "cash", label: "Cash", kickoff: "I want to add cash or savings." },
  { key: "crypto", label: "Crypto", kickoff: "I want to add crypto." },
  { key: "pension", label: "Pension", kickoff: "I want to add a pension." },
  { key: "gold", label: "Gold", kickoff: "I want to add gold." },
  { key: "bonds", label: "Bonds", kickoff: "I want to add bonds." },
  { key: "other", label: "Other", kickoff: "I want to add another asset." },
];

export default function OnboardingPage() {
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;

  const [assets, setAssets] = useState<AddedAsset[] | null>(null); // null = loading
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<string | null>(null);
  // The scope the chat requests are tagged with — read at send time so a tap takes
  // effect on the very next message.
  const scopeRef = useRef<string | null>(null);
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

  // The real chat, but scoped: every turn carries { onboarding, onboardingAsset } so
  // the assistant stays on asset setup and on the chosen type. onPortfolioUpdate
  // keeps the added-list in sync as assets land.
  const session = useChatSession({
    userId,
    onPortfolioUpdate: reload,
    extraPayload: () => ({ onboarding: true, onboardingAsset: scopeRef.current ?? undefined }),
  });
  const { messages, thinking } = session;

  const pickType = useCallback((t: (typeof PICK_TYPES)[number]) => {
    scopeRef.current = t.key;
    setScope(t.key);
    try { track("onboarding_step", { step: "type_chosen", asset_type: t.key }); } catch { /* best effort */ }
    session.sendText(t.kickoff);
  }, [session]);

  // ── Chat scaffolding (mirrors the /chat route) ──────────────────────────────
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

  const removeLast = useCallback(async () => {
    if (!assets || assets.length === 0 || busy) return;
    const last = assets[assets.length - 1];
    setBusy(true);
    try { track("onboarding_step", { step: "removed", asset_type: last.type }); } catch { /* best effort */ }
    try {
      await apiFetch("/api/assets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: [{ action: "remove", name: last.name, removal_reason: "mistake" }] }),
      });
      await reload();
    } finally {
      setBusy(false);
    }
  }, [assets, busy, reload]);

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

  if (userLoading || assets === null) {
    return (
      <div className="onb-loading">
        <VolnarLogo size={44} className="logo-pulse" />
      </div>
    );
  }

  const hasAssets = assets.length > 0;

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

      {hasAssets && (
        <div className="onb-added">
          <span className="onb-added-label">Added</span>
          <div className="onb-added-chips">
            {assets.map((a, i) => (
              <span key={a.id} className="onb-chip">
                <span aria-hidden>{TYPE_EMOJI[a.type] ?? "•"}</span> {a.name}
                {i === assets.length - 1 && (
                  <button className="onb-chip-x" onClick={removeLast} disabled={busy} aria-label={`Remove ${a.name}`}>✕</button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="onb-picker">
        <span className="onb-picker-label">{hasAssets ? "Add another" : "What would you like to add?"}</span>
        <div className="onb-picker-chips">
          {PICK_TYPES.map((t) => (
            <button
              key={t.key}
              className={`onb-type${scope === t.key ? " onb-type-on" : ""}`}
              onClick={() => pickType(t)}
              disabled={busy}
            >
              <span aria-hidden>{TYPE_EMOJI[t.key] ?? "•"}</span> {t.label}
            </button>
          ))}
        </div>
      </div>

      <ChatThread
        variant="page"
        session={session}
        seedMessage={null}
        chatSuggestions={[]}
        hasPortfolio={false}
        bottomInset={0}
        scrollContainerRef={scrollContainerRef}
        sentinelRef={sentinelRef}
        bottomRef={bottomRef}
        onScroll={() => {}}
        ref={threadRef}
      />

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
        .onb-added {
          flex-shrink: 0; display: flex; align-items: baseline; gap: var(--space-2);
          padding-bottom: var(--space-2); overflow-x: auto;
        }
        .onb-added-label {
          font-family: var(--font-ui); font-size: var(--fs-micro); text-transform: uppercase;
          letter-spacing: var(--tracking-label); color: var(--text-faint); flex-shrink: 0;
        }
        .onb-added-chips { display: flex; gap: var(--space-2); flex-wrap: nowrap; }
        .onb-chip {
          display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
          background: var(--surface); border: 0.5px solid var(--border);
          border-radius: var(--radius-pill); padding: 4px 10px;
          font-family: var(--font-ui); font-size: var(--fs-caption); color: var(--text);
        }
        .onb-chip-x {
          background: var(--text-faint); color: var(--bg); border: none; cursor: pointer;
          width: 16px; height: 16px; border-radius: 50%; font-size: 10px; line-height: 16px;
          text-align: center; padding: 0; flex-shrink: 0;
        }
        .onb-chip-x:disabled { opacity: 0.5; cursor: default; }
        .onb-picker { flex-shrink: 0; padding-bottom: var(--space-2); }
        .onb-picker-label {
          display: block; font-family: var(--font-ui); font-size: var(--fs-caption);
          color: var(--text-dim); margin-bottom: 6px;
        }
        .onb-picker-chips {
          display: flex; gap: var(--space-2); overflow-x: auto; padding-bottom: 2px;
          scrollbar-width: none;
        }
        .onb-picker-chips::-webkit-scrollbar { display: none; }
        .onb-type {
          display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
          background: var(--surface); color: var(--text);
          border: 0.5px solid var(--border-strong); border-radius: var(--radius-pill);
          padding: 8px 13px; min-height: 38px; cursor: pointer; flex-shrink: 0;
          font-family: var(--font-ui); font-size: var(--fs-caption);
          transition: border-color 0.15s, background 0.12s;
        }
        .onb-type:hover { border-color: var(--accent); }
        .onb-type-on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-text); }
        .onb-type:disabled { opacity: 0.5; cursor: default; }
      `}</style>
    </div>
  );
}
