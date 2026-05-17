export const VENUE_LABEL: Record<string, string> = {
  DE: "Xetra",
  F: "Frankfurt",
  AS: "Amsterdam",
  L: "London",
  PA: "Paris",
  MI: "Milan",
  MC: "Madrid",
  BR: "Brussels",
  LS: "Lisbon",
  SW: "Swiss",
  ST: "Nordic",
  HE: "Nordic",
  OL: "Nordic",
  CO: "Nordic",
  VI: "CEE",
  WA: "CEE",
  HK: "Asia",
  T: "Asia",
  SI: "Asia",
  KS: "Asia",
  KQ: "Asia",
  AX: "Pacific",
  NZ: "Pacific",
  TO: "Americas",
  V: "Americas",
  SA: "Americas",
  MX: "Americas",
  BA: "Americas",
};

export function venueLabel(symbol: string): string | null {
  const dot = symbol.lastIndexOf(".");
  if (dot === -1) return null;
  const suffix = symbol.slice(dot + 1);
  return VENUE_LABEL[suffix] ?? null;
}

const PRIORITY: Record<string, string[]> = {
  NL: ["AS", "DE", "L", "MI", "PA", "F", "SW"],
  DE: ["DE", "F", "AS", "L", "MI", "PA", "SW"],
  FR: ["PA", "DE", "AS", "L", "MI", "F", "SW"],
  IT: ["MI", "DE", "AS", "L", "PA", "F", "SW"],
  GB: ["L", "DE", "AS", "MI", "PA", "F", "SW"],
  CH: ["SW", "DE", "L", "AS", "MI", "PA", "F"],
  ES: ["MC", "DE", "AS", "L", "MI", "PA", "F"],
  BE: ["BR", "AS", "DE", "L", "MI", "PA", "F"],
  PT: ["LS", "AS", "DE", "L", "MI", "PA", "F"],
  AT: ["VI", "DE", "AS", "L", "MI", "PA", "F"],
};

const DEFAULT_PRIORITY = ["DE", "AS", "L", "MI", "PA", "F", "SW"];

export function venuePriorityFor(country: string): string[] {
  return PRIORITY[country] ?? DEFAULT_PRIORITY;
}

const CHIPS: Record<string, string[]> = {
  NL: ["Amsterdam", "Xetra", "London", "I don't know"],
  DE: ["Xetra", "Frankfurt", "Amsterdam", "I don't know"],
  FR: ["Paris", "Xetra", "Amsterdam", "I don't know"],
  IT: ["Milan", "Xetra", "Amsterdam", "I don't know"],
  GB: ["London", "Xetra", "Amsterdam", "I don't know"],
  CH: ["Swiss", "Xetra", "London", "I don't know"],
  ES: ["Madrid", "Xetra", "Amsterdam", "I don't know"],
};

const DEFAULT_CHIPS = ["Amsterdam", "Xetra", "London", "I don't know"];

export function venueChipsFor(country: string): string[] {
  return CHIPS[country] ?? DEFAULT_CHIPS;
}
