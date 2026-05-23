# Volnar Vitals — Design Specification

**Purpose:** Source of truth for the Vitals tab UI. Read this before any
file in `src/components/vitals/` or `src/app/vitals/page.tsx`. Pairs
with `docs/vitals-mockup.html` (the canonical visual reference).

This doc is the bridge between the mockup (which uses a self-contained
`--v*` CSS namespace) and the real Volnar codebase (which uses the
project's existing tokens in `src/app/globals.css`).

---

## 1. Token mapping — mockup → project

The mockup uses `.v` scoped CSS variables prefixed with `--v` to avoid
collision. Map them to project tokens as follows.

| Mockup token         | Project token         | Hex (light)              | Notes |
|----------------------|-----------------------|--------------------------|-------|
| `--vbg`              | `--bg`                | `#EFEAE0` (cream)        | Page background |
| `--vsurface`         | `--surface`           | `#F8F4EC`                | Card background |
| `--vsurface-elev`    | `--surface-elev`      | `#E8E2D4`                | Pill / chip bg |
| `--vsurface-deep`    | *(add new)* `--surface-deep` | `#DDD6C5`         | Drawdown bar track |
| `--vtext`            | `--text`              | `#1C1C18` (ink)          | Primary text |
| `--vtext-dim`        | `--text-dim`          | `#5E5A52`                | Secondary text |
| `--vtext-faint`      | `--text-faint`        | `#968F84`                | Tertiary, eyebrows |
| `--vhero`            | `--text` (or `--hero` if introduced) | `#181816` | Hero numbers |
| `--vaccent`          | `--accent`            | `#4A7C5E` (green)        | Primary accent |
| `--vaccent-deep`     | *(add new)* `--accent-deep` | `#3A5F4A`          | Accent text on accent-soft |
| `--vaccent-soft`     | `--accent-soft`       | `#DCE5D2`                | Suggestion strip bg (context) |
| `--vaccent-text`     | `--accent-deep`       | `#3A5F4A`                | Same as accent-deep |
| `--vborder`          | `--border`            | `rgba(28,28,24,0.10)`    | Card borders |
| `--vborder-strong`   | *(add new)* `--border-strong` | `rgba(28,28,24,0.18)` | Page frame borders |
| `--vneg`             | `--negative`          | `#B85C4A`                | Negative numbers |
| `--vneg-deep`        | *(add new)* `--negative-deep` | `#7A3B2D`          | Alert suggestion text |
| `--vneg-soft`        | `--negative-soft`     | `rgba(184,92,74,0.10)`   | Alert suggestion bg |
| `--vpos`             | `--accent`            | `#4A7C5E`                | Same as accent |
| `--vamber`           | *(add new)* `--amber` | `#C4A06B`                | Warn semantic |
| `--vamber-deep`      | *(add new)* `--amber-deep` | `#7A5E3C`           | Warn suggestion text |
| `--vamber-soft`      | *(add new)* `--amber-soft` | `rgba(196,160,107,0.13)` | Warn suggestion bg |

## 2. New tokens to add to `src/app/globals.css`

Add the following under both `[data-theme="light"]` and `[data-theme="dark"]`.
Dark-theme values need separate calibration — they are not just inverted
light values. Recommended dark values are listed below; tune in
implementation if contrast feels off.

```css
[data-theme="light"] {
  --surface-deep: #DDD6C5;
  --border-strong: rgba(28, 28, 24, 0.18);
  --accent-deep: #3A5F4A;
  --negative-deep: #7A3B2D;
  --amber: #C4A06B;
  --amber-deep: #7A5E3C;
  --amber-soft: rgba(196, 160, 107, 0.13);
}

[data-theme="dark"] {
  --surface-deep: rgba(255, 250, 240, 0.06);
  --border-strong: rgba(245, 241, 234, 0.22);
  --accent-deep: #A8C9B2;          /* lifted for legibility on warm-black */
  --negative-deep: #E0A599;
  --amber: #C4A06B;
  --amber-deep: #D4B484;
  --amber-soft: rgba(196, 160, 107, 0.18);
}
```

Mirror these in `src/lib/tokens.ts` if any inline-JS code references them.

## 3. Typography rhythm

All sizes calibrated to the mockup. Use Source Serif 4 for hero numbers,
page titles, italic synthesis sentences, and the closing line. Use
Albert Sans (default body font) for everything else.

| Element                        | Size  | Weight | Letter-spacing | Other |
|--------------------------------|-------|--------|----------------|-------|
| Page title ("Vitals")          | 34px  | 500    | -0.026em       | Serif |
| Hero number (cards)            | 30px  | 600    | -0.022em       | Serif, `font-feature-settings: 'tnum'` |
| Hero number (Perspective NW)   | 40px  | 600    | -0.022em       | Serif, tnum |
| Pulse synthesis sentence       | 13.5px| 400    | -0.005em       | Serif italic, line-height 1.42 |
| Eyebrow label (uppercase)      | 9.5px | 500    | 0.18em         | text-faint |
| Right-stat label               | 9px   | 400    | 0.12em         | uppercase, text-faint |
| Right-stat value               | 14px  | 500    | normal         | tnum |
| Card sub-line                  | 10.5px| 400    | normal         | text-dim, tnum |
| Bench line                     | 10.5px| 400    | normal         | text-dim, dash prefix |
| Suggestion strip label         | 8.5px | 600    | 0.16em         | uppercase |
| Suggestion strip body          | 11.5px| 400    | normal         | line-height 1.42 |
| Closing italic line            | 12.5px| 400    | normal         | Serif italic, text-dim, line-height 1.5 |
| Stat strip number              | 17px  | 600    | normal         | Serif, tnum |
| Stat strip label               | 9px   | 400    | 0.11em         | uppercase |
| Perspective cohort rank        | 19px  | 600    | normal         | Serif, tnum |
| Perspective context sub-line   | 9px   | 400    | normal         | text-faint |
| Bottom-nav label               | 10.5px| 500    | normal         | 600 when active |

## 4. Spacing system

| Element                | Value                    |
|------------------------|--------------------------|
| Page padding (horiz)   | 17px                     |
| Card padding           | 14px 15px 12px           |
| Card border-radius     | 14px                     |
| Card border            | 0.5px solid var(--border)|
| Card vertical gap      | 10px                     |
| Pulse banner padding   | 11px 15px 10px           |
| Pulse margin           | 0 0 10px, border-radius 14px     |
| Stat strip gap (cells) | 10px per side of divider |
| Perspective card padding | 20px 18px 18px         |
| Section divider padding | 18px top, 14px bottom   |
| Library expander padding | 13px 14px              |
| Bottom-nav height      | 62px + safe-area inset   |
| Bottom-nav cell flex   | 1 (1.05 for Chat)        |

## 5. Component specs

### 5.1 `PulseBanner`

Accent-soft lead card aligned to the content column (after title, before stat strip).

- **Props:** `dateLabel` (string), `sentence` (HTML with `<em>` for emphasis),
  `metaLabel?` (string)
- **Container:** `margin: 0 0 10px;` `background: var(--accent-soft);`
  `padding: 11px 15px 10px;` `border-radius: 14px;`
- **Eyebrow row:** flex space-between, `marginBottom: 5px`. Left: dateLabel in eyebrow style with
  `color: var(--accent-deep); opacity: 0.75;`. Right: optional metaLabel,
  9.5px, `color: var(--accent-deep); opacity: 0.55; letter-spacing: 0.06em`.
- **Synthesis sentence:** 13.5px Source Serif 4 italic, line-height 1.42,
  `color: var(--text); letter-spacing: -0.005em;`. The `<em>` inside is
  `font-weight: 600` and stays italic.

Mockup section: search for `<!-- PULSE -->` in `docs/vitals-mockup.html`.

### 5.2 `StatStrip`

4-stat row with vertical dividers, sits between Pulse and active vitals.

- **Props:** `stats` (array of `{ label, value, negative? }`), max 4 entries
- **Container:** `margin: 0 -17px 20px; display: flex; padding: 0 17px 14px;
  border-bottom: 0.5px solid var(--border);`
- **Cell:** `flex: 1; padding: 0 10px;` with `border-right: 0.5px solid
  var(--border)` between cells (last has none). First cell has only right
  padding, last only left.
- **Label:** 9px uppercase, letter-spacing 0.11em, line-height 1, margin-
  bottom 5px, `color: var(--text-faint)`.
- **Value:** 17px Source Serif 4, weight 600, line-height 1, tnum.
  When `negative: true`, color `var(--negative)`; otherwise `var(--hero)`
  (or `var(--text)`).

Mockup section: `<!-- 4-STAT STRIP -->`.

### 5.3 `VitalCard`

Shared wrapper for every Vital card.

- **Props:** `eyebrow`, `heroNumber`, `heroNumberClass?` (`'positive'` |
  `'negative'` | `'default'`), `subLine`, `rightStat?` (`{ label, value }`),
  `benchLine?` (string with possible `<strong>` markup), `suggestion?`
  (see SuggestionStrip), `children` (the chart node).
- **Container:** `background: var(--surface); border: 0.5px solid var(--border);
  border-radius: 14px; padding: 14px 15px 12px; margin-bottom: 10px;`
- **Header row:** flex space-between, align-items flex-start, margin-bottom
  11px, gap 12px.
  - Left block: eyebrow → hero number (gap 6px) → sub-line.
  - Right block: `vstat-r` column with label above value, gap 3px, align
    flex-end, flex-shrink 0.
- **Hero number:** 30px Source Serif 4 weight 600, letter-spacing -0.022em,
  line-height 1, tnum. Color by class:
  - `default` → `var(--hero)` / `var(--text)`
  - `negative` → `var(--negative)`
  - `positive` → `var(--accent-deep)`
- **Chart slot:** children render directly inside the card body.
- **Bench line:** rendered below chart. `font-size: 10.5px;
  color: var(--text-dim); display: flex; align-items: center; gap: 6px;
  padding: 8px 0 2px;`. Prefix with a 10px × 1px text-faint horizontal
  line via `::before` pseudo-element.
- **Suggestion strip:** rendered below bench line, separated by 10px top
  margin.

Mockup section: search for `<!-- 1. CONCENTRATION -->` through `<!-- 7. REAL GROWTH -->`.

### 5.4 `SuggestionStrip`

Three variants. Always sits at the bottom of a VitalCard.

- **Props:** `variant` (`'context'` | `'warn'` | `'alert'`), `label`
  (e.g. "Worth considering", "Worth knowing", "Context"),
  `body` (ReactNode supporting `<strong>` for emphasis), `icon?`
  (optional override; defaults map below).

| Variant   | Background        | Text color (label)  | Default icon  |
|-----------|-------------------|---------------------|---------------|
| `context` | `--accent-soft`   | `--accent-deep`     | info circle   |
| `warn`    | `--amber-soft`    | `--amber-deep`      | bulb          |
| `alert`   | `--negative-soft` | `--negative-deep`   | bulb          |

- **Container:** `border-radius: 9px; padding: 9px 11px; margin-top: 10px;
  display: flex; gap: 8px; align-items: flex-start;`
- **Icon:** 13×13, stroke 1.8, color matches variant text color,
  `flex-shrink: 0; margin-top: 2px;`.
- **Label:** 8.5px uppercase weight 600, letter-spacing 0.16em, opacity 0.82,
  margin-bottom 3px, line-height 1.
- **Body:** 11.5px line-height 1.42, color `var(--text)`.

Mockup sections: every `<div class="vsugg ...">` shows the pattern.

### 5.5 Chart components

All charts are pure inline SVG (no Recharts dependency). Each is
presentational — accepts `data` prop, renders SVG, no API calls.
Reference the mockup for exact geometry; key parameters listed below.

#### 5.5.1 `ConcentrationBars` *(replaces ConcentrationTreemap, retired)*

HTML/CSS ranked horizontal bars — no SVG, no chart library.

- **Asset-class colors** (fixed palette, use throughout app):
  - real_estate: `#7A9C7F`
  - crypto: `#C47B5A`
  - pension / bonds / gold: `#C4A86E`
  - stocks/ETFs: `#6B82A8`
  - cash: `#888780`
  - other: `#B4B2A9`
- **Selection:** top 5 positions (sorted desc by pct). If >5, a plain text
  line "+N more · X%" summarises the rest — not a bar.
- **Scale:** `axisMax = Math.max(50, Math.ceil((top1Pct + 10) / 10) * 10)`.
  Each bar `width = pct / axisMax * 100%` of its track.
- **Threshold line:** dashed vertical at `x = 35 / axisMax` of track width,
  spanning all bar rows. Label "balanced ≤ 35%" above in `--text-faint`.
- **Label column:** 88px fixed. `symbol ?? name` — tradeables show ticker,
  non-tradeables show name; word-wrap to two lines, never truncate.
- **Bar color** = asset class from palette above. Health is NOT encoded in
  bar color — the home bar is property-green regardless of concentration band.
- **% label:** rendered via `fmtPct` (one decimal) just after each bar, so
  it matches the hero number exactly.
- **Animation:** bars grow from 0 → width on mount, staggered 65 ms each,
  `cubic-bezier(0.25, 0.1, 0.25, 1)`. Once only.

#### 5.5.2 `RealAssetBullet`

- **ViewBox:** `320 44`
- **Five percentile bands** (heights 18, y=14):
  - 0–25th: `#E8E2D4`, width 60
  - 25–50th: `#D9D2C0`, width 80
  - 50–75th: `#CBC3AC`, width 80
  - 75–90th: `#BDB498`, width 60
  - 90–100th: `#A89F84`, width 40
- **Your position bar:** `var(--accent)`, height 8, y=19, width = your
  percentile mapped to 0–320.
- **Your position dot:** r=3.8, white stroke 1.5.
- **EU median marker:** vertical line from y=8 to y=34, `var(--hero)`,
  stroke-width 1.6, with label "EU median 63%" above (y=6, 8px,
  weight 600).
- **Percentile labels** below bands (y=43, 8px): "25th", "median", "75th", "90th".

#### 5.5.3 `LiquidityStack`

- **ViewBox:** `320 44`
- **5 tiers** as rounded rectangles (rx=2, height 16, y=8):
  - same-day cash: `var(--accent)`, width 26
  - market 1w: `#7AB395`, width 50
  - slow 1mo: `#C4A86E`, width 46
  - 6mo+ / property: `#A89F84`, width 72
  - locked / pension: `#5E5A52`, width 118
- **Buffer threshold:** dashed vertical line at x=48 (the 15% mark),
  `var(--text-dim)`, stroke 0.8, dasharray "2 2", opacity 0.7.
  Label "15% buffer" below at y=42, 8.5px, weight 500.
- **Legend below SVG:** 5 dot+label pairs in flex row.

#### 5.5.4 `LeverageTrend`

- **ViewBox:** `320 78`
- **Three risk bands** (full-width rectangles):
  - 0–12 (>75% LTV): `rgba(184,92,74,0.09)` (red zone)
  - 12–26 (50–75%): `rgba(196,160,107,0.09)` (amber zone)
  - 26–76 (<50%): `rgba(74,124,94,0.06)` (green zone)
- **Reference labels:** "75%" at y=9, "50%" at y=23, right-aligned, 8px.
- **NL avg line:** dashed at y=22, `var(--text-dim)` stroke 0.5,
  dasharray "3 3", opacity 0.5. Label "NL avg 52%" at x=5, y=20.
- **Trend line:** `var(--accent)` solid, stroke 1.9, from (0,32) to (240,44).
- **Projection area:** `var(--accent)` 0.10 opacity polygon for uncertainty
  band beyond today.
- **Projection line:** `var(--accent)` dashed, stroke 1.5, dasharray "3 3",
  opacity 0.65, from (240,44) to (320,52).
- **Today dot:** r=3.8, `var(--accent)`, white stroke 1.5.
- **Timeline below SVG:** flex space-between, three labels:
  - past year `text-faint` 9.5px
  - today `accent-deep` weight 600 9.5px
  - projection year `text-faint` italic 9.5px

#### 5.5.5 `DrawdownBars`

- **No viewBox** — uses flex layout (3 scenarios + 1 combined).
- **Row layout:** flex with gap 9px.
  - Label: `flex: 0 0 108px`, 11px `var(--text-dim)`.
  - Bar track: `flex: 1; height: 13px; background: var(--surface-deep);
    border-radius: 3px; overflow: hidden;`
  - Bar fill: `background: var(--negative); opacity: 0.55;` (0.88 for combined)
  - Value: `flex: 0 0 50px; text-align: right;` 11px `var(--negative)` weight 500, tnum.
- **Combined-shock row:** padding-top 7px, border-top 0.5px dashed
  `var(--border)`, label weight 600, value 12px weight 600.

#### 5.5.6 `CashWaterfall`

- **ViewBox:** `320 96`
- **Baseline:** horizontal line at y=48, `rgba(28,28,24,0.20)`, stroke 0.7.
- **Gridlines:** subtle dashed at y=30 and y=66, `rgba(28,28,24,0.08)`,
  stroke 0.4, dasharray "1 3".
- **Three step rectangles:** 40px wide each, opacity 0.88:
  - Savings (+): x=20, y=30, height 18, `var(--accent)`. Label "+2.5%" above
    at y=23, 10.5px weight 600.
  - Inflation (−): x=86, y=30, height 36, `var(--negative)`. Label "−3.7%" above.
  - Tax (−): x=152, y=66, height 14, `var(--negative)`. Label "−1.0%" above (y=62).
- **Connectors** between steps: dashed `rgba(28,28,24,0.18)` stroke 0.7,
  dasharray "2 2" (one between savings and inflation top, one between
  inflation bottom and tax top).
- **Result box (dashed outline):** x=226, y=48, width=70, height=32, no fill,
  `stroke: var(--negative)` stroke 1.5 dasharray "3 2". Result number "−2.7%"
  centered inside at y=68, 14px Georgia serif weight 700 `var(--negative)`.
- **Sub-labels:** "savings", "inflation", "box 3 tax", "real yield" below
  each unit at 9px `var(--text-faint)`.

#### 5.5.7 `RealGrowthDualLine`

- **ViewBox:** `320 86`
- **Gradient definition:** `linearGradient id="rgg3"` from
  `var(--accent)` 0.16 alpha to 0 alpha (vertical).
- **Today gridline:** dashed at y=64, `rgba(28,28,24,0.10)` stroke 0.5,
  dasharray "2 3".
- **Nominal line:** solid `var(--accent)` stroke 2, with filled area
  using the gradient.
- **Real line:** dashed `#8FA994` stroke 1.4 dasharray "4 3".
- **End-point dots:** r=3.8 (nominal), r=3.2 (real), white stroke 1.5.
- **Labels (pills at right edge):**
  - Nominal pill at x=262 y=9, width=48, height=13, rx=6.5, fill
    `var(--surface-elev)`. Text "nominal" 9px weight 600 `var(--accent-deep)`.
  - Real pill at x=262 y=33, same dims. Text "real" 9px weight 500 `#6B8473`.
- **Date labels below (y=82, 9px text-faint):** start date, midpoint, "today".

### 5.6 `PerspectiveCard`

**Moved to Profile (2026-05-22).** Component lives at
`src/components/perspective/PerspectiveCard.tsx` and is owned by the Profile
page, not Vitals. It no longer appears on the Vitals tab.

- **No section divider.** The old centered "PERSPECTIVE" hairline was removed.
  The caller (Profile page) supplies its own `10px uppercase` eyebrow label in
  the standard section-eyebrow pattern used by Context and Preferences.
- **Card container:** same gradient/border/radius as before.
  `margin-bottom: 24px` (was 18px).

**Hero block removed.** The 40px net-worth number and its "YOUR NET WORTH,
TODAY" eyebrow are gone.

**Italic synthesis sentence — now the visual lead:**
- 15.5px Source Serif 4 italic, line-height 1.5, `var(--text)`,
  letter-spacing -0.003em. `<em>` (weight 600) on percentage numbers.
  Margin-bottom 6px.

**Quiet net-worth secondary line (replaces the 40px hero):**
- `{nwFull} · your wealth today` — 13px, `var(--text-dim)`,
  `font-feature-settings: 'tnum'`. Margin-bottom 18px.

**Wealth distribution chart (nested card):**
- Container: `background: rgba(248,244,236,0.5); border-radius: 10px;
  padding: 16px 10px 12px; margin-bottom: 16px;`
- Eyebrow: "WEALTH DISTRIBUTION · LOG SCALE", 9px, `var(--accent-deep)`,
  opacity 0.7, margin-bottom 10px.
- **SVG viewBox:** `340 110`
- **Density curve (Bézier):** path defining log-scale distribution shape,
  filled with `linearGradient` (id="dens3") from accent 0.05 to 0.16 alpha.
- **X-axis:** horizontal line at y=72, with tick marks and 5 labels at
  x=15/88/160/232/305: "€1k", "€10k", "€100k", "€1M", "€10M".
- **Four cohort markers:** vertical dashed lines + labels above:
  - World median at x=88
  - EU median at x=155 (label at x=148, y=44)
  - NL median at x=180 (label at x=184, y=24, offset to avoid overlap)
  - World top 1% at x=232 (label at y=8)
- **"You" marker:** at x = `log10(netWorthEur/1000) / log10(10000) * 310 + 15`,
  vertical dashed line down to y=102, outer halo circle r=7 stroke 2 opacity 0.28,
  inner dot r=4 solid `var(--accent)`. Label "you · €600k" at y=108, 9.5px
  weight 600 `var(--accent-deep)`.

**Three cohort rows:** Each row is a flex layout:
- `flex: 0 0 72px` (left block: region name + sublabel)
- `flex: 1; padding: 0 12px;` (progress bar with dot)
- `flex: 0 0 54px; text-align: right;` (percentile number)

Rows separated by `border-top: 0.5px solid rgba(74,124,94,0.16)`,
padding 11px 0.

Region name: 11px weight 600, letter-spacing 0.03em.
Sublabel: 9.5px `var(--text-dim)`.
Progress bar: 3px height, `rgba(74,124,94,0.18)` track, accent fill width
matches percentile.
Dot on progress bar: 9×9 circle at percentile position, accent fill, 2px
cream border, subtle box-shadow.
Context sub-line below bar: 9px `var(--text-faint)`, margin-top 6px.
Percentile number: 19px Source Serif 4 weight 600 tnum, with smaller
"th" suffix (11px `var(--text-dim)`).

**Trajectory chip:** Only if data.trajectory is not null.
- Inline-flex, gap 7px, padding 7px 11px, `background:
  rgba(248,244,236,0.65); border-radius: 999px; margin-top: 14px;`
- Trending-up icon 11×11 `var(--accent-deep)`.
- Text "Up [N] percentile points in [region] this year", 11px `var(--text)`,
  with the number wrapped in `<strong>` weight 600.

**Closing italic line (hardcoded):** "Most of the world manages without
an investment portfolio at all. Worth holding lightly."
- 12.5px Source Serif 4 italic, line-height 1.5, `var(--text-dim)`,
  margin-top 16px, padding-top 14px, border-top 0.5px solid
  `rgba(74,124,94,0.16)`.

Mockup section: search for `<!-- PERSPECTIVE CARD -->`.

### 5.7 `LibraryExpander`

Collapsed-by-default row that expands inline to reveal dormant Vitals.

- **Collapsed container:** `background: rgba(248,244,236,0.55); border:
  0.5px solid var(--border); border-radius: 11px; padding: 13px 14px;
  margin-bottom: 18px; cursor: pointer;`
- **Header row:** flex space-between.
  - Left: "Library" 13px weight 600 + "11 vitals · X dormant" 11px
    `var(--text-faint)` (gap 8px, baseline align).
  - Sub-line below: "Tap to explore what surfaces when conditions change",
    10.5px `var(--text-faint)`, margin-top 3px.
  - Right: chevron-down icon 14×14, stroke 1.8, `var(--text-faint)`,
    rotates 180° when expanded.

**Expanded state (dormant vital rows):**
- Each row: `display: flex; gap: 12px; padding: 11px 0; border-bottom:
  0.5px solid var(--border); cursor: pointer;` (last row no border).
- Icon: 28×28 rounded square, `background: var(--surface-elev); border-
  radius: 7px;` with 14×14 stroke-1.8 inline SVG icon centered, color
  `var(--text-faint)`.
- Content:
  - Row 1 (flex): name (13px weight 500) + current value (11px tnum
    `var(--text-faint)`, right-aligned).
  - Row 2: "Surfaces when…" explanation, 11.5px `var(--text-dim)`,
    line-height 1.4.
- Trailing chevron: 13×13 stroke 1.8 `var(--text-faint)`, `flex-shrink: 0;
  margin-top: 8px;`

On row tap: write to sessionStorage (key `vitals.seed.vital`,
value = vital key) and route to `/chat?seed=insight&key=vital-<vitalKey>`.
Reuses the existing chat seed pattern from PR 22.

### 5.8 `BottomNav` (5 tabs, Chat elevated)

- **Container:** `display: flex; align-items: flex-end; height: 62px;
  background: rgba(248,244,236,0.88); border-top: 1px solid var(--border);
  padding-bottom: calc(9px + env(safe-area-inset-bottom));`
- **Tab order:** Portfolio (1), Vitals (2), Chat (3), Diary (4),
  Profile (5). Chat naturally lands at center cell.
- **Cell layout:** `flex: 1` (or `flex: 1.05` for Chat). `display: flex;
  flex-direction: column; align-items: center; gap: 3px;`

**Standard tabs (Portfolio, Diary, Profile, Vitals):**
- Icon: 21×21 stroke 1.6.
- Label: 10.5px weight 500 (600 when active).
- Color: `var(--text-faint)` inactive, `var(--accent)` active.
- Vitals active state uses filled (`fill="currentColor"`) waveform icon;
  inactive uses stroke version.

**Chat (elevated):**
- Wrap icon in 40×40 circle: `border-radius: 50%; border: 1.5px solid
  var(--accent); background: rgba(74,124,94,0.07); display: flex;
  align-items: center; justify-content: center;`
- Icon inside circle: 18×18 stroke 1.7 chat bubble path.
- Active state (pathname === '/chat'): border and icon color
  `var(--accent)`, filled chat bubble.
- Inactive state: border still visible (use `var(--accent)` or reduce
  opacity), icon color `var(--text-faint)`, outlined chat bubble.

**Vitals waveform icon (custom inline SVG):**
```html
<svg viewBox="0 0 24 24" fill="currentColor" style="width: 21px; height: 21px;">
  <path d="M2 12 L6.5 12 L8.8 7 L13.2 18.5 L16 12 L22 12 L22 13 L16.5 13 L13.4 20.5 L9 9.5 L7 13 L2 13 Z"/>
</svg>
```

For inactive state, swap to outlined version:
```html
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width: 21px; height: 21px;">
  <path d="M2 12 L6.5 12 L8.8 7 L13.2 18.5 L16 12 L22 12"/>
</svg>
```

**Existing routes and context-aware seed for Chat — keep untouched.**

## 6. Page composition (top to bottom)

```
NavBar (existing component, unchanged)
Page title "Vitals" (Source Serif 4, 34px, weight 500, letter-spacing -0.026em)
PulseBanner (aligned lead card)
StatStrip (Top 1 · LTV · Liquid 1w · Real yield)
Eyebrow "Active vitals · N"
VitalCard × 7, in this order:
  1. Concentration       → <ConcentrationBars />
  2. Real-asset weight   → <RealAssetBullet />
  3. Liquidity posture   → <LiquidityStack />
  4. Leverage            → <LeverageTrend />
  5. Drawdown vulnerability → <DrawdownBars />
  6. Cash & real yield   → <CashWaterfall />
  7. Real growth         → <RealGrowthDualLine />
LibraryExpander (collapsed)
```

Perspective is **not** on Vitals. See Profile page composition below.

**Profile page composition (top to bottom):**
```
NavBar (greeting suppressed on Profile tab)
Name — 38px serif, left-aligned (serves as page title)
Fingerprint — 15px italic serif, directly under name (hidden when null)
Eyebrow "PERSPECTIVE"
PerspectiveCard (src/components/perspective/PerspectiveCard.tsx)
Eyebrow "CONTEXT"           (hidden if no fields populated)
Context fields card         (hidden if no fields populated)
Eyebrow "PREFERENCES"
Preferences card (Display currency + Theme)
Email + Sign out (account area)
BottomNav (existing, extended to 5 tabs)
```

## 7. Theme parity

Every component reads from CSS variables — no hardcoded hex except in
chart-internal palettes (asset-class colors, liquidity-tier colors,
percentile band shades). Those palettes are deliberately fixed across
themes to maintain category identity.

When implementing dark mode:
- The accent-soft Pulse banner and Perspective gradient should not feel
  washed out. Test with `[data-theme="dark"]` set on `<html>`.
- The `--surface-deep` token used for drawdown bar tracks needs higher
  alpha in dark mode (see suggested values in section 2).
- The accent-deep text color needs lifting in dark mode (see
  `#A8C9B2` suggestion in section 2) for legibility on warm-black.

## 8. Notes for Claude Code

When asked to implement any file under `src/components/vitals/` or
`src/app/vitals/page.tsx`:

1. Open `docs/vitals-mockup.html` and locate the corresponding section
   (use the HTML comments like `<!-- 1. CONCENTRATION -->`).
2. Pull SVG geometry directly from that section — do not redraw from
   the description in this doc when the mockup has the actual SVG.
3. Replace all `--v*` variables with project tokens per section 1.
4. If a token doesn't exist in the project, add it to
   `src/app/globals.css` per section 2 before using it.
5. Match the typography rhythm in section 3 exactly. The hierarchy
   relies on these precise sizes — do not round to "approximately".
6. Match spacing values in section 4 exactly for the same reason.
7. Do not introduce a chart library. All charts are inline SVG.
8. Use `font-feature-settings: 'tnum'` on every element rendering a
   number to keep digits monospaced.
9. The mockup uses `--vhero` (#181816) for hero numbers — slightly
   darker than `--text` (#1C1C18). If you don't introduce a separate
   `--hero` token, use `--text` and accept the tiny shift.
10. The mockup applies `backdrop-filter: blur(6px)` to NavBar
    background and `blur(8px)` to BottomNav. Keep these — they
    matter for the layered cream feel against scroll content.
