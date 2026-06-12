const TICKS: { label: string; value: string; tone?: "pos" | "neg" }[] = [
  { label: "ECB", value: "+25 bps · your mortgage", tone: "neg" },
  { label: "ASML · earnings", value: "+€8.300 on 312 sh", tone: "pos" },
  { label: "BTC", value: "above $60k · +€4.100", tone: "pos" },
  { label: "EUR/USD", value: "1,09" },
  { label: "Housing · NL", value: "+0,3% q/q", tone: "pos" },
  { label: "AEX", value: "+0,8%", tone: "pos" },
  { label: "US CPI", value: "2,4% y/y" },
  { label: "NVIDIA", value: "reports tonight · ASML supply chain" },
  { label: "Dutch State 2,5%", value: "−€180 repriced", tone: "neg" },
  { label: "Semis index", value: "+18% YTD", tone: "pos" },
];

function Half() {
  return (
    <div className="mkt-ticker-half">
      {TICKS.map((t) => (
        <span key={t.label} className="mkt-tick">
          <span className="mkt-tick-label">{t.label}</span>
          <span className={`mkt-tick-val${t.tone ? ` ${t.tone}` : ""}`}>{t.value}</span>
        </span>
      ))}
    </div>
  );
}

// Slim infinite marquee of the kind of events Volnar watches — the world
// moving, quietly, in one line. Two identical halves; the track translates
// −50% for a seamless loop. Pauses on hover; static under reduced motion.
export function Ticker() {
  return (
    <div className="mkt-ticker" aria-hidden="true">
      <div className="mkt-ticker-track">
        <Half />
        <Half />
      </div>
    </div>
  );
}
