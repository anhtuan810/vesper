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

  // Hide the keyboard accessory bar ("^ v Done") — a pure-webview affordance —
  // and drive the data-kb flag from native keyboard events so the BottomNav
  // hides while typing (the web's visualViewport detection doesn't fire here:
  // the Keyboard plugin resizes the whole webview, so the visual viewport
  // never shrinks relative to the layout viewport).
  // Guarded: installed binaries may predate the Keyboard plugin.
  const kbCleanups: Array<() => void> = [];
  if (Capacitor.isPluginAvailable("Keyboard")) {
    try {
      const { Keyboard } = await import("@capacitor/keyboard");
      await Keyboard.setAccessoryBarVisible({ isVisible: false });
      const show = await Keyboard.addListener("keyboardWillShow", () => {
        document.documentElement.dataset.kb = "open";
      });
      const hide = await Keyboard.addListener("keyboardWillHide", () => {
        document.documentElement.dataset.kb = "";
      });
      kbCleanups.push(() => show.remove(), () => hide.remove());
    } catch {
      // Cosmetic — never block bootstrap on it.
    }
  }

  // iOS-style edge-swipe back: a horizontal drag starting at the left screen
  // edge navigates back (SPA — Next intercepts popstate). A no-op when there
  // is no history entry to go back to, so it is safe on root pages.
  const EDGE_PX = 28;
  const TRIGGER_PX = 60;
  let swipe: { x: number; y: number } | null = null;
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    swipe = t && t.clientX <= EDGE_PX ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (!swipe) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - swipe.x;
    const dy = Math.abs(t.clientY - swipe.y);
    if (dy > 40) { swipe = null; return; } // vertical scroll, not a back swipe
    if (dx > TRIGGER_PX) {
      swipe = null;
      window.history.back();
    }
  };
  const onTouchEnd = () => { swipe = null; };
  document.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchmove", onTouchMove, { passive: true });
  document.addEventListener("touchend", onTouchEnd, { passive: true });
  kbCleanups.push(() => {
    document.removeEventListener("touchstart", onTouchStart);
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("touchend", onTouchEnd);
  });

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
  return () => {
    document.removeEventListener("click", onClick, true);
    for (const c of kbCleanups) c();
  };
}
