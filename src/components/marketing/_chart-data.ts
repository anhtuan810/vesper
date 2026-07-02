// Non-text metadata for the 12 chart entries — identical across locales, so it
// stays in code. The localized copy (date, title, readout, pipeline text) lives
// in the i18n dictionaries (m.mech.entries), joined to these by index.

export type EntryMeta = {
  nw: string; // net-worth value (a number, same in every locale)
  tag: "user" | "auto";
  kind: "milestone" | "market" | "dec";
  impc: "up" | "dn";
  sym: string; // symbol chip code for "you" decisions ("" for automatic entries)
};

export const ENTRY_META: EntryMeta[] = [
  { nw: "€754.460", tag: "auto", kind: "milestone", impc: "up", sym: "" },
  { nw: "€862.553", tag: "auto", kind: "market", impc: "dn", sym: "" },
  { nw: "€869.106", tag: "user", kind: "dec", impc: "up", sym: "€" },
  { nw: "€763.017", tag: "user", kind: "dec", impc: "up", sym: "VW" },
  { nw: "€819.486", tag: "auto", kind: "market", impc: "dn", sym: "" },
  { nw: "€878.163", tag: "user", kind: "dec", impc: "up", sym: "MG" },
  { nw: "€1.076.408", tag: "auto", kind: "market", impc: "dn", sym: "" },
  { nw: "€1.157.056", tag: "auto", kind: "market", impc: "up", sym: "" },
  { nw: "€1.152.035", tag: "user", kind: "dec", impc: "up", sym: "NV" },
  { nw: "€1.197.759", tag: "auto", kind: "milestone", impc: "up", sym: "" },
  { nw: "€1.198.821", tag: "user", kind: "dec", impc: "up", sym: "₿" },
  { nw: "€1.290.083", tag: "auto", kind: "market", impc: "dn", sym: "" },
];

// Symbol → swatch colour for the "writes the entry" chip — the app's shared
// category tokens, so the chips match the chart bands in both themes.
export const SYMBOL_COLORS: Record<string, string> = {
  NV: "var(--cat-markets)", AS: "var(--cat-markets)", VW: "var(--cat-markets)",
  "₿": "var(--cat-crypto)", MG: "var(--cat-property)", "€": "var(--cat-reserves)", Au: "var(--cat-tangible)",
};

// The generic chat chip always shows NVIDIA's swatch.
export const GENERIC_CHAT_SYM = "NV";
