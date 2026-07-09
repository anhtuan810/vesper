// Feature flag for the server-side tool-calling chat loop. Now ON by default: the
// agent loop (schema-validated tool calls + a reasoning loop) is the production
// chat engine, replacing the legacy tag-emission route. The kill switch is
// preserved — set CHAT_AGENT_LOOP=off (or "0"/"false"/"no") to fall straight back
// to the tag route with no deploy, or revert this default (main auto-deploys).
export function isAgentChatEnabled(): boolean {
  const v = (process.env.CHAT_AGENT_LOOP ?? "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

// Max Claude<->tool round-trips per user turn, to bound latency. Raised from 5 to
// 8 so a genuinely multi-step question (read holdings → resolve a symbol → run a
// scenario → relate it to net worth) can finish its reasoning instead of being cut
// off mid-chain. A simple turn still stops as soon as the model emits no tool call,
// so the ceiling costs nothing on ordinary replies.
export const AGENT_MAX_TOOL_ROUNDTRIPS = 8;

// The single source of truth for the chat model (tag flow, agent loop, and the
// scenario narration on chat replies), so it can't drift between paths and is a
// one-line change to revert. Opus 4.8 — maximum reasoning, which is the point:
// chat must handle whatever a real user types. It's slower and costlier per turn
// than Sonnet; if interactive latency ever bites, switch this to "claude-sonnet-5"
// (strong and faster) — nothing else changes.
export const CHAT_MODEL = "claude-opus-4-8";
