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

// ── Abuse / cost caps (server-enforced) ───────────────────────────────────────
// A price request resolves one live quote per symbol; bound both the batch size
// and how many upstream fetches run at once, so one request can't fan out to
// thousands of outbound Yahoo calls. 100 comfortably covers any real portfolio's
// distinct tradeable symbols (the client dedupes before sending).
export const PRICES_MAX_SYMBOLS       = 100;
export const PRICES_FETCH_CONCURRENCY = 8;
// Direct /api/geocode calls per user per day. Geocoding only happens when adding
// or editing a property address, so this is generous for real use yet caps a
// loop that would otherwise get the server IP banned by Nominatim.
export const GEOCODE_DAILY_LIMIT      = 100;
// Forced (fresh=1) portfolio-insight regenerations per user per day. Each one is
// an LLM call; a real user only triggers it by mutating their portfolio. Over
// the cap we serve the cached cards instead of regenerating (never a 429).
export const INSIGHT_FRESH_DAILY_LIMIT = 60;
// Chat onboarding attachments. Images are downscaled + JPEG-compressed in the
// browser (long edge ≤ CHAT_IMAGE_MAX_EDGE_PX) before upload, so each one is
// ~200–400 KB regardless of the original — the raw-file guards below only reject
// absurd inputs before we spend memory decoding them. The whole request must
// stay under Vercel's serverless body limit (~4.5 MB), so CHAT_REQUEST_MAX_BASE64
// is the real ceiling; the PDF cap is sized to fit inside it on its own.
export const CHAT_MAX_IMAGES          = 8;         // model accepts far more; this bounds cost/latency
export const CHAT_IMAGE_MAX_EDGE_PX   = 1568;      // Anthropic standard-tier long edge — ample to read holdings
export const CHAT_IMAGE_JPEG_QUALITY  = 0.82;
export const CHAT_IMAGE_MAX_INPUT_MB  = 25;        // reject a monster original before canvas-decoding it
export const CHAT_MAX_PDFS            = 2;
export const CHAT_PDF_MAX_MB          = 3;         // ~4 MB base64 — fits under Vercel's ~4.5 MB body cap on its own
export const CHAT_CSV_MAX_BYTES       = 1_000_000; // 1 MB raw
export const CHAT_CSV_MAX_ROWS        = 500;       // far more rows than any real portfolio
export const CHAT_CSV_MAX_TEXT_LEN    = 60_000;    // cap the extracted text handed to the model
export const CHAT_REQUEST_MAX_BASE64  = 4_200_000; // total base64 across all attachments (Vercel body ceiling)
export const DIARY_MAX_MUTATIONS      = 400;
export const DIARY_MAX_CONTEXT_LEN    = 500;

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
// The swing-detection window widens back to the earliest holding's acquisition
// date (so a position bought years ago surfaces market events across its whole
// held period — matching the net-worth line, which backfills to the buy date),
// but never further than this — bounding the index/price/FX history fetched per
// regeneration. Beyond ~5y the per-month caps and stale price coverage make the
// extra span low-value.
export const MARKET_MOVE_MAX_LOOKBACK_DAYS = 1825; // ~5 years

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
