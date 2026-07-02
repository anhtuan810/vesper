// Static light-mode mirror of the Nocturne palette (globals.css [data-theme="light"]).
// JS literals can't follow the data-theme switch, so these carry the light values;
// keep them in sync with globals.css when the palette changes. -soft values are
// the opaque-over-white approximations of the CSS rgba() tokens.
export const tokens = {
  bg:           "#F6F5F1",
  surface:      "#FFFFFF",
  surfaceElev:  "#EDEBE4",
  border:       "rgba(32, 27, 16, 0.09)",
  borderStrong: "rgba(32, 27, 16, 0.16)",
  text:         "#26221A",
  textDim:      "#5C564A",
  textFaint:    "#8C8574",
  hero:         "#17130A",
  accent:       "#9C7A37",
  accentSoft:   "#F1ECDE",
  accentText:   "#7E6026",
  positive:     "#2E8B5E",
  positiveSoft: "#E4F0EA",
  positiveText: "#277A52",
  negative:     "#B4502E",
  negativeSoft: "#F4E7E1",
  negativeText: "#9A4326",
  navSurface:   "rgba(246, 245, 241, 0.85)",
  surfaceDeep:  "#E9E7DF",
  accentDeep:   "#7E6026",
  negativeDep:  "#7E3A22",
  amber:        "#B07A2E",
  amberDeep:    "#8A5E22",
  amberSoft:    "rgba(176, 122, 46, 0.13)",

  serif: "Spectral",
  sans:  "Inter",
  mono:  "IBM Plex Mono",
} as const;

export type TokenKey = keyof typeof tokens;

// Categorical asset palette for the Nocturne light ground — kept hue-separated
// (markets = green, property = steel-blue, crypto = amber, reserves = olive,
// gold/brass = accent) so charts stay readable against the brass accent.
export const TYPE_COLOR_TOKENS = {
  stocks:      "#3E8E6B",
  etf:         "#5C9E7C",
  crypto:      "#C2832F",
  bonds:       "#8C7B5E",
  gold:        "#9C7A37",
  real_estate: "#4E7398",
  cash:        "#948A66",
  pension:     "#6E8C72",
  other:       "#9A958A",
} as const;

export const CATEGORY_COLOR_TOKENS = {
  property: "#4E7398",
  markets:  "#3E8E6B",
  reserves: "#948A66",
  crypto:   "#C2832F",
} as const;
