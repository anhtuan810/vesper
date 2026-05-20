let warnedMissingKey = false;

const MARKET_CONTEXT_TYPES = new Set(["stocks", "etf", "crypto"]);

export async function generateMarketContext(
  symbol: string | null,
  occurredAt: string,
  assetType: string | null,
): Promise<string | null> {
  if (!assetType || !MARKET_CONTEXT_TYPES.has(assetType)) return null;
  if (!symbol) return null;

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    if (!warnedMissingKey) {
      console.warn("FINNHUB_API_KEY is not set — market_context will not be populated");
      warnedMissingKey = true;
    }
    return null;
  }

  const date = occurredAt.slice(0, 10);
  const url =
    `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${date}&to=${date}&token=${apiKey}`;

  let items: Array<{ headline?: string; related?: string }>;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    items = await res.json();
  } catch (err) {
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureException(err, { tags: { helper: "market-context" } });
    } catch {
      // Sentry not available
    }
    return null;
  }

  if (!Array.isArray(items) || items.length === 0) return null;

  const upper = symbol.toUpperCase();
  const match =
    items.find((item) =>
      (item.related ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .includes(upper),
    ) ?? items[0];

  const raw = match.headline?.trim() ?? "";
  if (!raw) return null;

  return raw.length > 140 ? raw.slice(0, 139) + "…" : raw;
}
