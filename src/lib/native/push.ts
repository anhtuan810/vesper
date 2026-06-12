import { PushNotifications } from "@capacitor/push-notifications";
import { Preferences } from "@capacitor/preferences";
import { isNative } from "@/lib/platform";
import { apiFetch } from "@/lib/api";

// Native push notifications — opt-in from Profile → Preferences. The APNs
// device token is registered with the server (per-user, per-device) so the
// daily market cron can notify; disabling deletes the token server-side.

const PUSH_KEY = "volnar.pushEnabled";
const TOKEN_KEY = "volnar.pushToken";

export async function isPushEnabled(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { value } = await Preferences.get({ key: PUSH_KEY });
    if (value !== "1") return false;
    const status = await PushNotifications.checkPermissions();
    return status.receive === "granted";
  } catch {
    return false;
  }
}

// Requests permission and registers this device's APNs token with the server.
// Resolves false when the user declines the system prompt (callers leave the
// toggle off — iOS only shows the prompt once, after which Settings owns it).
export async function enablePush(): Promise<boolean> {
  if (!isNative()) return false;

  // Throws when the installed binary predates the plugin — callers treat that
  // as "not enabled" rather than crashing the toggle.
  const status = await PushNotifications.requestPermissions();
  if (status.receive !== "granted") return false;

  // The token arrives via the 'registration' event after register(); wire the
  // listener first so it can't be missed.
  const registered = new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 10_000);
    PushNotifications.addListener("registration", (token) => {
      clearTimeout(timer);
      resolve(token.value);
    });
    PushNotifications.addListener("registrationError", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });

  await PushNotifications.register();
  const token = await registered;
  if (!token) return false;

  const res = await apiFetch("/api/push/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform: "ios" }),
  });
  if (!res.ok) return false;

  await Preferences.set({ key: PUSH_KEY, value: "1" });
  await Preferences.set({ key: TOKEN_KEY, value: token });
  return true;
}

export async function disablePush(): Promise<void> {
  if (!isNative()) return;
  try {
    const { value: token } = await Preferences.get({ key: TOKEN_KEY });
    if (token) {
      await apiFetch("/api/push/register", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    }
    await PushNotifications.unregister();
  } catch {
    // Best effort — the local flag below is the source of truth for the UI.
  }
  await Preferences.remove({ key: PUSH_KEY });
  await Preferences.remove({ key: TOKEN_KEY });
}

// Routes a notification tap to its in-app destination (payload `link` is a
// same-app path, e.g. "/diary"). Installed once from NativeBootstrap.
export async function installPushTapHandler() {
  return PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const link = action.notification.data?.link;
    if (typeof link === "string" && link.startsWith("/") && !link.startsWith("//")) {
      window.location.assign(link);
    }
  });
}
