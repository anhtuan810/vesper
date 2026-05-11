import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  async redirects() {
    return [
      { source: "/settings", destination: "/profile", permanent: true },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Suppress build-time output; source map upload requires SENTRY_AUTH_TOKEN
  silent: true,
  disableLogger: true,
});
