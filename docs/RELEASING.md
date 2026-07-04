# Releasing Volnar

One codebase, three delivery paths. Pick the row that matches your change:

| Change | Command | Reaches users |
|---|---|---|
| Backend / API / AI prompts / web UI | push to `main` (Vercel auto-deploys) | immediately |
| Native UI (anything in `src/`) | `npm run ota:release` | next two app launches |
| New Capacitor plugin, iOS config, icons | `npm run mobile:sync` + Xcode archive → App Store | days (review) |

## Native UI updates (OTA)

```bash
npm run ota:release
```

Builds the static bundle (`scripts/build-native.mjs`), zips it, and uploads
zip + manifest to the public `ota-bundles` Supabase Storage bucket. Installed
apps check the manifest on launch (`src/lib/native/ota.ts`), download in the
background, and apply on the next cold start. A broken bundle self-heals: the
updater rolls back if the new bundle doesn't boot cleanly.

Needs `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in the
environment or `.env.local`.

**From CI (no local run):** `.github/workflows/ota-release.yml` runs `ota:release`
on a manual dispatch (Actions → "OTA release (native UI)" → Run workflow). It
builds on Linux (no Xcode — `ota:release` reads `MARKETING_VERSION` from the
checked-in Xcode project and never runs `cap sync`). Because the bundle is a full
production build, it needs the production public env as repo secrets
(`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_REVENUECAT_IOS_KEY`; optional
`NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID`) — a preflight
step **hard-fails** if any required one is missing, so a partial build can never
ship broken auth or purchases.

OTA is **on by default in every native build** — `build-native.mjs` bakes
`NEXT_PUBLIC_ENABLE_OTA=true` into both the App Store binary and each OTA
bundle (export `NEXT_PUBLIC_ENABLE_OTA=false` to build an opt-out binary).
The manifest carries the release's git sha; installs already running that
commit skip the download, so opening a channel right after a binary ships
(rule 2 below) costs users nothing. Binaries built before 2026-07-03 shipped
with the updater off and ignore channels entirely — OTA reaches users from
the first binary built after that.

**Bundles are channeled per binary version** (`MARKETING_VERSION` in the Xcode
project): a bundle is only offered to binaries with the same plugin set it was
built against.

## App Store binaries

```bash
npm install            # ALWAYS after a pull that touched package.json
npm run mobile:sync    # native export + cap sync ios
npm run mobile:open    # Xcode → run/archive
```

(Capacitor 8 iOS uses Swift Package Manager — there is no `pod install` step.)

### Icons & splash

Source assets live in `assets/` (`icon.png` 1024×1024, `splash.png` 2732×2732);
regenerate the iOS asset catalog with `npm run mobile:assets`. The artwork is
generated programmatically from the Volnar "V" mark in the current brand
(cream V + brass triangle on warm ink — updated 2026-07-02 to match the warmed
Nocturne tokens; sharp-rendered, see the session notes). Functional and
on-brand, but not designer-produced — replace with final artwork before a
flagship App Store push, then rerun `npm run mobile:assets`.


Rules learned the hard way:

1. **Server first, binary second.** A binary talks to the live API with
   Bearer auth + CORS (`src/lib/api.ts`, `middleware.ts`). Deploy `main`
   before shipping a binary built from it. The reverse is always safe.
2. **After every App Store release goes live, run `npm run ota:release`
   once** so the new binary version has an OTA channel.
3. **No full-page navigations to non-root paths in native code.** Capacitor
   serves the root `index.html` for any deep-path document load — use the
   Next router (see `NativeBootstrap`'s `navigate` callback).
4. **Bump `MARKETING_VERSION`** when archiving a new App Store build.
5. During an App Review window, freeze API-shape changes — the reviewer's
   binary talks to production.

## Version skew

Binaries (and OTA bundles) live for weeks against a moving API. Add response
fields freely; never rename or remove `/api` response fields without a grace
period.

## App Review notes (copy-paste starting point)

- Demo account: tap "View a demo account" on the login screen (seeded,
  no credentials needed; backed by `DEMO_USER_*` env vars on the server).
- Native capabilities: Face ID app lock, push notifications (opt-in in
  Settings), offline-capable bundled UI, Sign in with Apple.
- In-app account deletion: Profile → Settings → Delete account.
