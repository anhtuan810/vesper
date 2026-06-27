"use client";

import { type Perspective } from "@/lib/vitals/perspective";
import { ordinalSuffix } from "@/lib/utils";

function formatCurrency(eur: number, displayCurrency: string): string {
  const sym = displayCurrency.toUpperCase() === "EUR" ? "€" : "$";
  if (eur >= 1_000_000) return `${sym}${(eur / 1_000_000).toFixed(1)}M`;
  if (eur >= 1_000) return `${sym}${Math.round(eur / 1_000)}k`;
  return `${sym}${Math.round(eur)}`;
}

function formatFull(eur: number, displayCurrency: string): string {
  return eur.toLocaleString("en-US", {
    style: "currency",
    currency: displayCurrency.toUpperCase(),
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

function youMarkerX(netWorthEur: number): number {
  const x = (Math.log10(netWorthEur / 1000) / Math.log10(10000)) * 310 + 15;
  return Math.max(15, Math.min(325, x));
}

// interpolatePercentile caps every branch at 99.9 — never round a 99.x figure
// up to the impossible "100th"/"100%". Below 99, show a whole number; at or
// above 99, keep one decimal (e.g. "99.9th").
function formatPercentile(pct: number): string {
  return pct >= 99 ? pct.toFixed(1) : String(Math.round(pct));
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
        border: "0.5px solid rgba(151,112,61,0.20)",
        borderRadius: 14,
        padding: "20px 18px 18px",
        marginBottom: 24,
      }}
    >
      {/* Synthesis sentence — visual lead */}
      <div
        style={{
          fontFamily: "var(--serif)",
          fontSize: 15,
          fontStyle: "italic",
          lineHeight: 1.5,
          color: "var(--text)",
          marginBottom: 6,
          letterSpacing: "-0.003em",
        }}
      >
        You sit above <em style={{ fontWeight: 600 }}>{euPct}%</em> of EU
        households and <em style={{ fontWeight: 600 }}>{worldPct}%</em>{" "}
        globally — a position most reach only after decades of compounding.
      </div>

      {/* Net worth — quiet secondary line */}
      <div
        style={{
          fontSize: 13,
          color: "var(--text-dim)",
          marginBottom: 18,
          fontFeatureSettings: "'tnum'",
        }}
      >
        {nwFull} · your wealth today
      </div>

      {/* Wealth distribution chart */}
      <div
        style={{
          background: "var(--perspective-panel)",
          borderRadius: 10,
          padding: "16px 10px 12px",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--accent-deep)",
            opacity: 0.7,
            letterSpacing: "var(--tracking-label)",
            textTransform: "uppercase",
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
              <stop offset="0%" stopColor="#97703D" stopOpacity="0.05" />
              <stop offset="50%" stopColor="#97703D" stopOpacity="0.10" />
              <stop offset="80%" stopColor="#97703D" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#97703D" stopOpacity="0.04" />
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
          <text x="15" y="88" textAnchor="middle" fontSize="9" fill="var(--text-faint)" fontFamily="system-ui">€1k</text>
          <text x="88" y="88" textAnchor="middle" fontSize="9" fill="var(--text-faint)" fontFamily="system-ui">€10k</text>
          <text x="160" y="88" textAnchor="middle" fontSize="9" fill="var(--text-faint)" fontFamily="system-ui">€100k</text>
          <text x="232" y="88" textAnchor="middle" fontSize="9" fill="var(--text-faint)" fontFamily="system-ui">€1M</text>
          <text x="305" y="88" textAnchor="middle" fontSize="9" fill="var(--text-faint)" fontFamily="system-ui">€10M</text>
          {/* Cohort markers */}
          <line x1="88" y1="60" x2="88" y2="72" stroke="var(--text-dim)" strokeWidth="0.7" strokeDasharray="2 2" opacity="0.5" />
          <text x="88" y="56" textAnchor="middle" fontSize="8.5" fill="var(--text-dim)" fontFamily="system-ui">World median</text>
          <line x1="155" y1="48" x2="155" y2="72" stroke="var(--text-dim)" strokeWidth="0.7" strokeDasharray="2 2" opacity="0.5" />
          <text x="148" y="44" textAnchor="middle" fontSize="8.5" fill="var(--text-dim)" fontFamily="system-ui">EU med</text>
          <line x1="180" y1="28" x2="180" y2="72" stroke="var(--text-dim)" strokeWidth="0.7" strokeDasharray="2 2" opacity="0.5" />
          <text x="184" y="24" textAnchor="middle" fontSize="8.5" fill="var(--text-dim)" fontFamily="system-ui">NL med</text>
          <line x1="232" y1="12" x2="232" y2="72" stroke="var(--text-dim)" strokeWidth="0.7" strokeDasharray="2 2" opacity="0.5" />
          <text x="232" y="8" textAnchor="middle" fontSize="8.5" fill="var(--text-dim)" fontFamily="system-ui">World top 1%</text>
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
            fontSize="9.5"
            fill="var(--accent-deep)"
            fontWeight="600"
            fontFamily="system-ui"
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
              borderTop: "0.5px solid rgba(151,112,61,0.16)",
            }}
          >
            {/* Left block */}
            <div style={{ flex: "0 0 72px" }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text)",
                  letterSpacing: "0.03em",
                }}
              >
                {row.label}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {row.sublabel}
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ flex: 1, padding: "0 12px" }}>
              <div
                style={{
                  height: 3,
                  background: "rgba(151,112,61,0.18)",
                  borderRadius: 999,
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
                    borderRadius: 999,
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
                    boxShadow: "0 0 0 0.5px rgba(151,112,61,0.3)",
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 11,
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
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 19,
                  fontWeight: 600,
                  color: "var(--hero)",
                  lineHeight: 1,
                  fontFeatureSettings: "'tnum'",
                }}
              >
                {formatPercentile(row.percentile)}
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {ordinalSuffix(Math.round(row.percentile))}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-faint)",
                  letterSpacing: "0.04em",
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
              borderRadius: 999,
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
            <span style={{ fontSize: 12, color: "var(--text)" }}>
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
          fontFamily: "var(--serif)",
          fontSize: 13,
          fontStyle: "italic",
          lineHeight: 1.5,
          color: "var(--text-dim)",
          marginTop: 16,
          paddingTop: 14,
          borderTop: "0.5px solid rgba(151,112,61,0.16)",
        }}
      >
        Most of the world manages without an investment portfolio at all.
        Worth holding lightly.
      </div>
    </div>
  );
}
