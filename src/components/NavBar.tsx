"use client";

import { useState } from "react";
import { useUser, useProfile } from "@/lib/hooks";
import { Logo } from "@/components/Logo";
import { AccountPanel } from "@/components/AccountPanel";

type Tab = "portfolio" | "diary" | "profile" | "vitals";

// liveCount / totalSymbols / refreshing / refreshPrices / lastUpdated / empty /
// hideRefresh are still accepted for call-site compatibility, but the bar no
// longer renders a refresh control — prices refresh on load and on the price
// cache's own TTL.
interface NavBarProps {
  tab: Tab;
  setTab: (tab: Tab) => void;
  mutationCount: number;
  liveCount?: number;
  totalSymbols?: number;
  refreshing?: boolean;
  refreshPrices?: () => void;
  lastUpdated?: Date | null;
  empty?: boolean;
  hideRefresh?: boolean;
  /** Desktop shell: pad the bar by the side-panel widths so its centered
   *  content aligns over the center column. */
  desktopInset?: { left: number; right: number };
}

export function NavBar({
  tab, setTab, mutationCount, desktopInset,
}: NavBarProps) {
  const { user } = useUser();
  const profile = useProfile(user?.id);
  const [panelOpen, setPanelOpen] = useState(false);

  const fullName: string | null =
    profile?.name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split("@")[0] ||
    null;

  // The account affordance — a quiet person silhouette in a hairline circle
  // (the brokerage convention), far left; tapping it opens the account panel
  // (left drawer with the account header + settings). Deliberately monochrome
  // and stroked so it reads as an instrument control, not a social avatar.
  const avatarButton = (
    <button
      onClick={() => setPanelOpen(true)}
      aria-label="Account and settings"
      className="focus-ring"
      style={{
        width: 26,
        height: 26,
        // Pad the tap target out to ~38px; negative margins keep layout intact.
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
          width: 26,
          height: 26,
          borderRadius: 13,
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          color: "var(--text-dim)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8.4" r="3.4" />
          <path d="M5.2 19.4c1.5-3 4-4.5 6.8-4.5s5.3 1.5 6.8 4.5" />
        </svg>
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

  // Desktop shell: a full-width bar — avatar + brand flush-left, tabs centred —
  // rather than the centre-column-constrained bar.
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

      </div>
    </nav>
  );
}
