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

import { isNative, getPlatform } from "@/lib/platform";
import type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
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
  const mod = await import("@revenuecat/purchases-capacitor");
  return mod.Purchases;
}

let configuredFor: string | null = null;

// Configures the SDK once per app user. Safe to call repeatedly — reconfigures
// only when the signed-in user changes (e.g. after an account switch).
export async function configurePurchases(appUserId: string): Promise<void> {
  if (!isNative()) return;
  if (configuredFor === appUserId) return;
  const Purchases = await loadPurchases();
  await Purchases.configure({ apiKey: platformApiKey(), appUserID: appUserId });
  configuredFor = appUserId;
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
  const { current } = await Purchases.getOfferings();
  if (!current) return null;
  return { offering: current, monthly: current.monthly, annual: current.annual };
}

// Purchases the chosen plan's package and returns the resulting customerInfo.
// Throws on a real failure; callers treat a user cancellation as a no-op.
export async function purchasePlan(plan: PlanId): Promise<CustomerInfo> {
  const Purchases = await loadPurchases();
  const packages = await getPlanPackages();
  const pkg = plan === "annual" ? packages?.annual : packages?.monthly;
  if (!pkg) throw new Error(`No RevenueCat package available for the ${plan} plan`);
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
  return customerInfo;
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
