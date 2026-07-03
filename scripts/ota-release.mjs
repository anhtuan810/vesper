// Publishes an over-the-air UI update for the native app — the "deploy"
// command for native UI changes that don't touch the Capacitor plugin set:
//
//   npm run ota:release
//
// Builds the native bundle (scripts/build-native.mjs), zips it, and uploads
// zip + manifest to the public `ota-bundles` Supabase Storage bucket. Running
// apps check the manifest on launch (src/lib/native/ota.ts) and stage the new
// bundle for their next cold start.
//
// Bundles are keyed per binary version (MARKETING_VERSION): a bundle is only
// offered to binaries it was built for, since the web assets must match the
// installed plugin set. After shipping a new binary to the App Store, run
// this again so that binary's channel exists.
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read from
// the environment or .env.local — never shipped to the client).

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUCKET = "ota-bundles";

// ── Env (process env wins; .env.local fills gaps) ────────────────────────────
function loadEnvLocal() {
  const p = path.join(ROOT, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (env or .env.local).");
  process.exit(1);
}

// ── Identify the release ─────────────────────────────────────────────────────
const pbxproj = fs.readFileSync(path.join(ROOT, "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
const binaryVersion = pbxproj.match(/MARKETING_VERSION = ([^;]+);/)?.[1]?.trim();
if (!binaryVersion) {
  console.error("Could not read MARKETING_VERSION from the Xcode project.");
  process.exit(1);
}

const sha = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
const version = `${stamp}-${sha}`;

// ── Build + zip ───────────────────────────────────────────────────────────────
execSync("npm run build:native", { cwd: ROOT, stdio: "inherit" });

const zipPath = path.join(ROOT, ".ota-bundle.zip");
fs.rmSync(zipPath, { force: true });
// Zip the *contents* of out/ so index.html sits at the archive root.
execSync(`cd out && zip -qr ${JSON.stringify(zipPath)} .`, { cwd: ROOT, shell: "/bin/bash" });
const sizeMb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);

// ── Upload ────────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Idempotent: createBucket fails harmlessly when it already exists.
await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});

const zipName = `bundle-${binaryVersion}-${version}.zip`;
const { error: zipErr } = await supabase.storage
  .from(BUCKET)
  .upload(zipName, fs.readFileSync(zipPath), { contentType: "application/zip", upsert: true });
if (zipErr) {
  console.error("Bundle upload failed:", zipErr.message);
  process.exit(1);
}

const bundleUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${zipName}`;
// `sha` lets installs skip the download when their running code (binary or
// applied bundle — each has NEXT_PUBLIC_BUILD_SHA inlined by build-native.mjs
// from the same `git rev-parse` this script uses) is already this commit.
const manifest = JSON.stringify({ version, url: bundleUrl, sha }, null, 2);
const { error: manErr } = await supabase.storage
  .from(BUCKET)
  .upload(`latest-${binaryVersion}.json`, Buffer.from(manifest), {
    contentType: "application/json",
    upsert: true,
  });
if (manErr) {
  console.error("Manifest upload failed:", manErr.message);
  process.exit(1);
}

fs.rmSync(zipPath, { force: true });
console.log(`\nOTA release published for binary ${binaryVersion}`);
console.log(`  version: ${version} (${sizeMb} MB)`);
console.log(`  bundle:  ${bundleUrl}`);
console.log("Running apps stage it on next launch and apply on the cold start after.");
