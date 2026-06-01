import type { Metadata, Viewport } from "next";
import { Source_Serif_4, Albert_Sans, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { UndoDeleteToast } from "@/components/UndoDeleteToast";
import { ThemeProvider } from "@/components/ThemeProvider";
import { UserProvider } from "@/components/UserProvider";
import { NativeBootstrap } from "@/components/NativeBootstrap";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-serif",
  display: "swap",
});

const albertSans = Albert_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Volnar",
  description: "Your personal portfolio assistant",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Extend the layout into the safe-area insets so env(safe-area-inset-*)
  // resolves to real values (needed by the bottom nav on notched iOS devices).
  viewportFit: "cover",
  // Native WebView background fallback (light mode). Dark-mode parity comes
  // with @capacitor/status-bar in a later phase.
  themeColor: "#FAF6EB",
};

type ThemeMode = "light" | "dark";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("volnar.theme")?.value;
  const theme: ThemeMode = raw === "dark" ? "dark" : "light";

  const headersList = await headers();
  const isMarketing = headersList.get("x-volnar-domain") === "marketing";

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${sourceSerif.variable} ${albertSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <ThemeProvider initialTheme={theme}>
          <UserProvider>
            <div className="mx-auto w-full max-w-[720px] px-5">
              {children}
            </div>
            {!isMarketing && <BottomNav />}
            {!isMarketing && <UndoDeleteToast />}
          </UserProvider>
        </ThemeProvider>
        <NativeBootstrap />
        <Analytics />
      </body>
    </html>
  );
}
