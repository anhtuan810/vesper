const TICKS: { label: string; value: string; tone?: "pos" | "neg" }[] = [
  { label: "ECB", value: "+25 bps · your mortgage", tone: "neg" },
  { label: "NVIDIA · earnings", value: "+€8.300 on 180 sh", tone: "pos" },
  { label: "Bitcoin", value: "above $60k · +€4.100", tone: "pos" },
  { label: "EUR/USD", value: "1,09" },
  { label: "Apple", value: "+1,4% · +€2.100", tone: "pos" },
  { label: "S&P 500", value: "+0,8%", tone: "pos" },
  { label: "US CPI", value: "2,4% y/y" },
  { label: "NVIDIA", value: "reports tonight · your largest holding" },
  { label: "Tesla", value: "−2,1% on deliveries", tone: "neg" },
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
