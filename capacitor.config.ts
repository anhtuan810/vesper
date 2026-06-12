import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "nl.volnar.app",
  appName: "Volnar",
  // The full UI ships inside the binary: a static export produced by
  // `npm run build:native` (scripts/build-native.mjs). The app boots with no
  // network and talks to https://app.volnar.nl only for data (/api/*, see
  // src/lib/api.ts) — no remote server.url, so the App Store build is a real
  // app rather than a wrapper around the website.
  webDir: "out",
  plugins: {
    // Self-managed OTA: we check, download, and stage bundles ourselves
    // (src/lib/native/ota.ts + scripts/ota-release.mjs) — no Capgo cloud.
    CapacitorUpdater: {
      autoUpdate: false,
    },
  },
  ios: {
    // "never": don't let the WKWebView scroll view auto-inset content for the
    // safe area. The web layer manages insets itself via env(safe-area-inset-*)
    // under viewport-fit=cover (NavBar pads top, BottomNav pads bottom). With
    // "always" the native inset stacked on top of the CSS inset, double-padding
    // the top so the NavBar sat ~2x the status-bar height down the screen.
    contentInset: "never",
    // Native WebView background fallback (light mode). Prevents a white flash
    // behind the web content before/around paint. Dark-mode parity comes with
    // @capacitor/status-bar in a later phase.
    backgroundColor: "#FAF6EB",
    // NOTE: limitsNavigationsToAppBoundDomains was removed with the move to
    // bundled assets — the webview now serves capacitor://localhost, which an
    // app-bound-domains allowlist would lock out. OAuth/magic-link still run
    // in the system browser via @capacitor/browser.
    //
    // Disable the long-press link preview / "Open Link" context menu — a
    // browser affordance that breaks the native feel (pairs with the
    // touch-callout CSS in globals.css).
    allowsLinkPreview: false,
  },
};

export default config;
