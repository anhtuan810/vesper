import { Eyebrow } from "./Eyebrow";
import { AppStoreBadges } from "./AppStoreBadges";
import {
  ANNUAL_MONTHS_FREE,
  PLAN_PRICES,
  TRIAL_DAYS,
  formatPrice,
} from "@/lib/subscription";

// Signing up happens in the app; an unauthenticated visitor lands on login, then
// the paywall after signing in. Absolute URL so it works from the marketing
// domain (volnar.nl) too. Points at /login so a returning demo visitor reaches a
// fresh sign-in rather than resuming the demo session.
const APP_URL = "https://app.volnar.nl/login";

export function Pricing() {
  const annualPerMonth = formatPrice(PLAN_PRICES.annual / 12);

  return (
    <>
      {/* ── Light: plan cards ── */}
      <div className="max-w-[1200px] mx-auto" id="pricing" style={{ padding: "0 var(--wrap-pad)" }}>
        <section style={{ paddingTop: "clamp(48px,7vw,84px)", paddingBottom: "clamp(32px,5vw,56px)" }}>
          <div className="text-center max-w-[680px] mx-auto">
            <Eyebrow n="07" center>
              Pricing
            </Eyebrow>
            <h2
              className="font-serif font-medium text-hero leading-[1.06] tracking-[-0.02em] reveal"
              style={{ fontSize: "clamp(30px,5.5vw,48px)", fontVariationSettings: "'opsz' 56", marginBottom: 14 }}
            >
              Start free.{" "}
              <span className="italic font-normal text-dim">Stay if it earns its place.</span>
            </h2>
            <p
              className="text-dim leading-[1.55] reveal reveal-delay-1"
              style={{ fontSize: "clamp(14px,3vw,16px)", maxWidth: 520, margin: "0 auto" }}
            >
              A {TRIAL_DAYS}-day free trial with card on file. One subscription covers web and iPhone.
              Cancel anytime.
            </p>
          </div>

          <div
            className="reveal reveal-delay-2"
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              maxWidth: 720,
              margin: "clamp(28px,4vw,40px) auto 0",
            }}
          >
            <PriceCard
              plan="Annual"
              price={formatPrice(PLAN_PRICES.annual)}
              period="per year"
              sub={`${annualPerMonth} per month, billed yearly`}
              badge={`${ANNUAL_MONTHS_FREE} months free`}
              highlight
            />
            <PriceCard
              plan="Monthly"
              price={formatPrice(PLAN_PRICES.monthly)}
              period="per month"
              sub="Flexible, month to month"
            />
          </div>

          <div className="text-center reveal reveal-delay-3" style={{ marginTop: "clamp(24px,4vw,32px)" }}>
            <a href={APP_URL} className="mkt-btn mkt-btn-primary mkt-btn-lg">
              Start free trial
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: 14, height: 14 }}
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
            <p
              className="font-mono uppercase text-faint"
              style={{ fontSize: 10, letterSpacing: "0.16em", marginTop: 14, lineHeight: 1.6 }}
            >
              {TRIAL_DAYS} days free &nbsp;·&nbsp; then {formatPrice(PLAN_PRICES.annual)} per year or{" "}
              {formatPrice(PLAN_PRICES.monthly)} per month &nbsp;·&nbsp; cancel anytime
            </p>
          </div>
        </section>
      </div>

      {/* ── Dark: closing CTA ── */}
      <div className="band-dark" id="get-started" style={{ background: "var(--hero)" }}>
        <div className="max-w-[1200px] mx-auto" style={{ padding: "0 var(--wrap-pad)" }}>
          <section className="text-center" style={{ padding: "clamp(56px,9vw,104px) 0" }}>
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
              <a href={APP_URL} className="mkt-btn mkt-btn-lg mkt-btn-light">
                Start free trial
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
            </div>

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
    </>
  );
}

function PriceCard({
  plan,
  price,
  period,
  sub,
  badge,
  highlight = false,
}: {
  plan: string;
  price: string;
  period: string;
  sub: string;
  badge?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="bg-surface"
      style={{
        position: "relative",
        borderRadius: 18,
        border: highlight ? "1.5px solid var(--accent)" : "0.5px solid var(--border)",
        padding: "26px 24px",
        boxShadow: highlight ? "0 18px 44px -26px rgba(26,24,22,0.28)" : "0 1px 2px rgba(26,24,22,0.04)",
      }}
    >
      {badge && (
        <span
          className="font-mono uppercase"
          style={{
            position: "absolute",
            top: -10,
            left: 24,
            fontSize: 9.5,
            letterSpacing: "0.1em",
            color: "#fff",
            background: "var(--accent)",
            borderRadius: 999,
            padding: "4px 10px",
          }}
        >
          {badge}
        </span>
      )}
      <div
        className="font-serif font-medium text-hero"
        style={{ fontSize: 19, fontVariationSettings: "'opsz' 22", marginBottom: 10 }}
      >
        {plan}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          className="font-serif font-medium text-hero tracking-[-0.02em]"
          style={{ fontSize: 34, fontVariationSettings: "'opsz' 40" }}
        >
          {price}
        </span>
        <span className="text-faint" style={{ fontSize: 13 }}>
          {period}
        </span>
      </div>
      <div className="text-dim" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
        {sub}
      </div>
    </div>
  );
}
