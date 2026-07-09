// Unit tests for the market-story cache's pure helpers (no network/DB/LLM).
// Run:  npx tsx scripts/verify-market-story.ts
//
// Covers the two decisions that must stay correct for the "story behind" a market
// swing to be safe and cheap:
//   • parseStoryResponse — a malformed reply THROWS (so a transient hiccup is
//     never cached as a permanent "no cause"); a deliberate {"reason": null} is a
//     clean "no story"; a valid string is trimmed/unwrapped; an over-long ramble
//     is dropped rather than truncated mid-sentence.
//   • pendingStoryTargets — only un-cached (date, symbol) pairs are generated,
//     deduped, asset-relevant entries FIRST (the feature's explicit priority),
//     then newest date first, capped at the limit.

import {
  parseStoryResponse,
  pendingStoryTargets,
  storyKey,
  type StoryTarget,
} from "../src/lib/market-story-cache";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

console.log("parseStoryResponse:");
{
  check(
    "a plain reason string is returned trimmed",
    parseStoryResponse('{"reason": "Shares jumped after a strong earnings beat."}').story ===
      "Shares jumped after a strong earnings beat.",
  );
  check(
    "explicit null reason → { story: null } (a cacheable 'no cause')",
    parseStoryResponse('{"reason": null}').story === null,
  );
  check(
    "missing reason key → { story: null }",
    parseStoryResponse("{}").story === null,
  );
  check(
    "surrounding quotes/whitespace are stripped",
    parseStoryResponse('{"reason": "  \\"Prices slid amid a broad risk-off move.\\"  "}').story ===
      "Prices slid amid a broad risk-off move.",
  );
  check(
    "JSON wrapped in prose/code-fence is salvaged",
    parseStoryResponse('```json\n{"reason": "Oil rallied on supply cuts."}\n```').story ===
      "Oil rallied on supply cuts.",
  );
  check(
    "an empty reason string → { story: null }",
    parseStoryResponse('{"reason": "   "}').story === null,
  );
  {
    const long = "x".repeat(400);
    check(
      "an over-long reason is dropped, not truncated",
      parseStoryResponse(`{"reason": "${long}"}`).story === null,
    );
  }
  check(
    "a non-string, non-null reason → { story: null }",
    parseStoryResponse('{"reason": 42}').story === null,
  );
  check(
    "a malformed (non-JSON) reply THROWS so it is not cached",
    throws(() => parseStoryResponse("the market fell because reasons")),
  );
}

console.log("\npendingStoryTargets:");
{
  const t = (date: string, symbol: string, kind: "index" | "asset"): StoryTarget => ({
    date,
    symbol,
    label: symbol,
    kind,
    pctChange: kind === "asset" ? -6.9 : 2.4,
  });

  const targets: StoryTarget[] = [
    t("2025-09-20", "^IXIC", "index"),
    t("2025-09-25", "ETH", "asset"),
    t("2025-09-22", "^GSPC", "index"),
    t("2025-09-10", "BTC", "asset"),
    t("2025-09-20", "^IXIC", "index"), // duplicate of the first
  ];

  // Nothing cached yet, generous limit → asset entries first, then newest date first.
  const all = pendingStoryTargets(targets, new Set(), 10);
  check("dedupes (date, symbol)", all.length === 4, `got ${all.length}`);
  check(
    "asset entries come before index entries",
    all[0].kind === "asset" && all[1].kind === "asset",
    all.map((x) => `${x.kind}:${x.symbol}`).join(", "),
  );
  check(
    "within a kind, newest date first (ETH 09-25 before BTC 09-10)",
    all[0].symbol === "ETH" && all[1].symbol === "BTC",
  );
  check(
    "index entries follow, newest first (^GSPC 09-22 before ^IXIC 09-20)",
    all[2].symbol === "^GSPC" && all[3].symbol === "^IXIC",
  );

  // Already-resolved pairs (incl. a cached 'no cause' row) are skipped.
  const resolved = new Set([storyKey("2025-09-25", "ETH"), storyKey("2025-09-20", "^IXIC")]);
  const remaining = pendingStoryTargets(targets, resolved, 10);
  check(
    "resolved pairs are excluded",
    remaining.length === 2 && !remaining.some((x) => x.symbol === "ETH" || x.symbol === "^IXIC"),
    remaining.map((x) => x.symbol).join(", "),
  );

  // The per-pass cap bounds the number generated (cost control).
  check("respects the limit", pendingStoryTargets(targets, new Set(), 1).length === 1);
  check("a zero limit yields nothing", pendingStoryTargets(targets, new Set(), 0).length === 0);
}

console.log("\n" + "=".repeat(56));
if (failures > 0) {
  console.error(`✗ ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("✓ all market-story helper assertions passed");
