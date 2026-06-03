# Add / edit flow — manual (live) checks

The cost-basis vs current-value separation is covered deterministically by
`scripts/verify-cost-basis.ts` (and the server reuses it via
`src/lib/cost-basis.ts`). The conversational contract lives in the `claude.ts`
prompt and can only be exercised **live** (needs `ANTHROPIC_API_KEY` + DB), so
run these by hand against a dev environment.

## The contract (what to confirm)

1. **Record first, basis second.** A stated add commits (or reaches its
   confirmation gate) immediately with what's known; the basis question only ever
   comes *after* the position is recorded, and is optional.
2. **Basis is optional and non-blocking** — answer it → applied as a buy_price /
   buy_date edit; skip it → position stays as recorded. It never blocks, loops, or
   re-asks.
3. **"Bought N more"** is one immediate edit on the existing position; prior lots
   are not reprocessed.
4. **Truthful success** — "Done/Recorded/Saved" only after the commit fires.
5. **No re-asking** anything already provided in the thread.
6. **Value vs cost basis** — a cost-basis/historical-price update sets
   buy_price/buy_date only; current value stays units × current market price.
7. **Read questions** are answered from holdings, never as add elicitation.

## Cases

| # | Send | Expect |
|---|------|--------|
| 1 | "I have 100 NVIDIA" | Position **committed immediately** at current market value (units 100). One optional basis follow-up after. "Done" only on the committing turn. |
| 1a | (then) answer the follow-up: "bought them in Jan 2020" | A buy_date edit (basis only); the 100 shares and current value are **unchanged** (value stays ~market, NOT the 2020 cost). |
| 1b | (alt) skip the follow-up: "no" / "skip" | Position stays as recorded; no loop, no re-ask. |
| 2 | "Bought 30 more NVIDIA yesterday" (100 held) | Becomes **130 immediately**, valued at market; the original 100 is not reprocessed; no lot-by-lot prompts. |
| 3 | "How many NVIDIA do I have now?" | Answers the count from holdings; **no** elicitation, no add. |
| 4 | Correct the buy date on a held position ("I bought NVDA on 2 Jan 2020") | buy_date (and buy_price from the historical close) recorded; **units fixed, current value unchanged at market** — never collapses to the historical figure (the $29,167 corruption). |
| 5 | "Add €5,000 of NVDA" (value-mode) | Reaches the confirmation gate immediately (propose → confirm → commit); on confirm, units derived at live price, value at market. |

## Sanity outcomes

- No turn ever says "Done"/"Recorded" without a write that turn.
- A basis correction never changes the share count or the current value.
- No question is re-asked once answered; a read question never starts an add loop.
