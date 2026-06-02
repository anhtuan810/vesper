"use client";

import type { ReactNode } from "react";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";

/**
 * Client wrapper for server-rendered pages (e.g. the asset detail route) that
 * should adopt the desktop three-pane shell at >=1024px on the web. On mobile,
 * the native app, and during SSR/first paint it renders children unchanged, so
 * the server-rendered content is preserved and there is no hydration mismatch.
 */
export function DesktopFrame({
  tab,
  children,
}: {
  tab: "portfolio" | "diary" | "profile";
  children: ReactNode;
}) {
  const isDesktop = useIsDesktop();
  if (isDesktop) return <DesktopShell tab={tab}>{children}</DesktopShell>;
  return <>{children}</>;
}
