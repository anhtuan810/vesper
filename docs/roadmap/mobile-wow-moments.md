# Volnar — Mobile WoW moments (ranked build plan)

Source: the 2026-07-01 UI-overhaul pass. Goal: simple, premium moments on the
**phone** that make Volnar's real differentiator felt — *the app stores the
reasoning behind every decision and will tell you, honestly, what each decision
did.* Every item was checked against the codebase (the cited files/props exist)
and against the brand guardrails (calm, no count-ups/confetti/bounce, ~8px/~1s
motion, play-once, reduced-motion fallback, no fabricated numbers).

Each item is a self-contained spec — pick any up in a fresh chat, in order.

> **Status (2026-07-02).** Shipped since this plan, out of band: the **Named
> Rewind** (grew out of item 2's territory and went further — picking a journal
> entry stands the hero AND the holdings list at that day, reconstructed
> server-side; see `docs/technical-decisions.md` → "Named Rewind"), the
> foldable Vitals/Profile redesign, the unified Pulse block, and the time-true
> chart axis. Items 1–6 below remain unbuilt as specced; note for item 2 that
> `nearMarkerWithin` now takes an explicit radius argument and the dot radii
> are deliberately tight (see "Net-Worth Chart: Time-True Axis & Touch Model"
> in technical-decisions before widening anything).

---

## 1. The First Breath ⭐ (mobile first-open reveal + verdict chip) — ship first
**Moment.** First open of a session on iPhone: the net-worth line strokes
itself left→right in ~1.1s, the decision dots rise oldest→newest along it
(stagger clamped to ~0.5s), and as the last dot settles the folded journal
entry fades in with a quiet mono stamp already on it — *"Spared €4.120 · 18
months on."* Play-once per session (`volnar:mobile-overview-revealed`);
reduced-motion gets a plain fade.

**Why.** The first thing the app ever animates is the decision memory, not the
balance. Highest differentiator-per-line-of-code on this list: the desktop
already shipped this gesture (see `first-3s-wow.md`) and the phone — the
primary surface — never got it.

**How.** `NetWorthChart` already implements everything (`revealLine` prop,
`nw-line-draw`, `nw-dot-rise`); mobile `PortfolioTab.tsx` just never passes the
prop. The keyframes live in `home-twilight.css` scoped to `.vhome` — move them
once to a shared scope, don't duplicate. `MobileDecisionJournal` already
prefetches the verdict while folded; never block on the fetch — reserve the
chip's slot and fade it in when it resolves. **Effort: small.**

## 2. Detents & Whispers (the scrub that only speaks where you acted)
**Moment.** Scrubbing the chart goes silent on ordinary points; crossing a
decision dot fires one firmer haptic notch — a machined detent exactly where a
decision lives — while the dot swells briefly (0.3s relax, no bounce) and the
peek box gains one truncated italic-serif line: the first sentence of the note
you wrote that day. Lift, and it's gone.

**Why.** The most literal rendering of "see the decision behind every number":
your stored words surface at the exact pixel where the decision happened.

**How.** `markerDots` + `nearMarkerWithin` are already computed in
`NetWorthChart.tsx`; `useChartHaptic.ts` already imports `ImpactStyle`; markers
carry the mutations that hold `personal_context`. Detent only `kind === "you"`
dots, dedupe per dot id, note line only when `hasOwnNote`. **Effort: small.**

## 3. The Seal Tears (perforation draws, verdict lands with a tap in the hand)
**Moment.** First open of a verdict per session: the dotted perforation draws
itself left→right (~0.5s, animated clip-path), then *"Looking back, 18 months
on —"* rises 4px with the gold figure simply present — no count-up — and a
single Light haptic fires as the sentence settles (`onAnimationEnd`, not a
timer). Closing is instant; opening is the event.

**Why.** The verdict is the moat's punchline; this makes revelation feel
authored — you tear the seal on your own past reasoning and the arithmetic is
underneath.

**How.** `VerdictBody` in `MobileDecisionJournal.tsx`; `.perforation` and the
currently-unused `lookback-rise` keyframe in `globals.css`; the existing
`@capacitor/haptics` pattern. Pure CSS sequencing plus one haptic call.
**Effort: small.**

## 4. The Anniversary Look-back ("One year ago today")
**Moment.** Open the app on the day a noted decision turns exactly N whole
years old, and the journal slot defaults to that entry instead of the newest:
mono eyebrow "ONE YEAR AGO TODAY", your own words in italic beneath, verdict
chip already stamped. Only on the day itself; only entries with a real note;
skipped when the newest decision is under ~48h old.

**Why.** Decision memory is only a moat if it resurfaces unprompted. Your
verbatim words returning on a meaningful date, graded by arithmetic, is
something no competitor can write — none of them stored the words.

**How.** Extract the anniversary matcher already in `DiaryTab.tsx` into a
shared lib so Diary and Overview agree; `activeMarkerId` already supports a
non-newest default; the verdict chip reuses the existing prefetch. No new API,
no migration. An APNs push is a v2 rider. **Effort: small.**

## 5. The Demo Confession (the Adyen entry unfolds itself)
**Moment.** A prospect enters the demo; after the First Breath settles, the
journal holds the seeded Adyen panic-sell ("I sold the panic instead of
sitting with a business I still believed in"), and ~1s later it unfolds itself
once — perforation, then *"Looking back, 2 years on — holding on would have
gained €X"*, computed from genuine ADYEN.AS closes. Exactly once per demo
session; unfolds only after the verdict resolves (warm it at seeding); always
the engine's own copy, never hard-coded regret.

**Why.** The whole thesis performs itself in 20 seconds on an honest, humbling
story — anti-hype credibility aimed exactly at the skeptical investor this
brand targets, and unstageable by any competitor's demo.

**How.** `demo-seed.ts` already seeds the real ticker, sell date and both
notes; verdict API + `decision_verdicts` cache; `MobileDecisionJournal`'s
auto-open-on-selection. Select by symbol + action, not mutation id. Ships
after #1 and #3 (it reuses both). **Effort: small, given #1 and #3.**

## 6. You Were Here (decisions pinned on the asset's own price mountain)
**Moment.** Open Nvidia from Holdings: the 3Y price chart carries two small
brass-ringed dots — your buy low on the slope, your trim near the peak. Tap
one: the line dims, your note from that day appears below in italic serif with
the verdict stamp. Default the range to the narrowest preset containing the
oldest decision so the wow is on-screen at open; scrub snaps to dots with the
existing haptic; one dot kind, no buy/sell colour coding.

**Why.** Every app shows the same price mountain; only this one shows where
you stood on it, with your reasoning attached — felt at the exact moment users
comparison-shop against Yahoo/Trading212 charts.

**How.** `TradeableDetail.tsx` already fetches the asset's mutations with
`occurred_at` + `personal_context`; the dot/tap pattern is proven in
`NetWorthChart`; verdicts from the shipped API + cache. New work is a
`markers` prop on `PriceChart.tsx`. **Effort: medium — the only medium here,
ranked last for that reason, kept because its differentiator power is
top-tier.**

---

**The thread that ties them.** Every item is the same sentence spoken on a
different surface: *your decisions are the only thing on this line that
matters, and the app will tell you, honestly, what they did.* None of them
adds a feature — each takes machinery Volnar already owns (the stored words,
the deterministic verdict engine, the marker system) and gives it one small,
slow, play-once gesture, so the product accrues the feel of a single
instrument: quiet everywhere, articulate exactly where you acted.

**Rejected on brand grounds** (for the record): percentile-milestone
"engravings" on the Perspective card — the benchmark tables are refreshed
annually, so a recomputed "crossing date" could silently move, which breaks
deterministic honesty. Also deferred as v2 candidates: a "while you were away"
return brief, Vitals band-change memory, a "ripening" verdict ring, and a
full-screen rewind on decision tap.
