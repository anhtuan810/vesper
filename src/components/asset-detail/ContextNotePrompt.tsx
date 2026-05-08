"use client";

import { useState, useEffect } from "react";

interface Props {
  mutationId: string;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 30_000;

export function ContextNotePrompt({ mutationId, onDismiss }: Props) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-dismiss after 30 s
  useEffect(() => {
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/mutations/${mutationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personal_context: note.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Save failed");
      }
      setSaved(true);
      setTimeout(onDismiss, 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 16,
        padding: "14px 16px",
        borderRadius: 14,
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
      }}
    >
      <div
        className="font-mono text-faint uppercase mb-2"
        style={{ fontSize: 9, letterSpacing: "0.16em" }}
      >
        Context note
      </div>
      <div
        className="font-serif text-dim"
        style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}
      >
        That was a significant change — care to note why?
      </div>
      <textarea
        value={note}
        onChange={(e) => { setNote(e.target.value); setError(null); }}
        placeholder="e.g. Rebalancing after quarterly review…"
        rows={2}
        style={{
          width: "100%",
          background: "var(--surface-elev)",
          border: `1px solid ${error ? "var(--negative)" : "var(--border)"}`,
          borderRadius: 8,
          padding: "8px 10px",
          color: "var(--text)",
          fontFamily: "var(--sans)",
          fontSize: 13,
          lineHeight: 1.5,
          resize: "none",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {error && (
        <div style={{ fontSize: 11, color: "var(--negative)", marginTop: 4 }}>
          {error}
        </div>
      )}
      <div className="flex gap-2" style={{ marginTop: 10 }}>
        <button
          onClick={handleSave}
          disabled={saving || saved}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 8,
            fontSize: 11,
            fontFamily: "var(--mono)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            background: saved ? "var(--positive)" : "var(--accent)",
            color: "var(--bg)",
            border: "none",
            cursor: saving || saved ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saved ? "Saved" : saving ? "Saving…" : "Save note"}
        </button>
        <button
          onClick={onDismiss}
          disabled={saving}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 11,
            fontFamily: "var(--mono)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            background: "transparent",
            color: "var(--text-faint)",
            border: "1px solid var(--border)",
            cursor: "pointer",
          }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
