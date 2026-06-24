@AGENTS.md

## Working agreement (since 2026-06-24)

- **Active branch is `v1.1`.** All ongoing development happens here. Commit
  directly to `v1.1` and push after each change — no pull requests.
- **`main` is the released-production line** for the shipped App Store build
  (v1.0). Do NOT commit feature work to `main`, and do not deploy `main`'s
  in-progress work to production, until a matching App Store binary is live. The
  ephemeral per-visitor demo feature lives on `v1.1` for exactly this reason.
- **The maintainer is non-technical and does not write or run code.** Claude
  makes all code changes, runs all commands (git, build, tests), and explains
  decisions in plain language rather than handing over steps to run.
- When work on `v1.1` is ready to ship, it is paired with a new binary: submit
  the binary, and only once it is approved and live do we deploy `v1.1` to
  production (and flip `DEMO_ENABLED` for the demo feature).
