export function Scenario() {
  return (
    <div className="band-dark" style={{ background: "var(--hero)", color: "rgba(255,255,255,0.85)" }}>
      <div className="max-w-[1200px] mx-auto" style={{ padding: "0 var(--wrap-pad)" }}>
        <section style={{ padding: "clamp(24px,3.5vw,44px) 0" }}>

          <div className="text-center" style={{ marginBottom: "clamp(14px,2.5vw,22px)" }}>
            <h2
              className="font-serif font-medium leading-[1.02] tracking-[-0.025em] mx-auto"
              style={{ fontSize: "clamp(30px,6.5vw,46px)", fontVariationSettings: "'opsz' 56", color: "#FFFFFF", maxWidth: 880 }}
            >
              Try the move.<br />
              <span className="italic font-normal" style={{ color: "rgba(255,255,255,0.5)" }}>Without making it.</span>
            </h2>
            <p className="mx-auto mt-[18px] leading-[1.55]"
              style={{ fontSize: "clamp(16px,3.8vw,18px)", color: "rgba(255,255,255,0.6)", maxWidth: 600 }}
            >
              Ask the question. Get the numbers. Decide later — or not at all.
            </p>
          </div>

          <div className="grid gap-4 min-[720px]:grid-cols-3 min-[720px]:gap-[14px]">

            {/* Card 1: ASML concentration */}
            <div
              className="reveal rounded-2xl flex flex-col gap-[14px]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "clamp(18px,3vw,24px)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 12px rgba(0,0,0,0.25)" }}
            >
              <div
                className="font-serif italic pb-4"
                style={{ fontSize: "clamp(18px,3.5vw,21px)", lineHeight: 1.3, color: "rgba(255,255,255,0.92)", fontVariationSettings: "'opsz' 22", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
              >
                &ldquo;What if I sell €40k of ASML and put it in VWCE?&rdquo;
              </div>
              <div style={{ fontSize: "14.5px", lineHeight: 1.55, color: "rgba(255,255,255,0.7)" }}>
                <span
                  className="inline-block text-[10px] uppercase tracking-[0.1em] font-medium mb-[10px]"
                  style={{ color: "var(--accent-soft)", background: "rgba(221,235,225,0.12)", padding: "3px 8px", borderRadius: 999 }}
                >
                  Volnar
                </span>
                <br />
                Concentration drops from{" "}
                <strong style={{ color: "#FFFFFF", fontWeight: 600 }}>41%</strong> to{" "}
                <strong style={{ color: "#FFFFFF", fontWeight: 600 }}>18%</strong>. Expected dividend drag about{" "}
                <strong style={{ color: "#FFFFFF", fontWeight: 600 }}>€1.100/year</strong>, offset by broader exposure.
                <em className="font-serif italic block mt-[6px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Tax impact at NL Box 3 is roughly flat.
                </em>
              </div>
              {/* Concentration donuts */}
              <div style={{ marginTop: 4, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-center gap-[14px]">
                  <div className="flex flex-col items-center gap-[6px]">
                    <svg width="64" height="64" viewBox="0 0 64 64">
                      <circle className="sc-d-track" cx="32" cy="32" r="26" strokeWidth="6" fill="none"/>
                      <circle className="sc-d-fill-warn" cx="32" cy="32" r="26" strokeWidth="6" fill="none"
                        strokeDasharray="66.96 96.39" strokeLinecap="round" transform="rotate(-90 32 32)"/>
                      <text className="sc-d-pct" x="32" y="37" textAnchor="middle" style={{ fontFamily: "var(--serif)", fontSize: 16, fontWeight: 500, fill: "#FFFFFF" }}>41%</text>
                    </svg>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Now</span>
                  </div>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: "rgba(255,255,255,0.4)" }}>
                    <path d="M5 12h14M13 6l6 6-6 6"/>
                  </svg>
                  <div className="flex flex-col items-center gap-[6px]">
                    <svg width="64" height="64" viewBox="0 0 64 64">
                      <circle className="sc-d-track" cx="32" cy="32" r="26" strokeWidth="6" fill="none"/>
                      <circle className="sc-d-fill-ok" cx="32" cy="32" r="26" strokeWidth="6" fill="none"
                        strokeDasharray="29.4 134.0" strokeLinecap="round" transform="rotate(-90 32 32)"/>
                      <text x="32" y="37" textAnchor="middle" style={{ fontFamily: "var(--serif)", fontSize: 16, fontWeight: 500, fill: "#FFFFFF" }}>18%</text>
                    </svg>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: "0.04em", textTransform: "uppercase" }}>After</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Rate rise */}
            <div
              className="reveal reveal-delay-1 rounded-2xl flex flex-col gap-[14px]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "clamp(18px,3vw,24px)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 12px rgba(0,0,0,0.25)" }}
            >
              <div
                className="font-serif italic pb-4"
                style={{ fontSize: "clamp(18px,3.5vw,21px)", lineHeight: 1.3, color: "rgba(255,255,255,0.92)", fontVariationSettings: "'opsz' 22", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
              >
                &ldquo;What if rates rise another 50 bps before my reset?&rdquo;
              </div>
              <div style={{ fontSize: "14.5px", lineHeight: 1.55, color: "rgba(255,255,255,0.7)" }}>
                <span
                  className="inline-block text-[10px] uppercase tracking-[0.1em] font-medium mb-[10px]"
                  style={{ color: "var(--accent-soft)", background: "rgba(221,235,225,0.12)", padding: "3px 8px", borderRadius: 999 }}
                >
                  Volnar
                </span>
                <br />
                Mortgage payment goes from €1.420 to{" "}
                <strong style={{ color: "#FFFFFF", fontWeight: 600 }}>~€1.512</strong> in March 2027. Your cash buffer still covers{" "}
                <strong style={{ color: "#FFFFFF", fontWeight: 600 }}>14 months</strong> instead of 17.
                <em className="font-serif italic block mt-[6px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Within the comfort you set.
                </em>
              </div>
              {/* Mortgage bars */}
              <div style={{ marginTop: 4, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex flex-col gap-[10px]">
                  {[
                    { label: "Now", pct: "78%", value: "€1.420", warn: false },
                    { label: "After", pct: "84%", value: "€1.512", warn: true },
                  ].map((row) => (
                    <div key={row.label} className="grid items-center gap-[10px]" style={{ gridTemplateColumns: "48px 1fr 64px", fontSize: 12 }}>
                      <span style={{ color: "rgba(255,255,255,0.5)", fontVariantNumeric: "tabular-nums" }}>{row.label}</span>
                      <span style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden", display: "block" }}>
                        <span style={{ display: "block", height: "100%", width: row.pct, background: row.warn ? "#E89890" : "rgba(255,255,255,0.4)", borderRadius: 999 }} />
                      </span>
                      <span className="font-serif font-medium text-right" style={{ color: "#FFFFFF", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Card 3: Pension redirect */}
            <div
              className="reveal reveal-delay-2 rounded-2xl flex flex-col gap-[14px]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "clamp(18px,3vw,24px)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 12px rgba(0,0,0,0.25)" }}
            >
              <div
                className="font-serif italic pb-4"
                style={{ fontSize: "clamp(18px,3.5vw,21px)", lineHeight: 1.3, color: "rgba(255,255,255,0.92)", fontVariationSettings: "'opsz' 22", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
              >
                &ldquo;What if I redirect €1.500/month to pension for two years?&rdquo;
              </div>
              <div style={{ fontSize: "14.5px", lineHeight: 1.55, color: "rgba(255,255,255,0.7)" }}>
                <span
                  className="inline-block text-[10px] uppercase tracking-[0.1em] font-medium mb-[10px]"
                  style={{ color: "var(--accent-soft)", background: "rgba(221,235,225,0.12)", padding: "3px 8px", borderRadius: 999 }}
                >
                  Volnar
                </span>
                <br />
                Retirement target hits{" "}
                <strong style={{ color: "#FFFFFF", fontWeight: 600 }}>4 months earlier</strong>. Public-markets sleeve loses roughly{" "}
                <strong style={{ color: "#FFFFFF", fontWeight: 600 }}>€38k of compounding</strong> by then.
                <em className="font-serif italic block mt-[6px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Worth weighing against the tax deduction.
                </em>
              </div>
              {/* Retirement timeline */}
              <div style={{ marginTop: 4, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)", position: "relative", padding: "26px 12px 10px" }}>
                <div style={{ position: "absolute", left: 12, right: 12, top: 32, height: 1, background: "rgba(255,255,255,0.12)" }} />
                <div className="flex justify-between" style={{ position: "relative", zIndex: 1 }}>
                  <div className="flex flex-col items-center gap-2">
                    <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#6FE8A4", boxShadow: "0 0 0 4px rgba(111,232,164,0.18)", display: "block" }} />
                    <span style={{ fontSize: 11, color: "#6FE8A4", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center" }}>Now reach</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <span style={{ width: 12, height: 12, borderRadius: "50%", background: "rgba(255,255,255,0.3)", border: "2px solid var(--hero)", display: "block" }} />
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center" }}>Original target</span>
                  </div>
                </div>
                <div className="text-center mt-3 font-serif italic" style={{ fontSize: 12, color: "#6FE8A4" }}>← 4 months earlier</div>
              </div>
            </div>

          </div>
        </section>
      </div>
    </div>
  );
}
