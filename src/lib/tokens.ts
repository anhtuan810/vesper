export const tokens = {
  bg:           "#F5F1EA",
  surface:      "#FFFFFF",
  surfaceElev:  "#EBE4D6",
  border:       "rgba(26, 31, 46, 0.08)",
  borderStrong: "rgba(26, 31, 46, 0.16)",
  text:         "#1A1F2E",
  textDim:      "#6B7280",
  textFaint:    "#9CA3AF",
  hero:         "#0B0F18",
  accent:       "#4A7C5E",
  accentSoft:   "#DDEBE1",
  accentText:   "#2D5340",
  positive:     "#4A7C5E",
  positiveSoft: "#DDEBE1",
  positiveText: "#2D5340",
  negative:     "#B5564B",
  negativeSoft: "#F4DDD9",
  negativeText: "#8B3D33",
  navSurface:   "rgba(245, 241, 234, 0.92)",

  serif: "Source Serif 4",
  sans:  "Albert Sans",
  mono:  "Geist Mono",
} as const;

export type TokenKey = keyof typeof tokens;

export const TYPE_COLOR_TOKENS = {
  stocks:      "#4A7C5E",
  etf:         "#6D9F7E",
  crypto:      "#9B7E5F",
  bonds:       "#9B9486",
  gold:        "#B5924A",
  real_estate: "#5E7A6A",
  cash:        "#9CA3AF",
  pension:     "#7A9E8B",
  other:       "#9CA3AF",
} as const;

export const CATEGORY_COLOR_TOKENS = {
  property: "#4A7C5E",
  markets:  "#6B8AA6",
  reserves: "#B89968",
} as const;
