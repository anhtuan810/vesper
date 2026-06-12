"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNative } from "@/lib/platform";
import { createBrowserSupabase } from "@/lib/supabase";
import { installDeepLinkHandler } from "@/lib/native/deeplink";
import { installPushTapHandler } from "@/lib/native/push";
import { installNativePolish } from "@/lib/native/webview-polish";
import { installOtaUpdater } from "@/lib/native/ota";

// On native (Capacitor) only, wires up the auth deep-link handler so OAuth /
// magic-link flows opened in the system browser can return into the app, and
// the push-notification tap handler so notification taps route to their
// in-app destination. Renders nothing and is inert on the web.
export function NativeBootstrap() {
  const router = useRouter();
  useEffect(() => {
    if (!isNative()) return;
    // SPA navigation for everything programmatic: in the bundled app, a full
    // document load of any non-root path is served the root index.html.
    const navigate = (path: string) => router.replace(path);
    const deepLink = installDeepLinkHandler(createBrowserSupabase(), navigate);
    const pushTap = installPushTapHandler(navigate);
    const polish = installNativePolish();
    // Fire-and-forget: confirms this launch is healthy (the updater's rollback
    // safety net) and stages any newer OTA bundle for the next cold start.
    installOtaUpdater();
    return () => {
      deepLink.then((h) => h.remove()).catch(() => {});
      pushTap.then((h) => h.remove()).catch(() => {});
      polish.then((cleanup) => cleanup()).catch(() => {});
    };
  }, [router]);

  return null;
}
