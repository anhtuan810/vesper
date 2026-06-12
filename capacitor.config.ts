import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "nl.volnar.app",
  appName: "Volnar",
  webDir: "public",
  server: {
    url: "https://app.volnar.nl",
    cleartext: false,
    // Local branded fallback (bundled from public/) shown when the remote URL
    // fails to load — offline, DNS failure, server down. Served from the
    // capacitor://localhost bundle, so it works with no network at all; its
    // Retry button navigates back to the remote URL.
    errorPath: "offline.html",
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
    // Restrict the WKWebView's full native-bridge access to the domains listed
    // in Info.plist's WKAppBoundDomains (app.volnar.nl). OAuth/magic-link run in
    // the system browser via @capacitor/browser, so they're unaffected.
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;
