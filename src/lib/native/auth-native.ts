import { Browser } from "@capacitor/browser";
import { SignInWithApple } from "@capacitor-community/apple-sign-in";
import type { createBrowserSupabase } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createBrowserSupabase>;

// Native Google sign-in: open the OAuth flow in the system browser and let the
// custom URL scheme (nl.volnar.app://auth/callback) bring the result back into
// the app. See src/lib/native/deeplink.ts for the return handler.
export async function signInWithGoogleNative(
  supabase: SupabaseClient,
  nextPath = "/"
) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      skipBrowserRedirect: true,
      redirectTo: `nl.volnar.app://auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });
  if (error) throw error;
  if (data?.url) {
    await Browser.open({ url: data.url, presentationStyle: "popover" });
  }
}

// Native Apple sign-in: the OS presents the native "Sign in with Apple" sheet
// directly — no system-browser round trip or deep link is involved. The
// resulting identity token is handed straight to Supabase, which establishes
// the session in place, so we navigate to nextPath ourselves on success.
export async function signInWithAppleNative(
  supabase: SupabaseClient,
  nextPath = "/"
) {
  const { response } = await SignInWithApple.authorize({
    clientId: "nl.volnar.app",
    redirectURI: "https://app.volnar.nl/auth/callback",
    scopes: "email name",
  });

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: response.identityToken,
  });
  if (error) throw error;

  window.location.assign(nextPath);
}

// Native magic link: Supabase emails a link that deep-links back via
// nl.volnar.app://auth/confirm, handled in src/lib/native/deeplink.ts.
export async function signInWithMagicLinkNative(
  supabase: SupabaseClient,
  email: string,
  nextPath = "/"
) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `nl.volnar.app://auth/confirm?next=${encodeURIComponent(nextPath)}`,
    },
  });
  if (error) throw error;
}
