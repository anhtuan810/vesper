"use client";

import { useState, useRef, useLayoutEffect, useEffect, useCallback, type ReactNode } from "react";
import { CarouselDots } from "@/components/SwipeCarousel";

const CHEVRON_PROPS = {
  viewBox: "0 0 256 256", fill: "none", stroke: "currentColor",
  strokeWidth: 20, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

export interface SwipeExpandItem {
  title: string;
  detail?: string | null;
  /** Quiet tabular figure shown next to the dots while this slide is active
   *  (e.g. Markets' "≈ +€85" portfolio impact). */
  aside?: string | null;
  /** The row's one trigger sentence — a gold clause at the foot of the
   *  expanded box that hands off to chat with a pre-made, content-fitting
   *  question. */
  trigger?: { label: string; onActivate: () => void } | null;
}

// ── The one signal-row family (the pulse rows at the top of Vitals) ──────────
// Every row — Pulse, projection, Worth knowing, Markets — shares this text
// spec, so the whole block reads as one design from one source: the same
// italic display voice (Inter) the rest of Volnar uses — Vitals must not
// read as a different app. Figures differ by gold colour only, never font.
export const SIGNAL_TEXT_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontStyle: "italic",
  fontSize: "var(--fs-body)",
  lineHeight: "var(--lh-body)",
  color: "var(--text)",
};

// The trigger clause — one gold spoken sentence, the row's single action.
export const TRIGGER_TEXT_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontStyle: "italic",
  fontSize: "var(--fs-body)",
  lineHeight: "var(--lh-body)",
  color: "var(--accent-text)",
};

// The expanded content under a row: plain text, no box chrome — the detail in
// dim ink, the trigger clause in gold beneath it, flush with the row's left
// edge.
export function SignalDropBox({
  detail,
  trigger,
}: {
  detail?: ReactNode;
  trigger?: { label: string; onActivate: () => void } | null;
}) {
  if (!detail && !trigger) return null;
  return (
    <div style={{ marginTop: 4, marginBottom: 2 }}>
      {detail && (
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontSize: "var(--fs-body)",
            lineHeight: "var(--lh-body)",
            color: "var(--text-dim)",
          }}
        >
          {detail}
        </div>
      )}
      {trigger && (
        <button
          type="button"
          onClick={trigger.onActivate}
          className="focus-ring"
          style={{
            display: "block",
            marginTop: detail ? 6 : 0,
            padding: 0,
            background: "none",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            ...TRIGGER_TEXT_STYLE,
          }}
        >
          {trigger.label}
          {" "}
          <span style={{ fontStyle: "normal" }}>→</span>
        </button>
      )}
    </div>
  );
}

// The shared inline expand chevron, sitting right after a row's title text.
export function ExpandChevron({ open }: { open: boolean }) {
  return (
    <svg
      {...CHEVRON_PROPS}
      aria-hidden="true"
      style={{
        width: 10, height: 10, color: "var(--accent-text)", opacity: 0.5,
        marginLeft: 6, display: "inline-block", verticalAlign: "baseline",
        transition: "transform 0.15s",
        transform: open ? "rotate(90deg)" : undefined,
      }}
    >
      <polyline points="96 48 176 128 96 208" />
    </svg>
  );
}

interface SwipeExpandCarouselProps {
  items: SwipeExpandItem[];
  getKey?: (item: SwipeExpandItem, index: number) => string | number;
}

// Shared "Worth knowing" / "Markets" presentation: a one-line title row — a
// full-width scroll-snap carousel of headlines (flex: 1) with the active
// slide's aside figure + inline swipe dots on the right — and, when the
// active slide is expanded, its drop-down box BELOW the row at full width
// (never squeezed by the aside/dots column).
export function SwipeExpandCarousel({ items, getKey }: SwipeExpandCarouselProps) {
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

  // Sync the wrapper's height to the active slide's natural title height every
  // render (a long headline can wrap on a narrow viewport).
  useLayoutEffect(() => {
    const slide = slideRefs.current[safeActiveIndex];
    const wrapper = wrapperRef.current;
    if (!slide || !wrapper) return;
    wrapper.style.height = `${slide.offsetHeight}px`;
  });

  // A pure viewport resize / device rotation triggers no React render, so the
  // fixed-height wrapper (overflow:hidden) would keep its old height and clip a
  // headline that now wraps to more lines, and the track's scroll would drift
  // off the active snap point. Re-run the height sync and re-scroll on resize.
  useEffect(() => {
    const onResize = () => {
      const slide = slideRefs.current[safeActiveIndex];
      const wrapper = wrapperRef.current;
      const track = trackRef.current;
      if (slide && wrapper) wrapper.style.height = `${slide.offsetHeight}px`;
      if (track) track.scrollLeft = safeActiveIndex * track.clientWidth;
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [safeActiveIndex]);

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

  const activeItem = items[safeActiveIndex];
  const activeAside = activeItem?.aside ?? null;
  const activeOpen = expanded.has(safeActiveIndex);

  return (
    <div>
      {/* Title row: swipeable headlines left, aside + dots right. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div ref={wrapperRef} style={{ flex: 1, minWidth: 0, overflow: "hidden", transition: "height 0.2s ease" }}>
          <div
            ref={trackRef}
            onScroll={handleScroll}
            className="no-scrollbar"
            style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory" }}
          >
            {items.map((item, i) => {
              const isOpen = expanded.has(i);
              const expandable = !!(item.detail || item.trigger);
              return (
                <div key={getKey ? getKey(item, i) : i} style={{ flex: "0 0 100%", minWidth: 0, scrollSnapAlign: "start" }}>
                  <div ref={(el) => { slideRefs.current[i] = el; }}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => expandable && toggle(i)}
                      style={{
                        display: "block", width: "100%",
                        textAlign: "left", background: "none", border: "none",
                        cursor: expandable ? "pointer" : "default", padding: 0,
                      }}
                    >
                      {/* Title carries the expand chevron inline, right after
                          the text, so a short headline reads as a tight unit.
                          The aside + swipe dots (row-level, right) stay put. */}
                      <span style={SIGNAL_TEXT_STYLE}>
                        {item.title}
                        {expandable && <ExpandChevron open={isOpen} />}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {(activeAside || items.length > 1) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexShrink: 0 }}>
            {activeAside && (
              <span
                className="tnum"
                style={{ fontSize: "var(--fs-caption)", fontWeight: 500, color: "var(--text-dim)", whiteSpace: "nowrap" }}
              >
                {activeAside}
              </span>
            )}
            {items.length > 1 && (
              <CarouselDots count={items.length} activeIndex={safeActiveIndex} onSelect={goTo} />
            )}
          </div>
        )}
      </div>
      {/* The active slide's drop-down box, full row width. */}
      {activeOpen && (
        <SignalDropBox detail={activeItem?.detail} trigger={activeItem?.trigger} />
      )}
    </div>
  );
}
