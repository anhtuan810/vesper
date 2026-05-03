import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

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

// Types
export interface Asset {
  id: string;
  user_id: string;
  name: string;
  type: "stocks" | "etf" | "crypto" | "bonds" | "gold" | "real_estate" | "cash" | "pension" | "other";
  value: number;
  currency: string;
  country?: string;
  symbol?: string;
  units?: number;
  buy_price?: number;
  buy_date?: string;
  buy_price_source?: "user" | "market";
  mortgage_balance?: number;
  mortgage_rate?: number;
  monthly_payment?: number;
  mortgage_type?: "annuity" | "linear" | "interest_only";
  mortgage_start_date?: string;
  mortgage_end_date?: string;
  created_at: string;
  updated_at: string;
}

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
  asset_id?: string;
  asset_name?: string;
  action: "add" | "edit" | "remove";
  before_value?: number;
  after_value?: number;
  personal_context?: string;
  market_context?: string;
  portfolio_total?: number;
  occurred_at?: string;
  recorded_at: string;
}
