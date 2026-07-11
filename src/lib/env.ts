const SERVER_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
] as const;

export function validateEnv() {
  // `next build` imports every API route module to collect page data, which runs
  // these module-scope validateEnv() calls — so a build environment without the
  // secrets (a Vercel Preview scope, CI) hard-failed the BUILD with "Failed to
  // collect page data" instead of failing the misconfigured request at runtime.
  // Skip during the build phase (the same check Next itself uses); real requests
  // still validate and throw the clear message where it belongs.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const missing = SERVER_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
