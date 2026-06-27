"use client";

import { usePathname } from "next/navigation";
import { WebShell, type WebTab } from "@/components/desktop/WebShell";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";

// Shared layout for the three center views (Portfolio /, Diary, Profile). On
// desktop web it mounts the new Twilight two-column WebShell ONCE — the top nav,
// the active route's content (children), and the persistent chat rail. Because
// this layout persists across navigations within the group, the rail and chat
// thread never unmount or reset; only the content swaps. Below lg it is a
// pass-through: each page renders its own mobile single-column layout as before.
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const isDesktop = useIsDesktop();
  const pathname = usePathname();

  // Neutral background until the device class is known — avoids a hydration flash.
  if (isDesktop === undefined) return <div className="min-h-screen bg-bg" />;
  if (!isDesktop) return <>{children}</>;

  const tab: WebTab = pathname.startsWith("/diary")
    ? "journal"
    : pathname.startsWith("/profile")
    ? "profile"
    : "overview";

  return <WebShell tab={tab}>{children}</WebShell>;
}
