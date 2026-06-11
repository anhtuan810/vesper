import test from "node:test";
import assert from "node:assert/strict";
import { hasConfirmation, validateDestructiveRequest } from "../../src/lib/request-guard.ts";

function req(headers = {}, url = "https://app.volnar.nl/api/users/me") {
  return { url, headers: new Headers(headers) };
}

test("validateDestructiveRequest accepts same-origin destructive requests", () => {
  assert.deepEqual(
    validateDestructiveRequest(req({ origin: "https://app.volnar.nl", "sec-fetch-site": "same-origin" })),
    { ok: true },
  );
});

test("validateDestructiveRequest rejects explicit cross-site fetch metadata", () => {
  assert.deepEqual(
    validateDestructiveRequest(req({ origin: "https://evil.example", "sec-fetch-site": "cross-site" })),
    { ok: false, status: 403, error: "Cross-site request rejected" },
  );
});

test("validateDestructiveRequest rejects mismatched Origin", () => {
  assert.deepEqual(
    validateDestructiveRequest(req({ origin: "https://evil.example" })),
    { ok: false, status: 403, error: "Cross-site request rejected" },
  );
});

test("validateDestructiveRequest falls back to Referer when Origin is missing", () => {
  assert.deepEqual(
    validateDestructiveRequest(req({ referer: "https://evil.example/path" })),
    { ok: false, status: 403, error: "Cross-site request rejected" },
  );
  assert.deepEqual(
    validateDestructiveRequest(req({ referer: "https://app.volnar.nl/profile" })),
    { ok: true },
  );
});

test("hasConfirmation accepts only the expected confirmation token", () => {
  assert.equal(hasConfirmation({ confirm: "DELETE" }, "DELETE"), true);
  assert.equal(hasConfirmation({ confirm: "delete" }, "DELETE"), false);
  assert.equal(hasConfirmation(null, "DELETE"), false);
});
