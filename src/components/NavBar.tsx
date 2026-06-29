"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser, useProfile } from "@/lib/hooks";
import { Logo } from "@/components/Logo";
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
  const router = useRouter();
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const { user } = useUser();
  const profile = useProfile(user?.id);

  const fullName: string | null =
    profile?.name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split("@")[0] ||
    null;

  const firstName = fullName ? fullName.split(" ")[0] : null;

  // Tab buttons (shown md+); shared by the mobile/tablet bar and the full-width
  // desktop-shell bar.
  const tabButtons = (["portfolio", "diary", "profile"] as Tab[]).map((t) => (
    <button
      key={t}
      onClick={() => setTab(t)}
      className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2"
      style={{
        background: tab === t ? "var(--surface-elev)" : "transparent",
        color: tab === t ? "var(--text)" : "var(--text-faint)",
      }}
    >
      {t.charAt(0).toUpperCase() + t.slice(1)}
      {t === "diary" && mutationCount > 0 && (
        <span
          className="font-mono"
          style={{
            fontSize: "var(--fs-micro)",
            padding: "1px 6px",
            borderRadius: "var(--radius-pill)",
            background: tab === "diary" ? "rgba(255,255,255,0.12)" : "var(--surface)",
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
      {firstName && tab !== "profile" && (
        <span
          className="text-sm font-medium"
          style={{ color: "var(--text-faint)" }}
        >
          {firstName}
        </span>
      )}
      {!empty && lastUpdated && (
        <span
          className="font-mono text-faint hidden sm:inline"
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
      {/* Settings gear — Portfolio's top bar only; sized and styled to match
          the refresh control beside it (28px hit area, 14px stroked icon). */}
      {tab === "portfolio" && (
        <button
          onClick={() => router.push("/settings")}
          aria-label="Settings"
          className="flex items-center justify-center text-faint hover:text-dim transition-colors"
          style={{ width: 28, height: 28, borderRadius: "var(--radius-md)" }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3.5 h-3.5"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}
    </div>
  );

  // Desktop shell: a full-width bar — brand flush-left, tabs centred, name
  // flush-right — rather than the centre-column-constrained mobile/tablet bar.
  if (desktopInset) {
    return (
      <nav
        className="relative z-20 sticky top-0 border-b border-border bg-nav-surface [backdrop-filter:saturate(180%)_blur(20px)] [-webkit-backdrop-filter:saturate(180%)_blur(20px)]"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="relative flex items-center w-full px-5 h-14">
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
      <div className="max-w-[720px] mx-auto flex items-center justify-between px-0 md:px-5 h-9 md:h-14">
        {/* Left: brand · desktop tabs */}
        <div className="flex items-center gap-4">
          <Logo size={20} />
          <div className="hidden md:flex items-center gap-0.5">{tabButtons}</div>
        </div>

        {/* Right: name · refresh */}
        {rightControls}
      </div>
    </nav>
  );
}
