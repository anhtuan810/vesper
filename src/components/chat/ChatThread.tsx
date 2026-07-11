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
import { Chip } from "@/components/chat/Chip";
import { useSubscription } from "@/components/SubscriptionProvider";
import { useSignOut } from "@/lib/hooks";
import { classifyChip, cheapHash } from "@/lib/chip-telemetry";
import { DISCLAIMER_TEXT } from "@/lib/claude";
import { isNative } from "@/lib/platform";
import { usePortfolioBuilding } from "@/lib/portfolio-build";
import type { useChatSession, ProcessingKind } from "@/lib/use-chat-session";
import type { ChatSeed } from "@/lib/chat-seeds";

type ChatSession = ReturnType<typeof useChatSession>;

// While the model works on a data-bearing turn, name what it's reading instead of
// showing bare typing dots — reassuring during onboarding that the screenshot /
// statement / list they just handed over actually landed.
const PROCESSING_LABEL: Record<ProcessingKind, string> = {
  image: "Reading your screenshot…",
  pdf: "Reading your statement…",
  csv: "Reading your file…",
  holdings: "Processing your data…",
};

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
  /** Space reserved below the page composer to clear the BottomNav (px). Defaults to
   * 64 (the nav height). Surfaces with no BottomNav — e.g. onboarding — pass 0. */
  bottomInset?: number;
  /** Anchor a short thread to the BOTTOM of the scroll area (just above the
   * composer) instead of the top. Used by onboarding so a few messages don't float
   * at the top of a tall screen. */
  bottomAlign?: boolean;

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
      bottomInset = 64,
      bottomAlign = false,
      scrollContainerRef,
      sentinelRef,
      bottomRef,
      onScroll,
    },
    ref
  ) {
    const {
      messages, input, setInput, loading, thinking, processingKind, remaining,
      imagePreviews, imageData, canSend, send, sendText, sendScenario, removeImage, handlePaste, handleFile,
      pdfData, csvData, attachmentError, removePdf, removeCsv,
      isLoadingMore, demoEnded,
    } = session;

    // A seeded chip with a pre-computed scenario handoff dispatches deterministic
    // figures (model only narrates); otherwise it sends the chip text as usual.
    const tapSeedChip = (chip: string) => {
      const handoff = seedMessage?.chipActions?.[chip];
      if (handoff) sendScenario(handoff);
      else sendText(chip);
    };

    const isPage = variant === "page";

    // While a past-dated add rebuilds the net-worth history in the background,
    // show a quiet line so the user knows the charts/journal are still filling in.
    const building = usePortfolioBuilding();

    // Demo sessions get an extra point-of-use reassurance beneath the composer:
    // anything entered is wiped when the ephemeral session ends. Inert otherwise.
    const { data: subscription } = useSubscription();
    const isDemo = !!subscription?.isDemo;

    // A demo session out of messages is WALLED, not "back tomorrow": the server
    // reports remaining=0 on the last allowed reply and the client then blocks
    // further sends, so the 429 that flips demoEnded never fires in a continuous
    // session — without this, exhaustion showed the real-account daily-limit
    // copy (factually wrong: the anonymous session is reaped within the hour)
    // and the sign-up call-to-action this wall exists for never appeared.
    const demoWalled = demoEnded || (isDemo && remaining === 0);

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
      // Native: the Capacitor Keyboard plugin resizes the whole webview, so the
      // visual viewport never shrinks relative to the layout viewport and the
      // web detector below can't see the keyboard (and some installed binaries
      // predate the plugin, so the native keyboardWillShow event never arrives
      // either). On a phone, focusing the composer ALWAYS raises the keyboard, so
      // treat focus itself as the signal: hide the nav (data-kb=open) and drop the
      // composer's reserved nav padding. No --kb-inset — the webview has already
      // resized, so the fixed container is already measured above the keyboard.
      if (isNative()) {
        setKeyboardOpen(true);
        document.documentElement.dataset.kb = "open";
        return;
      }
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

    // When the keyboard opens the composer moves up and the message viewport
    // shrinks; re-pin to the latest message once the reflow settles so the newest
    // reply is never left clipped behind the composer. bottomRef lives inside the
    // scroll container (owned by the page), so this scrolls that list, not the page.
    useEffect(() => {
      if (!keyboardOpen) return;
      const id = requestAnimationFrame(() =>
        bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }),
      );
      return () => cancelAnimationFrame(id);
    }, [keyboardOpen, bottomRef]);

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

    // Send while keeping the soft keyboard up. On the phone composer, clearing
    // the field and reflowing the message list after a send can make iOS
    // WKWebView drop focus from the textarea — the keyboard collapses and the
    // user has to tap the field again before they can keep typing (or press
    // send a second time). Reassert focus within the same gesture, and once
    // more after the post-send reflow settles, so focus never leaves and the
    // keyboard stays open like every other chat app. Refocusing an
    // already-focused field is a harmless no-op, so this is safe on every path.
    const sendKeepingFocus = useCallback(() => {
      send();
      if (!isPage) return;
      const el = textareaRef.current;
      el?.focus();
      requestAnimationFrame(() => el?.focus());
    }, [send, isPage]);

    // ── Per-variant presentational config ────────────────────────────────────
    const msgFontSize = "var(--fs-body)";
    const userMaxWidth = isPage ? "78%" : "80%";
    // User bubble = the elevated surface token on BOTH variants, so the desktop
    // (popup) bubbles are the identical colour as mobile (page) — not a separate tan.
    const userBg = "var(--surface)";
    const userLineHeight = "var(--lh-body)";
    const seedFontSize = "var(--fs-body)";

    const scrollStyle: React.CSSProperties = isPage
      ? {
          minHeight: 0,
          padding: "var(--space-4) 0 var(--space-4)",
          scrollbarWidth: "none",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-5)",
        }
      : {
          padding: "var(--space-5) var(--space-5) var(--space-2)",
          scrollbarWidth: "none",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
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
            className="tnum text-accent text-right"
            style={{ fontSize: "var(--fs-micro)", paddingBottom: "var(--space-1)" }}
          >
            {remaining === 0 ? "Limit reached" : `${remaining} left today`}
          </div>
        )}
        {input.length >= 400 && (
          <div
            className="tnum"
            style={{
              fontSize: "var(--fs-micro)",
              paddingBottom: "var(--space-1)",
              color: input.length >= 500 ? "var(--negative)" : "var(--accent)",
            }}
          >
            {input.length}/500
          </div>
        )}
      </>
    );

    // Once the demo session is over (out of messages, or past its hour), the
    // composer swaps to this quiet line instead of a dead input. The action
    // signs out of the anonymous session and lands on /login, where a real
    // account (with its 7-day trial) can be created — the same path the
    // expiry wall takes.
    const signOut = useSignOut();
    const demoEndedNotice = (
      <div
        style={{
          background: "var(--surface)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          padding: "14px 16px",
          textAlign: "center",
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-body)",
          color: "var(--text-dim)",
        }}
      >
        Demo session ended.{" "}
        <button
          onClick={signOut}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            font: "inherit",
            color: "var(--accent)",
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
        >
          Start your own portfolio
        </button>
        .
      </div>
    );

    // Muted point-of-use disclaimer rendered directly beneath the composer input.
    const disclaimer = (
      <div
        className="text-faint text-center"
        style={{ fontSize: "var(--fs-micro)", lineHeight: "var(--lh-snug)", paddingTop: "var(--space-2)" }}
      >
        {isDemo && (
          <div style={{ fontSize: "var(--fs-caption)", color: "var(--text-dim)", paddingBottom: "var(--space-1)" }}>
            This is a demo. Anything you enter is deleted when your session ends — nothing is stored.
          </div>
        )}
        {DISCLAIMER_TEXT}
      </div>
    );

    // Non-image attachments (PDF statements, CSV exports) show as removable chips —
    // they can't render as a thumbnail like an image. A rejected file surfaces its
    // reason here too, so nothing is ever silently dropped.
    const fileChip = (label: string, onRemove: () => void, key: string) => (
      <div
        key={key}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          maxWidth: "100%", padding: "5px 8px 5px 10px",
          background: "var(--surface)", border: "0.5px solid var(--border)",
          borderRadius: "var(--radius-md)", fontSize: "var(--fs-caption)", color: "var(--text-dim)",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <button
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          style={{
            flexShrink: 0, width: 16, height: 16, borderRadius: "50%",
            background: "var(--text-faint)", color: "var(--bg)", border: "none",
            cursor: "pointer", fontSize: "var(--fs-micro)", lineHeight: "16px", textAlign: "center", padding: 0,
          }}
        >
          ✕
        </button>
      </div>
    );
    const fileAttachments = (pdfData.length > 0 || csvData.length > 0 || attachmentError) ? (
      <div className="pb-2 flex flex-col gap-1.5">
        {(pdfData.length > 0 || csvData.length > 0) && (
          <div className="flex items-center gap-2 flex-wrap">
            {pdfData.map((p, i) => fileChip(p.name, () => removePdf(i), `pdf-${i}`))}
            {csvData.map((c, i) => fileChip(c.name, () => removeCsv(i), `csv-${i}`))}
          </div>
        )}
        {attachmentError && (
          <div style={{ fontSize: "var(--fs-caption)", color: "var(--negative)" }}>{attachmentError}</div>
        )}
      </div>
    ) : null;

    // ── Scrollable message list (shared, presentationally parametrized) ───────
    const messageList = (
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onScroll={onScroll}
        style={scrollStyle}
      >
        {/* marginTop:auto pushes a short thread to the bottom (just above the
            composer); it collapses to 0 once the thread overflows, so scrolling to
            older messages still works. */}
        <div ref={sentinelRef} style={bottomAlign ? { marginTop: "auto" } : undefined} />
        {isLoadingMore && (
          <div
            className="text-center text-faint"
            style={{ fontSize: "var(--fs-caption)", paddingBottom: 4 }}
          >
            Loading older messages…
          </div>
        )}

        {messages.length === 0 && !seedMessage && (
          <div>
            <div
              className={`text-dim ${isPage ? "mb-5" : "mb-4"}`}
              style={{ fontSize: "var(--fs-body)", lineHeight: "var(--lh-body)" }}
            >
              {emptyText}
            </div>
            <div className="flex flex-col items-start gap-2">
              {chatSuggestions.map((s, i) => {
                const c = classifyChip(s, { surface: "chat_empty_suggestion" });
                return (
                  <Chip
                    key={`${i}-${s}`}
                    label={s}
                    surface="chat_empty_suggestion"
                    chipType={c.chipType}
                    labelTemplate={c.labelTemplate}
                    sendRawLabel={c.sendRawLabel}
                    position={i}
                    onTap={sendText}
                    tone="accent"
                  />
                );
              })}
            </div>
          </div>
        )}

        {(() => {
          const lastAssistantIdx = messages.reduce((last, m, i) => m.from === "assistant" ? i : last, -1);
          return messages.map((msg, i) => {
            const firstAssistant = source === "portfolio" && msg.from === "assistant" && !messages.slice(0, i).some((m) => m.from === "assistant");
            return (
            <div
              key={msg.id ?? msg.localId ?? i}
              className={`chat-msg flex flex-col ${msg.from === "user" ? "items-end" : "items-start"}`}
            >
              {firstAssistant && (
                <div className="eyebrow" style={{
                  color: "var(--accent-text)",
                  opacity: 0.7,
                  marginBottom: "var(--space-2)",
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
                  boxShadow: msg.from === "user" ? "var(--shadow-soft)" : "none",
                  color: "var(--text)",
                  fontFamily: "var(--font-ui)",
                  fontSize: msgFontSize,
                  lineHeight: msg.from === "user" ? userLineHeight : "var(--lh-body)",
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
                              borderRadius: "var(--radius-md)",
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
                  {msg.suggestedReplies.map((chip, ci) => {
                    const c = classifyChip(chip, { surface: "chat_suggested_reply" });
                    return (
                      <Chip
                        key={`${ci}-${chip}`}
                        label={chip}
                        surface="chat_suggested_reply"
                        chipType={c.chipType}
                        labelTemplate={c.labelTemplate}
                        sendRawLabel={c.sendRawLabel}
                        position={ci}
                        messageId={msg.id}
                        contentHash={cheapHash(msg.text)}
                        onTap={sendText}
                        style={
                          chip === "Confirm and save"
                            ? { border: "1px solid var(--accent)" }
                            : undefined
                        }
                      />
                    );
                  })}
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
                fontFamily: "var(--font-ui)",
                fontSize: seedFontSize,
                lineHeight: "var(--lh-body)",
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
                  borderRadius: "var(--radius-lg)",
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
                  className="font-display"
                  style={{ fontStyle: "italic", fontSize: "var(--fs-body)", color: "var(--text-dim)", lineHeight: "var(--lh-body)", marginTop: "var(--space-row)" }}
                >
                  {seedMessage.cone.line}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {seedMessage.chips.map((chip, ci) => {
                const c = classifyChip(chip, { surface: "chat_seed", chipActions: seedMessage.chipActions });
                return (
                  <Chip
                    key={`${ci}-${chip}`}
                    label={chip}
                    surface="chat_seed"
                    chipType={c.chipType}
                    labelTemplate={c.labelTemplate}
                    sendRawLabel={c.sendRawLabel}
                    seedKind={c.seedKind}
                    position={ci}
                    contentHash={cheapHash(seedMessage.message)}
                    onTap={tapSeedChip}
                  />
                );
              })}
            </div>
          </div>
        )}

        {thinking && (
          processingKind ? (
            // Named "working on your data" line — reuses the `building` line's
            // styling so the two working states read as one system, and is
            // announced (aria-live) unlike the silent dots.
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 py-1 text-dim"
              style={{ fontSize: "var(--fs-caption)" }}
            >
              <span className="chat-build-spinner" aria-hidden />
              <span>{PROCESSING_LABEL[processingKind]}</span>
            </div>
          ) : (
            <div className="flex items-center gap-0.5 py-1">
              <span className="chat-dot" />
              <span className="chat-dot" />
              <span className="chat-dot" />
            </div>
          )
        )}
        {building && !thinking && (
          <div className="flex items-center gap-2 py-1 text-dim" style={{ fontSize: "var(--fs-caption)" }}>
            <span className="chat-build-spinner" aria-hidden />
            <span>Building your history and market notes — your charts and journal will fill in shortly.</span>
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
                : `0 0 calc(${bottomInset}px + env(safe-area-inset-bottom))`,
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
                        fontSize: "var(--fs-micro)", lineHeight: "18px", textAlign: "center", padding: 0,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {fileAttachments}

            {counters}

            {/* Input pill — or the quiet sign-up line once the demo is over */}
            {demoWalled ? demoEndedNotice : (
            <div
              style={{
                background: "var(--surface)",
                border: "0.5px solid var(--border-strong)",
                borderRadius: "var(--radius-xl)",
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
                accept="image/*,.pdf,application/pdf,.csv,text/csv"
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
                  width: 40,
                  height: 40,
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
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); sendKeepingFocus(); } }}
                onPaste={handlePaste}
                maxLength={500}
                rows={1}
                placeholder={placeholder}
                className="flex-1 outline-none"
                style={{
                  background: "transparent",
                  border: "none",
                  resize: "none",
                  fontFamily: "var(--font-ui)",
                  fontSize: "var(--fs-body)",
                  lineHeight: "var(--lh-body)",
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
                onClick={sendKeepingFocus}
                // Don't let the tap move focus off the textarea — that blur is
                // what collapses the soft keyboard. preventDefault on the press
                // keeps the caret (and keyboard) in the composer; the click
                // still fires.
                onMouseDown={(e) => e.preventDefault()}
                disabled={!canSend}
                className="flex items-center justify-center"
                style={{
                  flexShrink: 0,
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: canSend ? "var(--accent)" : "var(--surface-elev)",
                  color: canSend ? "var(--on-accent)" : "var(--text-faint)",
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
            )}
            {disclaimer}
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
                    fontSize: "var(--fs-micro)", lineHeight: "16px", textAlign: "center", padding: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {fileAttachments && <div className="px-4 shrink-0">{fileAttachments}</div>}

        {/* Input bar */}
        <div
          className="px-4 py-3 shrink-0"
          style={{ position: "relative", borderTop: "0.5px solid var(--border)" }}
        >
          {counters}

          {/* Input pill — or the quiet sign-up line once the demo is over */}
          {demoWalled ? demoEndedNotice : (
          <div
            style={{
              position: "relative",
              background: composerBg ?? "var(--bg)",
              border: "0.5px solid var(--border-strong)",
              borderRadius: "var(--radius-xl)",
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
              accept="image/*,.pdf,application/pdf,.csv,text/csv"
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
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); send(); }
              }}
              onPaste={handlePaste}
              maxLength={500}
              placeholder={placeholder}
              className="flex-1 outline-none"
              style={{
                background: "transparent",
                border: "none",
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-body)",
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
                color: canSend ? "var(--on-accent)" : "var(--text-faint)",
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
          )}
          {disclaimer}
        </div>
      </>
    );
  }
);
