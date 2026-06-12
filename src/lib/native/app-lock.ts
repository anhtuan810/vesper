import { Preferences } from "@capacitor/preferences";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";
import { isNative } from "@/lib/platform";

// Face ID / Touch ID app lock — an opt-in, device-local preference (never
// synced to the server: it gates this device's screen, not the account).

const LOCK_KEY = "volnar.appLock";

export async function isAppLockEnabled(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { value } = await Preferences.get({ key: LOCK_KEY });
    return value === "1";
  } catch {
    return false;
  }
}

export async function setAppLockEnabled(enabled: boolean): Promise<void> {
  if (enabled) await Preferences.set({ key: LOCK_KEY, value: "1" });
  else await Preferences.remove({ key: LOCK_KEY });
}

export async function biometricAvailable(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    // useFallback: a device passcode counts — the lock still has value when
    // Face ID is unenrolled, and unlock never dead-ends.
    const result = await NativeBiometric.isAvailable({ useFallback: true });
    return result.isAvailable;
  } catch {
    return false;
  }
}

// Presents the system Face ID / Touch ID sheet (passcode fallback). Resolves
// false on cancel or failure — callers keep the lock screen up and offer retry.
export async function verifyIdentity(): Promise<boolean> {
  try {
    await NativeBiometric.verifyIdentity({
      reason: "Unlock Volnar",
      useFallback: true,
    });
    return true;
  } catch {
    return false;
  }
}
