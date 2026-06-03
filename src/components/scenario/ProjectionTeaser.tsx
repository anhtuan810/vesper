"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getUsdRate } from "@/lib/money";
import { useDisplayCurrency } from "@/lib/hooks";

// Ambient projection line under the net-worth chart. Quiet and editorial — not a
// banner, not a popup. The midpoint comes from POST /api/scenarios/project
// (trajectory, 10y, no contribution); nothing is projected client-side.
//
// Thin-history guard: when the route falls back to its default growth rate
// (flagged in `assumptions`), we never show a fabricated figure — we show an
// onboarding nudge instead, or nothing.

const HORIZON_YEARS = 10;
const SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

interface ProjResp {
  startUsd: number;
  rate: number;
  trajectory: { low: number; mid: number; high: number };
  assumptions: string[];
}

// A default/insufficient rate is flagged in the route's growth assumptions.
function isThinHistory(r: ProjResp): boolean {
  return r.assumptions.some((a) => /default/i.test(a) && /nominal/i.test(a));
}

export function ProjectionTeaser({ href }: { href: string }) {
  const displayCurrency = useDisplayCurrency();
  const [resp, setResp] = useState<ProjResp | null>(null);
  const [shown, setShown] = useState(false);

  // Bare fetch — state is only set in the async callback, never synchronously in
  // the effect body (keeps clear of react-hooks/set-state-in-effect).
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/scenarios/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "trajectory", horizonYears: HORIZON_YEARS }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ProjResp | null) => { if (d && d.trajectory) setResp(d); })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // Fade-in once there's something to show (rAF callback → not synchronous).
  useEffect(() => {
    if (!resp) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [resp]);

  if (!resp) return null;

  const thin = isThinHistory(resp) || resp.startUsd < 1000;
  const sym = SYMBOL[displayCurrency] ?? "€";
  const year = new Date().getFullYear() + HORIZON_YEARS;

  const compact = (usd: number) => {
    const n = Math.abs(usd * getUsdRate(displayCurrency));
    if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
    if (n >= 1_000) return `${sym}${Math.round(n / 1_000)}K`;
    return `${sym}${Math.round(n)}`;
  };

  const lineStyle: React.CSSProperties = {
    display: "block",
    fontStyle: "italic",
    fontSize: 14.5,
    lineHeight: 1.5,
    color: "var(--text-dim)",
    textDecoration: "none",
    letterSpacing: "0.005em",
    opacity: shown ? 1 : 0,
    transform: shown ? "translateY(0)" : "translateY(3px)",
    transition: "opacity 0.7s ease, transform 0.7s ease",
  };

  return (
    <Link href={href} className="font-serif" style={lineStyle}>
      {thin ? (
        <>Add a little more and I&apos;ll show where you&apos;re heading <span style={{ fontStyle: "normal" }}>→</span></>
      ) : (
        <>
          Keep this pace and you&apos;re near{" "}
          <span style={{ fontStyle: "normal", fontWeight: 600, color: "var(--text)" }}>{compact(resp.trajectory.mid)}</span>{" "}
          by {year} <span style={{ fontStyle: "normal" }}>→</span>
        </>
      )}
    </Link>
  );
}
