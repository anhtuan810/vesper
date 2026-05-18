import type { ReactNode } from "react";

type CardVariant = "default" | "soon" | "liability";

interface AssetCard {
  icon: ReactNode;
  name: string;
  meta: string;
  variant?: CardVariant;
  pill?: "new" | "soon";
  iconBg?: string;
}

function AcCard({ icon, name, meta, variant = "default", pill, iconBg }: AssetCard) {
  const cardStyle: React.CSSProperties = {};
  if (variant === "soon") {
    cardStyle.background = "transparent";
    cardStyle.border = "1px dashed var(--border-strong)";
  } else if (variant === "liability") {
    cardStyle.background = "var(--negative-soft)";
    cardStyle.borderColor = "rgba(181,86,75,0.15)";
  }

  const iconStyle: React.CSSProperties = {};
  if (variant === "soon") {
    iconStyle.background = "transparent";
    iconStyle.color = "var(--text-faint)";
    iconStyle.border = "1px dashed var(--border-strong)";
  } else if (variant === "liability") {
    iconStyle.background = "var(--negative)";
  } else {
    iconStyle.background = iconBg;
  }

  return (
    <div
      className="bg-surface border border-border rounded-lg flex flex-col gap-3 relative transition-transform duration-[180ms] ease-out hover:-translate-y-[2px] hover:shadow-[0_12px_24px_-16px_rgba(26,31,46,0.2)]"
      style={{ padding: "18px 16px 16px", minHeight: 130, ...cardStyle }}
    >
      {pill && (
        <span
          className="absolute top-3 right-3 text-[9px] uppercase tracking-[0.1em] rounded-full font-medium"
          style={{
            padding: "3px 7px",
            background: pill === "new" ? "var(--accent)" : "var(--bg-deep)",
            color: pill === "new" ? "#FFFFFF" : "var(--text-dim)",
          }}
        >
          {pill === "new" ? "New" : "Coming soon"}
        </span>
      )}
      <div
        className="w-10 h-10 rounded-[10px] flex items-center justify-center"
        style={{ color: variant === "soon" ? undefined : "#FFFFFF", ...iconStyle }}
      >
        {icon}
      </div>
      <div>
        <div
          className="text-[14px] font-medium leading-[1.2]"
          style={{
            color: variant === "soon" ? "var(--text-dim)" : variant === "liability" ? "var(--negative-text)" : "var(--text)",
          }}
        >
          {name}
        </div>
        <div className="text-[11px] text-faint mt-[3px]">{meta}</div>
      </div>
    </div>
  );
}

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const cards: AssetCard[] = [
  {
    iconBg: "var(--cat-property)",
    name: "Real estate",
    meta: "Mortgage worked in",
    icon: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} {...STROKE}><path d="M3 11l9-8 9 8" /><path d="M5 9v12h14V9" /><path d="M9 21v-7h6v7" /></svg>,
  },
  {
    iconBg: "var(--cat-markets)",
    name: "Stocks",
    meta: "Live priced",
    icon: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} {...STROKE}><path d="M3 17l6-6 4 4 8-9" /><path d="M14 6h7v7" /></svg>,
  },
  {
    iconBg: "var(--cat-markets)",
    name: "ETFs",
    meta: "Live priced",
    icon: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} {...STROKE}><rect x="3" y="14" width="18" height="6" rx="1" /><rect x="5" y="9" width="14" height="3" rx="1" /><rect x="7" y="4" width="10" height="3" rx="1" /></svg>,
  },
  {
    iconBg: "var(--cat-reserves)",
    name: "Bonds",
    meta: "Coupon, maturity",
    icon: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} {...STROKE}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h10M7 17h6" /></svg>,
  },
  {
    iconBg: "var(--cat-reserves)",
    name: "Pension",
    meta: "DC plans",
    icon: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} {...STROKE}><path d="M12 3l9 4v6c0 5-4 8-9 8s-9-3-9-8V7z" /><path d="M9 12l2 2 4-4" /></svg>,
  },
  {
    iconBg: "var(--cat-reserves)",
    name: "Cash",
    meta: "Purpose-based pots",
    icon: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} {...STROKE}><path d="M21 8H3a2 2 0 00-2 2v8a2 2 0 002 2h18a2 2 0 002-2v-8a2 2 0 00-2-2z" /><path d="M3 8V6a2 2 0 012-2h14a2 2 0 012 2v2" /><circle cx="17" cy="14" r="1.2" fill="currentColor" /></svg>,
  },
  {
    iconBg: "var(--cat-crypto)",
    name: "Crypto",
    meta: "Live priced",
    icon: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} {...STROKE}><circle cx="12" cy="12" r="9" /><path d="M9 7.5h5.5a2.5 2.5 0 010 5H9v-5zm0 5h6a2.5 2.5 0 010 5H9v-5z" /></svg>,
  },
  {
    iconBg: "var(--cat-reserves)",
    name: "Gold",
    meta: "Physical or paper",
    icon: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} {...STROKE}><path d="M4 9h16l-2 10H6L4 9z" /><path d="M6 9l1.5-4h9L18 9" /></svg>,
  },
  {
    iconBg: "var(--cat-tangible)",
    name: "Collectibles",
    meta: "Watches, art, wine",
    pill: "new",
    icon: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} {...STROKE}><circle cx="12" cy="13" r="6" /><path d="M12 9v4l2 2" /><path d="M9 4h6l-1 3h-4z" /></svg>,
  },
  {
    variant: "liability",
    name: "Mortgages",
    meta: "Annuity, linear, IO",
    icon: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} {...STROKE}><path d="M3 11l9-8 9 8" /><path d="M5 9v12h14V9" /><path d="M9 16h6M12 16v-3" /></svg>,
  },
  {
    iconBg: "var(--cat-tangible)",
    name: "Anything else",
    meta: "Free-form, with photo",
    icon: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} {...STROKE}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /></svg>,
  },
  {
    variant: "soon",
    name: "Employee equity",
    meta: "RSUs, options",
    pill: "soon",
    icon: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} {...STROKE}><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9" /><path d="M16 3h4v4" /><path d="M14 7l3 3" /></svg>,
  },
  {
    variant: "soon",
    name: "Future pensions",
    meta: "DB and state",
    pill: "soon",
    icon: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} {...STROKE}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  },
  {
    variant: "soon",
    name: "Private equity",
    meta: "Side businesses",
    pill: "soon",
    icon: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} {...STROKE}><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 8h.01M14 8h.01M9 13h.01M14 13h.01M9 18h6" /></svg>,
  },
  {
    variant: "soon",
    name: "Consumer debt",
    meta: "Cards, loans",
    pill: "soon",
    icon: <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} {...STROKE}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 11h18" /><path d="M7 16h4" /></svg>,
  },
];

export function AssetOverview() {
  return (
    <div className="max-w-[1320px] mx-auto" style={{ padding: "0 var(--wrap-pad)" }}>
      <section
        className="border-t border-border"
        style={{ padding: "clamp(48px,7vw,80px) 0" }}
      >
        <div style={{ marginBottom: "clamp(28px,5vw,44px)" }}>
          <span className="text-[11px] uppercase tracking-[0.18em] text-accent-text font-medium mb-[14px] inline-block">
            Coverage
          </span>
          <h2
            className="font-serif font-medium text-hero leading-[1.02] tracking-[-0.025em] max-w-[880px]"
            style={{ fontSize: "clamp(36px,7.5vw,56px)", fontVariationSettings: "'opsz' 56" }}
          >
            Every asset class.<br />
            <span className="italic font-normal text-dim">Already covered.</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-[10px] min-[540px]:grid-cols-3 min-[540px]:gap-3 min-[820px]:grid-cols-4 min-[1080px]:grid-cols-5 min-[1080px]:gap-[14px]">
          {cards.map((card) => (
            <AcCard key={card.name} {...card} />
          ))}
        </div>
      </section>
    </div>
  );
}
