import type { ReactNode } from "react";

function Who() {
  return (
    <span
      className="inline-block text-[10px] uppercase tracking-[0.1em] font-medium mb-[10px]"
      style={{ color: "var(--accent-text)", background: "var(--accent-soft)", padding: "3px 8px", borderRadius: 999 }}
    >
      Volnar
    </span>
  );
}

interface QnaCardProps {
  question: string;
  answer: ReactNode;
  delay?: number;
  chart?: ReactNode;
}

function QnaCard({ question, answer, delay = 0, chart }: QnaCardProps) {
  const delayClass = delay === 1 ? "reveal-delay-1" : delay === 2 ? "reveal-delay-2" : "";
  return (
    <div
      className={`reveal ${delayClass} bg-surface border border-border rounded-2xl flex flex-col gap-[14px]`}
      style={{ padding: "clamp(18px,3vw,24px)" }}
    >
      <div
        className="font-serif italic text-hero pb-4 border-b border-border"
        style={{ fontSize: "clamp(18px,3.5vw,21px)", lineHeight: 1.3, fontVariationSettings: "'opsz' 22" }}
      >
        {question}
      </div>
      <div className="text-[14.5px] text-fg leading-[1.55]">{answer}</div>
      {chart}
    </div>
  );
}

export function QnA() {
  return (
    <div style={{ background: "var(--bg-deep)" }}>
      <div className="max-w-[1200px] mx-auto" style={{ padding: "0 var(--wrap-pad)" }}>
        <section style={{ padding: "clamp(24px,3.5vw,44px) 0" }}>

          <div className="text-center" style={{ marginBottom: "clamp(14px,2.5vw,22px)" }}>
            <h2
              className="font-serif font-medium text-hero leading-[1.02] tracking-[-0.025em] mx-auto"
              style={{ fontSize: "clamp(30px,6.5vw,46px)", fontVariationSettings: "'opsz' 56", maxWidth: 880 }}
            >
              Ask anything<br />about your wealth.
            </h2>
          </div>

          <div className="grid gap-4 min-[720px]:grid-cols-3 min-[720px]:gap-[14px]">
            <QnaCard
              question='"How is my house goal tracking?"'
              answer={
                <>
                  <Who /><br />
                  You&apos;re at{" "}
                  <strong className="text-accent-text font-semibold">€184.000 of €250.000</strong>
                  {" "}— 73,6%. At the current monthly contribution rate, you&apos;d reach it in November 2027.
                  <em className="font-serif italic text-dim block mt-[6px]">Redirecting the bonus moves it to August.</em>
                </>
              }
            />
            <QnaCard
              delay={1}
              question={`"What's my biggest concentration risk?"`}
              answer={
                <>
                  <Who /><br />
                  <strong className="text-accent-text font-semibold">ASML at 41% of the public-markets sleeve.</strong>{" "}
                  Six percentage points above the 35% comfort you mentioned in October.
                  <em className="font-serif italic text-dim block mt-[6px]">Worth a look before the next add.</em>
                </>
              }
            />
            <QnaCard
              delay={2}
              question='"How am I doing vs MSCI World?"'
              answer={
                <>
                  <Who /><br />
                  The 1,8-point lead is almost entirely ASML.{" "}
                  <em className="font-serif italic text-dim">Strip it out and you trail by 0,6.</em>
                </>
              }
              chart={
                <div style={{ marginTop: 4 }}>
                  <svg viewBox="0 0 280 110" preserveAspectRatio="none" aria-hidden style={{ width: "100%", height: "auto", display: "block" }}>
                    <path fill="none" stroke="var(--text-faint)" strokeWidth="2" strokeDasharray="3 3"
                      d="M8,72 L40,68 L72,74 L104,62 L136,58 L168,54 L200,50 L232,46 L264,42"/>
                    <path fill="none" stroke="var(--accent)" strokeWidth="2.4"
                      d="M8,72 L40,66 L72,70 L104,58 L136,50 L168,42 L200,38 L232,32 L264,28"/>
                    <circle cx="264" cy="28" r="3" fill="var(--accent)"/>
                    <circle cx="264" cy="42" r="2.5" fill="var(--text-faint)"/>
                  </svg>
                  <div className="flex gap-4 flex-wrap text-[12px] text-dim" style={{ marginTop: 8 }}>
                    <span className="inline-flex items-center gap-[6px]">
                      <span style={{ width: 12, height: 2, borderRadius: 1, background: "var(--accent)", display: "inline-block" }}/>
                      You <strong className="text-fg font-medium">+11,2%</strong>
                    </span>
                    <span className="inline-flex items-center gap-[6px]">
                      <span style={{ width: 12, height: 2, borderRadius: 1, background: "var(--text-faint)", display: "inline-block" }}/>
                      MSCI World <strong className="text-fg font-medium">+9,4%</strong>
                    </span>
                  </div>
                </div>
              }
            />
          </div>

        </section>
      </div>
    </div>
  );
}
