import type { Metadata } from "next";
import type { ReactNode } from "react";

const TITLE = "Volnar — Wealth. Watched over.";
const DESCRIPTION =
  "Everything you own — property, stocks, pensions, crypto — in one calm place, " +
  "with a quiet eye on the market events that move it. Private by design, EU-hosted.";

// Marketing pages are served at volnar.nl via the middleware rewrite, so
// absolute URLs (canonical, og:image) must resolve against the marketing
// domain, not the route path the app sees internally.
export const metadata: Metadata = {
  metadataBase: new URL("https://volnar.nl"),
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Volnar",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return children;
}
