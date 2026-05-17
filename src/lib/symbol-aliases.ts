// Maps European exchange-suffixed Yahoo tickers to their
// US-listed equivalent. Used to normalise symbols on asset add
// so dual-listed equities consistently resolve to the deeper
// US market for pricing and logos.
//
// Keys are uppercase. Lookup must uppercase the input.
// Only include tickers with a verified US equivalent.

export const US_EQUIVALENTS: Record<string, string> = {
  "TL0.DE":   "TSLA",   // Tesla
  "APC.DE":   "AAPL",   // Apple
  "AMZ.DE":   "AMZN",   // Amazon
  "MSF.DE":   "MSFT",   // Microsoft
  "NVD.DE":   "NVDA",   // NVIDIA
  "ABEA.DE":  "GOOGL",  // Alphabet A
  "ABEC.DE":  "GOOG",   // Alphabet C
  "FB2A.DE":  "META",   // Meta
  "NFC.DE":   "NFLX",   // Netflix
  "SHEL.L":   "SHEL",   // Shell
  "BP.L":     "BP",     // BP
  "AZN.L":    "AZN",    // AstraZeneca
  "ULVR.L":   "UL",     // Unilever
  "MC.PA":    "LVMUY",  // LVMH (ADR)
  "OR.PA":    "LRLCY",  // L'Oréal (ADR)
  "SAP.DE":   "SAP",    // SAP
  "SIE.DE":   "SIEGY",  // Siemens (ADR)
  "ASML.AS":  "ASML",   // ASML (US-listed primary)
  "RHM.DE":   "RNMBY",  // Rheinmetall (ADR)
};

export function resolveSymbol(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const upper = symbol.toUpperCase();
  return US_EQUIVALENTS[upper] ?? symbol;
}
