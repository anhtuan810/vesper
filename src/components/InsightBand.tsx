"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useInsight } from "@/lib/hooks";
import type { ReactNode } from "react";

function renderWithEmphasis(text: string): ReactNode {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) =>
    part.startsWith("*") && part.endsWith("*")
      ? <em key={i}>{part.slice(1, -1)}</em>
      : part
  );
}

function formatImpact(value: number): string {
  const abs = Math.abs(Math.round(value));
  return (value >= 0 ? "+" : "−") + "€" + abs.toLocaleString();
}

const SVG_PROPS = {
  viewBox: "0 0 256 256", fill: "none", stroke: "currentColor",
  strokeWidth: 20, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 500, letterSpacing: "0.18em",
  textTransform: "uppercase", color: "var(--accent-text)", opacity: 0.7,
};

const titleStyle: React.CSSProperties = {
  fontSize: 13, fontStyle: "italic", fontWeight: 400,
  lineHeight: 1.35, letterSpacing: "-0.005em", color: "var(--text)",
  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
  overflow: "hidden", fontVariationSettings: "'opsz' 18",
};

const DIVIDER = "1px solid color-mix(in srgb, var(--accent-text) 12%, transparent)";

/** Shared outer shell for both bands. `last` controls bottom margin. */
function Band({ label, last, children }: { label?: string; last?: boolean; children: ReactNode }) {
  return (
    <div
      className={`-mx-4 sm:-mx-8 ${last ? "mb-5" : "mb-2"}`}
      style={{ background: "var(--accent-soft)" }}
    >
      {label && (
        <div style={{ padding: "13px 16px 8px" }}>
          <div style={eyebrowStyle}>{label}</div>
        </div>
      )}
      {children}
    </div>
  );
}

export function InsightBand() {
  const { detail, portfolio, market, loading } = useInsight();
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // portfolio cards (up to 3 from detectors); fall back to single legacy sentence
  const portfolioCards = portfolio.slice(0, 3);
  const insightSentence = portfolioCards.length === 0 && detail
    ? ((detail.match(/[^.!?]+[.!?]+/g) ?? [detail]).map(s => s.trim()).filter(Boolean)[0] ?? null)
    : null;

  const hasTopBand = portfolioCards.length > 0 || !!insightSentence;

  if (loading) {
    return (
      <div className="-mx-4 sm:-mx-8 mb-5" style={{ padding: "14px 16px", background: "var(--accent-soft)" }}>
        <div style={{ height: 13, width: "68%", borderRadius: 3, background: "var(--accent-text)", opacity: 0.11 }} />
      </div>
    );
  }

  if (!hasTopBand && market.length === 0) return null;

  const hasMarket = market.length > 0;

  const portfolioCard = (sentence: string, key: string | number, last: boolean) => (
    <Band key={key} last={last}>
      <div style={{ padding: "9px 16px" }}>
        <div className="font-serif" style={{ ...titleStyle, WebkitLineClamp: 3 }}>
          {renderWithEmphasis(sentence)}
        </div>
      </div>
    </Band>
  );

  return (
    <>
      {/* ── Portfolio cards — each in its own Band, no label ── */}
      {portfolioCards.map((sentence, i) =>
        portfolioCard(sentence, i, i === portfolioCards.length - 1 && !hasMarket)
      )}
      {insightSentence && portfolioCard(insightSentence, "fallback", !hasMarket)}

      {/* ── MARKETS — up to 3 market news cards ── */}
      {hasMarket && (
        <Band label="Markets" last>
          {market.map((item) => {
            const id = item.id ?? item.title;
            const isOpen = expanded.has(id);
            return (
              <div key={id} style={{ borderTop: DIVIDER }}>
                <div
                  role="button"
                  tabIndex={0}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 16px", cursor: "pointer" }}
                  onClick={() => toggle(id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggle(id); }}
                >
                  <div className="font-serif" style={{ ...titleStyle, flex: 1, minWidth: 0 }}>
                    {item.title}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0, marginTop: 2 }}>
                    {item.impact_eur !== null && (
                      <span style={{
                        fontSize: 11, fontWeight: 500, letterSpacing: "-0.01em",
                        color: item.impact_eur >= 0 ? "var(--accent-text)" : "var(--text)",
                        opacity: item.impact_eur >= 0 ? 1 : 0.6,
                      }}>
                        {formatImpact(item.impact_eur)}
                      </span>
                    )}
                    <svg {...SVG_PROPS} style={{
                      width: 11, height: 11, color: "var(--accent-text)", opacity: 0.45,
                      flexShrink: 0, transition: "transform 0.15s",
                      transform: isOpen ? "rotate(90deg)" : undefined,
                    }}>
                      <polyline points="96 48 176 128 96 208" />
                    </svg>
                  </div>
                </div>

                {isOpen && (
                  <div
                    role="button"
                    tabIndex={0}
                    style={{ padding: "0 16px 10px", cursor: "pointer" }}
                    onClick={() => {
                      sessionStorage.setItem("volnar.insight.seed", `Tell me more about: ${item.title}`);
                      router.push("/chat?seed=insight&key=current");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        sessionStorage.setItem("volnar.insight.seed", `Tell me more about: ${item.title}`);
                        router.push("/chat?seed=insight&key=current");
                      }
                    }}
                  >
                    <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--text)", opacity: 0.6 }}>
                      {item.detail}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Band>
      )}
    </>
  );
}
