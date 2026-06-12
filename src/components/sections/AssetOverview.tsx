import type { ReactNode } from "react";
import { Eyebrow } from "./Eyebrow";

interface AcCardProps {
  tint: string;
  icon: ReactNode;
  name: string;
  soon?: boolean;
  isNew?: boolean;
  liability?: boolean;
  delay?: number;
}

function AcCard({ tint, icon, name, soon, isNew, liability, delay = 0 }: AcCardProps) {
  const delayClass = delay === 1 ? "reveal-delay-1" : delay === 2 ? "reveal-delay-2" : delay === 3 ? "reveal-delay-3" : "";
  return (
    <div
      className={`reveal ${delayClass} border rounded-[14px] flex flex-col gap-[10px] relative`}
      style={{
        padding: "clamp(14px,2.2vw,18px)",
        minHeight: 100,
        background: liability ? "var(--negative-soft)" : soon ? "transparent" : "var(--surface)",
        border: soon ? "1px dashed var(--border-strong)" : liability ? "1px solid rgba(181,86,75,0.15)" : "1px solid var(--border)",
        opacity: soon ? 0.7 : 1,
        transition: "transform 0.18s ease, box-shadow 0.18s ease",
      }}
    >
      {isNew && (
        <span
          className="absolute text-[10.5px] uppercase tracking-[0.06em] font-medium"
          style={{ top: 14, right: 14, padding: "4px 10px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent-text)" }}
        >
          New
        </span>
      )}
      {soon && (
        <span
          className="absolute text-[9px] uppercase tracking-[0.1em] font-medium"
          style={{ top: 12, right: 12, padding: "3px 7px", borderRadius: 999, background: "var(--bg-deep)", color: "var(--text-dim)" }}
        >
          Coming soon
        </span>
      )}
      <div
        className={`w-[42px] h-[42px] rounded-[11px] flex items-center justify-center ${tint}`}
        style={soon ? { background: "rgba(11,15,24,0.04)", color: "var(--text-faint)" } : undefined}
      >
        {icon}
      </div>
      <div
        className="font-serif font-medium text-hero tracking-[-0.005em]"
        style={{ fontSize: "clamp(17px,3.4vw,19px)", fontVariationSettings: "'opsz' 20", color: soon ? "var(--text-dim)" : liability ? "#8B3A2A" : undefined }}
      >
        {name}
      </div>
    </div>
  );
}

const SVG = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 24, height: 24 }}>
    {children}
  </svg>
);

export function AssetOverview() {
  return (
    <div className="max-w-[1320px] mx-auto" id="coverage" style={{ padding: "0 var(--wrap-pad)" }}>
      <section style={{ padding: "clamp(32px,5vw,56px) 0" }}>

        <div style={{ marginBottom: "clamp(14px,2.5vw,22px)" }}>
          <Eyebrow n="05">Coverage</Eyebrow>
          <h2
            className="font-serif font-medium text-hero leading-[1.02] tracking-[-0.025em] reveal"
            style={{ fontSize: "clamp(30px,6.5vw,46px)", fontVariationSettings: "'opsz' 56" }}
          >
            Every asset class.<br />
            <span className="italic font-normal text-dim">Already covered.</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 min-[540px]:grid-cols-3 min-[820px]:grid-cols-4 min-[1080px]:grid-cols-5 gap-[10px] min-[1080px]:gap-3">

          <AcCard tint="ic-tint-green" name="Real estate" icon={<SVG><path d="M4 14L16 4l12 10"/><path d="M7 12v14h18V12"/><rect x="13" y="18" width="6" height="8" strokeWidth="1.5"/><rect x="10" y="14" width="3" height="3"/><rect x="19" y="14" width="3" height="3"/><path d="M16 4v3"/><rect x="15" y="6" width="2" height="2" fill="currentColor"/></SVG>} />
          <AcCard tint="ic-tint-blue" name="Stocks" delay={1} icon={<SVG><path d="M4 24V8"/><path d="M4 24h24"/><path d="M8 20l5-6 4 4 7-10"/><circle cx="13" cy="14" r="1.4" fill="currentColor"/><circle cx="17" cy="18" r="1.4" fill="currentColor"/><circle cx="24" cy="8" r="1.4" fill="currentColor"/><path d="M21 6h4v4"/></SVG>} />
          <AcCard tint="ic-tint-blue" name="ETFs" delay={2} icon={<SVG><rect x="4" y="20" width="24" height="6" rx="1"/><rect x="7" y="13" width="18" height="5" rx="1"/><rect x="10" y="6" width="12" height="5" rx="1"/><line x1="9" y1="23" x2="13" y2="23"/><line x1="11" y1="15.5" x2="14" y2="15.5"/><line x1="13" y1="8.5" x2="15" y2="8.5"/></SVG>} />
          <AcCard tint="ic-tint-gold" name="Bonds" delay={3} icon={<SVG><rect x="5" y="5" width="22" height="22" rx="1.5"/><line x1="9" y1="11" x2="23" y2="11"/><line x1="9" y1="15" x2="23" y2="15"/><line x1="9" y1="19" x2="19" y2="19"/><circle cx="22" cy="22.5" r="2.5"/><path d="M22 21v3M20.5 22.5h3" strokeWidth="1"/></SVG>} />
          <AcCard tint="ic-tint-gold" name="Pension" icon={<SVG><path d="M16 4l11 5v7c0 6-5 10-11 11-6-1-11-5-11-11V9z"/><path d="M11 16l3.5 3.5L21 13"/></SVG>} />
          <AcCard tint="ic-tint-gold" name="Cash" delay={1} icon={<SVG><path d="M5 11h22a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V13a2 2 0 012-2z"/><path d="M5 11V8a2 2 0 012-2h17l3 5"/><circle cx="23" cy="18" r="2" fill="currentColor"/><path d="M9 16h5"/></SVG>} />
          <AcCard tint="ic-tint-red" name="Crypto" delay={2} icon={<SVG><circle cx="16" cy="16" r="12"/><path d="M11 8h7.5a3.5 3.5 0 010 7H11V8z"/><path d="M11 15h8.5a3.5 3.5 0 010 7H11v-7z"/><line x1="14" y1="5" x2="14" y2="9"/><line x1="18" y1="5" x2="18" y2="9"/><line x1="14" y1="23" x2="14" y2="27"/><line x1="18" y1="23" x2="18" y2="27"/></SVG>} />
          <AcCard tint="ic-tint-gold" name="Gold" delay={3} icon={<SVG><path d="M7 22h18l-2 6H9z"/><path d="M9 16h14l-1.5 6H10.5z"/><path d="M11 10h10l-1 6H12z"/><path d="M12 4h8l-1 6H13z"/></SVG>} />
          <AcCard tint="ic-tint-brown" name="Collectibles" isNew icon={<SVG><circle cx="16" cy="17" r="9"/><path d="M16 12v5l3.5 2.5"/><path d="M13 6h6l-1 4h-4z"/><circle cx="16" cy="17" r="1.2" fill="currentColor"/></SVG>} />
          <AcCard tint="ic-tint-mortgage" name="Mortgages" liability delay={1} icon={<SVG><path d="M5 15L16 5l11 10"/><path d="M8 13v15h16V13"/><circle cx="20" cy="20" r="3"/><path d="M22 22l4 4"/><path d="M25 25l1.5-1.5"/></SVG>} />
          <AcCard tint="ic-tint-brown" name="Anything else" delay={2} icon={<SVG><circle cx="9" cy="9" r="3" fill="currentColor"/><circle cx="23" cy="9" r="2.5"/><circle cx="9" cy="23" r="2.5"/><circle cx="23" cy="23" r="3.5"/></SVG>} />
          <AcCard tint="" name="Employee equity" soon delay={3} icon={<SVG><rect x="5" y="9" width="22" height="16" rx="2"/><path d="M11 9V6h10v3"/><path d="M5 16h22"/><path d="M14 20h4"/></SVG>} />
          <AcCard tint="" name="Future pensions" soon icon={<SVG><circle cx="16" cy="16" r="11"/><path d="M16 9v7l5 3"/><path d="M5 5l3 3M27 5l-3 3"/></SVG>} />
          <AcCard tint="" name="Consumer debt" soon delay={1} icon={<SVG><rect x="4" y="8" width="24" height="16" rx="2"/><path d="M4 14h24"/><line x1="8" y1="20" x2="14" y2="20"/><line x1="22" y1="20" x2="25" y2="20"/></SVG>} />

        </div>
      </section>
    </div>
  );
}
