"use client";

import type { CSSProperties } from "react";
import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  LockIcon, ImageIcon, PaperclipIcon, ArrowUpIcon,
  QuoteIcon, FileSpreadsheetIcon, CameraIcon,
} from "@/components/icons/EmptyStateIcons";
import { DISCLAIMER_TEXT } from "@/lib/claude";

const pillStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 4,
  background: "transparent",
  border: "0.5px solid rgba(151,112,61,0.18)",
  borderRadius: "var(--radius-pill)",
  padding: "5px 10px",
  color: "var(--accent)",
  fontFamily: "var(--sans)",
  fontSize: "var(--fs-caption)",
  cursor: "pointer",
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
        background: "var(--surface)",
        border: "0.5px solid rgba(0,0,0,0.06)",
        borderRadius: "var(--radius-md)",
        padding: "10px 12px",
        textAlign: "left",
        width: "100%",
        transition: "border-color 0.15s, transform 0.1s",
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: "var(--radius-md)",
        background: "var(--accent-soft)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, color: "var(--accent)",
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "var(--sans)",
          fontSize: "var(--fs-caption)", color: "var(--text-dim)",
        }}>
          {label}
        </div>
        <div style={{
          fontFamily: "var(--serif)",
          fontStyle: "italic", fontSize: "var(--fs-meta)",
          color: "#6F5226", lineHeight: "var(--lh-snug)",
          marginTop: 1,
        }}>
          {example}
        </div>
      </div>
    </button>
  );
}

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
      style={{ paddingTop: 22 }}
    >
      <style>{`
        .es-pill { transition: background 0.12s, transform 0.1s; }
        .es-pill:hover { background: rgba(151,112,61,0.07) !important; }
        .es-pill:active { transform: scale(0.97); }
        .es-example { transition: border-color 0.15s; cursor: pointer; }
        .es-example:hover { border-color: rgba(151,112,61,0.22) !important; }
        .es-example:active { transform: scale(0.99); }
        .es-input-wrap { transition: box-shadow 0.15s, border-color 0.15s; }
        .es-input-wrap:focus-within { border-color: rgba(151,112,61,0.5) !important; box-shadow: 0 0 0 2px rgba(151,112,61,0.18), 0 10px 28px rgba(151,112,61,0.09) !important; }
        .es-send:active { transform: scale(0.94); }
      `}</style>

      {/* ─── Section 1: Hero ─────────────────────────────────────────────── */}

      {/* Privacy pill */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: "var(--accent-soft)", color: "var(--accent-text)",
        borderRadius: "var(--radius-pill)", padding: "4px 9px",
      }}>
        <LockIcon size={14} />
        <span style={{ fontFamily: "var(--sans)", fontSize: "var(--fs-caption)", fontWeight: 500 }}>
          Private · stays on your device
        </span>
      </div>

      {/* Headline */}
      <h1 style={{
        fontFamily: "var(--serif)",
        fontStyle: "italic", fontWeight: 400,
        fontSize: "var(--fs-title)", lineHeight: "var(--lh-snug)", color: "var(--hero)",
        letterSpacing: "var(--tracking-title)",
        margin: "16px 0 0",
      }}>
        Throw anything at me.
      </h1>

      {/* Sub-headline */}
      <p style={{
        fontFamily: "var(--sans)",
        fontSize: "var(--fs-body)", color: "var(--text-dim)", lineHeight: "var(--lh-body)",
        margin: "6px 0 0",
      }}>
        A sentence, a screenshot, a CSV, a photo of a statement — I&apos;ll sort it.
      </p>

      {/* Informational-only disclaimer — muted line beneath the opener */}
      <p style={{
        fontFamily: "var(--sans)",
        fontSize: "var(--fs-caption)", color: "var(--text-faint)", lineHeight: "var(--lh-body)",
        margin: "8px 0 0",
      }}>
        {DISCLAIMER_TEXT}
      </p>

      {/* ─── Section 2: Multimodal input — the primary action, first thing in view ─ */}

      <div
        className="es-input-wrap"
        style={{
          marginTop: 22,
          background: "var(--surface)", borderRadius: "var(--radius-xl)",
          border: "1px solid rgba(151,112,61,0.38)",
          boxShadow: "0 1px 2px rgba(20,30,25,0.04), 0 10px 28px rgba(151,112,61,0.09)",
          padding: "12px 12px 10px",
        }}
      >
        {/* Placeholder / textarea */}
        <div style={{ position: "relative" }}>
          {/* Placeholder overlay — tap to focus */}
          <div
            onClick={() => { setFocused(true); requestAnimationFrame(() => textareaRef.current?.focus()); }}
            style={{
              fontFamily: "var(--sans)",
              fontSize: "var(--fs-subhead)", color: "var(--text-faint)",
              padding: "6px 6px 10px", lineHeight: "var(--lh-body)",
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
              fontSize: "var(--fs-subhead)",
              color: "#6F5226", lineHeight: "var(--lh-body)",
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
              background: hasContent ? "var(--accent)" : "#D8CFC0",
              border: "none",
              color: hasContent ? "var(--bg)" : "var(--surface)",
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

      {/* ─── Section 3: Examples list ────────────────────────────────────── */}

      <div style={{ marginTop: 16 }}>
        <p style={{
          fontFamily: "var(--sans)",
          fontSize: "var(--fs-caption)", color: "var(--text-faint)",
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

