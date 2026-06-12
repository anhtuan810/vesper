"use client";

import ReactDOM from "react-dom";

// Resource hints, per the Next.js metadata guidance (resource hints are not
// part of the Metadata API — ReactDOM methods insert them into <head>).
// Supabase is hit immediately after hydration (auth + REST from UserProvider),
// so pre-warming DNS+TCP+TLS shaves a round-trip off first data paint. The
// logo CDNs are no-CORS image fetches; DNS prefetch is the right weight there.
export function PreloadResources() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    // Supabase calls are CORS fetches — the preconnected socket is only
    // reusable for them when opened in CORS mode.
    ReactDOM.preconnect(supabaseUrl, { crossOrigin: "anonymous" });
  }
  ReactDOM.prefetchDNS("https://images.financialmodelingprep.com");
  ReactDOM.prefetchDNS("https://cdn.jsdelivr.net");
  return null;
}
