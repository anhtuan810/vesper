# Scenario classification — manual (live) check list

The deterministic layer — the validation gate, resolvers, date resolver, and
units/amount normalizer — is covered by `scripts/verify-scenario-intent.ts`
(plus the per-engine `verify-*` scripts). Those run in the build sandbox with no
API key or DB.

What **cannot** run in the sandbox is the **live classification harness**: does
Claude emit the right `<scenario>` block (correct `kind` and parameters) for
representative phrasings, and — critically — does it route a *stated completed
action* to a mutation rather than a scenario? That needs an `ANTHROPIC_API_KEY`
and a seeded DB (held positions to resolve against), so it is run **by hand**
against a dev environment.

## How to run by hand

1. Point a dev build at a test user whose portfolio holds, e.g., **NVIDIA
   (NVDA)**, **Bitcoin (BTC)**, a **Home** (real estate, with a mortgage), and
   **Savings** (cash).
2. Send each phrasing below in chat. Confirm the **expected routing** — inspect
   the emitted `<scenario>`/`<changes>` tag (server logs) and the rendered card.
3. The deterministic gate is the backstop: even on a misread, an implausible or
   unresolvable parameter must **ask**, never compute a confident wrong answer.

## ~15 representative phrasings

| # | Phrasing | Expected routing |
|---|----------|------------------|
| 1 | "what if I'd bought 1 BTC 5 years ago" | `hypothetical_buy`, **units = 1** (one bitcoin — NOT €1) |
| 2 | "what if I'd put €5,000 into Nvidia in 2020" | `hypothetical_buy`, amount = 5000, currency EUR, buyDateHint 2020 |
| 3 | "what if I'd put €1 in BTC" | `hypothetical_buy` → gate **clarifies** (sub-floor amount, likely units) |
| 4 | "what if I'd bought Apple a decade ago" | `hypothetical_buy`, no amount → default €10,000 stated |
| 5 | "what if I'd bought 100 shares of Tesla in 2019" | `hypothetical_buy`, units = 100 (Tesla not held — still resolves via market) |
| 6 | "imagine I'd invested in Dogecoin 3 years ago" | `hypothetical_buy`, symbolHint Dogecoin → DOGE-USD |
| 7 | "what if I'd never bought Nvidia" | `counterfactual` (HELD look-back), asset NVIDIA |
| 8 | "what did Bitcoin make me" | `counterfactual`, asset Bitcoin |
| 9 | "what if I'd bought my Nvidia 5 years earlier" | `hypothetical_buy` (a *purchase* what-if, even though held) |
| 10 | "what if I sell €40k of Nvidia into VWCE" | `present`, sell + add modifications |
| 11 | "what if I pay €50k off the mortgage" | `present`, payMortgage |
| 12 | "what if I add €1,500 a month for 10 years" | `future` trajectory, contribution 1500 monthly |
| 13 | "what would it take to reach €1.5M by 2040" | `future` solve, target 1.5M, year 2040 |
| 14 | "I sold 2 ASML yesterday" | **mutation** via `<changes>`/`<propose_change>` — NOT a scenario |
| 15 | "what if I'd bought Xyzzy in 2018" | `hypothetical_buy` → gate **clarifies** (symbol unresolvable) |

## Sanity outcomes to verify

- #1 grows **one bitcoin**, not a €1 investment.
- #3 and #15 **ask a clarifying question** and do not render a card.
- #14 changes the portfolio (mutation), and never emits `<scenario>`.
- Every computed card shows figures consistent with the narration (guardrail),
  and hypothetical-buy framing is standalone growth — never overlaid on net worth.
