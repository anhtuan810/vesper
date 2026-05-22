# Redesign decisions

## Status: all 12 decisions shipped

| Decision | Shipped in |
|---|---|
| 1 — Diary notes are immutable | PR 5 |
| 2 — Pure renames are not logged | PR 5 |
| 3 — Chat is a single continuous thread | PR 6 |
| 4 — Diary entries display the asset's current name | PR 5 |
| 5 — Settings is absorbed into Profile | PR 3 |
| 6 — Avatar is user-editable | PR 7 |
| 7 — Profile fingerprint | PR 7 |
| 8 — Asset detail pages are read-only | PR 4 |
| 9 — Property visual is the auto-generated map | PR 8 (with PR 12 cleanup) |
| 10 — Mortgage auto-amortizes invisibly | PR 8 |
| 11 — Cash is purpose-pot | PR 8 |
| 12 — Chips first, typing as fallback | PR 22 |

This file is preserved as the source-of-truth record of the rationale for each decision. The fold-into-other-docs notes inside each decision (telling you where to update `current-features.md`, `technical-decisions.md`, etc.) are now historical — those rewrites happened in the post-migration doc reconciliation pass. The decisions themselves remain authoritative.

If anything in `current-features.md`, `technical-decisions.md`, `currency-feature-spec.md`, or `next-build-plan.md` ever contradicts the rules below, those docs are stale and need updating — not the other way around.

---

Decisions from the redesign session that change product behavior beyond CSS — they touch data, routing, or how the chat assistant is structured. None require a schema migration except where noted.

Underlying principle that ties them together: **Volnar is a record of decisions and a conversation, not a wiki and not a session-based chat.** Context is captured at the moment something happens; renames are metadata; the chat is one continuous thread.

---

## Decision 1 — Diary notes are immutable

**The change:** Drop the inline note editor from the diary. `personal_context` is captured at the moment a mutation happens (via Claude's `<context>` block in chat, or via `ContextNotePrompt` for inline UI edits over the 5% threshold), and never edited after.

**Rationale:** "What was I thinking?" is answered by what the user said at the time, not what they would retroactively wish they had said. Append-only diaries are stronger records. They also remove a class of complexity (optimistic update, rollback, PATCH endpoint, search reading "locally-edited notes").

**Code teardown:**

Frontend
- `src/components/DiaryTab.tsx` — remove the row-tap expand state, the inline `<textarea>` editor, the "+ Add note" affordance, and the optimistic-update + rollback logic for note edits. Rows render as static lines. The `cursor: pointer` on the row goes too.
- The search predicate's clause about "locally-edited notes" goes away.

Backend
- `src/app/api/mutations/[id]/route.ts` — delete the route entirely. Its only job is `PATCH personal_context`, which no longer happens.

What stays
- Claude's `<context>` capture during chat mutations — unchanged.
- `ContextNotePrompt` on inline UI edits over 5% value change — unchanged at the time of this decision. (Subsequently obsoleted by Decision 8, which removed inline edits entirely. The component was deleted in PR 4.)

---

## Decision 2 — Pure renames are not logged

**The change:** When a chat edit action's only field is `new_name` (no value or unit change), skip the mutation insert. The asset name update still happens on the `assets` row; the diary just doesn't get a bookkeeping entry. Same rule for the manual UI path.

**Rationale:** Renaming an asset is metadata, not a financial decision. The diary stays focused on events that moved money.

**Code teardown:**

Backend
- `src/app/api/chat/route.ts` — in the edit-action handler, guard the `mutations` insert: if the diff between before and after is name-only, skip the insert. The asset UPDATE still runs.
- `src/app/api/assets/[id]/route.ts` (PATCH) — at the time, same guard. (Subsequently obsoleted by Decision 8, which deleted the route entirely.)

What stays
- The `asset_name` column on `mutations` — keep it. Future events that *do* warrant logging still need to record what the asset was called at the time, and it's the fallback display name for deleted assets (see Decision 4).

---

## Decision 3 — Chat is a single continuous thread, not a series of sessions

**The change:** The chat surface has no "new chat" or "history" affordances. There is one conversation per user, ever, that they scroll back through to revisit older exchanges. The user never sees the concept of a "chat session" exposed in the UI.

**Rationale:** The mental model is "talking to a person," not "starting a new chat." Surfacing session boundaries forces the user to think about an artifact (the session container) that has no analog in human conversation. iMessage doesn't have a "new chat" button; you keep talking.

**Code teardown:**

Frontend
- `src/app/chat/page.tsx` and `src/components/ChatPopup.tsx` — remove any "new chat" / "clear history" / "session list" affordances from the chat header. The header carries identity (avatar + name) only.
- `src/lib/use-chat-session.ts` — keep as a cache strategy. The 24h localStorage TTL stays for cold-load performance; it just stops being a UX-level session boundary. On expiry the hook still falls back to `GET /api/messages` and pulls older messages on scroll.

Backend
- `src/app/api/messages/route.ts` — extend pagination with cursor-based fetch (`before=<message_id>&limit=20`) so the client can lazy-load older history as the user scrolls up.

What stays
- The system prompt's "last 6 messages" context window for Claude — unchanged. The model still only sees recent turns; what changes is the user's view, not the model's.
- The 50 messages/day rate limit — unchanged.
- Image paste support — unchanged.

---

## Decision 4 — Diary entries display the asset's current name

**The change:** When an asset is renamed, every existing diary entry for that asset reflects the new name. Diary fetch prefers `assets.name` via a join, falling back to `mutations.asset_name` only when the asset has been deleted (`asset_id = null`).

**Rationale:** An asset has one identity. The name is just how the user currently refers to it. Past mentions of that asset should use today's label. Mixed names in the diary ("ABN AMRO savings" and "Emergency fund" for the same account) breaks scannability and forces mental translation.

This pairs naturally with Decision 2: renames are metadata, not events, and metadata changes propagate everywhere they're displayed.

**Code teardown:**

Frontend / data layer
- Diary fetch in `src/components/DiaryTab.tsx`: `LEFT JOIN assets ON mutations.asset_id = assets.id`, then display `COALESCE(assets.name, mutations.asset_name)`.
- `src/app/api/diary-summary/route.ts` — same join.
- Search predicate — matches against the joined display name.

What stays
- `mutations.asset_name` column — kept as the fallback for deleted assets and as audit history.
- The write path — `asset_name` keeps getting populated at insert time.

Edge case worth knowing
- If a user renames an asset to reclassify it (e.g. "Holiday fund" → "Tax money"), past contributions to "Holiday fund" now appear as having gone into "Tax money." This is the cost of consistency. The *thing* is the same; only the label evolved.

---

## Decision 5 — Settings is absorbed into Profile

**The change:** Drop the separate `/settings` route. The two settings the app actually needs — display currency and theme — live as a "Preferences" section on the Profile page. No gear icon, no settings sheet.

**Rationale:** Settings was always going to be small. A separate route for two rows is structural overkill, and putting them on Profile is conceptually correct: Profile is where the user tells Volnar *how to be*.

**Implication for the currency feature:** `currency-feature-spec.md` Phase A explicitly created `src/app/settings/page.tsx`. That plan was superseded. The currency picker landed on Profile in the Preferences section instead.

**Code teardown:**

Frontend
- `src/app/profile/page.tsx` — Preferences section below the context fields. Two rows: Display currency and Theme.
- `src/lib/hooks.ts` — `useDisplayCurrency()` and `useTheme()` read the same `users` record.

Backend
- `src/app/api/users/me/route.ts` — PATCH endpoint with allowlist `{ display_currency, theme, avatar_url }`.
- Schema: add `theme text default 'auto' check (theme in ('auto', 'light', 'dark'))` to `users`.

---

## Decision 6 — Avatar is user-editable, sourced from Google by default *(amended)*

**The original change:** On signup via Google OAuth, `users.avatar_url` is populated with the Google profile photo. Tap the avatar on Profile → photo picker → upload → store in Supabase Storage → overwrite `users.avatar_url`. Falls back to initials when no avatar is set.

**Amendment (2026-05-22):** The avatar UI was removed from the Profile page. There is no tap-to-upload, no image render, and no initials fallback on Profile. NavBar never rendered an avatar either — `firstName` only. `avatar_url` is now vestigial: the schema column exists, `/api/users/me` still accepts it in the PATCH allowlist (for forward compatibility), and the Google-OAuth-on-signup write still fires — but no UI surface currently reads or renders it.

**What remains:**
- `users.avatar_url` column — kept in schema, untouched.
- `src/app/api/users/me/route.ts` — `avatar_url` stays in the allowlist.
- The Google-OAuth-on-signup write path — unchanged.
- `src/lib/avatar-upload.ts` — file still exists but is not imported by any active page.

**What is gone:**
- Tap target on Profile.
- `src/app/profile/page.tsx` avatar block (button, image, initials badge, camera badge, file input, upload handler, `avatarUploading` state, `avatarError` state).
- `getInitials` helper (was Profile-local, now unused there).

---

## Decision 7 — Profile is the reflective surface, not a dashboard *(amended)*

**The original change:** Below the name, a single italic-serif fingerprint sentence characterizes the user as an investor — e.g., `Long-horizon investor concentrated in semiconductors and residential property.`

**Rationale (preserved):** Profile is the user's personal space. The fingerprint reads like a private banker's one-line take on their client — characterization with restraint. Factual breakdowns belong on Portfolio where they're actionable; on Profile they would feel like a dashboard. **Guard (sharper form):** no actionable portfolio breakdowns on Profile — no positions list, no allocation chart, no rate-of-return. Reflective context is the point.

**Amendment (2026-05-22):** Profile now hosts the Perspective surface (NL/EU/world percentile standing) alongside the fingerprint and AI-extracted context. This is consistent with the guard: Perspective is global context about where the user stands as a person, not a breakdown of individual holdings. It moved off Vitals on this date; Vitals is portfolio readings only.

**Current Profile structure (top to bottom):**
1. User's full name — 38px serif, left-aligned, serves as the page title.
2. Fingerprint — 15px italic serif directly below the name. Hidden when null.
3. Perspective card — NL/EU/world percentile standing, computed deterministically client-side. Renders immediately from `useNetWorth()`; trajectory chip fills in after a ≥330-day baseline snapshot is found.
4. Context — the four AI-extracted fields (`life_and_direction`, `approach`, `currently_exploring`, `worth_raising`). Hidden if all empty.
5. Preferences — Display currency + Theme.
6. Email + Sign out (account area at the bottom).

**Code:**

Backend
- `src/lib/profile-extractor.ts` — fingerprint field: 12–18 words. Stored in `users.fingerprint`.

Frontend
- `src/app/profile/page.tsx` — name as page title; fingerprint immediately beneath; Perspective section above Context.
- `src/components/perspective/PerspectiveCard.tsx` — Profile-owned card (moved from `components/vitals/`).
- `src/lib/hooks/netWorth.ts` — `useNetWorth()` hook; derives EUR net worth from `useAssets` + FX, same formula as Portfolio.

Cost: negligible (Perspective is deterministic math; snapshot fetch is a single lightweight GET).

---

## Decision 8 — Asset detail pages are read-only; all modifications happen via chat

**The change:** No inline editing, no delete button, no in-page "Discuss" CTA on any asset detail page. The detail page is a calm read-only view: identity, current state, history. All adds, edits, and removes happen via chat — where the act of saying the change captures the reasoning at the same moment.

**Navigation:** Each detail page has a top bar with a back chevron (left) and a refresh icon (right). Refresh forces a live-price re-fetch for this asset.

**Discuss behavior:** The Chat tab in the bottom nav becomes context-aware when over `/asset/[id]`. Tap Chat from there → chat opens seeded with `Tell me about my <name>.`

**Rationale:** Every meaningful change has a *why*. Inline edits and a Delete button silently mutate state with no reasoning attached, leaving the diary inconsistent. Routing all modifications through chat means the diary stays complete and the detail page is a view, not an editor.

This composes with Decision 1 (notes immutable) and Decision 2 (pure renames not logged): *the diary is a complete, accurate, append-only record of decisions; changes happen in one place; the detail pages render the truth*.

**On computed vs settable fields**

Some fields are intrinsically derived and never directly settable, even by chat:
- `avg_buy` is calculated from the user's buy mutations.
- `current_value` is `units × live_price`.
- `total_return` is `current_value − (units × avg_buy)`.

Chat-settable fields are the actual underlying ones: `units`, `value` for non-tradeable assets, mortgage fields, address, etc.

**Code teardown:**

Frontend
- `src/components/asset-detail/InlineEdit.tsx` — delete.
- `src/components/asset-detail/DeleteAssetButton.tsx` — delete.
- `src/components/asset-detail/ContextNotePrompt.tsx` — delete.
- `src/app/asset/[id]/page.tsx` — top bar with back + refresh.
- All three asset-detail variants and `MortgageBlock` / `BondBlock` — read-only display.
- `src/components/BottomNav.tsx` — context-seeded Chat tab when over asset detail.

Backend
- `src/app/api/assets/[id]/route.ts` — delete both PATCH and DELETE handlers.

---

## Decision 9 — Property visual is the auto-generated map; no user photo upload

**The change:** Real estate detail pages always show the auto-generated map. Users cannot upload a photo to replace it.

**Rationale:** Maps win on every axis that matters for a portfolio tool — objective, zero user effort, show *where* the property is (currency, country, geography), uniform across the app, on-brand. Volnar isn't Funda or Zillow. Volnar cares about net worth, not curb appeal.

**Code teardown:**

Frontend
- `src/components/asset-detail/RealEstateDetail.tsx` — remove photo-upload UI. PropertyMap is always rendered.
- `src/components/PropertyMap.tsx` — theme-aware via `useTheme()`: light style at `src/styles/map-light.json`, dark style at `src/styles/map-dark.json`. Cached PNG keyed per theme.

Backend
- `property-photos` bucket — kept, now only holds auto-cached map PNGs.

---

## Decision 10 — Mortgage balance auto-amortizes invisibly; only notable events are logged

**The change:** The user enters mortgage values once at setup. After that, the displayed balance decreases automatically based on the amortization formula — silently, with no UI affordance and no diary entry per month.

Notable events — extra principal payments, refinances, rate changes, property value updates — *are* logged via chat with reasoning.

**How it works:**

```
current_balance(today)  = amortize(mortgage_balance, rate, payment, type, mortgage_balance_recorded_at, today)
                          − sum(extra principal payments logged after the anchor)
equity(today)           = current_value − current_balance(today)
```

**Code:**

Backend
- `src/lib/mortgage.ts` — `computeCurrentBalance(asset, asOf = today)` function.
- New column `mortgage_balance_recorded_at` (timestamptz) on `assets`. Set on every write that touches `mortgage_balance`.
- `MortgageBlock` and `RealEstateDetail` read the displayed balance via `computeCurrentBalance(asset)`, not raw `assets.mortgage_balance`.
- No cron job. Computation runs on read.

Diary
- Notable events → logged via chat as today, with reasoning.
- Monthly amortization → never logged.

---

## Decision 11 — Cash is purpose-pot, not bank-account

**The change:** Cash positions are mental-accounting pots. The user names them by purpose (`Emergency fund`, `Tax money`, `House deposit`) rather than by provider. All cash entries use the same generic wallet icon — no Clearbit lookup.

**Rationale:** Volnar is a ledger, not a bank aggregator. Mental-accounting pots are how this kind of investor actually organizes cash: "I have €18k earmarked for emergencies" is a financial decision; "I have €18k at ABN AMRO" is bookkeeping.

**Pension** follows the same rule: pots, regardless of provider.

**Bonds are the exception** — bonds reference a specific issuer that materially affects risk and yield. Bonds get a certificate-style icon and an issuer field on the detail page.

**Code:**

Frontend
- `src/components/AssetLogo.tsx` — wallet SVG for `cash` / `pension`; certificate SVG for `bonds`.

Onboarding / chat prompts
- `src/lib/claude.ts` — encourage purposeful naming on cash adds.

Data model
- No schema changes.

---

## Decision 12 — Chips first, typing as fallback

**The change:** Every assistant turn that has an enumerable next
move offers chips for those moves. Typing is always available
below the chips, never removed, never gated. Free typing is never
the first ask — on every screen and every assistant turn, the
first move is tappable.

**Chip-mandatory turns:**
- Onboarding — every step
- Asset-add confirmations (Confirm / Edit / Cancel / Add more)
- Asset-edit mode pickers (Update value / Add units / Sell /
  Rename / Remove)
- Asset-detail Q&A seeds (How is it performing? / When did I buy?
  / What's my return?)
- Insight band follow-ups (Tell me more / Why does this matter?
  / What should I do?)
- Diary entry follow-ups
- After every freeform answer — 3-4 anticipated next questions

**Where typing remains:**
- Arbitrary numbers (units, values, dates) — only after a
  chip-driven mode has narrowed the decision
- Custom asset names not in any enumeration
- Genuinely expressive questions the model can't pre-anticipate

**Edge case:** If the user types instead of tapping, the assistant
answers their typed input fully and conversationally — never
"please tap an option." Chips are guidance, not rails.

**Rationale:** Mobile-first users avoid typing in cold-start
moments. Chips remove friction in known finite flows. Conversational
expressiveness — and the typed input — remain the moat against
form-based competitors. Both coexist; chips are the default.

---

## Source of truth

This file. If anything in `current-features.md`, `technical-decisions.md`, `currency-feature-spec.md`, or `next-build-plan.md` contradicts the rules above, those docs are stale.

Supersedes the earlier `diary-note-immutability-decision.md`.

---

## Subsequent amendments

Holdings grouping later expanded to four groups: Property, Public markets, Reserves, Crypto. See current-features.md for current state.
