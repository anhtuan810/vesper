# Volnar — Feature Roadmap (competitive)

Source: a multi-lens product/strategy pass (2026-06-28). The unifying theme:
**connect what already exists.** Volnar already stores the *reasoning* behind every
change, and already owns a counterfactual engine, a time-scrub, and historical
position reconstruction — but they're siloed. The moat is "see the decision behind
every number"; the highest-leverage work is making that moat *felt*, not just stored.

> **Top recommendation:** ship **Decision Verdict**, fed by **alerts-as-journal-prompts**,
> revealed with the **first-3s line-draw WOW** (see `first-3s-wow.md`) — as one coherent
> "the moat, made felt" release.

Status note: **Decision Verdict** is being implemented first (v1). The rest are
specced here to start in their own chats.

---

## 1. Decision Verdict ⭐ (being built)
**What.** On any closed or reduced position, run the existing counterfactual engine
(`src/lib/scenario/counterfactual.ts` → `counterfactualRemove` / `reconstructPositionSeries`)
over a fixed lookback (since-the-decision / 1Y / 3Y) and stamp the entry with a calm
mono eyebrow: *"Looking back · 18 months on"* + one sentence + the deterministic figure
(*"This sell spared you €4,120"* / *"Holding would have made €1,890"*), with an
assumptions disclosure. **No score, no gamification** — an editorial post-mortem sitting
next to the reasoning the user wrote.

**Why.** The one feature no competitor can ship: Copilot, Monarch, Empower, Kubera store
what you *have*, not *why*; Sharesight grades against a benchmark, not your own thesis.
Volnar already owns both halves (written reasoning + `counterfactual.ts`) and isn't
connecting them. Converts the moat into a payoff the user feels; makes the journal feel
alive rather than archival.

**Effort:** M. **Surfaces:** the selected-entry panel in `OverviewContent.tsx`, the
journal entry rows, and the asset detail.

---

## 2. Alerts reframed as journal prompts (the capture mechanism)
**What.** Replace any price-alert framing with one calm prompt at the moment it matters —
a Vital crossing a band, a material holding move, or an auto market-swing entry:
*"Want to note why?"* writes straight into the journal as a dated entry. Let the existing
"No action taken — recorded automatically" market-swing card be annotated in two taps
("held on purpose" / "didn't notice").

**Why.** Alerts are a commodity everyone pings on. Reframing captures reasoning at the
emotional peak (crash/spike) when it's most honest, stays anti-hype, and feeds every other
bet here — Verdicts, conviction, coaching all get richer with more annotated entries.
Nearly free given the swing entries already exist. **Foundational — build right after Verdict.**

**Effort:** S–M.

---

## 3. Volnar as portfolio coach (proactive, journal-grounded)
**What.** Make the reactive chat rail a low-frequency coach: read the Vitals bands,
conviction data, and unaddressed swing entries, then open with **one** editorial
observation framed as a question that cites the user's own past words
(*"Your concentration crept past 35% after the Nvidia add in April — still comfortable?"*).
One question per session, not a stream.

**Why.** Every competitor's AI is transaction-chat ("how much on coffee"). A coach that
interrogates *investing reasoning*, grounded in a longitudinal journal, is unoccupied
territory and on-brand for an audience that distrusts hype.

**Effort:** M–L. **Depends on:** the chat rail (`WebShell` + `useChatSession`).

---

## 4. Scenario Replay (stand inside a past swing)
**What.** Upgrade auto market-swing entries with "Replay this": seed the existing
what-if/projection engine (`explore.ts` / `projection.ts`) with the portfolio **as held**
on that date (`reconstructPositionSeries`) and ask a journal-framed question —
*"In the March drawdown you held. What if you'd trimmed 20%?"*

**Why.** Volnar already has the rare assets — historical reconstruction, a forward cone,
time-scrub — siloed in chat. No competitor lets you replay alternate histories against
your real past book at real prices. Makes the time axis interactive.

**Effort:** M.

---

## 5. Conviction dial on every decision
**What.** At logging time, capture a calm three-step conviction
(*hunch / considered / high-conviction*) on the mutation. Render high-conviction dots
slightly bolder on the line; pair with the Verdict to surface the pattern
(*"Your high-conviction sells have outperformed your hunches"*).

**Why.** Conviction/calibration tracking (superforecaster territory) is absent across the
whole comp set. Turns Volnar from a record into a feedback instrument for the thing serious
investors most want to improve.

**Effort:** M (needs a mutation field + a logging-flow step).

---

## 6. Export a single decision as an editorial "memo"
**What.** Export one entry — reasoning, as-of holdings, the chart snippet around that date,
and (once shipped) the Verdict — as a typeset PDF/image in the Twilight palette (Fraunces
headline, mono eyebrow, gold dot), with a net-worth redaction toggle so no totals are
required.

**Why.** Kubera shares balances, Sharesight exports tax reports — none export a *decision*
as a narrative artifact. A zero-CAC, perfectly on-brand growth loop: a serious investor
sharing one gorgeously-set memo is the best possible ad.

**Effort:** M.

---

## Technical improvements (parallel track — see also the audit backlog)
**P0**
- **Stream the chat rail** — prose turns token-by-token; keep mutation/scenario branches buffered. Highest leverage; calm is not slow.
- **Test the reconciliation math** — property-based tests: `sum(bands) == line`, `hero(selected) == chart value at index`. Cheap insurance on the one thing that can't be wrong.
- **CI-apply migrations + drift check** — ~25 hand-applied `.sql` files; "main always deployable" is unverified for the schema half.

**P1**
- Database-typed Supabase client (kills ~40 `as` casts; tsc enforces for free).
- Fold `entitledGate` + `demoExpiredGate` into one query; stop the Overview double-loading `/api/snapshots`.
- **Native demo parity** — the per-browser trial fix is web-cookie-only; native gets a fresh hour per re-entry. Anchor to a Capacitor device id before flipping `DEMO_ENABLED` on.
- Decompose the 880-line `NetWorthChart` into a headless geometry hook + thin views (unlocks the reconciliation tests).
- Chart/scrub accessibility (SVG role/label; dots are pointer-only) — EU "Private" positioning carries reg exposure.

**Audit backlog (low/dormant)** — demo-entry rate limit before enabling the demo; `replaceStoredSwings` atomicity; stored-swing staleness/currency bound; diary deep-link pagination dead-end (>100 mutations).
