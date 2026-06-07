"use client";

import { useState, useEffect } from "react";
import { getUsdRate } from "@/lib/money";
import { useDisplayCurrency } from "@/lib/hooks";
import { ScenarioCueLine } from "@/components/scenario/ScenarioCueLine";
import type { SnapshotPoint } from "@/components/NetWorthChart";
import { hasSufficientHistory } from "@/lib/networth-history";

// Ambient, tappable projection line under the net-worth chart. Quiet and
// editorial — the sentence itself is the affordance (the old "What if?" pill is
// gone). The midpoint comes from POST /api/scenarios/project (trajectory, 10y,
// no contribution), which now drives the rate off an explicit, labelled
// assumption rather than fitting one to the user's own (often-thin) history.
//
// We hide the projection entirely — not just soften the copy — when the
// account is too young to make a 10-year-out figure feel earned: fewer than
// two snapshots, or younger than a week.

const HORIZON_YEARS = 10;
const SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

interface ProjResp {
  startUsd: number;
  rate: number;
  trajectory: { low: number; mid: number; high: number };
  assumptions: string[];
}

interface ProjectionTeaserProps {
  onExplore: () => void;
  snapshots: SnapshotPoint[];
}

export function ProjectionTeaser({ onExplore, snapshots }: ProjectionTeaserProps) {
  const displayCurrency = useDisplayCurrency();
  const [resp, setResp] = useState<ProjResp | null>(null);
  const [shown, setShown] = useState(false);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);
  const hideProjection = snapshots.length < 2 || !hasSufficientHistory(snapshots, sevenDaysAgoStr);

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

  if (hideProjection || !resp) return null;

  const sym = SYMBOL[displayCurrency] ?? "€";
  const year = new Date().getFullYear() + HORIZON_YEARS;
  const ratePct = `${Math.round(resp.rate * 100)}%`;

  const compact = (usd: number) => {
    const n = Math.abs(usd * getUsdRate(displayCurrency));
    if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
    if (n >= 1_000) return `${sym}${Math.round(n / 1_000)}K`;
    return `${sym}${Math.round(n)}`;
  };

  // The figure is explicitly framed as an assumption (the route's rate is a
  // labelled constant, not something fitted to the user's own history) — never
  // implied to be "your pace".
  const projected = compact(resp.trajectory.mid);
  const statement = (
    <>
      Assuming ~{ratePct}/yr, you could reach about{" "}
      <span style={{ fontStyle: "normal", fontWeight: 600 }}>{projected}</span>{" "}
      by {year}.{" "}
    </>
  );
  const clause = "See what moves it";
  const aria = `Assuming ~${ratePct} per year, you could reach about ${projected} by ${year}. Explore what moves your projection.`;

  return (
    <ScenarioCueLine
      statement={statement}
      clause={clause}
      ariaLabel={aria}
      onActivate={onExplore}
      telemetryTemplate="projection_teaser"
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(3px)",
        transition: "opacity 0.7s ease, transform 0.7s ease",
      }}
    />
  );
}
