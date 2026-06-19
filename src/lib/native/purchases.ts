// Native in-app purchases via RevenueCat / StoreKit. The RevenueCat SDK is only
// ever pulled in through a runtime `import()` inside `loadPurchases()`, behind an
// isNative() guard — so the web bundle never imports the native purchase SDK and
// the native app never touches the web Stripe checkout. Types are imported with
// `import type`, which the compiler erases, so they add no runtime dependency.
//
// The appUserID is the Supabase user id, so every purchase maps to an account and
// the RevenueCat webhook writes the entitlement keyed to that user. The server
// remains the source of truth; the customerInfo here is only used for an instant,
// optimistic unlock after a purchase/restore (the webhook makes it authoritative).

import { Capacitor } from "@capacitor/core";
import { isNative, getPlatform } from "@/lib/platform";
import {
  Purchases as PurchasesSDK,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from "@revenuecat/purchases-capacitor";
import type { PlanId } from "@/lib/subscription";

function entitlementId(): string {
  return process.env.NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID || "premium";
}

// The public SDK key for the running platform. Android ships later; selecting by
// platform here means `configure` uses the correct key the moment it does, rather
// than always sending the iOS key.
function platformApiKey(): string {
  if (getPlatform() === "android") {
    const key = process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_KEY;
    if (!key) throw new Error("NEXT_PUBLIC_REVENUECAT_ANDROID_KEY is not set");
    return key;
  }
  const key = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_REVENUECAT_IOS_KEY is not set");
  return key;
}

// Runtime-only load of the SDK. Never call on the web.
async function loadPurchases() {
  // The JS proxy for "Purchases" always exists (registerPlugin returns one even
  // with no native counterpart), so if the native plugin isn't compiled into this
  // binary, its bridge calls hang forever — no native handler ever replies — which
  // surfaces as the paywall button stuck on "One moment…", with zero RevenueCat
  // logs. Fail loudly instead of hanging. This almost always means the native app
  // wasn't actually rebuilt after @revenuecat/purchases-capacitor joined the Swift
  // package set (a stale Xcode/SPM/DerivedData build): OTA ships only JS and cannot
  // add native code.
  if (!Capacitor.isPluginAvailable("Purchases")) {
    const msg =
      "RevenueCat 'Purchases' native plugin is not registered in this build — " +
      "rebuild the native app (clean build folder + npx cap sync). OTA cannot deliver native plugins.";
    console.error("[purchases]", msg);
    throw new Error(msg);
  }
  // Statically imported (top of file) rather than dynamically imported here: the
  // runtime `import("@revenuecat/purchases-capacitor")` never settled inside the
  // Capacitor webview, parking configure forever. The SDK module only calls
  // registerPlugin() at import (no browser/native globals), so it's safe in the
  // bundle; isNative()/isPluginAvailable still gate actually calling it.
  return PurchasesSDK;
}

// Reading the current offering must never be able to hang the UI. The RevenueCat
// bridge can stall indefinitely when the SDK can't reach StoreKit or — the case
// that bit us — the native plugin isn't in the running binary (e.g. a JS-only OTA
// bundle on a build that predates adding @revenuecat/purchases-capacitor). When
// that happens the paywall's purchase await never settles and the button sits on
// "One moment…" forever. Bounding the offering read turns that stall into a normal
// failure the caller already handles. We deliberately bound only offering reads,
// never `purchasePackage`, which legitimately stays pending while the user works
// the StoreKit sheet.
const OFFERINGS_TIMEOUT_MS = 15_000;

export class PurchasesTimeoutError extends Error {
  constructor(operation: string) {
    super(`RevenueCat ${operation} timed out after ${OFFERINGS_TIMEOUT_MS}ms`);
    this.name = "PurchasesTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new PurchasesTimeoutError(operation)),
      OFFERINGS_TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

let configuredFor: string | null = null;
let configurePromise: Promise<void> | null = null;

async function doConfigure(appUserId: string): Promise<void> {
  const iosKeyPresent = Boolean(process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY);
  console.log(
    `[rc] configure start appUserID=${appUserId} iosKeyPresent=${iosKeyPresent} entitlementId=${entitlementId()}`,
  );
  try {
    const Purchases = await loadPurchases();
    await Purchases.configure({ apiKey: platformApiKey(), appUserID: appUserId });
    console.log("[rc] configure ok");
  } catch (e) {
    console.error("[rc] configure FAILED", e);
    if (configuredFor === appUserId) configuredFor = null; // allow a later retry
    throw e;
  }
}

// Configures the SDK once per app user, caching the in-flight promise so it is no
// longer silently fire-and-forget: the buy handler can await `ensureConfigured()`
// instead of racing it. Reconfigures only when the signed-in user changes (e.g.
// after an account switch).
export function configurePurchases(appUserId: string): Promise<void> {
  if (!isNative()) return Promise.resolve();
  if (configuredFor === appUserId && configurePromise) return configurePromise;
  configuredFor = appUserId;
  configurePromise = doConfigure(appUserId);
  return configurePromise;
}

// Await the in-flight (or completed) RevenueCat configuration before purchasing,
// so a purchase never races an unconfigured SDK. No-op if configure never ran.
export async function ensureConfigured(): Promise<void> {
  if (configurePromise) await configurePromise;
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isNative()) return null;
  const Purchases = await loadPurchases();
  const { customerInfo } = await Purchases.getCustomerInfo();
  return customerInfo;
}

// True when the customer holds our entitlement right now — used for the instant
// optimistic unlock after purchase/restore.
export function isEntitledFromInfo(info: CustomerInfo | null | undefined): boolean {
  if (!info) return false;
  return Boolean(info.entitlements.active[entitlementId()]?.isActive);
}

// The current offering's two plans, for display and purchase. Either may be null
// if the dashboard offering is incomplete.
export interface PlanPackages {
  offering: PurchasesOffering;
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
}

export async function getPlanPackages(): Promise<PlanPackages | null> {
  if (!isNative()) return null;
  const Purchases = await loadPurchases();
  const { current } = await withTimeout(Purchases.getOfferings(), "getOfferings");
  if (!current) {
    console.log("[rc] getOfferings: no current offering");
    return null;
  }
  console.log(
    `[rc] getOfferings offering=${current.identifier} packageCount=${current.availablePackages.length} packages=[${current.availablePackages
      .map((p) => p.identifier)
      .join(", ")}]`,
  );
  return { offering: current, monthly: current.monthly, annual: current.annual };
}

// Purchases a specific package and returns the resulting customerInfo. Throws on
// a real failure; callers treat a user cancellation as a no-op.
export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const Purchases = await loadPurchases();
  console.log(`[rc] purchasePackage id=${pkg.identifier}`);
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    console.log(`[rc] purchasePackage ok id=${pkg.identifier}`);
    return customerInfo;
  } catch (e) {
    console.error("[rc] purchasePackage FAILED", e);
    throw e;
  }
}

// Resolves the chosen plan's package from the current offering, then purchases it.
export async function purchasePlan(plan: PlanId): Promise<CustomerInfo> {
  const packages = await getPlanPackages();
  const pkg = plan === "annual" ? packages?.annual : packages?.monthly;
  if (!pkg) throw new Error(`No RevenueCat package available for the ${plan} plan`);
  return purchasePackage(pkg);
}

export async function restorePurchases(): Promise<CustomerInfo> {
  const Purchases = await loadPurchases();
  const { customerInfo } = await Purchases.restorePurchases();
  return customerInfo;
}

// RevenueCat surfaces user cancellation via a flag on the thrown error; callers
// use this to stay silent (per the App Store HIG) instead of showing an error.
export function isPurchaseCancelled(err: unknown): boolean {
  return Boolean((err as { code?: string; userCancelled?: boolean })?.userCancelled);
}
