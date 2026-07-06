"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { VolnarLogo } from "@/components/VolnarLogo";
import { ChatThread, type ChatThreadHandle } from "@/components/chat/ChatThread";
import { useChatSession, getChatSuggestions } from "@/lib/use-chat-session";
import { useUser, useProfile, useDisplayCurrency, useAssets, useSignOut } from "@/lib/hooks";
import { useSubscription } from "@/components/SubscriptionProvider";
import { takeHandoff } from "@/lib/scenario/handoff";
import { EXPLORE_EVENT, buildExploreSeed } from "@/lib/scenario/explore";
import { WHATIF_EVENT, takeWhatIfSeed } from "@/lib/scenario/whatif";
import type { ChatSeed } from "@/lib/chat-seeds";
import "@/components/overview/home-twilight.css";

export type WebTab = "overview" | "journal" | "vitals" | "profile" | "settings" | "asset";

function initials(user: { user_metadata?: Record<string, unknown>; email?: string } | null | undefined): string {
  const meta = user?.user_metadata ?? {};
  const full = (meta.full_name || meta.name) as string | undefined;
  if (full) {
    const parts = full.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "·";
  }
  return (user?.email?.[0] ?? "·").toUpperCase();
}

function firstName(user: { user_metadata?: Record<string, unknown>; email?: string } | null | undefined): string {
  const meta = user?.user_metadata ?? {};
  const full = (meta.full_name || meta.name) as string | undefined;
  if (full) return full.trim().split(/\s+/)[0];
  if (user?.email) return user.email.split("@")[0];
  return "Investor";
}

const NAV = [
  { label: "Overview", href: "/", tab: "overview" as const },
  { label: "Journal", href: "/diary", tab: "journal" as const },
  { label: "Vitals", href: "/vitals", tab: "vitals" as const },
];

/**
 * Desktop web layout shell — two-column: a top nav, the scrolling page content
 * (children), and the persistent chat rail. Used by every authenticated desktop
 * web page (home, journal, vitals, profile, settings, asset detail). `tab`
 * drives the nav's active state. The chat rail reuses the working session/
 * thread machinery. Colours come from the app's global Nocturne tokens and the
 * shell follows the user's theme (data-theme on <html>), exactly like the
 * phone. Only mounts on desktop web — mobile/native never reach it.
 */
export function WebShell({ tab, children }: { tab: WebTab; children: ReactNode }) {
  const { user } = useUser();
  const profile = useProfile(user?.id);
  const signOut = useSignOut();
  const { data: sub } = useSubscription();
  // The demo account has no real identity, so show a generic person silhouette
  // instead of initials; real users keep their initials.
  const isDemo = !!sub?.isDemo;
  const displayCurrency = useDisplayCurrency();
  const { assets } = useAssets(user?.id);

  // Top-right account menu (Profile / Settings / Sign out).
  const [menuOpen, setMenuOpen] = useState(false);
  // Demo profile photo: self-hosted /demo-avatar.(jpg|png) — drop either into /public.
  // Tries jpg, then png, then falls back to the generic silhouette, so the nav never
  // shows a broken image regardless of which format/name is uploaded.
  const DEMO_AVATAR_SRCS = ["/demo-avatar.jpg", "/demo-avatar.png"];
  const [demoAvatarStage, setDemoAvatarStage] = useState(0);
  const demoAvatarSrc = DEMO_AVATAR_SRCS[demoAvatarStage] ?? null;
  const acctRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (acctRef.current && !acctRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [menuOpen]);
  const hasPortfolio = assets.length > 0;
  const chatSuggestions = getChatSuggestions(displayCurrency, hasPortfolio);

  const session = useChatSession({ userId: user?.id });
  const { messages, thinking, loadMore, hasMore, isLoadingMore } = session;

  // ── Scenario seeds (explore / what-if) → the mounted rail ──────────────────
  const [seedMessage, setSeedMessage] = useState<ChatSeed | null>(null);
  const [seedBase, setSeedBase] = useState(0);
  const assetsRef = useRef(assets);
  const messagesRef = useRef(messages);
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => {
    const handler = () => {
      buildExploreSeed(assetsRef.current, displayCurrency).then((seed) => {
        setSeedBase(messagesRef.current.length);
        setSeedMessage(seed);
      }).catch(() => {});
    };
    window.addEventListener(EXPLORE_EVENT, handler);
    return () => window.removeEventListener(EXPLORE_EVENT, handler);
  }, [displayCurrency]);
  useEffect(() => {
    const handler = () => {
      const seed = takeWhatIfSeed();
      if (seed) { setSeedBase(messagesRef.current.length); setSeedMessage(seed); }
    };
    window.addEventListener(WHATIF_EVENT, handler);
    return () => window.removeEventListener(WHATIF_EVENT, handler);
  }, []);
  const visibleSeed = seedMessage && messages.length <= seedBase ? seedMessage : null;

  const threadRef = useRef<ChatThreadHandle>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);
  // Set right before a loadMore() prepend so the scroll-to-bottom effect can skip
  // that update — otherwise paginating older history yanks the rail back to the
  // newest message, making history unreadable (matches ChatPage/ChatPopup).
  const isLoadMoreUpdate = useRef(false);

  useEffect(() => {
    if (isLoadMoreUpdate.current) {
      isLoadMoreUpdate.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const handoffDone = useRef(false);
  useEffect(() => {
    if (handoffDone.current || !user?.id) return;
    handoffDone.current = true;
    const h = takeHandoff();
    if (h) session.sendScenario(h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !isLoadingMore && hasScrolled.current) { isLoadMoreUpdate.current = true; loadMore(); } },
      { threshold: 0, rootMargin: "200px 0px 0px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  return (
    <div className="vhome">
      <style>{`
        @keyframes up { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
        @keyframes blink { 0%,100%{opacity:0.2}50%{opacity:1} }
        .vhome .chat-msg { animation: up 0.25s ease forwards; }
        .vhome .chat-dot { display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--accent);animation:blink 1.2s ease infinite;margin:0 2px; }
        .vhome .chat-dot:nth-child(2){animation-delay:.2s}.vhome .chat-dot:nth-child(3){animation-delay:.4s}
      `}</style>

      <nav className="vh-nav">
        <div className="vh-nav-in">
          <span className="vh-brand"><VolnarLogo size={26} /><span className="wm">Volnar</span></span>
          <div className="vh-tabs">
            {NAV.map((t) => {
              const on = t.tab != null && t.tab === tab;
              return (
                <Link key={t.label} href={t.href} className={`vh-tab${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
                  {t.label}
                </Link>
              );
            })}
          </div>
          <div className="vh-nav-r">
            <span className="vh-priv">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
              Private · EU
            </span>
            <div className="vh-acct" ref={acctRef}>
              <button
                type="button"
                className="vh-acct-btn"
                aria-label="Account"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
              >
                <span className="vh-av">
                  {isDemo
                    ? (demoAvatarSrc
                        ? <img className="vh-av-img" src={demoAvatarSrc} alt="" onError={() => setDemoAvatarStage((s) => s + 1)} />
                        : <svg className="vh-av-person" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="3.6" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0z" /></svg>)
                    : initials(user)}
                </span>
                <svg className="vh-av-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" /></svg>
              </button>
              {menuOpen && (
                <div className="vh-menu" role="menu">
                  <div className="vh-menu-id">
                    <span className="vh-menu-name">{profile?.name || firstName(user)}</span>
                    {user?.email && <span className="vh-menu-email">{user.email}</span>}
                  </div>
                  <Link href="/profile" role="menuitem" className="vh-menu-item" onClick={() => setMenuOpen(false)}>Profile</Link>
                  <Link href="/settings" role="menuitem" className="vh-menu-item" onClick={() => setMenuOpen(false)}>Settings</Link>
                  <div className="vh-menu-div" aria-hidden="true" />
                  <button type="button" role="menuitem" className="vh-menu-item vh-menu-signout" onClick={() => { setMenuOpen(false); signOut(); }}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <div className="vh-shell">
        <main className="vh-content">{children}</main>

        <aside className="vh-rail" aria-label="Volnar assistant">
          <div className="vh-rail-head">
            <span className="vh-rail-title"><span className="vh-rail-dot" />Volnar</span>
            <span className="vh-rail-sub">Single thread</span>
          </div>
          <ChatThread
            variant="popup"
            session={session}
            seedMessage={visibleSeed}
            chatSuggestions={chatSuggestions}
            hasPortfolio={hasPortfolio}
            composerBg="var(--surface)"
            scrollContainerRef={scrollContainerRef}
            sentinelRef={sentinelRef}
            bottomRef={bottomRef}
            onScroll={(e) => { if (e.currentTarget.scrollTop > 0) hasScrolled.current = true; }}
            ref={threadRef}
          />
        </aside>
      </div>
    </div>
  );
}
