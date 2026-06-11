"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useInsight } from "@/lib/hooks";
import { BulbIcon } from "@/components/vitals/SuggestionStrip";
import { SwipeCarousel, CarouselDots } from "@/components/SwipeCarousel";
import type { ReactNode } from "react";

function renderWithEmphasis(text: string): ReactNode {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) =>
    part.startsWith("*") && part.endsWith("*")
      ? <em key={i}>{part.slice(1, -1)}</em>
      : part
  );
}

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

/** Shared outer shell for both bands. `last` controls bottom margin. */
function Band({ label, last, children }: { label?: string; last?: boolean; children: ReactNode }) {
  return (
    <div
      className={`-mx-4 md:-mx-8 ${last ? "mb-5" : "mb-2"}`}
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

export function InsightBand({ variant, onVisibleChange }: { variant?: "card"; onVisibleChange?: (visible: boolean) => void } = {}) {
  const { detail, portfolio, insights, loading } = useInsight();
  const router = useRouter();
  const [activeInsight, setActiveInsight] = useState(0);

  // Keep the carousel index in range as the insights list changes (e.g. after
  // a portfolio mutation regenerates the cards) — derived, not stored, so a
  // shrinking list never leaves a stale out-of-range index.
  const safeActiveInsight = Math.min(activeInsight, Math.max(0, insights.length - 1));

  // portfolio cards (up to 3 from detectors); fall back to single legacy sentence
  const portfolioCards = portfolio.slice(0, 3);
  const insightSentence = portfolioCards.length === 0 && detail
    ? ((detail.match(/[^.!?]+[.!?]+/g) ?? [detail]).map(s => s.trim()).filter(Boolean)[0] ?? null)
    : null;

  const hasTopBand = portfolioCards.length > 0 || !!insightSentence;

  // Card variant reports whether the insight line actually rendered, so the
  // summary card can place its hairline dividers only between visible slots
  // (no stray divider when this row is absent). No-op for the default variant.
  useEffect(() => {
    onVisibleChange?.(!loading && insights.length > 0);
  }, [loading, insights.length, onVisibleChange]);

  // "card" variant: PortfolioSummaryCard's "worth knowing" callout — the same
  // insight sentence as a sage Vitals SuggestionStrip-style box, tap-to-/chat
  // preserved. Same data path (useInsight, detector selection); presentation
  // only.
  if (variant === "card") {
    if (loading) {
      return (
        <div style={{ padding: "9px 0" }}>
          <div style={{ height: 9, width: 90, borderRadius: 3, background: "var(--text-faint)", opacity: 0.15, marginBottom: 8 }} />
          <div style={{ height: 13, width: "75%", borderRadius: 3, background: "var(--text-faint)", opacity: 0.15 }} />
        </div>
      );
    }

    if (insights.length === 0) return null;

    return (
      <div style={{ padding: "7px 0" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <BulbIcon color="var(--text-faint)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <SwipeCarousel
              items={insights}
              activeIndex={safeActiveInsight}
              onActiveIndexChange={setActiveInsight}
              renderItem={(sentence) => (
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.setItem("volnar.insight.seed", `Tell me more about: ${sentence}`);
                    router.push("/chat?seed=insight&key=current");
                  }}
                  className="font-serif worth-knowing"
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                    fontStyle: "italic", fontSize: 13, lineHeight: 1.45, color: "var(--text)",
                  }}
                >
                  {renderWithEmphasis(sentence)}
                </button>
              )}
            />
          </div>
          {insights.length > 1 && (
            <div style={{ marginTop: 6, flexShrink: 0 }}>
              <CarouselDots count={insights.length} activeIndex={safeActiveInsight} onSelect={setActiveInsight} />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="-mx-4 md:-mx-8 mb-5" style={{ padding: "14px 16px", background: "var(--accent-soft)" }}>
        <div style={{ height: 13, width: "68%", borderRadius: 3, background: "var(--accent-text)", opacity: 0.11 }} />
      </div>
    );
  }

  if (!hasTopBand) return null;

  const allPortfolioSentences = portfolioCards.length > 0
    ? portfolioCards
    : insightSentence ? [insightSentence] : [];

  return (
    <>
      {/* ── Portfolio cards — merged into one Band with paragraph spacing ── */}
      {allPortfolioSentences.length > 0 && (
        <Band last>
          <div style={{ padding: "9px 16px" }}>
            {allPortfolioSentences.map((sentence, i) => (
              <div
                key={i}
                className="font-serif"
                style={{ ...titleStyle, WebkitLineClamp: 3, marginTop: i > 0 ? 8 : 0 }}
              >
                {renderWithEmphasis(sentence)}
              </div>
            ))}
          </div>
        </Band>
      )}
    </>
  );
}
