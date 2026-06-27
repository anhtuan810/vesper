// Static light-mode mirror of the Twilight palette (globals.css [data-theme="light"]).
// JS literals can't follow the data-theme switch, so these carry the light values;
// keep them in sync with globals.css when the palette changes.
export const tokens = {
  bg:           "#F3ECE0",
  surface:      "#FCF8F0",
  surfaceElev:  "#F2ECDF",
  border:       "rgba(34, 30, 38, 0.08)",
  borderStrong: "rgba(34, 30, 38, 0.13)",
  text:         "#221E26",
  textDim:      "#7C7268",
  textFaint:    "#8C8478",
  hero:         "#1A1A24",
  accent:       "#97703D",
  accentSoft:   "#EBDFCB",
  accentText:   "#8F6A38",
  positive:     "#97703D",
  positiveSoft: "#EBDFCB",
  positiveText: "#8F6A38",
  negative:     "#AF5530",
  negativeSoft: "#EDD9CC",
  negativeText: "#8A3F22",
  navSurface:   "rgba(243, 236, 224, 0.85)",
  surfaceDeep:  "#E7DFD0",
  accentDeep:   "#6F5226",
  negativeDep:  "#7E3A1F",
  amber:        "#B07A2E",
  amberDeep:    "#8A5E22",
  amberSoft:    "rgba(176, 122, 46, 0.13)",

  serif: "Fraunces",
  sans:  "Inter",
  mono:  "IBM Plex Mono",
} as const;

export type TokenKey = keyof typeof tokens;

// Categorical asset palette, warmed to the Twilight light ground — kept
// hue-separated (steel / gold / olive / brick / tan / neutral) so charts stay
// readable now that the brand accent is gold.
export const TYPE_COLOR_TOKENS = {
  stocks:      "#5E7488",
  etf:         "#7E92A6",
  crypto:      "#B0552F",
  bonds:       "#8C7B5E",
  gold:        "#97703D",
  real_estate: "#5E6A4A",
  cash:        "#9A8F82",
  pension:     "#7A8C6A",
  other:       "#A89F90",
} as const;

export const CATEGORY_COLOR_TOKENS = {
  property: "#5E6A4A",
  markets:  "#5E7488",
  reserves: "#97703D",
  crypto:   "#B0552F",
} as const;
