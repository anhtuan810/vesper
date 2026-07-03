import type { CSSProperties } from "react";
import type { VitalGrade } from "@/lib/vitals/grade";

// The vital letter grade (A–D) as real ink: solid tone fill with a soft halo
// ring in the same tone. --on-accent flips with the theme (near-white on
// light, near-black on dark, where the tone colours themselves are light), so
// the letter stays high-contrast in both themes. One component for every
// surface that shows a grade — the mobile fold rail, the desktop Vitals cards
// and the Overview's vitals row — so the mark reads identically everywhere.
const GRADE_COLORS: Record<VitalGrade["tone"], { fill: string; halo: string }> = {
  good: { fill: "var(--positive)", halo: "var(--positive-soft)" },
  warn: { fill: "var(--amber)", halo: "var(--amber-soft)" },
  bad: { fill: "var(--negative)", halo: "var(--negative-soft)" },
};

export function GradeChip({
  letter,
  tone,
  size = 26,
  style,
}: {
  letter: string;
  tone: VitalGrade["tone"];
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-label={`Grade ${letter}`}
      style={{
        flex: "none",
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.35),
        background: GRADE_COLORS[tone].fill,
        color: "var(--on-accent)",
        boxShadow: `0 0 0 ${size >= 24 ? 3 : 2.5}px ${GRADE_COLORS[tone].halo}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-ui)",
        fontSize: Math.round(size * 0.5),
        fontWeight: 700,
        lineHeight: 1,
        ...style,
      }}
    >
      {letter}
    </span>
  );
}
