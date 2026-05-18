export function Hero() {
  return (
    <div className="max-w-[1200px] mx-auto" style={{ padding: "0 var(--wrap-pad)" }}>
      <section style={{ padding: "clamp(24px,4vw,48px) 0 clamp(80px,12vw,140px)" }}>
        <div
          className="grid items-center min-[920px]:grid-cols-[1fr_1.05fr]"
          style={{ gap: "clamp(48px,8vw,64px)" }}
        >
          {/* ── Left: headline ── */}
          <div>
            <h1
              className="font-serif font-semibold text-hero leading-[0.92] tracking-[-0.035em]"
              style={{
                fontSize: "clamp(56px,13vw,108px)",
                fontVariationSettings: "'opsz' 100",
                marginBottom: "clamp(20px,3vw,28px)",
              }}
            >
              Wealth.<br />
              <span className="italic font-normal text-accent">Watched over.</span>
            </h1>
            <p
              className="text-dim max-w-[460px]"
              style={{
                fontSize: "clamp(17px,4vw,19px)",
                lineHeight: 1.5,
                marginBottom: "clamp(28px,5vw,40px)",
              }}
            >
              Everything you own, in one chat. With a quiet eye on the world that moves it.
            </p>
          </div>

          {/* ── Right: hero stage ── */}
          <div
            className="w-full max-w-[580px] ml-auto max-[920px]:mx-auto max-[920px]:pt-4"
          >
            <div className="grid gap-3 min-[920px]:grid-cols-[1.35fr_1fr] max-[920px]:gap-[14px]">

              {/* Portfolio card */}
              <div
                className="bg-surface border border-border rounded-xl"
                style={{
                  padding: "clamp(18px,3vw,22px)",
                  boxShadow: "0 1px 2px rgba(26,31,46,0.03), 0 32px 64px -28px rgba(26,31,46,0.18)",
                }}
              >
                <div className="text-[10.5px] text-faint uppercase tracking-[0.08em] mb-1">
                  Net worth
                </div>
                <div
                  className="font-serif font-medium text-hero leading-[1.0] tracking-[-0.02em] mb-[6px]"
                  style={{
                    fontSize: "clamp(32px,7.5vw,40px)",
                    fontVariationSettings: "'opsz' 44",
                  }}
                >
                  <span className="text-faint">€</span>616.086
                </div>
                <div
                  className="inline-block text-[11px] px-2 rounded-[5px] mb-[14px]"
                  style={{ padding: "2px 8px", background: "var(--positive-soft)", color: "var(--positive-text)" }}
                >
                  + 2,1% past month
                </div>

                {/* Trend chart */}
                <div className="mb-3">
                  <svg
                    viewBox="0 0 320 90"
                    preserveAspectRatio="none"
                    style={{ width: "100%", height: 70, display: "block" }}
                  >
                    <defs>
                      <linearGradient id="trendGrad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
                        <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <line x1="0" y1="22" x2="320" y2="22" stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2 4" />
                    <line x1="0" y1="56" x2="320" y2="56" stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2 4" />
                    <path d="M0,72 C24,68 42,66 70,60 C100,54 122,56 152,46 C182,36 200,38 232,26 L280,14 L320,8 L320,90 L0,90 Z" fill="url(#trendGrad)" />
                    <path d="M0,72 C24,68 42,66 70,60 C100,54 122,56 152,46 C182,36 200,38 232,26 L280,14 L320,8" fill="none" stroke="var(--accent)" strokeWidth="1.8" />
                    <circle cx="320" cy="8" r="3.5" fill="var(--accent)" />
                    <circle cx="320" cy="8" r="7" fill="var(--accent)" opacity="0.18" />
                  </svg>
                  <div
                    className="flex justify-between mt-1 font-serif italic text-faint tracking-[0.04em]"
                    style={{ fontSize: "9.5px", fontVariationSettings: "'opsz' 10" }}
                  >
                    <span>past 12 months</span>
                    <span style={{ color: "var(--accent-text)", fontWeight: 500 }}>today</span>
                  </div>
                </div>

                {/* Allocation bar */}
                <div className="flex h-[6px] rounded-full overflow-hidden mb-3 gap-[2px]">
                  <span className="block h-full" style={{ flex: 50, background: "var(--cat-property)" }} />
                  <span className="block h-full" style={{ flex: 26, background: "var(--cat-markets)" }} />
                  <span className="block h-full" style={{ flex: 12, background: "var(--cat-reserves)" }} />
                  <span className="block h-full" style={{ flex: 6, background: "var(--cat-crypto)" }} />
                  <span className="block h-full" style={{ flex: 6, background: "var(--cat-tangible)" }} />
                </div>

                {/* Asset rows */}
                <div className="border-t border-border pt-[6px]">
                  {[
                    { color: "var(--cat-property)", name: "House · Lelystad", value: "€308.000" },
                    { color: "var(--cat-markets)", name: "ASML · 312 sh", value: "€186.624" },
                    { color: "var(--cat-crypto)", name: "BTC · 0,84", value: "€48.310" },
                  ].map((row, i, arr) => (
                    <div
                      key={row.name}
                      className="flex items-center gap-[9px] py-[6px]"
                      style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}
                    >
                      <span className="w-4 h-4 rounded-[4px] flex-shrink-0" style={{ background: row.color }} />
                      <span className="flex-1 text-[12px] text-fg font-medium">{row.name}</span>
                      <span className="text-[12px] text-fg font-medium tabular-nums">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Alert chips stack */}
              <div className="flex flex-col gap-[10px]">
                {[
                  {
                    iconStyle: { background: "rgba(181,86,75,0.18)", color: "#E89A8F" },
                    cat: "ECB · attention",
                    msg: <>Rate <strong style={{ fontWeight: 500, color: "var(--accent-soft)" }}>+25 bps</strong> — affects your mortgage.</>,
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                        <path d="M12 9v4M12 17h.01M4 19h16a2 2 0 001.7-3l-8-13.5a2 2 0 00-3.4 0L2.3 16A2 2 0 004 19z" />
                      </svg>
                    ),
                  },
                  {
                    iconStyle: { background: "rgba(74,124,94,0.22)", color: "#97D1A8" },
                    cat: "ASML · earnings beat",
                    msg: <><strong style={{ fontWeight: 500, color: "var(--accent-soft)" }}>+€8.300</strong> on your 312 shares.</>,
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                        <path d="M3 17l6-6 4 4 8-9" /><path d="M14 6h7v7" />
                      </svg>
                    ),
                  },
                  {
                    iconStyle: { background: "rgba(184,153,104,0.22)", color: "#E6CB94" },
                    cat: "BTC · momentum",
                    msg: <>Above $60k — <strong style={{ fontWeight: 500, color: "var(--accent-soft)" }}>+€4.100</strong> on 0,84 BTC.</>,
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                        <circle cx="12" cy="12" r="9" /><path d="M9 7.5h5.5a2.5 2.5 0 010 5H9v-5zm0 5h6a2.5 2.5 0 010 5H9v-5z" />
                      </svg>
                    ),
                  },
                ].map((chip) => (
                  <div
                    key={chip.cat}
                    className="flex items-center gap-[9px] rounded-[12px]"
                    style={{
                      background: "var(--hero)",
                      padding: "10px 12px 10px 10px",
                      boxShadow: "0 20px 40px -22px rgba(26,31,46,0.32)",
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-[8px] flex items-center justify-center flex-shrink-0"
                      style={chip.iconStyle}
                    >
                      {chip.icon}
                    </div>
                    <div>
                      <div
                        className="uppercase font-medium"
                        style={{ fontSize: "8.5px", letterSpacing: "0.12em", color: "rgba(255,255,255,0.55)", marginBottom: 2 }}
                      >
                        {chip.cat}
                      </div>
                      <div style={{ fontSize: "11.5px", lineHeight: 1.3, color: "#FFFFFF" }}>
                        {chip.msg}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
