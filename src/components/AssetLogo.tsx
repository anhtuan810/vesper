"use client";

import { useState } from "react";
import { useTheme } from "@/lib/hooks";

interface Props {
  type: string | null;
  symbol: string | null;
  name: string | null;
  property_type?: string | null;
  userId?: string | null;
  assetId?: string | null;
  cacheVersion?: number;
  size?: number;
}

function Monogram({ symbol, name, type, size }: { type: string | null; symbol: string | null; name: string | null; size: number }) {
  const mono = symbol
    ? symbol.replace(/-USD$/i, "").replace(/-EUR$/i, "").toUpperCase().slice(0, 4)
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

function WalletIcon({ size }: { size: number }) {
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
      {/* Wallet body */}
      <rect x="2" y="7" width="20" height="13" rx="2" />
      {/* Card slot divider */}
      <path d="M2 12h20" />
      {/* Clasp dot */}
      <circle cx="17" cy="16" r="1.5" fill="var(--accent)" stroke="none" />
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
      {/* Document body */}
      <rect x="4" y="2" width="16" height="20" rx="1.5" />
      {/* Text lines */}
      <path d="M8 8h8M8 12h8M8 16h5" />
      {/* Seal circle */}
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

export function AssetLogo({ type, symbol, name, userId, assetId, cacheVersion, size = 32 }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();

  // --- Real-estate: deterministic thumbnail URL → single house fallback ---
  if (type === "real_estate") {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    let thumbnailUrl: string | null = null;
    if (userId && assetId && supabaseUrl) {
      const v = cacheVersion ?? 0;
      thumbnailUrl = `${supabaseUrl}/storage/v1/object/public/property-photos/${userId}/${assetId}-${resolvedTheme}.png${v > 0 ? `?v=${v}` : ""}`;
    }
    const showThumb = thumbnailUrl !== null && failedUrl !== thumbnailUrl;

    return (
      <div
        className="shrink-0 flex items-center justify-center overflow-hidden"
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          background: "var(--surface)",
          border: showThumb ? "none" : "1px solid var(--border)",
        }}
      >
        {showThumb ? (
          <img
            src={thumbnailUrl!}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={() => setFailedUrl(thumbnailUrl)}
            alt=""
          />
        ) : (
          <HouseIcon size={size} />
        )}
      </div>
    );
  }

  // --- Other asset types: stock/crypto logo, wallet, certificate, monogram ---
  let imgUrl: string | null = null;
  if (!imgFailed && symbol) {
    if (type === "crypto") {
      const base = symbol.replace(/-USD$/i, "").replace(/-EUR$/i, "").toLowerCase();
      imgUrl = `/api/logo?type=crypto&symbol=${encodeURIComponent(base)}`;
    } else if (type === "stocks" || type === "etf") {
      imgUrl = `/api/logo?type=stock&symbol=${encodeURIComponent(symbol)}`;
    }
  }

  const showBorder = imgUrl === null || imgFailed;
  const isMonogram =
    showBorder &&
    type !== "cash" &&
    type !== "pension" &&
    type !== "bonds";
  const borderWidth = isMonogram ? "0.5px" : "1px";
  const imgDisplaySize = Math.round(size * 0.7);

  const renderIcon = () => {
    if (type === "cash" || type === "pension") return <WalletIcon size={size} />;
    if (type === "bonds") return <CertificateIcon size={size} />;
    return <Monogram type={type} symbol={symbol} name={name} size={size} />;
  };

  return (
    <div
      className="shrink-0 flex items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        background: "var(--surface)",
        border: showBorder ? `${borderWidth} solid var(--border)` : "none",
        position: "relative",
      }}
    >
      {renderIcon()}

      {/* Image overlay — sits above icon, reveals it on failure */}
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
