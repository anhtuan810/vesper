"use client";

// Scenario → chat handoff payload, stashed in sessionStorage and picked up by the
// chat surface (same mechanism as the insight-band seed). Figures are the
// pre-formatted display strings the engine produced — the narration may use only
// these for any number; `fallback` is the deterministic narration if the model drifts.

export interface ScenarioDiaryNote {
  date: string;
  note: string;
  market?: string;
}

export interface ScenarioHandoff {
  /** The summarising user turn shown in the thread. */
  userMessage: string;
  /** Context for the model (may include the figures, labelled). */
  description: string;
  /** The only numbers the narration may use, verbatim. */
  figures: string[];
  /** Deterministic narration served if the model emits a number outside `figures`. */
  fallback: string;
  /** Look back: the position's recorded decision reasoning. */
  diaryContext?: ScenarioDiaryNote[];
}

const KEY = "volnar.scenario.handoff";

export function stashHandoff(h: ScenarioHandoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(h));
  } catch {}
}

export function takeHandoff(): ScenarioHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as ScenarioHandoff;
  } catch {
    return null;
  }
}
