"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

// ─── Icon primitives ─────────────────────────────────────────────────────────

type IconProps = { size?: number };

function Ico({ d, size = 16, extra }: { d: React.ReactNode; size?: number; extra?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={extra}
      style={{ width: size, height: size, flexShrink: 0 }}
      aria-hidden
    >
      {d}
    </svg>
  );
}

function LockIcon({ size }: IconProps) {
  return (
    <Ico size={size} d={<>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>} />
  );
}

function ImageIcon({ size }: IconProps) {
  return (
    <Ico size={size} d={<>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </>} />
  );
}

function PaperclipIcon({ size }: IconProps) {
  return (
    <Ico size={size} d={
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    } />
  );
}


function ArrowUpIcon({ size }: IconProps) {
  return (
    <Ico size={size} d={<>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </>} />
  );
}

function QuoteIcon({ size }: IconProps) {
  return (
    <Ico size={size} d={<>
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
    </>} />
  );
}

function FileSpreadsheetIcon({ size }: IconProps) {
  return (
    <Ico size={size} d={<>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M8 13h2" />
      <path d="M14 13h2" />
      <path d="M8 17h2" />
      <path d="M14 17h2" />
    </>} />
  );
}

function CameraIcon({ size }: IconProps) {
  return (
    <Ico size={size} d={<>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </>} />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PortfolioEmptyState() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const hasContent = text.trim().length > 0;
  const showPlaceholder = !focused && !text;

  // Auto-grow textarea: expand to content, cap at 4 lines (~84px)
  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const capped = Math.min(el.scrollHeight, 84);
    el.style.height = capped + "px";
    el.style.overflowY = el.scrollHeight > 84 ? "auto" : "hidden";
  }, []);

  useEffect(() => { autoGrow(); }, [text, autoGrow]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sessionStorage.setItem("volnar.empty.input", trimmed);
    router.push("/chat");
  }, [text, router]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const prefillText = (value: string) => {
    setText(value);
    setFocused(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  // Read file as base64, stash in sessionStorage, then navigate to chat
  const handleFileSelected = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      try {
        sessionStorage.setItem("volnar.empty.image", JSON.stringify({
          base64: result.split(",")[1],
          mediaType: file.type,
        }));
        sessionStorage.setItem("volnar.chat.autosubmit", "1");
      } catch {
        // sessionStorage full — navigate anyway, image will be lost
      }
      router.push("/chat");
    };
    reader.readAsDataURL(file);
  }, [router]);

  // Clipboard image → stash and route
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((i) => i.type.startsWith("image/"));
      if (imageItem) {
        e.preventDefault();
        const file = imageItem.getAsFile();
        if (file) handleFileSelected(file);
        else router.push("/chat");
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [router, handleFileSelected]);

  // Drag-and-drop anywhere → route to chat
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
    else router.push("/chat");
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ paddingTop: 22, paddingLeft: 22, paddingRight: 22 }}
    >
      <style>{`
        .es-pill { transition: background 0.12s, transform 0.1s; }
        .es-pill:hover { background: rgba(58,92,58,0.07) !important; }
        .es-pill:active { transform: scale(0.97); }
        .es-example { transition: border-color 0.15s; cursor: pointer; }
        .es-example:hover { border-color: rgba(58,92,58,0.22) !important; }
        .es-example:active { transform: scale(0.99); }
        .es-input-wrap { transition: box-shadow 0.15s; }
        .es-input-wrap:focus-within { box-shadow: 0 0 0 2px rgba(58,92,58,0.15) !important; }
        .es-send:active { transform: scale(0.94); }
      `}</style>

      {/* ─── Section 1: Hero ─────────────────────────────────────────────── */}

      {/* Privacy pill */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: "#E4EDE0", color: "#3A5C3A",
        borderRadius: 999, padding: "4px 9px",
      }}>
        <LockIcon size={14} />
        <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 11, fontWeight: 500 }}>
          Private · stays on your device
        </span>
      </div>

      {/* Headline */}
      <h1 style={{
        fontFamily: "Georgia, \"Lora\", \"Crimson Pro\", serif",
        fontStyle: "italic", fontWeight: 400,
        fontSize: 23, lineHeight: 1.3, color: "#2C3A2C",
        margin: "16px 0 0",
      }}>
        Throw anything at me.
      </h1>

      {/* Sub-headline */}
      <p style={{
        fontFamily: "system-ui, sans-serif",
        fontSize: 14, color: "#6B756B", lineHeight: 1.5,
        margin: "6px 0 0",
      }}>
        A sentence, a screenshot, a CSV, a photo of a statement — I&apos;ll sort it.
      </p>

      {/* ─── Section 2: Preview card ──────────────────────────────────────── */}

      <div style={{
        marginTop: 18,
        background: "#FFFFFF", borderRadius: 14,
        border: "0.5px solid rgba(0,0,0,0.06)",
        padding: "14px 16px",
      }}>
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{
            fontFamily: "system-ui, sans-serif",
            fontSize: 10, color: "#8A948A",
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            Your Net Worth
          </span>
          <span style={{
            fontFamily: "system-ui, sans-serif",
            fontSize: 10, fontWeight: 500,
            color: "#3A5C3A", background: "#E4EDE0",
            padding: "2px 7px", borderRadius: 4,
          }}>
            Preview
          </span>
        </div>

        {/* Amount row */}
        <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{
            fontFamily: "Georgia, serif",
            fontSize: 26, fontWeight: 500, color: "#2C3A2C",
            letterSpacing: "-0.02em",
          }}>
            $ &mdash;&thinsp;&mdash;&thinsp;&mdash;
          </span>
          <span style={{ fontFamily: "system-ui, sans-serif", fontSize: 11, color: "#8A948A" }}>
            + &mdash; %
          </span>
        </div>

        {/* Sparkline */}
        <div style={{ marginTop: 4 }}>
          <svg
            width="100%"
            height="32"
            viewBox="0 0 280 36"
            preserveAspectRatio="none"
          >
            <polyline
              points="0,28 30,24 60,26 90,18 120,21 150,14 180,16 210,8 240,11 280,3"
              fill="none"
              stroke="#5C7C5C"
              strokeWidth="1.5"
              opacity="0.55"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Hint */}
        <p style={{ margin: "4px 0 0", fontFamily: "system-ui, sans-serif", fontSize: 12, color: "#8A948A" }}>
          Add one thing and this comes to life.
        </p>
      </div>

      {/* ─── Section 3: Multimodal input ─────────────────────────────────── */}

      <div
        className="es-input-wrap"
        style={{
          marginTop: 18,
          background: "#FFFFFF", borderRadius: 18,
          border: "0.5px solid rgba(58,92,58,0.25)",
          padding: "10px 10px 8px",
        }}
      >
        {/* Placeholder / textarea */}
        <div style={{ position: "relative" }}>
          {/* Placeholder overlay — tap to focus */}
          <div
            onClick={() => { setFocused(true); requestAnimationFrame(() => textareaRef.current?.focus()); }}
            style={{
              fontFamily: "var(--sans)",
              fontSize: 15, color: "#A8B0A6",
              padding: "6px 6px 10px", lineHeight: 1.5,
              cursor: "text", userSelect: "none",
              opacity: showPlaceholder ? 1 : 0,
              pointerEvents: showPlaceholder ? "auto" : "none",
              position: showPlaceholder ? "relative" : "absolute",
              inset: 0,
              transition: "opacity 0.1s",
            }}
          >
            Type, paste, or attach anything…
          </div>

          {/* Actual textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onFocus={() => setFocused(true)}
            onBlur={() => { if (!text) setFocused(false); }}
            onKeyDown={handleKeyDown}
            rows={1}
            style={{
              display: showPlaceholder ? "none" : "block",
              width: "100%",
              background: "transparent",
              border: "none", outline: "none",
              resize: "none",
              fontFamily: "var(--sans)",
              fontSize: 15,
              color: "#2C3A2C", lineHeight: 1.5,
              padding: "6px 6px 4px",
              minHeight: 23, maxHeight: 92,
              overflowY: "hidden",
            }}
          />
        </div>

        {/* Action row */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
          {/* Photo pill */}
          <button
            className="es-pill"
            onClick={() => photoInputRef.current?.click()}
            style={pillStyle}
            aria-label="Add photo"
          >
            <ImageIcon size={14} />
            Photo
          </button>

          {/* File pill */}
          <button
            className="es-pill"
            onClick={() => fileInputRef.current?.click()}
            style={pillStyle}
            aria-label="Attach file"
          >
            <PaperclipIcon size={14} />
            File
          </button>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Send button */}
          <button
            className="es-send"
            onClick={handleSend}
            disabled={!hasContent}
            style={{
              width: 32, height: 32, borderRadius: "50%",
              background: hasContent ? "#3A5C3A" : "#C5CCC4",
              border: "none",
              color: hasContent ? "#F5EDE0" : "#FFFFFF",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: hasContent ? "pointer" : "default",
              transition: "background 0.15s, transform 0.1s",
              flexShrink: 0,
            }}
            aria-label="Send"
          >
            <ArrowUpIcon size={16} />
          </button>
        </div>
      </div>

      {/* ─── Section 4: Examples list ────────────────────────────────────── */}

      <div style={{ marginTop: 16 }}>
        <p style={{
          fontFamily: "system-ui, sans-serif",
          fontSize: 11, color: "#8A948A",
          margin: "0 0 8px",
        }}>
          Try starting with —
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <ExampleRow
            icon={<QuoteIcon size={16} />}
            label="A sentence"
            example={"\"100 shares of VOO at $520 each\""}
            onClick={() => prefillText("100 shares of VOO at $520 each")}
          />
          <ExampleRow
            icon={<ImageIcon size={16} />}
            label="A screenshot"
            example="Your broker app, your bank, anything"
            onClick={() => photoInputRef.current?.click()}
          />
          <ExampleRow
            icon={<FileSpreadsheetIcon size={16} />}
            label="A file"
            example="CSV, PDF statement, portfolio export"
            onClick={() => fileInputRef.current?.click()}
          />
          <ExampleRow
            icon={<CameraIcon size={16} />}
            label="A photo of paper"
            example="Pension letter, deed, statement"
            onClick={() => cameraInputRef.current?.click()}
          />
        </div>
      </div>

      {/* Bottom spacer before tab nav */}
      <div style={{ height: 18 }} />

      {/* Hidden file inputs */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
          e.target.value = "";
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.pdf,.xlsx,.txt"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const pillStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 4,
  background: "transparent",
  border: "0.5px solid rgba(58,92,58,0.18)",
  borderRadius: 999,
  padding: "5px 10px",
  color: "#3A5C3A",
  fontFamily: "system-ui, sans-serif",
  fontSize: 11,
  cursor: "pointer",
  // Touch-target: padding extends hit area vertically to ~44px
  minHeight: 44,
};


function ExampleRow({
  icon, label, example, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  example: string;
  onClick: () => void;
}) {
  return (
    <button
      className="es-example"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "#FFFFFF",
        border: "0.5px solid rgba(0,0,0,0.06)",
        borderRadius: 12,
        padding: "10px 12px",
        textAlign: "left",
        width: "100%",
        transition: "border-color 0.15s, transform 0.1s",
      }}
    >
      {/* Icon chip */}
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: "#E4EDE0",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, color: "#3A5C3A",
      }}>
        {icon}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "system-ui, sans-serif",
          fontSize: 11, color: "#8A948A",
        }}>
          {label}
        </div>
        <div style={{
          fontFamily: "Georgia, \"Lora\", serif",
          fontStyle: "italic", fontSize: 13,
          color: "#2C3A2C", lineHeight: 1.3,
          marginTop: 1,
        }}>
          {example}
        </div>
      </div>
    </button>
  );
}
