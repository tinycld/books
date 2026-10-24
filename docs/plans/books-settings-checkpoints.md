# books-settings — checkpoint plan

Spec: `docs/specs/books-settings-design.md`. Ledger: `docs/plans/books-settings-ledger.md`. All paths are relative to the `books` package root. Package files that Metro loads import each other relatively (`../lib/x`), never with `~/tinycld/books/...`. The fixture `tinycld/books/lib/books-settings-fixture.ts` feeds the scratch route `screens/helix-mockup.tsx` and the tests. Reference screenshots: `docs/plans/books-settings-reference/<shot>-<390|1280>-<light|dark>.png`. Core pieces used: `useCurrentRole` (`@tinycld/core/lib/use-current-role`), `recoverLiveQueries` (`@tinycld/core/lib/recover-live-queries`), `LoadingState` (`@tinycld/core/components/LoadingState`), `Avatar` (`@tinycld/core/components/Avatar`), `ConfirmDialog` and `Dialog` (`@tinycld/core/ui/ConfirmDialog`, `@tinycld/core/ui/dialog`), the bottom sheet (`@tinycld/core/ui/bottom-drawer`), `DateField` (`@tinycld/core/ui/forms/fields/DateField`), `useToastStore` (`@tinycld/core/lib/stores/toast-store`), and from `@tinycld/core/ui/form`: `useForm`, `zodResolver`, `z`, `TextInput`, `TextAreaInput`, `SelectInput`, `Toggle`, `FormErrorSummary`. No Go change is needed: the server already enforces every rule this screen shows (admin-only writes, pinned currency, close-date format and pending auto-reversal check, forward-only sequences, override expiry rules). Server refusals are message-only (`refuse(...)` carries no field key), so a form shows them through `setError('root', ...)` for `FormErrorSummary`, or on a named field where the spec says so, using the `messageOnlyRefusal` pattern of `useAccountForm`. Past units' memories that apply: a mutation or refusal hook test uses `tests/accounts-form-harness.ts` and `tests/silence-log.ts`; `useLiveQuery` takes `{ query, queryKey }`; a menu or dialog press must not bubble to a row; layout columns never collapse to blank (minWidth plus ellipsis); money and dates never use float arithmetic in a screen. The setup-wizard lesson (a preview shows no per-group counts or count chips) does not apply here: no checkpoint draws counts except the history link text the spec names.

### Checkpoint 1 — Company fields and collections

**Delivers:** the five company fields on `books_settings`, the `user` and `granted_by` relations Books needs for materialized reads, and a fixture typed against the generated schema.

**Files:**
- Modify: `pb-migrations/2100000001_create_books_settings.js` (add `tax_id` text max 20, `address` text max 500, `phone` text max 40, `email` text max 200, `website` text max 200, all optional, next to `business_name`; edited in place because Books is unreleased; the seeded row sets each to the empty string)
- Modify: `tinycld/books/collections.ts` (`books_close_overrides` relations gain `granted_by: coreStores.users`; `books_access` gains `relations: { user: coreStores.users }`)
- Modify: `tinycld/books/lib/books-settings-fixture.ts` (delete the local `CompanyDetails` interface; `SettingsRow` becomes `export type SettingsRow = BooksSettings`; `COMPANY_SETTINGS`, `LONG_COMPANY_SETTINGS` and `EMPTY_SETTINGS` are typed with `satisfies BooksSettings`)
- Modify: `tinycld/books/screens/helix-mockup.tsx` (scratch route: follow the fixture change; remove any import of `CompanyDetails`)
- Modify: `tinycld/books/seed.ts` (one comment line: the settings row is not seeded from the fixture, because the fixture holds fake user ids and `setup_completed: true`, which would hide the setup card the setup e2e opens; settings e2e fills the fields through the UI)
- Modify: `tests/collections-real.test.ts` (the test writer adds the cases below; it goes under Out-of-plan changes)
- Test: `server/company_settings_test.go` · `tests/collections-real.test.ts`

**Interfaces:**
- Consumes: `BooksSettings`, `BooksCloseOverrides`, `BooksDocSequences` from `tinycld/books/types.ts`; `coreStores.users` from `CoreStores`
- Produces:
  - `books_settings.tax_id`, `address`, `phone`, `email`, `website` (all `string`) in the generated types
  - `books_access` materializes `user` (a `users` row); `books_close_overrides` materializes `user` and `granted_by`
  - `SettingsRow = BooksSettings` in the fixture

**Gates:** 1 · 3 (nothing renders)

**Spec:**
- "Fields: Legal business name (required, max 200, the existing `business_name`), Tax ID (EIN, optional, max 20), Business address (optional, multiline, max 500), Phone (optional, max 40), Email (optional, valid email, max 200), Website (optional, max 200, an address that starts with `http://` or `https://`, or empty)."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `server/company_settings_test.go` — an admin can set each of `tax_id`, `address`, `phone`, `email`, `website` on the settings row; a bookkeeper and a read-only user are refused; a `tax_id` of 21 characters and a `website` of 201 characters are refused; the seeded row has every new field empty; the `currency` field stays pinned. Use the helpers in `server/config_rules_test.go`.
- `tests/collections-real.test.ts` — with real pbtsdb collections: a `books_settings` row carries the five new string fields; a live query over `books_access` with `materialize()` of `user` returns the user's `name` and `email`; a live query over `books_close_overrides` with `materialize()` of `user` and `granted_by` returns both users, and a missing `granted_by` gives `undefined` without dropping the override.

**Do:**
1. In the migration add the five fields after `business_name`: `{ name: 'tax_id', type: 'text', max: 20 }`, `{ name: 'address', type: 'text', max: 500 }`, `{ name: 'phone', type: 'text', max: 40 }`, `{ name: 'email', type: 'text', max: 200 }`, `{ name: 'website', type: 'text', max: 200 }`. Set each to `''` in the seeded row. Update the header comment to name them. Run `pnpm run packages:generate` in the workspace's `tinycld/` directory so the generated types carry them.
2. In `collections.ts` add the two relation entries. If tsc rejects `relations` on `books_access` (a view), use the `Object.assign` pattern already used for `books_journal_lines`, and let `tests/collections-real.test.ts` prove it.
3. In the fixture delete `CompanyDetails`, set `export type SettingsRow = BooksSettings`, and use `satisfies BooksSettings` on the three settings constants so tsc checks every field. Follow the renamed types in the scratch route.
4. Add the one comment line to `seed.ts`; no seed data changes.

### Checkpoint 2 — Settings schemas and pure helpers

**Delivers:** the zod schemas, the doc type labels, the access level rules, the override split, and the number preview, all pure and unit tested.

**Files:**
- Create: `tinycld/books/lib/settings-schema.ts`
- Create: `tinycld/books/lib/doc-types.ts`
- Create: `tinycld/books/lib/access-levels.ts`
- Create: `tinycld/books/lib/overrides.ts`
- Create: `tinycld/books/lib/settings-sections.ts`
- Test: `tests/settings-schema.test.ts` · `tests/doc-types.test.ts` · `tests/access-levels.test.ts` · `tests/overrides.test.ts` · `tests/settings-sections.test.ts`

**Interfaces:**
- Consumes: `BooksSettings`, `BooksDocSequences`, `BooksCloseOverrides` from `tinycld/books/types.ts`; `BooksLevel` from `tinycld/books/lib/access.ts`; `FISCAL_MONTHS` from `tinycld/books/lib/setup-schema.ts`; `formatDay` from `tinycld/books/lib/register-range.ts`; `z` from `@tinycld/core/ui/form`
- Produces:
  - `companySchema`, `type CompanyValues`, `companyValues(row: BooksSettings): CompanyValues` (all six fields as strings; `business_name` trimmed 1 to 200, `tax_id` max 20, `address` max 500, `phone` max 40, `email` empty or a valid address max 200, `website` empty or starting `http://` or `https://`, max 200)
  - `fiscalYearSchema`, `type FiscalYearValues = { fiscal_year_start_month: number }` (integer 1 to 12)
  - `closeDateSchema`, `type CloseDateValues = { closed: boolean; close_date: string }` (when `closed` is true, `close_date` must be `YYYY-MM-DD` and a real calendar day), `closeDateValue(values: CloseDateValues): string` (the `books_settings.close_date` to save: `''` when not closed), `closeDateValues(row: BooksSettings): CloseDateValues`, `isReopening(current: string, next: CloseDateValues): boolean` (true when `current` is not empty and `next` is not closed or is dated earlier than `current`)
  - `LASTS_FOR_OPTIONS: { value: LastsFor; label: string; ms: number }[]` with `type LastsFor = '24h' | '7d' | '30d'` (labels "24 hours", "7 days", "30 days"), `DEFAULT_LASTS: LastsFor`
  - `overrideSchema`, `type OverrideValues = { user: string; reason: string; lasts: LastsFor }` (`user` non-empty, `reason` trimmed 3 to 500)
  - `sequenceSchema`, `type SequenceValues = { prefix: string; next_number: string }`, `sequenceValues(row: BooksDocSequences): SequenceValues`, `sequenceUpdate(values: SequenceValues): { prefix: string; next_number: number }`
  - `docTypeLabel(docType: string): string`, `nextNumberPreview(docType: string, prefix: string, next: string): string`
  - `ACCESS_LEVELS: { value: BooksLevel; label: string; description: string }[]` (order none, read_only, bookkeeper, admin), `levelDescription(level: BooksLevel): string`, `levelLabel(level: BooksLevel): string`
  - `type OrgRole = 'owner' | 'admin' | 'member' | 'guest'`
  - `accessRowControl(input: { viewerOrgRole: OrgRole; viewerIsSelf: boolean; targetOrgRole: OrgRole; level: BooksLevel }): { lockedText: string | null; options: BooksLevel[]; disabledText: string | null }`
  - `levelPlan(input: { userId: string; level: BooksLevel; targetOrgRole: OrgRole; coreRow: { id: string; access: CoreAccess } | undefined; adminRow: { id: string } | undefined }): LevelWrite[]` with `type CoreAccess = 'none' | 'readonly' | 'full'` and `type LevelWrite = { table: 'org_pkg_access'; op: 'insert'; access: CoreAccess } | { table: 'org_pkg_access'; op: 'update'; id: string; access: CoreAccess } | { table: 'books_admins'; op: 'insert' } | { table: 'books_admins'; op: 'delete'; id: string }`
  - `levelWrites(level: BooksLevel): { access: CoreAccess; adminRow: boolean }`
  - `filterPeople<T extends { name: string; email: string }>(people: readonly T[], text: string): T[]`
  - `splitOverrides<T extends { expires_at: string }>(rows: readonly T[], now: Date): { active: T[]; past: T[] }` (classified by `expires_at` only: a row whose `expires_at` is after `now` is active, every other row is past; expired and revoked rows are not told apart), `expiryFrom(lasts: LastsFor, now: Date): string` (PocketBase datetime text `YYYY-MM-DD HH:mm:ss.SSSZ`), `formatExpiry(expiresAt: string): string` ("Nov 3, 2026, 5:00 PM" in the viewer's zone), `ownOverrideLine(row: { expires_at: string; reason: string }): string`
  - `type SectionId = 'company' | 'accounting' | 'numbering' | 'access'`, `SETTINGS_SECTIONS: { id: SectionId; label: string; adminOnly: boolean }[]` (only the sections built so far), `visibleSections(isAdmin: boolean): { id: SectionId; label: string; adminOnly: boolean }[]`, `sectionSummary(id: SectionId, data: { settings: BooksSettings | undefined; sequenceCount: number }): string`

**Gates:** 1 · 3 (nothing renders)

**Spec:**
- "Fields: Legal business name (required, max 200, the existing `business_name`), Tax ID (EIN, optional, max 20), Business address (optional, multiline, max 500), Phone (optional, max 40), Email (optional, valid email, max 200), Website (optional, max 200, an address that starts with `http://` or `https://`, or empty)."
- "Close the books: a switch. Off means no period is closed (`close_date` empty). On shows a Closing date field (`DateField`, `YYYY-MM-DD`, a real calendar day) and the explanation "Entries dated on or before this day cannot be posted unless the person holds an override.""
- "Overrides panel (admin), below the block, drawn only while a close date is set: - Active overrides first, each row: person, reason, "Expires Nov 3, 2026, 5:00 PM", "Granted by <name>", a Revoke action. History below, collapsed behind "Show past overrides (n)": expired and revoked rows without actions. - "Grant an override" opens a form (dialog on web and tablet, bottom sheet on phones): Person (select of users whose level is bookkeeper or admin), Reason (required, 3 to 500 characters), Lasts for (24 hours, 7 days, 30 days; default 24 hours). Submit is "Grant override". The expiry is the submit time plus the chosen length. - Revoke asks "Revoke <name>'s override?" and on confirm sets `expires_at` to now. The row moves to history. An override is never deleted. - Empty: "No one can post into the closed period." with the Grant button. - With no close date: the panel reads "Set a close date to grant overrides." with no button."
- "Fields: Prefix (letters, digits, hyphen; max 10; may be empty) and Next number (whole number, 1 to 999999999). A live preview under them: "Next entry: JE-1001" (prefix plus number, no padding: the same join the server uses)."
- "A list of every user: avatar, name, email, level chip, and the control. Level select has none, read-only, bookkeeper, admin. Under the select a one-line description of the chosen level. Descriptions: None "Cannot open Books." Read-only "Can see everything and change nothing." Bookkeeper "Can enter and post entries and manage accounts. Cannot change settings." Admin "Everything a bookkeeper can do, plus settings, access, and close-date overrides.""
- "Who may change what, from core's rules: org owners and admins can set all four levels. A Books admin who is not an org owner or admin can only switch a bookkeeper to admin and back (the `books_admins` grant); the select is disabled with the text "Ask an organization owner or admin to change this.""
- "Org owners and admins always resolve to admin: their row is locked with "Organization owner" or "Organization admin". The signed-in person's own row is locked with "You cannot change your own access.""
- "Writes: none -> `org_pkg_access` row `access: 'none'`; read-only -> `readonly`; bookkeeper -> `full`, and delete any `books_admins` row; admin -> `full` and a `books_admins` row. A row of `org_pkg_access` is created or updated when the change requires it. These writes go through `useMutation` as one yielded sequence; a failure stops and shows the server message on the row."
- "Search box over name and email (client filter of the loaded rows; the user list is at most a few dozen in the target audience, 1 to 50 staff). Empty search result: "No one matches <text>.""

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/settings-schema.test.ts` — `companySchema` rejects a blank or whitespace-only `business_name`, rejects 201 characters and accepts 200, trims the name; rejects `tax_id` of 21 and accepts 20; rejects `address` of 501 and accepts 500; rejects `phone` of 41 and accepts 40; accepts an empty `email` and `a@b.co`, rejects `not-an-email` and a 201 character address; accepts an empty `website`, `http://a.example` and `https://a.example/x`, rejects `ftp://a.example`, `a.example` and a 201 character address. Each failure carries a non-empty message.
- `tests/settings-schema.test.ts` — `fiscalYearSchema` rejects 0, 13 and 1.5 and accepts 1 and 12. `closeDateSchema` accepts `{ closed: false, close_date: '' }`, accepts `{ closed: true, close_date: '2026-02-28' }`, rejects `{ closed: true, close_date: '' }`, `2026-02-30`, `2026-13-01`, `26-02-28` and `2026-2-8`; `closeDateValue` returns `''` when not closed. `isReopening('2026-09-30', { closed: true, close_date: '2026-09-29' })` is true, the same date and a later date are false, `{ closed: false, close_date: '' }` is true, and an empty `current` is always false.
- `tests/settings-schema.test.ts` — `overrideSchema` rejects an empty `user`, a reason of 2 characters and of 501, accepts 3 and 500, trims the reason, rejects a `lasts` outside the three presets. `sequenceSchema` accepts an empty prefix, `JE-`, `AB12` and a 10 character prefix; rejects an 11 character prefix and `A_1` and `A 1`; accepts `1` and `999999999`; rejects `0`, `1000000000`, `1.5`, `-3` and an empty number. `sequenceUpdate` turns `{ prefix: 'JE-', next_number: '1001' }` into the number 1001.
- `tests/doc-types.test.ts` — `docTypeLabel('journal')` is "Journal entries"; an unknown doc type returns the raw string; `nextNumberPreview('journal', 'JE-', '1001')` is "Next entry: JE-1001"; an empty prefix gives "Next entry: 1001"; no padding is added to `7`; an unknown doc type `quote` gives "Next number: Q-5" for prefix `Q-` and `5`; an invalid next number (empty or not whole) gives a preview of only the prefix label with no number and does not throw.
- `tests/access-levels.test.ts` — `ACCESS_LEVELS` has the four levels in order with the exact descriptions "Cannot open Books.", "Can see everything and change nothing.", "Can enter and post entries and manage accounts. Cannot change settings." and "Everything a bookkeeper can do, plus settings, access, and close-date overrides."; `levelWrites` gives none to `none` with no admin row, read_only to `readonly`, bookkeeper to `full` with no admin row, admin to `full` with an admin row.
- `tests/access-levels.test.ts` — `accessRowControl`, in this order of precedence: a target whose org role is `owner` or `admin` gets `lockedText` "Organization owner" or "Organization admin" (also when it is the viewer's own row) and no options; otherwise the viewer's own row gets `lockedText` "You cannot change your own access." and no options; otherwise an org owner or admin viewer gets all four levels as options and no `disabledText`; otherwise (a Books admin by grant) a target at `bookkeeper` or `admin` gets options `['bookkeeper', 'admin']` and no `disabledText`, and a target at `none` or `read_only` gets no options and `disabledText` "Ask an organization owner or admin to change this."
- `tests/access-levels.test.ts` — `levelPlan`: none for a member with no core row inserts an `org_pkg_access` row `none`; read_only with a core row `full` updates it to `readonly`; bookkeeper with core row `full` and an admin row deletes only the admin row (no core write); admin with core row `full` and no admin row inserts only the admin row; admin with core row `readonly` updates the core row to `full` and inserts the admin row; a guest target without a core row and level bookkeeper inserts the `full` core row; a member target without a core row and level bookkeeper writes no core row. `filterPeople` matches name and email case-insensitively, trims the text, and returns all rows for blank text.
- `tests/overrides.test.ts` — `splitOverrides` puts a row whose `expires_at` is after `now` in `active` and a row at or before `now` in `past`, and keeps the input order inside each; `expiryFrom('24h', now)` is exactly 24 hours later, `'7d'` 7 days and `'30d'` 30 days, in the PocketBase datetime format; `ownOverrideLine` reads "You can post into the closed period until Nov 3, 2026 (reason: Year-end adjustments)." for the fixture's own override; `formatExpiry` gives "Nov 3, 2026, 5:00 PM" for `2026-11-03 17:00:00.000Z` with the test's `TZ` set to `UTC`.
- `tests/settings-sections.test.ts` — `visibleSections(false)` has no entry with `adminOnly` true and `visibleSections(true)` has every entry in the order of `SETTINGS_SECTIONS`; `sectionSummary('accounting', ...)` reads "Fiscal year starts in January" for month 1 and names July for month 7, and, when a close date is set, appends "; books closed through Sep 30, 2026" after the fiscal-year text (so the line starts with "Fiscal year starts in"), which is also the phone summary line; `sectionSummary('company', ...)` is the business name, and "Name your business" when it is empty.

**Do:**
1. Create `lib/settings-schema.ts` with the schemas above, a message per rule (for example "Enter the legal business name", "Enter a valid email address", "Enter a web address that starts with http:// or https://", "Enter a real date as YYYY-MM-DD", "Enter a reason of at least 3 characters"). The real-calendar-day check builds a `Date` from the parts and compares them back.
2. Create `lib/overrides.ts` with `LASTS_FOR_OPTIONS`, `DEFAULT_LASTS`, `splitOverrides`, `expiryFrom`, `formatExpiry`, `ownOverrideLine` (it uses `formatDay` for the date part). `splitOverrides` compares `expires_at` with `now` only.
3. Create `lib/doc-types.ts`: `DOC_TYPES: Record<string, { label: string; noun: string }>` with `journal: { label: 'Journal entries', noun: 'entry' }`, `docTypeLabel` and `nextNumberPreview` (the prefix and the number joined with no padding; the label falls back to the raw doc type and the noun to "number").
4. Create `lib/access-levels.ts`: the constants, `levelWrites`, `accessRowControl`, `levelPlan` and `filterPeople`. `levelPlan` writes the core row only when its access would change, where an absent core row means `none` for a guest and `full` for any other role (the default the `books_access` view applies), so a Books admin who is not an org owner or admin never issues a core write.
5. Create `lib/settings-sections.ts` with only the `company` section now (label "Company", not admin only) and the helpers; later checkpoints append their section here. `sectionSummary` returns the business name or "Name your business" for company, "Fiscal year starts in <month>" plus the close date clause for accounting, "1 document type" or "<n> document types" for numbering and "Who can open Books" for access.

### Checkpoint 3 — Settings and numbering hooks

**Delivers:** the hooks that read the settings row and sequences, and the form hooks that save them with refusals shown and a "Saved." toast.

**Files:**
- Create: `tinycld/books/hooks/useBooksSettings.ts`
- Create: `tinycld/books/hooks/useSettingsForm.ts`
- Create: `tinycld/books/hooks/useDocSequences.ts`
- Create: `tinycld/books/hooks/useSequenceForm.ts`
- Create: `tinycld/books/lib/refusal.ts` (`messageOnlyRefusal`, moved unchanged out of `hooks/useAccountForm.ts`)
- Modify: `tinycld/books/hooks/useAccountForm.ts` (import `messageOnlyRefusal` from `../lib/refusal`)
- Modify: `tests/accounts-form-harness.ts` (the test writer adds `books_doc_sequences` as a seeded local-only collection and a `refuseSequences` option; it goes under Out-of-plan changes)
- Test: `tests/useSettingsForm.test.tsx` · `tests/useSequenceForm.test.tsx`

**Interfaces:**
- Consumes: `companySchema`, `fiscalYearSchema`, `closeDateSchema`, `sequenceSchema`, `SequenceValues`, `sequenceValues`, `sequenceUpdate`, `nextNumberPreview` from checkpoint 2; `useStore` from `@tinycld/core/lib/pocketbase`; `useMutation` from `@tinycld/core/lib/mutations`; `recoverLiveQueries`; `useToastStore`
- Produces:
  - `useBooksSettings(): { settings: BooksSettings | undefined; isReady: boolean; hasLoadError: boolean; retryLoad: () => void }`
  - `useSettingsForm<V extends FieldValues>(options: { schema: ZodType<V>; values: V; toPatch: (values: V) => Partial<BooksSettings>}): { form: UseFormReturn<V>; submit: () => void; isPending: boolean; isDirty: boolean }` (`toPatch` returns only fields that exist on `books_settings`; a message-only refusal goes to `form.setError('root', ...)`; success shows the toast "Saved." and resets the form to the saved values)
  - `useDocSequences(): { sequences: BooksDocSequences[] | undefined; isReady: boolean; hasLoadError: boolean; retryLoad: () => void }` (ordered by `doc_type`)
  - `useSequenceForm(sequence: BooksDocSequences): { form: UseFormReturn<SequenceValues>; submit: () => void; isPending: boolean; isDirty: boolean; preview: string }` (the refusal shows under `next_number`; `preview` is `nextNumberPreview` of the live form values)
  - `messageOnlyRefusal(error: unknown): string | null` from `lib/refusal`

**Gates:** 1 · 3 (nothing renders)

**Spec:**
- "One Save button, enabled when the form has changes. Save writes one `books_settings` update. A refusal shows in `FormErrorSummary`."
- "Fiscal year starts in: month select, January to December (the existing `FISCAL_MONTHS`). Helper text: "Reports use this from now on. No entries change." Saves independently of the close-date block."
- "Save per card. A refusal from the server ("Numbers up to 1000 are already used. The next number must be 1001 or higher.") shows under the Next number field."
- "Loading: `LoadingState` until the settings row, and access, are ready. Load error: message with Retry through `recoverLiveQueries`."
- "Save success: a toast "Saved." and the form resets to the saved values."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/useSettingsForm.test.tsx` — with the real local-only collections from `tests/accounts-form-harness.ts` (`seedBooks`, `holdWrites`, `enteredWrites`, `messageRefusal`): a company edit that changes only the phone produces exactly one `books_settings` update carrying the new phone; `isDirty` is false before an edit and true after; after a successful save `isDirty` is false again and the form holds the saved values; a blank `business_name` blocks the write with the schema message and no write reaches the collection; a message-only refusal lands on `form.formState.errors.root` and the form keeps the typed values.
- `tests/useSettingsForm.test.tsx` — a fiscal-year save writes only `fiscal_year_start_month`; a close-date save writes only `close_date` (`closeDateValue` of the values) and leaves `fiscal_year_start_month` as it was, so the two blocks save independently; a second `submit` while a write is held adds no second write. The "Saved." toast is pushed to the real toast store once per success and not on a refusal.
- `tests/useSequenceForm.test.tsx` — editing prefix and next number writes one `books_doc_sequences` update with the prefix and the number as an integer; `preview` follows the live values ("Next entry: JE-1001" then "Next entry: AB-7" after typing); a refusal "Numbers up to 1000 are already used. The next number must be 1001 or higher." lands on `errors.next_number`; an invalid prefix such as `A_1` blocks the write with the schema message.
- `tests/useSettingsForm.test.tsx` — `useBooksSettings` reports `isReady` false until the row loads and then returns the row; a load failure sets `hasLoadError` and `retryLoad` recovers (use the load-failure setup of `tests/setup-parts.test.tsx`).

**Do:**
1. Create `lib/refusal.ts` by moving `messageOnlyRefusal` out of `useAccountForm.ts` without changing it; update the import and run the account form tests.
2. Create `hooks/useBooksSettings.ts`: one `useLiveQuery({ query, queryKey })` over `books_settings` (the single row); `retryLoad` calls `recoverLiveQueries`; `hasLoadError` from the query's error state, the way `useBooksSetup` reads it.
3. Create `hooks/useSettingsForm.ts`: `useForm({ resolver: zodResolver(schema), defaultValues: values, values })`; one `useMutation` whose generator yields `settingsCollection.update(settings.id, draft => { Object.assign(draft, toPatch(parsed)) })`; `onSuccess` pushes "Saved." to `useToastStore` and calls `form.reset(parsed)`; `onError` uses `messageOnlyRefusal` first and falls back to `handleMutationErrorsWithForm({ setError, getValues })`. `submit` is `form.handleSubmit(values => mutation.mutate(values))` guarded by `isPending`. `isDirty` is `form.formState.isDirty`. No `useEffect`: the form re-seeds through the `values` option.
4. Create `hooks/useDocSequences.ts` and `hooks/useSequenceForm.ts` with the same structure over `books_doc_sequences` (a live query ordered by `doc_type`; a `useMutation` generator yielding `sequencesCollection.update(sequence.id, draft => { Object.assign(draft, sequenceUpdate(parsed)) })`; `onSuccess` pushes "Saved." and resets; `onError` sets `next_number` to the `messageOnlyRefusal` text); the preview is computed in render from `useWatch`.

### Checkpoint 4 — Close override hooks

**Delivers:** the hooks that list overrides with person and grantor, offer the grantable people, grant, revoke, and read the caller's own active override.

**Files:**
- Create: `tinycld/books/hooks/useCloseOverrides.ts`
- Create: `tinycld/books/hooks/useMyCloseOverride.ts`
- Modify: `tests/accounts-form-harness.ts` (the test writer adds seeded `users`, `books_close_overrides` and `books_access` collections and a `refuseOverrides` option; it goes under Out-of-plan changes)
- Test: `tests/useCloseOverrides.test.tsx` · `tests/useMyCloseOverride.test.tsx`

**Interfaces:**
- Consumes: `overrideSchema`, `OverrideValues`, `LASTS_FOR_OPTIONS`, `splitOverrides`, `expiryFrom`, `ownOverrideLine` from checkpoint 2; `messageOnlyRefusal` from checkpoint 3; `useStore`; `useMutation`; `useMyLiveQuery` from `@tinycld/core/lib/use-my-live-query`; `materialize` from `pbtsdb`; `newRecordId` from `pbtsdb/core`
- Produces:
  - `useCloseOverrides(): { overrides: OverrideRow[] | undefined; active: OverrideRow[]; past: OverrideRow[]; grantableUsers: GrantableUser[]; isReady: boolean; hasLoadError: boolean; retryLoad: () => void; grant: GrantOverride; revoke: (id: string) => Promise<RevokeOutcome> }` where `OverrideRow` is `NonNullable<ReturnType<typeof useCloseOverrides>['overrides']>[number]` (the override fields plus `userName: string | undefined` and `grantedByName: string | undefined`, flattened in `.select()`), `GrantableUser = { id: string; name: string; email: string }`, `GrantOverride = (values: OverrideValues) => Promise<{ ok: true } | { ok: false; message: string }>`, `RevokeOutcome = { ok: true } | { ok: false; message: string }`
  - `useMyCloseOverride(): { override: { expires_at: string; reason: string } | undefined; isReady: boolean }` (the caller's own active override, newest expiry first)

**Gates:** 1 · 3 (nothing renders)

**Spec:**
- "Fields show as label and value rows, with no Save. Under Accounting a line states the caller's own override: "You can post into the closed period until Nov 3, 2026 (reason: Year-end adjustments)." when one is active."
- "Overrides panel (admin), below the block, drawn only while a close date is set: - Active overrides first, each row: person, reason, "Expires Nov 3, 2026, 5:00 PM", "Granted by <name>", a Revoke action. History below, collapsed behind "Show past overrides (n)": expired and revoked rows without actions. - "Grant an override" opens a form (dialog on web and tablet, bottom sheet on phones): Person (select of users whose level is bookkeeper or admin), Reason (required, 3 to 500 characters), Lasts for (24 hours, 7 days, 30 days; default 24 hours). Submit is "Grant override". The expiry is the submit time plus the chosen length. - Revoke asks "Revoke <name>'s override?" and on confirm sets `expires_at` to now. The row moves to history. An override is never deleted. - Empty: "No one can post into the closed period." with the Grant button. - With no close date: the panel reads "Set a close date to grant overrides." with no button."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/useCloseOverrides.test.tsx` — with the harness collections: `overrides` are ordered by `expires_at` descending and carry `userName` and `grantedByName` from the materialized users; a row whose grantor is missing still appears with `grantedByName` undefined; `active` and `past` follow `splitOverrides`; `grantableUsers` lists only users whose `books_access` level is `bookkeeper` or `admin` (a `read_only` and a `none` user are absent).
- `tests/useCloseOverrides.test.tsx` — `grant({ user, reason: 'Year-end', lasts: '7d' })` inserts exactly one `books_close_overrides` row with that `user`, that `reason` and an `expires_at` seven days after the submit time, and no `granted_by`; a refusal returns `{ ok: false, message }` with the server message and inserts nothing; `revoke(id)` updates only `expires_at` to the current time and the row then appears in `past`; no call ever deletes a row (the collection's delete log stays empty).
- `tests/useMyCloseOverride.test.tsx` — `useMyCloseOverride` returns the signed-in user's active override and ignores another user's override, an expired one and a revoked one; with several active ones it returns the one expiring last; it returns `undefined` with none. (The caller's id comes from the harness `useAuth`.)

**Do:**
1. Create `hooks/useCloseOverrides.ts`: one `useLiveQuery({ query, queryKey })` over `books_close_overrides` ordered by `expires_at` descending, with `user` and `granted_by` read through `materialize()` of `users` (`.findOne()` subqueries) and flattened in `.select()` (`userName: user?.name`, `grantedByName: grantedBy?.name`); a second query over `books_access` where `level` is `bookkeeper` or `admin`, with `materialize()` of `user`, giving `grantableUsers`; `active` and `past` from `splitOverrides(overrides, new Date())` computed in render. `grant` is a `useMutation` generator that yields `overridesCollection.insert({ id: newRecordId(), user, reason, expires_at: expiryFrom(lasts, new Date()) })` and returns an outcome through `messageOnlyRefusal` and `errorToString`; `revoke` yields `overridesCollection.update(id, draft => { draft.expires_at = <now in PocketBase datetime format> })`.
2. Create `hooks/useMyCloseOverride.ts` with `useMyLiveQuery((query, { userId }) => ... eq(override.user, userId))`, then `splitOverrides(...).active` in render, returning the one with the latest expiry.

### Checkpoint 5 — Access list and level mutation

**Delivers:** the hooks that list every user with their Books level and role, and change a level through the planned writes with an instant row update and a reload.

**Files:**
- Create: `tinycld/books/hooks/useAccessList.ts`
- Create: `tinycld/books/hooks/useAccessMutation.ts`
- Modify: `tests/accounts-form-harness.ts` (the test writer adds seeded `org_pkg_access` and `books_admins` collections, a `reload` spy on `books_access`, and a `refuseAccess` option; it goes under Out-of-plan changes)
- Test: `tests/useAccessMutation.test.tsx` · `tests/useAccessList.test.tsx`

**Interfaces:**
- Consumes: `levelPlan`, `levelWrites`, `LevelWrite`, `CoreAccess`, `OrgRole`, `filterPeople`, `accessRowControl` from checkpoint 2; `messageOnlyRefusal` from checkpoint 3; `useCurrentRole` from `@tinycld/core/lib/use-current-role`; `useBooksAccess`; `useStore`; `useMutation`; `performMutations` from `@tinycld/core/lib/mutations`
- Produces:
  - `useAccessList(): { people: AccessPerson[] | undefined; isReady: boolean; hasLoadError: boolean; retryLoad: () => void; viewerOrgRole: OrgRole; viewerId: string }` where `AccessPerson` is `NonNullable<ReturnType<typeof useAccessList>['people']>[number]` (`id` is the user id, since the `books_access` view's `id` is the user's id; `name`, `email`, `avatar`, `orgRole: OrgRole`, `level: BooksLevel`, flattened in `.select()` from the materialized `user`; ordered by name)
  - `useAccessMutation(person: { id: string; orgRole: OrgRole; level: BooksLevel }): { setLevel: (level: BooksLevel) => void; shownLevel: BooksLevel; isPending: boolean; error: string | null }`

**Gates:** 1 · 3 (nothing renders)

**Spec:**
- "Who may change what, from core's rules: org owners and admins can set all four levels. A Books admin who is not an org owner or admin can only switch a bookkeeper to admin and back (the `books_admins` grant); the select is disabled with the text "Ask an organization owner or admin to change this.""
- "Org owners and admins always resolve to admin: their row is locked with "Organization owner" or "Organization admin". The signed-in person's own row is locked with "You cannot change your own access.""
- "Writes: none -> `org_pkg_access` row `access: 'none'`; read-only -> `readonly`; bookkeeper -> `full`, and delete any `books_admins` row; admin -> `full` and a `books_admins` row. A row of `org_pkg_access` is created or updated when the change requires it. These writes go through `useMutation` as one yielded sequence; a failure stops and shows the server message on the row."
- "The level list is `books_access`, a view with no realtime. After each write the screen calls `books_access.reload()` and shows the chosen level on the row at once until the reload returns. A failed write puts the old level back and shows the error."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/useAccessList.test.tsx` — `people` carry `name`, `email`, `orgRole` (from `users.role`) and `level` from the `books_access` rows, ordered by name; a user with a missing materialized row still appears; `viewerOrgRole` is the signed-in user's role; `isReady` is false until the rows load.
- `tests/useAccessMutation.test.tsx` — with the harness collections, for a member at `read_only`: `setLevel('admin')` writes the core row to `full` and inserts a `books_admins` row, in that order and one at a time (assert the write log and that at most one write is in flight); `setLevel('bookkeeper')` for a member at `admin` deletes the `books_admins` row and writes no core row; `setLevel('none')` for a member with no core row inserts `org_pkg_access` with `access: 'none'` and `pkg: 'books'`.
- `tests/useAccessMutation.test.tsx` — while the sequence and the reload run, `shownLevel` is the chosen level and `isPending` is true; the `books_access` `reload` spy is called once after the last write and not before it; after a refusal on the second write the sequence stops (no third write), `shownLevel` returns to the old level, `isPending` is false, and `error` holds the server message; the next successful `setLevel` clears `error`.
- `tests/useAccessMutation.test.tsx` — a Books admin viewer who is not an org owner or admin switching a bookkeeper to admin issues only the `books_admins` insert (no `org_pkg_access` write), because the core row already reads `full`.

**Do:**
1. Create `hooks/useAccessList.ts`: one `useLiveQuery({ query, queryKey })` over `books_access` with `materialize()` of `user` (from `users`), `.select()` flattening to `AccessPerson`, ordered in JS by name; `viewerOrgRole` from `useCurrentRole()`; `viewerId` from `useAuth`. `retryLoad` calls `recoverLiveQueries`.
2. Create `hooks/useAccessMutation.ts`: two small `useLiveQuery` reads for this person (`org_pkg_access` where `user` is the person and `pkg` is `books`, and `books_admins` where `user` is the person) so the row ids are held by a live query; a `useMutation` whose generator yields each planned write of `levelPlan(...)` in order (inserts use `newRecordId()`; the `org_pkg_access` insert carries `user`, `pkg: 'books'` and `access` plus any other required field of the generated `OrgPkgAccess` type), then awaits `accessCollection.reload()`. The mutation stays pending until the reload returns, so `shownLevel` is `mutation.isPending ? mutation.variables : person.level` and an error reverts it with no extra state. `error` is `messageOnlyRefusal(error) ?? errorToString(error)` of the last failure and `null` after the next `setLevel`.

### Checkpoint 6 — Settings shell and Company section

**Delivers:** the Settings sidebar entry, the `/a/books/settings` routes with the section list and detail frame, the loading and error states, and the Company section in its read-only and edit forms.

**Files:**
- Create: `tinycld/books/screens/settings/index.tsx`
- Create: `tinycld/books/screens/settings/[section].tsx`
- Create: `tinycld/books/components/settings/SettingsShell.tsx`
- Create: `tinycld/books/components/settings/SectionList.tsx`
- Create: `tinycld/books/components/settings/SectionBody.tsx`
- Create: `tinycld/books/components/settings/SectionCard.tsx` (the card, label/value row and field note building blocks)
- Create: `tinycld/books/components/settings/CompanySection.tsx`
- Create: `tinycld/books/hooks/useSettingsShell.ts`
- Modify: `tinycld/books/lib/shell-nav.ts` (a `Settings` entry with the gear icon, `href: 'books/settings'`, `available: true`, `group: 'settings'`; `SidebarEntry.group` becomes `'accounting' | 'settings'`; `sidebarSections` returns `{ top, accounting, end }` with `end` the settings group)
- Modify: `tinycld/books/hooks/useBooksSidebar.ts` (expose `end`)
- Modify: `tinycld/books/sidebar.tsx` (draw `end` after the Accounting group)
- Modify: `tests/shell-nav.test.ts` · `tests/books-sidebar.test.tsx` (the test writer adds the Settings cases; it goes under Out-of-plan changes)
- Test: `tests/shell-nav.test.ts` · `tests/books-sidebar.test.tsx`

**Interfaces:**
- Consumes: `visibleSections`, `sectionSummary`, `SectionId`, `SETTINGS_SECTIONS` from checkpoint 2; `useBooksSettings`, `useSettingsForm`, `useDocSequences` from checkpoint 3; `companySchema`, `companyValues` from checkpoint 2; `useBooksAccess` from `tinycld/books/hooks/useBooksAccess.ts`; `LoadingState`; `useBreakpoint` from `@tinycld/core/components/workspace/useBreakpoint`; `useOrgHref` from `@tinycld/core/lib/org-routes`
- Produces:
  - routes `/a/books/settings` (wide: opens Company; phone: the section list) and `/a/books/settings/[section]`
  - `SettingsShell({ section }: { section: SectionId | undefined })`, `useSettingsShell(section: SectionId | undefined): { part: 'loading' | 'error' | 'list' | 'detail'; sections: { id: SectionId; label: string; summary: string; isActive: boolean }[]; isAdmin: boolean; openSection: (id: SectionId) => void; back: () => void; retry: () => void }`
  - `SectionCard({ title, children })`, `ReadOnlyRow({ label, value })`, `FieldNote({ text })`
  - `SectionBody({ section, isAdmin })` (a `Record<SectionId, ComponentType>` lookup; later checkpoints add their entry)
  - `CompanySection({ isAdmin })`
  - `SIDEBAR_ENTRIES` gains `{ id: 'settings' }`; test ids `books-nav-settings`, `books-settings-section-<id>`, `books-settings-back`, `books-settings-save`, `books-settings-company-business-name`, `books-settings-company-tax-id`, `books-settings-company-address`, `books-settings-company-phone`, `books-settings-company-email`, `books-settings-company-website`

**Gates:** 1 · 2 (reference: `list-company-*`, `company-long-*`, `non-admin-list-*`, `non-admin-company-*` screenshots; built URL: `/a/books/settings` and `/a/books/settings/company`) · 3

**Spec:**
- "Wide: a section list on the left (Company, Accounting, Numbering, Access) and the open section on the right. `/a/books/settings` opens Company. The active section is highlighted with the `active-indicator` token."
- "Phone: `/a/books/settings` shows the section list as rows with their summary line (for example "Fiscal year starts in January"); a row opens its section as a full screen with a back arrow."
- "Access to each section: Access is drawn for Books admins only. Company, Accounting and Numbering are drawn for every user with read access."
- "A user at level none sees nothing from Books (shell)."
- "Fields show as label and value rows, with no Save. Under Accounting a line states the caller's own override: "You can post into the closed period until Nov 3, 2026 (reason: Year-end adjustments)." when one is active."
- "An admin sees the same rows as forms."
- "Fields: Legal business name (required, max 200, the existing `business_name`), Tax ID (EIN, optional, max 20), Business address (optional, multiline, max 500), Phone (optional, max 40), Email (optional, valid email, max 200), Website (optional, max 200, an address that starts with `http://` or `https://`, or empty)."
- "A read-only line "Currency: US dollars (USD)" and the note "Books uses one currency." The currency is never editable (the server pins it)."
- "One Save button, enabled when the form has changes. Save writes one `books_settings` update. A refusal shows in `FormErrorSummary`."
- "Note under the logo question: "Your logo and brand color are set in the organization settings" as plain text (core owns them)."
- "Loading: `LoadingState` until the settings row, and access, are ready. Load error: message with Retry through `recoverLiveQueries`."
- "Unsaved changes: leaving a dirty form with the sidebar or back asks nothing in v0 (see Non-goals); Save is disabled while the form is clean."
- "Save success: a toast "Saved." and the form resets to the saved values."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/shell-nav.test.ts` — `SIDEBAR_ENTRIES` has a `settings` entry that is `available`, whose href is `books/settings` and whose group is `settings`; `sidebarSections` returns it in `end` and not in `top` or `accounting`; it stays last in the rendered order.
- `tests/books-sidebar.test.tsx` — `useBooksSidebar` exposes the settings entry in `end`, it is active on `/a/books/settings` and on `/a/books/settings/company`, and no other entry is active there.
- `tests/e2e/books-settings.spec.ts` — written in checkpoint 10; this checkpoint's screens are covered there.

**Do:**
1. `shell-nav.ts`, `useBooksSidebar.ts` and `sidebar.tsx`: add the `settings` entry and the `end` group (the gear icon is `Settings` from `lucide-react-native`); render `end` below the Accounting group with the same `renderItem`.
2. `useSettingsShell.ts`: reads `useBooksAccess()`, `useBooksSettings()` and `useDocSequences()` (its length is the `sequenceCount` for `sectionSummary`); `part` is `loading` until both are ready, `error` when `hasLoadError`, otherwise `detail` (wide, or phone with a section) or `list` (phone with no section). On wide with no section the open section is `company`. `sections` come from `visibleSections(isAdmin)` with `sectionSummary`; `isActive` marks the open one. `openSection` pushes `books/settings/<id>` through `useOrgHref`; `back` goes to `books/settings`. A section id the caller may not see (`access` for a non-admin, or an unknown id) renders the list on phone and Company on wide. A user at level none never reaches this screen: the Books shell already shows the no-access state.
3. `SettingsShell.tsx`: wide is a two-column row (a section list 240 wide with the active row on the `active-indicator` token, the open section filling the rest, spacing as in `list-company-1280-light.png`); phone is the list of rows with summary lines and a chevron, then the section as a full screen with a back arrow button (`books-settings-back`, 44 tall). `part` `loading` draws `LoadingState`; `error` draws the message "Settings could not be loaded." with a Retry button that calls `retry`. Render components take an `isVisible` prop and return `null`; no logic or `.map()` in the JSX of the screen files.
4. `CompanySection.tsx`: a read-only view of label and value rows when `isAdmin` is false (no Save), and for an admin a form built with `useSettingsForm({ schema: companySchema, values: companyValues(settings), toPatch: values => values })` with `TextInput` for name, tax ID, phone, email and website, `TextAreaInput` for the address, the read-only line "Currency: US dollars (USD)" with the note "Books uses one currency.", the plain note "Your logo and brand color are set in the organization settings", `FormErrorSummary`, and one Save button `books-settings-save` that is disabled while `isDirty` is false. Long names and websites truncate with ellipsis in the read-only rows and wrap in the form (see `company-long-*`).
5. `screens/settings/index.tsx` and `[section].tsx` only read the param and render `SettingsShell`; they hold no logic. Run `pnpm run packages:generate` in `tinycld/` so the route re-exports exist.

### Checkpoint 7 — Accounting section and close block

**Delivers:** the Accounting section with the fiscal year form, the Close the books block with its reopen confirmation, and the read-only view with the caller's own override line.

**Files:**
- Create: `tinycld/books/components/settings/AccountingSection.tsx`
- Create: `tinycld/books/components/settings/FiscalYearForm.tsx`
- Create: `tinycld/books/components/settings/CloseBooksBlock.tsx`
- Create: `tinycld/books/components/settings/ReopenDialog.tsx`
- Create: `tinycld/books/hooks/useCloseBooks.ts`
- Modify: `tinycld/books/lib/settings-sections.ts` (append the `accounting` section: label "Accounting", not admin only)
- Modify: `tinycld/books/components/settings/SectionBody.tsx` (add the `accounting` entry)
- Test: `tests/useCloseBooks.test.tsx`

**Interfaces:**
- Consumes: `fiscalYearSchema`, `closeDateSchema`, `closeDateValues`, `closeDateValue`, `isReopening`, `CloseDateValues` from checkpoint 2; `useSettingsForm`, `useBooksSettings` from checkpoint 3; `useMyCloseOverride`, `ownOverrideLine` from checkpoint 4 and 2; `FISCAL_MONTHS`; `SectionCard`, `ReadOnlyRow`, `FieldNote`, `SectionBody` from checkpoint 6; `formatDay`
- Produces:
  - `AccountingSection({ isAdmin }: { isAdmin: boolean })`
  - `useCloseBooks(): { form: UseFormReturn<CloseDateValues>; submit: () => void; isPending: boolean; isDirty: boolean; isClosed: boolean; reopen: { oldDate: string } | null; confirmReopen: () => void; cancelReopen: () => void }` (`isClosed` is the live value of the switch)
  - `ReopenDialog({ isVisible, oldDate, onConfirm, onCancel })`
  - test ids `books-settings-fiscal-month`, `books-settings-fiscal-save`, `books-settings-close-toggle`, `books-settings-close-date`, `books-settings-close-save`, `books-settings-reopen-confirm`, `books-settings-reopen-cancel`

**Gates:** 1 · 2 (reference: `accounting-*` (the fiscal year and Close the books regions), `accounting-empty-*`, `non-admin-accounting-*` screenshots; built URL: `/a/books/settings/accounting`) · 3

**Spec:**
- "Fields show as label and value rows, with no Save. Under Accounting a line states the caller's own override: "You can post into the closed period until Nov 3, 2026 (reason: Year-end adjustments)." when one is active."
- "Fiscal year starts in: month select, January to December (the existing `FISCAL_MONTHS`). Helper text: "Reports use this from now on. No entries change." Saves independently of the close-date block."
- "Close the books: a switch. Off means no period is closed (`close_date` empty). On shows a Closing date field (`DateField`, `YYYY-MM-DD`, a real calendar day) and the explanation "Entries dated on or before this day cannot be posted unless the person holds an override.""
- "Saving a close date that is earlier than the current one, or turning the switch off, first asks "Reopen closed periods?" with the text "People can post entries dated on or before <old date> again." Confirm saves, Cancel keeps the form."
- "Server refusals show in the block: a date on or before a pending auto-reversal ("the books are closed through...") and an invalid date."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/useCloseBooks.test.tsx` — a tricky ordering hook, so a unit test: with the harness collections and a settings row closed through `2026-09-30`: submitting a later date writes `close_date` at once with no `reopen`; submitting an earlier date writes nothing and sets `reopen` to `{ oldDate: '2026-09-30' }`; `confirmReopen` then writes the earlier date and clears `reopen`; `cancelReopen` clears `reopen`, writes nothing and keeps the typed form values; switching the toggle off and submitting also sets `reopen` and, once confirmed, saves `close_date` as `''`; with no current close date, turning the toggle on and saving a date writes it with no confirmation; an invalid date (`2026-02-30`) blocks the write with the schema message; a refusal "the books are closed through 2026-10-31 by a pending auto-reversal" lands on `errors.root` and the form keeps the values.
- `tests/e2e/books-settings.spec.ts` — written in checkpoint 10; the Accounting screens are covered there.

**Do:**
1. `useCloseBooks.ts`: `useSettingsForm({ schema: closeDateSchema, values: closeDateValues(settings), toPatch: values => ({ close_date: closeDateValue(values) }) })`; wrap its `submit` so `isReopening(settings.close_date, parsed)` first stores `{ oldDate }` in a small `useState` (the one-dialog local state that nothing else reads) instead of writing; `confirmReopen` calls the underlying save; `cancelReopen` clears it. Validation runs before the question, so an invalid date never asks.
2. `FiscalYearForm.tsx`: `SelectInput` over `FISCAL_MONTHS` (value is the month number 1 to 12) with the helper text "Reports use this from now on. No entries change." and its own Save button; it saves through its own `useSettingsForm({ schema: fiscalYearSchema, ... })`, so it never touches the close date.
3. `CloseBooksBlock.tsx`: a bordered block with the `Toggle` "Close the books", an inner group with `isVisible={isClosed}` holding `DateField` "Closing date" and the explanation "Entries dated on or before this day cannot be posted unless the person holds an override.", `FormErrorSummary` for the refusal, the block's own Save button, and `ReopenDialog` (a `ConfirmDialog` titled "Reopen closed periods?" with the text "People can post entries dated on or before <old date> again." using `formatDay` for the date, confirm and Cancel).
4. `AccountingSection.tsx`: for an admin the two forms; for a reader label/value rows (Fiscal year starts in, Books closed through or "No period is closed") and, when `useMyCloseOverride().override` exists, the line from `ownOverrideLine`. Add the section to `SETTINGS_SECTIONS` and `SectionBody`. The overrides panel arrives in checkpoint 8, directly below the block.

### Checkpoint 8 — Close overrides panel

**Delivers:** the admin Overrides panel with active rows, collapsed history, the Grant form (dialog or bottom sheet), Revoke with confirmation, and the empty and no-close-date states.

**Files:**
- Create: `tinycld/books/components/settings/OverridesPanel.tsx`
- Create: `tinycld/books/components/settings/OverrideRow.tsx`
- Create: `tinycld/books/components/settings/GrantOverrideDialog.tsx`
- Create: `tinycld/books/hooks/useOverridesPanel.ts`
- Modify: `tinycld/books/components/settings/AccountingSection.tsx` (draw `OverridesPanel` below the block for an admin)

**Interfaces:**
- Consumes: `useCloseOverrides`, `OverrideRow`, `GrantableUser` from checkpoint 4; `overrideSchema`, `OverrideValues`, `LASTS_FOR_OPTIONS`, `DEFAULT_LASTS` from checkpoint 2; `formatExpiry` from checkpoint 2; `useBooksSettings` from checkpoint 3; `useBreakpoint`; `ConfirmDialog`; `Dialog`; the bottom sheet from `@tinycld/core/ui/bottom-drawer`
- Produces:
  - `OverridesPanel({ isVisible }: { isVisible: boolean })`
  - `useOverridesPanel(): { hasCloseDate: boolean; active: OverrideRow[]; past: OverrideRow[]; isHistoryOpen: boolean; toggleHistory: () => void; grantOpen: boolean; openGrant: () => void; closeGrant: () => void; revokeTarget: OverrideRow | null; askRevoke: (row: OverrideRow) => void; cancelRevoke: () => void; confirmRevoke: () => void; grantForm: UseFormReturn<OverrideValues>; submitGrant: () => void; isSubmitting: boolean; grantableUsers: GrantableUser[]; isSheet: boolean }`
  - `GrantOverrideDialog({ isVisible, ...grant form props })` (a `Dialog` on web and tablet, a bottom sheet when `isSheet`)
  - test ids `books-settings-overrides`, `books-settings-grant`, `books-settings-grant-user`, `books-settings-grant-reason`, `books-settings-grant-lasts`, `books-settings-grant-submit`, `books-settings-override-<id>`, `books-settings-revoke-<id>`, `books-settings-revoke-confirm`, `books-settings-history-toggle`

**Gates:** 1 · 2 (reference: `accounting-*`, `accounting-past-open-*`, `accounting-empty-*` screenshots; built URL: `/a/books/settings/accounting`) · 3

**Spec:**
- "Overrides panel (admin), below the block, drawn only while a close date is set: - Active overrides first, each row: person, reason, "Expires Nov 3, 2026, 5:00 PM", "Granted by <name>", a Revoke action. History below, collapsed behind "Show past overrides (n)": expired and revoked rows without actions. - "Grant an override" opens a form (dialog on web and tablet, bottom sheet on phones): Person (select of users whose level is bookkeeper or admin), Reason (required, 3 to 500 characters), Lasts for (24 hours, 7 days, 30 days; default 24 hours). Submit is "Grant override". The expiry is the submit time plus the chosen length. - Revoke asks "Revoke <name>'s override?" and on confirm sets `expires_at` to now. The row moves to history. An override is never deleted. - Empty: "No one can post into the closed period." with the Grant button. - With no close date: the panel reads "Set a close date to grant overrides." with no button."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/e2e/books-settings.spec.ts` — written in checkpoint 10; the panel flows (grant, history, revoke, both empty states, dialog and sheet) are covered there, since the state is a thin composition of `useCloseOverrides`, tested in checkpoint 4.

**Do:**
1. `useOverridesPanel.ts` composes `useCloseOverrides()` and `useBooksSettings()`, holds the dialog and history flags (`useState`, local UI no other component reads), and builds `grantForm` with `useForm({ resolver: zodResolver(overrideSchema), defaultValues: { user: '', reason: '', lasts: DEFAULT_LASTS } })`; `submitGrant` calls `grant`, then `closeGrant` and `grantForm.reset()` on `ok`, or `setError('root', ...)` on a refusal.
2. `OverrideRow.tsx` draws person (`userName`), reason (wraps, never truncated to nothing), "Expires Nov 3, 2026, 5:00 PM" from `formatExpiry`, "Granted by <name>", and a Revoke button for an active row only; the history rows have no actions and read "Ended <date>" from `formatDay` of `expires_at`.
3. `OverridesPanel.tsx` returns `null` when `isVisible` is false. With no close date it reads "Set a close date to grant overrides." and has no button. With a close date it shows active rows first, then "Show past overrides (n)" collapsed (n is the number of past rows; the link is absent when there are none), and when there are no active rows "No one can post into the closed period." with the Grant button. "Grant an override" opens `GrantOverrideDialog`: Person (`SelectInput` over `grantableUsers`), Reason (`TextAreaInput`), Lasts for (`SelectInput` over `LASTS_FOR_OPTIONS`, default 24 hours), submit "Grant override". Revoke opens a `ConfirmDialog` "Revoke <name>'s override?" and its confirm calls `confirmRevoke`.
4. Wrap each Revoke button in a stop-propagation boundary so a press does not bubble to a parent row.

### Checkpoint 9 — Numbering section

**Delivers:** the Numbering section with one card per document sequence, a live preview, per-card Save, and the empty state.

**Files:**
- Create: `tinycld/books/components/settings/NumberingSection.tsx`
- Create: `tinycld/books/components/settings/SequenceCard.tsx`
- Modify: `tinycld/books/lib/settings-sections.ts` (append the `numbering` section: label "Numbering", not admin only)
- Modify: `tinycld/books/components/settings/SectionBody.tsx` (add the `numbering` entry)

**Interfaces:**
- Consumes: `useDocSequences`, `useSequenceForm` from checkpoint 3; `docTypeLabel` from checkpoint 2; `sequenceSchema`; `SectionCard`, `ReadOnlyRow`, `FieldNote` from checkpoint 6
- Produces:
  - `NumberingSection({ isAdmin }: { isAdmin: boolean })`
  - `SequenceCard({ sequence, isAdmin }: { sequence: BooksDocSequences; isAdmin: boolean })`
  - test ids `books-settings-seq-<doc_type>`, `books-settings-seq-<doc_type>-prefix`, `books-settings-seq-<doc_type>-next`, `books-settings-seq-<doc_type>-save`, `books-settings-seq-<doc_type>-preview`

**Gates:** 1 · 2 (reference: `numbering-*`, `numbering-empty-*` screenshots; built URL: `/a/books/settings/numbering`) · 3

**Spec:**
- "One card per `books_doc_sequences` row, labelled by a typed constant (`lib/doc-types.ts`): `journal` is "Journal entries". A row whose doc type has no label shows the raw doc type, so a later phase never hides a row by forgetting the label."
- "Fields: Prefix (letters, digits, hyphen; max 10; may be empty) and Next number (whole number, 1 to 999999999). A live preview under them: "Next entry: JE-1001" (prefix plus number, no padding: the same join the server uses)."
- "Helper text: "A new prefix applies to entries posted from now on. Numbers already issued do not change. The next number can move forward only.""
- "Save per card. A refusal from the server ("Numbers up to 1000 are already used. The next number must be 1001 or higher.") shows under the Next number field."
- "Empty (no rows): "No document numbers to set yet." This state exists only on a book with no sequences."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/e2e/books-settings.spec.ts` — written in checkpoint 10; the Numbering flow, including the refusal under Next number, is covered there. The hook behavior is covered by `tests/useSequenceForm.test.tsx` from checkpoint 3.

**Do:**
1. `SequenceCard.tsx`: `SectionCard` titled `docTypeLabel(sequence.doc_type)`; for an admin a form from `useSequenceForm(sequence)` with `TextInput` Prefix and Next number, the live preview line under them, the helper text, `FormErrorSummary`, and a Save button disabled while `isDirty` is false; the refusal appears under the Next number field. For a reader, label/value rows (Prefix, Next number) and the preview, no Save.
2. `NumberingSection.tsx`: `useDocSequences()`; one `SequenceCard` per row; with no rows the text "No document numbers to set yet."; `LoadingState`-free (the shell already holds the loading part).
3. Add the section to the sections list and `SectionBody`.

### Checkpoint 10 — Access section, help, and e2e

**Delivers:** the admin Access section (people list, level select with descriptions, locks, search), the in-app help topic, and the end-to-end coverage of Settings at desktop and phone sizes.

**Files:**
- Create: `tinycld/books/components/settings/AccessSection.tsx`
- Create: `tinycld/books/components/settings/AccessRow.tsx`
- Create: `tinycld/books/hooks/useAccessSection.ts`
- Modify: `tinycld/books/lib/settings-sections.ts` (append the `access` section: label "Access", admin only)
- Modify: `tinycld/books/components/settings/SectionBody.tsx` (add the `access` entry)
- Create: `help/settings.md`
- Create: `tests/e2e/books-settings.spec.ts`
- Test: `tests/help-settings.test.ts` · `tests/e2e/books-settings.spec.ts`

**Interfaces:**
- Consumes: `useAccessList`, `useAccessMutation`, `AccessPerson` from checkpoint 5; `accessRowControl`, `ACCESS_LEVELS`, `levelDescription`, `filterPeople` from checkpoint 2; `Avatar`; `SelectInput`; `login`, `navigateToPackage`, `signInAsCollaborator` from `@tinycld/core/e2e-helpers`
- Produces:
  - `AccessSection({ isAdmin }: { isAdmin: boolean })`, `AccessRow({ person, viewerOrgRole, viewerId }: { person: AccessPerson; viewerOrgRole: OrgRole; viewerId: string })`
  - `useAccessSection(): { people: AccessPerson[]; search: string; setSearch: (text: string) => void; isEmpty: boolean; emptyText: string; isReady: boolean; hasLoadError: boolean; retryLoad: () => void }` (`emptyText` is "No one matches <text>.")
  - help topic `books:settings`
  - test ids `books-settings-access-search`, `books-settings-access-row-<userId>`, `books-settings-access-level-<userId>`, `books-settings-access-note-<userId>`, `books-settings-access-empty`

**Gates:** 1 · 2 (reference: `access-*`, `access-limited-*`, `access-no-match-*` screenshots; built URL: `/a/books/settings/access`) · 3

**Spec:**
- "A list of every user: avatar, name, email, level chip, and the control. Level select has none, read-only, bookkeeper, admin. Under the select a one-line description of the chosen level. Descriptions: None "Cannot open Books." Read-only "Can see everything and change nothing." Bookkeeper "Can enter and post entries and manage accounts. Cannot change settings." Admin "Everything a bookkeeper can do, plus settings, access, and close-date overrides.""
- "Who may change what, from core's rules: org owners and admins can set all four levels. A Books admin who is not an org owner or admin can only switch a bookkeeper to admin and back (the `books_admins` grant); the select is disabled with the text "Ask an organization owner or admin to change this.""
- "Org owners and admins always resolve to admin: their row is locked with "Organization owner" or "Organization admin". The signed-in person's own row is locked with "You cannot change your own access.""
- "Writes: none -> `org_pkg_access` row `access: 'none'`; read-only -> `readonly`; bookkeeper -> `full`, and delete any `books_admins` row; admin -> `full` and a `books_admins` row. A row of `org_pkg_access` is created or updated when the change requires it. These writes go through `useMutation` as one yielded sequence; a failure stops and shows the server message on the row."
- "The level list is `books_access`, a view with no realtime. After each write the screen calls `books_access.reload()` and shows the chosen level on the row at once until the reload returns. A failed write puts the old level back and shows the error."
- "Search box over name and email (client filter of the loaded rows; the user list is at most a few dozen in the target audience, 1 to 50 staff). Empty search result: "No one matches <text>.""
- "Filter chips are cut (see Cut)."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/e2e/books-settings.spec.ts` — `test.describe('books-settings: Settings screens', …)` with these independent tests (the e2e database is shared, so each test sets its own values through the UI and restores what it changed; no raw PocketBase reads or writes; `login` then `navigateToPackage(page, 'books')` at the default viewport, then `books-nav-settings`; never `page.goto` after login):
  1. Company: Settings opens Company; Save is disabled while clean; typing `not-an-email` in Email and pressing Save shows the schema message and keeps the form; entering a business name, Tax ID `12-3456789` and Phone and saving shows the toast "Saved."; Save is disabled again; leaving to Numbering and back shows the saved values; the notes "Currency: US dollars (USD)", "Books uses one currency." and "Your logo and brand color are set in the organization settings" are visible. Then `page.setViewportSize({ width: 390, height: 844 })`: the back arrow returns to the section list, which shows the Company summary line with the saved business name, and a tap on the Company row opens it again with the values kept.
  2. Accounting and overrides: sets the fiscal year start to July and saves ("Saved."); turns Close the books on, enters a closing date, saves, and sees the overrides panel with "No one can post into the closed period."; opens "Grant an override" (dialog at desktop), picks the signed-in person, a 2 character reason shows the schema message, a valid reason with Lasts for 24 hours submits "Grant override", and the row shows the person, the reason, "Expires" text and "Granted by"; Revoke asks "Revoke <name>'s override?", Cancel keeps the row, confirm moves it to "Show past overrides (1)", which opens to a row without actions; moving the closing date earlier asks "Reopen closed periods?" with "People can post entries dated on or before"; Cancel keeps the form and the old date, confirm saves; turning the switch off asks again, confirm saves and the panel reads "Set a close date to grant overrides." with no Grant button. At the phone viewport the Grant form is a bottom sheet that submits and shows the new row. The test ends with the close date cleared and the fiscal year back to January.
  3. Numbering: the Journal entries card shows the preview "Next entry:"; entering prefix `JE-` and next number `1` and saving shows the server refusal under Next number ("are already used" text) and keeps the values; entering next number `5000` shows "Next entry: JE-5000" and saves with "Saved."; the helper text "A new prefix applies to entries posted from now on." is visible; the test ends with the prefix emptied (the next number stays, since it can move forward only). Phone viewport: the card fits without horizontal scroll and Save is reachable.
  4. Access, owner: the signed-in person's row is locked with "Organization owner" (the lock text replaces the level description) and the level chip reads Admin; the search box with `zzzzqq` shows "No one matches zzzzqq."; clearing it shows the rows again. Phone viewport: the rows fit at 390 wide.
  5. Access, level changes: `signInAsCollaborator` (from `@tinycld/core/e2e-helpers`) makes the second user exist; the owner finds that user's row by email in the Access section; for each level none, read-only, bookkeeper and admin, selecting it shows that level's exact description under the select ("Cannot open Books.", "Can see everything and change nothing.", "Can enter and post entries and manage accounts. Cannot change settings.", "Everything a bookkeeper can do, plus settings, access, and close-date overrides.") and the chip shows it at once, and it is still shown after navigating to Numbering and back; the test ends with the collaborator's level restored to the level it started at. Phone viewport: one change from the list at 390 wide.
  6. Access, read-only reader: with the collaborator set to read-only by the owner in the UI (owner steps as in test 5, close date set and an override granted to the collaborator through the Accounting panel as in test 2), `signInAsCollaborator` signs in the collaborator, who opens Books, Settings: Company, Accounting and Numbering show label/value rows with no Save button and no form fields, the section list has no Access entry, a direct visit of the Access section through the section list is impossible (no entry), and Accounting shows "You can post into the closed period until" with the granted reason in the line. Then the same run repeats as a bookkeeper (the owner changes the level back in the UI): the same read-only rows and no Access entry. At the end the owner revokes the override, clears the close date and restores the collaborator's level, and the collaborator's page is closed with `close()`. The collaborator steps run at desktop, then at the 390 phone viewport (list rows with summary lines, a section opens with a back arrow).
  Loading and load-error states, the "No document numbers to set yet." state and the tablet dialog/sheet split are not reachable through the UI of the seeded book (the sequence row always exists, and a load error needs a forced failed request, which the helpers do not offer), so gate 2 against `numbering-empty-*` and the shell reference screens covers them.
- `tests/help-settings.test.ts` — reads `help/settings.md`: frontmatter has `title` and `summary`; the body contains "To close the books through a date," and "To let someone post into a closed period,"; it mentions company details, numbering and access levels; it links to `help://books:chart-of-accounts` and to `help://books:setup-wizard`; it has no hand-typed hostname.

**Do:**
1. `useAccessSection.ts`: `useAccessList()`, the search text as local `useState`, `filterPeople(people, search)` computed in render, `emptyText` as `No one matches ${search.trim()}.`.
2. `AccessRow.tsx`: `Avatar`, name, email, a level chip, and a `SelectInput` over the options from `accessRowControl({ viewerOrgRole, viewerIsSelf, targetOrgRole: person.orgRole, level: person.level })`; the one-line description of the chosen level (`levelDescription(shownLevel)`) under the select; when `lockedText` is set the select is not drawn and the lock text replaces the description; when `disabledText` is set the select is disabled and the text shows under it; the row error from `useAccessMutation` shows under the row. Pressing a level calls `setLevel`.
3. `AccessSection.tsx`: the search `TextInput` (label "Search people") above the rows, the empty text, no filter chips. The section is drawn for admins only; `SectionBody` and `visibleSections` already hide it from others.
4. Write `help/settings.md`: frontmatter `title: Settings`, `summary`, `order`; start with "To close the books through a date, open Settings, choose Accounting, turn on Close the books and enter the date." then "To let someone post into a closed period, open Settings, choose Accounting and press Grant an override under Close the books." (Grant an override, who can receive one, how long it lasts, Revoke, history); cover Company details, Numbering (prefix, forward-only next number) and Access levels with the four descriptions; link `help://books:chart-of-accounts` and `help://books:setup-wizard`. The manifest already declares `help: { directory: 'help' }`. Run `pnpm run packages:generate` in `tinycld/`.
5. Write the e2e spec from the flows above with the helpers; phone steps call `page.setViewportSize({ width: 390, height: 844 })` after navigating at the default viewport. Offer the website docs after the build.
