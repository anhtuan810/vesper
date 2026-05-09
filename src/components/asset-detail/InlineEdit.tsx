"use client";

import { useState, useRef, useEffect } from "react";
import { useFxRate } from "@/lib/hooks";
import { convertToEur, type DisplayCurrency, type FxFreshness } from "@/lib/money";

export type InlineEditKind = "money" | "number" | "percent" | "text";

interface Props {
  /** Formatted value shown in read mode (e.g. "$1,234") */
  display: React.ReactNode;
  /**
   * Raw EUR-stored value as a string. For kind="money" InlineEdit converts
   * this to display currency for the pre-fill and back to EUR on save.
   * For all other kinds, the value is passed to onSave unchanged.
   */
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
  /** Show a pencil glyph in idle state to signal editability */
  affordance?: boolean;
  /**
   * "money"   — pre-fills in display currency, converts to EUR on save.
   * "percent" — no conversion; value is a percentage number.
   * "number"  — no conversion; value is any numeric string.
   * "text"    — no conversion; default.
   */
  kind?: InlineEditKind;
  /** Required when kind="money". The user's current display currency. */
  displayCurrency?: DisplayCurrency;
}

function PencilIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ color: "var(--text-faint)", flexShrink: 0, marginLeft: 3 }}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function freshnessNote(freshness: FxFreshness): string | null {
  if (freshness === "stale") return "Using an approximate exchange rate — value may differ slightly.";
  return null;
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
  kind = "text",
  displayCurrency,
}: Props) {
  // Always call hooks unconditionally.
  // For non-money kinds useFxRate("EUR") is a no-op (rate=1, freshness='fresh').
  const effectiveCurrency: DisplayCurrency = (kind === "money" && displayCurrency) ? displayCurrency : "EUR";
  const { rate, freshness } = useFxRate(effectiveCurrency);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rawValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!editing) return;

    // Pre-fill the draft with the display-currency value for money fields.
    if (kind === "money") {
      const eurNum = parseFloat(rawValue);
      if (!isNaN(eurNum)) {
        setDraft(String(Math.round(eurNum * rate)));
      } else {
        setDraft(rawValue);
      }
    } else {
      setDraft(rawValue);
    }

    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  // rawValue and rate excluded — draft initialises once when editing opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const commit = async () => {
    if (savingRef.current) return;

    // Block commit when rate is unavailable for money fields.
    if (kind === "money" && freshness === "unavailable") {
      setError("Exchange rate unavailable — try again later.");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    // For money fields, convert the display-currency draft back to EUR before
    // handing off to the parent's onSave (which expects an EUR string).
    let saveValue = draft;
    if (kind === "money") {
      const displayNum = parseFloat(draft);
      if (!isNaN(displayNum)) {
        saveValue = String(Math.round(convertToEur(displayNum, effectiveCurrency)));
      }
    }

    const result = await onSave(saveValue);
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
        {affordance && <PencilIcon />}
      </button>
    );
  }

  const staleNote = kind === "money" ? freshnessNote(freshness) : null;

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
      {!error && staleNote && (
        <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 3, lineHeight: 1.3 }}>
          {staleNote}
        </div>
      )}
    </div>
  );
}
