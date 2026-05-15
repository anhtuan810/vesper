"use client";

import { useRef, useEffect, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useDisplayCurrency, useAssets } from "@/lib/hooks";
import { FormatText } from "@/components/FormatText";
import { useChatSession, getChatSuggestions } from "@/lib/use-chat-session";

export default function ChatPage() {
  const router = useRouter();
  const { user } = useUser();
  const displayCurrency = useDisplayCurrency();
  const { assets, loading: assetsLoading } = useAssets(user?.id);
  const hasPortfolio = assets.length > 0;
  const chatSuggestions = getChatSuggestions(displayCurrency, hasPortfolio);
  const {
    messages, input, setInput, loading, thinking, remaining,
    imagePreview, imageData, canSend, send, sendText, clearImage, handlePaste, handleFile,
    loadMore, hasMore, isLoadingMore,
  } = useChatSession({ userId: user?.id });

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);
  const isLoadMoreUpdate = useRef(false);
  const savedScrollMetrics = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const hasScrolled = useRef(false);

  const [pendingAssetId, setPendingAssetId] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  // Restore scroll position after prepending older messages (loadMore).
  // useLayoutEffect runs before paint so there's no visible jump.
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
    if (!bottomRef.current) return;
    if (!initialScrollDone.current && messages.length > 0) {
      bottomRef.current.scrollIntoView({ behavior: "instant" });
      initialScrollDone.current = true;
    } else if (initialScrollDone.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, thinking]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Reads window.location.search directly to avoid the Suspense requirement of useSearchParams.
  // Runs once on mount; replaces the URL to prevent re-trigger on back-nav.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const assetId = params.get("asset");
    const seed = params.get("seed");
    const src = params.get("source");
    if (src) setSource(src);
    if (assetId) {
      setPendingAssetId(assetId);
      router.replace("/chat", { scroll: false });
    } else if (seed) {
      setInput(decodeURIComponent(seed));
      router.replace("/chat", { scroll: false });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  // When assets finish loading and we have a pending asset id, pre-fill the input.
  useEffect(() => {
    if (!pendingAssetId || assetsLoading) return;
    const found = assets.find((a) => a.id === pendingAssetId);
    setPendingAssetId(null);
    if (found) {
      setInput(`Tell me about my ${found.name}.`);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAssetId, assetsLoading]);

  return (
    <>
      <style>{`
        @keyframes up { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
        @keyframes blink { 0%,100%{opacity:0.2}50%{opacity:1} }
        .chat-msg { animation: up 0.25s ease forwards; }
        .chat-dot { display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--accent);animation:blink 1.2s ease infinite;margin:0 2px; }
        .chat-dot:nth-child(2){animation-delay:.2s}.chat-dot:nth-child(3){animation-delay:.4s}
        .chat-composer-gradient {
          background: linear-gradient(180deg, rgba(245,241,234,0) 0%, var(--bg) 30%, var(--bg) 100%);
        }
        [data-theme="dark"] .chat-composer-gradient {
          background: linear-gradient(180deg, rgba(20,17,13,0) 0%, var(--bg) 30%, var(--bg) 100%);
        }
      `}</style>

      <div
        className="relative flex flex-col overflow-hidden bg-bg"
        style={{ height: "100dvh" }}
      >
        {/* Messages */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden"
          onScroll={(e) => {
            if ((e.currentTarget as HTMLDivElement).scrollTop > 0) hasScrolled.current = true;
          }}
          style={{
            padding: "32px 22px 160px",
            scrollbarWidth: "none",
            display: "flex",
            flexDirection: "column",
            gap: 22,
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
                className="text-dim mb-5 leading-relaxed"
                style={{ fontSize: 15 }}
              >
                {hasPortfolio
                  ? "Ask about your portfolio, or paste a screenshot of your broker app."
                  : "Welcome. Tell me what you own — stocks, property, savings, anything. List them out, or paste a screenshot of your broker app."}
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

          {(() => {
            const lastAssistantIdx = messages.reduce((last, m, i) => m.from === "assistant" ? i : last, -1);
            return messages.map((msg, i) => {
              const firstAssistant = source === "portfolio" && msg.from === "assistant" && !messages.slice(0, i).some((m) => m.from === "assistant");
              return (
              <div
                key={i}
                className={`chat-msg flex flex-col ${msg.from === "user" ? "items-end" : "items-start"}`}
              >
                {firstAssistant && (
                  <div style={{
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--accent-text)",
                    opacity: 0.7,
                    marginBottom: 6,
                  }}>
                    From Portfolio
                  </div>
                )}
                <div
                  style={{
                    maxWidth: msg.from === "user" ? "78%" : "92%",
                    padding: msg.from === "user" ? "10px 14px" : "0",
                    borderRadius: msg.from === "user" ? "18px 18px 4px 18px" : 0,
                    background: msg.from === "user" ? "var(--surface)" : "transparent",
                    border: msg.from === "user" ? "0.5px solid var(--border)" : "none",
                    boxShadow: msg.from === "user" ? "0 1px 2px rgba(0,0,0,0.02)" : "none",
                    color: "var(--text)",
                    fontSize: 15,
                    lineHeight: msg.from === "user" ? 1.4 : 1.55,
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
                {i === lastAssistantIdx && !loading && msg.suggestedReplies && msg.suggestedReplies.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {msg.suggestedReplies.map((chip) => (
                      <button
                        key={chip}
                        onClick={() => sendText(chip)}
                        style={{
                          height: 32,
                          padding: "0 14px",
                          borderRadius: 999,
                          fontSize: 14,
                          background: "var(--surface-elev)",
                          color: "var(--text)",
                          border: chip === "Confirm and save"
                            ? "1px solid var(--accent)"
                            : "1px solid var(--border)",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              );
            });
          })()}

          {thinking && (
            <div className="flex items-center gap-0.5 py-1">
              <span className="chat-dot" />
              <span className="chat-dot" />
              <span className="chat-dot" />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Floating composer — positioned above the bottom nav */}
        <div
          className="chat-composer-gradient"
          style={{
            position: "absolute",
            bottom: "calc(64px + env(safe-area-inset-bottom))",
            left: 0,
            right: 0,
            padding: "0 22px 12px",
          }}
        >
          {/* Image preview */}
          {imagePreview && (
            <div className="pb-2 flex items-center gap-2">
              <img
                src={imagePreview}
                alt="Preview"
                className="w-12 h-12 rounded-lg object-cover"
                style={{ border: "1px solid var(--border)" }}
              />
              <span className="text-dim flex-1" style={{ fontSize: 12 }}>
                Screenshot ready to send
              </span>
              <button
                onClick={clearImage}
                className="text-faint hover:text-dim transition-colors"
                style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Counter badges */}
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
                fontSize: 10,
                paddingBottom: 4,
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
              background: "var(--surface)",
              border: "0.5px solid var(--border-strong)",
              borderRadius: 22,
              padding: "12px 50px 12px 44px",
              display: "flex",
              alignItems: "center",
            }}
          >
            {/* Image attach button */}
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
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              <svg
                width="15"
                height="15"
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
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
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
                fontSize: 15,
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
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                width: 34,
                height: 34,
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
                style={{ width: 15, height: 15 }}
              >
                <line x1="128" y1="40" x2="128" y2="216" />
                <polyline points="56 112 128 40 200 112" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
