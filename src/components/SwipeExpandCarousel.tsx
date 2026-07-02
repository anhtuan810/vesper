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
  /** Quiet tabular figure shown next to the dots while this slide is active
   *  (e.g. Markets' "≈ +€85" portfolio impact). */
  aside?: string | null;
  /** Small tabular sub-line inside the expanded box (e.g. "≈ +€85 on your
   *  sheet · NVDA"). */
  meta?: string | null;
  /** The row's one trigger sentence — a gold clause at the foot of the
   *  expanded box that hands off to chat with a pre-made, content-fitting
   *  question. */
  trigger?: { label: string; onActivate: () => void } | null;
}

// ── The one signal-row family (the pulse rows at the top of Vitals) ──────────
// Every row — Pulse, projection, Worth knowing, Markets — shares this text
// spec, so the whole block reads as one design from one source. This is THE
// VOICE: everything the app speaks is set in the serif italic (--font-voice);
// everything it measures stays in the instrument sans (figures inside spoken
// sentences included — see .pulse-fig in globals.css).
export const SIGNAL_TEXT_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-voice)",
  fontStyle: "italic",
  fontSize: "var(--fs-voice)",
  lineHeight: "var(--lh-body)",
  color: "var(--text)",
};

// The trigger clause — one gold spoken sentence, the row's single action.
export const TRIGGER_TEXT_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-voice)",
  fontStyle: "italic",
  fontSize: "var(--fs-body)",
  color: "var(--accent-text)",
};

// Each pulse row's identity mark: a small surface chip holding a 13px gold
// icon. On the family's tinted wash the white chips are what set these rows
// apart from the plain vital rows below.
export function SignalIconChip({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 24,
        height: 24,
        borderRadius: 8,
        flexShrink: 0,
        marginTop: -2,
        background: "var(--surface)",
        border: "0.5px solid var(--border)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--accent-text)",
      }}
    >
      {children}
    </span>
  );
}

// The one signal-row shell: a leading icon chip, the content, and an optional
// right slot (aside figure + swipe dots). Rows must render through this rather
// than hand-rolling their own flex rows.
export function SignalRow({ icon, right, children }: { icon: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {right}
    </div>
  );
}

// The drop-down box under an expanded row: a small surface card holding the
// detail, an optional tabular meta line, and the trigger clause.
export function SignalDropBox({
  detail,
  meta,
  trigger,
}: {
  detail?: ReactNode;
  meta?: string | null;
  trigger?: { label: string; onActivate: () => void } | null;
}) {
  if (!detail && !meta && !trigger) return null;
  return (
    <div
      style={{
        marginTop: 6,
        marginBottom: 2,
        background: "var(--surface)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "9px 11px",
      }}
    >
      {detail && (
        <div
          style={{
            fontFamily: "var(--font-voice)",
            fontStyle: "italic",
            fontSize: "var(--fs-body)",
            lineHeight: "var(--lh-body)",
            color: "var(--text-dim)",
          }}
        >
          {detail}
        </div>
      )}
      {meta && (
        <div
          className="tnum"
          style={{ marginTop: detail ? 5 : 0, fontSize: "var(--fs-caption)", color: "var(--text-faint)" }}
        >
          {meta}
        </div>
      )}
      {trigger && (
        <button
          type="button"
          onClick={trigger.onActivate}
          className="focus-ring"
          style={{
            display: "block",
            marginTop: detail || meta ? 6 : 0,
            padding: 0,
            background: "none",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            ...TRIGGER_TEXT_STYLE,
          }}
        >
          {trigger.label} <span style={{ fontStyle: "normal" }}>→</span>
        </button>
      )}
    </div>
  );
}

interface SwipeExpandCarouselProps {
  /** Leading icon chip, fixed at the left of the row (SignalIconChip). */
  icon: ReactNode;
  items: SwipeExpandItem[];
  getKey?: (item: SwipeExpandItem, index: number) => string | number;
}

// Shared "Worth knowing" / "Markets" presentation: one flex row — a leading
// icon chip, a full-width scroll-snap carousel of collapsible title slides
// (flex: 1), and the active slide's aside figure + inline swipe dots on the
// right. Expanding a slide opens its drop-down box (detail + meta + the
// trigger clause). The carousel's height transitions to match the active
// slide.
export function SwipeExpandCarousel({ icon, items, getKey }: SwipeExpandCarouselProps) {
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
  // collapsed (headline-only) and expanded (headline + box) states.
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

  const activeAside = items[safeActiveIndex]?.aside ?? null;

  return (
    <SignalRow
      icon={icon}
      right={
        activeAside || items.length > 1 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexShrink: 0 }}>
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
        ) : undefined
      }
    >
      <div ref={wrapperRef} style={{ overflow: "hidden", transition: "height 0.2s ease" }}>
        <div
          ref={trackRef}
          onScroll={handleScroll}
          className="no-scrollbar"
          style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory" }}
        >
          {items.map((item, i) => {
            const isOpen = expanded.has(i);
            const expandable = !!(item.detail || item.meta || item.trigger);
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
                    <span style={SIGNAL_TEXT_STYLE}>
                      {item.title}
                      {expandable && (
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
                  {isOpen && (
                    <SignalDropBox detail={item.detail} meta={item.meta} trigger={item.trigger} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SignalRow>
  );
}
