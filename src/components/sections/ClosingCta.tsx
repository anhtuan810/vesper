import { AppStoreBadges } from "./AppStoreBadges";

export function ClosingCta() {
  return (
    <div className="band-dark" id="get-started" style={{ background: "var(--hero)" }}>
      <div className="max-w-[1200px] mx-auto" style={{ padding: "0 var(--wrap-pad)" }}>
        <section className="text-center" style={{ padding: "clamp(56px,9vw,104px) 0" }}>
          <div
            className="mkt-eyebrow reveal"
            data-light=""
            data-center=""
            style={{ justifyContent: "center" }}
          >
            <span className="mkt-eyebrow-rule" aria-hidden="true" />
            <span>Pilot access · invite only</span>
            <span className="mkt-eyebrow-rule" aria-hidden="true" />
          </div>
          <h2
            className="font-serif font-medium leading-[1.02] tracking-[-0.03em] mx-auto reveal"
            style={{ fontSize: "clamp(38px,8vw,72px)", fontVariationSettings: "'opsz' 72", color: "#FFFFFF", maxWidth: 820 }}
          >
            Quiet confidence<br />
            <span className="italic font-normal" style={{ color: "rgba(255,255,255,0.55)" }}>
              over your portfolio.
            </span>
          </h2>
          <p
            className="mx-auto reveal reveal-delay-1"
            style={{
              fontSize: "clamp(15px,3.4vw,17px)",
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.6)",
              maxWidth: 520,
              margin: "clamp(18px,3vw,26px) auto clamp(28px,4vw,36px)",
            }}
          >
            Five minutes to add your first asset — by chat, photo, or PDF.
            No broker connection required.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap reveal reveal-delay-2">
            <a href="https://app.volnar.nl/demo" className="mkt-btn mkt-btn-lg mkt-btn-light">
              View the live demo
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </div>

          {/* App store badges — the download moment */}
          <div className="reveal reveal-delay-2 flex justify-center" style={{ marginTop: "clamp(24px,4vw,32px)" }}>
            <AppStoreBadges light />
          </div>

          <p
            className="font-mono uppercase reveal reveal-delay-3"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              color: "rgba(255,255,255,0.4)",
              marginTop: "clamp(20px,3vw,26px)",
            }}
          >
            iPhone &amp; web today &nbsp;·&nbsp; Android soon &nbsp;·&nbsp; EU-hosted
          </p>
        </section>
      </div>
    </div>
  );
}
