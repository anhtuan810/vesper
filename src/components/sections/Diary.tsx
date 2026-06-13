import { Eyebrow } from "./Eyebrow";

export function Diary() {
  return (
    <div className="max-w-[1200px] mx-auto" id="diary" style={{ padding: "0 var(--wrap-pad)" }}>
      <section style={{ padding: "clamp(32px,5vw,56px) 0" }}>
        <div style={{ marginBottom: "clamp(14px,2.5vw,22px)" }}>
          <Eyebrow n="01">The diary</Eyebrow>
          <h2
            className="font-serif font-medium text-hero leading-[1.02] tracking-[-0.025em] max-w-[880px] reveal"
            style={{ fontSize: "clamp(30px,6.5vw,46px)", fontVariationSettings: "'opsz' 56" }}
          >
            Look back.<br />
            <span className="italic font-normal text-dim">In context.</span>
          </h2>
        </div>

        {/* Diary grid — joined cards at ≥820px */}
        <div className="grid gap-[18px] items-stretch min-[820px]:grid-cols-[1fr_1.1fr] min-[820px]:gap-0">

          {/* Decision card */}
          <div
            className="reveal reveal-delay-1 bg-surface border border-border rounded-2xl min-[820px]:rounded-r-none min-[820px]:border-r-0"
            style={{ padding: "clamp(16px,2.5vw,22px)" }}
          >
            <div className="flex items-center gap-3 mb-[14px]">
              <span
                className="font-serif italic text-faint"
                style={{ fontSize: "12.5px", fontVariationSettings: "'opsz' 13" }}
              >
                14 October 2024
              </span>
              <span
                className="text-[9.5px] uppercase tracking-[0.1em] rounded-full font-medium ml-auto"
                style={{ padding: "3px 9px", background: "var(--negative-soft)", color: "var(--negative-text)" }}
              >
                Trimmed
              </span>
            </div>
            <div
              className="font-serif font-medium text-hero leading-[1.1] tracking-[-0.01em] mb-1"
              style={{ fontSize: "clamp(22px,4vw,26px)", fontVariationSettings: "'opsz' 28" }}
            >
              NVIDIA
            </div>
            <div className="text-[13px] text-dim mb-[18px]">
              −80 shares at €150 &nbsp;·&nbsp; −€12.000
            </div>
            <div className="uppercase tracking-[0.1em] font-medium mb-2" style={{ fontSize: "10.5px", color: "var(--text-faint)" }}>
              Your reasoning, in your words
            </div>
            <div
              className="font-serif italic text-fg leading-[1.5]"
              style={{ fontSize: "clamp(15px,3vw,16.5px)", fontVariationSettings: "'opsz' 17" }}
            >
              <span className="font-serif" style={{ fontSize: 26, color: "var(--text-faint)", verticalAlign: "-8px", marginRight: 2, lineHeight: 0 }}>&ldquo;</span>
              Above my 35% comfort level. Will reassess if it drops back to 32–33%.
            </div>
          </div>

          {/* Context card */}
          <div
            className="reveal reveal-delay-2 rounded-2xl min-[820px]:rounded-l-none flex flex-col"
            style={{ background: "var(--bg-deep)", color: "var(--text)", padding: "clamp(16px,2.5vw,22px)" }}
          >
            <div className="flex items-center gap-3 pb-[14px] mb-[14px] border-b border-border">
              <span
                className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center flex-shrink-0 border border-border bg-surface"
                style={{ color: "var(--accent-text)" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                  <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
                </svg>
              </span>
              <div>
                <div className="font-serif font-medium text-hero tracking-[-0.005em]" style={{ fontSize: 16, fontVariationSettings: "'opsz' 17" }}>
                  What was happening then
                </div>
                <div className="uppercase tracking-[0.06em] mt-[2px]" style={{ fontSize: "10.5px", color: "var(--text-faint)" }}>
                  Snapshot, 14 Oct 2024
                </div>
              </div>
            </div>

            <div className="flex flex-col">
              {[
                { k: "ECB rate",     v: "4,00%" },
                { k: "NVIDIA price", v: <>€150 · <em className="italic text-dim">−12% from peak</em></> },
                { k: "Semis index",  v: "+18% YTD" },
                { k: "In the news",  v: <em className="italic text-dim">&ldquo;AI capex cycle peaking&rdquo; — FT, Oct 11</em> },
                { k: "Your portfolio", v: "AI chips 45% of markets sleeve" },
              ].map((row, i, arr) => (
                <div
                  key={row.k}
                  className="flex justify-between items-baseline gap-[14px] py-[7px]"
                  style={{ borderBottom: i < arr.length - 1 ? "1px dashed var(--border)" : "none" }}
                >
                  <span className="uppercase tracking-[0.08em] font-medium flex-shrink-0" style={{ fontSize: "10.5px", color: "var(--text-faint)" }}>
                    {row.k}
                  </span>
                  <span className="font-serif font-medium text-right text-fg leading-[1.35]" style={{ fontSize: 13, fontVariationSettings: "'opsz' 14" }}>
                    {row.v}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-[14px] pt-3 border-t border-border font-serif text-fg leading-[1.5]" style={{ fontSize: "13.5px", fontVariationSettings: "'opsz' 14" }}>
              Looking back:{" "}
              <strong style={{ color: "var(--accent-text)", fontWeight: 600 }}>NVIDIA rose 14% in the six months after.</strong>
              <em className="italic text-dim block mt-[2px]">You reassessed in March and added back.</em>
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}
