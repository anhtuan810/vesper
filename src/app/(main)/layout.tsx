"use client";

import { usePathname } from "next/navigation";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";

// Shared layout for the three center views (Portfolio /, Diary, Profile). At lg/xl
// it mounts the persistent three-column shell ONCE — left Vitals rail, right
// Assistant/Chat rail, center = the active route's children. Because this layout
// persists across navigations within the group, the rails and the chat thread
// never unmount or reset; only the center swaps. Below lg it is a pass-through:
// each page renders its own mobile single-column layout exactly as before.
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const isDesktop = useIsDesktop();
  const pathname = usePathname();

  // Neutral background until the device class is known — avoids a hydration flash.
  if (isDesktop === undefined) return <div className="min-h-screen bg-bg" />;
  if (!isDesktop) return <>{children}</>;

  const tab = pathname.startsWith("/diary")
    ? "diary"
    : pathname.startsWith("/profile")
    ? "profile"
    : "portfolio";

  return <DesktopShell tab={tab}>{children}</DesktopShell>;
}
