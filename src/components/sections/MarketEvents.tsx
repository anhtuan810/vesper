import type { ReactNode } from "react";
import { Eyebrow } from "./Eyebrow";

interface ImpactRow {
  dir: "pos" | "neg";
  label: string;
  text: ReactNode;
}

interface SignalCardProps {
  badgeText: string;
  source: string;
  time: string;
  headline: string;
  impacts: ImpactRow[];
}

function ArrowIcon({ dir }: { dir: "pos" | "neg" }) {
  return dir === "pos" ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17l5-5 5 5"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 7l5 5 5-5"/>
    </svg>
  );
}

function SignalCard({ badgeText, source, time, headline, impacts }: SignalCardProps) {
  return (
    <div
      className="reveal rounded-2xl"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        padding: "clamp(18px,3vw,24px)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 12px rgba(0,0,0,0.25)",
      }}
    >
      {/* Source row */}
      <div className="flex items-center gap-2 uppercase tracking-[0.06em] mb-[10px]" style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center font-serif font-medium flex-shrink-0"
          style={{ background: "var(--cat-markets)", color: "#FFFFFF", fontSize: 11 }}
        >
          {badgeText}
        </span>
        <span>{source}</span>
        <span className="ml-auto font-serif italic normal-case tracking-normal" style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{time}</span>
      </div>

      {/* Headline */}
      <div
        className="font-serif font-medium leading-[1.25] tracking-[-0.01em] mb-[22px]"
        style={{ fontSize: "clamp(20px,4vw,26px)", fontVariationSettings: "'opsz' 28", color: "#FFFFFF" }}
      >
        {headline}
      </div>

      {/* Impacts */}
      <div className="sig-impacts">
        {impacts.map((imp, i) => (
          <div key={i} className="sig-impact">
            <span className={`sig-i-arrow ${imp.dir}`}>
              <ArrowIcon dir={imp.dir} />
            </span>
            <div className="sig-i-body">
              <span className="sig-i-label">{imp.label}</span>
              <span className="sig-i-text">{imp.text}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarketEvents() {
  return (
    <div className="band-dark" id="signals" style={{ background: "var(--hero)", color: "rgba(255,255,255,0.85)" }}>
      <div className="max-w-[1200px] mx-auto" style={{ padding: "0 var(--wrap-pad)" }}>
        <section style={{ padding: "clamp(32px,5vw,56px) 0" }}>

          <div style={{ marginBottom: "clamp(14px,2.5vw,22px)" }}>
            <Eyebrow n="02" light>Market signals</Eyebrow>
            <h2
              className="font-serif font-medium leading-[1.02] tracking-[-0.025em] max-w-[880px] reveal"
              style={{ fontSize: "clamp(30px,6.5vw,46px)", fontVariationSettings: "'opsz' 56", color: "#FFFFFF" }}
            >
              Markets move constantly.<br />
              <span className="italic font-normal" style={{ color: "rgba(255,255,255,0.5)" }}>You hear only what affects you.</span>
            </h2>
          </div>

          <div className="grid gap-3 max-w-[1080px] mx-auto min-[820px]:grid-cols-2 min-[820px]:gap-[14px] min-[820px]:items-stretch">
            <SignalCard
              badgeText="€"
              source="ECB · Press release"
              time="15 May · 14:15"
              headline="Key rates raised by 25 basis points."
              impacts={[
                {
                  dir: "neg",
                  label: "Your mortgage",
                  text: <>Resets in <strong>March 2027</strong>. Payment goes up by roughly <strong>€34/month</strong>.</>,
                },
                {
                  dir: "neg",
                  label: "Dutch State 2,5% 2034",
                  text: <>Loses about <strong>−€180</strong> on paper from this morning&apos;s repricing.</>,
                },
                {
                  dir: "pos",
                  label: "Cash buffer",
                  text: <>Your <strong>€4.740</strong> now earns an extra <strong>0,25%</strong> annually.</>,
                },
              ]}
            />
            <SignalCard
              badgeText="N"
              source="NVIDIA · Q1 earnings"
              time="Yesterday · 22:00"
              headline="Quarterly beat; data-center revenue up 12%."
              impacts={[
                {
                  dir: "pos",
                  label: "Your 180 NVIDIA shares",
                  text: <>Worth <strong>+€8.300</strong> more at market open.</>,
                },
                {
                  dir: "neg",
                  label: "Concentration",
                  text: <>AI chips are now <strong>43%</strong> of public markets — above the <strong>35%</strong> comfort you set in October.</>,
                },
                {
                  dir: "pos",
                  label: "Sector tailwind",
                  text: "Hyperscalers raised AI capex guidance this week — a tailwind for the sector.",
                },
              ]}
            />
          </div>

        </section>
      </div>
    </div>
  );
}
