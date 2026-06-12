export function Privacy() {
  return (
    <div className="max-w-[1200px] mx-auto" id="privacy" style={{ padding: "0 var(--wrap-pad)" }}>
      <section style={{ paddingBottom: "clamp(48px,7vw,80px)", paddingTop: 0 }}>
        <div className="text-center max-w-[880px] mx-auto reveal" style={{ paddingTop: "clamp(32px,5vw,56px)" }}>
          <div
            className="mx-auto mb-6 flex items-center justify-center rounded-full bg-surface border border-border"
            style={{ width: 48, height: 48, color: "var(--accent)" }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
              <rect x="4" y="10" width="16" height="11" rx="2"/>
              <path d="M8 10V7a4 4 0 018 0v3"/>
              <circle cx="12" cy="15" r="1.2" fill="currentColor"/>
            </svg>
          </div>
          <h3
            className="font-serif font-medium text-hero leading-[1.08] tracking-[-0.02em]"
            style={{ fontSize: "clamp(30px,5.5vw,48px)", fontVariationSettings: "'opsz' 56", marginBottom: 18 }}
          >
            Your data is yours.{" "}
            <span className="italic font-normal text-dim">Nothing more to say.</span>
          </h3>
          <p className="text-dim leading-[1.55]" style={{ fontSize: "clamp(14px,3vw,16px)", maxWidth: 560, margin: "0 auto" }}>
            EU-hosted. Encrypted. Self-funded. Read-only by design. Export anytime.
          </p>
        </div>
      </section>
    </div>
  );
}
