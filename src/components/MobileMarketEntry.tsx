"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { formatMoney, type DisplayCurrency } from "@/lib/money";
import type { DiaryMarketMove } from "@/lib/diary-market-moves";

// Mobile diary entry for a big market swing — a quiet, collapsible ledger line.
// At rest it reads as a peer to the holdings rows (index · % · your € impact ·
// date); a tap unfolds Volnar's one-line read of the day plus the per-holding
// breakdown as a tidy ledger. Progressive disclosure keeps the timeline calm
// while the real portfolio impact stays one tap away — the phone-native
// counterpart to the desktop Journal's always-open DesktopMarketEntry.
//
// Deliberately NOT the web's loud card: no background wash, no accent stripe,
// no chips. The circular market glyph (vs the square asset logos) and the
// index/€ formatting are all that mark it as an auto-logged market note.

function ActivityIcon({ color, size = 13 }: { color: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size }} aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

export function MobileMarketEntry({ move }: { move: DiaryMarketMove }) {
  const [open, setOpen] = useState(false);
  const imp = move.impact;
  if (!imp) return null;

  const cur = imp.currency as DisplayCurrency;
  const money = (n: number) => formatMoney(Math.abs(n), cur, cur);
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(n)}`;
  const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1).replace(".", ",")}%`;

  const indexUp = move.pct_change >= 0;
  const portUp = imp.total >= 0;
  const m = imp.movers;

  // Volnar's one-line read of the day. The per-holding detail lives in the
  // ledger below, so the sentence stays short — the movers don't repeat in prose.
  const lead = `${move.index_label} ${indexUp ? "rose" : "fell"} ${Math.abs(move.pct_change).toFixed(1).replace(".", ",")}% on ${formatDate(move.date)}.`;
  const body = m.length === 0
    ? "Your portfolio held flat that day."
    : `Your portfolio ${portUp ? "gained" : "softened"} about ${money(imp.total)} that day.`;

  return (
    <div style={{ borderBottom: "0.5px solid var(--border)" }}>
      {/* Resting line — a calm ledger row, peer to the holdings rows */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "flex", gap: 10, alignItems: "center", width: "100%",
          padding: "8px 0", background: "none", border: "none",
          textAlign: "left", cursor: "pointer", color: "inherit", font: "inherit",
        }}
      >
        {/* Market glyph — a circle distinguishes it from the square asset logos */}
        <span
          aria-hidden
          style={{
            width: 26, height: 26, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: "50%", border: "1px solid var(--border)",
          }}
        >
          <ActivityIcon color="var(--cat-reserves-band)" />
        </span>

        <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: "var(--fs-body)", fontFamily: "var(--sans)", fontWeight: 500, color: "var(--text)", lineHeight: 1.2, whiteSpace: "nowrap" }}>
            {move.index_label}{" "}
            <span className="tnum" style={{ fontWeight: 500, color: indexUp ? "var(--positive-text)" : "var(--negative-text)" }}>
              {pct(move.pct_change)}
            </span>
          </span>
          <span
            className="tnum"
            style={{
              marginLeft: "auto", fontSize: "var(--fs-meta)", fontWeight: 500,
              whiteSpace: "nowrap",
              color: portUp ? "var(--positive-text)" : "var(--negative-text)",
            }}
          >
            {signed(imp.total)}
          </span>
          <span className="tnum" style={{ fontSize: "var(--fs-caption)", color: "var(--text-faint)", whiteSpace: "nowrap" }}>
            {formatDate(move.date)}
          </span>
        </span>

        {/* Fold affordance */}
        <span
          aria-hidden
          style={{
            flexShrink: 0, fontSize: 10, lineHeight: 1, color: "var(--text-faint)",
            transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease",
          }}
        >
          ▾
        </span>
      </button>

      {/* Unfolded — Volnar's read + the per-holding ledger */}
      {open && (
        <div style={{ padding: "0 0 11px 36px" }}>
          <p
            className="font-serif"
            style={{
              fontStyle: "italic", fontSize: "var(--fs-caption)", color: "var(--text-dim)", lineHeight: "var(--lh-body)",
              margin: 0, fontVariationSettings: "'opsz' 16",
            }}
          >
            {lead} {body}
          </p>
          {m.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {m.map((h) => {
                const inner = (
                  <>
                    <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {h.label}
                    </span>
                    <span
                      className="tnum"
                      style={{
                        fontSize: "var(--fs-caption)", fontWeight: 500,
                        whiteSpace: "nowrap", flexShrink: 0,
                        color: h.impact >= 0 ? "var(--positive-text)" : "var(--negative-text)",
                      }}
                    >
                      {signed(h.impact)}
                    </span>
                  </>
                );
                const rowStyle = {
                  display: "flex", alignItems: "baseline", justifyContent: "space-between",
                  gap: 12, padding: "4px 0", borderTop: "0.5px solid var(--border)",
                  textDecoration: "none" as const,
                };
                return h.assetId ? (
                  <Link key={h.symbol} href={`/asset?id=${h.assetId}`} style={rowStyle}>{inner}</Link>
                ) : (
                  <div key={h.symbol} style={rowStyle}>{inner}</div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
