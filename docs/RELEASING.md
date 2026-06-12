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

**Bundles are channeled per binary version** (`MARKETING_VERSION` in the Xcode
project): a bundle is only offered to binaries with the same plugin set it was
built against.

## App Store binaries

```bash
npm install            # ALWAYS after a pull that touched package.json
npm run mobile:sync    # native export + cap sync ios
npm run mobile:open    # Xcode → run/archive
```

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
