// Feature flag for the server-side tool-calling chat loop. OFF by default so the
// proven tag-emission route stays live; flipping CHAT_AGENT_LOOP=on (or "1"/"true")
// routes chat through the agent loop. Keep this the single source of truth so
// rollback is one env change (main auto-deploys to prod).
export function isAgentChatEnabled(): boolean {
  const v = (process.env.CHAT_AGENT_LOOP ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

// Max Claude<->tool round-trips per user turn, to bound latency.
export const AGENT_MAX_TOOL_ROUNDTRIPS = 5;

// The single source of truth for the chat model (tag flow, agent loop, and the
// scenario narration on chat replies), so it can't drift between paths and is a
// one-line change to revert. Sonnet 5 replaces Sonnet 4.6 — a stronger model
// follows the rulebook and emits cleaner tool calls/JSON, which is the fastest
// reliability win while the agent-loop migration is validated. Change here to try
// Opus (claude-opus-4-8) for maximum reasoning at higher latency/cost.
export const CHAT_MODEL = "claude-sonnet-5";
