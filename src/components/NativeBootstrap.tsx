"use client";

import { useEffect } from "react";
import { isNative } from "@/lib/platform";
import { createBrowserSupabase } from "@/lib/supabase";
import { installDeepLinkHandler } from "@/lib/native/deeplink";
import { installPushTapHandler } from "@/lib/native/push";
import { installNativePolish } from "@/lib/native/webview-polish";

// On native (Capacitor) only, wires up the auth deep-link handler so OAuth /
// magic-link flows opened in the system browser can return into the app, and
// the push-notification tap handler so notification taps route to their
// in-app destination. Renders nothing and is inert on the web.
export function NativeBootstrap() {
  useEffect(() => {
    if (!isNative()) return;
    const deepLink = installDeepLinkHandler(createBrowserSupabase());
    const pushTap = installPushTapHandler();
    const polish = installNativePolish();
    return () => {
      deepLink.then((h) => h.remove()).catch(() => {});
      pushTap.then((h) => h.remove()).catch(() => {});
      polish.then((cleanup) => cleanup()).catch(() => {});
    };
  }, []);

  return null;
}
