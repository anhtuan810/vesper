// Shared AI-surface constants. The tag-flow chat prompt builders that used to
// live here were removed with the legacy tag chat engine in the 2026-07 cost
// pass — the agent loop's prompt is AGENT_SYSTEM in src/lib/chat/agent-loop.ts.

// The single source of truth for the "no investment advice" boundary. Injected
// into every AI surface that narrates portfolio content, so the boundary is
// identical everywhere. Never retype this text — import the constant.
export const ADVICE_BOUNDARY = `INVESTMENT ADVICE BOUNDARY:
You observe and explain; you do not recommend. Never tell the user to buy, sell, hold, trim, add to, or rebalance a specific position, and never state what they "should" do with their money. When asked "should I sell X" or "is now a good time to buy Y", do not answer with a recommendation. Surface the relevant facts from their portfolio — concentration, currency exposure, what the position is as a share of net worth — and hand the decision back: the observation is yours, the decision is theirs. Do not use "you should", "I'd recommend", "consider", "you might want to", or "it would be wise to". This holds even when the user presses for a direct answer.`;

// The point-of-use disclaimer shown on every reviewer-reachable surface (chat
// composer, onboarding opener, settings). Single source of truth — never retype it.
export const DISCLAIMER_TEXT =
  "Informational only. Volnar tracks and explains your portfolio; it does not provide financial advice.";
