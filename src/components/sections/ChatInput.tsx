export function ChatInput() {
  return (
    <div className="max-w-[1200px] mx-auto" style={{ padding: "0 var(--wrap-pad)" }}>
      <section
        className="border-t border-border"
        style={{ padding: "clamp(48px,7vw,80px) 0" }}
      >
        {/* Section header — centered */}
        <div className="text-center" style={{ marginBottom: "clamp(28px,5vw,44px)" }}>
          <span className="text-[11px] uppercase tracking-[0.18em] text-accent-text font-medium mb-[14px] inline-block">
            The way in
          </span>
          <h2
            className="font-serif font-medium text-hero leading-[1.02] tracking-[-0.025em] max-w-[880px] mx-auto"
            style={{ fontSize: "clamp(36px,7.5vw,56px)", fontVariationSettings: "'opsz' 56" }}
          >
            Add anything.<br />
            <span className="italic font-normal text-dim">In any form.</span>
          </h2>
        </div>

        {/* Chat showcase */}
        <div
          className="max-w-[720px] mx-auto bg-surface border border-border rounded-2xl"
          style={{
            padding: "clamp(20px,4vw,28px) clamp(20px,4vw,28px) 16px",
            boxShadow: "0 1px 2px rgba(26,31,46,0.03), 0 40px 80px -32px rgba(26,31,46,0.18)",
          }}
        >
          {/* Chat header */}
          <div className="flex items-center gap-[10px] pb-[14px] border-b border-border mb-4">
            <span className="w-2 h-2 rounded-full bg-accent" />
            <span
              className="font-serif font-medium text-fg"
              style={{ fontSize: 15, fontVariationSettings: "'opsz' 16" }}
            >
              Volnar · adding
            </span>
            <span className="ml-auto text-[12px] text-faint italic font-serif">today, 14:08</span>
          </div>

          {/* Message: user text */}
          <div
            className="mb-3 max-w-[86%] ml-auto text-fg"
            style={{
              fontSize: "clamp(13.5px,3.4vw,15px)",
              lineHeight: 1.5,
              background: "var(--surface-elev)",
              padding: "11px 15px",
              borderRadius: "16px 16px 4px 16px",
            }}
          >
            Bought 50 ASML today at €642 each.
          </div>

          {/* Message: assistant reply */}
          <div
            className="mb-3 max-w-[86%] text-fg"
            style={{ fontSize: "clamp(13.5px,3.4vw,15px)", lineHeight: 1.5, padding: "4px 0" }}
          >
            Updated. 312 shares now at a blended €598.
          </div>

          {/* Message: user attachment — PDF */}
          <div className="mb-3 max-w-[86%] ml-auto">
            <div
              className="inline-flex items-center gap-[10px] bg-surface border border-border"
              style={{ borderRadius: 10, padding: "8px 12px 8px 8px" }}
            >
              <div className="w-9 h-9 rounded-lg flex-shrink-0 relative overflow-hidden bg-bg-deep">
                <div
                  className="absolute"
                  style={{
                    inset: "6px 8px",
                    background: "repeating-linear-gradient(180deg, rgba(26,31,46,0.25) 0 1px, transparent 1px 5px)",
                  }}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[12px] text-fg font-medium truncate">Mortgage_statement.pdf</span>
                <span className="text-[10.5px] text-faint">ABN AMRO · May</span>
              </div>
            </div>
          </div>

          {/* Message: assistant reply */}
          <div
            className="mb-3 max-w-[86%] text-fg"
            style={{ fontSize: "clamp(13.5px,3.4vw,15px)", lineHeight: 1.5, padding: "4px 0" }}
          >
            Read balance{" "}
            <strong className="font-medium">€132.040</strong>, rate{" "}
            <strong className="font-medium">3,2%</strong>. Save?
          </div>

          {/* Message: user attachment — screenshot */}
          <div className="mb-3 max-w-[86%] ml-auto">
            <div
              className="inline-flex items-center gap-[10px] bg-surface border border-border"
              style={{ borderRadius: 10, padding: "8px 12px 8px 8px" }}
            >
              <div
                className="w-9 h-9 rounded-lg flex-shrink-0 relative overflow-hidden"
                style={{ background: "var(--cat-markets-soft)" }}
              >
                <div
                  className="absolute opacity-50"
                  style={{
                    inset: 6,
                    background:
                      "linear-gradient(to bottom, transparent 0, transparent 40%, var(--cat-markets) 41%, var(--cat-markets) 42%, transparent 43%), linear-gradient(to bottom, transparent 0, transparent 60%, var(--cat-markets) 61%, var(--cat-markets) 62%, transparent 63%)",
                  }}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[12px] text-fg font-medium truncate">DEGIRO_portfolio.png</span>
                <span className="text-[10.5px] text-faint">Screenshot · 4 positions</span>
              </div>
            </div>
          </div>

          {/* Message: assistant reply */}
          <div
            className="mb-3 max-w-[86%] text-fg"
            style={{ fontSize: "clamp(13.5px,3.4vw,15px)", lineHeight: 1.5, padding: "4px 0" }}
          >
            Found{" "}
            <strong className="font-medium">ASML, VWCE, IEFA</strong>, €4.740 cash. Save all?{" "}
            <em className="font-serif italic text-dim">I&apos;ll ask before overwriting.</em>
          </div>

          {/* Input bar */}
          <div className="mt-[14px] pt-4 border-t border-border flex items-center gap-[10px]">
            <div className="flex-1 rounded-full bg-surface-elev px-[18px] py-3 text-[13.5px] text-faint italic">
              Type, paste, or attach anything…
            </div>
            <div className="flex gap-1">
              {/* Camera */}
              <button className="w-[38px] h-[38px] rounded-full bg-bg border border-border flex items-center justify-center text-dim">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                  <rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M8 6l1.5-2h5L16 6" />
                </svg>
              </button>
              {/* Paperclip */}
              <button className="w-[38px] h-[38px] rounded-full bg-bg border border-border flex items-center justify-center text-dim">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                  <path d="M21 12.5l-8.5 8.5a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3l7.5-7.5" />
                </svg>
              </button>
              {/* Send */}
              <button
                className="w-[38px] h-[38px] rounded-full flex items-center justify-center"
                style={{ background: "var(--accent)", border: "1px solid var(--accent)", color: "#FFFFFF" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
