"use client";

// Tappable dot indicators, synced to a swipe carousel's activeIndex. Renders
// nothing for 0 or 1 items — a single slide needs no indicator.
export function CarouselDots({ count, activeIndex, onSelect }: { count: number; activeIndex: number; onSelect: (index: number) => void }) {
  if (count <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Go to item ${i + 1} of ${count}`}
          aria-current={i === activeIndex}
          onClick={() => onSelect(i)}
          style={{
            width: 5, height: 5, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer",
            background: i === activeIndex ? "var(--accent-text)" : "var(--border)",
          }}
        />
      ))}
    </div>
  );
}
