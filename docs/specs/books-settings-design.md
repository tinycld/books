# Books settings

## Goal
Give Books admins one place to edit company details, accounting options (fiscal year, close date and its per-user overrides), document numbering, and who has which Books access level.

## Where it lives
Route tree `/a/books/settings` in the Books package: `screens/settings/index.tsx` and `screens/settings/[section].tsx`, with `section` one of `company`, `accounting`, `numbering`, `access`. A "Settings" entry (gear icon) at the end of the sidebar, a new row in `lib/shell-nav.ts` with `available: true`. It is not core's `manifest.settings` panel: core shows those only to org owners and admins, so a bookkeeper-level user who holds a Books admin grant would never reach it.
Direction chosen at the gate decides the frame (see Sparks carried); the sections and fields below do not depend on it.

## Behavior
Frame (direction B, recommended)
- Wide: a section list on the left (Company, Accounting, Numbering, Access) and the open section on the right. `/a/books/settings` opens Company. The active section is highlighted with the `active-indicator` token.
- Phone: `/a/books/settings` shows the section list as rows with their summary line (for example "Fiscal year starts in January"); a row opens its section as a full screen with a back arrow.
- Access to each section: Access is drawn for Books admins only. Company, Accounting and Numbering are drawn for every user with read access.
- A user at level none sees nothing from Books (shell).

Read-only view (every non-admin with read access)
- Fields show as label and value rows, with no Save. Under Accounting a line states the caller's own override: "You can post into the closed period until Nov 3, 2026 (reason: Year-end adjustments)." when one is active.
- An admin sees the same rows as forms.

Company (admin edits)
- Fields: Legal business name (required, max 200, the existing `business_name`), Tax ID (EIN, optional, max 20), Business address (optional, multiline, max 500), Phone (optional, max 40), Email (optional, valid email, max 200), Website (optional, max 200, an address that starts with `http://` or `https://`, or empty).
- A read-only line "Currency: US dollars (USD)" and the note "Books uses one currency." The currency is never editable (the server pins it).
- One Save button, enabled when the form has changes. Save writes one `books_settings` update. A refusal shows in `FormErrorSummary`.
- Note under the logo question: "Your logo and brand color are set in the organization settings" as plain text (core owns them).

Accounting (admin edits)
- Fiscal year starts in: month select, January to December (the existing `FISCAL_MONTHS`). Helper text: "Reports use this from now on. No entries change." Saves independently of the close-date block.
- Close the books: a switch. Off means no period is closed (`close_date` empty). On shows a Closing date field (`DateField`, `YYYY-MM-DD`, a real calendar day) and the explanation "Entries dated on or before this day cannot be posted unless the person holds an override."
- Saving a close date that is earlier than the current one, or turning the switch off, first asks "Reopen closed periods?" with the text "People can post entries dated on or before <old date> again." Confirm saves, Cancel keeps the form.
- Server refusals show in the block: a date on or before a pending auto-reversal ("the books are closed through...") and an invalid date.
- Overrides panel (admin), below the block, drawn only while a close date is set:
  - Active overrides first, each row: person, reason, "Expires Nov 3, 2026, 5:00 PM", "Granted by <name>", a Revoke action. History below, collapsed behind "Show past overrides (n)": expired and revoked rows without actions.
  - "Grant an override" opens a form (dialog on web and tablet, bottom sheet on phones): Person (select of users whose level is bookkeeper or admin), Reason (required, 3 to 500 characters), Lasts for (24 hours, 7 days, 30 days; default 24 hours). Submit is "Grant override". The expiry is the submit time plus the chosen length.
  - Revoke asks "Revoke <name>'s override?" and on confirm sets `expires_at` to now. The row moves to history. An override is never deleted.
  - Empty: "No one can post into the closed period." with the Grant button.
  - With no close date: the panel reads "Set a close date to grant overrides." with no button.

Numbering (admin edits)
- One card per `books_doc_sequences` row, labelled by a typed constant (`lib/doc-types.ts`): `journal` is "Journal entries". A row whose doc type has no label shows the raw doc type, so a later phase never hides a row by forgetting the label.
- Fields: Prefix (letters, digits, hyphen; max 10; may be empty) and Next number (whole number, 1 to 999999999). A live preview under them: "Next entry: JE-1001" (prefix plus number, no padding: the same join the server uses).
- Helper text: "A new prefix applies to entries posted from now on. Numbers already issued do not change. The next number can move forward only."
- Save per card. A refusal from the server ("Numbers up to 1000 are already used. The next number must be 1001 or higher.") shows under the Next number field.
- Empty (no rows): "No document numbers to set yet." This state exists only on a book with no sequences.

Access (admin only)
- A list of every user: avatar, name, email, level chip, and the control. Level select has none, read-only, bookkeeper, admin. Under the select a one-line description of the chosen level. Descriptions: None "Cannot open Books." Read-only "Can see everything and change nothing." Bookkeeper "Can enter and post entries and manage accounts. Cannot change settings." Admin "Everything a bookkeeper can do, plus settings, access, and close-date overrides."
- Who may change what, from core's rules: org owners and admins can set all four levels. A Books admin who is not an org owner or admin can only switch a bookkeeper to admin and back (the `books_admins` grant); the select is disabled with the text "Ask an organization owner or admin to change this."
- Org owners and admins always resolve to admin: their row is locked with "Organization owner" or "Organization admin". The signed-in person's own row is locked with "You cannot change your own access."
- Writes: none -> `org_pkg_access` row `access: 'none'`; read-only -> `readonly`; bookkeeper -> `full`, and delete any `books_admins` row; admin -> `full` and a `books_admins` row. A row of `org_pkg_access` is created or updated when the change requires it. These writes go through `useMutation` as one yielded sequence; a failure stops and shows the server message on the row.
- The level list is `books_access`, a view with no realtime. After each write the screen calls `books_access.reload()` and shows the chosen level on the row at once until the reload returns. A failed write puts the old level back and shows the error.
- Search box over name and email (client filter of the loaded rows; the user list is at most a few dozen in the target audience, 1 to 50 staff). Empty search result: "No one matches <text>."
- Filter chips are cut (see Cut).

States common to all sections
- Loading: `LoadingState` until the settings row, and access, are ready. Load error: message with Retry through `recoverLiveQueries`.
- Unsaved changes: leaving a dirty form with the sidebar or back asks nothing in v0 (see Non-goals); Save is disabled while the form is clean.
- Save success: a toast "Saved." and the form resets to the saved values.

## Data
Reads (all on-demand `useLiveQuery`, `{ query, queryKey }` form):
- `books_settings` (the one row).
- `books_doc_sequences` (all rows, a handful).
- `books_close_overrides` (all rows, `materialize()` of `user` and `granted_by` from `users`), ordered by `expires_at` descending. Admin view reads all; a non-admin screen reads only `eq(user, userId)` through `useMyLiveQuery`.
- `books_access` (admin only), with a `user` relation to `users` added in `collections.ts` (`relations: { user: coreStores.users }`) so `materialize()` returns name, email and avatar without a second query. Role of each user comes from `users.role`.
- `org_pkg_access` (admin only, `pkg = 'books'` rows, all users).
- `books_admins` (admin only; the grant row id is needed to delete it).
Writes (all `useMutation` generators from `@tinycld/core/lib/mutations`; refusals through `handleMutationErrorsWithForm`):
- `books_settings.update` (company fields; fiscal year; close date).
- `books_doc_sequences.update` (prefix, next_number).
- `books_close_overrides.insert` (user, reason, expires_at; `granted_by` is server-stamped and omitted) and `.update` (`expires_at` to now).
- `org_pkg_access` insert or update, and `books_admins` insert or delete.
New fields on `books_settings`, edited into migration `2100000001_create_books_settings.js` in place (Books is unreleased): `tax_id` (text, max 20), `address` (text, max 500), `phone` (text, max 40), `email` (text, max 200), `website` (text, max 200). All optional. The update rule already lets an admin write them. `tests/collections-real.test.ts` and the generated schema pick them up on the next generate.
No new endpoint. No Go change is required. Optional Go: none recommended.
New pure code: `lib/settings-schema.ts` (zod: company, accounting, close date, override, sequence), `lib/doc-types.ts`, `lib/access-levels.ts` (labels and descriptions, and `levelWrites(level)` returning the `org_pkg_access` value and whether a `books_admins` row is wanted), `lib/overrides.ts` (split active and past; expiry from a preset and a clock).

## Cut
- Billing & subscription, Usage, Sales, Expenses, Payments, Time sections of the source list: no equivalent in Books v0; sales and expense preferences arrive with their phases.
- Company type, tax form, industry, first month of income tax year: nothing in v0 reads them.
- Customer-facing email and addresses, legal address: one company address and email until the invoice and PDF units say they need more.
- Logo upload and brand color: core organization settings own them.
- Accounting method (cash or accrual): the spec stores accrual and derives cash reports per report.
- Account numbers toggle, tips account, classes, locations, projects, multicurrency toggle: out of v0 scope (Later list) or not a setting here.
- Automation toggles, date format, number format, duplicate-number warnings, sign-out timer: not in v0.
- "Allow changes after viewing a warning" and "require password" close-date policies: our rule is one policy, refuse unless overridden, with a logged reason.
- Per-area access matrix and the "Add a new user" invite form: Books has four levels; people are invited in core Settings > Members.
- Filter chips on the Access list: 50 users at most.
- Edit and delete of an override reason: the server freezes them (a log).

## Platform notes
none

## Sparks carried
- Current values visible at a glance (expressible): `SectionCard`, label/value rows (`text-muted-foreground` labels, `text-foreground` values), section summary lines in the phone list.
- Close the books as one block (expressible): core `Toggle`, `DateField`, bordered block, inner group with an `isVisible` prop.
- Role choice carries a description (expressible): `SelectInput` plus a description line.
- Direction B structure: section list as `SidebarItem`-like rows on wide; list of rows with chevron on phones.

## Non-goals
Audit trail view (the audit log report is a later unit), recurring document numbers per customer, resetting a sequence below issued numbers, bulk access changes, invites, a "leave without saving" guard, multi-currency, per-user settings, theme or navigation preferences (core), the help topic screenshots (own unit).
Help: add `help/settings.md` ("To close the books through a date, ..."; "To let someone post into a closed period, ...") in this unit, and offer the website docs after the build.
