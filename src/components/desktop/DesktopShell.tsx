"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import { ChatThread, type ChatThreadHandle } from "@/components/chat/ChatThread";
import { VitalsContent } from "@/components/vitals/VitalsContent";
import { useChatSession, getChatSuggestions } from "@/lib/use-chat-session";
import { useUser, useDisplayCurrency, useAssets } from "@/lib/hooks";

const CHAT_WIDTH_KEY = "volnar.chat.width";
const CHAT_WIDTH_MIN = 300;
const CHAT_WIDTH_MAX = 560;
const CHAT_WIDTH_DEFAULT = 380;

function clampWidth(w: number): number {
  return Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, w));
}

// Centered reading width for the main column, matching the mobile layout.
const MAIN_MAX_WIDTH = 720;
// Fixed width of the left Vitals panel.
const VITALS_WIDTH = 380;

interface DesktopShellProps {
  tab: "portfolio" | "diary" | "profile";
  children: ReactNode;
}

/**
 * Desktop web layout: the existing top NavBar, a scrollable main column that
 * renders the current tab's content component, a draggable divider, and a
 * persistent chat panel rendering ChatThread. Rendered only when
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

  // ── Resizable chat panel ────────────────────────────────────────────────
  const [chatWidth, setChatWidth] = useState(CHAT_WIDTH_DEFAULT);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const widthRef = useRef(chatWidth);
  useEffect(() => { widthRef.current = chatWidth; }, [chatWidth]);

  // Read + clamp the persisted width on mount.
  useEffect(() => {
    const raw = localStorage.getItem(CHAT_WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n)) setChatWidth(clampWidth(n));
  }, []);

  const onHandleDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    dragRef.current = { startX: e.clientX, startW: widthRef.current };
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      if (!dragRef.current) return;
      // Panel is on the right: dragging the handle left widens it.
      const delta = dragRef.current.startX - e.clientX;
      setChatWidth(clampWidth(dragRef.current.startW + delta));
    };
    const up = () => {
      setDragging(false);
      dragRef.current = null;
      localStorage.setItem(CHAT_WIDTH_KEY, String(widthRef.current));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging]);

  // ── Chat session + thread plumbing ──────────────────────────────────────
  const session = useChatSession({ userId: user?.id });
  const { messages, thinking, loadMore, hasMore, isLoadingMore } = session;

  const threadRef = useRef<ChatThreadHandle>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

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
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: `${VITALS_WIDTH}px minmax(0, 1fr) 9px ${chatWidth}px`,
        }}
      >
        {/* Left panel — Vitals (its own heading is rendered by VitalsContent) */}
        <aside
          style={{
            minHeight: 0,
            overflowY: "auto",
            padding: "0 16px 24px",
            borderRight: "0.5px solid var(--border)",
          }}
        >
          <VitalsContent layout="grid" libraryPosition="top" />
        </aside>

        {/* Main column — centered reading-width content for the current tab */}
        <main
          style={{
            minWidth: 0,
            overflowY: "auto",
          }}
        >
          <div style={{ maxWidth: MAIN_MAX_WIDTH, margin: "0 auto", padding: "20px 20px 40px" }}>
            {children}
          </div>
        </main>

        {/* Resize handle */}
        <div
          onPointerDown={onHandleDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat panel"
          style={{
            cursor: "col-resize",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg)",
            borderLeft: "0.5px solid var(--border)",
            borderRight: "0.5px solid var(--border)",
            userSelect: "none",
            touchAction: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--text-faint)" }} />
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--text-faint)" }} />
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--text-faint)" }} />
          </div>
        </div>

        {/* Chat panel */}
        <aside
          style={{
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            background: "var(--bg)",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              padding: "0 20px",
              height: 44,
              display: "flex",
              alignItems: "center",
              borderBottom: "0.5px solid var(--border)",
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--text-faint)",
              }}
            >
              Assistant
            </span>
          </div>

          <ChatThread
            variant="popup"
            session={session}
            seedMessage={null}
            chatSuggestions={chatSuggestions}
            hasPortfolio={hasPortfolio}
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
      {dragging && (
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
