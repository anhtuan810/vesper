"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface Props {
  assetId: string;
}

export function DeleteAssetButton({ assetId }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm">("idle");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-revert from confirm state after 5 s
  useEffect(() => {
    if (step === "confirm") {
      timerRef.current = setTimeout(() => setStep("idle"), 5000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [step]);

  const handleClick = async () => {
    if (step === "idle") {
      setStep("confirm");
      setError(null);
      return;
    }

    // Second click — confirmed delete
    if (timerRef.current) clearTimeout(timerRef.current);
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Delete failed");
      }
      router.push("/");
    } catch (e) {
      setDeleting(false);
      setStep("idle");
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const isConfirm = step === "confirm";

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={handleClick}
        disabled={deleting}
        style={{
          width: "100%",
          minHeight: 40,
          padding: "9px 0",
          borderRadius: 12,
          fontSize: 11,
          fontFamily: "var(--mono)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          cursor: deleting ? "not-allowed" : "pointer",
          border: `1px solid ${isConfirm ? "var(--negative)" : "var(--border)"}`,
          background: isConfirm ? "rgba(201,122,110,0.10)" : "transparent",
          color: isConfirm ? "var(--negative)" : "var(--text-faint)",
          transition: "all 0.15s ease",
          opacity: deleting ? 0.5 : 1,
        }}
      >
        {deleting ? "Deleting…" : isConfirm ? "Tap again to delete" : "Delete asset"}
      </button>
      {error && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "var(--negative)",
            textAlign: "center",
            fontFamily: "var(--mono)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
