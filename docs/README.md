# Volnar — Documentation Index

Code is the source of truth. These docs explain intent, history, and the parts
that can't be read off the code (live-only behaviour, design decisions, manual
QA). New to the project? Start with `volnar-project-handoff.md`.

## Start here / overview
| File | What it is |
|------|------------|
| `volnar-project-handoff.md` | Product vision, target user, stack, and a high-level repo map. **Start here in a new chat.** |
| `current-features.md` | What is built and what is fragile, feature by feature, with file pointers. |
| `technical-decisions.md` | Stack, Supabase schema, API routes, and the calculation rules (net worth, currency, mutations, pensions). |

## Product decisions & roadmap
| File | What it is |
|------|------------|
| `redesign-decisions.md` | The 11 locked product decisions (frozen historical record). |
| `next-build-plan.md` | Prioritized roadmap, a "what just shipped" log, and tech debt. |

## Feature notes
| File | What it is |
|------|------------|
| `currency-feature-spec.md` | Display-currency feature history. The body predates the final design; the canonical model is `technical-decisions.md` → Currency Rules. |
| `mobile-build.md` | iOS Capacitor remote-URL wrapper — config and common tasks. |

## Vitals (its own doc set)
| File | Source of truth for |
|------|---------------------|
| `vitals-build-state.md` | Vitals status, file inventory, data flow, decision log. Start here for Vitals. |
| `vitals-metrics-reference.md` | Per-vital formulas, thresholds, guards; Perspective percentiles. |
| `vitals-design-spec.md` | Tokens, typography, per-component and per-chart geometry. |
| `vitals-mockup.html` | The canonical rendered Vitals mockup (open in a browser). |

## Testing & manual QA
| File | What it is |
|------|------------|
| `testing-strategies.md` | Layered test-activation plan (deferred — there are no automated tests yet). |
| `add-edit-flow-checks.md` | Manual (live, API-key) checklist for the chat add/edit cost-basis contract. |
| `scenario-classification-manual-checks.md` | Manual checklist for chat what-if / scenario routing. |
| `agent-chat-live-eval.md` | Gate checklist for enabling the flag-gated agent tool-loop (OFF by default). |
