import { Capacitor } from "@capacitor/core";
import { isNative } from "@/lib/platform";

// Self-managed over-the-air UI updates (Capgo updater plugin in manual mode —
// no Capgo cloud account). The binary always ships a complete, working bundle
// (the App Store requirement); on launch we check a manifest and stage newer
// static assets to apply on the next cold start.
//
// Channeling: bundles are only compatible with the binary they were built
// against (same Capacitor plugin set), so the manifest is keyed per binary
// version — latest-<binaryVersion>.json. A new binary release simply has no
// manifest until the first `npm run ota:release` after it ships.
//
// Published by scripts/ota-release.mjs to the public ota-bundles bucket:
//   {SUPABASE_URL}/storage/v1/object/public/ota-bundles/latest-<binary>.json
//   → { "version": "<id>", "url": "<zip url>" }
//
// Safety: CapacitorUpdater auto-rolls-back to the previous bundle if
// notifyAppReady() isn't called after an update boots — a broken OTA push
// self-heals on the next launch.

export async function installOtaUpdater(): Promise<void> {
  if (!isNative()) return;

  // OTA is OPT-IN and ships disabled by default, so the app runs the binary's
  // bundled (cap sync) assets. The self-managed updater is not production-ready
  // yet: the builtin version is always "1.0" and never equals the manifest's
  // "<stamp>-<sha>", so the "already current" short-circuit (below) never fires
  // and it re-downloads on every launch. Enable it with NEXT_PUBLIC_ENABLE_OTA=
  // "true" only once that's fixed (compare against the last-applied bundle, not
  // builtin).
  const otaEnabled =
    process.env.NEXT_PUBLIC_ENABLE_OTA === "1" ||
    process.env.NEXT_PUBLIC_ENABLE_OTA === "true";
  if (!otaEnabled) {
    // If a previous build applied an OTA bundle, reset the active pointer back to
    // builtin so this and the next cold start run the bundled assets. (Capgo's
    // boot path serves the binary's `public/` when the current bundle id is
    // "builtin".) Guard on id !== "builtin" to avoid a needless reload loop.
    if (Capacitor.isPluginAvailable("CapacitorUpdater")) {
      try {
        const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
        const { bundle } = await CapacitorUpdater.current();
        if (bundle.id !== "builtin") {
          await CapacitorUpdater.reset();
        }
      } catch {
        // Best-effort: the built-in bundle always works without the plugin.
      }
    }
    return;
  }

  // Binaries that predate the plugin just keep their bundled UI.
  if (!Capacitor.isPluginAvailable("CapacitorUpdater")) return;
  try {
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    await CapacitorUpdater.notifyAppReady();

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) return;

    const { App } = await import("@capacitor/app");
    const { version: binaryVersion } = await App.getInfo();

    const res = await fetch(
      `${base}/storage/v1/object/public/ota-bundles/latest-${binaryVersion}.json`,
      { cache: "no-store" },
    );
    if (!res.ok) return; // no OTA channel for this binary (yet)
    const manifest = (await res.json()) as { version?: string; url?: string };
    if (!manifest.version || !manifest.url) return;

    const { bundle } = await CapacitorUpdater.current();
    if (bundle.version === manifest.version) return; // already current

    const staged = await CapacitorUpdater.download({
      url: manifest.url,
      version: manifest.version,
    });
    // Activates when the app next goes to background / cold starts — never
    // yanks the UI out from under the user mid-session.
    await CapacitorUpdater.next({ id: staged.id });
  } catch {
    // OTA is strictly best-effort; the bundled UI always works without it.
  }
}
