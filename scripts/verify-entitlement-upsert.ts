// Self-test for the LIVE entitlement WRITE path (src/lib/entitlements.ts
// upsertEntitlement) — distinct from verify-entitlement-mapping.ts, which only
// exercises the pure mappers. The row is created once at checkout, so every later
// customer.subscription.updated hits the UPDATE side of the upsert; this test
// drives that exact sequence and asserts the PERSISTED row, not the mapper output.
//
// It runs the real upsertEntitlement against an in-memory fake that faithfully
// models the PostgREST upsert contract used in production:
//   - resolution=merge-duplicates (the supabase-js default) → ON CONFLICT DO UPDATE
//   - resolution=ignore-duplicates (ignoreDuplicates: true)  → ON CONFLICT DO NOTHING
// so a regression that makes the update path inert (e.g. switching to
// ignoreDuplicates, dropping cancel_at_period_end from the row, or letting the
// cross-source guard swallow a same-source write) fails this test loudly.
//
// Run:  npx tsx scripts/verify-entitlement-upsert.ts

// Price ids the Stripe mapper reads at call time (plan resolution).
process.env.STRIPE_PRICE_MONTHLY = "price_monthly";
process.env.STRIPE_PRICE_ANNUAL = "price_annual";

import type Stripe from "stripe";
import { mapStripeSubscription } from "../src/lib/stripe";
import { upsertEntitlement, type EntitlementRow, type EntitlementWrite } from "../src/lib/entitlements";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log("ok:", msg);
  } else {
    console.error("FAIL:", msg);
    failures++;
  }
}

// ── In-memory PostgREST-faithful fake ──────────────────────────────────────────
// Models only what upsertEntitlement touches: a single-PK `entitlements` table
// (PK user_id) and the `billing_events` ledger. Every write resolves to
// { error }, every read terminates in .maybeSingle() → { data, error }, matching
// the supabase-js surface the code awaits.
type Row = Record<string, unknown>;

class FakeDb {
  entitlements = new Map<string, Row>();
  billing = new Map<string, Row>();

  rows(table: string): Row[] {
    return [...(table === "entitlements" ? this.entitlements : this.billing).values()];
  }

  match(table: string, filters: Array<[string, unknown]>): Row[] {
    return this.rows(table).filter((r) => filters.every(([c, v]) => r[c] === v));
  }

  upsert(table: string, row: Row, opts: { onConflict?: string; ignoreDuplicates?: boolean }) {
    if (table !== "entitlements") throw new Error(`fake upsert unsupported for ${table}`);
    const pk = row.user_id as string;
    const existing = this.entitlements.get(pk);
    if (existing) {
      // ignore-duplicates → ON CONFLICT DO NOTHING: the update is silently dropped.
      // merge-duplicates (default) → ON CONFLICT DO UPDATE: provided columns win.
      if (opts.ignoreDuplicates) return { error: null };
      this.entitlements.set(pk, { ...existing, ...row });
      return { error: null };
    }
    this.entitlements.set(pk, { created_at: new Date().toISOString(), ...row });
    return { error: null };
  }

  update(table: string, patch: Row, filters: Array<[string, unknown]>) {
    for (const r of this.match(table, filters)) Object.assign(r, patch);
    return { error: null };
  }

  insert(table: string, obj: Row) {
    if (table === "billing_events") {
      const key = `${obj.provider}|${obj.event_id}`;
      if (this.billing.has(key)) return { error: { code: "23505", message: "duplicate" } };
      this.billing.set(key, obj);
      return { error: null };
    }
    this.entitlements.set(obj.user_id as string, obj);
    return { error: null };
  }
}

class FakeQuery {
  private op: "select" | "insert" | "update" | "upsert" | null = null;
  private payload: Row = {};
  private opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private filters: Array<[string, unknown]> = [];
  constructor(private db: FakeDb, private table: string) {}

  select() { this.op = "select"; return this; }
  insert(payload: Row) { this.op = "insert"; this.payload = payload; return this; }
  update(payload: Row) { this.op = "update"; this.payload = payload; return this; }
  upsert(payload: Row, opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert"; this.payload = payload; this.opts = opts; return this;
  }
  eq(col: string, val: unknown) { this.filters.push([col, val]); return this; }

  async maybeSingle() {
    const rows = this.db.match(this.table, this.filters);
    if (rows.length > 1) return { data: null, error: { message: "multiple rows" } };
    return { data: rows[0] ?? null, error: null };
  }

  // Writes are awaited directly on the builder; make it thenable.
  then<T>(resolve: (v: { error: unknown }) => T, reject?: (e: unknown) => T) {
    return this.exec().then(resolve, reject);
  }

  private async exec(): Promise<{ error: unknown }> {
    if (this.op === "insert") return this.db.insert(this.table, this.payload);
    if (this.op === "update") return this.db.update(this.table, this.payload, this.filters);
    if (this.op === "upsert") return this.db.upsert(this.table, this.payload, this.opts);
    return { error: null };
  }
}

function fakeClient(db: FakeDb) {
  return { from: (table: string) => new FakeQuery(db, table) } as unknown as Parameters<
    typeof upsertEntitlement
  >[0];
}

function read(db: FakeDb, userId: string): EntitlementRow {
  const row = db.entitlements.get(userId);
  if (!row) throw new Error("no entitlement row persisted");
  return row as unknown as EntitlementRow;
}

// ── Fixtures ────────────────────────────────────────────────────────────────────
const USER = "11111111-1111-4111-8111-111111111111";
const P1 = Math.floor((Date.now() + 30 * 86_400_000) / 1000); // period end at create
const P2 = Math.floor((Date.now() + 60 * 86_400_000) / 1000); // a later renewal date
const P1_ISO = new Date(P1 * 1000).toISOString();
const P2_ISO = new Date(P2 * 1000).toISOString();

function stripeSub(over: Record<string, unknown>): Stripe.Subscription {
  return {
    id: "sub_live",
    status: "active",
    customer: "cus_live",
    cancel_at_period_end: false,
    trial_end: null,
    items: { data: [{ price: { id: "price_monthly" }, current_period_end: P1 }] },
    metadata: { supabase_user_id: USER },
    ...over,
  } as unknown as Stripe.Subscription;
}
const withPeriod = (p: number, over: Record<string, unknown> = {}) =>
  ({ items: { data: [{ price: { id: "price_monthly" }, current_period_end: p }] }, ...over });

async function main() {
  const db = new FakeDb();
  const supabase = fakeClient(db);

  // 1) CREATE — the row the checkout webhook writes.
  await upsertEntitlement(supabase, mapStripeSubscription(stripeSub({}), USER));
  let row = read(db, USER);
  assert(db.entitlements.size === 1, "create: exactly one entitlement row");
  assert(row.status === "active", "create: status active persisted");
  assert(row.cancel_at_period_end === false, "create: cancel_at_period_end false persisted");
  assert(row.current_period_end === P1_ISO, "create: current_period_end persisted");
  assert(row.source === "stripe" && row.stripe_subscription_id === "sub_live", "create: stripe refs persisted");

  // 2) UPDATE — Stripe portal "Cancel": cancel_at_period_end flips true, sub stays
  //    active, renewal date advances. This is the production-reported case and the
  //    one that silently no-ops under ignore-duplicates.
  await upsertEntitlement(
    supabase,
    mapStripeSubscription(stripeSub(withPeriod(P2, { cancel_at_period_end: true })), USER),
  );
  row = read(db, USER);
  assert(db.entitlements.size === 1, "cancel: still one row (UPDATE, not a second INSERT)");
  assert(row.cancel_at_period_end === true, "cancel: cancel_at_period_end flips to TRUE on existing row");
  assert(row.current_period_end === P2_ISO, "cancel: current_period_end updated on existing row");
  assert(row.status === "active", "cancel: status stays active while set to cancel at period end");

  // 3) UPDATE — Stripe portal "Don't cancel": flips back to false.
  await upsertEntitlement(
    supabase,
    mapStripeSubscription(stripeSub(withPeriod(P2, { cancel_at_period_end: false })), USER),
  );
  row = read(db, USER);
  assert(row.cancel_at_period_end === false, "don't-cancel: cancel_at_period_end flips back to FALSE");

  // 4) UPDATE — a general status / period change persists to the existing row.
  await upsertEntitlement(
    supabase,
    mapStripeSubscription(stripeSub(withPeriod(P2, { status: "past_due" })), USER),
  );
  row = read(db, USER);
  assert(row.status === "past_due", "status-change: past_due persisted to existing row");
  assert(row.current_period_end === P2_ISO, "status-change: current_period_end persisted");

  // 5) KEEP — the cross-source revoke guard is untouched: a non-entitling RevenueCat
  //    event must NOT revoke an active Stripe entitlement; it only records the store
  //    id and leaves Stripe's fields intact.
  const db2 = new FakeDb();
  const supabase2 = fakeClient(db2);
  await upsertEntitlement(supabase2, mapStripeSubscription(stripeSub({}), USER));
  const rcRevoke: EntitlementWrite = {
    userId: USER,
    status: "expired",
    source: "app_store",
    plan: null,
    currentPeriodEnd: null,
    trialEnd: null,
    cancelAtPeriodEnd: false,
    revenuecatAppUserId: "rc_user_1",
  };
  await upsertEntitlement(supabase2, rcRevoke);
  const guarded = read(db2, USER);
  assert(guarded.status === "active", "cross-source guard: active Stripe access not revoked by RC expiry");
  assert(guarded.current_period_end === P1_ISO, "cross-source guard: Stripe period left intact");
  assert(guarded.revenuecat_app_user_id === "rc_user_1", "cross-source guard: RC id recorded for reconciliation");
  assert(guarded.stripe_subscription_id === "sub_live", "cross-source guard: Stripe id preserved");

  // 6) The reproduced production bug, end to end: a dahlia portal cancel sets a
  //    `cancel_at` timestamp while the legacy boolean stays false. The mapped write
  //    must persist cancel_at_period_end = true on the existing row.
  const db3 = new FakeDb();
  const supabase3 = fakeClient(db3);
  await upsertEntitlement(supabase3, mapStripeSubscription(stripeSub({}), USER));
  await upsertEntitlement(
    supabase3,
    mapStripeSubscription(stripeSub(withPeriod(P2, { cancel_at: P2, cancel_at_period_end: false })), USER),
  );
  const dahlia = read(db3, USER);
  assert(
    dahlia.cancel_at_period_end === true,
    "dahlia portal cancel (cancel_at set, boolean false) persists cancel_at_period_end = true",
  );

  // 7) Two near-simultaneous customer.subscription.updated events for the same user
  //    (the live repro emitted two ~1s apart) must converge on cancel = true.
  const db4 = new FakeDb();
  const supabase4 = fakeClient(db4);
  await upsertEntitlement(supabase4, mapStripeSubscription(stripeSub({}), USER));
  const cancelWrite = mapStripeSubscription(stripeSub(withPeriod(P2, { cancel_at: P2 })), USER);
  await Promise.all([
    upsertEntitlement(supabase4, cancelWrite, "evt_A"),
    upsertEntitlement(supabase4, cancelWrite, "evt_B"),
  ]);
  const concurrent = read(db4, USER);
  assert(db4.entitlements.size === 1, "concurrent: still exactly one row");
  assert(
    concurrent.cancel_at_period_end === true,
    "concurrent updated events -> final persisted cancel_at_period_end = true",
  );

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll entitlement-upsert (live update path) self-tests passed.");
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
