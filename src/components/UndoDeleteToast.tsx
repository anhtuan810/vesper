"use client";

import { useState, useEffect } from "react";
import { useUserContext } from "@/components/UserProvider";
import { invalidateAssetsCache } from "@/lib/hooks";

interface Snapshot {
  asset: Record<string, unknown> & { name?: string };
  deleted_at: string;
}

const SNAPSHOT_KEY = "vesper.recently_deleted";
const VISIBLE_MS = 8000;

export function UndoDeleteToast() {
  const { user } = useUserContext();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const raw = sessionStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Snapshot;
      const ageMs = Date.now() - new Date(parsed.deleted_at).getTime();
      if (ageMs >= VISIBLE_MS) {
        sessionStorage.removeItem(SNAPSHOT_KEY);
        return;
      }
      setSnapshot(parsed);
      timer = setTimeout(() => {
        setSnapshot(null);
        try { sessionStorage.removeItem(SNAPSHOT_KEY); } catch {}
      }, VISIBLE_MS - ageMs);
    } catch {
      try { sessionStorage.removeItem(SNAPSHOT_KEY); } catch {}
    }
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  if (!snapshot) return null;

  const handleUndo = async () => {
    setRestoring(true);
    setError(null);
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot.asset),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Undo failed");
      }
      try { sessionStorage.removeItem(SNAPSHOT_KEY); } catch {}
      if (user?.id) invalidateAssetsCache(user.id);
      setSnapshot(null);
      window.dispatchEvent(new Event("vesper:asset-restored"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Undo failed");
      setRestoring(false);
    }
  };

  const handleDismiss = () => {
    try { sessionStorage.removeItem(SNAPSHOT_KEY); } catch {}
    setSnapshot(null);
  };

  const name = snapshot.asset.name ?? "asset";

  return (
    <div
      className="fixed left-1/2 z-40 flex items-center gap-3"
      style={{
        transform: "translateX(-50%)",
        bottom: "calc(80px + env(safe-area-inset-bottom))",
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: 10,
        padding: "10px 14px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <span className="font-mono text-dim" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
        {error ? error : `Deleted ${name}`}
      </span>
      <button
        onClick={handleUndo}
        disabled={restoring}
        className="font-mono uppercase text-accent hover:opacity-80 transition-opacity"
        style={{
          fontSize: 11,
          padding: "4px 10px",
          letterSpacing: "0.08em",
          background: "none",
          border: "1px solid var(--border-strong)",
          borderRadius: 6,
          cursor: restoring ? "default" : "pointer",
          opacity: restoring ? 0.5 : 1,
        }}
      >
        {restoring ? "Restoring…" : "Undo"}
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="text-faint hover:text-dim transition-colors"
        style={{
          fontSize: 14,
          lineHeight: 1,
          padding: "0 4px",
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );
}
