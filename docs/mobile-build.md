# Mobile build (iOS) — Capacitor wrapper

Phase 1 of the iOS launch. The native app is a **remote-URL wrapper**: it ships
an iOS shell (Capacitor) whose WebView loads the live production site at
`https://app.volnar.nl`. There is **no bundled static web build** — web changes
deployed to production flow into the app automatically with no native rebuild.

Native sign-in **is implemented**: on the native shell, Google OAuth and email
magic-link both run through a native flow that returns via a deep link
(`src/lib/native/auth-native.ts`, `src/lib/native/deeplink.ts`,
`src/components/NativeBootstrap.tsx`, and the `isNative()` branch in
`src/app/login/page.tsx`). Biometric / Face ID lock is **not** built — a later
phase. Web account deletion has shipped (see current-features.md) and is
reachable through the wrapper since it loads the live site; native-specific
deletion is a later phase.

## Configuration

- `capacitor.config.ts`
  - `appId`: `nl.volnar.app`
  - `appName`: `Volnar`
  - `webDir`: `public` (placeholder only; remote `server.url` is what actually loads)
  - `server.url`: `https://app.volnar.nl`, `cleartext: false`
  - `ios.contentInset`: `never`
  - `ios.backgroundColor`: `#FAF6EB` — native WebView background fallback so no
    white flashes behind the web content at the top edge.

> **Note:** `ios.backgroundColor` (and the matching `<meta name="theme-color">`)
> are **light-mode only** for now. Dark-mode parity will arrive when
> `@capacitor/status-bar` is wired up in a later phase, at which point the
> native background and status-bar style will follow the active theme.

The web app now includes a basic web-app manifest and `/offline` fallback route for
installability / failure-state polish. The native shell still loads the remote
production URL; for App Store submission, validate the remote-host outage state on
a real device before review.

## Common tasks

| Task | Command |
| --- | --- |
| Open the iOS project in Xcode | `npm run mobile:open` |
| Build & run on a simulator/device | `npm run mobile:run` |
| Sync config / plugins into iOS | `npm run mobile:sync` |
| Regenerate app icons & splash | `npm run mobile:assets` |

### Open in Xcode and run

```bash
npm run mobile:open
```

Then in Xcode select a simulator or device and press the **play** button. The
app launches and loads `https://app.volnar.nl`.

### Sync after plugin / config changes

Run after adding a Capacitor plugin or editing `capacitor.config.ts`:

```bash
npm run mobile:sync
```

(Capacitor 8 iOS uses Swift Package Manager — there is no `pod install` step.)

### Regenerate icons & splash

Source assets live in `assets/` (`icon.png` 1024×1024, `splash.png` 2732×2732).
After editing them, regenerate the iOS asset catalog on a Mac:

```bash
npm run mobile:assets
```

## ⚠️ Icons are generated from the brand mark — review before submission

The current `assets/icon.png` and `assets/splash.png` were generated
programmatically from the existing Volnar "V" mark (`public/volnar-mark.svg`)
on a warm-black (`#0E0E0C`) background, with the mark in cream (`#FAF6EB`) and
the inner triangle in brand green (`#4A7C5E`). They are functional and
on-brand, but were **not produced by a designer**. Replace them with
final, design-approved artwork before App Store submission, then rerun
`npm run mobile:assets`.

## Toolchain

- Capacitor 8 (CLI + core + ios)
- Xcode 26
