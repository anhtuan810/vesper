import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { UndoDeleteToast } from "@/components/UndoDeleteToast";
import { ThemeProvider } from "@/components/ThemeProvider";

const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-fraunces",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-plus-jakarta-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Vesper",
  description: "Your personal portfolio assistant",
};

type ThemeMode = "auto" | "light" | "dark";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("vesper.theme")?.value;
  const theme: ThemeMode =
    raw === "light" || raw === "dark" || raw === "auto" ? raw : "auto";
  const resolved = theme === "auto" ? "light" : theme;

  return (
    <html
      lang="en"
      data-theme={resolved}
      className={`${fraunces.variable} ${plusJakartaSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <ThemeProvider initialTheme={theme}>
          {children}
          <BottomNav />
          <UndoDeleteToast />
        </ThemeProvider>
      </body>
    </html>
  );
}
