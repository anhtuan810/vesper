import type { ReactNode } from "react";

interface QnaCardProps {
  question: string;
  answer: ReactNode;
}

function QnaCard({ question, answer }: QnaCardProps) {
  return (
    <div
      className="bg-surface border border-border rounded-2xl flex flex-col gap-[18px]"
      style={{ padding: "clamp(24px,4vw,32px)" }}
    >
      <div
        className="font-serif italic text-hero pb-4 border-b border-border"
        style={{
          fontSize: "clamp(18px,3.5vw,21px)",
          lineHeight: 1.3,
          fontVariationSettings: "'opsz' 22",
        }}
      >
        {question}
      </div>
      <div className="text-[14.5px] text-fg leading-[1.55]">{answer}</div>
    </div>
  );
}

function Who() {
  return (
    <span
      className="inline-block text-[10px] uppercase tracking-[0.1em] font-medium mb-[10px]"
      style={{
        color: "var(--accent-text)",
        background: "var(--accent-soft)",
        padding: "3px 8px",
        borderRadius: 999,
      }}
    >
      Volnar
    </span>
  );
}

export function QnA() {
  return (
    <div className="max-w-[1200px] mx-auto" style={{ padding: "0 var(--wrap-pad)" }}>
      <section
        className="border-t border-border"
        style={{ padding: "clamp(48px,7vw,80px) 0" }}
      >
        <div className="text-center" style={{ marginBottom: "clamp(28px,5vw,44px)" }}>
          <span className="text-[11px] uppercase tracking-[0.18em] text-accent-text font-medium mb-[14px] inline-block">
            Ask
          </span>
          <h2
            className="font-serif font-medium text-hero leading-[1.02] tracking-[-0.025em] max-w-[880px] mx-auto"
            style={{ fontSize: "clamp(36px,7.5vw,56px)", fontVariationSettings: "'opsz' 56" }}
          >
            Ask anything<br />about your wealth.
          </h2>
        </div>

        <div className="grid gap-4 min-[720px]:grid-cols-3 min-[720px]:gap-[18px]">
          <QnaCard
            question='"How is my house goal tracking?"'
            answer={
              <>
                <Who />
                <br />
                You&apos;re at{" "}
                <strong className="text-accent-text font-semibold">€184.000 of €250.000</strong>
                {" "}— 73,6%. At the current monthly contribution rate, you&apos;d reach it in November 2027.
                <em className="font-serif italic text-dim block mt-[6px]">
                  Redirecting the bonus moves it to August.
                </em>
              </>
            }
          />
          <QnaCard
            question={`"What's my biggest concentration risk?"`}
            answer={
              <>
                <Who />
                <br />
                <strong className="text-accent-text font-semibold">ASML at 41% of the public-markets sleeve.</strong>{" "}
                Six percentage points above the 35% comfort you mentioned in October.
                <em className="font-serif italic text-dim block mt-[6px]">
                  Worth a look before the next add.
                </em>
              </>
            }
          />
          <QnaCard
            question='"Compare my YTD return to MSCI World."'
            answer={
              <>
                <Who />
                <br />
                Public-markets sleeve{" "}
                <strong className="text-accent-text font-semibold">+11,2% YTD</strong> vs{" "}
                <strong className="text-accent-text font-semibold">MSCI World +9,4%</strong>. The 1,8-point lead is almost entirely ASML — strip it out and you trail by 0,6.
              </>
            }
          />
        </div>
      </section>
    </div>
  );
}
