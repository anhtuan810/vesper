// Static showcase data for the hero net-worth chart — copied verbatim from the
// mockup (docs/design/volnar-twilight.html, SNAPS/RD/ASK). Nothing here is live
// portfolio data; the marketing page never calls the API.

export type Entry = {
  date: string;
  title: string;
  tag: "user" | "auto";
  kind: "milestone" | "market" | "dec";
  nw: string;
  imp: string;
  impc: "up" | "dn";
  ctx: string;
  why: string;
  ask: string;
  // present on "user" decisions (the chat → journal pipeline)
  say?: string;
  read?: string;
  readsrc?: string;
  wrote?: string;
  sym?: string;
  // present on "auto" entries (the market → journal pipeline)
  trig?: string;
  trigsrc?: string | null;
  detect?: string;
  logged?: string;
  mkthead?: string;
};

export const ENTRIES: Entry[] = [
  {
    date: "Jul 2021", title: "Opened the journal", tag: "auto", kind: "milestone",
    nw: "€754.460", imp: "€754.000 · starting point", impc: "up",
    ctx: "The starting line — €754.000 across a flat, a portfolio and a little crypto.",
    why: "Day one. From here on, every move gets a reason attached, so future-me sees the why, not just the what.",
    ask: "Ask: what would €754.000 be today in just an index fund?",
    trig: "You opened the journal", trigsrc: null, detect: "The baseline everything is measured from",
    logged: "Baseline set · €754.000", mkthead: "From day one to journal",
  },
  {
    date: "Feb 2022", title: "War broke out in Ukraine", tag: "auto", kind: "market",
    nw: "€862.553", imp: "−€38.000 that week · recovered over the year", impc: "dn",
    ctx: "Equities fell hard and energy spiked the week the invasion began.",
    why: "Property is the biggest exposure, so the hit was cushioned. Flagged automatically — no action, you sat still.",
    ask: "Ask: what if I'd sold everything that week?",
    trig: "War broke out in Ukraine", trigsrc: "Markets", detect: "Equities fell sharply; energy spiked",
    logged: "−€38.000 that week · you held",
  },
  {
    date: "Mar 2022", title: "Raised cash before the drop", tag: "user", kind: "dec",
    nw: "€869.106", imp: "avoided ≈ €40.000 of the 2022 drop", impc: "up",
    ctx: "The Fed signalled its first hikes; equities had grown to 64% of net worth.",
    why: "De-risking before the cycle turns. Moving to cash now so a forced sale later never has to happen.",
    ask: "Ask: what if I'd stayed fully invested instead?",
    say: "Moving to cash before the Fed starts hiking.", read: "Fed signalled rate hikes · equities 64% of net worth",
    readsrc: "Markets", wrote: "Raised cash · de-risked the cycle", sym: "€",
  },
  {
    date: "Oct 2022", title: "Bought the bottom", tag: "user", kind: "dec",
    nw: "€763.017", imp: "≈ €120.000 up since", impc: "up",
    ctx: "Fear peaked and markets bottomed that October.",
    why: "Buying when it hurt. I can't call the exact low, but this is close enough — the reason is conviction, not timing.",
    ask: "Ask: what if I'd waited six more months to buy?",
    say: "Buying back in — this feels like the bottom.", read: "Markets bottomed as fear peaked",
    readsrc: "Markets", wrote: "Bought the dip · close to the low", sym: "VW",
  },
  {
    date: "Mar 2023", title: "A US bank failed (SVB)", tag: "auto", kind: "market",
    nw: "€819.486", imp: "−€12.000 that week · fully recovered", impc: "dn",
    ctx: "A US bank (SVB) failed; equities wobbled, then steadied within days.",
    why: "Your banks aren't exposed and cash is spread thin. Logged, watched, left alone — recovered inside a week.",
    ask: "Ask: what if I'd pulled out when the bank failed?",
    trig: "A US bank failed (SVB)", trigsrc: "Markets", detect: "Equities wobbled, then steadied in days",
    logged: "−€12.000 · recovered, no action",
  },
  {
    date: "Jun 2023", title: "Locked the mortgage", tag: "user", kind: "dec",
    nw: "€878.163", imp: "≈ €8.400 saved in interest so far", impc: "up",
    ctx: "The ECB raised +25bps with mortgage rates still climbing.",
    why: "Locking the rate. Certainty over chasing a few basis points — I'd rather sleep than optimise.",
    ask: "Ask: what if I'd stayed on a variable rate?",
    say: "Locking the mortgage rate before the ECB moves.", read: "ECB raised +25bps",
    readsrc: "ECB", wrote: "Fixed the mortgage · certainty over basis points", sym: "MG",
  },
  {
    date: "Apr 2024", title: "NVIDIA fell ~12% in a day", tag: "auto", kind: "market",
    nw: "€1.076.408", imp: "−€34.000 on paper · recovered within six weeks", impc: "dn",
    ctx: "NVIDIA fell ~12% in a single session on no real news.",
    why: "Your largest single position, €34.000 on paper. A wobble, not a thesis change — you held, and it was back within six weeks.",
    ask: "Ask: what if I'd sold NVIDIA on the drop?",
    trig: "NVIDIA fell ~12% in a day", trigsrc: "Markets", detect: "Your largest position — €34.000 on paper",
    logged: "Flagged · no action · you held",
  },
  {
    date: "Jun 2024", title: "ECB cut rates", tag: "auto", kind: "market",
    nw: "€1.157.056", imp: "+€3.200 · bonds", impc: "up",
    ctx: "The ECB cut rates for the first time in years; bonds ticked up.",
    why: "The mortgage is already fixed, so the cut only helps the bond sleeve. Noted for you, nothing to do.",
    ask: "Ask: what if I'd moved more into bonds then?",
    trig: "ECB cut rates", trigsrc: "ECB", detect: "First cut in years; bonds ticked up",
    logged: "+€3.200 · mortgage already fixed",
  },
  {
    date: "Oct 2024", title: "Rebalanced after NVIDIA run", tag: "user", kind: "dec",
    nw: "€1.152.035", imp: "€96.000 locked in · 41% → 28%", impc: "up",
    ctx: "NVIDIA earnings beat, the stock rose 8%, pushing it to 41% of the book.",
    why: "Above my 35% comfort line. Banking some gains, staying invested — trimming the risk, not the conviction.",
    ask: "Ask: what if I hadn't trimmed NVIDIA?",
    say: "Trimming NVIDIA — it's gotten too big.", read: "NVIDIA earnings +8% · position at 41%",
    readsrc: "Earnings", wrote: "Trimmed NVIDIA · €96.000 locked, 41%→28%", sym: "NV",
  },
  {
    date: "Jan 2025", title: "Net worth crossed €1.000.000", tag: "auto", kind: "milestone",
    nw: "€1.197.759", imp: "€1.000.000 · up €245.000 since 2021", impc: "up",
    ctx: "The NVIDIA run carried total net worth past seven figures.",
    why: "A threshold worth marking — €245.000 above where this journal began in 2021. Saved on its own.",
    ask: "Ask: at this pace, when do I reach €2.000.000?",
    trig: "Net worth crossed €1.000.000", trigsrc: null, detect: "A threshold worth marking",
    logged: "Milestone · up €245.000 since 2021", mkthead: "From milestone to journal",
  },
  {
    date: "May 2025", title: "Trimmed Bitcoin at the record", tag: "user", kind: "dec",
    nw: "€1.198.821", imp: "+€34.000 realised · the core still runs", impc: "up",
    ctx: "Bitcoin printed a new all-time high.",
    why: "Taking the original stake off the table so the rest plays with house money. The core keeps running.",
    ask: "Ask: what if I'd held the whole Bitcoin stake?",
    say: "Taking my original Bitcoin stake off the table.", read: "Bitcoin printed a new all-time high",
    readsrc: "Crypto", wrote: "Trimmed Bitcoin · +€34.000 realised", sym: "₿",
  },
  {
    date: "2026", title: "Crypto sold off hard", tag: "auto", kind: "market",
    nw: "€1.290.083", imp: "−€33.000 on the year · core intact", impc: "dn",
    ctx: "Bitcoin fell ~30% across the year.",
    why: "Down €33.000 on the year, but only the trimmed remainder is exposed. The core thesis is intact — you held.",
    ask: "Ask: what if I'd sold the core before the selloff?",
    trig: "Bitcoin fell ~30% on the year", trigsrc: "Crypto", detect: "You held the core through it",
    logged: "−€33.000 on the year · core intact",
  },
];

// Generic pipeline fill for the column that isn't the active entry's source.
export const GENERIC_CHAT = {
  say: "Sold 80 NVIDIA today.",
  read: "Largest holding, 41% · earnings, +8%",
  readsrc: "Earnings",
  wrote: "Trimmed NVIDIA · €96.000 locked",
  sym: "NV",
};

export const GENERIC_MARKET = {
  trig: "NVIDIA −12% in a day.",
  trigsrc: "Markets" as string | null,
  detect: "Your largest position — €34.000 on paper.",
  logged: "Flagged · no action · you held",
  head: "From market to journal",
};

// Symbol → swatch colour for the "writes the entry" chip.
export const SYMBOL_COLORS: Record<string, string> = {
  NV: "#117A52", AS: "#117A52", VW: "#117A52",
  "₿": "#E0922A", MG: "#3F7CA8", "€": "#A89968", Au: "#C9A227",
};
