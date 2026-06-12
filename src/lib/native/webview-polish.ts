import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { isNative } from "@/lib/platform";

// One-time webview polish so the shell behaves like a native app rather than a
// browser. Installed from NativeBootstrap; no-op on the web.
export async function installNativePolish(): Promise<() => void> {
  if (!isNative()) return () => {};

  // Scopes native-only CSS (tap highlight, touch callout, selection, drag —
  // see globals.css).
  document.documentElement.classList.add("native-app");

  // Hide the keyboard accessory bar ("^ v Done") — a pure-webview affordance.
  // Guarded: installed binaries may predate the Keyboard plugin.
  if (Capacitor.isPluginAvailable("Keyboard")) {
    try {
      const { Keyboard } = await import("@capacitor/keyboard");
      await Keyboard.setAccessoryBarVisible({ isVisible: false });
    } catch {
      // Cosmetic — never block bootstrap on it.
    }
  }

  // Open external links in the in-app browser sheet (SFSafariViewController),
  // the way native apps do, instead of navigating the webview off the app
  // domain (which app-bound domains would break anyway). Capture phase so it
  // wins over React handlers; mailto:/tel: fall through to the system.
  const onClick = (event: MouseEvent) => {
    const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
    if (!anchor) return;
    let url: URL;
    try {
      url = new URL((anchor as HTMLAnchorElement).href, window.location.href);
    } catch {
      return;
    }
    if (!/^https?:$/.test(url.protocol)) return;
    if (url.origin === window.location.origin) return;
    event.preventDefault();
    Browser.open({ url: url.href }).catch(() => {});
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}
