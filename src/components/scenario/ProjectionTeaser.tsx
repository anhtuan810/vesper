"use client";

import { useState, useEffect } from "react";
import { getUsdRate } from "@/lib/money";
import { useDisplayCurrency } from "@/lib/hooks";
import { ScenarioCueLine } from "@/components/scenario/ScenarioCueLine";

// Ambient, tappable projection line under the net-worth chart. Quiet and
// editorial — the sentence itself is the affordance (the old "What if?" pill is
// gone). The midpoint and the annualized growth rate both come from
// POST /api/scenarios/project (trajectory, 10y, no contribution); nothing is
// projected or branched client-side beyond reading that response.
//
// Thin-history guard: when the route falls back to its default growth rate
// (flagged in `assumptions`), we never show a fabricated figure or a trajectory
// verdict — we show an onboarding nudge instead.

const HORIZON_YEARS = 10;
const SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };
// An annualized move smaller than this reads as "holding steady".
const FLAT_BAND = 0.02;

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

export function ProjectionTeaser({ onExplore }: { onExplore: () => void }) {
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

  // Trajectory verdict drives the copy. The statement is ink; the trailing clause
  // and arrow are the accent-green affordance. Branch deterministically off the
  // same annualized rate the projection band is built from — flat/declining
  // portfolios never see "keep this pace".
  let statement: React.ReactNode = null;
  let clause: string;
  let aria: string;
  if (thin) {
    clause = "Add a little more and I’ll show where you’re heading";
    aria = "Explore your portfolio projection";
  } else if (resp.rate >= FLAT_BAND) {
    const projected = compact(resp.trajectory.mid);
    statement = (
      <>
        Keep this pace and you reach about{" "}
        <span style={{ fontStyle: "normal", fontWeight: 600 }}>{projected}</span>{" "}
        by {year}.{" "}
      </>
    );
    clause = "See what moves it";
    aria = `Keep this pace and you reach about ${projected} by ${year}. Explore what moves your projection.`;
  } else if (resp.rate <= -FLAT_BAND) {
    statement = <>Down lately.{" "}</>;
    clause = "See what turns it around";
    aria = "Your portfolio is down lately. Explore what could turn it around.";
  } else {
    statement = <>Holding steady.{" "}</>;
    clause = "See what could bend the curve";
    aria = "Your portfolio is holding steady. Explore what could bend the curve.";
  }

  return (
    <ScenarioCueLine
      statement={statement}
      clause={clause}
      ariaLabel={aria}
      onActivate={onExplore}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(3px)",
        transition: "opacity 0.7s ease, transform 0.7s ease",
      }}
    />
  );
}
