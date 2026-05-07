export const tokens = {
  bg: "#0A0A0B",
  surface: "#14141A",
  surfaceElev: "#1C1C24",
  border: "rgba(255, 255, 255, 0.06)",
  borderStrong: "rgba(255, 255, 255, 0.10)",
  text: "#F5F4EE",
  textDim: "#8A8A93",
  textFaint: "#54545E",
  accent: "#D4A574",
  accentSoft: "rgba(212, 165, 116, 0.12)",
  positive: "#6BAA75",
  negative: "#C97A6E",
} as const;

export type TokenKey = keyof typeof tokens;

export const TYPE_COLOR_TOKENS = {
  stocks:      "#D4A574",
  etf:         "#A89B7C",
  crypto:      "#9B7E5F",
  bonds:       "#8A8A93",
  gold:        "#D4A574",
  real_estate: "#7A9E8B",
  cash:        "#54545E",
  pension:     "#7A9E8B",
  other:       "#54545E",
} as const;
