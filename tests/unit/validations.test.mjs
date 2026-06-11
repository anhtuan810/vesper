import test from "node:test";
import assert from "node:assert/strict";
import { validatePortfolioChanges } from "../../src/lib/validations.ts";

test("validatePortfolioChanges blocks adding zero-unit positions", () => {
  assert.match(
    validatePortfolioChanges([{ action: "add", name: "Apple", units: 0 }], []) ?? "",
    /positive size/,
  );
});

test("validatePortfolioChanges blocks negative resulting units", () => {
  assert.match(
    validatePortfolioChanges(
      [{ action: "edit", name: "BTC", units: -0.1 }],
      [{ name: "BTC", symbol: "BTC-USD", type: "crypto", units: 0.05 }],
    ) ?? "",
    /negative position/,
  );
});

test("validatePortfolioChanges allows explicit removals", () => {
  assert.equal(
    validatePortfolioChanges([{ action: "remove", name: "Apple" }], [{ name: "Apple", units: 1 }]),
    null,
  );
});
