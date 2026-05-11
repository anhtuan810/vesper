"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { FormatText } from "@/components/FormatText";
import { useChatSession, getChatSuggestions } from "@/lib/use-chat-session";
import { useDisplayCurrency, useAssets } from "@/lib/hooks";

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
  const {
    messages, input, setInput, loading, thinking, remaining,
    imagePreview, imageData, canSend, send, sendText, clearImage, handlePaste, handleFile,
    loadMore, hasMore, isLoadingMore,
  } = useChatSession({ userId, onPortfolioUpdate, onNewMessage });

  const [size, setSize] = useState({ width: 400, height: 560 });
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    if (isOpen) {
      onOpen();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Context-aware seed: when opened on /asset/[id] and input is empty, pre-fill.
  useEffect(() => {
    if (!isOpen || assets.length === 0) return;
    const match = pathname?.match(/^\/asset\/([^/]+)$/);
    if (!match) return;
    const found = assets.find((a) => a.id === match[1]);
    if (found && !input) {
      setInput(`Tell me about my ${found.name}.`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pathname, assets]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !isLoadingMore) loadMore(); },
      { threshold: 0 }
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
          width: 52, height: 52, borderRadius: 16,
          boxShadow: "0 8px 24px rgba(74,124,94,0.3)",
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
        borderRadius: 24,
        boxShadow: "0 24px 60px rgba(0,0,0,0.12)",
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
            width: 28, height: 28, borderRadius: 8,
            background: "var(--surface-elev)",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
          }}
        >
          ×
        </button>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{
          padding: "20px 20px 8px",
          scrollbarWidth: "none",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div ref={sentinelRef} />
        {isLoadingMore && (
          <div
            className="text-center text-faint"
            style={{ fontSize: 11, paddingBottom: 4 }}
          >
            Loading older messages…
          </div>
        )}
        {messages.length === 0 && (
          <div>
            <div
              className="text-dim mb-4 leading-relaxed"
              style={{ fontSize: 14 }}
            >
              Ask about your portfolio, or paste a screenshot of your broker app.
            </div>
            <div className="flex flex-col items-start gap-2">
              {chatSuggestions.map((s) => (
                <button
                  key={s}
                  style={{
                    fontSize: 13,
                    color: "var(--accent-text)",
                    background: "var(--accent-soft)",
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: "none",
                    cursor: "pointer",
                  }}
                  onClick={() => sendText(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`chat-msg flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              style={{
                maxWidth: msg.from === "user" ? "80%" : "92%",
                padding: msg.from === "user" ? "10px 14px" : "0",
                borderRadius: msg.from === "user" ? "18px 18px 4px 18px" : 0,
                background: msg.from === "user" ? "var(--surface-elev)" : "transparent",
                border: msg.from === "user" ? "0.5px solid var(--border)" : "none",
                boxShadow: msg.from === "user" ? "0 1px 2px rgba(0,0,0,0.02)" : "none",
                color: "var(--text)",
                fontSize: 14,
                lineHeight: 1.55,
                overflowWrap: "break-word",
                minWidth: 0,
              }}
            >
              {msg.from === "assistant" ? (
                <FormatText text={msg.text} />
              ) : (
                <>
                  {msg.imagePreview && (
                    <img
                      src={msg.imagePreview}
                      alt=""
                      style={{
                        display: "block",
                        maxWidth: "100%",
                        maxHeight: 200,
                        borderRadius: 10,
                        marginBottom: msg.text && msg.text !== "Screenshot uploaded" ? 8 : 0,
                      }}
                    />
                  )}
                  {(!msg.imagePreview || (msg.text && msg.text !== "Screenshot uploaded")) && msg.text}
                </>
              )}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex items-center gap-0.5 py-1">
            <span className="chat-dot" />
            <span className="chat-dot" />
            <span className="chat-dot" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="px-4 pb-2 flex items-center gap-2 shrink-0">
          <img
            src={imagePreview}
            alt="Preview"
            className="w-10 h-10 rounded-lg object-cover"
            style={{ border: "1px solid var(--border)" }}
          />
          <span className="text-dim flex-1" style={{ fontSize: 12 }}>Screenshot ready to send</span>
          <button
            onClick={clearImage}
            className="text-faint hover:text-dim transition-colors"
            style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Input bar */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ position: "relative", borderTop: "0.5px solid var(--border)" }}
      >
        {remaining !== null && remaining <= 10 && (
          <div
            className="font-mono text-accent text-right"
            style={{ fontSize: 10, paddingBottom: 4 }}
          >
            {remaining === 0 ? "Limit reached" : `${remaining} left today`}
          </div>
        )}
        {input.length >= 400 && (
          <div
            className="font-mono"
            style={{
              fontSize: 10, paddingBottom: 4,
              color: input.length >= 500 ? "var(--negative)" : "var(--accent)",
            }}
          >
            {input.length}/500
          </div>
        )}

        {/* Input pill */}
        <div
          style={{
            position: "relative",
            background: "var(--bg)",
            border: "0.5px solid var(--border-strong)",
            borderRadius: 20,
            padding: "10px 46px 10px 40px",
            display: "flex",
            alignItems: "center",
          }}
        >
          {/* Image attach */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach image"
            className="flex items-center justify-center text-faint hover:text-dim transition-colors"
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </button>

          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); send(); }
            }}
            onPaste={handlePaste}
            maxLength={500}
            placeholder={
              remaining === 0
                ? "Daily limit reached — back tomorrow"
                : imageData
                ? "Add a note or send…"
                : "Ask anything about your portfolio…"
            }
            className="flex-1 outline-none"
            style={{
              background: "transparent",
              border: "none",
              fontFamily: "var(--sans)",
              fontSize: 14,
              color: "var(--text)",
            }}
          />

          {/* Send button */}
          <button
            onClick={send}
            disabled={!canSend}
            className="flex items-center justify-center"
            style={{
              position: "absolute",
              right: 5,
              top: "50%",
              transform: "translateY(-50%)",
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: canSend ? "var(--accent)" : "var(--surface-elev)",
              color: canSend ? "var(--bg)" : "var(--text-faint)",
              border: "none",
              cursor: canSend ? "pointer" : "default",
              opacity: canSend ? 1 : 0.5,
              transition: "background 0.15s, opacity 0.15s",
            }}
          >
            <svg
              viewBox="0 0 256 256"
              fill="none"
              stroke="currentColor"
              strokeWidth="22"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 14, height: 14 }}
            >
              <line x1="128" y1="40" x2="128" y2="216" />
              <polyline points="56 112 128 40 200 112" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
