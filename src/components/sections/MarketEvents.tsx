import type { ReactNode } from "react";

interface ImpactRow {
  dir: "pos" | "neg";
  arrow: "↑" | "↓";
  label: string;
  text: ReactNode;
}

interface SignalCardProps {
  badgeBg?: string;
  badgeText: string;
  source: string;
  time: string;
  headline: string;
  impacts: ImpactRow[];
}

function SignalCard({ badgeBg, badgeText, source, time, headline, impacts }: SignalCardProps) {
  return (
    <div
      className="bg-surface border border-border rounded-2xl"
      style={{ padding: "clamp(24px,4vw,32px)" }}
    >
      {/* Source row */}
      <div
        className="flex items-center gap-2 uppercase tracking-[0.06em] mb-3"
        style={{ fontSize: 11, color: "var(--text-faint)" }}
      >
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center font-serif font-medium flex-shrink-0"
          style={{ background: badgeBg ?? "var(--cat-markets)", color: "#FFFFFF", fontSize: 11 }}
        >
          {badgeText}
        </span>
        <span>{source}</span>
        <span
          className="ml-auto font-serif italic normal-case tracking-normal"
          style={{ fontSize: 11 }}
        >
          {time}
        </span>
      </div>

      {/* Headline */}
      <div
        className="font-serif font-medium text-hero leading-[1.25] tracking-[-0.01em] mb-[22px]"
        style={{ fontSize: "clamp(20px,4vw,26px)", fontVariationSettings: "'opsz' 28" }}
      >
        {headline}
      </div>

      {/* Impacts */}
      <div className="flex flex-col gap-3">
        {impacts.map((imp, i) => (
          <div key={i} className="flex items-start gap-3">
            <span
              className="w-6 h-6 rounded-[6px] flex items-center justify-center text-[13px] font-bold flex-shrink-0 mt-[1px]"
              style={{
                background: imp.dir === "pos" ? "var(--positive-soft)" : "var(--negative-soft)",
                color: imp.dir === "pos" ? "var(--positive-text)" : "var(--negative-text)",
              }}
            >
              {imp.arrow}
            </span>
            <span className="flex-1 text-[14px] text-fg leading-[1.5]">
              <span
                className="block uppercase tracking-[0.08em] font-medium mb-[2px]"
                style={{ fontSize: "10.5px", color: "var(--text-faint)" }}
              >
                {imp.label}
              </span>
              {imp.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarketEvents() {
  return (
    <div className="max-w-[1200px] mx-auto" style={{ padding: "0 var(--wrap-pad)" }}>
      <section
        className="border-t border-border"
        style={{ padding: "clamp(48px,7vw,80px) 0" }}
      >
        <div style={{ marginBottom: "clamp(28px,5vw,44px)" }}>
          <span
            className="text-[11px] uppercase tracking-[0.18em] font-medium mb-[14px] inline-block"
            style={{ color: "var(--text-faint)" }}
          >
            Signal, not noise
          </span>
          <h2
            className="font-serif font-medium text-hero leading-[1.02] tracking-[-0.025em] max-w-[880px]"
            style={{ fontSize: "clamp(36px,7.5vw,56px)", fontVariationSettings: "'opsz' 56" }}
          >
            Markets move constantly.<br />
            <span className="italic font-normal text-dim">You hear only what affects you.</span>
          </h2>
        </div>

        <div className="grid gap-4 max-w-[1080px] mx-auto min-[820px]:grid-cols-2 min-[820px]:gap-5 min-[820px]:items-stretch">
          <SignalCard
            badgeText="€"
            source="ECB · Press release"
            time="15 May · 14:15"
            headline="Key rates raised by 25 basis points."
            impacts={[
              {
                dir: "neg",
                arrow: "↑",
                label: "Your mortgage",
                text: (
                  <>
                    resets{" "}
                    <strong className="font-serif font-medium" style={{ fontVariationSettings: "'opsz' 15" }}>March 2027</strong>
                    . Likely{" "}
                    <strong className="font-serif font-medium" style={{ fontVariationSettings: "'opsz' 15" }}>+€34</strong>/month.
                  </>
                ),
              },
              {
                dir: "neg",
                arrow: "↓",
                label: "Dutch State 2,5% 2034",
                text: "small mark-to-market hit.",
              },
              {
                dir: "pos",
                arrow: "↑",
                label: "Cash buffer",
                text: (
                  <>
                    <strong className="font-serif font-medium" style={{ fontVariationSettings: "'opsz' 15" }}>€4.740</strong> earns more.
                  </>
                ),
              },
            ]}
          />

          <SignalCard
            badgeBg="var(--cat-markets)"
            badgeText="A"
            source="ASML · Q1 earnings"
            time="Yesterday · 07:00"
            headline="Quarterly beat; bookings up 12% on AI capex."
            impacts={[
              {
                dir: "pos",
                arrow: "↑",
                label: "Your 312 shares",
                text: (
                  <>
                    <strong className="font-serif font-medium" style={{ fontVariationSettings: "'opsz' 15" }}>+€8.300</strong> on the open.
                  </>
                ),
              },
              {
                dir: "neg",
                arrow: "↑",
                label: "Concentration",
                text: (
                  <>
                    Semis sleeve now{" "}
                    <strong className="font-serif font-medium" style={{ fontVariationSettings: "'opsz' 15" }}>43%</strong>. Above your 35% comfort.
                  </>
                ),
              },
              {
                dir: "pos",
                arrow: "↑",
                label: "Sector tailwind",
                text: "EU chip subsidy expanded last week.",
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
