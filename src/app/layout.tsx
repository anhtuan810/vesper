import type { Metadata } from "next";
import { Source_Serif_4, Albert_Sans, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { UndoDeleteToast } from "@/components/UndoDeleteToast";
import { ThemeProvider } from "@/components/ThemeProvider";
import { UserProvider } from "@/components/UserProvider";

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

type ThemeMode = "auto" | "light" | "dark";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("volnar.theme")?.value;
  const theme: ThemeMode =
    raw === "light" || raw === "dark" || raw === "auto" ? raw : "auto";
  const resolved = theme === "auto" ? "light" : theme;

  return (
    <html
      lang="en"
      data-theme={resolved}
      className={`${sourceSerif.variable} ${albertSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <ThemeProvider initialTheme={theme}>
          <UserProvider>
            {children}
            <BottomNav />
            <UndoDeleteToast />
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
