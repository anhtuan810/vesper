import test from "node:test";
import assert from "node:assert/strict";
import { convertCurrency } from "../../src/lib/currency-convert.ts";

test("convertCurrency returns the input unchanged for same-currency conversion", () => {
  assert.equal(convertCurrency(1234.56, "EUR", "EUR", {}), 1234.56);
});

test("convertCurrency performs a direct USD-based cross-rate", () => {
  const rates = { EUR: 0.8, GBP: 0.5 };
  assert.equal(convertCurrency(80, "EUR", "USD", rates), 100);
  assert.equal(convertCurrency(100, "USD", "GBP", rates), 50);
  assert.equal(convertCurrency(80, "EUR", "GBP", rates), 50);
});

test("convertCurrency returns null when a required non-USD rate is missing", () => {
  assert.equal(convertCurrency(100, "CHF", "EUR", { EUR: 0.9 }), null);
  assert.equal(convertCurrency(100, "EUR", "CHF", { EUR: 0.9 }), null);
});
