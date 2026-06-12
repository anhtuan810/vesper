"use client";

import { displayTicker } from "@/lib/utils";
import { HouseFillIcon } from "@/components/HouseFillIcon";

interface Props {
  type: string | null;
  symbol: string | null;
  name: string | null;
  size?: number;
  // When provided on a real_estate logo, the house is drawn filled to this owned
  // share (HouseFillIcon) instead of the static outline. Holdings rows opt in;
  // other call sites leave it undefined and keep the static house.
  ownedFraction?: number;
}

import { useState } from "react";
import { apiUrl } from "@/lib/api";

function Monogram({ symbol, name, type, size }: { type: string | null; symbol: string | null; name: string | null; size: number }) {
  const mono = symbol
    ? (type === "crypto"
        ? symbol.replace(/-USD$/i, "").replace(/-EUR$/i, "")
        : displayTicker(symbol)
      ).toUpperCase().slice(0, 4)
    : (name || type || "?").slice(0, 3).toUpperCase();
  const fontSize = Math.max(6, Math.round(size * 0.29));

  return (
    <div
      className="w-full h-full flex items-center justify-center font-medium"
      style={{
        background: "var(--surface-elev)",
        color: "var(--text)",
        fontSize,
        letterSpacing: "0.04em",
      }}
    >
      {mono}
    </div>
  );
}

function BanknoteIcon({ size }: { size: number }) {
  const iconSize = Math.round(size * 0.6);
  return (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent)"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="7" cy="9.5" r="2" />
      <circle cx="17" cy="14.5" r="2" />
    </svg>
  );
}

function PensionIcon({ size }: { size: number }) {
  const iconSize = Math.round(size * 0.6);
  return (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent)"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3L4 7v5C4 17 8 21 12 21C16 21 20 17 20 12V7Z" />
    </svg>
  );
}

function CertificateIcon({ size }: { size: number }) {
  const iconSize = Math.round(size * 0.6);
  return (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent)"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="2" width="16" height="20" rx="1.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
      <circle cx="17" cy="17" r="2.5" />
    </svg>
  );
}

function HouseIcon({ size }: { size: number }) {
  const iconSize = Math.round(size * 0.6);
  return (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent)"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 11L12 3L21 11V21H15V15H9V21H3V11Z" />
    </svg>
  );
}

function GoldIcon({ size }: { size: number }) {
  const iconSize = Math.round(size * 0.6);
  return (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--category-reserves)"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="10" width="20" height="9" rx="2" />
      <path d="M6 10V8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export function AssetLogo({ type, symbol, name, size = 32, ownedFraction }: Props) {
  const [imgFailed, setImgFailed] = useState(false);

  let imgUrl: string | null = null;
  if (!imgFailed && symbol) {
    // Route through the same-origin /api/logo proxy: it serves the upstream
    // image when it exists and a transparent pixel (HTTP 200) when it doesn't,
    // so a missing logo falls back to the monogram below without a console 404.
    // Bump `v` to bust stale client/WebView caches of the blank fallback pixel
    // (logos were previously broken by a case-sensitivity bug in the proxy).
    if (type === "crypto") {
      const base = symbol.replace(/-USD$/i, "").replace(/-EUR$/i, "").toLowerCase();
      imgUrl = apiUrl(`/api/logo?type=crypto&symbol=${encodeURIComponent(base)}&v=2`);
    } else if (type === "stocks" || type === "etf") {
      imgUrl = apiUrl(`/api/logo?type=stock&symbol=${encodeURIComponent(displayTicker(symbol))}&v=2`);
    }
  }

  const showBorder = imgUrl === null || imgFailed;
  const isMonogram =
    showBorder &&
    type !== "real_estate" &&
    type !== "cash" &&
    type !== "pension" &&
    type !== "bonds" &&
    type !== "gold";
  const borderWidth = (isMonogram || type === "cash") ? "0.5px" : "1px";
  const imgDisplaySize = Math.round(size * 0.7);

  const containerBg =
    type === "cash" || type === "pension"
      ? "var(--surface-elev)"
      : "var(--surface)";

  const renderIcon = () => {
    if (type === "real_estate") {
      return ownedFraction !== undefined
        ? <HouseFillIcon ownedFraction={ownedFraction} size={Math.round(size * 0.6)} />
        : <HouseIcon size={size} />;
    }
    if (type === "cash") return <BanknoteIcon size={size} />;
    if (type === "pension") return <PensionIcon size={size} />;
    if (type === "bonds") return <CertificateIcon size={size} />;
    if (type === "gold") return <GoldIcon size={size} />;
    return <Monogram type={type} symbol={symbol} name={name} size={size} />;
  };

  return (
    <div
      className="shrink-0 flex items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        background: containerBg,
        border: showBorder ? `${borderWidth} solid var(--border)` : "none",
        position: "relative",
      }}
    >
      {renderIcon()}

      {imgUrl !== null && !imgFailed && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--surface-elev)",
            boxShadow: "inset 0 0 0 0.5px var(--border)",
          }}
        >
          <img
            src={imgUrl}
            width={imgDisplaySize}
            height={imgDisplaySize}
            style={{ objectFit: "contain", display: "block" }}
            onError={() => setImgFailed(true)}
            onLoad={(e) => { const img = e.currentTarget; if (img.naturalWidth < 2 || img.naturalHeight < 2) setImgFailed(true); }}
            alt=""
          />
        </div>
      )}
    </div>
  );
}
