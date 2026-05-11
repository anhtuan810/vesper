import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { DisplayCurrency } from "@/lib/money";

// Verify the session from cookies — use in API routes instead of trusting body userId
export async function getAuthUser(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Client-side Supabase client (used in components)
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
  mortgage_rate?: number; // repurposed as interest_rate for cash/pension
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
  avatar_url?: string;
  profile?: Record<string, string>;
  display_currency: DisplayCurrency;
  theme: "auto" | "light" | "dark";
  last_backfill_at?: string | null;
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
}

export interface Mutation {
  id: string;
  user_id: string;
  asset_id: string | null;
  asset_name: string | null;
  asset?: { name: string } | null;
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
