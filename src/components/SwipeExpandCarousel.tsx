"use client";

import { useState, useRef, useLayoutEffect, useCallback, type ReactNode } from "react";
import { CarouselDots } from "@/components/SwipeCarousel";

const CHEVRON_PROPS = {
  viewBox: "0 0 256 256", fill: "none", stroke: "currentColor",
  strokeWidth: 20, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

export interface SwipeExpandItem {
  title: string;
  detail?: string | null;
}

interface SwipeExpandCarouselProps {
  /** Leading icon, fixed at the left of the row (e.g. BulbIcon, ActivityIcon). */
  icon: ReactNode;
  items: SwipeExpandItem[];
  getKey?: (item: SwipeExpandItem, index: number) => string | number;
  /** When provided, the expanded detail renders as a button that fires this
   *  (e.g. InsightBand's tap-to-chat). Without it, the detail is a plain,
   *  inert div — used by Markets. */
  onDetailClick?: (item: SwipeExpandItem, index: number) => void;
}

// Shared "Worth knowing" / "Markets" presentation: one flex row — a leading
// icon, a full-width scroll-snap carousel of collapsible title/detail slides
// (flex: 1), and inline swipe dots on the right. The carousel's height
// transitions to match the active slide (headline-only when collapsed,
// headline + detail when expanded). Borderless throughout — no box, border,
// background, or shadow on items or wrappers.
export function SwipeExpandCarousel({ icon, items, getKey, onDetailClick }: SwipeExpandCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const trackRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  const safeActiveIndex = Math.min(activeIndex, Math.max(0, items.length - 1));

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });

  // Sync the wrapper's height to the active slide's natural height every
  // render, so the carousel grows/shrinks smoothly between a slide's
  // collapsed (headline-only) and expanded (headline + detail) states.
  useLayoutEffect(() => {
    const slide = slideRefs.current[safeActiveIndex];
    const wrapper = wrapperRef.current;
    if (!slide || !wrapper) return;
    wrapper.style.height = `${slide.offsetHeight}px`;
  });

  const handleScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (index !== activeIndex) setActiveIndex(index);
  }, [activeIndex]);

  const goTo = (index: number) => {
    setActiveIndex(index);
    const el = trackRef.current;
    if (el) el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  };

  if (items.length === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      {icon}
      <div ref={wrapperRef} style={{ flex: 1, minWidth: 0, overflow: "hidden", transition: "height 0.2s ease" }}>
        <div
          ref={trackRef}
          onScroll={handleScroll}
          className="no-scrollbar"
          style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory" }}
        >
          {items.map((item, i) => {
            const isOpen = expanded.has(i);
            return (
              <div key={getKey ? getKey(item, i) : i} style={{ flex: "0 0 100%", minWidth: 0, scrollSnapAlign: "start" }}>
                <div ref={(el) => { slideRefs.current[i] = el; }}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggle(i)}
                    style={{
                      display: "block", width: "100%",
                      textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0,
                    }}
                  >
                    {/* Title carries the expand chevron inline, right after the
                        text, so a short headline (e.g. "Hosingenhof 19") reads
                        as a tight unit instead of stranding the chevron at the
                        far edge. The swipe dots (row-level, right) stay put. */}
                    <span
                      className="font-serif"
                      style={{ fontSize: 13, fontStyle: "italic", lineHeight: 1.45, color: "var(--text)" }}
                    >
                      {item.title}
                      {item.detail && (
                        <svg
                          {...CHEVRON_PROPS}
                          aria-hidden="true"
                          style={{
                            width: 10, height: 10, color: "var(--accent-text)", opacity: 0.5,
                            marginLeft: 6, display: "inline-block", verticalAlign: "baseline",
                            transition: "transform 0.15s",
                            transform: isOpen ? "rotate(90deg)" : undefined,
                          }}
                        >
                          <polyline points="96 48 176 128 96 208" />
                        </svg>
                      )}
                    </span>
                  </button>
                  {isOpen && item.detail && (
                    onDetailClick ? (
                      <button
                        type="button"
                        onClick={() => onDetailClick(item, i)}
                        style={{
                          display: "block", width: "100%", textAlign: "left", marginTop: 4,
                          background: "none", border: "none", cursor: "pointer", padding: 0,
                          fontSize: 13, lineHeight: 1.4, color: "var(--text)", opacity: 0.6,
                        }}
                      >
                        {item.detail}
                      </button>
                    ) : (
                      <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.4, color: "var(--text)", opacity: 0.6 }}>
                        {item.detail}
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {items.length > 1 && (
        <div style={{ marginTop: 3, flexShrink: 0 }}>
          <CarouselDots count={items.length} activeIndex={safeActiveIndex} onSelect={goTo} />
        </div>
      )}
    </div>
  );
}
