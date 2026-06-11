"use client";

import { useRef, useEffect, useCallback, type ReactNode } from "react";

interface SwipeCarouselProps<T> {
  items: T[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  renderItem: (item: T, index: number) => ReactNode;
  getKey?: (item: T, index: number) => string | number;
}

// Horizontal snap-scroll carousel — one full-width slide per item. Scroll
// position and `activeIndex` stay in sync both ways: swiping updates
// `activeIndex` (via onActiveIndexChange), and an external `activeIndex`
// change (e.g. a CarouselDots tap) scrolls the track to match.
export function SwipeCarousel<T,>({ items, activeIndex, onActiveIndexChange, renderItem, getKey }: SwipeCarouselProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const target = activeIndex * el.clientWidth;
    if (Math.abs(el.scrollLeft - target) > 2) {
      el.scrollTo({ left: target, behavior: "smooth" });
    }
  }, [activeIndex]);

  const handleScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (index !== activeIndex) onActiveIndexChange(index);
  }, [activeIndex, onActiveIndexChange]);

  return (
    <div
      ref={trackRef}
      onScroll={handleScroll}
      className="no-scrollbar"
      style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory" }}
    >
      {items.map((item, i) => (
        <div key={getKey ? getKey(item, i) : i} style={{ flex: "0 0 100%", minWidth: 0, scrollSnapAlign: "start" }}>
          {renderItem(item, i)}
        </div>
      ))}
    </div>
  );
}

// Tappable dot indicators, synced to a SwipeCarousel's activeIndex. Renders
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
