# Phone UI redesign — three directions (June 2026)

Static, self-contained mockups exploring a more modern, compact "personal
trading platform" look for the iOS app — tuned for **value investors**, not day
traders. Each file renders all five tabs (Overview · Vitals · Chat · Journal ·
Profile) in iPhone frames, using the existing content (demo persona: Alex,
Amsterdam, €334.000). Open any file in a browser.

Shared principles across all three:

- **Compact** — 8px grid, hairline separators, tabular mono figures. More on
  screen, less wasted vertical height than the current serif-heavy layout.
- **Calm signals** — gains in a soft green, losses in muted clay. No alarm red;
  built for patience.
- **One instrument** — a single restrained accent, consistent cards/rows across
  every tab.

## The directions

| File | Name | Feel | Palette | Type |
|------|------|------|---------|------|
| `nocturne.html` | **Nocturne** *(recommended)* | Dark premium trading terminal | Near-black slate · brass accent | Inter · IBM Plex Mono |
| `nocturne-light.html` | **Nocturne Light** | Light companion to Nocturne (same family) | Cool slate-paper · brass accent | Inter · IBM Plex Mono |
| `daylight.html` | **Daylight** | Light, Swiss-precise, high-density | Off-white · evergreen accent | Plus Jakarta Sans · IBM Plex Mono |
| `atelier.html` | **Atelier** | Near-monochrome editorial / "private office" | Warm paper · ink-indigo accent | Fraunces (display) · Inter · IBM Plex Mono |

## Implemented

**Nocturne is now live as the app theme** (both dark + light), applied through the
existing token system rather than a rewrite:

- `src/app/globals.css` — `:root`/`[data-theme="light"]` carry Nocturne Light and
  `[data-theme="dark"]` carries Nocturne Dark; `--font-display` now points at the
  sans (Inter) so headings and figures read as a terminal, not an editorial serif.
  Gains are a calm green (`--positive` is no longer aliased to the brass accent),
  losses a muted clay.
- `src/lib/tokens.ts` — the JS light-mirror + asset/category color maps kept in sync.
- `src/app/layout.tsx` — `themeColor` (native WebView / browser chrome) updated.
- `src/components/VolnarLogo.tsx` — logo mark follows `--accent`.

Theme switching uses the existing user preference (`data-theme`, toggled in
Settings); both themes are Nocturne now. Verified with `tsc`, `next build`, and
real `/login` renders in both modes.

### Not yet done (follow-ups)
- **Compactness pass** — tighten the per-screen layouts (`NetWorthHero`,
  `HoldingsGroup`/`PositionRow`, vitals cards, journal rows, `BottomNav`) to the
  denser mockup spec. The theme is in; the layout tightening is the next increment.
- **Desktop Overview shell** — `overview/twilight-app.css` (`.vapp`) and
  `home-twilight.css` (`.vhome`) define their own Twilight tokens scoped to those
  desktop-only wrappers, so the desktop web Overview still reads Twilight. Phone is
  unaffected (those shells don't render on mobile).
- **Marketing site** — scoped under `.tw` with its own `--mkt-*` tokens; left on
  Twilight deliberately. Aligning the landing page to Nocturne is a separate call.

The two alternate directions (`daylight.html`, `atelier.html`) remain here as
reference if you want to switch later — each is the same token-level swap.
