// Configuration for the server-side tool-calling chat loop — the only chat
// engine. (The legacy tag-emission route and its env kill switch were removed
// in the 2026-07 cost pass; revert that commit to restore them.)

// Max Claude<->tool round-trips per user turn, to bound latency AND per-turn
// model spend (each round-trip is a full model call over the growing thread).
// Lowered from 8 to 4 in the 2026-07 cost pass: most real turns finish in 1-3
// rounds, and a turn that genuinely needs more now ends with an explicit
// "say continue" hand-off (see agent-loop) instead of failing silently — the
// next turn resumes with the conversation context intact.
export const AGENT_MAX_TOOL_ROUNDTRIPS = 4;

// The single source of truth for the chat model (agent loop and the eval),
// so it can't drift between paths and is a one-line change to revert.
// Sonnet 5 — near-Opus quality on tool-calling chat at a fraction of the cost
// (2026-07 cost pass; was "claude-opus-4-8"). If answer quality ever bites,
// switch back to "claude-opus-4-8" — nothing else changes. Scenario narration
// (src/lib/scenario/narrate.ts) deliberately keeps its own Opus pin.
export const CHAT_MODEL = "claude-sonnet-5";
