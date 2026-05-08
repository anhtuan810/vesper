"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  /** Formatted value shown in read mode (e.g. "€1,234") */
  display: React.ReactNode;
  /** Raw value pre-filled in the input when editing opens */
  rawValue: string;
  /**
   * Called on Enter / blur-out.
   * Return null → success (editing closes).
   * Return "" → silent revert (no API call, editing closes).
   * Return non-empty string → error message shown inline.
   */
  onSave: (raw: string) => Promise<string | null>;
  placeholder?: string;
  /** Styles applied to the read-mode button */
  displayStyle?: React.CSSProperties;
  /** Styles applied to the <input> */
  inputStyle?: React.CSSProperties;
  displayClassName?: string;
}

export function InlineEdit({
  display,
  rawValue,
  onSave,
  placeholder,
  displayStyle,
  inputStyle,
  displayClassName,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rawValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (editing) {
      setDraft(rawValue);
      // defer so React finishes mounting the input first
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  // rawValue excluded intentionally — draft initialises once when editing opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const commit = async () => {
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
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      setEditing(false);
      setError(null);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => { setEditing(true); setError(null); }}
        className={displayClassName}
        title="Click to edit"
        style={{
          background: "transparent",
          border: "none",
          cursor: "text",
          padding: 0,
          minHeight: 32,
          display: "inline-flex",
          alignItems: "center",
          color: "inherit",
          font: "inherit",
          textAlign: "left",
          ...displayStyle,
        }}
      >
        {display}
      </button>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setError(null); }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        disabled={saving}
        placeholder={placeholder}
        style={{
          background: "var(--surface-elev)",
          border: `1px solid ${error ? "var(--negative)" : "var(--border-strong)"}`,
          borderRadius: 6,
          padding: "4px 8px",
          minHeight: 32,
          color: "var(--text)",
          fontFamily: "var(--mono)",
          fontSize: "inherit",
          fontWeight: "inherit",
          outline: "none",
          width: "100%",
          boxSizing: "border-box",
          opacity: saving ? 0.6 : 1,
          ...inputStyle,
        }}
      />
      {error && (
        <div style={{ fontSize: 10, color: "var(--negative)", marginTop: 3, lineHeight: 1.3 }}>
          {error}
        </div>
      )}
    </div>
  );
}
