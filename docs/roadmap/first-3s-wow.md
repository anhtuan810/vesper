# Volnar — First-3-Seconds WOW (Overview, arriving from marketing)

Source: the 2026-06-28 strategy pass. Goal: when a visitor lands on the Overview (`/`)
for the first time straight from the marketing page, the app should feel like **the
marketing page resolving into the product** — a cinematic but *calm* reveal. Delight, not
flash. The brand is anti-hype: no count-ups, no confetti, no bounce.

Status note: **v1 is shipped** (2026-06-28) — the net-worth line-draw, the card
cascade, the journal dot stagger, and the reduced-motion / play-once gating. The
one-line portfolio "story" eyebrow and the rail-greeting beat are specced here as
follow-ups (the story changes the resting layout, so it was deferred from v1).

**Shipped (v1).** `OverviewContent` sets a `reveal` flag once per session
(`volnar:overview-revealed` in `sessionStorage`), skipped under
`prefers-reduced-motion`. It drives: `.rv rv-1..rv-4` cascade classes on the four
sections (reusing the global `up` keyframe), and `revealLine={reveal}` into
`NetWorthChart`, which strokes the net-worth path via `pathLength=1` + a dash-draw
(`.nw-line-draw`) and staggers the journal dots in oldest→newest (`.nw-dot-rise`,
per-dot delay clamped to ~0.5s total). CSS + reduced-motion fallback live in
`home-twilight.css`.

---

## The beats (authored timeline)

| When | Beat | Detail |
|---|---|---|
| **0–0.45s** | **Staggered card cascade** | Reuse `WebShell`'s existing `up` keyframe (translateY **8px**, 0.25s ease). Top→bottom: headline `0s` → chart body `0.1s` → vitals `0.25s` → journal preview `0.35s` → trust band `0.45s`, steps ~80–110ms. Below-the-fold reveals on scroll-into-view, not a timer. Keep it 8px, not 30px — small. |
| **0–1.2s** | **The net-worth line draws itself in** ⭐ | The signature gesture. Line invisible → strokes left→right via `stroke-dashoffset` over ~1.0–1.2s, on the SAME ease/timing the marketing hero uses (`src/app/marketing/twilight.css` → `@keyframes tw-draw{to{stroke-dashoffset:0}}`, ~1.1s ease). The stacked asset bands fade up underneath (opacity 0→~0.58) a beat behind, so the silhouette resolves *after* the line leads. |
| **~0.2s** | **One-line portfolio "story"** | In the eyebrow slot above the hero number, render one true sentence from data already in `OverviewContent` (`entries.length`, `trackingSinceDate`, `rangeBadge` delta, `todayBreakdown`): e.g. *"Tracking since March 2024 · 23 decisions · up €41.000 since you started"* or *"Mostly markets, with a third in property."* Fades in. **Never counts up** — the editorial answer to "make the headline feel alive." |
| **1.2–2.0s** | **Decision dots light up oldest→newest** | Strictly AFTER the line settles (sequence, don't compete). Journal markers scale-in from 0 one-by-one left→right, ~50–70ms apart, each with the existing faint accent ring (the r=2.8 "you" dot). Market-swing dots stay absent or half-opacity so the user's OWN decisions illuminate. Clamp the stagger total (~0.6s max) so a 68-entry line doesn't crawl. |
| **1–3s** | **Rail greets by name with ONE real insight** (follow-up) | The deepest wow. On first load the rail opens with a single line addressed by first name (`firstName()` exists in `WebShell`) carrying one concrete true observation from the SAME data the page is revealing: *"Morning, Tuan. Your largest position is 38% of the book — a touch concentrated. Want to talk through it?"* A generic "Hi, how can I help?" is actively anti-wow. |

---

## Non-negotiable guardrails (ship these WITH the reveal)
1. **`prefers-reduced-motion`** → fall back to a simple opacity fade. No draw, no stagger.
2. **Play-once gate** → a once-per-session (or once-per-day) flag so it plays on the FIRST
   landing from marketing, **not** on every tab back to Overview. The repeat/reduced path
   is near-instant: content present, no motion.
3. Keep motions **8px / ~1s** — small and slow. The calm is the brand.
4. Detect "arriving from marketing" if possible (referrer / a flag set on the marketing CTA)
   so the cinematic version is reserved for the genuine first impression.

---

## Implementation notes
- **Line draw:** the net-worth path lives in `NetWorthChart.tsx` (`line` / `buildPath`).
  Set `stroke-dasharray`/`stroke-dashoffset` = path length and animate to 0 with `tw-draw`.
  Gate on the play-once flag; SVG path length via `getTotalLength()` or a CSS `pathLength="1"`.
- **Bands fade:** the stacked-band `<path>`s already have `fillOpacity` — animate from 0.
- **Story eyebrow:** all inputs already computed in `OverviewContent` — no new data.
- **Dot stagger:** the marker `<circle>`s in `NetWorthChart` — apply a per-index
  `animation-delay`. Only in `markerMode` (desktop journal chart).
- **Gating:** a `sessionStorage` flag (e.g. `volnar:overview-revealed`) + a
  `@media (prefers-reduced-motion)` block in `home-twilight.css`.
- **Reuse, don't reinvent:** `tw-draw`, `tw-fadeUp`, `tw-reveal` already exist in
  `src/app/marketing/twilight.css` — mirror their curves so product feels like marketing.

## What to avoid
- Count-ups on the serif number, confetti, celebratory toasts, bounce easing, anything
  that plays on every visit, or any beat that competes with the line draw (one thing at a time).
