"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/lib/hooks";
import { apiFetch } from "@/lib/api";

// One-time AI data-sharing disclosure. Shown once to an authenticated user who
// has not yet acknowledged (ai_consent_at is null). There is no decline path —
// this is an informed acknowledgment, dismissed only via "Continue", which
// records the timestamp server-side. Returns null on marketing/login (no user
// there) and for anyone who has already acknowledged.
export function AiConsentGate() {
  const { user, aiConsentAt, markAiConsent } = useUser();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  // `aiConsentAt === null` means loaded-and-not-acknowledged; `undefined` (still
  // loading) keeps the sheet closed so it never flashes for returning users.
  const open = !!user && aiConsentAt === null;

  // Focus the primary action when the sheet opens and lock background scroll.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    continueRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const handleContinue = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // timeoutMs guards against a stalled request: it aborts (and rejects into
      // the catch below) so the button can never freeze on "Saving…".
      const res = await apiFetch("/api/users/ai-consent", { method: "POST", timeoutMs: 15000 });
      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      // Setting the local timestamp flips `open` to false and unmounts the sheet.
      markAiConsent(typeof data?.ai_consent_at === "string" ? data.ai_consent_at : undefined);
    } catch {
      // Thrown or timed-out request: surface the error and leave the gate open
      // so the user can retry Continue.
      setError("Something went wrong. Please try again.");
    } finally {
      // Reset on every settled outcome — success, non-ok, and throw/timeout
      // alike — so a stalled request can never leave the button stuck.
      setSubmitting(false);
    }
  }, [submitting, markAiConsent]);

  // Trap focus inside the dialog; swallow Escape so it can only be dismissed via
  // Continue.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      return;
    }
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const focusable = root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  if (!open) return null;

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-5)",
        zIndex: 200,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-consent-title"
        aria-describedby="ai-consent-body"
        onKeyDown={onKeyDown}
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--surface)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-6) var(--space-5) var(--space-5)",
          fontFamily: "var(--font-ui)",
          boxShadow: "var(--shadow-soft)",
        }}
      >
        <div
          id="ai-consent-title"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-title)",
            fontWeight: 500,
            color: "var(--hero)",
            marginBottom: "var(--space-3)",
            letterSpacing: "var(--tracking-title)",
            fontVariationSettings: "'opsz' 26",
          }}
        >
          How Volnar uses AI
        </div>

        <div
          id="ai-consent-body"
          style={{ fontSize: "var(--fs-body)", color: "var(--text-dim)", lineHeight: "var(--lh-body)" }}
        >
          <p style={{ margin: "0 0 12px" }}>
            To power the chat assistant and insights, Volnar sends your portfolio
            context — your holdings, values, and notes — to Anthropic, our AI
            provider, so it can read and explain it in plain language.
          </p>
          <p style={{ margin: "0 0 12px" }}>
            All financial calculations are done by deterministic code, not the AI.
            Data sent through the Anthropic API is{" "}
            <strong style={{ color: "var(--hero)", fontWeight: 600 }}>
              not used to train their models
            </strong>
            .
          </p>
          <p style={{ margin: 0 }}>
            <a
              href="https://volnar.nl/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--hero)", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              Read our Privacy Policy
            </a>
          </p>
        </div>

        {error && (
          <div style={{ fontSize: "var(--fs-meta)", color: "var(--negative-text)", marginTop: "var(--space-4)", lineHeight: "var(--lh-body)" }}>
            {error}
          </div>
        )}

        <button
          ref={continueRef}
          onClick={handleContinue}
          disabled={submitting}
          style={{
            width: "100%",
            marginTop: "var(--space-5)",
            padding: "12px 0",
            borderRadius: "var(--radius-md)",
            border: "none",
            background: "var(--hero)",
            color: "var(--surface)",
            fontSize: "var(--fs-body)",
            fontWeight: 600,
            cursor: submitting ? "default" : "pointer",
            fontFamily: "var(--font-ui)",
          }}
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
