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

  // Debug kill-switch for deterministic on-device builds. When
  // NEXT_PUBLIC_OTA_DISABLED is truthy ("1"/"true") we skip the manifest check,
  // download, and apply entirely, and — if an OTA bundle is currently applied —
  // reset the active-bundle pointer back to builtin. Capgo's native boot path
  // (CapacitorUpdaterPlugin.load → setServerBasePath) serves the binary's bundled
  // `public/` whenever the current bundle id is "builtin", so this and every
  // subsequent cold start run the freshly built native bundle.
  if (
    process.env.NEXT_PUBLIC_OTA_DISABLED === "1" ||
    process.env.NEXT_PUBLIC_OTA_DISABLED === "true"
  ) {
    if (Capacitor.isPluginAvailable("CapacitorUpdater")) {
      try {
        const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
        const { bundle } = await CapacitorUpdater.current();
        // Only reset when a downloaded bundle is live: reset() reverts the
        // pointer to builtin and reloads, so guarding on this avoids a reload
        // loop when builtin is already active (e.g. a fresh install).
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
