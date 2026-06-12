"use client";

import { DesktopFrame } from "@/components/desktop/DesktopFrame";
import { SettingsContent } from "@/components/settings/SettingsContent";

// Dedicated Settings page, reached from the gear icon on Profile. Lives outside
// the (main) group (like /asset/[id]) and adopts the three-pane desktop shell
// via DesktopFrame; on mobile/native it renders the settings content with its
// own back header. Profile stays personal — preferences, account, Data & AI,
// and account deletion all live here.
export default function SettingsPage() {
  return (
    <DesktopFrame tab="profile">
      <SettingsContent />
    </DesktopFrame>
  );
}
