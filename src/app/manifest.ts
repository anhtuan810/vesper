import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Volnar",
    short_name: "Volnar",
    description: "Quiet confidence over your portfolio.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FAF6EB",
    theme_color: "#FAF6EB",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
