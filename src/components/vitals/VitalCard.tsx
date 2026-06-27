import type { ReactNode } from "react";
import { SuggestionStrip } from "./SuggestionStrip";
import type { SuggestionStripProps } from "./SuggestionStrip";

type HeroClass = "positive" | "negative" | "default";

export interface VitalCardProps {
  eyebrow: string;
  heroNumber: string;
  heroNumberClass?: HeroClass;
  subLine: string;
  rightStat?: { label: string; value: string };
  benchLine?: string;
  suggestion?: Pick<SuggestionStripProps, "variant" | "label" | "body">;
  /** Desktop grid only: fill the row height and pin the suggestion strip to the
   *  bottom so strips align across cards with differing chart heights. */
  fillHeight?: boolean;
  children: ReactNode;
}

// Stat numbers stay a single ink tone for a calm, uniform read; only a genuine
// negative reads red. ("Positive/healthy" status is still conveyed by the
// card's bands, sub-line and suggestion strip — not by recoloring the number.)
const HERO_COLOR: Record<HeroClass, string> = {
  default:  "var(--hero)",
  negative: "var(--negative)",
  positive: "var(--hero)",
};

export function VitalCard({
  eyebrow,
  heroNumber,
  heroNumberClass = "default",
  subLine,
  rightStat,
  benchLine,
  suggestion,
  fillHeight = false,
  children,
}: VitalCardProps) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "0.5px solid var(--border)",
        borderRadius: 14,
        padding: "14px 15px 12px",
        marginBottom: 10,
        ...(fillHeight ? { display: "flex", flexDirection: "column", height: "100%" } : {}),
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 11,
          gap: 12,
        }}
      >
        {/* Left: eyebrow → hero+subline */}
        <div>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 500,
              fontFamily: "var(--mono)", letterSpacing: "var(--tracking-label)",
              textTransform: "uppercase",
              color: "var(--text-faint)",
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              marginTop: 6,
            }}
          >
            <div
              style={{
                fontFamily: "var(--serif)",
                fontSize: "30px",
                fontWeight: 600,
                letterSpacing: "-0.022em",
                color: HERO_COLOR[heroNumberClass],
                lineHeight: 1,
                fontFeatureSettings: "'tnum'",
              }}
            >
              {heroNumber}
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-dim)",
                fontFeatureSettings: "'tnum'",
              }}
            >
              {subLine}
            </div>
          </div>
        </div>

        {/* Right stat */}
        {rightStat && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 3,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-faint)",
                fontFamily: "var(--mono)", letterSpacing: "var(--tracking-label)",
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              {rightStat.label}
            </span>
            <span
              style={{
                fontSize: "15px",
                fontWeight: 500,
                color: "var(--text)",
                fontFeatureSettings: "'tnum'",
                lineHeight: 1,
              }}
            >
              {rightStat.value}
            </span>
          </div>
        )}
      </div>

      {/* Chart slot */}
      {children}

      {/* Bench line */}
      {benchLine && (
        <div
          style={{
            fontSize: "11px",
            color: "var(--text-dim)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 0 2px",
          }}
        >
          <span
            style={{
              display: "block",
              width: 10,
              height: 1,
              background: "var(--text-faint)",
              flexShrink: 0,
            }}
          />
          <span dangerouslySetInnerHTML={{ __html: benchLine }} />
        </div>
      )}

      {/* Suggestion strip — pinned to the card bottom in the desktop grid */}
      {suggestion && (
        fillHeight ? (
          <div style={{ marginTop: "auto" }}>
            <SuggestionStrip
              variant={suggestion.variant}
              label={suggestion.label}
              body={suggestion.body}
            />
          </div>
        ) : (
          <SuggestionStrip
            variant={suggestion.variant}
            label={suggestion.label}
            body={suggestion.body}
          />
        )
      )}
    </div>
  );
}
