// Native in-app purchases via RevenueCat / StoreKit. The SDK is statically
// imported and only ever exercised behind isNative() guards, so the native app
// never touches the web Stripe checkout (and the web build never calls it).
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

// Returns the statically-imported RevenueCat plugin proxy.
//
// MUST stay synchronous and its result MUST NOT be awaited. The Capacitor plugin
// proxy is a *thenable*: its `get` trap has no case for `then`, so `proxy.then`
// returns a plugin-method wrapper. Awaiting the proxy (`await loadPurchases()`, or
// returning it from an `async` function) makes the runtime call
// `proxy.then(resolve, reject)`, which dispatches a bogus native `then` and never
// calls resolve/reject — parking the caller forever. That was the real
// "One moment…" hang. Call it without await — `const Purchases = loadPurchases();`
// — then await only the real promises its methods return.
function loadPurchases() {
  // The JS proxy for "Purchases" always exists (registerPlugin returns one even
  // with no native counterpart). isPluginAvailable still gates whether the native
  // plugin is actually present; fail loudly if not, rather than dispatching to a
  // missing native handler.
  if (!Capacitor.isPluginAvailable("Purchases")) {
    const msg =
      "RevenueCat 'Purchases' native plugin is not registered in this build — " +
      "rebuild the native app (clean build folder + npx cap sync). OTA cannot deliver native plugins.";
    console.error("[purchases]", msg);
    throw new Error(msg);
  }
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
  try {
    // Bound the whole native init (load + configure) in one timeout so no path —
    // not loadPurchases, not configure — can park the paywall on "One moment…"
    // forever.
    await withTimeout(
      (async () => {
        const Purchases = loadPurchases();
        await Purchases.configure({ apiKey: platformApiKey(), appUserID: appUserId });
      })(),
      "configure",
    );
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
  const Purchases = loadPurchases();
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
  const Purchases = loadPurchases();
  const { current } = await withTimeout(Purchases.getOfferings(), "getOfferings");
  if (!current) return null;
  return { offering: current, monthly: current.monthly, annual: current.annual };
}

// Purchases a specific package and returns the resulting customerInfo. Throws on
// a real failure; callers treat a user cancellation as a no-op.
export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const Purchases = loadPurchases();
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
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
  const Purchases = loadPurchases();
  const { customerInfo } = await Purchases.restorePurchases();
  return customerInfo;
}

// RevenueCat surfaces user cancellation via a flag on the thrown error; callers
// use this to stay silent (per the App Store HIG) instead of showing an error.
export function isPurchaseCancelled(err: unknown): boolean {
  return Boolean((err as { code?: string; userCancelled?: boolean })?.userCancelled);
}
