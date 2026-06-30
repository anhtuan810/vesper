import type { Metadata, Viewport } from "next";
import { Spectral, Inter, IBM_Plex_Mono } from "next/font/google";
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
// page read as one continuous brand: Spectral (serif display — the big money
// figures, headings and italic notes via var(--serif)/font-serif), Inter (body
// via --sans), and IBM Plex Mono (the numeric/label detail via --mono).
// globals.css maps the roles to these three variables, so every surface adopts
// them without touching markup. The marketing page declares the same trio under
// its scoped --mkt-*. Spectral is a static-weight family (no variable opsz
// axis), so weights + italic are loaded explicitly; any leftover
// `font-variation-settings: 'opsz' …` is simply ignored and renders normally.
const spectral = Spectral({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
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
  // (Nocturne cool slate-paper light / near-black slate dark).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8FA" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1116" },
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

// Web only: /demo sets a `volnar_demo_reseed` cookie when it reseeds the demo
// account. The shared-account demo reuses one user id across entries, so the
// per-user localStorage chat cache (use-chat-session) and the sessionStorage
// figure mirrors survive the server-side wipe and a stale conversation/value
// would resurface in a "fresh" demo. The chat hook reads localStorage in a mount
// effect (which fires before any ancestor React effect could purge it), so the
// clear has to run pre-hydration — like the theme script above. Matches the chat
// (localStorage) + `volnar`/`vitals.` (sessionStorage) keys purgeClientCaches
// clears, but never `volnar.theme` or the demo cookies. Consumes the cookie so it
// only fires once per entry; the short Max-Age caps it if the clear ever throws.
const DEMO_RESEED_PURGE_SCRIPT =
  `try{if(document.cookie.indexOf("volnar_demo_reseed=")!==-1){` +
  `for(var i=localStorage.length-1;i>=0;i--){var k=localStorage.key(i);` +
  `if(k&&(k.indexOf("volnar.chat.history.")===0||k.indexOf("volnar_chat_history_")===0)){localStorage.removeItem(k);}}` +
  `for(var j=sessionStorage.length-1;j>=0;j--){var s=sessionStorage.key(j);` +
  `if(s&&(s.indexOf("volnar")===0||s.indexOf("vitals.")===0)){sessionStorage.removeItem(s);}}` +
  `document.cookie="volnar_demo_reseed=; Max-Age=0; path=/";}}catch(e){}`;

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
      className={`${spectral.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning={isNativeBuild}
    >
      <body className="min-h-full flex flex-col bg-bg text-fg">
        {isNativeBuild && (
          <script dangerouslySetInnerHTML={{ __html: NATIVE_THEME_SCRIPT }} />
        )}
        {!isNativeBuild && (
          <script dangerouslySetInnerHTML={{ __html: DEMO_RESEED_PURGE_SCRIPT }} />
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
