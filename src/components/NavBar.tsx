"use client";

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
  tab, setTab, mutationCount, liveCount, totalSymbols,
  refreshing, refreshPrices,
}: NavBarProps) {
  const dotColor =
    totalSymbols > 0 && liveCount === totalSymbols
      ? "var(--positive)"
      : liveCount > 0
      ? "var(--accent)"
      : "var(--text-faint)";

  const dotShadow =
    totalSymbols > 0 && liveCount === totalSymbols
      ? "0 0 8px var(--positive)"
      : liveCount > 0
      ? "0 0 8px var(--accent)"
      : "none";

  return (
    <nav
      className="sticky top-0 z-20 border-b border-border backdrop-blur-xl"
      style={{ background: "rgba(10,10,11,0.85)" }}
    >
      <div className="max-w-[960px] mx-auto flex items-center justify-between px-6 sm:px-8 h-14">
        {/* Brand + desktop tabs */}
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
              className="rounded-full inline-block shrink-0"
              style={{ width: 5, height: 5, background: dotColor, boxShadow: dotShadow }}
            />
          </div>

          {/* Desktop tabs */}
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

        {/* Refresh icon button */}
        <button
          onClick={refreshPrices}
          disabled={refreshing}
          aria-label="Refresh prices"
          className="flex items-center justify-center text-dim border border-border hover:bg-surface transition-colors"
          style={{ width: 32, height: 32, borderRadius: 8, opacity: refreshing ? 0.5 : 1 }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
