interface Props {
  // ClosingCta sits on the dark band; the hero sits on paper.
  light?: boolean;
  className?: string;
}

// App Store (live) + Google Play (coming soon) badges, plus a quiet web link.
// Custom-drawn to match the design system rather than hosting official badge
// art. The App Store URL is a placeholder until the listing is live.
const APP_STORE_URL = "https://apps.apple.com/app/volnar";

export function AppStoreBadges({ light, className }: Props) {
  const border = light ? "rgba(255,255,255,0.22)" : "var(--border-strong)";
  const fg = light ? "#fff" : "var(--hero)";
  const sub = light ? "rgba(255,255,255,0.6)" : "var(--text-dim)";
  const bg = light ? "rgba(255,255,255,0.04)" : "var(--surface)";

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className ?? ""}`}>
      {/* App Store — live */}
      <a
        href={APP_STORE_URL}
        className="inline-flex items-center gap-3 transition-transform hover:-translate-y-0.5"
        style={{ padding: "10px 16px", borderRadius: 12, border: `1px solid ${border}`, background: bg, textDecoration: "none", minHeight: 52 }}
        aria-label="Download Volnar on the App Store"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill={fg} aria-hidden="true">
          <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
        </svg>
        <span className="flex flex-col leading-none">
          <span style={{ fontSize: 10, color: sub, letterSpacing: "0.02em" }}>Download on the</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: fg, marginTop: 3 }}>App Store</span>
        </span>
      </a>

      {/* Google Play — coming soon (not a link) */}
      <div
        className="relative inline-flex items-center gap-3"
        style={{ padding: "10px 16px", borderRadius: 12, border: `1px dashed ${border}`, background: "transparent", minHeight: 52, opacity: 0.72 }}
        aria-label="Volnar for Android — coming soon"
      >
        <svg width="20" height="22" viewBox="0 0 24 26" aria-hidden="true">
          <path d="M2 1.5 13.5 13 2 24.5c-.4-.2-.7-.7-.7-1.3V2.8c0-.6.3-1.1.7-1.3z" fill={fg} opacity="0.55" />
          <path d="M16.8 9.7 13.5 13 2 1.5C2.3 1.3 2.8 1.3 3.3 1.6l13.5 8.1z" fill={fg} opacity="0.75" />
          <path d="M16.8 16.3 3.3 24.4c-.5.3-1 .3-1.3.1L13.5 13l3.3 3.3z" fill={fg} opacity="0.65" />
          <path d="M21 11.6c.7.4.7 1.4 0 1.8l-2.9 1.7L14.5 13l3.6-2.1L21 11.6z" fill={fg} opacity="0.85" />
        </svg>
        <span className="flex flex-col leading-none">
          <span style={{ fontSize: 10, color: sub, letterSpacing: "0.02em" }}>Coming soon to</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: fg, marginTop: 3 }}>Google Play</span>
        </span>
        <span
          className="absolute font-mono uppercase"
          style={{ top: -8, right: 10, fontSize: 8, letterSpacing: "0.1em", padding: "2px 6px", borderRadius: 999, background: light ? "rgba(255,255,255,0.14)" : "var(--accent-soft)", color: light ? "#fff" : "var(--accent-text)" }}
        >
          Soon
        </span>
      </div>
    </div>
  );
}
