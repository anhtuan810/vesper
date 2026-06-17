import { Eyebrow } from "./Eyebrow";
import { AppStoreBadges } from "./AppStoreBadges";
import {
  ANNUAL_MONTHS_FREE,
  PLAN_PRICES,
  TRIAL_DAYS,
  formatPrice,
} from "@/lib/subscription";

const APP_URL = "https://app.volnar.nl/login";

export function Pricing() {
  const annualPerMonth = formatPrice(PLAN_PRICES.annual / 12);

  return (
    <div className="band-dark" id="pricing" style={{ background: "var(--hero)" }}>
      <div className="max-w-[1200px] mx-auto" style={{ padding: "0 var(--wrap-pad)" }}>
        <section className="text-center" style={{ padding: "clamp(64px,10vw,120px) 0" }}>

          <Eyebrow n="07" center light>
            Pricing
          </Eyebrow>

          <h2
            className="font-serif font-medium leading-[1.02] tracking-[-0.03em] mx-auto reveal"
            style={{
              fontSize: "clamp(38px,8vw,72px)",
              fontVariationSettings: "'opsz' 72",
              color: "#fff",
              maxWidth: 820,
              marginBottom: "clamp(10px,2vw,16px)",
            }}
          >
            Quiet confidence<br />
            <span className="italic font-normal" style={{ color: "rgba(255,255,255,0.45)" }}>
              over your portfolio.
            </span>
          </h2>

          <p
            className="font-serif italic reveal reveal-delay-1"
            style={{
              fontSize: "clamp(16px,3vw,20px)",
              color: "rgba(255,255,255,0.45)",
              marginBottom: "clamp(6px,1vw,10px)",
            }}
          >
            Start free. Stay if it earns its place.
          </p>

          <p
            className="mx-auto reveal reveal-delay-1"
            style={{
              fontSize: "clamp(14px,3vw,16px)",
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.5)",
              maxWidth: 460,
              margin: "0 auto clamp(36px,6vw,52px)",
            }}
          >
            Five minutes to add your first asset — by chat, photo, or PDF.
            A {TRIAL_DAYS}-day free trial with card on file. Cancel anytime.
          </p>

          {/* Plan cards */}
          <div
            className="reveal reveal-delay-2"
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
              maxWidth: 560,
              margin: "0 auto clamp(32px,5vw,44px)",
              textAlign: "left",
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

          {/* CTA */}
          <div className="flex items-center justify-center reveal reveal-delay-3">
            <a href={APP_URL} className="mkt-btn mkt-btn-lg mkt-btn-light">
              Start free trial
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </div>

          <p
            className="font-mono uppercase reveal reveal-delay-3"
            style={{ fontSize: 10, letterSpacing: "0.16em", color: "rgba(255,255,255,0.3)", marginTop: 12, lineHeight: 1.6 }}
          >
            {TRIAL_DAYS} days free &nbsp;·&nbsp; then {formatPrice(PLAN_PRICES.annual)} per year or{" "}
            {formatPrice(PLAN_PRICES.monthly)} per month &nbsp;·&nbsp; cancel anytime
          </p>

          {/* App store badges */}
          <div className="reveal reveal-delay-3 flex justify-center" style={{ marginTop: "clamp(32px,5vw,48px)" }}>
            <AppStoreBadges light />
          </div>

          <p
            className="font-mono uppercase reveal reveal-delay-3"
            style={{ fontSize: 10, letterSpacing: "0.18em", color: "rgba(255,255,255,0.3)", marginTop: "clamp(16px,2.5vw,22px)" }}
          >
            iPhone &amp; web today &nbsp;·&nbsp; Android soon &nbsp;·&nbsp; EU-hosted
          </p>

        </section>
      </div>
    </div>
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
      style={{
        position: "relative",
        borderRadius: 16,
        border: highlight ? "1.5px solid var(--accent)" : "1px solid rgba(255,255,255,0.1)",
        background: highlight ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
        padding: "24px 22px",
      }}
    >
      {badge && (
        <span
          className="font-mono uppercase"
          style={{
            position: "absolute",
            top: -10,
            left: 18,
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
        className="font-serif font-medium"
        style={{ fontSize: 18, fontVariationSettings: "'opsz' 22", marginBottom: 8, color: "#fff" }}
      >
        {plan}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          className="font-serif font-medium tracking-[-0.02em]"
          style={{ fontSize: 32, fontVariationSettings: "'opsz' 40", color: "#fff" }}
        >
          {price}
        </span>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
          {period}
        </span>
      </div>
      <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5, color: "rgba(255,255,255,0.4)" }}>
        {sub}
      </div>
    </div>
  );
}
