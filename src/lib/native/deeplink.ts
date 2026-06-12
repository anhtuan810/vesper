import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { createBrowserSupabase } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createBrowserSupabase>;

// Only allow same-app relative redirects, mirroring the server callback/confirm routes.
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

// Custom-scheme URLs (nl.volnar.app://auth/callback) parse with the host as the
// first segment, so reconstruct host + pathname to recover the logical route.
function routeOf(url: URL): string {
  return `${url.host}${url.pathname}`.replace(/\/+$/, "");
}

// Installs the deep-link handler that completes native auth flows started in the
// system browser. signInWith*Native open the browser; the OS hands the result
// back to the app via the nl.volnar.app:// scheme, which lands here.
// `navigate` must be an SPA navigation (Next router) — a full document load of
// a non-root path would be served the root index.html by Capacitor's asset
// handler in the bundled app.
export function installDeepLinkHandler(supabase: SupabaseClient, navigate: (path: string) => void) {
  return App.addListener("appUrlOpen", async (event: URLOpenListenerEvent) => {
    let url: URL;
    try {
      url = new URL(event.url);
    } catch {
      return;
    }

    const route = routeOf(url);
    const next = safeNext(url.searchParams.get("next"));

    // Diagnostics: log route + presence flags only, never the code/token_hash
    // (those are sensitive). Visible in the Xcode console while validating the
    // native flow.
    console.log(
      `[native auth] appUrlOpen route="${route}" hasCode=${url.searchParams.has("code")} hasTokenHash=${url.searchParams.has("token_hash")}`
    );

    // Browser.close() rejects when no in-app browser is open (e.g. magic links
    // tapped in Mail) — never let that block the navigation that follows.
    const closeBrowser = () => Browser.close().catch(() => {});

    try {
      if (route.endsWith("auth/callback")) {
        const code = url.searchParams.get("code");
        if (!code) return;
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        console.log("[native auth] callback ok, navigating to", next);
        await closeBrowser();
        navigate(next);
        return;
      }

      if (route.endsWith("auth/confirm")) {
        const token_hash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type") as EmailOtpType | null;
        if (!token_hash || !type) return;
        const { error } = await supabase.auth.verifyOtp({ token_hash, type });
        if (error) throw error;
        console.log("[native auth] confirm ok, navigating to", next);
        await closeBrowser();
        navigate(next);
        return;
      }
    } catch (err) {
      console.error("[native auth] deep link failed", err);
      await closeBrowser();
      // Land the user somewhere actionable instead of a stuck blank view.
      navigate("/login?error=native_auth_failed");
    }
  });
}
