"use client";

interface Props {
  type: string | null;
  symbol: string | null;
  name: string | null;
  size?: number;
}

import { useState } from "react";

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
      <rect x="2" y="7" width="20" height="13" rx="2" />
      <path d="M2 12h20" />
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

export function AssetLogo({ type, symbol, name, size = 32 }: Props) {
  const [imgFailed, setImgFailed] = useState(false);

  let imgUrl: string | null = null;
  if (!imgFailed && symbol) {
    if (type === "crypto") {
      const base = symbol.replace(/-USD$/i, "").replace(/-EUR$/i, "").toLowerCase();
      imgUrl = `https://cdn.jsdelivr.net/npm/cryptocurrency-icons/svg/color/${encodeURIComponent(base)}.svg`;
    } else if (type === "stocks" || type === "etf") {
      // Strip exchange suffix (e.g. ASML.AS → ASML) since FMP stores by base ticker
      const base = symbol.replace(/\.(AS|L|PA|DE|HK|TO|AX|KS|MI|MC|BR|CO|OL|ST|STO|SS|SZ|SA|MX|SW|AT|IR|NZ|TW|BO)$/i, "");
      imgUrl = `https://images.financialmodelingprep.com/symbol/${encodeURIComponent(base)}.png`;
    }
  }

  const showBorder = imgUrl === null || imgFailed;
  const isMonogram =
    showBorder &&
    type !== "real_estate" &&
    type !== "cash" &&
    type !== "pension" &&
    type !== "bonds";
  const borderWidth = isMonogram ? "0.5px" : "1px";
  const imgDisplaySize = Math.round(size * 0.7);

  const renderIcon = () => {
    if (type === "real_estate") return <HouseIcon size={size} />;
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
