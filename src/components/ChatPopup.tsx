"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { ChatThread, type ChatThreadHandle } from "@/components/chat/ChatThread";
import { useChatSession, getChatSuggestions } from "@/lib/use-chat-session";
import { useDisplayCurrency, useAssets } from "@/lib/hooks";
import { getChatSeed, type ChatSeed } from "@/lib/chat-seeds";

interface ChatPopupProps {
  userId?: string;
  isOpen: boolean;
  hasNew: boolean;
  onToggle: () => void;
  onPortfolioUpdate: () => void;
  onNewMessage: () => void;
  onOpen: () => void;
}

export default function ChatPopup({
  userId, isOpen, hasNew, onToggle, onPortfolioUpdate, onNewMessage, onOpen,
}: ChatPopupProps) {
  const pathname = usePathname();
  const displayCurrency = useDisplayCurrency();
  const { assets } = useAssets(userId);
  const hasPortfolio = assets.length > 0;
  const chatSuggestions = getChatSuggestions(displayCurrency, hasPortfolio);
  const session = useChatSession({ userId, onPortfolioUpdate, onNewMessage });
  const { messages, thinking, loadMore, hasMore, isLoadingMore } = session;

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

  useEffect(() => {
    if (isLoadMoreUpdate.current) {
      isLoadMoreUpdate.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    if (isOpen) {
      onOpen();
      setTimeout(() => threadRef.current?.focus(), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Context-aware seed: when opened on /asset/[id], show a seed message with chips.
  useEffect(() => {
    if (!isOpen || assets.length === 0) return;
    const match = pathname?.match(/^\/asset\/([^/]+)$/);
    if (!match) return;
    const found = assets.find((a) => a.id === match[1]);
    if (found) {
      const seed = getChatSeed("asset", found.id, `What would you like to know about ${found.name}?`);
      if (seed) setSeedMessage(seed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
          boxShadow: "0 8px 24px rgba(151,112,61,0.3)",
          fontSize: 18,
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
            fontSize: 16,
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
