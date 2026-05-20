// Utility helpers shared across the /api/chat route handler.

export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export const ALLOWED_CHIPS: ReadonlySet<string> = new Set([
  "Confirm and save",
  "No, let me correct it",
  "Use the proposed name",
  "I'll pick a different name",
  "Today",
  "Yesterday",
  "Skip — track from today",
  "Yes, add them",
  "No, leave as is",
  "Replace the previous one",
  "Add on top of it",
  // Clarify chips
  "Tell me units",
  "Tell me a value in USD",
  "Tell me a value in EUR",
  "Tell me a value in GBP",
  "I'll come back to it",
  "Entire position",
  "Part — tell me how much",
  "US (ASML)",
  "European (ASML.AS)",
  "EUR",
  "USD",
  "GBP",
  "Earlier — I'll type the date",
  "Use US TSLA",
  "Keep TL0.DE",
]);

// Chips that mean "go ahead and apply" — if the user sends one of these,
// skip the propose_change flow even if Claude mistakenly re-emits it.
export const CONFIRMATION_CHIPS: ReadonlySet<string> = new Set([
  "Confirm and save",
  "Use the proposed name",
  "Yes, add them",
  "Replace the previous one",
  "Add on top of it",
  "Today",
  "Yesterday",
  "Skip — track from today",
]);

export function sanitizeChips(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const cleaned = raw
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.trim())
    .filter((c) => ALLOWED_CHIPS.has(c));
  const safe = cleaned.filter((c) => !/[\$\[\]<>]/.test(c));
  if (safe.length < 2 || safe.length > 3) return null;
  return safe;
}

const TAG_RE = /<(changes|update|context|goal|propose_address|propose_venue|propose_change|suggested_replies|clarify)>[\s\S]*?<\/\1>/g;
export function stripTags(text: string) { return text.replace(TAG_RE, "").trim(); }
export function extractTag(text: string, tag: string) {
  return text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? null;
}

// Ensures user row always sorts before assistant row when both share the same
// DB-level now() value. The 1ms offset is enough for ORDER BY created_at.
export function timestampedPair(userRow: Record<string, unknown>, assistantRow: Record<string, unknown>) {
  const now = Date.now();
  return [
    { ...userRow,      created_at: new Date(now).toISOString() },
    { ...assistantRow, created_at: new Date(now + 1).toISOString() },
  ];
}
