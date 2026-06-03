# Scenario classification — manual (live) check list

Every portfolio-changing what-if now returns ONE answer: the **whole portfolio
before → after** (net worth, distribution, single-name concentration, and up to
two contextual vitals the move changes). The kinds collapsed: present,
counterfactual, and hypothetical_buy are now a single `portfolio_change`; a
hypothetical past purchase is just a buy valued at TODAY's price (no growth
curve). `future` (the cone) stays the one separate forward answer.

The deterministic layer — the validation gate, the before→after readout, and the
resolvers — is covered by `scripts/verify-scenario-intent.ts` and
`scripts/verify-portfolio-readout.ts` (plus the per-engine `verify-*` scripts).
Those run in the sandbox with no API key or DB.

What **cannot** run in the sandbox is the **live classification harness**: does
Claude emit the right `<scenario>` block, and route a *stated completed action*
to a mutation rather than a scenario? That needs an `ANTHROPIC_API_KEY` and a
seeded DB, so it is run **by hand**.

## How to run by hand

1. Point a dev build at a test user holding e.g. **NVIDIA (NVDA)**, **Bitcoin
   (BTC)**, a **Home** (real estate, mortgaged), and **Savings** (cash).
2. Send each phrasing; confirm the routing (server logs) and the rendered card.
3. The gate is the backstop: an implausible/unresolvable parameter must **ask**,
   never compute a confident wrong answer.

## Representative phrasings

| # | Phrasing | Expected |
|---|----------|----------|
| 1 | "what if I buy 2 BTC" | `portfolio_change` (buy, units 2) → **portfolio before → after**; concentration + **drawdown** surface, leverage/liquidity suppressed |
| 2 | "what if the market drops 30%" | `portfolio_change` (shock markets 30) → before → after; net worth + distribution shift, drawdown moves |
| 3 | "what if I'd bought 2 BTC 2 years ago" | `portfolio_change` (buy, units 2) — valued at **today's price**; same before → after card, NO growth curve |
| 4 | "what if I put €5,000 into Nvidia" | `portfolio_change` (buy, amount 5000 EUR) → before → after |
| 5 | "what if I'd put €1 in BTC" | gate **clarifies** ("1 BTC units, or €1?") — sub-floor amount, likely units |
| 6 | "what if I sell €40k of Nvidia" | `portfolio_change` (sell) → before → after |
| 7 | "what if I pay €50k off the mortgage" | `portfolio_change` (pay_mortgage) → **leverage + liquidity** surface, drawdown suppressed |
| 8 | "what if I had no Nvidia" | `portfolio_change` (remove/sell NVIDIA) → before → after |
| 9 | "what if I'd bought 100 shares of Tesla" | `portfolio_change` (buy units 100); Tesla not held → resolves via market, added at today's price |
| 10 | "what if I buy Xyzzy" | gate **clarifies** (symbol unresolvable) — no card |
| 11 | "what if I add €1,500 a month for 10 years" | `future` trajectory → the cone |
| 12 | "what would it take to reach €1.5M by 2040" | `future` solve |
| 13 | "I sold 2 ASML yesterday" | **mutation** via `<changes>`/`<propose_change>` — NOT a scenario |
| 14 | "buy 2 BTC" (just a quantity) | units = 2 (a bare number next to an asset is a QUANTITY, not money) |
| 15 | "what if crypto crashes 50%" | `portfolio_change` (shock crypto 50) → before → after |

## Sanity outcomes to verify

- #1, #2, #3 all render the **portfolio before → after** card — net worth + a
  before/after allocation bar that visibly shifts + concentration + the right
  contextual vitals. No single-asset growth or regret line charts anywhere.
- #1/#3: a crypto buy surfaces **concentration + drawdown**; #7: a mortgage
  paydown surfaces **leverage + liquidity**. Vitals that don't move are hidden.
- #3 uses today's price (it is identical to #1 — the "2 years ago" is ignored).
- #5 and #10 **ask**, no card.
- #13 changes the portfolio (mutation) and never emits `<scenario>`.
- Card figures match the narration (numeric guardrail), nl-NL, display currency.
