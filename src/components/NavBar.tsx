"use client";

import Link from "next/link";
import { useUser } from "@/lib/hooks";

type Tab = "portfolio" | "diary" | "profile";

interface NavBarProps {
  tab: Tab;
  setTab: (tab: Tab) => void;
  mutationCount: number;
  liveCount: number;
  totalSymbols: number;
  refreshing: boolean;
  refreshPrices: () => void;
}

export function NavBar({
  tab, setTab, mutationCount, liveCount, totalSymbols, refreshing, refreshPrices,
}: NavBarProps) {
  const { user } = useUser();

  const displayName: string | null =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split("@")[0] ||
    null;

  const dotColor =
    totalSymbols > 0 && liveCount === totalSymbols
      ? "var(--positive)"
      : liveCount > 0
      ? "var(--accent)"
      : "var(--text-faint)";

  return (
    <nav
      className="sticky top-0 z-20 border-b border-border backdrop-blur-xl"
      style={{ background: "rgba(10,10,11,0.85)" }}
    >
      <div className="max-w-[960px] mx-auto flex items-center justify-between px-6 sm:px-8 h-14">
        {/* Left: icon · name · desktop tabs */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 min-w-0">
            {/* TODO: replace with proper Vesper icon asset */}
            <div
              className="font-serif text-fg flex items-center justify-center shrink-0"
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                fontSize: 14,
                fontWeight: 400,
                fontVariationSettings: "'opsz' 144",
              }}
            >
              V
            </div>
            {displayName && (
              <span
                className="text-dim truncate"
                style={{ fontSize: 13, fontWeight: 400, maxWidth: "16ch" }}
              >
                {displayName}
              </span>
            )}
          </div>

          <div className="hidden md:flex items-center gap-0.5">
            {(["portfolio", "diary", "profile"] as Tab[]).map((t) => (
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
                      fontSize: 10,
                      padding: "1px 6px",
                      borderRadius: 999,
                      background: tab === "diary" ? "rgba(255,255,255,0.12)" : "var(--surface)",
                      color: tab === "diary" ? "var(--text)" : "var(--text-faint)",
                    }}
                  >
                    {mutationCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Right: refresh (status dot as badge) · settings gear */}
        <div className="flex items-center gap-2">
          <button
            onClick={refreshPrices}
            disabled={refreshing}
            aria-label="Refresh prices"
            className="flex items-center justify-center text-faint hover:text-dim transition-colors"
            style={{
              position: "relative",
              width: 28,
              height: 28,
              borderRadius: 6,
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
            <span
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: dotColor,
              }}
            />
          </button>

          <Link
            href="/settings"
            aria-label="Settings"
            className="flex items-center justify-center text-faint hover:text-dim border border-border hover:bg-surface transition-colors"
            style={{ width: 28, height: 28, borderRadius: 6 }}
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
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
        </div>
      </div>
    </nav>
  );
}
