"use client";

import { type Perspective } from "@/lib/vitals/perspective";
import { ordinalSuffix } from "@/lib/utils";

function formatCurrency(eur: number, displayCurrency: string): string {
  const sym = displayCurrency.toUpperCase() === "EUR" ? "€" : "$";
  if (eur >= 1_000_000) return `${sym}${(eur / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (eur >= 1_000) return `${sym}${Math.round(eur / 1_000)}k`;
  return `${sym}${Math.round(eur)}`;
}

function formatFull(eur: number, displayCurrency: string): string {
  // nl-NL number grammar (period thousands) + a manual symbol, matching the
  // app's formatMoney everywhere else — never en-US commas.
  const sym = displayCurrency.toUpperCase() === "EUR" ? "€" : "$";
  const n = new Intl.NumberFormat("nl-NL", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(eur));
  return `${sym}${n}`;
}

function youMarkerX(netWorthEur: number): number {
  const x = (Math.log10(netWorthEur / 1000) / Math.log10(10000)) * 310 + 15;
  return Math.max(15, Math.min(325, x));
}

// interpolatePercentile caps every branch at 99.9 — never round a 99.x figure
// up to the impossible "100th"/"100%". Below 99, show a whole number; at or
// above 99, keep one decimal (e.g. "99.9th").
function formatPercentile(pct: number): string {
  return pct >= 99 ? pct.toFixed(1).replace(".", ",") : String(Math.round(pct));
}

export function PerspectiveCard({
  data,
  displayCurrency,
}: {
  data: Perspective;
  displayCurrency: string;
}) {
  const euRow = data.rows.find((r) => r.region === "EU");
  const worldRow = data.rows.find((r) => r.region === "WORLD");
  const euPct = euRow ? formatPercentile(euRow.percentile) : "0";
  const worldPct = worldRow ? formatPercentile(worldRow.percentile) : "0";

  const markerX = youMarkerX(data.netWorthEur);
  const nwShort = formatCurrency(data.netWorthEur, displayCurrency);
  const nwFull = formatFull(data.netWorthEur, displayCurrency);

  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, var(--perspective-card-grad-start) 0%, var(--perspective-card-grad-end) 100%)",
        border: "0.5px solid var(--border-strong)",
        borderRadius: "var(--radius-lg)",
        padding: "20px 18px 18px",
        marginBottom: 24,
      }}
    >
      {/* Synthesis sentence — visual lead */}
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-body)",
          fontStyle: "italic",
          lineHeight: "var(--lh-body)",
          color: "var(--text)",
          marginBottom: 6,
        }}
      >
        You sit above <em style={{ fontWeight: 600 }}>{euPct}%</em> of EU
        households and <em style={{ fontWeight: 600 }}>{worldPct}%</em>{" "}
        globally — a position most reach only after decades of compounding.
      </div>

      {/* Net worth — the card's signature figure; the label is a quiet caption */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <span
          className="tnum"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-metric)",
            fontWeight: 600,
            letterSpacing: "var(--tracking-hero)",
            color: "var(--hero)",
            lineHeight: 1,
          }}
        >
          {nwFull}
        </span>
        <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-dim)" }}>
          your wealth today
        </span>
      </div>

      {/* Wealth distribution chart */}
      <div
        style={{
          background: "var(--perspective-panel)",
          borderRadius: "var(--radius-md)",
          padding: "16px 10px 12px",
          marginBottom: 16,
        }}
      >
        <div
          className="eyebrow"
          style={{
            color: "var(--accent-deep)",
            opacity: 0.7,
            marginBottom: 10,
            padding: "0 6px",
          }}
        >
          Wealth distribution · log scale
        </div>
        <svg
          viewBox="0 0 340 110"
          style={{ width: "100%", height: 110, display: "block" }}
        >
          <defs>
            <linearGradient id="dens3" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.05" />
              <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.10" />
              <stop offset="80%" stopColor="var(--accent)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.04" />
            </linearGradient>
          </defs>
          {/* Density fill */}
          <path
            d="M15,68 C50,66 80,60 115,52 C145,44 175,42 205,38 C225,36 245,42 265,52 C285,62 305,68 325,72 L325,72 L15,72 Z"
            fill="url(#dens3)"
            opacity="0.85"
          />
          {/* Density curve */}
          <path
            d="M15,68 C50,66 80,60 115,52 C145,44 175,42 205,38 C225,36 245,42 265,52 C285,62 305,68 325,72"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.3"
            opacity="0.5"
          />
          {/* X axis */}
          <line x1="15" y1="72" x2="325" y2="72" stroke="var(--text-dim)" strokeWidth="0.6" />
          <line x1="15" y1="72" x2="15" y2="76" stroke="var(--text-faint)" strokeWidth="0.6" />
          <line x1="88" y1="72" x2="88" y2="76" stroke="var(--text-faint)" strokeWidth="0.6" />
          <line x1="160" y1="72" x2="160" y2="76" stroke="var(--text-faint)" strokeWidth="0.6" />
          <line x1="232" y1="72" x2="232" y2="76" stroke="var(--text-faint)" strokeWidth="0.6" />
          <line x1="305" y1="72" x2="305" y2="76" stroke="var(--text-faint)" strokeWidth="0.6" />
          <text x="15" y="88" textAnchor="middle" fontSize="11" fill="var(--text-faint)">€1k</text>
          <text x="88" y="88" textAnchor="middle" fontSize="11" fill="var(--text-faint)">€10k</text>
          <text x="160" y="88" textAnchor="middle" fontSize="11" fill="var(--text-faint)">€100k</text>
          <text x="232" y="88" textAnchor="middle" fontSize="11" fill="var(--text-faint)">€1M</text>
          <text x="305" y="88" textAnchor="middle" fontSize="11" fill="var(--text-faint)">€10M</text>
          {/* Cohort markers */}
          <line x1="88" y1="60" x2="88" y2="72" stroke="var(--text-dim)" strokeWidth="0.7" strokeDasharray="2 2" opacity="0.5" />
          <text x="88" y="56" textAnchor="middle" fontSize="11" fill="var(--text-dim)">World median</text>
          <line x1="155" y1="48" x2="155" y2="72" stroke="var(--text-dim)" strokeWidth="0.7" strokeDasharray="2 2" opacity="0.5" />
          <text x="148" y="44" textAnchor="middle" fontSize="11" fill="var(--text-dim)">EU med</text>
          <line x1="180" y1="28" x2="180" y2="72" stroke="var(--text-dim)" strokeWidth="0.7" strokeDasharray="2 2" opacity="0.5" />
          <text x="184" y="24" textAnchor="middle" fontSize="11" fill="var(--text-dim)">NL med</text>
          <line x1="232" y1="12" x2="232" y2="72" stroke="var(--text-dim)" strokeWidth="0.7" strokeDasharray="2 2" opacity="0.5" />
          <text x="232" y="8" textAnchor="middle" fontSize="11" fill="var(--text-dim)">World top 1%</text>
          {/* "You" marker — dynamic */}
          <line
            x1={markerX}
            y1="72"
            x2={markerX}
            y2="102"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeDasharray="2 2"
            opacity="0.6"
          />
          <circle
            cx={markerX}
            cy="72"
            r="7"
            fill="none"
            stroke="var(--accent)"
            strokeOpacity="0.28"
            strokeWidth="2"
          />
          <circle cx={markerX} cy="72" r="4" fill="var(--accent)" />
          <text
            x={markerX}
            y="108"
            textAnchor="middle"
            fontSize="11"
            fill="var(--accent-deep)"
            fontWeight="600"
          >
            you · {nwShort}
          </text>
        </svg>
      </div>

      {/* Three cohort rows */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {data.rows.map((row) => (
          <div
            key={row.region}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "11px 0",
              borderTop: "0.5px solid var(--border-strong)",
            }}
          >
            {/* Left block */}
            <div style={{ flex: "0 0 72px" }}>
              <div
                style={{
                  fontSize: "var(--fs-body)",
                  fontFamily: "var(--font-ui)",
                  fontWeight: 500,
                  lineHeight: 1.2,
                  color: "var(--text)",
                }}
              >
                {row.label}
              </div>
              <div style={{ fontSize: "var(--fs-caption)", color: "var(--text-dim)" }}>
                {row.sublabel}
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ flex: 1, padding: "0 12px" }}>
              <div
                style={{
                  height: 3,
                  background: "var(--accent-soft)",
                  borderRadius: "var(--radius-pill)",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    height: "100%",
                    width: `${row.percentile}%`,
                    background: "var(--accent)",
                    borderRadius: "var(--radius-pill)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: `${row.percentile}%`,
                    top: -3,
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    border: "2px solid var(--perspective-dot-border)",
                    transform: "translateX(-50%)",
                    boxShadow: "0 0 0 0.5px color-mix(in srgb, var(--accent) 30%, transparent)",
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: "var(--fs-caption)",
                  color: "var(--text-faint)",
                  marginTop: 6,
                }}
              >
                {row.contextLine}
              </div>
            </div>
            {/* Percentile number */}
            <div style={{ flex: "0 0 54px", textAlign: "right" }}>
              <div
                className="tnum"
                style={{
                  fontSize: "var(--fs-title)",
                  fontWeight: 600,
                  color: "var(--hero)",
                  lineHeight: "var(--lh-tight)",
                }}
              >
                {formatPercentile(row.percentile)}
                <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-dim)" }}>
                  {ordinalSuffix(Math.round(row.percentile))}
                </span>
              </div>
              <div
                className="eyebrow"
                style={{
                  marginTop: 2,
                }}
              >
                percentile
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Trajectory chip — only if data.trajectory is not null. The direction
          word and arrow follow the sign; the magnitude carries no minus sign. */}
      {data.trajectory != null && (() => {
        const pts = data.trajectory.pointsThisYear;
        const magnitude = Math.abs(pts);
        const direction = pts > 0 ? "up" : pts < 0 ? "down" : "flat";
        return (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "7px 11px",
              background: "var(--perspective-chip-bg)",
              borderRadius: "var(--radius-pill)",
              marginTop: 14,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent-deep)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 11, height: 11 }}
            >
              {direction === "up" && (
                <>
                  <path d="M3 17l6-6 4 4 8-9" />
                  <path d="M14 6h7v7" />
                </>
              )}
              {direction === "down" && (
                <>
                  <path d="M3 7l6 6 4-4 8 9" />
                  <path d="M14 18h7v-7" />
                </>
              )}
              {direction === "flat" && <path d="M5 12h14" />}
            </svg>
            <span style={{ fontSize: "var(--fs-caption)", color: "var(--text)" }}>
              {direction === "flat" ? (
                <>No change in {data.trajectory.region} this year</>
              ) : (
                <>
                  {direction === "up" ? "Up" : "Down"}{" "}
                  <strong style={{ fontWeight: 600 }}>
                    {magnitude} percentile {magnitude === 1 ? "point" : "points"}
                  </strong>{" "}
                  in {data.trajectory.region} this year
                </>
              )}
            </span>
          </div>
        );
      })()}

      {/* Closing italic line */}
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-body)",
          fontStyle: "italic",
          lineHeight: "var(--lh-body)",
          color: "var(--text-dim)",
          marginTop: 16,
          paddingTop: 14,
          borderTop: "0.5px solid var(--border-strong)",
        }}
      >
        Most of the world manages without an investment portfolio at all.
        Worth holding lightly.
      </div>
    </div>
  );
}
