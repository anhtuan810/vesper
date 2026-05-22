# Volnar Vitals — Documentation Set

Save all of these into the repo `docs/` folder and add them to Claude
project knowledge. Together they are the complete record of the Vitals
feature.

| File | What it is | Source of truth for |
|------|-----------|---------------------|
| `vitals-build-state.md` | Build status, file inventory, data flow, resolved issues, latent items, decision log, where-to-pick-up. | Project STATUS and history. Start here in a new chat. |
| `vitals-metrics-reference.md` | Per-vital formulas, thresholds, guards; Perspective percentile logic; sourced benchmark figures. | How numbers are CALCULATED. |
| `vitals-design-spec.md` | Tokens, token mapping, typography, spacing, per-component contracts, per-chart geometry. | Anything VISUAL / UI. |
| `vitals-mockup.html` | The canonical polished render (open in a browser). Section comments mark each card. | Exact MARKUP / SVG geometry. |

Status as of 22 May 2026: feature built, all six known issues resolved,
renders correctly on light and dark themes. Remaining = judgment calls
(see build-state §6 and §8), not bugs.
