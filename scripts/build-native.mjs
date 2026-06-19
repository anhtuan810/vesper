// Builds the native (bundled-UI) target: a static export of the app that
// Capacitor packs into the iOS binary, so the App Store build is a real app
// rather than a remote-URL wrapper. The web deployment is untouched.
//
// Static export can't carry server-only segments (Request-dependent route
// handlers, cookie/redirect pages, middleware), so those are parked outside
// src/ for the duration of the build and always restored — the bundled app
// calls the production server for them instead (see src/lib/api.ts).

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PARK = path.join(ROOT, ".native-build-excluded");

// Server-only segments, relative to the repo root.
const EXCLUDED = [
  "src/app/api",          // Request-dependent route handlers — served by app.volnar.nl
  "src/app/auth",         // OAuth/magic-link callbacks — web + system-browser flows only
  "src/app/demo",         // cookie-based demo sign-in — native uses /api/demo-session
  "src/app/asset/[id]",   // legacy-URL redirect (dynamic segment, web only)
  "src/middleware.ts",    // marketing rewrite + login wall — client-side on native
  "src/app/icon.tsx",     // ImageResponse routes don't export; the native icon
  "src/app/apple-icon.tsx", // comes from the iOS asset catalog
  // Web-SEO metadata routes served only on the public domains (volnar.nl). They
  // are not statically exportable under output:"export" and the bundled app never
  // serves robots / sitemap / social-card URLs.
  "src/app/marketing/opengraph-image.tsx",
  "src/app/robots.ts",
  "src/app/sitemap.ts",
];

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "https://app.volnar.nl";

function park() {
  fs.rmSync(PARK, { recursive: true, force: true });
  for (const rel of EXCLUDED) {
    const from = path.join(ROOT, rel);
    if (!fs.existsSync(from)) continue;
    const to = path.join(PARK, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
  }
}

function restore() {
  if (!fs.existsSync(PARK)) return;
  for (const rel of EXCLUDED) {
    const from = path.join(PARK, rel);
    if (!fs.existsSync(from)) continue;
    fs.renameSync(from, path.join(ROOT, rel));
  }
  fs.rmSync(PARK, { recursive: true, force: true });
}

// Inline the build's git SHA so the running app can prove which bundle is live
// (surfaced on the paywall when NEXT_PUBLIC_OTA_DISABLED is set). Trimmed; falls
// back to "local" when git isn't available (e.g. a tarball build).
let buildSha = "local";
try {
  buildSha = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim() || "local";
} catch {
  buildSha = "local";
}
process.env.NEXT_PUBLIC_BUILD_SHA = buildSha;

park();
try {
  execSync("npx next build", {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      BUILD_TARGET: "native",
      NEXT_PUBLIC_BUILD_TARGET: "native",
      NEXT_PUBLIC_API_ORIGIN: API_ORIGIN,
    },
  });
} finally {
  restore();
}

console.log(`\nNative bundle exported to out/ (API origin: ${API_ORIGIN}).`);
console.log("Next: npx cap sync ios");
