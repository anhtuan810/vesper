export function Hero() {
  return (
    <div className="relative">
      {/* Ambient wash — accent + steel + amber, blurred, drifting slowly */}
      <div className="mkt-aurora" aria-hidden="true" />

      <div className="max-w-[1200px] mx-auto relative" style={{ padding: "0 var(--wrap-pad)" }}>
        <section style={{ padding: "clamp(32px,5vw,64px) 0 clamp(32px,5vw,64px)" }}>
          <div
            className="grid items-center min-[920px]:grid-cols-[1fr_1.05fr]"
            style={{ gap: "clamp(48px,8vw,64px)" }}
          >
            {/* Left: headline + CTA */}
            <div>
              <h1
                className="font-serif font-semibold text-hero leading-[0.92] tracking-[-0.035em]"
                style={{ fontSize: "clamp(56px,13vw,108px)", fontVariationSettings: "'opsz' 100", marginBottom: "clamp(20px,3vw,28px)" }}
              >
                <span className="rise rise-1 block">Wealth.</span>
                <span className="rise rise-2 block italic font-normal text-accent">Watched over.</span>
              </h1>
              <p
                className="rise rise-3 text-dim max-w-[460px]"
                style={{ fontSize: "clamp(17px,4vw,19px)", lineHeight: 1.5, marginBottom: "clamp(28px,5vw,40px)" }}
              >
                Everything you own, in one chat.{" "}
                <strong className="text-fg font-medium">With a quiet eye on the world that moves it.</strong>
              </p>
              <div className="rise rise-4 flex items-center gap-3 flex-wrap">
                <a href="https://app.volnar.nl" className="mkt-btn mkt-btn-lg mkt-btn-primary">
                  Get started
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                    <path d="M5 12h14M13 6l6 6-6 6"/>
                  </svg>
                </a>
                <a href="https://app.volnar.nl/demo" className="mkt-btn mkt-btn-lg mkt-btn-ghost">
                  View the live demo
                </a>
              </div>
              <p
                className="rise rise-4 font-serif italic text-faint"
                style={{ fontSize: 13, marginTop: 18 }}
              >
                Pilot access · invite only · web &amp; iPhone
              </p>
            </div>

            {/* Right: portfolio card + floating alert chips */}
            <div className="rise rise-3 w-full max-w-[580px] ml-auto max-[920px]:mx-auto max-[920px]:pt-4">
              <div className="grid min-[920px]:grid-cols-[1.35fr_1fr] gap-3 max-[920px]:gap-[14px]">

                {/* Portfolio card */}
                <div
                  className="bg-surface border border-border rounded-xl overflow-hidden"
                  style={{
                    "--card-pad": "clamp(18px,3vw,22px)",
                    padding: "var(--card-pad)",
                    boxShadow: "0 1px 2px rgba(26,31,46,0.03), 0 32px 64px -28px rgba(26,31,46,0.18)",
                  } as React.CSSProperties}
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-faint uppercase tracking-[0.08em]" style={{ fontSize: "10.5px" }}>
                      <span className="live-dot" aria-hidden="true" />
                      Net worth
                    </span>
                    <span className="font-serif italic text-faint" style={{ fontSize: "10.5px" }}>live · today</span>
                  </div>
                  <div
                    className="font-serif font-medium text-hero leading-[1.0] tracking-[-0.02em] mb-[6px]"
                    style={{ fontSize: "clamp(32px,7.5vw,40px)", fontVariationSettings: "'opsz' 44" }}
                  >
                    <span className="text-faint">€</span>616.086
                  </div>
                  <div
                    className="inline-block text-[11px] mb-[14px]"
                    style={{ padding: "2px 8px", borderRadius: 5, background: "var(--positive-soft)", color: "var(--positive-text)" }}
                  >
                    + 2,1% past month
                  </div>

                  {/* Trend chart */}
                  <div className="mb-3">
                    <svg viewBox="0 0 320 90" preserveAspectRatio="none" style={{ width: "100%", height: 70, display: "block" }}>
                      <defs>
                        <linearGradient id="heroTrendGrad" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22"/>
                          <stop offset="1" stopColor="var(--accent)" stopOpacity="0"/>
                        </linearGradient>
                      </defs>
                      <line x1="0" y1="22" x2="320" y2="22" stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2 4"/>
                      <line x1="0" y1="56" x2="320" y2="56" stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2 4"/>
                      <path d="M0,72 C24,68 42,66 70,60 C100,54 122,56 152,46 C182,36 200,38 232,26 L280,14 L320,8 L320,90 L0,90 Z" fill="url(#heroTrendGrad)"/>
                      <path
                        className="hero-line-anim"
                        d="M0,72 C24,68 42,66 70,60 C100,54 122,56 152,46 C182,36 200,38 232,26 L280,14 L320,8"
                        fill="none" stroke="var(--accent)" strokeWidth="1.8"
                      />
                      <circle cx="320" cy="8" r="3.5" fill="var(--accent)"/>
                      <circle cx="320" cy="8" r="7" fill="var(--accent)" opacity="0.18"/>
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
                    <span className="block h-full" style={{ flex: 50, background: "var(--cat-property)" }}/>
                    <span className="block h-full" style={{ flex: 26, background: "var(--cat-markets)" }}/>
                    <span className="block h-full" style={{ flex: 12, background: "var(--cat-reserves)" }}/>
                    <span className="block h-full" style={{ flex: 6,  background: "var(--cat-crypto)" }}/>
                    <span className="block h-full" style={{ flex: 6,  background: "var(--cat-tangible)" }}/>
                  </div>

                  {/* Asset rows */}
                  <div className="border-t border-border pt-[6px]">
                    {[
                      { color: "var(--cat-property)", name: "House · Lelystad",  value: "€308.000" },
                      { color: "var(--cat-markets)",  name: "ASML · 312 sh",     value: "€186.624" },
                      { color: "var(--cat-crypto)",   name: "BTC · 0,84",        value: "€48.310" },
                    ].map((row, i, arr) => (
                      <div
                        key={row.name}
                        className="flex items-center gap-[9px] py-[6px]"
                        style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}
                      >
                        <span className="w-4 h-4 rounded-[4px] flex-shrink-0" style={{ background: row.color }}/>
                        <span className="flex-1 text-[12px] text-fg font-medium">{row.name}</span>
                        <span className="text-[12px] text-fg font-medium tabular-nums">{row.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Worth knowing band — the app's signature callout */}
                  <div
                    className="border-t border-border"
                    style={{
                      margin: "10px calc(var(--card-pad) * -1) calc(var(--card-pad) * -1)",
                      padding: "10px var(--card-pad) 12px",
                      background: "var(--surface-elev)",
                    }}
                  >
                    <div className="mb-1 flex items-center gap-1.5 uppercase tracking-[0.08em] text-faint" style={{ fontSize: 9.5 }}>
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                      Worth knowing
                    </div>
                    <p className="m-0 font-serif italic leading-snug text-dim" style={{ fontSize: 12.5 }}>
                      <strong className="not-italic font-semibold text-fg">ECB decides Thursday</strong> — your mortgage
                      resets in March 2027.
                    </p>
                  </div>
                </div>

                {/* Alert chip stack — overlaps portfolio card edge on desktop */}
                <div className="alert-stack-float">

                  <div className="alert-chip-anim alert-chip-tight">
                    <div className="chip-ic warn">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 9v4M12 17h.01M4 19h16a2 2 0 001.7-3l-8-13.5a2 2 0 00-3.4 0L2.3 16A2 2 0 004 19z"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="chip-cat"><span className="live-dot" aria-hidden="true"/>ECB · attention</div>
                      <div className="chip-msg">Rate <strong>+25 bps</strong> — affects your mortgage.</div>
                    </div>
                  </div>

                  <div className="alert-chip-anim alert-chip-tight">
                    <div className="chip-ic pos">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 17l6-6 4 4 8-9"/><path d="M14 6h7v7"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="chip-cat">ASML · earnings beat</div>
                      <div className="chip-msg"><strong>+€8.300</strong> on your 312 shares.</div>
                    </div>
                  </div>

                  <div className="alert-chip-anim alert-chip-tight">
                    <div className="chip-ic btc">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9"/>
                        <path d="M9 7.5h5.5a2.5 2.5 0 010 5H9v-5zm0 5h6a2.5 2.5 0 010 5H9v-5z"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="chip-cat">BTC · momentum</div>
                      <div className="chip-msg">Above $60k — <strong>+€4.100</strong>.</div>
                    </div>
                  </div>

                </div>
              </div>
            </div>

          </div>
        </section>
      </div>
    </div>
  );
}
