# Audit Log — design

Unit `p5-audit-log`, feature `audit-log`, package `books`. Written in helix unattended mode on 2026-11-15 from the Books design spec (`docs/superpowers/specs/2026-10-21-books-design.md` §Scope: "Reports: … audit log …", "Every report … is a published report of the core report engine"; §Interface: the record More menu lists "audit history"; §Audience: bookkeepers are guests) and core `docs/packages.md` ("Registries", "Change signals and live views", "Report sources", "Shipped and saved reports"). Built against books `books/p5-sales-tax-liability` @ 9b4c7c0 and core `books/p5-sales-tax-liability` @ a7dc762. The binding rule of 2026-11-01 applies: *design without the limits of what reports support today; what is missing is built in core first.*

**Design gate, 2026-11-15 (human):** direction A. Q1, Q3, Q4, Q5, Q6, Q7, Q9, Q10 as the packet recommended. **Q2 changed:** any reader who can see a record can also see that record's audit log (§3 "Who sees it", §5 "Visibility rule"), not Books admins only. **Q8 changed:** checkpoint 0 does not take `exclusive`. "(Qn)" below marks where a decision of the gate applies.

## 1. Goal

A Books reader sees, in one report, every change people made to the Books records they can read (when, who, what happened, which record), narrows it by user, date and event, and opens any row to see the record's change history field by field.

## 2. Where it lives

- **The report:** core's report view `/a/reports/<id>`. A new Books shipped report, **Audit Log** (key `books.audit_log`), listed in the hub `/a/reports?package=books` for every user who can read Books, as every other Books report.
- **Record history:** a new Books screen `books/history/<collection>/<record id>` (`screens/history/[collection]/[id].tsx`). A report row opens it: beside the report in core's 480 px side panel when the window is 1360 px or wider, as its own screen otherwise (direction A, Q1; core D5). The More menu of each Books record screen listed in §3 "Entry points" opens it too (Q6).
- **Server:** Books' Go `Register(app)` registers the source `books.audit_log`, the shipped report and the view's change signal. The report's shares come from the existing Books share sync (§5 "Shares"); nothing new is registered for them.
- **Core:** checkpoint 0 (§4) on branch `books/p5-audit-log` in `tinycld`, merged at the next design gate before the package PR.

## 3. Behavior

### The Audit Log report

- **Who sees it** (Q2): every user who can read Books (`books_access.can_read`: read-only users, bookkeepers and Books admins). The report is shipped unpublished and reaches each Books reader through the viewer share Books keeps on every `books.*` shipped report; a user with no Books access does not see it in the hub, and a copied link answers "no access". A reader sees the audit rows of exactly the records they can read (§5 "Visibility rule"); a user without Books read access reads no row, so a hand-made share shows them an empty report.
- **What it lists** (Q3): one row per create, update or delete that a person or Books' own system work made on a Books record: every collection Books registers with core's audit (`server/audit.go` `auditedCollections`: accounts, customers, vendors, products, contacts, bundle items, tax agencies and rates, journal entries and lines, invoices, sales receipts, estimates, bills, expenses and their lines, estimate responses, settings, document numbering, close-date overrides, Books admins, bank connections, files, imports and transactions). Sign-ins and other core events are not Books records and stay in core's Settings → Audit log.
- **Header:** the Books business name, "Audit Log", the period in words, and the reader's time zone in words once ("Times in Central Time", core T1).
- **Columns** (left to right):
  - **Date changed** (the label column): day and time to the minute in the reader's time zone, "Nov 14, 2026, 4:07 PM" (core T1). Never cut.
  - **User**: the person's name; "System" for a change no person made (the automatic reversal sweep); an offboarded person reads as core anonymizes them ("Deleted user").
  - **Event**: Added, Changed, Posted, Voided, Deleted. Posted and Voided are updates whose status changed to posted or void; any other update is Changed.
  - **Record type**: the record's kind in words ("Invoice", "Invoice line", "Customer", "Books settings").
  - **Record**: the record's name as audit labelled it at the time ("Invoice 1001", "Invoice 1001: line 2", "1010 Business Savings", "Hartwell Supply Co."). Takes the spare width; wraps to 2 lines, then ellipsis.
- **Order:** newest first (date changed descending, then the row id). The reader can sort by any column (core viewer sort); the default comes back on Reset.
- **Params (chips, in this order):**
  - **Date changed** (`period`, date range, default **This month**, Q4; every core preset, All dates, Custom), compared in the reader's time zone: "Today" holds the changes made since local midnight (core T2).
  - **User** (`users`, multiple choice): the people who appear in the log, "System" included, by name A–Z. Unset: everyone.
  - **Event** (`events`, multiple choice: Added, Changed, Posted, Voided, Deleted). Unset: every event.
  - **Record type** (`types`, multiple choice: the record types in the order Documents, Lines, Lists, Banking, Settings and access). Unset: every type.
- **Line rows** (Q5) are listed as their own rows ("Invoice 1001: line 2"), so a change to one line is visible; the Record type chip hides them.
- **Opening a row:** a press anywhere on a row opens its record's history (core D2 `detail.open`); a line's row opens its document's history, a bundle item's row its bundle's history, an estimate response's row its estimate's history. The Date changed cell is the link (`Open: <date>`), hover underline on web, pressed dim on native.
- **Paging:** the report pages as the reader scrolls (core: 200 rows per page), so a long history never loads whole.
- **Live:** a new change appears without a reload while the report is open.
- **States** (core): loading; error with Retry; timeout with Retry; no access; empty "No rows for <period>" with "Show this fiscal year", or "Clear filters" when a chip is set.
- **Customize** (core): show or hide every column but Date changed.
- **Phone (390) and the panel:** each row wraps to two lines: date changed · event; user · record type · record. No sideways scroll. At 390 the toolbar actions sit under More (lesson 31). The `oneLine` and tablet gates are measured in phase 3 pass 2 at 390, 1024, 1280 and 1440 (with the panel open).

### Record history

- **Where:** on a window of 1360 px or more, opened from the report, in core's side panel beside the report (D5): 480 px wide, header with the record's title, **Open as full screen** (pushes `books/history/…`) and ✕ (Escape closes it too); one panel at a time; a press on another row replaces it; the opened row is marked selected. Below 1360 px from the report, and at every width from a More menu: its own Books screen with a back link.
- **Who sees it** (Q2): the same readers as the report, by the same rule (§5 "Visibility rule"): a user who can read the record reads its history.
- **Header:** the record type and name from the newest audit row ("Invoice 1001"); **Open invoice** (the record type in words) when the record still exists and the reader can open it, else the line "This record was deleted on <date>."; a line, bundle item or estimate response names and opens its document.
- **Events**, newest first, each with: date and time (reader's zone, the same text as the report), user, event, and:
  - **Changed / Posted / Voided:** a table Field | Before | After, one row per changed field, fields by their label ("Status", "Memo", "Due date"). Values in words: an amount as money in the Books currency ("1,250.00"), a day as a short day, a yes/no as Yes or No, a select value by its label ("Posted"), a related record by its current name (an account "1010 Business Savings", a customer, a user) or "Removed record" when it no longer exists or the reader cannot read it, an empty value as "Empty". A redacted field (a tax ID, the estimate link token) shows "Changed (hidden)" in both columns, for every reader. Internal keys (sort and name keys, custom field JSON, search vectors) are not listed; when only those changed the event reads "No visible fields changed".
  - **Added:** "Added <record name>" (core logs no field values on a create).
  - **Deleted:** the record's last values as a Field | Value table, by the same rules.
  - A document's history also lists its lines' events (Q10; a line event names its line: "Line 2 — Changed: Amount 120.00 → 150.00").
- **Long history:** 50 events, then **Show 50 more** (core's `AUDIT_PAGE_SIZE` paging of `lib/audit-log-page.ts`).
- **Live:** a new change to the record appears at the top while the history is open.
- **States:** loading (skeleton rows); error with Retry (books `lib/live-recovery.ts`); no events "No changes recorded for this record."; no access (a user with no Books read access who follows a link, `useBooksAccess().canRead` false): "You need Books access to see a record's history."
- **Phone:** the Field | Before | After table becomes one card per field (label, then Before, then After).

### Entry points

- The Reports hub (`/a/reports?package=books`), as every Books report.
- **Audit history** (Q6) in the More menu of these Books record screens: invoice, estimate, sales receipt, bill and expense read views (`components/documents/DocumentReadActions.tsx`), journal entries (`components/entries/EntryActionBar.tsx`), customer pages (`components/customers/page/CustomerMoreMenu.tsx`). It is the last item of the menu and is offered to every reader of the record, read-only users included (Q2). Where a screen shows no More menu to a reader today because it has no other action for them (a read-only reader, the wide entry bar that shows More only for a draft), the screen now shows More with Audit history as its one item. It opens Record history as a screen. Screens with no More menu at all get none.

### Help

New topic `books/help/audit-log.md` ("To see who changed a record, …"): opening the Audit Log, the chips, what each event means, opening a record's history (panel or screen, or More → Audit history), what "hidden" means, and who can see it (everyone who can read Books sees the changes to the records they can read); `help://books:reports` links to it. Core `help/reports.md` gains one paragraph on date-time columns and the time zone (T1, T2).

## 4. Checkpoint 0 — core extensions (branch `books/p5-audit-log` in `tinycld`, merged at the next design gate before the package PR)

Each names no package; core tests use the fictional `zoo_*` collections and the `salesstub` e2e package. No spec version bump (Q9: no new spec field; T2 is a run option, T3 a registration rule, D5 a manifest field and a view change).

| # | Extension | Where |
|---|---|---|
| T1 | **A date-time cell shows day and time in the reader's time zone** ("Nov 14, 2026, 4:07 PM"; 12- or 24-hour by the device locale), in the table, a row label, the drill panel and a param chip. A `datetime` value is an instant (`YYYY-MM-DD HH:MM:SS.sssZ`); a date stays a day. The document header shows the zone once ("Times in Central Time") when a shown column is a date-time. Exported `dateTimeText(value)` so a package screen formats the same way. | `reports/lib/format.ts` (`cellDisplay`, new `dateTimeText`), `components/ReportDocumentHeader.tsx`; vitest |
| T2 | **A date range over a date-time compares in the reader's time zone.** The run request gains `options.timeZone` (IANA name, from `Intl.DateTimeFormat().resolvedOptions().timeZone`; the client always sends it, web and Hermes). The engine turns a range's `from`/`to` days into the UTC instants of local midnight (`time.LoadLocation`), so `between(<datetime>, {param})` is `x >= fromInstant AND x < instantAfterTo`, and `gte`/`lte`/`lt`/`gt` of a date-time with a day or a range bound compare instants the same way. A missing or unknown zone is UTC (today's result). Buckets and date parts of a date-time (`year`, `month`, bucket by day) keep the UTC day (Q7) and `docs/packages.md` says so. Param options (`/api/reports/param-options`) take the same `timeZone`. | `server/reports/run.go` (`Options.TimeZone`), `formula.go` (`between`, comparisons), `params.go`, `options.go`; `reports/lib/run-client.ts`, `lib/param-options.ts`; Go tests across a DST change |
| T3 | **A Select field may read a text column.** `check.go` `compatible[Select]` accepts `text`; a stored value the options do not name shows as itself (as today for a select column). Needed because a view's computed column is text, never select. | `server/reports/check.go`; `docs/packages.md` "Report sources"; Go test |
| D5 | **A detail row's record in the side panel** (direction A, Q1). A package declares, in its manifest, panels for its own app paths: `reportPanels: [{ path: 'history', component: 'components/history/RecordHistoryPanel' }]` (a path under the package slug). The generator emits `lib/generated/report-panels.ts`. Core's `useRowLinks` opens a detail row whose `open` starts with `<slug>/<path>/` in the report view's side panel when `useDetailSurface()` is `panel` and the view hosts one (D4's rule, 1360 / 480 px), else pushes it as today. The panel state is in the source report's URL (`dr=<app path>`), so a reload keeps it; a copied link never holds it. `ReportDrillPanel` gains a record mode: header with the component's title (the component calls `usePanelTitle`), **Open as full screen** (push the path), ✕ and Escape; one side surface at a time (a record replaces a drilled report and Customize closes it). The opened row is marked selected. | `scripts/generate.ts` + new `gen-report-panels.ts`, `core/lib/packages/manifest` types, `reports/hooks/useRowLinks.ts`, `components/ReportDrillPanel.tsx`, `hooks/useDrillPanel.ts`, `lib/view-url.ts` (`dr` never in a copied link); `docs/packages.md` (manifest field, "Shipped and saved reports"); salesstub e2e at 1440 and 1280 |

**Verdict: MAJOR.** T2 edits `formula.go` and `run.go`, which every report reads; D5 edits the generator and the report view. No migration, no existing output changes for a reader in UTC; for a reader in another zone, date ranges over date-time fields change (none exists in a shipped Books report today; core's own fields are checked in the plan). Checkpoint 0 does **not** take `exclusive` (Q8, human 2026-11-15): when another report lane's core change merges first, checkpoint 0 rebases onto it. Build order T3 → T1 → T2 → D5 → docs and help.

## 5. Data (Books)

### Visibility rule (Q2)

The rule: **a user reads an audit row when they can read Books (`books_access.can_read`), the `READ` rule constant every Books migration declares** (`${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`). The view `books_audit_log` takes it as its list and view rule.

Why this rule, from the code: the human's decision is "a reader who can see a record can also see its audit log". Books decides who can see a record only by the reader's Books level: every audited collection (`auditedCollections` in `server/audit.go`) has `READ` as its list and view rule (migrations `2100000001` settings, document numbering, close-date overrides; `2100000000` `books_admins`; `2100000002` accounts, journal entries and lines; `2100000003`–`2100000005`, `2100000007`, `2100000008`, `2100000010`–`2100000013`, `2100000016`, `2100000017`). No audited collection has a narrower per-record rule (no owner, no customer or account scoping). So "can see the record" is, for every audited row today, "can read Books": **Books has no record rule narrower than every Books reader, and the audit view's rule is therefore every Books reader.** A deleted record's history follows the same rule: the reader could read the record while it existed.

What it does not change: a field core redacts (vendor and settings tax ID, the estimate public token, hidden fields) stays redacted in the log for every reader, Books admins included, even where the reader can read the live value. The actor's name comes from `users`, whose list rule admits any signed-in user (core `1800000002_users_allow_org_member_view.js`), so the view exposes no name a reader could not read already. The view whitelists its columns (no IP address, user agent or metadata).

How it stays true: a Go test (`TestAuditLogRuleFollowsAudited`, `server/audit_log_test.go`) reads the list and view rule of every collection in `auditedCollections` and of `books_audit_log`, and fails when one differs from `READ`. A later unit that gives an audited collection a narrower rule must narrow the view's rule for that record type in the same change (a new view migration once this one is released).

### Migration `2100000019_create_books_audit_log.js` (next free number at plan time): view `books_audit_log`

A view over core's `audit_logs`, with whitelisted columns (no IP address, user agent or metadata; memory p2-estimate-public-link):

- `id` = `a.id`; `created` = `a.created` (date-time); `actor` = `'system'` when `a.actor` is blank, else `a.actor` (`CAST … AS TEXT`); `actor_name` = "System" when blank, else the user's name (`LEFT JOIN users u`), "Unknown user" when the user row is gone.
- `event` (text): `added` (created), `deleted`, `posted` (`json_extract(a.changes, '$.status.after') = 'posted'`), `voided` (`= 'void'`), else `changed`.
- `record_type` = `a.resource_type`; `record_id` = `a.resource_id`; `record_label` = `a.resource_label`; `changes`, `snapshot` (JSON).
- `parent_type`, `parent_id` (text): for `books_journal_lines`, `books_invoice_lines`, `books_sales_receipt_lines`, `books_estimate_lines`, `books_bill_lines`, `books_expense_lines`, `books_bundle_items`, `books_estimate_responses`: the parent collection and the parent id, read from the live row (`SELECT <parent> FROM <lines> WHERE id = a.resource_id`) else from the delete snapshot (`json_extract(a.snapshot, '$.<parent>')`); empty for other types.
- `history_type`, `history_id` (text): the record whose history a row opens: the parent when `parent_id` is not empty, else the record itself. The report's `detail.open` reads them, so the spec needs no `if` over a blank select.
- `WHERE a.resource_type >= 'books_' AND a.resource_type < 'books`'` (a prefix range the `idx_audit_resource` index serves; `` ` `` sorts right after `_`).
- **List and view rule:** `READ` (§5 "Visibility rule"). No create, update or delete.
- `server/register.go`: `changesignal.RegisterView("books_audit_log", "audit_logs", "users", <the eight parent collections>)`; pinned by `changesignal.CheckViews` in a Books test (memory p5-change-signal).

### Source `books.audit_log` (`server/report_sources.go`)

Over `books_audit_log`: `created` "Date changed" (`DateTime`, MinMax), `actor` "User ID" (Text), `actor_name` "User" (Text, MinMax), `event` "Event" (`Select` over text, core T3: added → Added, changed → Changed, posted → Posted, voided → Voided, deleted → Deleted), `record_type` "Record type" (`Select` over text, options `auditRecordTypeOptions()` in the order of the Record type param), `record_id` (Text), `record_label` "Record" (Text), `parent_type` (Select, same options), `parent_id` (Text), `history_type` and `history_id` (Text). JSON columns are left out. `Heading` and `FiscalStartMonth` as every Books source; no money, so no `Currency`. Pinned by `reports.CheckSources` (the first source over a view: a refusal is a core fix in checkpoint 0).

`auditRecordTypeOptions()` (`server/audit.go`) labels each key of `auditedCollections`; `TestAuditRecordTypesCoverAudited` fails when an audited collection has no option, so the next unit that audits a collection labels it.

### Shipped report `books.audit_log` (`server/report_audit_log.go`, spec v4, Revision 1, `Unpublished: true`)

- `source` `books.audit_log`; `params`: `period` (dateRange, default `thisMonth`), `users` (choice, multiple, `optionsFrom { source: books.audit_log, value: [actor], label: [actor_name] }`), `events` (choice, multiple, static options), `types` (choice, multiple, static options from `auditRecordTypeOptions()`).
- `filter`: `and( between([created], {param period}), in([actor], {param users}), in([event], {param events}), in([record_type], {param types}) )`.
- `columns`: `created` "Date changed"; `user` "User" (`[actor_name]`); `event` "Event"; `type` "Record type" (`[record_type]`); `record` "Record" (`[record_label]`).
- `sort`: `[created]` desc, `[id]` desc. `detail`: `{ label: [created], open: concat("books/history/", [history_type], "/", [history_id]) }`.
- `display`: `created` and `event` `max-content`; `user` `16ch`; `type` `14ch`; `record` `flexGrow: 2`, `whiteSpace: normal`, `lineClamp: 2`; `layouts`: mobile (created · event; user · type · record), tablet; `oneLine.minWidth` measured in phase 3 pass 2.
- Title "Audit Log"; description "Every change people made to Books records: when, who and what."

### Shares

No change to `server/report_shares.go`. The Audit Log is a `books.*` shipped report, so the existing sync gives each user whose `books_access` grants read a viewer share and removes it when that access goes or the user is offboarded, as for every other Books report. A Go test asserts that a Books reader who is not an admin holds a viewer share on `books.audit_log` after the report ships. `TestRegister_BindsEachPartOnce`'s hand-bound list gains any new hook-bound part this unit adds (memory p5-trial-balance).

### Client (`tinycld/books`)

- `collections.ts`: `books_audit_log` (`...onDemand`, `...liveViewOptions('books_audit_log')`), read-only.
- `screens/history/[collection]/[id].tsx` → `components/history/RecordHistory.tsx` (shared by the screen and the panel), `components/history/RecordHistoryPanel.tsx` (D5), `hooks/useRecordHistory.ts`: one live query: `books_audit_log` where `(record_type = c and record_id = id) or (parent_type = c and parent_id = id)`, `orderBy created desc`, `limit(auditWindowSize(page))` (core `lib/audit-log-page.ts`), `queryKey ['books.history', c, id, page]`. Related records for Before/After names: `materialize()` per relation in a row component, by the field's target collection (memory: no `Map` stitching). The no-access state reads `useBooksAccess().canRead`.
- `lib/audit-fields.ts`: per audited collection, each field's label and kind (`text`, `money`, `day`, `bool`, `select` with labels, `relation` with target collection, `hidden`); unknown field → its key in words, value as text. A vitest compares the map with each audited collection's fields in `@tinycld/core/types/pbSchema` (generated from the migrations), so a new field must be labelled.
- `lib/audit-record-route.ts` (`auditRecordHref(collection, id)`): the screen that shows a record: documents through `documentHref`, entries through `entryHref` of the live row, customers, vendors, products, accounts through their `recordPath`, tax agencies and rates → Taxes, settings, numbering, overrides and admins → Settings, banking rows → Banking; no route → no Open button.
- The More menu items (Q6): `Audit history`, for every reader of the record (`useBooksAccess().canRead`), push `books/history/<collection>/<id>`; the screens of §3 "Entry points" show More whenever it holds at least this item.

### Fixture

`tinycld/books/lib/audit-log-fixture.ts`: static `RunResult`s of the report (30 rows over three days and four users, System included, every event, long record names, line rows) and `books_audit_log` rows for one invoice's history (added, lines added, changed memo and due date, posted, a line changed, voided) and a deleted customer; typed against the generated record type of `books_audit_log` once checkpoint 1 adds the migration (until then a local interface, named in a comment).

## 6. Tests (Books)

- Go: `report_audit_log_test.go`: `CheckSources`, `Load`, `Validate`; a `Run` as a Books admin over audit rows made by real request writes (create, update, post, void, delete; a line; the auto-reversal system row): events, user names, System, parent ids from live rows and from a delete snapshot, the `open` paths; the same run as a bookkeeper and as a read-only user reads the same rows; a user with no Books access reads no rows; `period` in `America/Chicago` around local midnight (T2). `audit_log_test.go`: `TestAuditLogRuleFollowsAudited` (§5 "Visibility rule"). `report_shares_test.go`: a non-admin Books reader holds a viewer share on `books.audit_log`, and loses it when their Books access goes. `CheckViews`. `TestAuditRecordTypesCoverAudited`.
- Vitest: `audit-fields` against pbSchema; `audit-record-route`; `help-reports` link.
- E2e (data through the UI, unique names; `timezoneId: 'America/Chicago'`): `tests/e2e/audit-log.spec.ts` (1280): add a product, rename it, delete it; post and void a journal entry → the Audit Log lists Added / Changed / Deleted / Posted / Voided rows with local times to the minute; User, Event and Record type chips narrow; Date changed "Today"; open a row → Record history as a screen with Before/After; Open <record> from history; a document's More → Audit history; the collaborator (`signInAsCollaborator`, a Books reader who is not a Books admin) sees the Audit Log in the hub with the same rows, and Audit history in a document's More menu. `tests/e2e/audit-log-panel.spec.ts` (1440): the row opens the history in the panel; another row replaces it; Open as full screen; ✕ and Escape; resize to 1280 → page form. `tests/e2e/audit-log-phone.spec.ts` (390×844): wrapped rows, no sideways scroll, a tap opens the history screen with field cards.

## 7. Cut

- **Sign-in, sign-out and other core events** (the screenshot's "Signed in"): not Books records; core Settings → Audit log shows them.
- **Merge events** ("Merged vendor … to …"): Books has no merge yet; its unit adds an event if it logs one.
- **One sentence per row** ("Added Product or Service Photo Services"): split into Event, Record type and Record so each is a filter and a sort key (spark 1).
- **Undo or restore from the log**: not in the Books design spec.
- **IP address and device**: kept out of the Books view; core's Settings audit log has them for org admins.
- **Exports, print, email of the report**: p5-exports.
- **The screenshot's look** (red frames, uppercase headings, blue links): not carried.

## 8. Platform notes

None new. Inherited and already signed off: core report view items (`DocumentTitle`, `web:[scrollbar-gutter:stable]`, the hover underline of a row link, ⌘-click / middle-click opening the full screen in a new tab), and Escape to close the panel (shortcut, standing approval). The time zone comes from `Intl` on web and Hermes alike.

## 9. Sparks carried

1. Event reads as words a bookkeeper says: Event, Record type and Record columns in core cells (`text-foreground`), Event and Record type labels from Go select options; no new token.
2. Date to the minute, zone once: core T1 (`dateTimeText`, the header's zone line); no new token.

## 10. Non-goals

- No change to what core's audit hooks record or to `auditedCollections`' labels.
- No change to core's Settings → Audit log screen.
- No per-field audit for creates (core logs no values on create).
- No audit of reads.
- No admin-only report level or admin-only share sync: the Audit Log is shared as every Books report.
- No per-record visibility narrower than Books read access: Books has none today (§5 "Visibility rule").
