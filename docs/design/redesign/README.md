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

These are visual proposals only — no app code is changed. Once a direction is
chosen, it maps onto the existing token system in `src/app/globals.css`
(`--bg`, `--surface`, `--accent`, `--font-*`, the `.card`/`.btn`/`.eyebrow`
primitives), so adopting one is mostly a re-theming of tokens plus tightening a
few component layouts — the content and data flow stay as they are.
