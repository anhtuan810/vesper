import type { Metadata } from "next";
import type { ReactNode } from "react";

const TITLE = "Volnar — A decision journal for your wealth";
const DESCRIPTION =
  "A private decision journal for your wealth. You record why you bought in one " +
  "sentence; when the market moves your money, Volnar records that itself. " +
  "EU-hosted, no bank sync, no advice.";

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
