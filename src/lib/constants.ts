// ── External API URLs ──────────────────────────────────────────────────────────
export const YAHOO_FINANCE_BASE_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart";

export const FRANKFURTER_URL =
  "https://api.frankfurter.app/latest?base=USD&symbols=EUR,GBP,CHF,JPY,CAD,AUD,HKD";

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

// ── FX fallback rates (USD as base, 1 USD = N quote) ─────────────────────────
// Last reviewed: 2026. These drift over time; review annually.
export const USD_FALLBACK_RATES: Record<string, number> = {
  EUR: 0.89,
  GBP: 0.76,
  CHF: 0.84,
  JPY: 143,
  CAD: 1.39,
  AUD: 1.56,
  HKD: 7.79,
};

// ── Client-side sessionStorage cache key helpers ───────────────────────────────
export const ASSETS_CACHE_PREFIX     = "volnar.assets.";
export const SPARKLINES_CACHE_PREFIX = "volnar.sparklines.v1.";
export const PRICES_TS_CACHE_PREFIX  = "volnar.prices.ts.";
export const VITALS_CACHE_PREFIX     = "volnar.vitals.v1.";
export const DIARY_CACHE_PREFIX      = "volnar.diary.v1.";
export const PROFILE_BASELINE_CACHE_PREFIX = "volnar.profile.baseline.v1.";

export const assetsCacheKey     = (userId: string)                        => `${ASSETS_CACHE_PREFIX}${userId}`;
export const sparklinesCacheKey = (symbolKey: string, range: string)      => `${SPARKLINES_CACHE_PREFIX}${range}.${symbolKey}`;
export const pricesTsCacheKey   = (userId: string)                        => `${PRICES_TS_CACHE_PREFIX}${userId}`;
export const vitalsCacheKey     = (userId: string)                        => `${VITALS_CACHE_PREFIX}${userId}`;
export const diaryCacheKey      = (userId: string)                        => `${DIARY_CACHE_PREFIX}${userId}`;
export const profileBaselineCacheKey = (userId: string)                   => `${PROFILE_BASELINE_CACHE_PREFIX}${userId}`;

// The Profile trajectory baseline (net worth ~365 days ago) barely moves day to
// day, so its derived value is cached this long before a background revalidate.
export const PROFILE_BASELINE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// ── localStorage cache keys ────────────────────────────────────────────────────
export const CHAT_HISTORY_PREFIX  = "volnar.chat.history.";
export const chatHistoryCacheKey  = (userId: string) => `${CHAT_HISTORY_PREFIX}${userId}`;

// ── Misc UI keys ──────────────────────────────────────────────────────────────
export const CURRENCY_TOAST_KEY = "volnar.currency.toastSeen";

// ── Diary market-move highlights (deterministic, no LLM) ──────────────────────
export const MARKET_MOVE_THRESHOLD_PCT = 2.0;
export const MARKET_MOVE_WINDOW_TRADING_DAYS = 2;
export const MARKET_MOVE_LOOKBACK_DAYS = 365;

// A big swing becomes a FULL journal entry (with the per-holding impact) when it
// is among the largest by |impact| in its calendar month AND the impact clears a
// floor relative to that day's tradeable value. Smaller swings stay compact rows,
// so a volatile month never floods the journal with full cards.
export const MARKET_SWING_MAX_EXPANDED_PER_MONTH = 4;
export const MARKET_SWING_EXPAND_FLOOR_PCT = 0.3;
// Hard cap on swings surfaced per calendar month (full cards + compact rows
// combined). Only swings that actually moved the portfolio above the floor are
// surfaced at all; beyond this many, the smallest in the month are dropped — so
// even a very volatile month never floods the journal (on desktop OR mobile).
export const MARKET_SWING_MAX_PER_MONTH = 8;

export const DIARY_MARKET_INDICES: { symbol: string; label: string }[] = [
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^AEX",  label: "AEX" },
];
