"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

// Inline hyperlink for a holding mentioned in journal prose — the news-site
// convention (the name itself is the link, straight to the instrument page),
// pointing at the same /asset route the holdings rows use. Dotted underline
// so a mention reads as quietly tappable without shouting over the text.
//
// stopPropagation: mentions sit inside tappable containers (the entry header
// toggles its look-back, Journal rows navigate) — following the link must not
// also trigger the parent's action.
const MENTION_STYLE: CSSProperties = {
  color: "var(--accent-text)",
  textDecoration: "underline",
  textDecorationStyle: "dotted",
  textDecorationThickness: 1,
  textUnderlineOffset: 3,
};

export function AssetMentionLink({
  assetId,
  children,
  style,
}: {
  assetId: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Link
      href={`/asset?id=${assetId}`}
      style={{ ...MENTION_STYLE, ...style }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
}

// Wraps the FIRST occurrence of `name` in `text` with an AssetMentionLink.
// Plain-string match (case-insensitive), no regex — names carry characters
// like "—" and ".". When the name doesn't appear, or the position was exited
// (asset_id ON DELETE SET NULL leaves no page to open), the text passes
// through unchanged.
export function linkifyAssetMention(
  text: string,
  name: string | null | undefined,
  assetId: string | null | undefined,
): ReactNode {
  if (!text || !name || !assetId) return text;
  const idx = text.toLowerCase().indexOf(name.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <AssetMentionLink assetId={assetId}>{text.slice(idx, idx + name.length)}</AssetMentionLink>
      {text.slice(idx + name.length)}
    </>
  );
}
