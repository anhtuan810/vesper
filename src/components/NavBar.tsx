"use client";

import { useState, useEffect } from "react";
import { useUser, useProfile } from "@/lib/hooks";

type Tab = "portfolio" | "diary" | "profile";

interface NavBarProps {
  tab: Tab;
  setTab: (tab: Tab) => void;
  mutationCount: number;
  liveCount: number;
  totalSymbols: number;
  refreshing: boolean;
  refreshPrices: () => void;
  lastUpdated?: Date | null;
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "";
  return (parts[0][0]?.toUpperCase() ?? "") + (parts[parts.length - 1][0]?.toUpperCase() ?? "");
}

export function NavBar({
  tab, setTab, mutationCount, liveCount, totalSymbols, refreshing, refreshPrices, lastUpdated,
}: NavBarProps) {
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

  const avatarUrl: string | null =
    profile?.avatar_url ||
    (user?.user_metadata?.avatar_url as string | undefined) ||
    null;

  const initials = fullName ? getInitials(fullName) : null;

  return (
    <nav
      className="sticky top-0 z-20 border-b border-border backdrop-blur-xl"
      style={{ background: "var(--nav-surface)", WebkitBackdropFilter: "blur(20px)" }}
    >
      <div className="max-w-[960px] mx-auto flex items-center justify-between px-6 sm:px-8 h-14">
        {/* Left: avatar · name · desktop tabs */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-[11px] min-w-0">
            {/* Avatar or initials circle — no "V" wordmark */}
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={firstName ?? "User"}
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  objectFit: "cover", flexShrink: 0,
                }}
              />
            ) : initials ? (
              <div
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: "var(--accent)", color: "var(--bg)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 500, letterSpacing: "0.01em",
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
            ) : null}
            {firstName && (
              <span
                className="text-fg truncate"
                style={{ fontSize: 16, fontWeight: 500, maxWidth: "16ch" }}
              >
                {firstName}
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

        {/* Right: refresh (status dot as badge) */}
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span
              className="font-mono text-faint hidden sm:inline"
              style={{ fontSize: 10, letterSpacing: "0.04em" }}
            >
              {formatRelativeTime(lastUpdated)}
            </span>
          )}
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
            {(() => {
              const dotState = totalSymbols > 0 && liveCount === totalSymbols
                ? { color: "var(--positive)", label: `All ${totalSymbols} prices live` }
                : liveCount > 0
                ? { color: "var(--accent)", label: `${liveCount} of ${totalSymbols} prices live` }
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
          </button>
        </div>
      </div>
    </nav>
  );
}
