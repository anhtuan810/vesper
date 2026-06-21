// Behaviour-test runner. Executes every deterministic suite (scripts/verify-*.ts)
// and fails if any one fails. Each verify-* file is pure (no network/DB/LLM) and
// exits non-zero on a failed assertion, so this is a fast, hermetic guard that
// the app's intended behaviours still hold. Run:  npm test
//
// New behaviour suites are picked up automatically: drop a `verify-<name>.ts`
// into scripts/ that asserts and `process.exit(1)` on failure, and it runs here
// and in CI with no extra wiring.

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const tsxBin = join(scriptsDir, "..", "node_modules", ".bin", "tsx");

const files = readdirSync(scriptsDir)
  .filter((f) => f.startsWith("verify-") && f.endsWith(".ts"))
  .sort();

if (files.length === 0) {
  console.error("No verify-*.ts suites found in scripts/.");
  process.exit(1);
}

const failed = [];
for (const f of files) {
  const res = spawnSync(tsxBin, [join(scriptsDir, f)], { encoding: "utf8" });
  const ok = res.status === 0;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${f}`);
  if (!ok) {
    failed.push(f);
    // Surface the failing suite's full output so CI logs show exactly what broke.
    if (res.stdout) process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
  }
}

console.log("\n" + "=".repeat(60));
if (failed.length === 0) {
  console.log(`✓ all ${files.length} behaviour suites passed`);
  process.exit(0);
}
console.log(`✗ ${failed.length}/${files.length} suite(s) failed:`);
for (const f of failed) console.log(`   - ${f}`);
process.exit(1);
