"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  const displayCurrency = useDisplayCurrency();
  const { assets } = useAssets(userId);
  const hasPortfolio = assets.length > 0;
  const chatSuggestions = getChatSuggestions(displayCurrency, hasPortfolio);
  const {
    messages, input, setInput, loading, thinking, remaining,
    imagePreview, imageData, canSend, send, clearImage, handlePaste, handleFile,
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
  }, [isOpen]);

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
          boxShadow: "0 8px 24px rgba(212,165,116,0.3)",
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
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
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

      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div>
          <div
            className="font-serif text-fg"
            style={{ fontSize: 18, fontWeight: 400, letterSpacing: "-0.01em", fontVariationSettings: "'opsz' 144" }}
          >
            Vesper
          </div>
          <div
            className="font-mono text-faint flex items-center gap-1.5"
            style={{ fontSize: 10, letterSpacing: "0.08em" }}
          >
            <span
              className="rounded-full bg-positive"
              style={{ width: 5, height: 5, display: "inline-block", boxShadow: "0 0 5px var(--positive)" }}
            />
            Portfolio assistant
          </div>
        </div>
        <button
          onClick={onToggle}
          className="flex items-center justify-center text-faint hover:text-dim transition-colors"
          style={{
            width: 28, height: 28, borderRadius: 8,
            background: "var(--surface-elev)",
            fontSize: 16,
          }}
        >
          ×
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4" style={{ scrollbarWidth: "none" }}>
        <div ref={sentinelRef} />
        {isLoadingMore && (
          <div className="text-center font-mono text-faint" style={{ fontSize: 11, paddingBottom: 4 }}>
            Loading older messages...
          </div>
        )}
        {messages.length === 0 && (
          <div>
            <div className="text-dim mb-4 leading-relaxed" style={{ fontSize: 13 }}>
              Ask about your portfolio, or paste a screenshot of your broker app.
            </div>
            {chatSuggestions.map((s) => (
              <button
                key={s}
                className="block w-full text-left mb-1.5 transition-colors"
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "var(--surface-elev)",
                  border: "1px solid var(--border)",
                  color: "var(--text-dim)",
                  fontSize: 12,
                }}
                onClick={() => {
                  setInput(s);
                  inputRef.current?.focus();
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
            {msg.from === "assistant" && (
              <div className="self-start mr-2 mt-0.5 shrink-0">
                <div
                  className="flex items-center justify-center font-mono text-accent"
                  style={{
                    width: 18, height: 18, borderRadius: 5,
                    background: "var(--accent-soft)",
                    border: "1px solid rgba(212,165,116,0.18)",
                    fontSize: 8, fontWeight: 600,
                  }}
                >
                  V
                </div>
              </div>
            )}
            <div
              className="max-w-[82%]"
              style={{
                padding: msg.from === "user" ? "10px 14px" : "0",
                borderRadius: msg.from === "user" ? "16px 16px 4px 16px" : 0,
                background: msg.from === "user" ? "var(--surface-elev)" : "transparent",
                color: "var(--text-dim)",
                fontSize: 13,
                lineHeight: 1.55,
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
          <div className="flex items-center gap-0.5 py-1 pl-7">
            <span className="chat-dot" />
            <span className="chat-dot" />
            <span className="chat-dot" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="px-4 pb-2 flex items-center gap-2">
          <img
            src={imagePreview}
            alt="Preview"
            className="w-12 h-12 rounded-lg object-cover"
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

      {/* Suggestion chips — after conversation starts */}
      {messages.length > 0 && !loading && (
        <div className="px-4 pt-2 pb-1 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {chatSuggestions.map((s) => (
            <button
              key={s}
              onClick={() => { setInput(s); inputRef.current?.focus(); }}
              className="shrink-0 text-dim transition-colors whitespace-nowrap"
              style={{
                fontSize: 11,
                padding: "6px 12px",
                borderRadius: 20,
                background: "var(--surface-elev)",
                border: "1px solid var(--border)",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div
        className="px-4 py-3 flex gap-2 items-center"
        style={{ position: "relative", borderTop: "1px solid var(--border)" }}
      >
        {remaining !== null && remaining <= 10 && (
          <div
            className="absolute font-mono text-accent"
            style={{ top: -20, right: 16, fontSize: 10 }}
          >
            {remaining === 0 ? "Limit reached" : `${remaining} messages left today`}
          </div>
        )}
        {input.length >= 400 && (
          <div
            className="absolute font-mono"
            style={{
              top: -20, left: 16, fontSize: 10,
              color: input.length >= 500 ? "var(--negative)" : "var(--accent)",
            }}
          >
            {input.length}/500
          </div>
        )}
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
          className="flex items-center justify-center shrink-0 transition-colors text-faint hover:text-dim"
          style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
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
              ? "Add a note or send..."
              : "Ask or paste a screenshot..."
          }
          className="flex-1 outline-none"
          style={{
            background: "var(--surface-elev)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: "10px 14px",
            fontSize: 13,
            color: "var(--text)",
            fontFamily: "var(--sans)",
          }}
        />
        <button
          onClick={send}
          disabled={!canSend}
          className="flex items-center justify-center shrink-0 transition-opacity"
          style={{
            width: 40, height: 40, borderRadius: "50%",
            background: canSend ? "var(--accent)" : "var(--surface-elev)",
            color: canSend ? "var(--bg)" : "var(--text-faint)",
            fontSize: 16,
            cursor: canSend ? "pointer" : "default",
            opacity: canSend ? 1 : 0.5,
            border: "none",
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
