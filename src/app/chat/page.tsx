"use client";

import { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/hooks";
import { FormatText } from "@/components/FormatText";
import { useChatSession, CHAT_SUGGESTIONS } from "@/lib/use-chat-session";

export default function ChatPage() {
  const router = useRouter();
  const { user } = useUser();
  const {
    messages, input, setInput, loading, thinking, remaining,
    imagePreview, imageData, canSend, send, clearImage, handlePaste,
  } = useChatSession({ userId: user?.id });

  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  return (
    <>
      <style>{`
        @keyframes up { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
        @keyframes blink { 0%,100%{opacity:0.2}50%{opacity:1} }
        .chat-msg { animation: up 0.25s ease forwards; }
        .chat-dot { display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--accent);animation:blink 1.2s ease infinite;margin:0 2px; }
        .chat-dot:nth-child(2){animation-delay:.2s}.chat-dot:nth-child(3){animation-delay:.4s}
      `}</style>

      <div className="flex flex-col bg-surface" style={{ minHeight: "100dvh" }}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div
            className="font-serif text-fg"
            style={{ fontSize: 18, fontWeight: 400, letterSpacing: "-0.01em", fontVariationSettings: "'opsz' 144" }}
          >
            Vesper
          </div>
          <button
            onClick={() => router.back()}
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
          {messages.length === 0 && (
            <div>
              <div className="text-dim mb-4 leading-relaxed" style={{ fontSize: 13 }}>
                Ask about your portfolio, or paste a screenshot of your broker app.
              </div>
              {CHAT_SUGGESTIONS.map((s) => (
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
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
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
                {msg.from === "assistant" ? <FormatText text={msg.text} /> : msg.text}
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
          <div className="px-4 pb-2 flex items-center gap-2 shrink-0">
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
              style={{ fontSize: 12 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Suggestion chips after conversation starts */}
        {messages.length > 0 && !loading && (
          <div className="px-4 pt-2 pb-1 flex gap-1.5 overflow-x-auto shrink-0" style={{ scrollbarWidth: "none" }}>
            {CHAT_SUGGESTIONS.map((s) => (
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
          className="px-4 py-3 flex gap-2 items-center shrink-0"
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
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
            onPaste={handlePaste}
            placeholder={imageData ? "Add a note or send..." : "Ask or paste a screenshot..."}
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
    </>
  );
}
