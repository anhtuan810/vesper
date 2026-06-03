"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import { FormatText } from "@/components/FormatText";
import { ProjectionChart } from "@/components/scenario/cards/ProjectionChart";
import { ScenarioResultCard } from "@/components/scenario/cards/ScenarioResultCard";
import type { useChatSession } from "@/lib/use-chat-session";
import type { ChatSeed } from "@/lib/chat-seeds";

type ChatSession = ReturnType<typeof useChatSession>;

export interface ChatThreadHandle {
  /** Focus the composer input — used by callers on open / prefill. */
  focus: () => void;
}

interface ChatThreadProps {
  /** "page" = full-screen /chat route (textarea composer); "popup" = desktop ChatPopup (single-line input). */
  variant: "page" | "popup";
  /** Live values from the shared useChatSession hook, owned by the caller. */
  session: ChatSession;
  /** Synthetic, non-persisted seed message (asset/insight/onboarding context). */
  seedMessage: ChatSeed | null;
  chatSuggestions: string[];
  hasPortfolio: boolean;
  /** When "portfolio", the first assistant bubble gets a "From Portfolio" eyebrow (page only). */
  source?: string | null;
  /** Override the composer input-pill background (popup variant). Defaults to var(--bg). */
  composerBg?: string;

  // Caller-owned refs so the caller's scroll/observer effects keep working.
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

export const ChatThread = forwardRef<ChatThreadHandle, ChatThreadProps>(
  function ChatThread(
    {
      variant,
      session,
      seedMessage,
      chatSuggestions,
      hasPortfolio,
      source,
      composerBg,
      scrollContainerRef,
      sentinelRef,
      bottomRef,
      onScroll,
    },
    ref
  ) {
    const {
      messages, input, setInput, loading, thinking, remaining,
      imagePreviews, imageData, canSend, send, sendText, removeImage, handlePaste, handleFile,
      isLoadingMore,
    } = session;

    const isPage = variant === "page";

    // Composer refs — each variant renders a different element type, so keep a
    // dedicated ref per type and expose focus() to the caller via the handle.
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const inputElRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileInputKey, setFileInputKey] = useState(0);

    // Page-only: keyboard open tracking drives composer padding + BottomNav hide.
    const [keyboardOpen, setKeyboardOpen] = useState(false);

    // Page-only: keep the composer flush above the soft keyboard. The layout
    // viewport doesn't reflow on iOS WKWebView (no interactiveWidget / keyboard
    // plugin), so measure the keyboard with the visualViewport API and publish it
    // as --kb-inset; the /chat container shrinks its height by that amount.
    //
    // Crucially this is gated on an ACTUAL keyboard (a real visualViewport shrink
    // past KB_THRESHOLD), not on focus alone — otherwise focusing the composer on
    // desktop / a resizable window (no keyboard) would hide the nav and shrink the
    // container, leaving a dead gap at the bottom.
    const KB_THRESHOLD = 120;
    const vvHandlerRef = useRef<(() => void) | null>(null);
    const syncKeyboard = useCallback(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const open = inset > KB_THRESHOLD;
      setKeyboardOpen(open);
      document.documentElement.dataset.kb = open ? "open" : "";
      document.documentElement.style.setProperty("--kb-inset", open ? `${Math.round(inset)}px` : "0px");
    }, []);
    const resetKeyboard = useCallback(() => {
      const vv = window.visualViewport;
      if (vv && vvHandlerRef.current) {
        vv.removeEventListener("resize", vvHandlerRef.current);
        vv.removeEventListener("scroll", vvHandlerRef.current);
      }
      vvHandlerRef.current = null;
      setKeyboardOpen(false);
      document.documentElement.dataset.kb = "";
      document.documentElement.style.setProperty("--kb-inset", "0px");
    }, []);
    const onComposerFocus = useCallback(() => {
      const vv = window.visualViewport;
      if (vv && !vvHandlerRef.current) {
        const handler = () => syncKeyboard();
        vvHandlerRef.current = handler;
        vv.addEventListener("resize", handler);
        vv.addEventListener("scroll", handler);
      }
      // Measure once the keyboard has had a chance to animate in.
      requestAnimationFrame(syncKeyboard);
      setTimeout(syncKeyboard, 250);
    }, [syncKeyboard]);
    const onComposerBlur = useCallback(() => {
      resetKeyboard();
    }, [resetKeyboard]);
    // Tidy up if the route unmounts while the keyboard is open.
    useEffect(() => () => { resetKeyboard(); }, [resetKeyboard]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          if (isPage) textareaRef.current?.focus();
          else inputElRef.current?.focus();
        },
      }),
      [isPage]
    );

    // Auto-grow the page composer: expand with the text and cap at ~5 lines,
    // after which it scrolls internally. Keeps the field single-line until needed.
    const autoGrowComposer = useCallback(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      const capped = Math.min(el.scrollHeight, 120);
      el.style.height = capped + "px";
      el.style.overflowY = el.scrollHeight > 120 ? "auto" : "hidden";
    }, []);
    useEffect(() => {
      if (isPage) autoGrowComposer();
    }, [input, autoGrowComposer, isPage]);

    // ── Per-variant presentational config ────────────────────────────────────
    const msgFontSize = isPage ? 15 : 14;
    const userMaxWidth = isPage ? "78%" : "80%";
    // User bubble = the elevated surface token on BOTH variants, so the desktop
    // (popup) bubbles are the identical colour as mobile (page) — not a separate tan.
    const userBg = "var(--surface)";
    const userLineHeight = isPage ? 1.4 : 1.55;
    const chipFontSize = isPage ? 14 : 13;
    const seedFontSize = isPage ? 15 : 14;

    const scrollStyle: React.CSSProperties = isPage
      ? {
          minHeight: 0,
          padding: "calc(32px + env(safe-area-inset-top)) 0 16px",
          scrollbarWidth: "none",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }
      : {
          padding: "20px 20px 8px",
          scrollbarWidth: "none",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        };

    const emptyText = isPage
      ? hasPortfolio
        ? "Ask about your portfolio, or paste a screenshot of your broker app."
        : "Welcome. Tell me what you own — stocks, property, savings, anything. List them out, or paste a screenshot of your broker app."
      : "Ask about your portfolio, or paste a screenshot of your broker app.";

    const placeholder = (() => {
      if (remaining === 0) return "Daily limit reached — back tomorrow";
      if (imageData.length) return "Add a note or send…";
      const lastMsg = messages[messages.length - 1];
      const chipsVisible = seedMessage !== null || (
        lastMsg?.from === "assistant" &&
        (lastMsg.suggestedReplies?.length ?? 0) > 0
      );
      return chipsVisible ? "Or type something else…" : "Ask anything about your portfolio…";
    })();

    // ── Counter badges (shared by both composers) ────────────────────────────
    const counters = (
      <>
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
      </>
    );

    // ── Scrollable message list (shared, presentationally parametrized) ───────
    const messageList = (
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onScroll={onScroll}
        style={scrollStyle}
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

        {messages.length === 0 && !seedMessage && (
          <div>
            <div
              className={`text-dim ${isPage ? "mb-5" : "mb-4"} leading-relaxed`}
              style={{ fontSize: isPage ? 15 : 14 }}
            >
              {emptyText}
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
                  maxWidth: msg.from === "user" ? userMaxWidth : "92%",
                  padding: msg.from === "user" ? "10px 14px" : "0",
                  borderRadius: msg.from === "user" ? "18px 18px 4px 18px" : 0,
                  background: msg.from === "user" ? userBg : "transparent",
                  border: msg.from === "user" ? "0.5px solid var(--border)" : "none",
                  boxShadow: msg.from === "user" ? "0 1px 2px rgba(0,0,0,0.02)" : "none",
                  color: "var(--text)",
                  fontSize: msgFontSize,
                  lineHeight: msg.from === "user" ? userLineHeight : 1.55,
                  overflowWrap: "break-word",
                  minWidth: 0,
                }}
              >
                {msg.from === "assistant" ? (
                  <FormatText text={msg.text} />
                ) : (
                  <>
                    {msg.imagePreviews && msg.imagePreviews.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: msg.text && msg.text !== "Screenshot uploaded" && msg.text !== "Screenshots uploaded" ? 8 : 0 }}>
                        {msg.imagePreviews.map((src, idx) => (
                          <img
                            key={idx}
                            src={src}
                            alt=""
                            style={{
                              display: "block",
                              maxWidth: "100%",
                              maxHeight: 200,
                              borderRadius: 10,
                            }}
                          />
                        ))}
                      </div>
                    )}
                    {(!msg.imagePreviews?.length || (msg.text && msg.text !== "Screenshot uploaded" && msg.text !== "Screenshots uploaded")) && msg.text}
                  </>
                )}
              </div>
              {msg.from === "assistant" && msg.scenarioResult && (
                <div style={{ width: "100%", maxWidth: "92%" }}>
                  <ScenarioResultCard result={msg.scenarioResult} />
                </div>
              )}
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
                        fontSize: chipFontSize,
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

        {/* Synthetic seed message — local only, not persisted */}
        {seedMessage && !loading && (
          <div className="chat-msg flex flex-col items-start">
            <div
              style={{
                maxWidth: "92%",
                padding: "0",
                background: "transparent",
                border: "none",
                color: "var(--text)",
                fontSize: seedFontSize,
                lineHeight: 1.55,
                overflowWrap: "break-word",
                minWidth: 0,
              }}
            >
              <FormatText text={seedMessage.message} />
            </div>
            {seedMessage.cone && (
              <div
                style={{
                  width: "100%",
                  maxWidth: "92%",
                  marginTop: 12,
                  padding: "14px 14px 12px",
                  background: "var(--surface)",
                  border: "0.5px solid var(--border)",
                  borderRadius: 14,
                }}
              >
                <ProjectionChart
                  history={seedMessage.cone.history}
                  today={seedMessage.cone.today}
                  horizon={seedMessage.cone.horizon}
                  horizonYear={seedMessage.cone.horizonYear}
                  symbol={seedMessage.cone.symbol}
                />
                <div
                  className="font-serif"
                  style={{ fontStyle: "italic", fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.5, marginTop: 10 }}
                >
                  {seedMessage.cone.line}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {seedMessage.chips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => sendText(chip)}
                  style={{
                    height: 32,
                    padding: "0 14px",
                    borderRadius: 999,
                    fontSize: chipFontSize,
                    background: "var(--surface-elev)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {thinking && (
          <div className="flex items-center gap-0.5 py-1">
            <span className="chat-dot" />
            <span className="chat-dot" />
            <span className="chat-dot" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    );

    // ── Page composer: gradient block with textarea (auto-grow, multiline) ────
    if (isPage) {
      return (
        <>
          {messageList}
          <div
            className="chat-composer-gradient"
            style={{
              flexShrink: 0,
              padding: keyboardOpen
                ? "0 0 env(safe-area-inset-bottom)"
                : "0 0 calc(64px + env(safe-area-inset-bottom))",
            }}
          >
            {/* Image previews */}
            {imagePreviews.length > 0 && (
              <div className="pb-2 flex items-center gap-2 flex-wrap">
                {imagePreviews.map((src, i) => (
                  <div key={i} style={{ position: "relative", display: "inline-block" }}>
                    <img
                      src={src}
                      alt={`Preview ${i + 1}`}
                      className="rounded-lg object-cover"
                      style={{ width: 48, height: 48, border: "1px solid var(--border)", display: "block" }}
                    />
                    <button
                      onClick={() => removeImage(i)}
                      style={{
                        position: "absolute", top: -6, right: -6,
                        width: 18, height: 18, borderRadius: "50%",
                        background: "var(--text-faint)", color: "var(--bg)",
                        border: "none", cursor: "pointer",
                        fontSize: 10, lineHeight: "18px", textAlign: "center", padding: 0,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {counters}

            {/* Input pill */}
            <div
              style={{
                background: "var(--surface)",
                border: "0.5px solid var(--border-strong)",
                borderRadius: 22,
                padding: "7px 7px 7px 10px",
                display: "flex",
                alignItems: "flex-end",
                gap: 6,
              }}
            >
              {/* Image attach button */}
              <input
                key={fileInputKey}
                ref={fileInputRef}
                type="file"
                accept="image/*"
                tabIndex={-1}
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  setFileInputKey((k) => k + 1);
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach image"
                className="flex items-center justify-center text-faint hover:text-dim transition-colors"
                style={{
                  flexShrink: 0,
                  width: 32,
                  height: 32,
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

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={onComposerFocus}
                onBlur={onComposerBlur}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                onPaste={handlePaste}
                maxLength={500}
                rows={1}
                placeholder={placeholder}
                className="flex-1 outline-none"
                style={{
                  background: "transparent",
                  border: "none",
                  resize: "none",
                  fontFamily: "var(--sans)",
                  fontSize: 15,
                  lineHeight: 1.4,
                  color: "var(--text)",
                  padding: "6px 2px",
                  margin: 0,
                  minWidth: 0,
                  maxHeight: 120,
                  overflowY: "hidden",
                }}
              />

              {/* Send button */}
              <button
                onClick={send}
                disabled={!canSend}
                className="flex items-center justify-center"
                style={{
                  flexShrink: 0,
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
        </>
      );
    }

    // ── Popup composer: separate previews row + single-line input bar ─────────
    return (
      <>
        {messageList}

        {/* Image previews */}
        {imagePreviews.length > 0 && (
          <div className="px-4 pb-2 flex items-center gap-2 flex-wrap shrink-0">
            {imagePreviews.map((src, i) => (
              <div key={i} style={{ position: "relative", display: "inline-block" }}>
                <img
                  src={src}
                  alt={`Preview ${i + 1}`}
                  className="rounded-lg object-cover"
                  style={{ width: 40, height: 40, border: "1px solid var(--border)", display: "block" }}
                />
                <button
                  onClick={() => removeImage(i)}
                  style={{
                    position: "absolute", top: -5, right: -5,
                    width: 16, height: 16, borderRadius: "50%",
                    background: "var(--text-faint)", color: "var(--bg)",
                    border: "none", cursor: "pointer",
                    fontSize: 9, lineHeight: "16px", textAlign: "center", padding: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div
          className="px-4 py-3 shrink-0"
          style={{ position: "relative", borderTop: "0.5px solid var(--border)" }}
        >
          {counters}

          {/* Input pill */}
          <div
            style={{
              position: "relative",
              background: composerBg ?? "var(--bg)",
              border: "0.5px solid var(--border-strong)",
              borderRadius: 20,
              padding: "10px 46px 10px 40px",
              display: "flex",
              alignItems: "center",
            }}
          >
            {/* Image attach */}
            <input
              key={fileInputKey}
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                setFileInputKey((k) => k + 1);
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
              ref={inputElRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); send(); }
              }}
              onPaste={handlePaste}
              maxLength={500}
              placeholder={placeholder}
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
      </>
    );
  }
);
