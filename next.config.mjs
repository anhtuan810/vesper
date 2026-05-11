import { withSentryConfig } from "@sentry/nextjs";

const CSP = [
  "default-src 'self'",
  // Next.js injects inline scripts for hydration; unsafe-inline required.
  // unsafe-eval is needed by React dev-mode call stack reconstruction only.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  // Tailwind uses inline styles throughout
  "style-src 'self' 'unsafe-inline'",
  // Supabase storage (avatars, property photos) + OAuth avatar CDNs
  "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com https://avatars.githubusercontent.com",
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  async redirects() {
    return [
      { source: "/settings", destination: "/profile", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Suppress build-time output; source map upload requires SENTRY_AUTH_TOKEN
  silent: true,
  disableLogger: true,
});
