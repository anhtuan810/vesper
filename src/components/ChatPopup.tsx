"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { ChatThread, type ChatThreadHandle } from "@/components/chat/ChatThread";
import { getChatSuggestions } from "@/lib/use-chat-session";
import { useSharedChatSession } from "@/components/ChatSessionProvider";
import { useDisplayCurrency, useAssets } from "@/lib/hooks";
import { getChatSeed, type ChatSeed } from "@/lib/chat-seeds";

interface ChatPopupProps {
  userId?: string;
  isOpen: boolean;
  onToggle: () => void;
}

export default function ChatPopup({ userId, isOpen, onToggle }: ChatPopupProps) {
  const pathname = usePathname();
  const displayCurrency = useDisplayCurrency();
  const { assets } = useAssets(userId);
  const hasPortfolio = assets.length > 0;
  const chatSuggestions = getChatSuggestions(displayCurrency, hasPortfolio);
  // The ONE app-wide session (shared with the desktop rail and the mobile /chat
  // route) so the popup thread survives navigation and there is a single writer to
  // the localStorage cache. Portfolio refresh after a chat mutation flows through
  // bumpPortfolioRevision() (→ useAssets refetch + the Overview's revision effect),
  // so no onPortfolioUpdate callback is needed.
  const session = useSharedChatSession();
  const { messages, thinking, loadMore, hasMore, isLoadingMore } = session;

  // Unread dot, derived from the shared thread instead of a session callback.
  // While the popup is CLOSED, a brand-new assistant message at the bottom lights
  // it. Compare the last message's stable localId (not length — loadMore prepends
  // older history, growing length with no new bottom message) against a "seen"
  // marker that advances whenever the popup is open, and treat the first settled
  // thread as a baseline so pre-existing history never lights the badge.
  const [hasNew, setHasNew] = useState(false);
  const seenLastIdRef = useRef<string | undefined>(undefined);
  const initializedRef = useRef(false);
  useEffect(() => {
    const lastId = messages[messages.length - 1]?.localId;
    if (!initializedRef.current && messages.length > 0) {
      // First settled thread: baseline all existing history as seen.
      initializedRef.current = true;
      seenLastIdRef.current = lastId;
      return;
    }
    if (isOpen) seenLastIdRef.current = lastId; // everything visible is seen
    const unread = !isOpen && messages[messages.length - 1]?.from === "assistant" && lastId !== seenLastIdRef.current;
    setHasNew(unread);
  }, [isOpen, messages]);

  const [seedMessage, setSeedMessage] = useState<ChatSeed | null>(null);
  const [size, setSize] = useState({ width: 400, height: 560 });
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const threadRef = useRef<ChatThreadHandle>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);
  // Set just before a load-more prepend so the scroll-to-bottom below skips that
  // one messages change — otherwise prepending older history yanks to bottom.
  const isLoadMoreUpdate = useRef(false);
  // Scroll metrics captured just before a load-more prepend, restored below.
  const savedScrollMetrics = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);

  // Restore the reading position after prepending older messages (loadMore).
  // Chrome/Firefox anchor natively, but WebKit (every iPad browser + desktop
  // Safari) does not — without this the viewport jumps to the prepended batch
  // and the sentinel re-enters the observer margin, chain-loading the entire
  // history. useLayoutEffect runs before paint so there's no visible jump.
  // (Same pattern as /chat's page.tsx.)
  useLayoutEffect(() => {
    const metrics = savedScrollMetrics.current;
    const container = scrollContainerRef.current;
    if (!metrics || !container) return;
    container.scrollTop = container.scrollTop + (container.scrollHeight - metrics.scrollHeight);
    savedScrollMetrics.current = null;
  }, [messages]);

  useEffect(() => {
    if (isLoadMoreUpdate.current) {
      isLoadMoreUpdate.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => threadRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Context-aware seed: when opened on /asset?id=<id>, show a seed message with chips.
  useEffect(() => {
    if (!isOpen || assets.length === 0) return;
    // Asset detail lives at /asset?id=<id>; read the id from the query string.
    if (pathname !== "/asset") return;
    const assetId = new URLSearchParams(window.location.search).get("id");
    if (!assetId) return;
    const found = assets.find((a) => a.id === assetId);
    if (found) {
      const seed = getChatSeed("asset", found.id, `What would you like to know about ${found.name}?`);
      if (seed) setSeedMessage(seed);
    }
  }, [isOpen, pathname, assets]);

  // Clear seed when the user sends their first message.
  useEffect(() => {
    if (!seedMessage) return;
    const latestMsg = messages[messages.length - 1];
    if (latestMsg?.from === "user") setSeedMessage(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isLoadingMore && hasScrolled.current) {
          const container = scrollContainerRef.current;
          if (container) {
            savedScrollMetrics.current = { scrollHeight: container.scrollHeight, scrollTop: container.scrollTop };
          }
          isLoadMoreUpdate.current = true;
          loadMore();
        }
      },
      { threshold: 0, rootMargin: "200px 0px 0px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: size.width,
      startH: size.height,
    };
  }, [size]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const deltaX = resizeRef.current.startX - e.clientX;
      const deltaY = resizeRef.current.startY - e.clientY;
      setSize({
        width: Math.max(340, Math.min(700, resizeRef.current.startW + deltaX)),
        height: Math.max(400, Math.min(800, resizeRef.current.startH + deltaY)),
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // FAB
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-8 right-8 flex items-center justify-center text-bg bg-accent hover:opacity-90 transition-opacity"
        style={{
          width: 52, height: 52, borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-soft)",
          fontSize: "var(--fs-subhead)",
        }}
      >
        {hasNew ? (
          <div className="relative">
            <span>✦</span>
            <div
              className="absolute rounded-full bg-negative"
              style={{ width: 8, height: 8, top: -6, right: -6, border: "2px solid var(--bg)" }}
            />
          </div>
        ) : (
          "✦"
        )}
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-8 right-8 flex flex-col overflow-hidden"
      style={{
        width: size.width,
        height: size.height,
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-2xl)",
        boxShadow: "var(--shadow-soft)",
        animation: isResizing ? "none" : "pop 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards",
      }}
    >
      <style>{`
        @keyframes pop { from{opacity:0;transform:scale(0.95) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes up { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
        @keyframes blink { 0%,100%{opacity:0.2}50%{opacity:1} }
        .chat-msg { animation: up 0.25s ease forwards; }
        .chat-dot { display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--accent);animation:blink 1.2s ease infinite;margin:0 2px; }
        .chat-dot:nth-child(2){animation-delay:.2s}.chat-dot:nth-child(3){animation-delay:.4s}
      `}</style>

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: "absolute", top: 0, left: 0,
          width: 20, height: 20, cursor: "nw-resize", zIndex: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div style={{
          width: 8, height: 8, margin: 4,
          borderTop: "2px solid var(--border-strong)",
          borderLeft: "2px solid var(--border-strong)",
          borderRadius: "2px 0 0 0",
        }} />
      </div>

      {/* Header — close button only */}
      <div
        className="flex items-center justify-end px-4 py-3 shrink-0"
        style={{ borderBottom: "0.5px solid var(--border)" }}
      >
        <button
          onClick={onToggle}
          className="flex items-center justify-center text-faint hover:text-dim transition-colors"
          style={{
            width: 28, height: 28, borderRadius: "var(--radius-md)",
            background: "var(--surface-elev)",
            border: "none",
            cursor: "pointer",
            fontSize: "var(--fs-subhead)",
          }}
        >
          ×
        </button>
      </div>

      <ChatThread
        variant="popup"
        session={session}
        seedMessage={seedMessage}
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
    </div>
  );
}
