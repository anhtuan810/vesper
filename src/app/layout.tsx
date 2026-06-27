import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { UndoDeleteToast } from "@/components/UndoDeleteToast";
import { VitalsPrefetch } from "@/components/VitalsPrefetch";
import { ThemeProvider } from "@/components/ThemeProvider";
import { UserProvider } from "@/components/UserProvider";
import { SubscriptionProvider } from "@/components/SubscriptionProvider";
import { Paywall } from "@/components/Paywall";
import { AppGate } from "@/components/AppGate";
import { DemoBanner } from "@/components/DemoBanner";
import { DemoExpiryWall } from "@/components/DemoExpiryWall";
import { AiConsentGate } from "@/components/AiConsentGate";
import { NativeBootstrap } from "@/components/NativeBootstrap";
import { AppLock } from "@/components/AppLock";
import { PreloadResources } from "@/components/PreloadResources";

// Brand typography, shared with the marketing landing page so the app and the
// page read as one continuous brand: Fraunces (serif display — the big money
// figures and headings via var(--serif)/font-serif), Inter (body via --sans),
// and IBM Plex Mono (the numeric/label detail via --mono). globals.css maps the
// roles to these three variables, so every surface adopts them without touching
// markup. The marketing page declares the same trio under its scoped --mkt-*.
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Volnar", template: "%s · Volnar" },
  description:
    "Quiet confidence over your portfolio — everything you own, in one calm place.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Shrink the layout viewport when the soft keyboard opens so fixed/flex-bottom
  // elements (the chat composer) ride above it instead of being covered.
  interactiveWidget: "resizes-content",
  // Extend the layout into the safe-area insets so env(safe-area-inset-*)
  // resolves to real values (needed by the bottom nav on notched iOS devices).
  viewportFit: "cover",
  // Native WebView background fallback / browser chrome tint. Matches --bg
  // (twilight paper light / near-black indigo dark).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F3ECE0" },
    { media: "(prefers-color-scheme: dark)", color: "#14141E" },
  ],
};

type ThemeMode = "light" | "dark";

// Native (static-export) build: no request, so no cookies()/headers() — both
// are unsupported under output:"export". Theme comes from localStorage via the
// pre-paint inline script below; the marketing chrome never applies in-app.
const isNativeBuild = process.env.NEXT_PUBLIC_BUILD_TARGET === "native";

// Sets data-theme before first paint so a dark-mode user doesn't get a light
// flash on cold start. ThemeProvider initializes from the same key.
const NATIVE_THEME_SCRIPT =
  `try{var t=localStorage.getItem("volnar.theme");if(t==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let theme: ThemeMode = "light";
  let isMarketing = false;
  if (!isNativeBuild) {
    const cookieStore = await cookies();
    const raw = cookieStore.get("volnar.theme")?.value;
    theme = raw === "dark" ? "dark" : "light";

    const headersList = await headers();
    isMarketing = headersList.get("x-volnar-domain") === "marketing";
  }

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${fraunces.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning={isNativeBuild}
    >
      <body className="min-h-full flex flex-col bg-bg text-fg">
        {isNativeBuild && (
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script dangerouslySetInnerHTML={{ __html: NATIVE_THEME_SCRIPT }} />
        )}
        <PreloadResources />
        <ThemeProvider initialTheme={theme}>
          <UserProvider>
            <SubscriptionProvider>
              {/* Marketing pages lay themselves out full-bleed (hero, ticker,
                  dark bands); only the app gets the centered reading column. */}
              {isMarketing ? (
                children
              ) : (
                <div className="mx-auto w-full max-w-[720px] px-5">
                  {children}
                </div>
              )}
              {!isMarketing && <BottomNav />}
              {!isMarketing && <UndoDeleteToast />}
              {!isMarketing && <VitalsPrefetch />}
              {!isMarketing && <AiConsentGate />}
              {/* Paywall-first access gate. Inert on marketing/login, while
                  loading, signed out, or entitled. */}
              {!isMarketing && <Paywall />}
              {/* Quiet demo-account notice (web: + Subscribe link). Inert unless
                  the entitlement is the seeded demo (SubscriptionView.isDemo). */}
              {!isMarketing && <DemoBanner />}
              {/* Walls an ended demo session and routes to account creation +
                  the 7-day-trial paywall. Inert unless isDemo and expired. */}
              {!isMarketing && <DemoExpiryWall />}
              {/* Covers the app during auth/subscription transitions so the main
                  surfaces never flash before the access decision (login →
                  Paywall) or during sign-out (→ /login). */}
              {!isMarketing && <AppGate />}
            </SubscriptionProvider>
          </UserProvider>
        </ThemeProvider>
        <NativeBootstrap />
        <AppLock />
        {/* Vercel Analytics has no collector at capacitor://localhost. */}
        {!isNativeBuild && <Analytics />}
      </body>
    </html>
  );
}
