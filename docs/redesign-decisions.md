# Redesign decisions

Decisions from the redesign session that change product behavior beyond CSS — they touch data, routing, or how the chat assistant is structured. Land all of these when development resumes. None require a schema migration.

Underlying principle that ties them together: **Vesper is a record of decisions and a conversation, not a wiki and not a session-based chat.** Context is captured at the moment something happens; renames are metadata; the chat is one continuous thread.

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
- `ContextNotePrompt` on inline UI edits over 5% value change — unchanged. It already prompts *at the moment of change*, which is consistent with the principle. Enforce write-once (no re-prompt on subsequent visits to the same mutation).

---

## Decision 2 — Pure renames are not logged

**The change:** When a chat edit action's only field is `new_name` (no value or unit change), skip the mutation insert. The asset name update still happens on the `assets` row; the diary just doesn't get a bookkeeping entry. Same rule for the manual UI path.

**Rationale:** Renaming an asset is metadata, not a financial decision. The diary stays focused on events that moved money.

**Code teardown:**

Backend
- `src/app/api/chat/route.ts` — in the edit-action handler, guard the `mutations` insert: if the diff between before and after is name-only, skip the insert. The asset UPDATE still runs.
- `src/app/api/assets/[id]/route.ts` (PATCH) — same guard. When the PATCH body's only field is `name`, skip the mutation insert.

What stays
- The `asset_name` column on `mutations` — keep it. Future events that *do* warrant logging (e.g., a rename that happens alongside a balance change) still need to record what the asset was called at the time, and it's the fallback display name for deleted assets (see Decision 4).

---

## Decision 3 — Chat is a single continuous thread, not a series of sessions

**The change:** The chat surface has no "new chat" or "history" affordances. There is one conversation per user, ever, that they scroll back through to revisit older exchanges. The user never sees the concept of a "chat session" exposed in the UI.

**Rationale:** The mental model is "talking to a person," not "starting a new chat." Surfacing session boundaries forces the user to think about an artifact (the session container) that has no analog in human conversation. iMessage doesn't have a "new chat" button; you keep talking.

**Code teardown:**

Frontend
- `src/app/chat/page.tsx` and `src/components/ChatPopup.tsx` — remove any "new chat" / "clear history" / "session list" affordances from the chat header. The header carries identity (avatar + name) only.
- `src/lib/use-chat-session.ts` — keep as a cache strategy. The 24h localStorage TTL stays for cold-load performance; it just stops being a UX-level session boundary. On expiry the hook still falls back to `GET /api/messages` and pulls older messages on scroll.

Backend
- `src/app/api/messages/route.ts` — extend pagination. Today it returns the last 20 with a 50 cap. For the infinite-scroll thread, it needs a cursor-based fetch (e.g. `before=<message_id>&limit=20`) so the client can lazy-load older history as the user scrolls up.

What stays
- The system prompt's "last 6 messages" context window for Claude — unchanged. The model still only sees recent turns; what changes is the user's view, not the model's.
- The 50 messages/day rate limit — unchanged.
- Image paste support — unchanged.

---

## Decision 4 — Diary entries display the asset's current name

**The change:** When an asset is renamed, every existing diary entry for that asset reflects the new name. Today the diary reads `mutations.asset_name` (captured at the time of the mutation), so old entries show old names. Change it to prefer `assets.name` via a join, falling back to `mutations.asset_name` only when the asset has been deleted (`asset_id = null`).

**Rationale:** An asset has one identity. The name is just how the user currently refers to it. Past mentions of that asset should use today's label, the way you'd refer to it in conversation today. Mixed names in the diary ("ABN AMRO savings" and "Emergency fund" for the same account) breaks scannability and forces mental translation.

This pairs naturally with Decision 2: renames are metadata, not events, and metadata changes propagate everywhere they're displayed.

**Code teardown:**

Frontend / data layer
- Diary fetch (in `src/components/DiaryTab.tsx` or wherever the mutations query lives): `LEFT JOIN assets ON mutations.asset_id = assets.id`, then display `COALESCE(assets.name, mutations.asset_name)`. Live assets get the current name; deleted assets fall back to the name preserved on the mutation row.
- `src/app/api/diary-summary/route.ts` — same join. The AI summary should use current names too.
- Search predicate — matches against the joined display name. Searching "emergency fund" finds every entry for that asset, regardless of historical label.

What stays
- `mutations.asset_name` column — kept as the fallback for deleted assets and as audit history.
- The write path — `asset_name` keeps getting populated at insert time. No write-path change.

Edge case worth knowing
- If a user renames an asset to reclassify it (e.g. "Holiday fund" → "Tax money" because the money's purpose has changed), past contributions to "Holiday fund" now appear as having gone into "Tax money." This is the cost of consistency. The *thing* is the same; only the label evolved.

---

## Where to fold these into project docs

**`docs/current-features.md`**
- Under "Financial Diary": remove the "Inline expandable notes" bullet and the phrase "including locally-edited notes" inside the Search bullet.
- Under "Financial Diary": replace the implication that historical mutations show stored names with: "Diary entries display each asset's current name (via join to `assets`). Deleted assets fall back to the name preserved on the mutation row."
- Under "Conversational Assistant": add "The chat is presented as a single continuous thread per user. No 'new chat' or 'session history' UI is exposed. Users scroll back to revisit older exchanges."

**`docs/technical-decisions.md`**
- Under "Mutation / Diary Logging Rules": remove the `PATCH /api/mutations/[id]` bullet. Add:
  - "Pure renames (chat or UI edits where the only diff is the asset name) do not create a `mutations` row. The asset UPDATE still runs."
  - "`personal_context` is write-once. Captured at the moment of mutation, never edited afterward."
  - "Diary display reads asset names from the current `assets.name` via join. `mutations.asset_name` is the fallback for deleted assets only."
- Under "AI / Claude Integration Approach": add "Chat is a single continuous thread per user. `useChatSession`'s 24h localStorage TTL is a cache strategy, not a UX-level session boundary. `GET /api/messages` needs cursor pagination to support scroll-back."

**`docs/next-build-plan.md`** — add before the currency feature in the build order:

> ### Diary and chat scope cleanup (pre-redesign)
> Four small cleanups to land before or alongside the visual redesign — see `redesign-decisions.md`.
>
> 1. Remove inline note editor in `DiaryTab.tsx`, delete `PATCH /api/mutations/[id]` route, simplify search predicate.
> 2. Skip mutation insert on pure renames in `/api/chat` and `PATCH /api/assets/[id]`.
> 3. Make chat a single continuous thread: remove session-boundary affordances from `ChatPopup.tsx` and `/chat/page.tsx`. Add cursor pagination to `GET /api/messages`.
> 4. Diary join: display `assets.name` via join, fall back to `mutations.asset_name` for deleted assets. Same join in `/api/diary-summary` and the search predicate.
>
> Combined effort: ~1–1.5 days. No schema changes.

---

## Decision 5 — Settings is absorbed into Profile

**The change:** Drop the separate `/settings` route. The two settings the app actually needs — display currency and theme — live as a "Preferences" section on the Profile page. No gear icon, no settings sheet.

**Rationale:** Settings was always going to be small (just theme and currency at MVP). A separate route for two rows is structural overkill, and putting them on Profile is conceptually correct: Profile is where the user tells Vesper *how to be* — that includes the AI context fields and the display preferences. Same surface, same mental model.

**Implication for the currency feature:** `currency-feature-spec.md` Phase A explicitly creates `src/app/settings/page.tsx` as a new route. That plan is superseded. The currency picker lands on the Profile page in a new "Preferences" section instead. Phase A's other work (schema migration, `formatMoney`, `useDisplayCurrency` hook, `/api/users/me` PATCH endpoint) is unchanged.

**Code teardown:**

Frontend
- `src/app/profile/page.tsx` — add a "Preferences" section below the existing context fields. Two rows: Display currency and Theme. Each opens a picker (sheet or inline) on tap.
- `src/components/BottomNav.tsx` — no change. The plan had a pending decision about adding a 5th settings entry to the nav. That decision is now moot: there is no settings destination, only Profile.
- `src/lib/hooks.ts` — `useDisplayCurrency()` and a new `useTheme()` hook read the same `users` record.

Backend
- `src/app/api/users/me/route.ts` — PATCH endpoint handles both `display_currency` and `theme` fields via the same allowlist.
- Schema: add `theme text default 'auto' check (theme in ('auto', 'light', 'dark'))` to `users` in the same migration as `display_currency`. Single migration, two columns.

What stays
- All the math and rendering work specified in `currency-feature-spec.md` Phases B, C, D — unchanged. The only change is *where the picker lives*.

---

## Decision 6 — Avatar is user-editable, sourced from Google by default

**The change:** Users can change their avatar. On signup via Google OAuth, `users.avatar_url` is populated with the Google profile photo automatically (this already happens). New behavior: tap the avatar on the Profile page → photo picker → upload → store in Supabase Storage → overwrite `users.avatar_url`. Falls back to the initial letters of the user's name when no avatar is set.

**Rationale:** The avatar is a small but real identity touch. Auto-filling from Google removes setup friction; allowing override gives the user control without requiring it.

**Code teardown:**

Frontend
- `src/app/profile/page.tsx` — the avatar gets a tap target and a small camera-glyph affordance overlaid at the bottom-right. Tap opens a file picker. On select, upload to Supabase Storage and PATCH `users.avatar_url`.
- Smaller avatar instances (in the chat's user bubbles, e.g., if we add author indicators later) read the same `users.avatar_url` field.

Backend
- New Supabase Storage bucket `user-avatars` (or reuse `property-photos` with a `user-avatars/` prefix). RLS: users can only read/write files under their own `user_id` prefix.
- `src/app/api/users/me/route.ts` (the same PATCH endpoint from Decision 5) — accepts `avatar_url` in the allowlist.

What stays
- Initial-letter fallback when `avatar_url` is null or fails to load.
- The Google-OAuth-on-signup write path that already populates `avatar_url` — unchanged.

---

## Where to fold these into project docs

**`docs/current-features.md`**
- Under "Financial Diary": remove the "Inline expandable notes" bullet and the phrase "including locally-edited notes" inside the Search bullet.
- Under "Financial Diary": replace the implication that historical mutations show stored names with: "Diary entries display each asset's current name (via join to `assets`). Deleted assets fall back to the name preserved on the mutation row."
- Under "Conversational Assistant": add "The chat is presented as a single continuous thread per user. No 'new chat' or 'session history' UI is exposed. Users scroll back to revisit older exchanges."
- Under "Investor Profile (Self-Building)": add "Avatar is editable. Defaults to the Google profile photo on OAuth signup; users can override via tap-to-upload on the Profile page. Stored in Supabase Storage, referenced by `users.avatar_url`."
- Add a new section: "**Preferences (on Profile)** — Display currency (EUR/USD/GBP) and Theme (Auto/Light/Dark) pickers live as a 'Preferences' section on the Profile page. There is no separate `/settings` route."

**`docs/technical-decisions.md`**
- Under "Mutation / Diary Logging Rules": remove the `PATCH /api/mutations/[id]` bullet. Add:
  - "Pure renames (chat or UI edits where the only diff is the asset name) do not create a `mutations` row. The asset UPDATE still runs."
  - "`personal_context` is write-once. Captured at the moment of mutation, never edited afterward."
  - "Diary display reads asset names from the current `assets.name` via join. `mutations.asset_name` is the fallback for deleted assets only."
- Under "AI / Claude Integration Approach": add "Chat is a single continuous thread per user. `useChatSession`'s 24h localStorage TTL is a cache strategy, not a UX-level session boundary. `GET /api/messages` needs cursor pagination to support scroll-back."
- Under "Supabase Tables → users": add `theme text default 'auto' check (theme in ('auto', 'light', 'dark'))`. Note `avatar_url` already exists and is now user-editable.
- Add a new section "**User preferences endpoint**": describe `PATCH /api/users/me` with allowlist `{ display_currency, theme, avatar_url }`.

**`docs/currency-feature-spec.md`** (this file gets a small but important amendment, not a wholesale rewrite)
- Phase A: replace the row for `src/app/settings/page.tsx (new)` with: "Currency picker is added to `src/app/profile/page.tsx` in a new 'Preferences' section." Drop the BottomNav decision row entirely (no settings destination to surface).
- Phase A: the `src/app/api/users/me/route.ts` PATCH endpoint now also handles `theme` and `avatar_url`. Schema migration adds both `display_currency` and `theme` columns.

**`docs/next-build-plan.md`** — add before the currency feature in the build order:

> ### Diary, chat, and profile scope cleanup (pre-redesign)
> Six small cleanups to land before or alongside the visual redesign — see `redesign-decisions.md`.
>
> 1. Remove inline note editor in `DiaryTab.tsx`, delete `PATCH /api/mutations/[id]` route, simplify search predicate.
> 2. Skip mutation insert on pure renames in `/api/chat` and `PATCH /api/assets/[id]`.
> 3. Make chat a single continuous thread: remove session-boundary affordances from `ChatPopup.tsx` and `/chat/page.tsx`. Add cursor pagination to `GET /api/messages`.
> 4. Diary join: display `assets.name` via join, fall back to `mutations.asset_name` for deleted assets. Same join in `/api/diary-summary` and the search predicate.
> 5. Profile absorbs Settings: add Preferences section to `src/app/profile/page.tsx` with currency + theme rows. Drop the planned `/settings` route from the currency feature.
> 6. Avatar edit: tap-to-upload on Profile, store in Supabase Storage, write back to `users.avatar_url`. Google OAuth pre-fill remains.
>
> Combined effort: ~2 days. One schema migration (`users.theme` and `users.display_currency` added together).

---

## Decision 7 — Profile shows a one-line investor fingerprint, generated by Claude

**The change:** Below the name and email on the Profile page, a single italic-serif sentence characterizes the user as an investor — e.g., `Long-horizon investor concentrated in semiconductors and residential property.` This is personal, not factual. Factual stats (positions, countries, asset classes, largest holding) live on Portfolio.

**Rationale:** Profile is the user's personal space. The fingerprint reads like a private banker's one-line take on their client — characterization with restraint. Factual breakdowns belong on Portfolio where they're actionable; on Profile they would feel like a dashboard, not a description of a person.

**Code teardown:**

Backend
- `src/lib/profile-extractor.ts` — extend the extraction prompt to also emit a `fingerprint` field: a single-sentence characterization, 12–18 words, written in the tone of "Long-horizon investor concentrated in semiconductors and residential property." Stored in `users.profile` (jsonb) alongside the existing fields (`investment_style`, `concerns`, etc.).
- The extractor already runs after every non-onboarding chat. No new cron, no new endpoint.

Frontend
- `src/app/profile/page.tsx` — render `users.profile.fingerprint` in italic serif below the email. If the field is missing or null (e.g., new user before first extraction), render nothing in that slot. The identity block becomes just name + email until the first fingerprint exists.

What stays
- Everything else about `users.profile` and `profile-extractor.ts` — unchanged.

Cost
- Negligible. The fingerprint is one additional field on an extraction call that already runs. Same ~$0.003/conversation cost.

---

## Where to fold this into project docs

**`docs/current-features.md`** — under "Investor Profile (Self-Building)":
- Add a bullet: "Profile page renders a one-line investor fingerprint (italic serif) below the name and email. Generated by the profile extractor and stored at `users.profile.fingerprint`. Hidden for users where the field is null (new users pre-first-extraction)."

**`docs/technical-decisions.md`** — under "AI / Claude Integration Approach → Background profile extraction":
- Add to the extraction's output spec: "Also emits a `fingerprint` field — a single-sentence characterization of the user as an investor, 12–18 words, used on the Profile page."

**`docs/next-build-plan.md`** — add to the cleanup list:

> 7. Profile fingerprint: extend `profile-extractor.ts` to emit a `fingerprint` field on `users.profile`. Render it on the Profile page below the email; hide when null.
>
> Effort: 0.5 days. No schema change (uses existing `users.profile` jsonb).

---

## Decision 8 — Asset detail pages are read-only; all modifications happen via chat

**The change:** No inline editing, no delete button, no in-page "Discuss" CTA on any asset detail page (`TradeableDetail`, `RealEstateDetail`, `StaticDetail`). The detail page is a calm read-only view: identity, current state, history. All adds, edits, and removes happen via chat — where the act of saying the change captures the reasoning at the same moment.

**Navigation:** Each detail page has a top bar mirroring Portfolio's pattern: a back chevron on the left, a refresh icon on the right. The back button takes the user to wherever they navigated *from* — which may be Portfolio, Diary, or elsewhere, and is semantically distinct from tapping the Portfolio tab in the bottom nav (which always returns to Portfolio root). iOS edge-swipe handles the same return gesturally. Refresh forces a live-price re-fetch for this asset.

**Discuss behavior:** The Chat tab in the bottom nav becomes *context-aware* when the user is on an asset detail page. Tap Chat from `/asset/<id>` → chat opens seeded with an asset-specific prompt (e.g., `Tell me about my ASML position`). Tap Chat from anywhere else → chat opens cleanly. One affordance, no in-page redundancy.

**Rationale:** Every meaningful change has a *why*. Inline edits and a Delete button silently mutate state with no reasoning attached, leaving the diary inconsistent. Routing all modifications through chat means:
- The mental model is one: changes happen in conversation.
- The diary stays complete — every change has reasoning at the moment of the change.
- The detail page is a view, not an editor. Restful, focused, useful as a reference.

The cost is a few extra seconds of typing on rare data-correction cases. Worth it for the consistency win.

This composes with Decision 1 (notes immutable) and Decision 2 (pure renames not logged): *the diary is a complete, accurate, append-only record of decisions; changes happen in one place; the detail pages render the truth*.

**On computed vs settable fields**

Some fields are intrinsically derived and never directly settable, even by chat:
- `avg_buy` is calculated from the user's buy mutations. Chat doesn't set it — chat adds or removes buy mutations and `avg_buy` recomputes.
- `current_value` is `units × live_price`.
- `total_return` is `current_value − (units × avg_buy)`.

Chat-settable fields are the actual underlying ones: `units` (via add/edit/remove mutations), `value` for non-tradeable assets, mortgage fields, address, etc.

**Code teardown:**

Frontend
- `src/components/asset-detail/InlineEdit.tsx` — delete.
- `src/components/asset-detail/DeleteAssetButton.tsx` — delete.
- `src/components/asset-detail/ContextNotePrompt.tsx` — delete. The 5%-threshold prompt was a band-aid for inline edits lacking context; with no inline edits, no prompt needed.
- `src/app/asset/[id]/page.tsx` — page renders with a top bar containing back chevron (left) and refresh icon (right), mirroring Portfolio's `[identity] / [refresh + settings]` pattern. Refresh re-fetches this asset's live price.
- `src/components/asset-detail/TradeableDetail.tsx` — remove all inline-edit state, pencil-glyph affordances, edit-on-tap behavior. Render values as read-only. Drop Delete CTA. Drop in-page Discuss CTA.
- `src/components/asset-detail/RealEstateDetail.tsx` — same teardown. The 6 inline-editable property fields and the entire `MortgageBlock`'s 6 editable mortgage fields become read-only. Address re-geocoding on inline edit goes away (geocoding still happens on chat-initiated property adds).
- `src/components/asset-detail/StaticDetail.tsx` — same teardown.
- `src/components/MortgageBlock.tsx` — strip inline-edit UI. Still renders the payoff projection chart, TODAY marker, sub-stats — all read-only.
- `src/components/BondBlock.tsx` — strip inline-edit on issuer, coupon_rate, maturity_date, isin. Read-only display.
- `src/components/BottomNav.tsx` — when the current route matches `/asset/[id]`, the Chat tab href becomes `/chat?seed=<asset_name>` (or a similar query/state mechanism). The chat page reads the seed on mount and pre-fills the first prompt. Drop the seed when navigating away from asset detail.

Backend
- `src/app/api/assets/[id]/route.ts` PATCH handler — delete.
- `src/app/api/assets/[id]/route.ts` DELETE handler — delete.
- Fire-and-forget `writeSnapshot` calls that lived in these route handlers move to wherever the chat-side mutation happens (already in `/api/chat/route.ts`).
- `src/app/api/geocode/route.ts` — keep. Chat-initiated property adds still need it.

What stays
- The chat path is the source of truth for all asset modifications. `/api/chat/route.ts` handles add / edit / remove with `<changes>` blocks and `<context>` capture, exactly as today.
- The asset detail dispatch via `src/app/asset/[id]/page.tsx` — unchanged routing.

Migration consideration
- Existing data unaffected. No schema changes.
- One-time UX hint on first asset-detail view after the change ships: a thin top callout "Adjustments now live in chat" with a dismiss. Minor.

---

## Where to fold this into project docs

**`docs/current-features.md`** — under "Asset Detail Pages — Full Inline CRUD (Phase 2 Complete)":
- Rename the section to "Asset Detail Pages (Read-Only)".
- Remove every "inline-editable" bullet across Tradeable, Real Estate, and Static.
- Remove the pencil-glyph mention.
- Remove the `DeleteAssetButton` mention.
- Remove the `ContextNotePrompt` mention.
- Add: "All asset modifications happen via chat. The detail pages are read-only views with a single `Discuss with Vesper` action that opens chat seeded with the asset as context."

**`docs/technical-decisions.md`**
- Under "Backend / Database Stack" API routes list: remove `PATCH /api/assets/[id]` and `DELETE /api/assets/[id]` (the chat path uses Supabase directly).
- Under "Mutation / Diary Logging Rules": remove the bullet about "Manual UI changes via PATCH/DELETE on `/api/assets/[id]` also write rows" — there is no manual UI change path.

**`docs/next-build-plan.md`** — append to the cleanup list:

> 8. Asset detail pages become read-only. Delete `InlineEdit.tsx`, `DeleteAssetButton.tsx`, `ContextNotePrompt.tsx`. Strip inline-edit and delete UI from all three detail variants and `MortgageBlock` / `BondBlock`. Delete `PATCH` and `DELETE` handlers on `/api/assets/[id]`. Wire `Discuss` link on each detail page to open chat with an asset-seeded prompt.
>
> 9. Drop user-uploaded property photos. `RealEstateDetail.tsx` always renders the auto-generated map. Update `PropertyMap.tsx` to a light-theme MapLibre style (dark variant when dark theme ships).
>
> 10. Mortgage balance auto-amortizes invisibly. Add `computeCurrentBalance(asset)` to `src/lib/mortgage.ts`, replace direct reads of `assets.mortgage_balance` in `MortgageBlock.tsx` and `RealEstateDetail.tsx`. Routine monthly amortization is never logged; notable events (extra payment, refinance, value update) continue to log via chat. No cron job.
>
> Effort: ~1–1.5 days for decisions 8–10 combined. No schema changes (Decision 10 may eventually want a small column rename to `mortgage_initial_balance`, deferred).

---

## Decision 9 — Property visual is the auto-generated map; no user photo upload

**The change:** Real estate detail pages always show the auto-generated map as the property's visual. Users cannot upload a photo to replace it. The PropertyMap component renders MapLibre with OpenFreeMap tiles, caches the result as a PNG to Supabase Storage on first render, and serves the cached PNG on subsequent loads.

**Rationale:** Maps win on every axis that matters for a portfolio tool:
- They're objective and require zero user effort.
- They show *where* the property is, which is the fact that matters for a money app (currency, country risk, geography).
- They're uniform across the app — no users with photos getting "richer" pages.
- Vesper isn't Funda or Zillow. Those apps care about what a property looks like because they're selling it. Vesper cares about the user's net worth. Look-and-feel is irrelevant.

Users see their house every day. They don't need Vesper to render a photo of it.

**Code teardown:**

Frontend
- `src/components/asset-detail/RealEstateDetail.tsx` — remove photo-upload UI (file picker, upload progress, photo/map toggle). The PropertyMap is always rendered.
- `src/components/PropertyMap.tsx` — unchanged in behavior, but the map style needs to be updated to the light theme to match the locked design (previously was a custom dark style). When dark theme ships (Decision 5 absorbed Settings), a dark map style variant is added.

Backend
- The `property-photos` Supabase Storage bucket — keep, but it now only holds auto-cached map PNGs. Worth renaming to `property-maps` for clarity when convenient (not blocking).
- The `photo_url` field on `assets` — keep for now; will populate only with the cached map URL going forward. A future migration could drop the column if confidence holds.

What stays
- Map auto-render and PNG caching on first view — unchanged.
- "Open in Maps" deep-link affordance on the map — keep; takes the user to Apple/Google Maps with the address.

---

## Decision 10 — Mortgage balance auto-amortizes invisibly; only notable events are logged

**The change:** The user enters mortgage values once at setup (`mortgage_balance`, `mortgage_rate`, `monthly_payment`, `mortgage_type`, `mortgage_start_date`). After that, the displayed mortgage balance decreases automatically based on the amortization formula — silently, in the background, with no UI affordance and no diary entry per month. The user opens the app and just sees their equity slowly grow.

Notable events — extra principal payments, refinances, rate changes, property value updates — *are* logged to the diary with reasoning, captured via chat.

**Rationale:**

The user shouldn't have to do bookkeeping the system can do. Monthly amortization is not a decision; it's a continuous consequence of a single past decision. Twelve identical "payment processed" entries per year per property would drown the activity timeline with no reasoning to capture.

Manual balance entry every month is friction the user doesn't need. Auto-amortization in the background means the equity number is always honest, without asking the user to maintain it.

**How it works:**

```
current_balance(today)  = amortize(initial_balance, rate, payment, type, start_date, today)
                          − sum(extra principal payments logged after start_date)

current_value           = last user-stated value (or last auto-WOZ-fetched value)

equity(today)           = current_value − current_balance(today)
```

The amortization formula serves two purposes:
1. Computing today's balance silently for display
2. Projecting the future curve in the payoff chart (already in place)

Same math, two uses.

**What the user sees:**

- Mortgage section: balance, rate, payment, type, mortgage-free date — all read as current values, decreasing silently month by month
- Equity hero: also moves silently as balance shrinks and/or value updates
- Payoff projection chart: TODAY marker walks forward across the curve over time
- Activity: only notable events ever appear (purchase, extra payment, refinance, value update). No monthly amortization entries.

**Property value:**

Stays as a stored field, updated when the user states a new value via chat. Future: WOZ auto-fetch for Dutch properties (annual), market-data API fetches for other countries. None of that blocks the current design — `current_value` is just whatever was last written to the field.

**On balance recalibration:**

If the user states a balance that differs from what the formula computes (because they paid extra without logging, or the rate changed unrecorded), treat the stated value as a re-anchor: store the new balance as the new `mortgage_balance`, update `mortgage_start_date` (or a separate anchor field) to today, and amortization continues from this new baseline. Implementation can decide whether to use a separate anchor-date column or treat `mortgage_balance` + `mortgage_start_date` as a moving pair — both work.

**Code:**

Backend
- `src/lib/mortgage.ts` (or `mortgage-projection.ts`) — extend the existing amortization helper with a `computeCurrentBalance(asset, asOf = today)` function. The payoff projection chart already uses the same formula for future values.
- `src/components/MortgageBlock.tsx` and `RealEstateDetail.tsx` — read the displayed balance via `computeCurrentBalance(asset)`, not raw `assets.mortgage_balance`.
- `assets.mortgage_balance` continues to store the balance at the most recent anchor point (initial setup or last recalibration). Worth renaming to `mortgage_initial_balance` for clarity if convenient — not blocking.
- No cron job. The computation runs on read.

Diary
- Notable events (extra payment, refinance, rate change, value update, purchase, sale) → logged via chat as today, with Claude's `<context>` capturing reasoning.
- Monthly amortization → never logged. Invisible.

What stays
- All five mortgage input fields on `assets` — unchanged.
- The payoff projection chart — unchanged.
- Property value as a manually-updated stored field — unchanged. Auto-WOZ is future work.

---

## Decision 11 — Cash is purpose-pot, not bank-account

**The change:** Cash positions are mental-accounting pots, not bank accounts. The user names them by purpose (`Emergency fund`, `Tax money`, `House deposit`, `Travel fund`) rather than by where the money is held (`ABN AMRO savings`, `Trade Republic`, `Wise USD`). All cash entries use the same generic wallet icon — no bank logo lookup, no Clearbit integration for cash providers.

**Rationale:** Vesper is a ledger, not a bank aggregator. Other apps (Mint, Plaid-based tools) already integrate with banks. Vesper's value is in helping the user *think* about their money. Mental-accounting pots are how this kind of investor actually organizes cash: "I have €18k earmarked for emergencies" is a financial decision; "I have €18k at ABN AMRO" is bookkeeping. The pots framing also makes the Portfolio's positions list and the Diary more readable — names communicate purpose, not provider.

This same principle extends to **pension** entries: they are pots (retirement savings) regardless of which provider holds them. Same generic visual treatment.

**Bonds are the exception** — bonds reference a specific issuer (Dutch Government, Apple, etc.), and the issuer materially affects risk and yield. Bonds get a certificate-style icon and an issuer field as part of their detail block.

**Code:**

Frontend
- `src/components/AssetLogo.tsx` — for `type='cash'` and `type='pension'`, render a generic wallet SVG. No Clearbit lookup, no monogram fallback (the wallet IS the universal symbol).
- For `type='bonds'`, render a certificate SVG. Issuer name appears in the bonds detail block on the asset detail page, not as the logo source.
- `src/components/asset-detail/StaticDetail.tsx` — same icon resolution.

Onboarding / chat prompts
- `src/lib/claude.ts` — when the user adds a cash position, the assistant's prompts should encourage purposeful naming ("What's this for — emergencies, taxes, a future purchase?") rather than asking which bank holds it. The bank doesn't matter to Vesper.
- When chat receives an asset add with a bank-style name (`ABN AMRO savings`, `HSBC current`), the assistant can suggest a purposeful alternative — but never forces it. Existing users who prefer bank naming keep that.

Data model
- No schema changes. The existing `name` and `value` fields on `assets` work fine. The `bank` or `provider` concept simply doesn't exist as a tracked field.
- For bonds, `issuer`, `coupon_rate`, `maturity_date`, `isin` already exist and remain.

What stays
- Currency on cash positions — kept as transparency metadata for users with foreign-currency holdings (a USD savings pot shows €-equivalent in the hero with USD as the native-currency hint). The pot framing doesn't override the currency-feature-spec.
- Pension as a type — kept distinct from cash for asset-class breakdown (pension = reserves but less liquid). Same icon, different `type`.

---

## Source of truth

This file. If anything in `current-features.md`, `technical-decisions.md`, `currency-feature-spec.md`, or `next-build-plan.md` contradicts the rules above after the work ships, those docs are stale and need updating.

Supersedes the earlier `diary-note-immutability-decision.md` — same scope, broader name, all decisions in one place.

This file. If anything in `current-features.md`, `technical-decisions.md`, `currency-feature-spec.md`, or `next-build-plan.md` contradicts the rules above after the work ships, those docs are stale and need updating.

Supersedes the earlier `diary-note-immutability-decision.md` — same scope, broader name, all decisions in one place.
