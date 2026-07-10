// Stroked line icons for the asset classes, drawn in the app's icon language
// (24-unit viewBox, currentColor stroke, round caps — same family as the
// BottomNav / EmptyState icons). Replaces platform emoji, which render
// differently on every OS and read as toy-like next to the brand chrome.

interface IconProps {
  size?: number;
  strokeWidth?: number;
}

function Svg({ size = 20, strokeWidth = 1.7, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function PropertyIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.8 9.5V20h12.4V9.5" />
      <path d="M9.8 20v-5.4h4.4V20" />
    </Svg>
  );
}

export function StocksIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 20.5V3.5" />
      <path d="M3.5 20.5h17" />
      <path d="M6.5 15.5l4.2-4.6 3 2.6 5.3-6" />
      <path d="M15.6 7.2h3.4v3.4" />
    </Svg>
  );
}

export function CashIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.8" y="7" width="18.4" height="10.5" rx="2" />
      <circle cx="12" cy="12.25" r="2.6" />
      <path d="M6.2 12.25h.01M17.8 12.25h.01" />
    </Svg>
  );
}

export function CryptoIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M10 7.6v8.8" />
      <path d="M10 7.6h2.9a2.1 2.1 0 0 1 0 4.2H10" />
      <path d="M10 11.8h3.3a2.3 2.3 0 0 1 0 4.6H10" />
    </Svg>
  );
}

export function PensionIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 12a8.5 8.5 0 0 1 17 0z" />
      <path d="M12 12v5.6a2.1 2.1 0 0 1-4.2 0" />
      <path d="M12 3.5V2.6" />
    </Svg>
  );
}

export function GoldIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8.7 10.6l1.3-4h4l1.3 4z" />
      <path d="M3.7 17.6l1.3-4h4l1.3 4z" />
      <path d="M13.7 17.6l1.3-4h4l1.3 4z" />
    </Svg>
  );
}

export function BondsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 3.5h8.5L18 7v13.5H6z" />
      <path d="M14.5 3.5V7H18" />
      <path d="M9 12h6M9 15.5h4" />
    </Svg>
  );
}

export function OtherAssetIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4.5l1.7 4.8 4.8 1.7-4.8 1.7L12 17.5l-1.7-4.8-4.8-1.7 4.8-1.7z" />
      <path d="M18.6 17.2l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5z" />
    </Svg>
  );
}

// One lookup for every place that renders an asset class visually: the picker
// tiles, the Added chips, the saved bar, and the collect header. Accepts DB asset
// types (etf folds into the stocks mark) and falls back to the generic mark.
export function AssetClassIcon({ type, size, strokeWidth }: IconProps & { type: string }) {
  const p = { size, strokeWidth };
  switch (type) {
    case "real_estate": return <PropertyIcon {...p} />;
    case "stocks":
    case "etf": return <StocksIcon {...p} />;
    case "cash": return <CashIcon {...p} />;
    case "crypto": return <CryptoIcon {...p} />;
    case "pension": return <PensionIcon {...p} />;
    case "gold": return <GoldIcon {...p} />;
    case "bonds": return <BondsIcon {...p} />;
    default: return <OtherAssetIcon {...p} />;
  }
}
