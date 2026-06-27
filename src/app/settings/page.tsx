"use client";

import { SettingsContent } from "@/components/settings/SettingsContent";
import { DesktopSettings } from "@/components/overview/DesktopSettings";
import { WebShell } from "@/components/desktop/WebShell";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";

// Dedicated Settings page, reached from the gear icon on Profile. Lives outside
// the (main) group. On desktop web it adopts the new Twilight WebShell with the
// DesktopSettings content; on mobile/native it renders SettingsContent with its
// own back header. Profile stays personal — preferences, account, Data & AI,
// and account deletion all live here.
export default function SettingsPage() {
  const isDesktop = useIsDesktop();

  if (isDesktop === undefined) return <div className="min-h-screen bg-bg" />;
  if (isDesktop) {
    return (
      <WebShell tab="settings">
        <DesktopSettings />
      </WebShell>
    );
  }
  return <SettingsContent />;
}
