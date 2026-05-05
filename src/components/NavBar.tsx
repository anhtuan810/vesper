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
    <nav className="sticky top-0 z-20 border-b border-black/5 bg-[#F8F7F4]/80 backdrop-blur-xl">
      <div className="max-w-[960px] mx-auto flex items-center justify-between px-8 h-14">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#2563EB] flex items-center justify-center text-white text-sm font-bold">V</div>
            <span className="text-base font-bold tracking-tight">Vesper</span>
          </div>

          <div className="flex items-center gap-1 ml-4">
            {(["portfolio", "diary", "profile"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="text-sm font-medium px-3 py-1.5 rounded-lg transition flex items-center gap-2"
                style={{
                  background: tab === t ? "#0F0E0C" : "transparent",
                  color: tab === t ? "#fff" : "#9CA3AF",
                }}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
                {t === "diary" && mutationCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{
                    background: tab === "diary" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.06)",
                    color: tab === "diary" ? "#fff" : "#9CA3AF",
                  }}>
                    {mutationCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {totalSymbols > 0 && (
            <div className="flex items-center gap-1.5">
              <div
                className={`w-1.5 h-1.5 rounded-full ${liveCount > 0 ? "bg-emerald-500" : "bg-gray-400"}`}
                style={liveCount > 0 ? { boxShadow: "0 0 0 2px #D1FAE5" } : {}}
              />
              <span className="text-xs text-gray-400 font-medium">
                {liveCount > 0 ? `${liveCount}/${totalSymbols} live` : "offline"}
              </span>
            </div>
          )}
          {lastUpdated && (
            <span className="text-xs text-gray-300">
              {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={refreshPrices}
            disabled={refreshing}
            className="text-xs font-semibold text-gray-400 px-2.5 py-1 rounded-md border border-black/5 hover:bg-[#ECEAE4] transition"
          >
            {refreshing ? "↻ …" : "↻ Refresh"}
          </button>
          {avatarUrl && (
            <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full" />
          )}
          <button onClick={signOut} className="text-xs text-gray-300 hover:text-gray-500 transition">
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
