"use client";

import { WebFrame } from "@/components/desktop/WebFrame";
import { SettingsContent } from "@/components/settings/SettingsContent";

// Dedicated Settings page, reached from the gear icon on Profile. Lives outside
// the (main) group (like /asset) and adopts the new Twilight WebShell on desktop
// web via WebFrame; on mobile/native it renders the settings content with its
// own back header. Profile stays personal — preferences, account, Data & AI,
// and account deletion all live here.
export default function SettingsPage() {
  return (
    <WebFrame tab="settings">
      <SettingsContent />
    </WebFrame>
  );
}
