const notList = [
  "Community feed",
  "Leaderboards",
  "Public portfolios",
  "Broker referrals",
  "Ads",
  "AUM fees",
  "Trade nudges",
];

export function WhatItIsnt() {
  return (
    <div className="max-w-[1200px] mx-auto" style={{ padding: "0 var(--wrap-pad)" }}>
      <section style={{ padding: "clamp(48px,7vw,80px) 0" }}>
        <div
          className="rounded-2xl text-center"
          style={{
            background: "var(--hero)",
            color: "#FFFFFF",
            padding: "clamp(48px,8vw,96px) clamp(28px,5vw,64px)",
          }}
        >
          <span
            className="text-[11px] uppercase tracking-[0.18em] font-medium mb-[14px] inline-block"
            style={{ color: "var(--accent-soft)", opacity: 0.75 }}
          >
            As deliberate as what it is
          </span>

          <h2
            className="font-serif font-normal leading-[1.15] tracking-[-0.02em] max-w-[820px] mx-auto mb-[30px]"
            style={{ fontSize: "clamp(30px,6vw,48px)", color: "#FFFFFF" }}
          >
            Not{" "}
            <span
              className="italic font-light"
              style={{
                textDecoration: "line-through",
                textDecorationColor: "rgba(255,255,255,0.3)",
                textDecorationThickness: 2,
                color: "rgba(255,255,255,0.5)",
              }}
            >
              a feed.
            </span>{" "}
            Not{" "}
            <span
              className="italic font-light"
              style={{
                textDecoration: "line-through",
                textDecorationColor: "rgba(255,255,255,0.3)",
                textDecorationThickness: 2,
                color: "rgba(255,255,255,0.5)",
              }}
            >
              a competition.
            </span>{" "}
            Not{" "}
            <span
              className="italic font-light"
              style={{
                textDecoration: "line-through",
                textDecorationColor: "rgba(255,255,255,0.3)",
                textDecorationThickness: 2,
                color: "rgba(255,255,255,0.5)",
              }}
            >
              a sales channel.
            </span>
            <br />
            <span className="italic font-normal" style={{ color: "var(--accent-soft)" }}>
              Just your portfolio, and a thoughtful assistant.
            </span>
          </h2>

          <div className="flex flex-wrap justify-center gap-[8px_10px]">
            {notList.map((item) => (
              <span
                key={item}
                className="text-[13px] rounded-full"
                style={{
                  padding: "8px 14px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                <span style={{ color: "var(--negative)", marginRight: 6, fontWeight: 600 }}>×</span>
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
