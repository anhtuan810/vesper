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
  },
};

export default config;
