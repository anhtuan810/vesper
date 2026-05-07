"use client";

type Tab = "portfolio" | "diary" | "profile";

interface NavBarProps {
  tab: Tab;
  setTab: (tab: Tab) => void;
  mutationCount: number;
  liveCount: number;
  totalSymbols: number;
  lastUpdated: Date | null;
  refreshing: boolean;
  refreshPrices: () => void;
  avatarUrl?: string;
  signOut: () => void;
}

export function NavBar({
  tab, setTab, mutationCount, liveCount, totalSymbols,
  lastUpdated, refreshing, refreshPrices, avatarUrl, signOut,
}: NavBarProps) {
  return (
    <nav
      className="sticky top-0 z-20 border-b border-border backdrop-blur-xl"
      style={{ background: "rgba(10,10,11,0.85)" }}
    >
      <div className="max-w-[960px] mx-auto flex items-center justify-between px-6 sm:px-8 h-14">
        {/* Brand */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span
              className="font-serif text-fg"
              style={{
                fontSize: 19,
                fontWeight: 400,
                letterSpacing: "-0.02em",
                fontVariationSettings: "'opsz' 144",
              }}
            >
              Vesper
            </span>
            <span
              className="rounded-full bg-accent inline-block shrink-0"
              style={{ width: 5, height: 5, boxShadow: "0 0 8px var(--accent)" }}
            />
          </div>

          {/* Tabs */}
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

        {/* Right side */}
        <div className="flex items-center gap-3">
          {totalSymbols > 0 && (
            <div
              className="flex items-center gap-1.5 font-mono text-dim bg-surface border border-border"
              style={{ fontSize: 10, padding: "5px 10px", borderRadius: 12 }}
            >
              <div
                className="rounded-full shrink-0"
                style={{
                  width: 5,
                  height: 5,
                  background: liveCount > 0 ? "var(--positive)" : "var(--text-faint)",
                  boxShadow: liveCount > 0 ? "0 0 6px var(--positive)" : "none",
                }}
              />
              {liveCount > 0 ? `${liveCount}/${totalSymbols} live` : "offline"}
            </div>
          )}
          {lastUpdated && (
            <span className="font-mono text-faint" style={{ fontSize: 10 }}>
              {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={refreshPrices}
            disabled={refreshing}
            className="font-mono text-dim border border-border hover:bg-surface transition-colors"
            style={{ fontSize: 11, padding: "5px 10px", borderRadius: 8 }}
          >
            {refreshing ? "↻ …" : "↻ Refresh"}
          </button>
          {avatarUrl && (
            <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full" />
          )}
          <button
            onClick={signOut}
            className="font-mono text-faint hover:text-dim transition-colors"
            style={{ fontSize: 10 }}
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
