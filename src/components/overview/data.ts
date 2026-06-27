// ============================================================================
// STATIC SHOWCASE DATA — Overview screen visual port.
// ----------------------------------------------------------------------------
// TODO(real-data): Everything below is literal placeholder content copied
// verbatim from the approved mockup (volnar-app.html). NONE of it is wired to
// live sources yet — this pass is a visual port only. When the redesign is
// promoted, bind these to the real app data instead of the constants here:
//
//   NET_WORTH / NET_WORTH_BASIS / NET_WORTH_BADGE  → portfolio valuation
//                                                    (see useAssets / netTotal)
//   HOLDINGS                                        → live holdings + prices
//   EP_ENTRIES                                      → decision journal entries
//                                                    that drive the chart panel
//   LEDGER                                          → /api/mutations diary rows
//   VITALS                                          → /api/vitals engine
//   RAIL_LOGS / DOCK_LOG                            → recent "Logged" mutations
//
// Numbers keep the mockup's nl-NL formatting (e.g. €1.290.083, −1,3%) and use a
// real minus sign (U+2212) on negatives, exactly as the mockup ships them.
// ============================================================================

export const NET_WORTH = "€1.290.083";
export const NET_WORTH_BASIS = "Equity basis — property shown net of mortgage.";
export const NET_WORTH_BADGE = "▲ +71% since 2021";

export const RANGES = ["1M", "3M", "6M", "1Y", "5Y", "Max"] as const;
export const ACTIVE_RANGE = "1Y";

// ── Entry panel entries (one per chart marker, by index) ───────────────────
export type EntryKind = "Milestone" | "Market" | "Decision";
export type EntryClass = "milestone" | "market" | ""; // kc → ep-kind modifier
export type Entry = {
  date: string;
  kind: EntryKind;
  kc: EntryClass;
  title: string;
  ctx: string;
  why: string;
  imp: string;
  impc: "up" | "dn";
  ask: string;
};

export const EP_ENTRIES: Entry[] = [
  { date: "Jul 2021", kind: "Milestone", kc: "milestone", title: "Opened the journal", ctx: "The starting line — €754.000 across a flat, a portfolio and a little crypto.", why: "Day one. From here on, every move gets a reason attached, so future-me sees the why, not just the what.", imp: "€754.000 · starting point", impc: "up", ask: "What would €754.000 be today in just an index fund?" },
  { date: "Feb 2022", kind: "Market", kc: "market", title: "War broke out in Ukraine", ctx: "Equities fell hard and energy spiked the week the invasion began.", why: "Property is the biggest exposure, so the hit was cushioned. Flagged automatically — no action, you sat still.", imp: "−€38.000 that week · recovered", impc: "dn", ask: "What if I'd sold everything that week?" },
  { date: "Mar 2022", kind: "Decision", kc: "", title: "Raised cash before the drop", ctx: "The Fed signalled its first hikes; equities had grown to 64% of net worth.", why: "De-risking before the cycle turns. Moving to cash now so a forced sale later never has to happen.", imp: "avoided ≈ €40.000 of the 2022 drop", impc: "up", ask: "What if I'd stayed fully invested instead?" },
  { date: "Oct 2022", kind: "Decision", kc: "", title: "Bought the bottom", ctx: "Fear peaked and markets bottomed that October.", why: "Buying when it hurt. I can't call the exact low, but this is close enough — the reason is conviction, not timing.", imp: "≈ €120.000 up since", impc: "up", ask: "What if I'd waited six more months to buy?" },
  { date: "Mar 2023", kind: "Market", kc: "market", title: "A US bank failed (SVB)", ctx: "A US bank (SVB) failed; equities wobbled, then steadied within days.", why: "Your banks aren't exposed and cash is spread thin. Logged, watched, left alone — recovered inside a week.", imp: "−€12.000 that week · recovered", impc: "dn", ask: "What if I'd pulled out when the bank failed?" },
  { date: "Jun 2023", kind: "Decision", kc: "", title: "Locked the mortgage", ctx: "The ECB raised +25bps with mortgage rates still climbing.", why: "Locking the rate. Certainty over chasing a few basis points — I'd rather sleep than optimise.", imp: "≈ €8.400 saved in interest", impc: "up", ask: "What if I'd stayed on a variable rate?" },
  { date: "Apr 2024", kind: "Market", kc: "market", title: "NVIDIA fell ~12% in a day", ctx: "NVIDIA fell ~12% in a single session on no real news.", why: "Your largest single position, €34.000 on paper. A wobble, not a thesis change — you held, and it was back within six weeks.", imp: "−€34.000 on paper · recovered", impc: "dn", ask: "What if I'd sold NVIDIA on the drop?" },
  { date: "Jun 2024", kind: "Market", kc: "market", title: "ECB cut rates", ctx: "The ECB cut rates for the first time in years; bonds ticked up.", why: "The mortgage is already fixed, so the cut only helps the bond sleeve. Noted for you, nothing to do.", imp: "+€3.200 · bonds", impc: "up", ask: "What if I'd moved more into bonds then?" },
  { date: "Oct 2024", kind: "Decision", kc: "", title: "Rebalanced after NVIDIA run", ctx: "NVIDIA earnings beat, the stock rose 8%, pushing it to 41% of the book.", why: "Above my 35% comfort line. Banking some gains, staying invested — trimming the risk, not the conviction.", imp: "€96.000 locked in · 41% → 28%", impc: "up", ask: "What if I hadn't trimmed NVIDIA?" },
  { date: "Jan 2025", kind: "Milestone", kc: "milestone", title: "Crossed €1.000.000", ctx: "The NVIDIA run carried total net worth past seven figures.", why: "A threshold worth marking — €245.000 above where this journal began in 2021. Saved on its own.", imp: "€1.000.000 · up €245.000", impc: "up", ask: "At this pace, when do I reach €2.000.000?" },
  { date: "May 2025", kind: "Decision", kc: "", title: "Trimmed Bitcoin at the record", ctx: "Bitcoin printed a new all-time high.", why: "Taking the original stake off the table so the rest plays with house money. The core keeps running.", imp: "+€34.000 realised · core runs", impc: "up", ask: "What if I'd held the whole Bitcoin stake?" },
  { date: "2026", kind: "Market", kc: "market", title: "Crypto sold off hard", ctx: "Bitcoin fell ~30% across the year.", why: "Down €33.000 on the year, but only the trimmed remainder is exposed. The core thesis is intact — you held.", imp: "−€33.000 on the year · core intact", impc: "dn", ask: "What if I'd sold the core before the selloff?" },
];

// ── Expandable holdings, by asset class ────────────────────────────────────
// `accent` is the band/swatch colour token; `pct`/`bar` mirror the dashboard
// allocation. A position with no `spark` renders without a sparkline (cash); a
// position with `owned` shows "% owned" instead of a day change (property).
export type Position = {
  badge: string; // logo-tile glyph (or "house" for the property icon)
  name: string;
  sub: string; // ticker · shares
  value: string;
  spark?: { dir: "up" | "dn"; points: string };
  change?: { dir: "up" | "dn"; label: string };
  owned?: string;
};
export type HoldingGroup = {
  name: string;
  token: string; // CSS var name for the accent colour
  color: string; // hex (logo borders / swatches)
  pct: string;
  bar: string; // bar width %
  value: string;
  positions: Position[];
};

export const HOLDINGS: HoldingGroup[] = [
  {
    name: "Public markets", token: "--eq", color: "#117A52", pct: "47%", bar: "47%", value: "€611.505",
    positions: [
      { badge: "NV", name: "NVIDIA", sub: "NVDA · 40 shares", value: "€372.000", spark: { dir: "up", points: "0,20 16,16 32,18 48,10 64,12 80,5" }, change: { dir: "up", label: "+1,2%" } },
      { badge: "AS", name: "ASML", sub: "ASML · 30 shares", value: "€92.505", spark: { dir: "dn", points: "0,8 16,12 32,9 48,15 64,13 80,20" }, change: { dir: "dn", label: "−0,4%" } },
      { badge: "IW", name: "iShares Core MSCI World", sub: "IWDA · 320 shares", value: "€70.000", spark: { dir: "up", points: "0,18 16,20 32,13 48,15 64,9 80,7" }, change: { dir: "up", label: "+0,3%" } },
      { badge: "AP", name: "Apple", sub: "AAPL · 90 shares", value: "€34.000", spark: { dir: "up", points: "0,20 16,16 32,18 48,10 64,12 80,5" }, change: { dir: "up", label: "+0,8%" } },
      { badge: "MS", name: "Microsoft", sub: "MSFT · 40 shares", value: "€28.000", spark: { dir: "dn", points: "0,9 16,7 32,13 48,11 64,17 80,21" }, change: { dir: "dn", label: "−0,2%" } },
      { badge: "MU", name: "Micron", sub: "MU · 90 shares", value: "€15.000", spark: { dir: "dn", points: "0,8 16,12 32,9 48,15 64,13 80,20" }, change: { dir: "dn", label: "−1,6%" } },
    ],
  },
  {
    name: "Property", token: "--prop", color: "#3F7CA8", pct: "33%", bar: "33%", value: "€431.323",
    positions: [
      { badge: "house", name: "Apartment — Amsterdam", sub: "NL · primary residence", value: "€311.323", owned: "38% owned" },
      { badge: "house", name: "Rental — Rotterdam", sub: "NL · buy-to-let", value: "€120.000", owned: "24% owned" },
    ],
  },
  {
    name: "Reserves", token: "--res", color: "#A89968", pct: "14%", bar: "14%", value: "€181.110",
    positions: [
      { badge: "€", name: "Cash", sub: "EUR · instant access", value: "€121.110" },
      { badge: "Au", name: "Gold", sub: "XAU · 18 oz", value: "€40.000", spark: { dir: "up", points: "0,18 16,20 32,13 48,15 64,9 80,7" }, change: { dir: "up", label: "+0,5%" } },
      { badge: "MM", name: "Money-market fund", sub: "EUR · t+1", value: "€20.000" },
    ],
  },
  {
    name: "Crypto", token: "--cry", color: "#E0922A", pct: "5%", bar: "5%", value: "€66.145",
    positions: [
      { badge: "₿", name: "Bitcoin", sub: "BTC · 0,71", value: "€66.145", spark: { dir: "dn", points: "0,9 16,7 32,13 48,11 64,17 80,21" }, change: { dir: "dn", label: "−2,1%" } },
    ],
  },
];

export const DASH_FOOT = "Vitals · 4 healthy · 2 to watch · every dot on the line is a journal entry";

// ── Vitals section ─────────────────────────────────────────────────────────
export type VitalBand = "ok" | "warn" | "bad";
export type Vital = { name: string; band: VitalBand; label: string; val: string; unit: string; read: string };

export const VITALS: Vital[] = [
  { name: "Concentration", band: "warn", label: "Watch", val: "38%", unit: " · NVIDIA", read: "Above the 35% line — one position drives a lot of the book." },
  { name: "Liquidity", band: "ok", label: "Healthy", val: "54%", unit: " in a week", read: "Over half your wealth is reachable within seven days." },
  { name: "Leverage", band: "ok", label: "Healthy", val: "28%", unit: " LTV", read: "The mortgage is modest, and the rate is fixed." },
  { name: "Drawdown", band: "ok", label: "Healthy", val: "−23%", unit: " 2008-style", read: "A simultaneous crash would cut about a quarter — survivable." },
  { name: "Cash yield", band: "warn", label: "Watch", val: "−1,3%", unit: " real", read: "Cash is quietly losing to inflation and tax." },
  { name: "Real growth", band: "ok", label: "Healthy", val: "+8,3%", unit: " past year", read: "Net worth is growing ahead of inflation." },
];

// ── Decision ledger (separate from the chart's entries) ────────────────────
export type LedgerRow = { date: string; title: string; tag: "You" | "Auto"; why: string; imp: string; dn: boolean };

export const LEDGER: LedgerRow[] = [
  { date: "2026", title: "Crypto sold off hard", tag: "Auto", why: "Bitcoin fell hard across the market. Your core thesis held, so you stayed put.", imp: "−€33.000", dn: true },
  { date: "May 2025", title: "Trimmed Bitcoin at the record", tag: "You", why: "Took the original stake off the table near the all-time high.", imp: "+€34.000", dn: false },
  { date: "Jan 2025", title: "Crossed €1.000.000", tag: "Auto", why: "A milestone, carried there largely by the NVIDIA run.", imp: "+€245.000", dn: false },
  { date: "Oct 2024", title: "Rebalanced after NVIDIA run", tag: "You", why: "The position pushed above your 35% comfort line, so you trimmed.", imp: "€96.000 locked", dn: false },
  { date: "Jun 2023", title: "Locked the mortgage", tag: "You", why: "Chose certainty over a few basis points of rate.", imp: "€8.400 saved", dn: false },
  { date: "Oct 2022", title: "Bought the bottom", tag: "You", why: "Bought when it hurt — near the 2022 low.", imp: "+€120.000", dn: false },
];

// ── Chat rail / dock "Logged" confirmations ────────────────────────────────
export type LoggedLine = { title: string; detail: string };

export const RAIL_LOGS: LoggedLine[] = [
  { title: "Trimmed NVIDIA", detail: "concentration 41% → 38%" },
  { title: "Trimmed Bitcoin", detail: "+€34.000 realised" },
  { title: "Locked the mortgage", detail: "€8.400 saved" },
];

export const DOCK_LOG: LoggedLine = { title: "Trimmed NVIDIA", detail: "concentration 41% → 38%" };

export const COMPOSER_PLACEHOLDER = "Tell Volnar what changed…";
export const RAIL_DISCLAIMER = "Records and explains decisions — not financial advice.";
export const DOCK_DISCLAIMER =
  "The only way to change your portfolio. Volnar records and explains decisions — it does not give financial advice.";
export const RAIL_NOTE =
  "Tell Volnar what changed — it logs the decision and updates the numbers. This is the only way to change your portfolio.";
