import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "nl.volnar.app",
  appName: "Volnar",
  webDir: "public",
  server: {
    url: "https://app.volnar.nl",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
    // Native WebView background fallback (light mode). Prevents a white flash
    // behind the web content before/around paint. Dark-mode parity comes with
    // @capacitor/status-bar in a later phase.
    backgroundColor: "#FAF6EB",
  },
};

export default config;
