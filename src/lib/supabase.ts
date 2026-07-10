import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { DisplayCurrency } from "@/lib/money";

// Verify the session — use in API routes instead of trusting body userId.
// Native app (bundled UI at capacitor://localhost) authenticates with a Bearer
// token, because cookies don't cross that origin; the web app keeps cookie
// sessions. Both paths validate the JWT against Supabase Auth.
export async function getAuthUser(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (bearer) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: { user } } = await supabase.auth.getUser(bearer);
    return user;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Client-side Supabase client (used in components).
// Web: @supabase/ssr's cookie-backed client, so the session is shared with
// middleware and server routes. Native (bundled app at capacitor://localhost):
// cookies don't persist on the custom scheme — a full page load would drop the
// session — so it lives in localStorage via plain supabase-js instead.
// Module singleton on native so every call site (components, apiFetch, deep
// link handler) shares one auth state; createBrowserClient memoizes itself.
let nativeClient: SupabaseClient | null = null;

export function createBrowserSupabase(): SupabaseClient {
  if (process.env.NEXT_PUBLIC_BUILD_TARGET === "native") {
    nativeClient ??= createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      // detectSessionInUrl off: the deep-link handler exchanges the OAuth
      // code explicitly (src/lib/native/deeplink.ts).
      { auth: { flowType: "pkce", detectSessionInUrl: false } }
    );
    return nativeClient;
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: "pkce" } }
  );
}

// Server-side Supabase client with service role (used in API routes)
export function createServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ── Asset types ────────────────────────────────────────────────────────────────

interface BaseAsset {
  id: string;
  user_id: string;
  name: string;
  value: number;
  currency: string;
  country?: string;
  // Shared tradeable fields — also present on bonds when listed
  symbol?: string;
  units?: number;
  buy_price?: number;
  buy_date?: string;
  buy_price_source?: "user" | "market";
  created_at: string;
  updated_at: string;
  // Soft-delete marker — set, the asset is excluded from current-holdings
  // reads but its row and history remain for snapshot reconstruction.
  removed_at?: string | null;
}

export interface TradeableAsset extends BaseAsset {
  type: "stocks" | "etf" | "crypto" | "gold";
}

export interface RealEstateAsset extends BaseAsset {
  type: "real_estate";
  address?: string;
  latitude?: number;
  longitude?: number;
  photo_url?: string;
  property_type?: string;
  size_sqm?: number;
  mortgage_balance?: number;
  mortgage_balance_recorded_at?: string | null;
  mortgage_rate?: number;
  monthly_payment?: number;
  mortgage_type?: "annuity" | "linear" | "interest_only";
  mortgage_start_date?: string;
  mortgage_end_date?: string;
}

export interface BondsAsset extends BaseAsset {
  type: "bonds";
  coupon_rate?: number;
  maturity_date?: string;
  issuer?: string;
  isin?: string;
}

export interface StaticAsset extends BaseAsset {
  type: "cash" | "pension" | "other";
  mortgage_rate?: number; // repurposed as interest_rate for cash/pension (and growth assumption for capital pensions)
  // Pension two-shape fields. pension_kind null is treated as 'dc' (capital) defensively.
  pension_kind?: "dc" | "db" | "state" | null;
  annual_income?: number | null;    // income pensions only (db/state)
  monthly_contribution?: number | null; // capital pensions
  access_age?: number | null;        // capital: projection horizon; income: start age
  pension_provider?: string | null;  // income pensions
}

export type Asset = TradeableAsset | RealEstateAsset | BondsAsset | StaticAsset;

export type LiveAsset = Asset & {
  livePrice?: number;
  livePrev?: number;
  nativePrice?: number;    // original Yahoo price before EUR conversion
  nativeCurrency?: string; // the currency Yahoo reported (e.g. "USD")
};

// ── Users table row ───────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  name?: string;
  avatar_url?: string | null;
  fingerprint?: string | null;
  profile?: {
    life_and_direction?: string | null;
    approach?: string | null;
    currently_exploring?: string | null;
    worth_raising?: string | null;
  } | null;
  display_currency: DisplayCurrency;
  theme: "light" | "dark";
  last_backfill_at?: string | null;
  // Null until the user finishes the gated onboarding flow (see the middleware
  // gate + POST /api/onboarding/complete). Gate on this flag, never on "has data".
  onboarding_completed_at?: string | null;
}

// ── Other types ────────────────────────────────────────────────────────────────

export interface UserProfile {
  goals?: string;
  risk_behaviour?: string;
  decision_style?: string;
  engagement_pattern?: string;
  blind_spots?: string;
  preferences?: Record<string, string>;
  [key: string]: unknown;
}

export interface Message {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  suggested_replies?: string[] | null;

}

export interface Mutation {
  id: string;
  user_id: string;
  asset_id: string | null;
  asset_name: string | null;
  asset?: { name: string; pension_kind?: "dc" | "db" | "state" | null } | null;
  asset_type: string | null;
  symbol: string | null;
  action: "add" | "edit" | "remove";
  before_value: number | null;
  after_value: number | null;
  before_units: number | null;
  after_units: number | null;
  currency: string | null;
  personal_context: string | null;
  market_context: string | null;
  portfolio_total: number | null;
  occurred_at: string | null;
  recorded_at: string;
}
