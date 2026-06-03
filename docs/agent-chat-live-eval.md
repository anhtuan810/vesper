# Agent chat — live conversation eval (manual)

The server-side tool-calling loop (`src/lib/chat/agent-loop.ts`, tools in
`src/lib/chat/agent-tools.ts`) is **behind the flag `CHAT_AGENT_LOOP`, OFF by
default**. The deterministic layer it wraps is covered by the `verify-*` scripts
in the sandbox. What those **cannot** cover is the conversational behaviour —
does Claude reason over the thread, call the right tools, and keep continuity
across follow-ups and corrections? That needs an `ANTHROPIC_API_KEY` and a seeded
DB, so it is run **by hand** and is the gate before flipping the flag on in
production.

## Setup

1. Apply the migration `supabase/migrations/20260605_messages_tool_result.sql`
   (adds `messages.tool_result jsonb`). **Required before enabling** — the loop
   persists the card there.
2. Set `CHAT_AGENT_LOOP=on` in the environment (dev first).
3. Seed a test user holding e.g. **NVIDIA (NVDA)**, **Bitcoin (BTC)**, a **Home**
   (real estate, mortgaged), and **Savings** (cash).

## Continuity / stutter cases (the point of this change)

| # | Send | Expect |
|---|------|--------|
| 1a | "what if I bought BTC 2 years ago" | `hypothetical_buy` tool → standalone-growth card + a sentence relating the value to current net worth (the tool returns `currentNetWorth` / `valueVsNetWorth`). |
| 1b | (then) "how does this affect my total net worth?" | Understood as a **follow-up** to 1a — answered from the same result/net-worth framing, **not re-asked** and not treated as a new buy. |
| 2a | "what if I have no NVIDIA" | `counterfactual` look-back on the held NVDA. |
| 2b | (then) "I held it since Jan 2025" | Understood as **refining the period** (or a graceful "I can only look back over your recorded holding") — **NOT** a remove-NVDA present scenario. |
| 3 | "I sold 2 ASML" | `propose_mutation` → resolved proposal + confirm chips, **no write**. |
| 3b | (then) "Confirm and save" | `commit_mutation` → `applyPortfolioChanges` writes, a **mutation row is logged** (every-change-logs-a-mutation invariant), assets refresh. |
| 4 | A mid-thread correction, e.g. after a projection: "no, make it €1,000 a month" | Understood **in context** — re-runs `future_projection` with the corrected contribution, not a fresh cold start. |

## Other checks

- "what if I'd bought 1 BTC 5 years ago" → **one bitcoin** (units), not €1
  (the tool + gate enforce units-vs-amount; "€1 in BTC" → the tool asks).
- "what if markets drop 20%" / "what if I add €1,500/month for 10 years" /
  "what would it take to reach €1.5M by 2040" → the matching read-only tool, with
  a card; numbers stated match the card (final narration passes the guardrail).
- Reload mid-thread → the scenario cards **rehydrate** from `tool_result`.
- An ambiguous or unresolvable reference → the model **asks** (a tool returned
  `needsClarification`) and does not compute.

## Known gaps to verify by hand

- `commit_mutation` reuses `validatePortfolioChanges` + `applyPortfolioChanges`
  but does **not** run the real-estate address-geocoding gate that the tag path
  applies. For now, prefer the tag path (flag OFF) for property adds, or confirm
  geocoding behaviour before relying on the loop for real estate.

## Rollback

Set `CHAT_AGENT_LOOP` back to off (or unset). The tag-emission route is intact
and shares the commit code, so the cutover is instant — important because main
auto-deploys to prod. **Leave the flag OFF until this eval passes.**
