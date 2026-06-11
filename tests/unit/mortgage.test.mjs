import test from "node:test";
import assert from "node:assert/strict";
import { computeCurrentBalance } from "../../src/lib/mortgage.ts";

test("computeCurrentBalance returns zero for non-real-estate assets", () => {
  assert.equal(computeCurrentBalance({ type: "cash", mortgage_balance: 100000 }), 0);
});

test("computeCurrentBalance keeps interest-only mortgages flat", () => {
  const balance = computeCurrentBalance({
    type: "real_estate",
    mortgage_balance: 300000,
    mortgage_balance_recorded_at: "2024-01-01T00:00:00Z",
    mortgage_rate: 4,
    monthly_payment: 1500,
    mortgage_type: "interest_only",
  }, new Date("2025-01-01T00:00:00Z"));
  assert.equal(balance, 300000);
});

test("computeCurrentBalance amortizes linear mortgages by fixed principal", () => {
  const balance = computeCurrentBalance({
    type: "real_estate",
    mortgage_balance: 120000,
    mortgage_balance_recorded_at: "2024-01-01T00:00:00Z",
    mortgage_rate: 0,
    monthly_payment: 1000,
    mortgage_type: "linear",
  }, new Date("2024-07-01T00:00:00Z"));
  assert.equal(balance, 114000);
});
