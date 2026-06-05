// Chip telemetry — deterministic classification + thin @vercel/analytics wrappers
// for chip_interaction / chip_impression. Client-only (track() is browser-side).
//
// GDPR hard rule: no consent gate exists in the app, so a chip's raw `label` is
// emitted ONLY for a closed, non-PII vocabulary (sendRawLabel === true).
// Everything else sends a stable, derived `label_template` and omits `label`.
// Scenario / disambiguation / unknown chips never leak the year, delta, ticker,
// or any computed figure.

import { track } from "@vercel/analytics";
import { CONFIRMATION_CHIPS } from "@/lib/chat-helpers";
import { seedKindForChip } from "@/lib/chat-seeds";
import type { ScenarioHandoff } from "@/lib/scenario/handoff";

export type ChipSurface =
  | "chat_suggested_reply"
  | "chat_seed"
  | "chat_empty_suggestion"
  | "scenario_cue";

export type ChipType =
  | "confirm"
  | "scenario"
  | "seed"
  | "venue"
  | "disambiguate"
  | "text"
  | "action";

export interface ChipClassification {
  chipType: ChipType;
  labelTemplate: string;
  sendRawLabel: boolean;
  seedKind?: string;
}

export interface ClassifyCtx {
  surface: ChipSurface;
  chipActions?: Record<string, ScenarioHandoff> | null;
}

// Closed, non-PII set of venue picker + scenario-confirm labels (venues.ts CHIPS
// values, plus SHOW_ME_CHIPS from the chat route). Venue names are not user data.
const VENUE_AND_SHOW_ME_LABELS: ReadonlySet<string> = new Set([
  "Amsterdam", "Xetra", "London", "Frankfurt", "Paris", "Milan", "Swiss",
  "Madrid", "Brussels", "Lisbon", "Nordic", "CEE", "Asia", "Pacific",
  "Americas", "I don't know",
  "Show me", "Change it",
]);

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

// Template variant that strips digits/currency before slugging, so even a "safe"
// template (e.g. an empty-state suggestion with a hardcoded amount) never carries
// a figure.
function slugifyNoFigures(s: string): string {
  return slugify(s.replace(/[0-9]/g, " "));
}

// Disambiguation chips embed the user's tickers/holdings ("US (ASML)",
// "Use US TSLA", "Keep TL0.DE"); the real ones carry live symbols, so match by
// shape, not literal, and never send the raw label.
function disambiguationTemplate(label: string): string | null {
  if (/^US \(.+\)$/.test(label) || /^European \(.+\)$/.test(label)) return "disambiguate_venue";
  if (/^Use US .+/.test(label) || /^Keep .+\..+$/.test(label)) return "disambiguate_ticker";
  return null;
}

export function classifyChip(label: string, ctx: ClassifyCtx): ChipClassification {
  // 1. Confirmation chips — closed, safe vocabulary.
  if (CONFIRMATION_CHIPS.has(label)) {
    return { chipType: "confirm", labelTemplate: slugify(label), sendRawLabel: true };
  }
  // 2. Seed chips carrying a pre-computed scenario handoff — user-derived figures.
  if (ctx.chipActions && ctx.chipActions[label]) {
    return { chipType: "scenario", labelTemplate: "scenario", sendRawLabel: false };
  }
  // 3. Static seed chips (onboarding / asset / insight) — closed, safe.
  if (ctx.surface === "chat_seed") {
    const kind = seedKindForChip(label);
    if (kind) return { chipType: "seed", labelTemplate: slugify(label), sendRawLabel: true, seedKind: kind };
  }
  // 4. Venue picker / scenario-confirm — closed, safe.
  if (VENUE_AND_SHOW_ME_LABELS.has(label)) {
    return { chipType: "venue", labelTemplate: slugify(label), sendRawLabel: true };
  }
  // 5. Disambiguation — embeds tickers/holdings; template only, no raw label.
  const dis = disambiguationTemplate(label);
  if (dis) return { chipType: "disambiguate", labelTemplate: dis, sendRawLabel: false };
  // 6. Empty-state suggestions are safe (amounts are hardcoded round numbers);
  //    Photo/File are static action labels.
  if (ctx.surface === "chat_empty_suggestion") {
    return { chipType: "text", labelTemplate: slugifyNoFigures(label), sendRawLabel: true };
  }
  if (label === "Photo" || label === "File") {
    return { chipType: "action", labelTemplate: slugify(label), sendRawLabel: true };
  }
  // 7. Unknown — treat as possibly-PII: generic template, never the raw label.
  return { chipType: "text", labelTemplate: "text", sendRawLabel: false };
}

export interface ChipEventPayload {
  surface: ChipSurface;
  chipType: ChipType;
  position: number;
  labelTemplate: string;
  /** Sent ONLY when the classification marked the label safe (closed vocab). */
  label?: string;
  seedKind?: string;
  /** A real message id when available; never a content hash (that stays local). */
  messageId?: string;
}

// Build the flat, snake_case props object, omitting absent optionals.
function buildProps(p: ChipEventPayload): Record<string, string | number> {
  const props: Record<string, string | number> = {
    surface: p.surface,
    chip_type: p.chipType,
    position: p.position,
    label_template: p.labelTemplate,
  };
  if (p.label != null) props.label = p.label;
  if (p.seedKind != null) props.seed_kind = p.seedKind;
  if (p.messageId != null) props.message_id = p.messageId;
  return props;
}

export function trackChipInteraction(p: ChipEventPayload): void {
  track("chip_interaction", buildProps(p));
}

export function trackChipImpression(p: ChipEventPayload): void {
  track("chip_impression", buildProps(p));
}

// Session-scoped "rendered once" dedup. Module-level Set is the source of truth;
// it is hydrated from / persisted to sessionStorage (existing volnar.* namespace)
// so a within-tab reload doesn't re-fire impressions.
const STORAGE_KEY = "volnar.chip.impressions";
const seen = new Set<string>();
let hydrated = false;

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) for (const k of JSON.parse(raw) as string[]) seen.add(k);
  } catch {}
}

/** Returns true only the first time `key` is seen this session. */
export function markImpression(key: string): boolean {
  hydrate();
  if (seen.has(key)) return false;
  seen.add(key);
  try {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
    }
  } catch {}
  return true;
}

// Cheap, stable content hash — used to key impressions when a message has no id
// (freshly-streamed assistant messages and synthetic seeds). Never sent.
export function cheapHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
