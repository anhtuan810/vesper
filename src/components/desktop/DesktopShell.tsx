"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import { ChatThread, type ChatThreadHandle } from "@/components/chat/ChatThread";
import { VitalsContent } from "@/components/vitals/VitalsContent";
import { useChatSession, getChatSuggestions } from "@/lib/use-chat-session";
import { useUser, useDisplayCurrency, useAssets } from "@/lib/hooks";
import { takeHandoff } from "@/lib/scenario/handoff";
import { EXPLORE_EVENT, buildExploreSeed } from "@/lib/scenario/explore";
import { WHATIF_EVENT, takeWhatIfSeed } from "@/lib/scenario/whatif";
import type { ChatSeed } from "@/lib/chat-seeds";

const CHAT_WIDTH_KEY = "volnar.chat.width";
const CHAT_MIN = 300;
const CHAT_MAX = 560;
const CHAT_DEFAULT = 380;

const VITALS_WIDTH_KEY = "volnar.vitals.width";
const VITALS_MIN = 300;
const VITALS_MAX = 520;
const VITALS_DEFAULT = 380;

const HANDLE = 9;
// Centered reading width for the main column, matching the mobile layout.
const MAIN_MAX_WIDTH = 720;

const clampChat = (w: number) => Math.min(CHAT_MAX, Math.max(CHAT_MIN, w));
const clampVitals = (w: number) => Math.min(VITALS_MAX, Math.max(VITALS_MIN, w));

// Shared header bar for the side panels (matches the in-bar eyebrow style).
const panelHeaderStyle: React.CSSProperties = {
  flexShrink: 0,
  height: 44,
  padding: "0 20px",
  display: "flex",
  alignItems: "center",
  borderBottom: "0.5px solid var(--border)",
};
const panelLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "var(--tracking-label)",
  textTransform: "uppercase",
  color: "var(--text-dim)",
};

type DragTarget = "vitals" | "chat";

interface DesktopShellProps {
  tab: "portfolio" | "diary" | "profile";
  children: ReactNode;
}

/**
 * Desktop web layout: the existing top NavBar over a three-pane body —
 * a resizable left Vitals panel, the centered main content column, and a
 * resizable right chat panel rendering ChatThread. Rendered only when
 * useIsDesktop() is true — mobile and the native app never reach this.
 *
 * Fixed-positioned to escape the shared layout's centered max-w-[720px] column.
 */
export function DesktopShell({ tab, children }: DesktopShellProps) {
  const router = useRouter();
  const { user } = useUser();
  const displayCurrency = useDisplayCurrency();
  const { assets } = useAssets(user?.id);
  const hasPortfolio = assets.length > 0;
  const chatSuggestions = getChatSuggestions(displayCurrency, hasPortfolio);

  const setTab = (t: "portfolio" | "diary" | "profile" | "vitals") => {
    router.push(t === "portfolio" ? "/" : "/" + t);
  };

  // ── Resizable side panels ───────────────────────────────────────────────
  const [vitalsWidth, setVitalsWidth] = useState(VITALS_DEFAULT);
  const [chatWidth, setChatWidth] = useState(CHAT_DEFAULT);
  const [drag, setDrag] = useState<DragTarget | null>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const vitalsRef = useRef(vitalsWidth);
  const chatRef = useRef(chatWidth);
  useEffect(() => { vitalsRef.current = vitalsWidth; }, [vitalsWidth]);
  useEffect(() => { chatRef.current = chatWidth; }, [chatWidth]);

  // Read + clamp persisted widths on mount.
  useEffect(() => {
    const v = Number(localStorage.getItem(VITALS_WIDTH_KEY));
    if (Number.isFinite(v) && v > 0) setVitalsWidth(clampVitals(v));
    const c = Number(localStorage.getItem(CHAT_WIDTH_KEY));
    if (Number.isFinite(c) && c > 0) setChatWidth(clampChat(c));
  }, []);

  const startDrag = useCallback((target: DragTarget, e: React.PointerEvent) => {
    e.preventDefault();
    setDrag(target);
    dragRef.current = {
      startX: e.clientX,
      startW: target === "vitals" ? vitalsRef.current : chatRef.current,
    };
  }, []);

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      if (!dragRef.current) return;
      if (drag === "vitals") {
        // Left panel: dragging the handle right widens it.
        setVitalsWidth(clampVitals(dragRef.current.startW + (e.clientX - dragRef.current.startX)));
      } else {
        // Right panel: dragging the handle left widens it.
        setChatWidth(clampChat(dragRef.current.startW + (dragRef.current.startX - e.clientX)));
      }
    };
    const up = () => {
      if (drag === "vitals") localStorage.setItem(VITALS_WIDTH_KEY, String(vitalsRef.current));
      else localStorage.setItem(CHAT_WIDTH_KEY, String(chatRef.current));
      setDrag(null);
      dragRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag]);

  // ── Chat session + thread plumbing ──────────────────────────────────────
  const session = useChatSession({ userId: user?.id });
  const { messages, thinking, loadMore, hasMore, isLoadingMore } = session;

  // Scenario-explore seed for the mounted chat panel. Fired by the Portfolio
  // teaser / affordance via a window event; built from the latest holdings.
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

  // Per-asset "What if?" seed (pre-computed deterministic chips) → chat rail.
  useEffect(() => {
    const handler = () => {
      const seed = takeWhatIfSeed();
      if (seed) {
        setSeedBase(messagesRef.current.length);
        setSeedMessage(seed);
      }
    };
    window.addEventListener(WHATIF_EVENT, handler);
    return () => window.removeEventListener(WHATIF_EVENT, handler);
  }, []);

  // Hide the seed once a new turn lands (typed or chip tap) — derived from state,
  // so no synchronous setState in an effect and no ref read during render.
  const visibleSeed = seedMessage && messages.length <= seedBase ? seedMessage : null;

  const threadRef = useRef<ChatThreadHandle>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  // Scenario → chat handoff (desktop): the persistent panel consumes the stashed
  // payload once the user is known and narrates it into this thread.
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
      ([entry]) => { if (entry.isIntersecting && !isLoadingMore && hasScrolled.current) loadMore(); },
      { threshold: 0, rootMargin: "200px 0px 0px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  const renderHandle = (target: DragTarget, label: string) => (
    <div
      onPointerDown={(e) => startDrag(target, e)}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      style={{
        cursor: "col-resize",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--text-faint)" }} />
        <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--text-faint)" }} />
        <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--text-faint)" }} />
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      <style>{`
        @keyframes up { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
        @keyframes blink { 0%,100%{opacity:0.2}50%{opacity:1} }
        .chat-msg { animation: up 0.25s ease forwards; }
        .chat-dot { display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--accent);animation:blink 1.2s ease infinite;margin:0 2px; }
        .chat-dot:nth-child(2){animation-delay:.2s}.chat-dot:nth-child(3){animation-delay:.4s}
        /* Each column scrolls independently with no visible scrollbar. */
        .desk-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .desk-scroll::-webkit-scrollbar { width: 0; height: 0; display: none; }
      `}</style>

      <NavBar
        tab={tab}
        setTab={setTab}
        mutationCount={0}
        liveCount={0}
        totalSymbols={0}
        refreshing={false}
        refreshPrices={() => {}}
        empty
        desktopInset={{ left: vitalsWidth + HANDLE, right: chatWidth + HANDLE }}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: `${vitalsWidth}px ${HANDLE}px minmax(0, 1fr) ${HANDLE}px ${chatWidth}px`,
        }}
      >
        {/* Left rail — Vitals. Recedes on the cream page bg. */}
        <aside
          style={{
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            background: "var(--bg)",
          }}
        >
          <div style={panelHeaderStyle}>
            <span style={panelLabelStyle}>Vitals</span>
          </div>
          <div className="desk-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px" }}>
            <VitalsContent layout="grid" libraryPosition="top" showHeader={false} />
          </div>
        </aside>

        {renderHandle("vitals", "Resize vitals panel")}

        {/* Center — the focal column: lighter surface, hairline dividers either side. */}
        <main
          className="desk-scroll"
          style={{
            minWidth: 0,
            overflowY: "auto",
            background: "var(--surface-center)",
            borderLeft: "1px solid var(--border)",
            borderRight: "1px solid var(--border)",
          }}
        >
          <div style={{ maxWidth: MAIN_MAX_WIDTH, margin: "0 auto", padding: "20px 20px 40px" }}>
            {children}
          </div>
        </main>

        {renderHandle("chat", "Resize chat panel")}

        {/* Right rail — Assistant chat. Recedes on the cream page bg. */}
        <aside
          style={{
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            background: "var(--bg)",
          }}
        >
          <div style={panelHeaderStyle}>
            <span style={panelLabelStyle}>Assistant</span>
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
            onScroll={(e) => {
              if (e.currentTarget.scrollTop > 0) hasScrolled.current = true;
            }}
            ref={threadRef}
          />
        </aside>
      </div>

      {/* Transparent overlay during drag so text/iframes don't select */}
      {drag && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            cursor: "col-resize",
          }}
        />
      )}
    </div>
  );
}
