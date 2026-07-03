import { withSentryConfig } from "@sentry/nextjs";

const CSP = [
  "default-src 'self'",
  // Next.js injects inline scripts for hydration; unsafe-inline required.
  // unsafe-eval is needed by React dev-mode call stack reconstruction only.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  // Tailwind uses inline styles throughout
  "style-src 'self' 'unsafe-inline'",
  // Supabase storage (avatars, property photos) + OAuth avatar CDNs + stock/crypto logo CDNs
  "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com https://avatars.githubusercontent.com https://images.financialmodelingprep.com https://cdn.jsdelivr.net",
  // MapLibre web workers run in blob: URLs
  "worker-src blob:",
  "font-src 'self'",
  [
    "connect-src 'self'",
    // Supabase DB, Auth, Storage, Realtime
    "https://*.supabase.co wss://*.supabase.co",
    // Sentry error reporting
    "https://*.sentry.io https://*.ingest.sentry.io",
    // MapLibre vector tiles (OpenFreeMap)
    "https://tiles.openfreemap.org",
  ].join(" "),
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join("; ");

// Native target: a static export bundled into the iOS binary by Capacitor
// (scripts/build-native.mjs). headers() is unsupported under output:"export"
// (and HTTP headers don't exist for bundle-served files anyway).
const isNativeBuild = process.env.BUILD_TARGET === "native";

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  ...(isNativeBuild
    ? {
        output: "export",
        images: { unoptimized: true },
      }
    : {
        async headers() {
          return [
            {
              source: "/(.*)",
              headers: [
                { key: "Content-Security-Policy", value: CSP },
                { key: "X-Frame-Options", value: "DENY" },
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                // Force HTTPS for two years incl. subdomains (preload-eligible) —
                // a financial app should never be reachable over plaintext, even
                // once. Vercel serves HTTPS but does not send HSTS unless asked.
                { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
                // Deny powerful features the app never uses, so a future injected
                // script can't reach for them either.
                { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
              ],
            },
          ];
        },
      }),
};

export default withSentryConfig(nextConfig, {
  // Suppress build-time output; source map upload requires SENTRY_AUTH_TOKEN
  silent: true,
  disableLogger: true,
});
