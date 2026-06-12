import type { MetadataRoute } from "next";

// Served on both domains (volnar.nl skips the marketing rewrite for this
// path — see middleware). App pages are login-gated, so crawlers only ever
// see the marketing site plus redirects.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: "https://volnar.nl/sitemap.xml",
  };
}
