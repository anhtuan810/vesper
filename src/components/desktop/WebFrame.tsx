"use client";

import type { ReactNode } from "react";
import { WebShell, type WebTab } from "@/components/desktop/WebShell";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";

/**
 * Client wrapper for top-level pages (settings, asset detail, vitals) that live
 * outside the (main) group but should adopt the WebShell on desktop web. On
 * mobile, the native app, and during SSR/first paint it renders children
 * unchanged — no hydration mismatch, mobile untouched.
 */
export function WebFrame({ tab, children }: { tab: WebTab; children: ReactNode }) {
  const isDesktop = useIsDesktop();
  if (isDesktop) return <WebShell tab={tab}>{children}</WebShell>;
  return <>{children}</>;
}
