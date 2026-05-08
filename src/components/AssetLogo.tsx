"use client";

import { useState } from "react";
import { TYPE_COLOR } from "@/lib/utils";

interface Props {
  type: string | null;
  symbol: string | null;
  name: string | null;
  property_type?: string | null;
  size?: number;
}

function Monogram({ type, symbol, name, size }: { type: string | null; symbol: string | null; name: string | null; size: number }) {
  const assetType = type || "other";
  const color = TYPE_COLOR[assetType] || "#54545E";
  const mono = symbol
    ? symbol.replace(/-USD$/i, "").replace(/-EUR$/i, "").toUpperCase().slice(0, 4)
    : (name || assetType).slice(0, 3).toUpperCase();
  const fontSize = Math.max(6, Math.round(size * 0.29));

  return (
    <div
      className="w-full h-full flex items-center justify-center font-mono font-medium"
      style={{ background: `${color}18`, color, fontSize, letterSpacing: "0.02em" }}
    >
      {mono}
    </div>
  );
}

function RealEstateIcon({ propertyType, size }: { propertyType: string | null | undefined; size: number }) {
  const iconSize = Math.round(size * 0.6);
  const svgProps = {
    width: iconSize,
    height: iconSize,
    viewBox: "0 0 24 24" as const,
    fill: "none",
    stroke: "var(--accent)",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (propertyType) {
    case "house":
      return (
        <svg {...svgProps}>
          <path d="M3 11L12 3L21 11V21H15V15H9V21H3V11Z" />
        </svg>
      );
    case "apartment":
      return (
        <svg {...svgProps}>
          <rect x="3" y="3" width="18" height="18" rx="1" />
          <rect x="7" y="7" width="3" height="3" />
          <rect x="14" y="7" width="3" height="3" />
          <rect x="7" y="13" width="3" height="3" />
          <rect x="14" y="13" width="3" height="3" />
          <path d="M10 21V17H14V21" />
        </svg>
      );
    case "office":
      return (
        <svg {...svgProps}>
          <rect x="4" y="2" width="16" height="20" rx="1" />
          <rect x="7" y="5" width="2.5" height="2.5" />
          <rect x="11" y="5" width="2.5" height="2.5" />
          <rect x="15" y="5" width="2.5" height="2.5" />
          <rect x="7" y="10" width="2.5" height="2.5" />
          <rect x="11" y="10" width="2.5" height="2.5" />
          <rect x="15" y="10" width="2.5" height="2.5" />
          <rect x="7" y="15" width="2.5" height="2.5" />
          <rect x="11" y="15" width="2.5" height="2.5" />
          <rect x="15" y="15" width="2.5" height="2.5" />
        </svg>
      );
    case "land":
      return (
        <svg {...svgProps}>
          <path d="M2 20H22" />
          <path d="M4 20C6 15 9 12 12 16C15 12 18 14 20 20" />
          <path d="M12 8V14" />
          <path d="M9 11L12 7L15 11" />
        </svg>
      );
    default:
      return (
        <svg {...svgProps}>
          <path d="M12 2C8.7 2 6 4.7 6 8C6 12.5 12 20 12 20C12 20 18 12.5 18 8C18 4.7 15.3 2 12 2Z" />
          <circle cx="12" cy="8" r="2.5" />
        </svg>
      );
  }
}

export function AssetLogo({ type, symbol, name, property_type, size = 24 }: Props) {
  const [imgFailed, setImgFailed] = useState(false);

  const isRealEstate = type === "real_estate";

  let imgUrl: string | null = null;
  if (!imgFailed && symbol) {
    if (type === "crypto") {
      const base = symbol.replace(/-USD$/i, "").replace(/-EUR$/i, "").toLowerCase();
      imgUrl = `https://cdn.jsdelivr.net/npm/cryptocurrency-icons/svg/color/${base}.svg`;
    } else if (type === "stocks" || type === "etf") {
      imgUrl = `https://images.financialmodelingprep.com/symbol/${symbol}.png`;
    }
  }

  // No border when showing an external image logo; border for real estate and monogram fallbacks
  const showBorder = imgUrl === null || imgFailed;
  const imgDisplaySize = Math.round(size * 0.7);

  return (
    <div
      className="shrink-0 flex items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: "var(--surface)",
        border: showBorder ? "1px solid var(--border)" : "none",
        position: "relative",
      }}
    >
      {isRealEstate ? (
        <RealEstateIcon propertyType={property_type} size={size} />
      ) : (
        <Monogram type={type} symbol={symbol} name={name} size={size} />
      )}

      {/* Image overlay — sits above monogram, reveals it on failure */}
      {imgUrl !== null && !imgFailed && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--surface)",
          }}
        >
          <img
            src={imgUrl}
            width={imgDisplaySize}
            height={imgDisplaySize}
            style={{ objectFit: "contain", display: "block" }}
            onError={() => setImgFailed(true)}
            alt=""
          />
        </div>
      )}
    </div>
  );
}
