"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export type InlineEditKind = "money" | "number" | "percent" | "text" | "date";

interface Props {
  display: React.ReactNode;
  rawValue: string;
  onSave: (raw: string) => Promise<string | null>;
  placeholder?: string;
  displayStyle?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  displayClassName?: string;
  affordance?: boolean;
  kind?: InlineEditKind;
  displayCurrency?: string;
}

export function InlineEdit({
  display,
  rawValue,
  onSave,
  placeholder,
  displayStyle,
  inputStyle,
  displayClassName,
  affordance,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rawValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    setDraft(rawValue);
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
  // rawValue excluded — draft initialises once when editing opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const commit = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const result = await onSave(draft);
    savingRef.current = false;
    setSaving(false);
    if (result === null || result === "") {
      setEditing(false);
    } else {
      setError(result);
    }
  }, [draft, onSave]);

  const cancel = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") cancel();
  };

  if (!editing) {
    return (
      <button
        onClick={() => { setEditing(true); setError(null); }}
        className={displayClassName}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
          display: "flex",
          alignItems: "center",
          color: "inherit",
          font: "inherit",
          textAlign: "left",
          width: "100%",
          ...displayStyle,
        }}
      >
        {display}
        {affordance && (
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
            style={{ color: "var(--text-faint)", flexShrink: 0, marginLeft: 3 }}
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <div style={{ padding: "12px 16px" }}>
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setError(null); }}
        onKeyDown={handleKeyDown}
        disabled={saving}
        placeholder={placeholder}
        style={{
          width: "100%",
          background: "var(--surface-elev)",
          border: `1px solid ${error ? "var(--negative)" : "var(--border-strong)"}`,
          borderRadius: 8,
          padding: "9px 12px",
          color: "var(--text)",
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          outline: "none",
          boxSizing: "border-box",
          opacity: saving ? 0.6 : 1,
          transition: "border-color 0.1s",
          ...inputStyle,
        }}
      />
      {error && (
        <div style={{ fontSize: 11, color: "var(--negative)", marginTop: 4, lineHeight: 1.3 }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={commit}
          disabled={saving}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 8,
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
            fontFamily: "var(--font-sans)",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={cancel}
          disabled={saving}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid var(--border-strong)",
            background: "transparent",
            color: "var(--text-dim)",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
