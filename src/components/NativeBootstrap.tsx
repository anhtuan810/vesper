"use client";

import { useEffect } from "react";
import { isNative } from "@/lib/platform";
import { createBrowserSupabase } from "@/lib/supabase";
import { installDeepLinkHandler } from "@/lib/native/deeplink";

// On native (Capacitor) only, wires up the auth deep-link handler so OAuth /
// magic-link flows opened in the system browser can return into the app.
// Renders nothing and is inert on the web.
export function NativeBootstrap() {
  useEffect(() => {
    if (!isNative()) return;
    const handle = installDeepLinkHandler(createBrowserSupabase());
    return () => {
      handle.then((h) => h.remove()).catch(() => {});
    };
  }, []);

  return null;
}
