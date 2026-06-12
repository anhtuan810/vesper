import type { MetadataRoute } from "next";

// Marketing pages only — the app behind app.volnar.nl is login-gated.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://volnar.nl/", changeFrequency: "weekly", priority: 1 },
    { url: "https://volnar.nl/privacy", changeFrequency: "monthly", priority: 0.3 },
    { url: "https://volnar.nl/terms", changeFrequency: "monthly", priority: 0.3 },
  ];
}
