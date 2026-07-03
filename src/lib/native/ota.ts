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
//   → { "version": "<stamp>-<sha>", "url": "<zip url>", "sha": "<git sha>" }
//
// "Already current" is decided without trusting the plugin's version label for
// the builtin bundle (a constant "1.0" that never matches a release label):
//   1. manifest.sha === NEXT_PUBLIC_BUILD_SHA — the running code (binary or
//      applied bundle, each with its build's git sha inlined) was built from
//      the same commit as the manifest's bundle; nothing to fetch. This is the
//      steady state right after a binary ships and its channel is opened from
//      the same commit.
//   2. manifest.version === the version this install last staged (persisted
//      via Preferences) — this release was already downloaded. Covers the
//      staged-but-not-yet-applied window, and keeps a bundle that failed to
//      boot (and was rolled back) from being re-downloaded in a loop.
//
// Safety: CapacitorUpdater auto-rolls-back to the previous bundle if
// notifyAppReady() isn't called after an update boots — a broken OTA push
// self-heals on the next launch.

// Release label (manifest.version) of the bundle this install most recently
// downloaded and handed to CapacitorUpdater.next().
const STAGED_VERSION_KEY = "ota-staged-version";

export async function installOtaUpdater(): Promise<void> {
  if (!isNative()) return;

  // Native builds ship with OTA on: scripts/build-native.mjs defaults
  // NEXT_PUBLIC_ENABLE_OTA to "true" for both the binary and OTA-bundle
  // builds. Export NEXT_PUBLIC_ENABLE_OTA=false there to build an opt-out.
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
        // Signal readiness even with OTA off: Capgo otherwise waits 10s for
        // notifyAppReady and logs a (harmless) red "Semaphore wait timed out".
        // The builtin bundle is always ready, so this just clears that noise; we
        // still reset any applied bundle back to builtin below.
        await CapacitorUpdater.notifyAppReady();
        const { bundle } = await CapacitorUpdater.current();
        if (bundle.id !== "builtin") {
          await CapacitorUpdater.reset();
        }
        // Forget the staged-version bookkeeping so a later OTA-on build starts
        // clean instead of skipping the manifest it once staged.
        const { Preferences } = await import("@capacitor/preferences");
        await Preferences.remove({ key: STAGED_VERSION_KEY });
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
    const manifest = (await res.json()) as {
      version?: string;
      url?: string;
      sha?: string;
    };
    if (!manifest.version || !manifest.url) return;

    // Already running code built from the manifest's commit (see header).
    if (manifest.sha && manifest.sha === process.env.NEXT_PUBLIC_BUILD_SHA) {
      return;
    }
    // An applied OTA bundle does carry its release label — covers manifests
    // published before the sha field existed.
    const { bundle } = await CapacitorUpdater.current();
    if (bundle.version === manifest.version) return;

    // This release was already staged by a previous launch (or rolled back —
    // don't re-download a bundle that failed to boot; the next release,
    // under a fresh label, unblocks).
    const { Preferences } = await import("@capacitor/preferences");
    const staged = await Preferences.get({ key: STAGED_VERSION_KEY });
    if (staged.value === manifest.version) return;

    const stagedBundle = await CapacitorUpdater.download({
      url: manifest.url,
      version: manifest.version,
    });
    // Activates when the app next goes to background / cold starts — never
    // yanks the UI out from under the user mid-session.
    await CapacitorUpdater.next({ id: stagedBundle.id });
    await Preferences.set({ key: STAGED_VERSION_KEY, value: manifest.version });
  } catch {
    // OTA is strictly best-effort; the bundled UI always works without it.
  }
}
