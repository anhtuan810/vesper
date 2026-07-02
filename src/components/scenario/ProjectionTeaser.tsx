"use client";

import { useState, useEffect, useRef } from "react";
import { SignalDropBox, ExpandChevron, SIGNAL_TEXT_STYLE } from "@/components/SwipeExpandCarousel";
import { useDisplayCurrency } from "@/lib/hooks";
import { ScenarioCueLine } from "@/components/scenario/ScenarioCueLine";
import { trackChipInteraction, trackChipImpression, markImpression } from "@/lib/chip-telemetry";
import type { SnapshotPoint } from "@/components/NetWorthChart";
import { hasSufficientHistory } from "@/lib/networth-history";
import { apiFetch } from "@/lib/api";

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
  /** Today's net worth in the display currency — same figure as the Portfolio
   *  hero (page.tsx's `netTotal`). The projection is anchored to this value
   *  directly so the two surfaces always agree to the unit, with no FX
   *  conversion of the projected figure (the route's `startUsd`/`trajectory`
   *  are USD-bridge values used only to derive a currency-free growth factor). */
  netTotal: number;
  /** "card": PortfolioSummaryCard's hero band — larger serif sentence, an
   *  emphasized figure, and a soft sage CTA, in place of the ambient
   *  ScenarioCueLine. Same fetch/figure logic either way; presentation only. */
  variant?: "card";
  /** "card" variant only: reports whether the teaser rendered something, so
   *  the card can show/hide its divider above the comment row in sync. */
  onVisibleChange?: (visible: boolean) => void;
}

export function ProjectionTeaser({ onExplore, snapshots, netTotal, variant, onVisibleChange }: ProjectionTeaserProps) {
  const displayCurrency = useDisplayCurrency();
  const [resp, setResp] = useState<ProjResp | null>(null);
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(false);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);
  const hideProjection = snapshots.length < 2 || !hasSufficientHistory(snapshots, sevenDaysAgoStr);

  // Bare fetch — state is only set in the async callback, never synchronously in
  // the effect body (keeps clear of react-hooks/set-state-in-effect).
  useEffect(() => {
    const ctrl = new AbortController();
    apiFetch("/api/scenarios/project", {
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

  // Reports whether this teaser renders anything, so PortfolioSummaryCard can
  // sync its divider above the comment row to the same hide-when-young rule.
  useEffect(() => {
    onVisibleChange?.(!hideProjection && !!resp);
  }, [hideProjection, resp, onVisibleChange]);

  // Card variant fires the same 'scenario_cue' impression telemetry as
  // ScenarioCueLine (default variant), keyed identically — a no-op for the
  // default variant, which gets its impression from ScenarioCueLine itself.
  const cardImpressionFired = useRef(false);
  useEffect(() => {
    if (variant !== "card" || hideProjection || !resp || cardImpressionFired.current) return;
    cardImpressionFired.current = true;
    if (markImpression("scenario_cue:projection_teaser:")) {
      trackChipImpression({ surface: "scenario_cue", chipType: "scenario", position: 0, labelTemplate: "projection_teaser" });
    }
  }, [variant, hideProjection, resp]);

  if (hideProjection || !resp) return null;

  const sym = SYMBOL[displayCurrency] ?? "€";
  const year = new Date().getFullYear() + HORIZON_YEARS;
  const ratePct = `${Math.round(resp.rate * 100)}%`;

  const compact = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${sym}${(abs / 1_000_000).toFixed(abs < 10_000_000 ? 1 : 0)}M`;
    if (abs >= 1_000) return `${sym}${Math.round(abs / 1_000)}K`;
    return `${sym}${Math.round(abs)}`;
  };

  // The route's startUsd/trajectory are USD-bridge figures; rather than convert
  // the projected USD figure back to the display currency (a second FX leg that
  // can drift from the hero's conversion), derive a currency-free growth factor
  // and apply it to today's already-correct display-currency net worth — the
  // exact figure the Portfolio hero shows.
  const growthFactor = resp.startUsd !== 0 ? resp.trajectory.mid / resp.startUsd : 1;

  // The figure is explicitly framed as an assumption (the route's rate is a
  // labelled constant, not something fitted to the user's own history) — never
  // implied to be "your pace".
  const projected = compact(netTotal * growthFactor);
  const statement = (
    <>
      Assuming ~{ratePct}/yr, you could reach about{" "}
      <span style={{ fontStyle: "normal", fontWeight: 600 }}>{projected}</span>{" "}
      by {year}.{" "}
    </>
  );
  const clause = "See what moves it";
  const aria = `Assuming ~${ratePct} per year, you could reach about ${projected} by ${year}. Explore what moves your projection.`;

  if (variant === "card") {
    const handleCardActivate = () => {
      trackChipInteraction({ surface: "scenario_cue", chipType: "scenario", position: 0, labelTemplate: "projection_teaser" });
      onExplore();
    };

    // The projection's cone edges, anchored to the same display-currency net
    // worth as the mid figure (identical growth-factor treatment).
    const lowFig = compact(netTotal * (resp.startUsd !== 0 ? resp.trajectory.low / resp.startUsd : 1));
    const highFig = compact(netTotal * (resp.startUsd !== 0 ? resp.trajectory.high / resp.startUsd : 1));

    // One line collapsed (title + inline chevron), a full-width drop-down box
    // expanded — the same anatomy as Worth knowing / Markets, hand-rolled here
    // because the projection isn't a carousel.
    return (
      <div style={{ padding: "var(--space-1) 0", opacity: shown ? 1 : 0, transform: shown ? "translateY(0)" : "translateY(3px)", transition: "opacity 0.7s ease, transform 0.7s ease" }}>
        <button
          type="button"
          aria-expanded={open}
          aria-label={aria}
          onClick={() => setOpen((v) => !v)}
          style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <span style={SIGNAL_TEXT_STYLE}>
            Assuming ~{ratePct}/yr, about{" "}
            <span style={{ fontWeight: 600 }}>{projected}</span>{" "}
            by <span style={{ fontWeight: 600 }}>{year}</span>.
            <ExpandChevron open={open} />
          </span>
        </button>
        {open && (
          <SignalDropBox
            detail={
              <>
                Between {lowFig} and {highFig}, depending on markets — the ~{ratePct} is
                an assumption, not a forecast.
              </>
            }
            trigger={{ label: clause, onActivate: handleCardActivate }}
          />
        )}
      </div>
    );
  }

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
