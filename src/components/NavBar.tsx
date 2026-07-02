"use client";

import { useState, useEffect } from "react";
import { useUser, useProfile } from "@/lib/hooks";
import { Logo } from "@/components/Logo";
import { AccountPanel } from "@/components/AccountPanel";
import { PRICE_CACHE_TTL_MS } from "@/lib/constants";

type Tab = "portfolio" | "diary" | "profile" | "vitals";

interface NavBarProps {
  tab: Tab;
  setTab: (tab: Tab) => void;
  mutationCount: number;
  liveCount: number;
  totalSymbols: number;
  refreshing: boolean;
  refreshPrices: () => void;
  lastUpdated?: Date | null;
  empty?: boolean;
  /** Hide the price-refresh control on surfaces that have no live prices
   *  (e.g. Diary), where it would be a no-op. */
  hideRefresh?: boolean;
  /** Desktop shell: pad the bar by the side-panel widths so its centered
   *  content aligns over the center column. */
  desktopInset?: { left: number; right: number };
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}


export function NavBar({
  tab, setTab, mutationCount, liveCount, totalSymbols, refreshing, refreshPrices, lastUpdated, empty, hideRefresh, desktopInset,
}: NavBarProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const { user } = useUser();
  const profile = useProfile(user?.id);
  const [panelOpen, setPanelOpen] = useState(false);

  const fullName: string | null =
    profile?.name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split("@")[0] ||
    null;

  // The account avatar — a small initial circle at the far left; tapping it
  // opens the account panel (left drawer with the account header + settings).
  const avatarButton = (
    <button
      onClick={() => setPanelOpen(true)}
      aria-label="Account and settings"
      className="focus-ring"
      style={{
        width: 24,
        height: 24,
        // Pad the tap target out to 36px; negative margins keep layout intact.
        padding: 6,
        margin: -6,
        boxSizing: "content-box",
        borderRadius: "var(--radius-pill)",
        background: "none",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          background: "var(--accent-soft)",
          color: "var(--accent-text)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
          fontFamily: "var(--font-ui)",
        }}
      >
        {(fullName?.trim().charAt(0) || "V").toUpperCase()}
      </span>
    </button>
  );

  // Tab buttons (shown md+); shared by the mobile/tablet bar and the full-width
  // desktop-shell bar.
  const tabButtons = (["portfolio", "diary", "profile"] as Tab[]).map((t) => (
    <button
      key={t}
      onClick={() => setTab(t)}
      className="font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2"
      style={{
        fontSize: "var(--fs-subhead)",
        background: tab === t ? "var(--surface-elev)" : "transparent",
        color: tab === t ? "var(--text)" : "var(--text-faint)",
      }}
    >
      {t.charAt(0).toUpperCase() + t.slice(1)}
      {t === "diary" && mutationCount > 0 && (
        <span
          className="font-numeric"
          style={{
            fontSize: "var(--fs-micro)",
            padding: "1px 6px",
            borderRadius: "var(--radius-pill)",
            background: tab === "diary" ? "var(--surface-elev)" : "var(--surface)",
            color: tab === "diary" ? "var(--text)" : "var(--text-faint)",
          }}
        >
          {mutationCount}
        </span>
      )}
    </button>
  ));

  const rightControls = (
    <div className="flex items-center gap-2">
      {!empty && lastUpdated && (
        <span
          className="font-numeric text-faint hidden sm:inline"
          style={{ fontSize: "var(--fs-micro)", letterSpacing: "0.04em" }}
        >
          {formatRelativeTime(lastUpdated)}
        </span>
      )}
      {!empty && !hideRefresh && <button
        onClick={refreshPrices}
        disabled={refreshing}
        aria-label="Refresh prices"
        className="flex items-center justify-center text-faint hover:text-dim transition-colors"
        style={{
          position: "relative",
          width: 28,
          height: 28,
          // Pad the tap target out to 36px; negative margins keep layout intact.
          padding: 4,
          margin: -4,
          boxSizing: "content-box",
          borderRadius: "var(--radius-md)",
          opacity: refreshing ? 0.4 : 1,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
        >
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        {(() => {
          const priceAgeMs = lastUpdated ? Date.now() - lastUpdated.getTime() : Infinity;
          const dotState =
            liveCount === totalSymbols && totalSymbols > 0 && priceAgeMs < PRICE_CACHE_TTL_MS
              ? { color: "var(--positive)", label: `All ${totalSymbols} prices live` }
              : liveCount > 0 || (totalSymbols > 0 && priceAgeMs < PRICE_CACHE_TTL_MS)
              ? { color: "var(--accent)", label: liveCount > 0 ? `${liveCount} of ${totalSymbols} prices live` : "Refreshing prices" }
              : { color: "var(--text-faint)", label: "Prices unavailable" };
          return (
            <span
              title={dotState.label}
              aria-label={dotState.label}
              role="status"
              style={{
                position: "absolute", top: 4, right: 4,
                width: 4, height: 4, borderRadius: "50%",
                background: dotState.color,
              }}
            />
          );
        })()}
      </button>}
    </div>
  );

  // Desktop shell: a full-width bar — avatar + brand flush-left, tabs centred,
  // controls flush-right — rather than the centre-column-constrained bar.
  if (desktopInset) {
    return (
      <nav
        className="relative z-20 sticky top-0 border-b border-border bg-nav-surface [backdrop-filter:saturate(180%)_blur(20px)] [-webkit-backdrop-filter:saturate(180%)_blur(20px)]"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <AccountPanel open={panelOpen} onClose={() => setPanelOpen(false)} displayName={fullName} />
        <div className="relative flex items-center w-full px-5 h-14 gap-3">
          {avatarButton}
          <Logo size={28} />
          {/* Tabs aligned to the centre column content (i.e. with "Total net worth"):
              this overlay mirrors the shell's centre track (desktopInset.left/right)
              and its 720px / margin-auto / 20px-padding wrapper, with the tabs
              left-aligned to that wrapper's content edge. */}
          <div
            className="hidden md:block absolute top-0 bottom-0 pointer-events-none"
            style={{ left: desktopInset.left, right: desktopInset.right }}
          >
            <div style={{ maxWidth: 720, height: "100%", margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center" }}>
              <div className="flex items-center gap-0.5 pointer-events-auto">{tabButtons}</div>
            </div>
          </div>
          {/* User name anchored over the chat / Assistant rail (right-hand track),
              aligned with the rail's 20px content padding. */}
          <div
            className="flex items-center justify-end absolute top-0 bottom-0 pointer-events-none"
            style={{ right: 0, width: desktopInset.right, paddingRight: 20 }}
          >
            <div className="pointer-events-auto">{rightControls}</div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav
      className="relative z-20 md:sticky md:top-0 md:border-b md:border-border md:bg-nav-surface md:[backdrop-filter:saturate(180%)_blur(20px)] md:[-webkit-backdrop-filter:saturate(180%)_blur(20px)]"
      style={{
        // Mobile: NavBar lives in normal flow and scrolls off the top with the
        // page (no sticky/fixed, no frosted backdrop or border) so it reads as
        // part of the content and frees permanent vertical space — the fixed
        // BottomNav still provides global navigation. Desktop (md+) keeps the
        // sticky frosted bar via the md: classes above.
        // Always respect the iOS status-bar inset so content never hides under
        // the notch (the area above shows the page background on mobile).
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <AccountPanel open={panelOpen} onClose={() => setPanelOpen(false)} displayName={fullName} />
      <div className="max-w-[720px] mx-auto flex items-center justify-between px-0 md:px-5 h-9 md:h-14">
        {/* Left: account avatar · brand · desktop tabs */}
        <div className="flex items-center gap-3">
          {avatarButton}
          <Logo size={20} />
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-0.5">{tabButtons}</div>
          </div>
        </div>

        {/* Right: refresh only (name + gear moved into the account panel) */}
        {rightControls}
      </div>
    </nav>
  );
}
