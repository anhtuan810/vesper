// ── External API URLs ──────────────────────────────────────────────────────────
export const YAHOO_FINANCE_BASE_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart";

export const FRANKFURTER_URL =
  "https://api.frankfurter.app/latest?base=EUR&symbols=USD,GBP,CHF,JPY,CAD,AUD,HKD";

// ── Fetch ──────────────────────────────────────────────────────────────────────
export const FETCH_TIMEOUT_MS = 6000;

// ── Cache TTLs ─────────────────────────────────────────────────────────────────
export const PRICE_CACHE_TTL_MS   = 5 * 60 * 1000;       // 5 minutes
export const SPARKLINES_TTL_MS    = 5 * 60 * 1000;       // 5 minutes
export const FX_STALE_AFTER_MS    = 24 * 60 * 60 * 1000; // 24 hours
export const FX_MEM_CACHE_TTL_MS  = 60_000;              // 1 minute (in-process)
export const INSIGHT_CACHE_TTL_MS = 60 * 60 * 1000;      // 1 hour
export const CHAT_TTL_MS          = 24 * 60 * 60 * 1000; // 24 hours

// ── Rate limits & pagination ───────────────────────────────────────────────────
export const CHAT_DAILY_LIMIT       = 50;
export const DIARY_DAILY_LIMIT      = 100;
export const MESSAGES_DEFAULT_LIMIT = 20;
export const MESSAGES_MAX_LIMIT     = 50;
export const CHAT_LOAD_LIMIT        = 20;
export const DIARY_PAGE_SIZE        = 100;

// ── Polling ────────────────────────────────────────────────────────────────────
export const PRICES_POLL_INTERVAL_MS   = 10 * 60 * 1000; // 10 minutes
export const PRICES_SAFETY_TIMEOUT_MS  = 3000;           // 3 seconds

// ── FX fallback rates (EUR as base) ───────────────────────────────────────────
// Last reviewed: 2026. These drift over time; review annually.
export const EUR_FALLBACK_RATES: Record<string, number> = {
  USD: 1.12,
  GBP: 0.85,
  CHF: 0.94,
  JPY: 160,
  CAD: 1.56,
  AUD: 1.75,
  HKD: 8.72,
};

// ── Client-side sessionStorage cache key helpers ───────────────────────────────
export const ASSETS_CACHE_PREFIX     = "volnar.assets.";
export const SPARKLINES_CACHE_PREFIX = "volnar.sparklines.v1.";
export const PRICES_TS_CACHE_PREFIX  = "volnar.prices.ts.";

export const assetsCacheKey     = (userId: string)                        => `${ASSETS_CACHE_PREFIX}${userId}`;
export const sparklinesCacheKey = (symbolKey: string, range: string)      => `${SPARKLINES_CACHE_PREFIX}${range}.${symbolKey}`;
export const pricesTsCacheKey   = (userId: string)                        => `${PRICES_TS_CACHE_PREFIX}${userId}`;

// ── localStorage cache keys ────────────────────────────────────────────────────
export const CHAT_HISTORY_PREFIX  = "volnar.chat.history.";
export const chatHistoryCacheKey  = (userId: string) => `${CHAT_HISTORY_PREFIX}${userId}`;

// ── Misc UI keys ──────────────────────────────────────────────────────────────
export const CURRENCY_TOAST_KEY = "volnar.currency.toastSeen";
