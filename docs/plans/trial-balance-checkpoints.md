# trial-balance — checkpoints

Spec: `docs/specs/trial-balance-design.md` (revision 2, approved 2026-11-01; §7 items 7–9 corrected 2026-11-04, see the ledger). Reference: `docs/plans/trial-balance-reference/` (capture `docs/plans/trial-balance-capture.json`). Core: main e71fe387, which holds checkpoint 0 (core PR #424, report engine spec v2), plus the D1/D2 core PR (https://github.com/tinycld/tinycld/pull/430), which must merge before checkpoint 3 (the spec's `optionsFrom.groupLabel`; core's strict spec decoder refuses an unknown key) and so before checkpoints 4 and 5 (the group pick text and the package hub). Package branch `books/p5-trial-balance`. Review mode C (unattended).

Rules for every checkpoint:

- The human's rule is binding: reports are designed without the limits of the engine. If a step needs a core capability that core does not have (the engine refuses a spec part, a view part is missing, a helper is not exported), **stop the run and report the gap**. Never edit `tinycld/` and never design around the gap.
- Paths are relative to the books package root (`/Users/nas/tmp/tinycld/books-purchases/books`). Go code is package `books` in `server/`. Run Go tests from `server/` with `go test ./...`; run biome, tsc and vitest through `pnpm exec tinycld-pkg check` from the package root, or the binaries in `/Users/nas/tmp/tinycld/books-purchases/node_modules/.bin` (`pnpm exec tsc` triggers a workspace install).
- E2E: `E2E_PORT=7210 E2E_PORT_2=7211 pnpm exec tinycld-pkg test:e2e -- -g "trial-balance:"`, or one other spec file by name (`-- <name>.spec.ts`). Check ports 7210/7211 are free first. Never the full suite.
- Every `test.describe` title this run adds starts with `trial-balance:`.
- After a new or edited migration, run `pnpm run packages:generate` in `/Users/nas/tmp/tinycld/books-purchases/tinycld` (regenerates `pbSchema.ts` and the migration links).
- No raw PocketBase writes in tests, fixtures or components except where this plan names a Go test (Go tests write through `app.Save`, as every books Go test does). E2E creates data through the UI; a raw REST GET is allowed only for a read-only assertion.
- Every checkpoint starts with the test writer (a different agent from the implementer): it writes the checkpoint's "Tests it must add", plus any test-only helper they need, and proves each red for the reason named in the checkpoint's first Do step. The implementer then makes them green and never edits them.

## Decisions D1 and D2 (resolved 2026-11-04)

The plan review found two places where the approved spec asked for something core's merged view did not do. The human chose a core change for both (2026-11-04); the core PR is https://github.com/tinycld/tinycld/pull/430. **Checkpoints 3, 4 and 5 need that PR merged** (and the books checkout's core pulled, then `pnpm run packages:generate` in `tinycld` and `pnpm install` at the workspace root); checkpoints 1 and 2 do not use it.

- **D1 — group pick text: (b), core change.** A source-backed choice param names its whole-group pick with `optionsFrom.groupLabel`, a template in which `{group}` stands for the group's label (absent: core's "All {group}"; the engine refuses it without `optionsFrom.group`, without `{group}`, or over 200 bytes). The Trial Balance's Accounts param sets `"groupLabel": "All {group} accounts"`, so the picker and the chip show "All Expense accounts" (spec §3, §5, §7.4).
- **D2 — hub for a Books reader: (b), core change.** Core's hub opened with `?package=<slug>` has no tabs: it lists, in one list ordered by title, every report of that package the reader can open (their own, shared with them, published). The Books sidebar → `/a/reports?package=books` flow shows the Trial Balance to every Books reader with no tab press (spec §2, §7.1). The unfiltered hub (`openReportsHub`, the rail) keeps its tabs, so checkpoint 4's helper, which opens the unfiltered hub, still presses "Shared with me"; checkpoint 5's sidebar flow presses no tab.

## Checkpoint list

1. Account full names, retained earnings — logic
2. Books report sources — logic
3. Trial Balance shipped report — logic
4. Readers see the Trial Balance — renders
5. Sidebar opens core Reports hub — renders
6. Remove the Books report shell — logic

### Checkpoint 1 — Account full names, retained earnings

**Delivers:** every account carries a server-kept `full_name` (its parent path), every chart keeps exactly one retained-earnings account (`3900 Retained earnings` in the owners' starter chart), and the seeded e2e book holds that account plus a prior-year entry.

**Files:**
- Modify: `pb-migrations/2100000002_create_books_ledger.js` (books_accounts gains `full_name`; create/update rules refuse it in the body)
- Modify: `server/accounts.go` (stamp `full_name`; cascade to sub-accounts; the retained-earnings rule)
- Modify: `server/ledger.go` (`serializedThen`: a check, the write, then a step inside the same transaction)
- Modify: `tinycld/books/collections.ts` (`full_name` in books_accounts `omitOnInsert`)
- Modify: `tinycld/books/lib/starter-chart.ts` (owners' chart gains `3900 Retained earnings`)
- Modify: `server/settings.go` (setup completion makes sure the chart has a retained-earnings account)
- Modify: `server/posting.go` (a post that touches an income or expense account makes sure one exists)
- Modify: `tinycld/books/lib/setup-plan.ts` (`planChart` plans the retained-earnings starter account only when the chart has none)
- Modify: `tinycld/books/hooks/useBooksSetup.ts` (passes `hasRetainedEarnings`)
- Modify: `tinycld/books/lib/seed-accounts.ts` (seeded book gains `retained`, `3900 Retained earnings`)
- Modify: `tinycld/books/seed.ts` (posts `PRIOR_YEAR_SEED`)
- Modify: `tinycld/books/lib/trial-balance-fixture.ts` (local interface → generated `BooksAccounts` type with `satisfies`; reads the retained account from `SEED_ACCOUNTS`)
- Modify: every fixture or test row typed as `BooksAccounts` that tsc flags after the schema change (adds `full_name`)
- Test: `server/accounts_test.go` · `server/settings_test.go` · `server/posting_test.go` · `tests/starter-chart.test.ts` · `tests/setup-plan.test.ts`

**Interfaces:**
- Consumes: `serialized(e *core.RecordEvent, check func(tx core.App) error) error` (server/ledger.go); `validateAccount`, `checkAccountChange`, `checkAccountDelete` (server/accounts.go); `registerSettingsGuard` (server/settings.go); `postEntry(tx core.App, entry *core.Record, now time.Time) error`, `entryLines` (server/posting.go); `isExpenseGroupType`, `accountTypes` (server); `apiReq` (server/env_test.go, one call per app); `SEED_ACCOUNTS`, `SeedAccount` (lib/seed-accounts.ts); `starterChart(ownership: Ownership): StarterAccount[]` (lib/starter-chart.ts); `planChart` (lib/setup-plan.ts); `postEntry` (seed.ts); `PRIOR_YEAR_SEED`, `TRIAL_BALANCE_ACCOUNTS` (lib/trial-balance-fixture.ts)
- Produces: books_accounts field `full_name` (text, max 1100, server-set); Go `fullNameOf(tx core.App, r *core.Record) (string, error)`; Go `serializedThen(e *core.RecordEvent, check, after func(tx core.App) error) error`; Go const `msgNeedsRetainedEarnings = "Books needs one Retained earnings account. Rename it instead."` and `msgSecondRetainedEarnings = "This chart already has a Retained earnings account."`; Go `ensureRetainedEarnings(tx core.App) error`; TS `planChart(ownership: Ownership, existing: ReadonlyMap<string, string>, hasRetainedEarnings: boolean): StarterAccount[][]`; seed account key `retained` (number `3900`)

**Gates:** 1 · 3 (nothing renders)

**Spec:**
- "`books_accounts.full_name` (Q4): text max 1100, server-set on create and on any change of `name` or `parent`, for the account and every sub-account below it, inside the `serialized` account guard; refused in request bodies, like `currency`. Edited into migration 2100000002 (unreleased)."
- "**One retained-earnings account per chart (OQ3):** the owners' starter chart gains `3900 Retained earnings` (equity, `retained_earnings`; `inferOwnership` still reads 3000/3100/3200 against 3300/3400/3500). The server refuses a second account with detail type `retained_earnings`, and refuses deleting, deactivating or re-typing the only one ("Books needs one Retained earnings account. Rename it instead."). The setup wizard creates it in both charts."
- From the Behavior list (the invariant this checkpoint makes true): "Books keeps exactly one retained-earnings account in every chart (OQ3), so the row is always a real account ("3500 Retained earnings" in a corporation chart, "3900 Retained earnings" in an owners' chart)."
- Note: no `inferOwnership` function exists in the code (the setup wizard asks the ownership); the 3000–3500 numbers stay distinct and 3900 is new, which is all that sentence requires.
- Note: the wizard alone cannot keep "exactly one in every chart" true: "Skip chart" (`useBooksSetup.ts:190`, `execute(values, false)`), a chart made by hand or by CSV import before setup, and posting before setup all leave a chart with none, and the fold's lookup would then key prior-year lines to no account. So the server makes sure one exists (`ensureRetainedEarnings`) when setup completes and when a post touches an income or expense account; with the refusals below, every chart that has P&L postings holds exactly one. A CSV import row that would be a second one is refused by the server like any other refused row: the import stops at that row and shows its line, name and the server's message (the existing `Failure` path, `hooks/useAccountImport.ts:256-262`; no new client code).

**Tests it must add:**
- `server/accounts_test.go` (Go, `newBooksApp`, `mkAccount`, `saveRecord`, `requireRefused`):
  - `TestFullNameStampedOnCreate`: a top-level account's `full_name` equals its name; a sub-account's is `"<parent name>:<name>"`; a third level is `"A:B:C"`.
  - `TestFullNameFollowsRenameAndMove`: renaming the top account rewrites `full_name` of the account, its child and its grandchild (re-read each with `reload`); moving the child under another parent rewrites the child and the grandchild; an edit of `description` alone leaves every `full_name` as it was.
  - `TestFullNameRefusedInBody`, two subtests on two apps (`apiReq` allows one call per app, `env_test.go:122-124`): an API create (a Books admin token) that sends `full_name` answers 400; an API PATCH that sends it answers 404 (PocketBase answers a refused update rule with 404, as `company_settings_test.go:80` expects); the stored value is unchanged.
  - `TestRetainedEarningsRules`: with one `retained_earnings` account, creating a second (create, and an update of another equity account's detail type to `retained_earnings`) is refused with `msgSecondRetainedEarnings`; deleting, setting `inactive`, or changing the detail type or type of the only one is refused with `msgNeedsRetainedEarnings`; renaming it and changing its number pass; a chart with none accepts the first.
- `server/settings_test.go`: `TestSetupCompletionEnsuresRetainedEarnings`: a chart with no retained-earnings account and `ownership` "owners" gets one `3900 Retained earnings` (equity, `retained_earnings`) when `setup_completed` turns true; with `ownership` "corporation" it gets number 3500; when that number is taken by another account the new one has an empty number; a chart that already has one gets no second; an update of another setting creates nothing.
- `server/posting_test.go`: `TestPostEnsuresRetainedEarnings`: posting an entry with an income or expense line in a book with none creates exactly one (number by `ownership` as above, `ownership` empty → 3900); posting a balance-sheet-only entry creates none; a second P&L post creates no second one; the account is created in the same transaction as the post (a post refused later in the same check, e.g. by the close date, leaves no account behind).
- `tests/starter-chart.test.ts`: the owners' chart holds `3900 Retained earnings` (type `equity`, detail `retained_earnings`); each chart holds exactly one `retained_earnings` account; the numbers 3000/3100/3200 (owners) and 3300/3400/3500 (corporation) are unchanged.
- `tests/setup-plan.test.ts`: `planChart('owners', new Map(), false)` includes 3900; `planChart('owners', existing, true)` with an existing chart that already holds a retained-earnings account under another number plans no `retained_earnings` account.

**Do:**
0. Test writer: write the tests above first. Red for: `full_name` is not a field (Go tests fail on the missing value / the create with `full_name` passes); no retained-earnings rule (the second account saves); no account is created at setup completion or on a P&L post (Go code that does not compile is not a red: the test writer adds no-op stubs of the Go names this plan fixes, e.g. `func ensureRetainedEarnings(tx core.App) error { return nil }`, so each test compiles and fails on behavior); 3900 missing from the starter chart; `planChart` has no third parameter (tsc error in the test file is acceptable red for that one test, named as such).
1. Carried check (a): confirm `tsconfig.json` `include` lists `tests/**/*.ts` and `tests/**/*.tsx` and run `tsc --noEmit -p tsconfig.json` before any change (at 0a166ba it exited 0: the 65 errors of 2026-10-26 were fixed by p3-vendors). If it reports any error, fix each at its source before step 2. Record the result in the ledger row of this checkpoint. Every later checkpoint's gate 1 runs the same tsc, so new tests are typechecked too.
2. Migration: in `2100000002_create_books_ledger.js`, books_accounts fields, after `name`: `{ name: 'full_name', type: 'text', max: 1100 }`. In the create and update rules, add `full_name` beside `currency` in the `unset(...)` call (`${WRITE} && ${unset('currency', 'full_name')}`). Run `pnpm run packages:generate` in `tinycld/`; run tsc and add `full_name` to each fixture or test row it flags (the account rows typed `satisfies BooksAccounts` in `lib/*-fixture.ts`, `tests/*`).
3. `server/ledger.go`: add `serializedThen(e, check, after)`: as `serialized`, and after `e.Next()` returns nil it runs `after(tx)` inside the same `RunInTransaction`. `serialized` becomes `serializedThen(e, check, nil)`.
4. `server/accounts.go`:
   - `fullNameOf(tx, r)`: `r.GetString("name")` when `parent` is empty; else the parent's stored `full_name` (`tx.FindRecordById("books_accounts", parent)`) + `":"` + name.
   - Create hook: after `validateAccount`, `r.Set("full_name", fullNameOf(...))`.
   - Update hook (now `serializedThen`): check = validate + `checkAccountChange` + set `full_name` from `fullNameOf`; after = when the `full_name` just computed differs from `stored.GetString("full_name")` (a rename, a move, or a parent's new path reaching this child), for each direct child (`tx.FindAllRecords("books_accounts", dbx.HashExp{"parent": r.Id})`) `tx.Save(child)`; the child's own update hook recomputes its `full_name` from the parent just saved in this transaction and cascades to its children.
   - Retained-earnings rule in `validateAccount` (create and update): when `detail_type` is `retained_earnings`, count other accounts with that detail type (`dbx.And(dbx.HashExp{"detail_type": "retained_earnings"}, dbx.Not(dbx.HashExp{"id": r.Id}))`); more than 0 → `refuse(msgSecondRetainedEarnings)`.
   - In `checkAccountChange`: when `stored` is `retained_earnings` and `next` changes `type`, `detail_type`, or sets `inactive` → `refuse(msgNeedsRetainedEarnings)`. In `checkAccountDelete`: deleting a `retained_earnings` account → `refuse(msgNeedsRetainedEarnings)` (it is the only one, by the rule above).
5. `tinycld/books/collections.ts`: books_accounts `omitOnInsert: ['created', 'updated', 'currency', 'full_name']`.
6. `lib/starter-chart.ts` `EQUITY.owners`: append `account('3900', 'Retained earnings', 'equity', 'retained_earnings')`.
7. `lib/setup-plan.ts`: `planChart(ownership, existing, hasRetainedEarnings)` filters out the starter account whose `detail_type` is `retained_earnings` when `hasRetainedEarnings` is true (a resumed batch whose chart already holds one under another number). `hooks/useBooksSetup.ts`: compute `hasRetainedEarnings = (accounts ?? []).some(a => a.detail_type === 'retained_earnings')` and pass it.
7a. `server/accounts.go`: `ensureRetainedEarnings(tx)`: when `tx.CountRecords("books_accounts", dbx.HashExp{"detail_type": "retained_earnings"})` is 0, save a books_accounts record `{name: "Retained earnings", type: "equity", detail_type: "retained_earnings", number: n}` through `tx.Save` (the create hook stamps currency and `full_name`), where `n` is "3500" when `books_settings.ownership` is "corporation", else "3900", and "" when an account already has that number.
7b. `server/settings.go` update hook: after the close-date check, when `stored.GetBool("setup_completed")` is false and `e.Record.GetBool("setup_completed")` is true, `ensureRetainedEarnings(tx)` (inside the same `serialized`).
7c. `server/posting.go` `postEntry`: after `validateLines` and before `stampPosted`, when any line's account type is in the income or expense group (`accountType(...).Group`), `ensureRetainedEarnings(tx)`.
8. `lib/seed-accounts.ts`: append `{ key: 'retained', name: 'Retained earnings', number: '3900', type: 'equity', detail_type: 'retained_earnings' }`.
9. `lib/trial-balance-fixture.ts`: delete `RETAINED_EARNINGS_SEED` and the local `TrialBalanceAccount` interface; type the rows as `Pick<BooksAccounts, 'id' | 'number' | 'full_name' | 'type' | 'inactive'> & { key: string }` and build the retained row with `account('retained', 'tbacct0retained')`; keep the comment line naming this file's use (reference route, seed). The scratch route (`screens/helix-mockup.tsx`, not committed) keeps compiling: run tsc.
10. `seed.ts`: after `seedJournalEntries`, `await postEntry(pb, ctx, ids, { date: \`${year - PRIOR_YEAR_SEED.yearsAgo}-${PRIOR_YEAR_SEED.day}\`, memo: PRIOR_YEAR_SEED.memo, lines: PRIOR_YEAR_SEED.lines })` with `PRIOR_YEAR_SEED` imported from `./lib/trial-balance-fixture`.
11. The new seed account and entry change the shared e2e book. Run, one file at a time, every books e2e spec that names a seeded account the change touches or counts the chart: `chart-of-accounts.spec.ts`, `chart-of-accounts-balance.spec.ts`, `account-register-table.spec.ts`, `account-register-states.spec.ts`, `account-register-navigation.spec.ts`, `account-register-drawer.spec.ts`, `journal-entries-read-only.spec.ts`, `list-paging.spec.ts`, `opening-balances.spec.ts`, `books-settings.spec.ts` (it holds the setup-wizard tests, which complete setup on the shared DB and so run `ensureRetainedEarnings`). A failure caused by the new rows is fixed at its source (a spec that assumed a fixed count or balance reads it from the screen instead); never by removing the seed rows.
12. `cd server && go test ./...`; `pnpm exec tinycld-pkg check`. A Go test that counted accounts and now sees the retained-earnings account a P&L post creates is fixed at its source (it counts the accounts it made, or expects the new one).

### Checkpoint 2 — Books report sources

**Delivers:** core's report engine reads Books data through five registered sources (`books.accounts`, `books.journal_entries`, `books.journal_lines`, `books.account_balances`, `books.customers`) that print the Books business name above their reports.

**Files:**
- Create: `server/report_sources.go`
- Create: `server/report_sources_test.go`
- Modify: `server/register.go` (registers the sources; `tinycld.org/core/reports` is in module `tinycld.org/core`, which `server/go.mod` already requires, so go.mod does not change)

**Interfaces:**
- Consumes: `reports.RegisterSource(src reports.Source)`, `reports.Source{Key, Collection, Label, Fields, Links, FiscalStartMonth, Heading, Watch}` (since core PR #431, 6a47738f: `Heading func(app core.App, reader *core.RequestInfo) string`, `FiscalStartMonth func(app core.App, reader *core.RequestInfo) int`), `reports.FindViewableRecord(app core.App, reader *core.RequestInfo, collection, id string) (*core.Record, error)` (core/server/reports/reader.go; `sql.ErrNoRows` when the row is missing or the reader may not view it), `reports.Field{Key, Column, Label, Type, Aggregates, Currency, Options, TextDay}`, `reports.Link{Key, Label, Target, Cardinality, Field, BackField}`, `reports.CheckSources(app core.App) error`, `reports.SumAll`, `reports.MinMax`, `reports.ToOne`, `reports.ToMany` (tinycld.org/core/reports); `settingsID`, `accountTypes []AccountType` (server)
- Produces: Go `reportSources() []reports.Source`; `booksHeading(app core.App, reader *core.RequestInfo) string`; `booksFiscalStart(app core.App, reader *core.RequestInfo) int`; source keys `books.accounts`, `books.journal_entries`, `books.journal_lines`, `books.account_balances`, `books.customers`

Resume amendment (2026-11-05): checkpoint 2 stopped at gate 3 (the heading and fiscal start were read without the reader's rules, so a user with Books access `none` got the business name and fiscal month); core PR #431 gave `Heading` and `FiscalStartMonth` the reader and added `FindViewableRecord`. The signatures, step 2 and the heading tests below follow it (packages.md "Report sources": "The functions run with the app, not under the reader's rules. They must return only what that reader may see.").

**Gates:** 1 · 3 (nothing renders)

**Spec:**
- "Five sources (§5 table). Books days register as `Date` (E1); every source prints the Books heading (E9). People build their own Books reports from them with every checkpoint 0 feature."
- "Every Books source: key `books.<name>`; `FiscalStartMonth` = `books_settings.fiscal_year_start_month` (1 when no row); `Heading` = `books_settings.business_name` (E9). No `Source.Currency`: each money field names its row's `currency` column, which posting stamps from the Books currency setting."
- "Left out: json columns, `sort_key`, hidden `name_key`, `form`, `form_1099_box`, `position`, `close_override`, user relations. Vendors and products: their own units (Q10). Pinned by `reports.CheckSources` in `server/report_sources_test.go`."

**Tests it must add:**
- `server/report_sources_test.go` (Go, `newBooksApp`, after the Books migrations apply, with `reports.ResetForTesting()` then the Books registrations):
  - `TestReportSourcesPass`: `reports.CheckSources(app)` returns nil and `reports.Refused(app)` is empty for every `books.*` key.
  - `TestReportSourcesCatalog`: `reports.Sources(app)` holds exactly the five keys; for each source, the field keys, types and the link keys/targets/cardinalities equal the §5 table (a table-driven expectation written from the spec, not from the code); `date` on entries and lines and `auto_reverse_on` are `Date` with `TextDay`; money fields name `currency`; `type` is a Select whose options are `account_types.json` in file order with its labels; no source lists `sort_key`, `name_key`, `form`, `form_1099_box`, `position`, `close_override`, `billing_address`, `shipping_address`, `fields`, or a user relation.
  - `TestReportSourcesHeadingAndFiscalStart`: for a reader who may view `books_settings` (a Books reader), with `business_name` "Harbor Lane Design LLC" and fiscal month 7, `booksHeading(app, reader)` is that name and `booksFiscalStart(app, reader)` is 7; with an empty name the heading is "" (core then prints the organization's name); with no settings row (delete it in the test) the start is 1 and the heading "". For a reader with Books access `none` (who may not view `books_settings`), with the name and month 7 set, the heading is "" and the start is 1.
  - `TestReportSourcesRun`: a `reports.Run` of a minimal v2 spec over `books.journal_lines` (`columns: [{id: "debit", path: [{field: "debit"}], aggregate: "sum"}]`, `filter: lte([date], {value: "<day>"})`) as a Books reader returns the sum of posted lines up to that day, `heading` "Harbor Lane Design LLC", and `topics` containing `collection/books_journal_lines` and `collection/books_settings`; as a user with Books level `none` it returns no rows (the collection rules apply) and its `heading` is "".

**Do:**
0. Test writer: write `server/report_sources_test.go` first, with a no-op `func reportSources() []reports.Source { return nil }`, `booksHeading` returning "" and `booksFiscalStart` returning 1 as stubs so it compiles. Red for: no `books.*` source is registered (catalog and run tests), the heading is empty, the fiscal start ignores the setting.
1. `server/report_sources.go`: `func reportSources() []reports.Source` returns the five sources of spec §5, exactly:
   - `books.accounts` "Accounts", collection `books_accounts`: `name`, `full_name`, `number` Text `MinMax`; `type` Select with `Options` from `accountTypes` (`{Value: t.Key, Label: t.Label}`, file order); `detail_type`, `description`, `currency` Text; `inactive` Bool. Links: `parent` ToOne → `books.accounts` (Field `parent`); `sub_accounts` ToMany → `books.accounts` (BackField `parent`); `lines` ToMany → `books.journal_lines` (BackField `account`); `balances` ToMany → `books.account_balances` (BackField `account`).
   - `books.journal_entries` "Journal entries", `books_journal_entries`: `date` Date `TextDay` `MinMax`; `status` Select (draft "Draft", posted "Posted", void "Void"); `origin` Select (manual "Manual", reversal "Reversal", auto_reversal "Auto-reversal", void_reversal "Void reversal", opening_balance "Opening balance"); `doc_type` Select (journal "Journal entry"); `number` Text `MinMax`; `memo` Text; `total` Money `SumAll` Currency `currency`; `currency` Text; `auto_reverse_on` Date `TextDay`; `posted_at` DateTime `MinMax`. Links: `lines` ToMany → `books.journal_lines` (BackField `entry`); `reverses`, `replaces` ToOne → `books.journal_entries`.
   - `books.journal_lines` "Journal lines", `books_journal_lines`: `debit`, `credit` Money `SumAll` Currency `currency`; `memo` Text; `date` Date `TextDay` `MinMax`; `posted` Bool; `currency` Text. Links: `entry` ToOne → `books.journal_entries`; `account` ToOne → `books.accounts`.
   - `books.account_balances` "Monthly account balances", `books_account_balances`: `period` Text `MinMax` (Label "Month"); `debit_total`, `credit_total` Money `SumAll` Currency `currency`; `currency` Text. Link `account` ToOne → `books.accounts`.
   - `books.customers` "Customers", `books_customers`: `display_name` Text `MinMax`; `company`, `first_name`, `last_name`, `email`, `phone`, `mobile`, `website`, `notes` Text; `inactive` Bool. Links: `parent` ToOne → `books.customers`; `sub_customers` ToMany → `books.customers` (BackField `parent`).
   Every source: `FiscalStartMonth: booksFiscalStart`, `Heading: booksHeading`, `Watch: []string{"books_settings"}`. Read the stored field types in the migration before choosing a type: a PocketBase `email`/`url` column must be checked against core's `check.go compatible`; if core refuses a Text field over an `email` or `url` column, that is a core gap: stop and report it.
2. Both read the settings row for the reader: `reports.FindViewableRecord(app, reader, "books_settings", settingsID)` (never `loadSettings(app)`, which reads without rules). `errors.Is(err, sql.ErrNoRows)` (missing row, or the reader may not view it) → the fallback with no log; any other error → log with `logging.ForPackage("books")` (`WarnContext` when a context is in scope, else `Warn`) and the fallback. `booksFiscalStart(app, reader)`: fallback 1; the row's `fiscal_year_start_month` outside 1–12 returns 1. `booksHeading(app, reader)`: fallback ""; else `strings.TrimSpace(r.GetString("business_name"))`.
3. `server/register.go`: after `registerLedger(app)`, `for _, s := range reportSources() { reports.RegisterSource(s) }`. (`registrations_test.go` holds only audit, OAuth, quota and offboard checks, so it does not change.)
4. `cd server && go test ./...`.

### Checkpoint 3 — Trial Balance shipped report

**Delivers:** Books ships the Trial Balance as an unpublished core report (`books.trial_balance`, revision 1) whose spec gives sign-split Debit/Credit, Rows Non-zero/Active/All, the Accounts filter, the retained-earnings fold, chart order, totals that add the rows shown, and labelled opened lines.

**Files:**
- Create: `server/report_trial_balance.go`
- Create: `server/report_trial_balance_test.go`
- Modify: `server/register.go` (registers the shipped report)

**Interfaces:**
- Consumes: `reportSources() []reports.Source` and the source keys from checkpoint 2; `reports.RegisterShipped(s reports.Shipped)`, `reports.Shipped{Key, Title, Description, Spec, Revision, Unpublished}`, `reports.Spec`, `reports.Column`, `reports.Group`, `reports.Fill`, `reports.SortKey`, `reports.Detail`, `reports.ParamDef`, `reports.OptionsFrom`, `reports.Option`, `reports.Node`, `reports.Path`, `reports.Hop`, `reports.Load`, `reports.Validate`, `reports.Run`, `reports.Request`, `reports.Options`, `reports.Result`, `reports.ReconcileShipped` (tinycld.org/core/reports); `accountTypes` (server); `full_name` from checkpoint 1
- Produces: Go `trialBalanceKey = "books.trial_balance"`; `trialBalanceSpec() *reports.Spec`; `trialBalanceShipped() reports.Shipped`; `profitAndLossTypes() []string`; `typeRankCase(n *reports.Node) *reports.Node`

**Gates:** 1 · 3 (nothing renders; checkpoint 4 shows it)

**Spec:**
- "**Title** "Trial Balance"; hub description "Each account's balance on one day, as a debit or a credit." Shipped key `books.trial_balance`, revision 1, **shipped unpublished** (E10) and shared by Books with every Books reader (below)."
- "**Params (chips, in this order):**
  - **As of** (`asOf`, type `asOf`), default End of last month; presets Today, End of last month, End of last quarter, End of last fiscal year, Custom. Fiscal periods start in the Books fiscal start month, read at each run. Chip `report-param-asOf`.
  - **Rows** (`rows`, `choice`), options **Non-zero** (default), **Active**, **All**. Non-zero: accounts whose balance is not zero. Active: accounts with a posted line on or before the day (a balance that is not zero implies one). All: every active account, and any inactive account with a posted line. Chip `report-param-rows`.
  - **Accounts** (`accounts`, `choice`, multiple, options from `books.accounts` grouped by account type, E8), no default, under Add filter. The picker searches by name and offers "All <type> accounts" per type (core `optionsFrom.groupLabel` "All {group} accounts", D1). Chip `report-param-accounts`, removable."
- "**Rows read:** posted journal lines dated on or before the as-of day (Q1). Drafts never count; a void and its reversal cancel."
- "**One row per account** (a record group on the line's account, E4), labelled with the account's full name ("Cash and bank:Business checking", Q4). The group key is the account id, so two accounts never merge (closes revision 1's Q12 edge)."
- "**Columns** (direction A): **Account · No. · Debit · Credit**.
  - **No.:** the account's number (read from the group record), blank when it has none.
  - **Debit / Credit by sign** (the shell's rule): net = debits − credits of the account's lines. A positive net shows in Debit; a negative net shows, as a positive amount, in Credit. A net of exactly zero shows `0.00` in Debit. An account with no lines (Rows = All) shows nothing in either column. No negative amounts."
- "**Retained earnings:** income and expense lines dated before the fiscal year that holds the as-of day count on the retained-earnings account's row, not on their own (the line's group key is re-keyed by a lookup, E6). Books keeps exactly one retained-earnings account in every chart (OQ3), so the row is always a real account ("3500 Retained earnings" in a corporation chart, "3900 Retained earnings" in an owners' chart)."
- "**Order:** the chart order — account type in the order of `account_types.json` (Bank … Other expense), then No., then full name (sort keys are formulas over the group record, E5). Retained earnings sits among the equity accounts because it is one."
- "**Total row:** "Total" with the currency symbol. Debit and Credit totals **add the rows shown** (E2): Debit total = the sum of the debit balances, Credit total = the sum of the credit balances; they are equal when the Accounts filter is not set, and with it they still add the rows shown."
- "**Press on an account row** opens it: its posted lines show beneath, each labelled "<date> · <entry number> · <memo>" (detail label, E7; the entry's memo when the line has none), with the line's amount by its own sign in Debit or Credit. Expand all / Collapse all (core toolbar)."
- "**Live:** any post, void, account edit or settings change re-runs the open report (topics of every collection the run read, the lookup's and the fill's included)."
- The spec as §5 "The Trial Balance spec" states it, and the test list of §5 ("Pinned in `server/report_trial_balance_test.go`: …").

**Tests it must add:**
- `server/report_trial_balance_test.go` (Go; one ledger built in the test through `mkAccount`/`mkDraft`/`mustPost` from `env_test.go` and the account hooks of checkpoint 1; runs `reports.Run` with `Auth` = a Books reader created with `mkUser` + `setPkgAccess(..., "readonly")`, `Options.Today` fixed; a local `runTB(t, app, reader, params map[string]any, opts reports.Options) *reports.Result` helper marshals each param value to `json.RawMessage` (`reports.Request.Params` is `map[string]json.RawMessage`; Accounts takes an array of ids, a group pick `[{"group": "expense"}]`, As of a day string or `{"preset": "endOfLastFiscalYear"}`) and copies core's `run_test.go` pattern: `Load(raw)` then `Run(ctx, app, Request{Spec, Loaded, Params, Options, Auth})`):
  - `TestTrialBalanceSpecLoads`: `reports.CheckSources` nil; `reports.Load(trialBalanceShipped().Spec)` returns version 2 with no upgrade; `reports.Validate(app, spec)` nil; `trialBalanceShipped()` has `Unpublished: true`, `Revision: 1`, `Title` "Trial Balance" and `Description` "Each account's balance on one day, as a debit or a credit."; the `accounts` param's `OptionsFrom.Group` is the account's `type` and its `OptionsFrom.GroupLabel` is "All {group} accounts" (D1; needs the D1/D2 core PR).
  - `TestTrialBalanceChartOrder`: rows (kind `group`) come in `account_types.json` type order, then number, then full name, over three types with two numbered accounts and one sub-account each; an account with no number sorts before the numbered accounts of its type (an empty text sorts first in SQLite ascending order) and its `number` cell is "" (blank).
  - `TestTrialBalanceFiscalPreset`: with `Options.Today` "2026-11-04" and fiscal start month 7, As of `{"preset": "endOfLastFiscalYear"}` resolves to 2026-06-30 (the result's resolved `asOf` param) and a line dated 2026-07-01 is not counted; after the test sets the start month to 1 and runs again, it resolves to 2025-12-31 — the start month is read at each run.
  - `TestTrialBalanceSignSplit`: an expense with net 123.45 shows `debit` 12345 and no `credit`; a credit-card account with net −123.45 shows `credit` 12345 and no `debit`; an expense with a credit net (a contra entry) shows in Credit; no cell in the result is negative.
  - `TestTrialBalanceZeroAndBlank`: under `rows=active`, an account whose lines net to zero shows `debit` 0 and `credit` null; under `rows=all`, an active account with no lines shows `debit` null and `credit` null, and an inactive account with no lines is absent, while an inactive account with a posted line is present.
  - `TestTrialBalanceRowsChoice`: the same ledger under `nonzero` (default, no param posted), `active` and `all` returns exactly the account sets the spec names.
  - `TestTrialBalanceAccountsParam`: posting `accounts` = one account id returns only its row, and the Total adds that row only (Debit total ≠ Credit total is allowed); posting a whole type group (`{"group": "expense"}`) returns every expense account with lines.
  - `TestTrialBalanceRetainedEarnings` (fiscal start months 1 and 7, each a subtest): an income line and an expense line dated in the previous fiscal year count on the retained-earnings row (its net is the income credit minus the expense debit), not on the income and expense accounts' rows; with as-of on the last day of the previous fiscal year the same line counts on the income account and the retained row has no prior amount; the boundary day (first day of the fiscal year) belongs to the new year; the retained row sorts among the equity rows.
  - `TestTrialBalanceDraftsAndVoids`: a draft line is not counted; a voided entry and its void reversal together add nothing.
  - `TestTrialBalanceTotals`: with no Accounts param, the Total row's `debit` equals its `credit` and equals the sum of the debit cells of the rows shown; with Non-zero hiding a zero account the totals are unchanged.
  - `TestTrialBalanceHeadingAndLabels`: `heading` is the business name; each group row's label is the account's `full_name` ("Software:Design tools" for a sub-account); with the account's group expanded (`Options.Expand: [][]any{row.GroupKey}`), each detail row's label is `"<date> · <entry number> · <memo>"`, using the entry's memo when the line memo is empty; detail `debit`/`credit` cells follow the line's own sign.
  - `TestTrialBalanceTopics`: `topics` holds `collection/books_journal_lines`, `collection/books_accounts`, `collection/books_journal_entries` and `collection/books_settings`.
  - `TestTrialBalanceNoAccess`: a user with Books level `none` gets no account rows.
  - `TestTrialBalanceShippedUnpublished`: after `reports.ReconcileShipped(app)` with an owner user, the `reports` row with `shipped_key = "books.trial_balance"` exists, owned by the first admin, `published = false`.

**Do:**
1. `server/report_trial_balance.go`. Node helpers (unexported, this file):
   ```go
   func path(names ...string) reports.Path { // links, then the field
       p := reports.Path{}
       for _, l := range names[:len(names)-1] { p = append(p, reports.Hop{Link: l}) }
       return append(p, reports.Hop{Field: names[len(names)-1]})
   }
   func fld(names ...string) *reports.Node   { return &reports.Node{Path: path(names...)} }
   func link(name string) *reports.Node       { return &reports.Node{Path: reports.Path{{Link: name}}} }
   func op(name string, args ...*reports.Node) *reports.Node { return &reports.Node{Op: name, Args: args} }
   func lit(v any) *reports.Node              { raw, _ := json.Marshal(v); return &reports.Node{Value: raw} }
   func prm(id string) *reports.Node           { return &reports.Node{Param: id} }
   func col(id string) *reports.Node           { return &reports.Node{Col: id} }
   func rec(group, field string) *reports.Node { return &reports.Node{Record: group, Path: reports.Path{{Field: field}}} }
   func mustJSON(v any) json.RawMessage {
       raw, err := json.Marshal(v)
       if err != nil { panic(fmt.Sprintf("books: trial balance spec: %v", err)) }
       return raw
   }
   ```
   (`lit` uses `mustJSON` too.)
2. `profitAndLossTypes()`: the keys of `accountTypes` whose `Group` is `income` or `expense`, file order. `typeRankCase(n)`: `op("case", op("eq", n, lit(t1)), lit(1), op("eq", n, lit(t2)), lit(2), …, lit(len+1))` over `accountTypes` in file order.
3. `trialBalanceSpec()`, from spec §5 exactly:
   - `net := op("sub", fld("debit"), fld("credit"))`
   - `priorPL := op("and", op("in", fld("account", "type"), lit(profitAndLossTypes())), op("lt", op("fiscalYear", fld("date")), op("fiscalYear", prm("asOf"))))`
   - `reAccount := &reports.Node{Op: "lookup", Source: "books.accounts", Where: op("eq", fld("detail_type"), lit("retained_earnings")), Value: mustJSON(fld("id")), Pick: "min"}`
   - `Params`: `asOf` (type `asOf`, label "As of", default `{"preset":"endOfLastMonth"}`); `rows` (type `choice`, label "Rows", options nonzero "Non-zero", active "Active", all "All", default `"nonzero"`); `accounts` (type `choice`, label "Accounts", `Multiple: true`, `OptionsFrom: {Source: "books.accounts", Value: path("id"), Label: path("full_name"), Group: path("type"), GroupLabel: "All {group} accounts"}`) — `GroupLabel` is the D1 core field (`reports.OptionsFrom.GroupLabel`; the D1/D2 core PR must be merged first).
   - `Filter`: `op("and", op("eq", fld("posted"), lit(true)), op("lte", fld("date"), prm("asOf")), op("in", col("account"), prm("accounts")))`.
   - `Columns`: `account` "Account" formula `op("if", priorPL, reAccount, link("account"))`; `number` "No." formula `rec("byAccount", "number")`; `debit` "Debit" `Total: reports.TotalRows` formula `op("if", op("eq", op("count", fld("id")), lit(0)), lit(nil), op("if", op("gte", op("sum", net), lit(0)), op("sum", net), lit(nil)))`; `credit` "Credit" `Total: reports.TotalRows` formula `op("if", op("lt", op("sum", net), lit(0)), op("sub", lit(0), op("sum", net)), lit(nil))`.
   - `Groups`: one `{ID: "byAccount", Col: "account", Label: rec("byAccount", "full_name"), Fill: &reports.Fill{Where: op("and", op("eq", fld("inactive"), lit(false)), op("in", fld("id"), prm("accounts")))}, Having: op("or", op("eq", prm("rows"), lit("all")), op("and", op("eq", prm("rows"), lit("active")), op("gt", op("count", fld("id")), lit(0))), op("ne", op("sum", net), lit(0)))}`.
   - `Sort`: `{Formula: typeRankCase(rec("byAccount", "type"))}`, `{Col: "number"}`, `{Formula: rec("byAccount", "full_name")}`.
   - `Detail`: `&reports.Detail{Label: op("concat", fld("date"), lit(" · "), fld("entry", "number"), lit(" · "), op("if", op("isEmpty", fld("memo")), fld("entry", "memo"), fld("memo")))}`.
   - `Version: reports.CurrentVersion` (2), `Source: "books.journal_lines"`.
4. `trialBalanceShipped()`: `reports.Shipped{Key: trialBalanceKey, Title: "Trial Balance", Description: "Each account's balance on one day, as a debit or a credit.", Spec: mustJSON(trialBalanceSpec()), Revision: 1, Unpublished: true}`. `server/register.go`: `reports.RegisterShipped(trialBalanceShipped())` after the sources.
5. The test writer writes the tests first (step 0 of this checkpoint in time), with stubs `trialBalanceSpec()` returning `&reports.Spec{Version: reports.CurrentVersion, Source: "books.journal_lines"}` and `trialBalanceShipped()` returning that spec unregistered, so the file compiles; red for: the spec has no params, columns or groups, and no shipped report is registered. Then the implementer makes them pass. If `reports.Validate` or `reports.Run` refuses a part of this spec, or a result row differs from what spec §3 says (for example, a `0.00` against a blank, the fold, the detail label), read the engine code that decides it; if the engine cannot express the spec, **stop and report the core gap** with the refused node and the engine's message.
6. `cd server && go test ./...`.

### Checkpoint 4 — Readers see the Trial Balance

**Delivers:** Books keeps a viewer share of each `books.*` shipped report for every user with Books read access, and the Trial Balance runs in core's report view for such a reader with every behavior of spec §3, proven end to end.

**Files:**
- Create: `server/report_shares.go`
- Create: `server/report_shares_test.go`
- Modify: `server/register.go` (binds the share sync; `registrations_test.go` holds only audit, OAuth, quota and offboard checks and does not change)
- Create: `tests/e2e/books-report-helpers.ts`
- Create: `tests/e2e/trial-balance.spec.ts`
- Modify: `tests/e2e/record-form-helpers.ts` (`uniqueName(prefix)`; `viewportName` exported)
- Modify: the specs that build names from `Date.now()`: `tests/e2e/journal-entries-actions.spec.ts`, `journal-entries-draft-edit.spec.ts`, `journal-entries-row-menu.spec.ts`, `journal-entries-header-nav.spec.ts`, `journal-entries-save-post.spec.ts`, `journal-entries-list-table.spec.ts`, `account-register-states.spec.ts`, `chart-of-accounts-balance.spec.ts`, `chart-of-accounts.spec.ts`; and every caller of the old `uniqueName(page, label)`: `customer-form-save.spec.ts`, `customer-form-actions.spec.ts`, `customer-form-panel.spec.ts`, `products-services-bundle.spec.ts`, `products-services-actions.spec.ts`, `products-services-list.spec.ts`, `products-services-form.spec.ts`, `vendor-1099-form.spec.ts`, `vendor-1099-boxes.spec.ts`, `vendor-1099-vendors.spec.ts`, `vendor-form-actions.spec.ts`, `vendor-form-panel.spec.ts`, `vendor-form-save.spec.ts` (the re-exports in `customer-form-helpers.ts`, `vendor-form-helpers.ts`, `products-services-helpers.ts` keep working)
- Modify: `docs/helix-lessons.md` (carried lesson line)
- Test: `server/report_shares_test.go` · `tests/e2e/trial-balance.spec.ts`

**Interfaces:**
- Consumes: `trialBalanceKey`, `trialBalanceShipped()` from checkpoint 3; source keys from checkpoint 2; `levelForUser(app core.App, userID string) (Level, error)`, `Level.CanRead()` (server/access.go); `reports.ReconcileShipped`; core e2e helpers from `@tinycld/core/e2e-helpers` (defined in the app shell's `tinycld/tests/e2e/report-view-helpers.ts` and `helpers.ts`, outside `tinycld/core`): login, navigateToPackage, openReportsHub, hubRow, rowOf, cellOf, pressToolbar, chooseParamOption, the ParamPick type; `createAccount`, `openChart`, `accountItem` (tests/e2e/account-register-helpers.ts); `openNewEntry`, `fillLine`, `createPostedEntry`, `postOpenEntry`, `EntryInput` (tests/e2e/journal-entries-helpers.ts); `PRIOR_YEAR_SEED` (lib/trial-balance-fixture.ts, seeded in checkpoint 1)
- Produces: Go `syncUserReportShares(app core.App, userID string) error`, `shareBooksReport(app core.App, report *core.Record) error`, `reconcileBooksReportShares(app core.App) error`, `registerReportShares(app core.App)`; TS `uniqueName(prefix: string): string` and exported `viewportName(page: Page): string` (tests/e2e/record-form-helpers.ts); `openTrialBalance(page: Page): Promise<void>`, `chooseAsOf(page: Page, choice: { preset: 'today' | 'endOfLastMonth' | 'endOfLastQuarter' | 'endOfLastFiscalYear' } | { day: string }): Promise<void>`, `openAccountRow(page: Page, label: string): Promise<void>`, `tbSnapshot(page: Page): Promise<TbSnapshot>`, `type TbSnapshot = { rows: { id: string; kind: 'group' | 'detail'; label: string; number: string; debit: string; credit: string }[]; total: { label: string; debit: string; credit: string } }` (tests/e2e/books-report-helpers.ts; `kind` from the row id prefix `g:` / `d:`)

**Gates:** 1 · 2 (reference: `populated-*`, `opened-*`, `rows-all-*`, `filtered-*`, `picker-*`, `customize-*`, `empty-*`, `empty-filtered-*`, `loading-*`, `error-*`; built URL: `/a/reports/<id of the books.trial_balance report>` with `?p-rows=all`, `?p-asOf=1900-01-01` and the opened row as each reference state needs; captured as the seeded e2e user) · 3

**Spec:**
- "**Document header:** the Books business name (`books_settings.business_name` through the source heading, E9; the organization name when it is empty), "Trial Balance", "As of <day in words>"."
- "**Params (chips, in this order):**
  - **As of** (`asOf`, type `asOf`), default End of last month; presets Today, End of last month, End of last quarter, End of last fiscal year, Custom. Fiscal periods start in the Books fiscal start month, read at each run. Chip `report-param-asOf`.
  - **Rows** (`rows`, `choice`), options **Non-zero** (default), **Active**, **All**. Non-zero: accounts whose balance is not zero. Active: accounts with a posted line on or before the day (a balance that is not zero implies one). All: every active account, and any inactive account with a posted line. Chip `report-param-rows`.
  - **Accounts** (`accounts`, `choice`, multiple, options from `books.accounts` grouped by account type, E8), no default, under Add filter. The picker searches by name and offers "All <type> accounts" per type (core `optionsFrom.groupLabel` "All {group} accounts", D1). Chip `report-param-accounts`, removable."
- "**Columns** (direction A): **Account · No. · Debit · Credit**.
  - **No.:** the account's number (read from the group record), blank when it has none.
  - **Debit / Credit by sign** (the shell's rule): net = debits − credits of the account's lines. A positive net shows in Debit; a negative net shows, as a positive amount, in Credit. A net of exactly zero shows `0.00` in Debit. An account with no lines (Rows = All) shows nothing in either column. No negative amounts."
- "**Total row:** "Total" with the currency symbol. Debit and Credit totals **add the rows shown** (E2): Debit total = the sum of the debit balances, Credit total = the sum of the credit balances; they are equal when the Accounts filter is not set, and with it they still add the rows shown."
- "**Press on an account row** opens it: its posted lines show beneath, each labelled "<date> · <entry number> · <memo>" (detail label, E7; the entry's memo when the line has none), with the line's amount by its own sign in Debit or Credit. Expand all / Collapse all (core toolbar)."
- "**Customize** (core): Divide by 1000, Without cents, Negative numbers, red negatives; Columns: show No., Debit, Credit."
- "**Live:** any post, void, account edit or settings change re-runs the open report (topics of every collection the run read, the lookup's and the fill's included)."
- "**States** (core): loading; error with Retry; timeout with Retry; empty "No rows as of <day>" with "Show end of last fiscal year", or "Clear filters" when Accounts is set; no access."
- "**Who sees it:** every user with Books read access, any role (guest bookkeepers included), through a viewer share that Books keeps in step with `books_access`. Users without Books access do not see it: it is not published (E10; replaces revision 1's Q8 guest-only shares and Q11 "listed but empty"). Readers change params and Customize for the run, copy a link, and "Save as". The owner (first admin) and editors edit; nobody deletes it while Books ships it."
- §5 "Share sync": "For every user whose `books_access` grants read (any role): one viewer `report_shares` row on each report whose `shipped_key` starts with `books.`; removed when the access is revoked; reconciled at serve start (after core creates shipped reports) and when core creates one. The first admin owns the reports and gets no share. Go tests: grant, revoke, role change, reconcile, a user without access getting none."

**Tests it must add:**
- `server/report_shares_test.go` (Go; `newBooksApp`, `mkUser`, `setPkgAccess`; the shipped report created by `reports.ReconcileShipped(app)` after `registerReportShares(app)` and the checkpoint 3 registration):
  - `TestReportSharesOnCreate`: when core creates `books.trial_balance` (ReconcileShipped with an owner present), each existing user with Books read (a member with default access, a `readonly` member, a guest granted `full`) has exactly one `report_shares` row (`user` set, `group` empty, `role` "viewer"); the owner (first admin) has none; a guest without a grant and a member with `none` have none.
  - `TestReportSharesGrant`: a guest granted Books access afterwards (an `org_pkg_access` create with `pkg = "books"`, `access = "readonly"`) gets the viewer row; a new member user gets it on create.
  - `TestReportSharesRevoke`: setting a member's Books access to `none` removes their viewer row; deleting the `org_pkg_access` row of a guest removes theirs; an `editor` share of the same user, made by the owner, is left alone, and no viewer row is added beside it.
  - `TestReportSharesRoleChange`: changing a member's `users.role` to `guest` (no grant) removes the row; changing it back adds it.
  - `TestReportSharesReconcile`: after deleting every Books viewer row by hand (`app.Delete`), `reconcileBooksReportShares(app)` puts back exactly one per reader, and running it twice adds nothing (idempotent); a report whose `shipped_key` does not start with `books.` gets no share.
  - `TestReportSharesAtServeStart`: an app with core's `reports.Register(app)` (core/server/reports/endpoint.go:50) and the Books registrations bound in production order (Books first); an owner and a reader exist and the reader's viewer row was deleted; one `apiReq` (its ApiScenario fires `OnServe`) to any route; afterwards the reader's viewer row is back and the owner has none — proving the Books `OnServe` handler runs after core's `ReconcileShipped` (it calls `e.Next()` first).
- `tests/e2e/trial-balance.spec.ts`, `test.describe('trial-balance: the report in core's view', …)`. Every test creates its own accounts and entries through the UI with `uniqueName`, reads rows and totals in ONE `page.evaluate` snapshot (`tbSnapshot`), and never hard-codes a fiscal month, a close date, or a seeded balance. Each test is one user goal, under ~10 s locally. Desktop 1280 unless named:
  1. **sign split and totals** — new Expense (uniqueName) and Credit card accounts; post debit expense 123.45 / credit card 123.45 dated today; `chooseAsOf(page, { preset: 'today' })`: the expense row shows 123.45 in Debit, the card 123.45 in Credit. A second entry, debit card 200.00 / credit expense 200.00: the expense row shows 76.55 in Credit and nothing in Debit, the card 76.55 in Debit. No cell in the snapshot starts with "-" or "("; the total row's label is "Total", both its cells start with "$", and Total Debit equals Total Credit.
  2. **rows choice** — new accounts A, B (Expense) and C (Expense, no lines); post A→B 50.00 and B→A 50.00; As of Today: Non-zero shows neither A nor B; Rows → Active shows A with `0.00` in Debit and nothing in Credit; C appears only under Rows → All, with both cells empty.
  3. **accounts filter** (desktop, and phone `{ width: 390, height: 844 }` because the picker is a bottom sheet there, other code): the test makes two Expense accounts and one Bank account, each with a posted line dated today (As of Today). Add filter → Accounts → search the first expense account's name, pick it, Apply: only its row shows and the Accounts chip names it. Open the chip again, the group pick whose visible text is "All Expense accounts" (D1; `report-filter-group-expense`), Apply: both of the test's expense accounts show and the test's bank account does not. The chip's remove control (`report-filter-remove-accounts`) clears the filter and the bank account's row comes back.
  4. **drill-down** — a new expense account with two posted entries (one with a line memo, one whose line has no memo and whose entry memo is set); `openAccountRow` on its row: two detail rows show beneath, labelled "<YYYY-MM-DD> · JE-<n> · <memo>" (the entry memo for the second), with amounts in Debit by their sign; the toolbar's Collapse all (`pressToolbar(page, 'report-fold-all', 'Collapse all')`) closes them and its label becomes "Expand all"; Expand all opens them again.
  5. **live update** — page A opens the report As of Today; page B (`context.newPage()`, same login) creates an account and posts to it; page A shows the new row with no reload (`expect.poll` on the snapshot).
  6. **retained earnings** — reads the seeded `PRIOR_YEAR_SEED` entry (Accounts receivable / Consulting Income, 3,000.00, memo "Prior-year consulting", two calendar years ago). `chooseAsOf(page, { preset: 'today' })`: the Retained earnings row (No. 3900) sits after the seeded "Owner's Equity" (3000) row and before the seeded "Consulting Income" (4000) row; `openAccountRow` on Consulting Income: no detail row's label ends in "Prior-year consulting"; `openAccountRow` on Retained earnings: a detail row labelled "<year−2>-08-15 · JE-<n> · Prior-year consulting" shows 3,000.00 in Credit. `chooseAsOf(page, { day: '<year−2>-08-15' })`: Consulting Income shows 3,000.00 in Credit and there is no Retained earnings row. Every assertion holds for any fiscal start month (books-settings.spec.ts sets month 7 for a few seconds on the shared DB): the seeded entry is before the current fiscal year for month 1 and 7, and the test never asserts the retained row's total. (Seeded, not posted by the test: `books-settings.spec.ts` holds a close date of 2026-06-30 for a few seconds on the shared DB, which refuses a post dated before it.)
  7. **period and empty** (desktop, and phone because the period control is a sheet there): `chooseAsOf(page, { day: '1900-01-01' })` → the empty state (`report-empty-message`) reads "No rows as of January 1, 1900" and its action (`report-empty-action`) reads "Show end of last fiscal year"; the URL holds `p-asOf=1900-01-01`; `history.length` is unchanged by the param change; the empty action brings rows back. Then, still at 1900-01-01, the test sets the Accounts filter to one of its own accounts: the empty action reads "Clear filters", and pressing it removes the Accounts chip.
  8. **phone layout** (phone only): each account row wraps onto two lines inside the table (the label's box is above the Debit cell's box, read with `expect.poll` over `boundingBox` in one evaluate), and `document.scrollingElement.scrollWidth <= innerWidth` and the table's scroller has no horizontal overflow.
  This is 10 e2e runs (tests 3 and 7 run twice); checkpoint 5 adds 2 (desktop and phone), 12 in all, the screen's cap. The document header, the chip order and the default chips are checked by checkpoint 5's sidebar test. Core's own e2e cover the generic view parts this screen does not change: Customize with Divide by 1000 and Columns (`tinycld/tests/e2e/reports-view.spec.ts`), loading (`reports-create.spec.ts`), no access (`reports-share.spec.ts`), Copy link and Save as (`reports-view.spec.ts`, `reports-share.spec.ts`, `reports-shipped.spec.ts`); "nobody deletes it while Books ships it" is core's (`core/server/reports/shipped_test.go`); Books' part of who sees it is the share sync, pinned by the Go tests above. Core's error, timeout and options-load states with Retry are covered by core's `tinycld/tests/e2e/reports-failure-states.spec.ts` (the D1/D2 core PR); Books does not change them.

**Do:**
0. Precondition: the D1/D2 core PR (top of this plan) is merged and pulled. Test writer: write `server/report_shares_test.go` (with no-op stubs of the four Go names in Produces so it compiles), `tests/e2e/books-report-helpers.ts` (test-only helpers, step 5) and `tests/e2e/trial-balance.spec.ts`. Red for: no viewer share exists for any reader (Go), and in e2e the e2e user's "Shared with me" tab has no Trial Balance row (`hubRow` times out in `openTrialBalance`). A failure on a missing module or helper is not this red; the helpers exist before the run.
1. Carried check (c): in `tests/e2e/record-form-helpers.ts`, export `viewportName`, and replace `uniqueName(page, label)` with `uniqueName(prefix: string): string` = `` `${prefix} w${test.info().workerIndex}-${Date.now()}-${++uniqueCounter}` `` (module `let uniqueCounter = 0`; `test` from `@playwright/test`). Change every caller listed under Files to `uniqueName(\`${label} ${viewportName(page)}\`)`. In the journal-entries specs, replace each local `uniqueMemo` with `uniqueName`; in the other specs listed under Files, replace a record name or memo built from `Date.now()` (with or without `Math.random`) with `uniqueName`; leave a `Date.now()` that is not a name (a timestamp, a duration) as it is. Read each site before changing it. Run each changed spec file alone and fix any failure at its source.
2. Carried lesson (b): append to `docs/helix-lessons.md`: "- After a save that navigates, wait for the new route (URL or a node only the target screen renders), never for a state the source screen also shows. — journal-entries, retro, p5-report-shell".
3. `server/report_shares.go`:
   - `isBooksReport(r *core.Record) bool`: `strings.HasPrefix(r.GetString("shipped_key"), "books.")`.
   - `syncUserReportShares(app, userID)`: `level, err := levelForUser(app, userID)`; for each `reports` row with a `books.` shipped key (`app.FindRecordsByFilter("reports", "shipped_key ~ 'books.%'", "", 0, 0)`: with a `%` in the value PocketBase's `~` is a plain LIKE, so this is a prefix match — `tools/search/filter.go:501`): if the user owns it, nothing; if `level.CanRead()` and the user has no direct share on it (`user = id && group = ''`), save a `report_shares` row `{report, user, role: "viewer"}`; if not `CanRead()`, delete their direct `viewer` rows on it (editor rows stay).
   - `shareBooksReport(app, report)`: for every user id in `books_access` whose `can_read` is true, the add half of the rule above.
   - `reconcileBooksReportShares(app)`: every user id in `users`, `syncUserReportShares`.
   - `registerReportShares(app)`: `app.OnServe().BindFunc(func(e *core.ServeEvent) error { if err := e.Next(); err != nil { return err }; return reconcileBooksReportShares(e.App) })` — Books binds before core, so `e.Next()` first lets core's `ReconcileShipped` run (core/server/reports/endpoint.go `Register`); `app.OnRecordAfterCreateSuccess("reports")` → `shareBooksReport` when `isBooksReport`; `app.OnRecordAfterCreateSuccess("users")`, `OnRecordAfterUpdateSuccess("users")` → `syncUserReportShares(e.App, e.Record.Id)`; `app.OnRecordAfterCreateSuccess("org_pkg_access")`, `OnRecordAfterUpdateSuccess("org_pkg_access")`, `OnRecordAfterDeleteSuccess("org_pkg_access")` → when `pkg == "books"`, `syncUserReportShares(e.App, e.Record.GetString("user"))`. Each hook calls `e.Next()` first; a sync error is logged with `logging.ForPackage("books").ErrorContext(e.Context, "report share sync failed", "user", id, "error", err)` and does not fail the user's write (the serve-start reconcile repairs it). Go `app.Save` of `report_shares` skips core's request guards (sharing.go), which is intended: Books owns these rows.
   - `server/register.go`: `registerReportShares(app)` after the shipped report.
4. (No change to `journal-entries-helpers.ts`: every entry the tests post is dated today; the prior-year entry is seeded.)
5. `tests/e2e/books-report-helpers.ts` (written by the test writer in step 0):
   - `openTrialBalance(page)`: `openReportsHub(page)` (core helper), then `page.getByTestId('reports-hub-tab-shared').click()` (the unfiltered hub keeps its tabs; D2 removes the press only on the package hub, checkpoint 5) — the e2e user is not the first admin: core's seed creates the admin first and `loginAsShippedOwner` signs in as it (`tinycld/tests/e2e/reports-helpers.ts:207-216`), so the report is shared with the e2e user — then `hubRow(page, 'Trial Balance').click()` and wait for `report-screen` plus `report-table` or `report-empty`. After checkpoint 5 the same helper goes through the Books sidebar.
   - `chooseAsOf(page, choice)`: press `report-param-asOf`; wait for `report-period-popover`; a preset presses `report-period-preset-<preset>`; a day does `page.getByTestId('report-period-as-of').fill(choice.day)` — core applies a typed day on change and keeps the popover open (`ParamPeriodControl.tsx:113-117` `onDate` → `apply(true)`; core fills its range the same way in `tinycld/tests/e2e/reports-view.spec.ts:149-151`), so the helper then presses Escape to close it; then wait until `report-document-period` shows the new day (a node only the new run renders).
   - `openAccountRow(page, label)`: press the label of `rowOf(page, label)`, then wait until a row whose id starts `d:` follows it in `tbSnapshot`.
   - `tbSnapshot(page)`: ONE `page.evaluate` over `[data-testid^="report-row-"]` inside `report-table` and their `report-cell-number-<id>`, `report-cell-debit-<id>`, `report-cell-credit-<id>` cells and the `total…` row's label and cells; returns `TbSnapshot`.
6. The implementer makes steps 1–3 true until green: `cd server && go test ./...`, then `E2E_PORT=7210 E2E_PORT_2=7211 pnpm exec tinycld-pkg test:e2e -- -g "trial-balance:"`, and each spec file changed by step 1 run alone.
7. Gate 2: capture the built report with a capture manifest under `docs/plans/trial-balance-evidence/cp4/` whose shots open `/a/reports/<id>` (read the id from the hub row's test id) with the params of each reference state.
8. `cd server && go test ./...`; `pnpm exec tinycld-pkg check`.

### Checkpoint 5 — Sidebar opens core Reports hub

**Delivers:** the Books sidebar's Reports entry (desktop sidebar and phone Books menu) opens core's hub filtered to Books, and the Books help explains Books reports on the engine.

**Files:**
- Modify: `tinycld/books/lib/shell-nav.ts` (`SidebarEntry.params`; the Reports entry)
- Modify: `tinycld/books/sidebar.tsx` (`orgHref(entry.href, entry.params)`)
- Modify: `tests/shell-nav.test.ts` · `tests/books-sidebar.test.tsx`
- Modify: `tests/e2e/books-report-helpers.ts` (`openBooksReports`; `openTrialBalance` goes through it)
- Modify: `tests/e2e/trial-balance.spec.ts` (sidebar test)
- Modify: `help/reports.md` · `help/navigating-books.md` · `tests/help-reports.test.ts`
- Delete: `tests/e2e/report-shell-customize.spec.ts`, `report-shell-filters.spec.ts`, `report-shell-frame.spec.ts`, `report-shell-period.spec.ts`, `report-shell-table.spec.ts`, `report-shell-helpers.ts` (they reach the shell through `books-nav-reports`, which no longer opens it; the trial-balance specs replace them)
- Modify: any other e2e that presses `books-nav-reports` (`grep -rln books-nav-reports tests/e2e`; `books-sidebar-navigation.spec.ts` and `mobile-drawer.spec.ts` are the places to check) so it expects core's hub

**Interfaces:**
- Consumes: `useOrgHref(): (path: string, extra?: Record<string, string | number | string[]>) => Href` (`@tinycld/core/lib/org-routes`); `SIDEBAR_ENTRIES`, `SidebarEntry`, `isActivePath` (lib/shell-nav.ts); `useBooksSidebar` (hooks/useBooksSidebar.ts); openReportsHub and hubRow from `@tinycld/core/e2e-helpers` (app shell `tinycld/tests/e2e/report-view-helpers.ts`); `openTrialBalance`, `tbSnapshot`, `uniqueName` from checkpoint 4
- Produces: `SidebarEntry.params?: Record<string, string>`; Reports entry `{ id: 'reports', label: 'Reports', icon: BarChart3, href: 'reports', params: { package: 'books' }, available: true }`; TS `openBooksReports(page: Page): Promise<void>` (tests/e2e/books-report-helpers.ts)

**Gates:** 1 · 2 (reference: `populated-*` for the report reached from the sidebar; built URL: `/a/reports?package=books` and the report it opens) · 3

**Spec:**
- "Sidebar entry `{ href: 'reports', params: { package: 'books' }, available: true }` through `SidebarEntry.params` and `orgHref`."
- "`books/help/reports.md` rewritten: Open Books reports; Read the Trial Balance (debit and credit by sign, Rows, Accounts filter, retained earnings, as-of presets, opening an account into its lines); Who sees Books reports (every Books reader, through a share); Build your own Books report (`[Build, share and publish reports](help://core:reports)`). `help/navigating-books.md` updates its Reports line."
- §2: "**Books sidebar "Reports"** (desktop sidebar, phone Books menu) opens `/a/reports?package=books` (strip "Showing reports from Books", "Show all reports")."

**Tests it must add:**
- `tests/shell-nav.test.ts`: the Reports entry has `href: 'reports'`, `params: { package: 'books' }`, `available: true`, no `group`, and sits right after Lists; the test no longer imports `lib/report-registry`.
- `tests/books-sidebar.test.tsx` (a `useBooksSidebar` hook test through `renderHook`; it has no router and does not render `sidebar.tsx`, and a component test is not allowed): `top` ids stay `['lists', 'reports']` with every entry available, and the `reports` entry it returns carries `href: 'reports'` and `params: { package: 'books' }`. The press itself is covered by the e2e below.
- `tests/help-reports.test.ts` rewritten: the frontmatter has a title and summary; the body has the headings `## Open Books reports`, `## Read the Trial Balance`, `## Who sees Books reports`, `## Build your own Books report`; it links `help://core:reports`; it names Rows, Non-zero, Active, All, Accounts, retained earnings, End of last month, Custom, and Expand all; it has no heading `## Choose Accrual or Cash` and no "Show rows"; `help/navigating-books.md` links `help://books:reports` and contains the new line "it opens Reports with only Books reports shown".
- `tests/e2e/trial-balance.spec.ts`, `test.describe('trial-balance: from the Books sidebar', …)`, desktop and phone (`{ width: 390, height: 844 }`, because the phone path is the Books menu, other code): `navigateToPackage(page, 'books')` at the default viewport, then (phone) `page.setViewportSize`; press `books-nav-reports` (phone: open the Books menu first); the URL is `/a/reports?package=books`, `reports-hub-filter` reads "Showing reports from Books"; the package hub shows no tabs (`reports-hub-tab-shared` has count 0) and lists the Trial Balance for the e2e user, who is a Books reader and not its owner (D2) — press its row with no tab press; the document header's `report-business-name` equals the business name read in the same `expect.poll` from a read-only `page.request.get('/api/collections/books_settings/records/bookssettings01')` (books-settings.spec.ts types over the name and restores it on the shared DB; when it is empty the header shows the organization's name), `report-document-title` is "Trial Balance" and `report-document-period` is "As of <the last day of last month in words>"; the controls are in the order As of chip ("End of last month"), Rows chip ("Non-zero"), Add filter, and Add filter offers Accounts (`report-add-filter-accounts`); press `report-back`: the URL is the filtered hub again (`?package=books`); press `reports-hub-show-all`: the strip is gone and the URL has no `package`.

**Do:**
0. Test writer: write the tests above first. Red for: the Reports entry has `href: 'books/reports'` and no `params` (vitest), the help has the old headings, and in e2e `books-nav-reports` opens the Books shell, not `/a/reports?package=books`.
1. `lib/shell-nav.ts`: add `params?: Record<string, string>` to `SidebarEntry`; replace the Reports entry as in Produces; remove the `hasAvailableReport` import.
2. `sidebar.tsx`: `onPress={() => router.navigate(orgHref(entry.href, entry.params))}`.
3. `tests/e2e/books-report-helpers.ts`: `openBooksReports(page)`: `navigateToPackage(page, 'books')`, press `books-nav-reports` (on a phone viewport, open the Books menu the way `tests/e2e/mobile-drawer.spec.ts` does), `await expect(page).toHaveURL(/\/a\/reports\?package=books/)`, `await page.getByTestId('reports-hub').waitFor()`. `openTrialBalance` calls `openBooksReports` instead of `openReportsHub`.
4. `help/reports.md`: rewrite under the four headings, task-first ("To open Books reports, choose Reports in the Books sidebar…"); keep `title`, `summary`, `tags: [reports, trial balance]`, `order: 60`; link `[Build, share and publish reports](help://core:reports)`. `help/navigating-books.md` line 14: "To see Books reports, choose Reports in the sidebar: it opens Reports with only Books reports shown; see [Reports](help://books:reports)." Run `pnpm run packages:generate` in `tinycld/`.
5. Gate 2 captures the hub strip and the report reached from the sidebar, under `docs/plans/trial-balance-evidence/cp5/`.
6. `pnpm exec tinycld-pkg check`; `E2E_PORT=7210 E2E_PORT_2=7211 pnpm exec tinycld-pkg test:e2e -- -g "trial-balance:"`.

### Checkpoint 6 — Remove the Books report shell

**Delivers:** the Books copy of the report shell is gone (no `/a/books/reports` route, no shell components, hooks, libs, store or tests), its two shared helpers live in `lib/live-recovery.ts`, and ADR 0002 says how Books reports run now.

**Files:**
- Create: `tinycld/books/lib/live-recovery.ts`
- Create: `tests/live-recovery.test.ts`
- Modify: `tinycld/books/hooks/useSettingsShell.ts` · `tinycld/books/hooks/useForm1099Section.ts` (import from `lib/live-recovery`)
- Modify: `tests/register-range.test.ts` (it exists; it takes the `isIsoDay` cases of `tests/report-period.test.ts`)
- Modify: `docs/adr/0002-reports-read-monthly-balance-rows.md` (rewritten)
- Delete: `tinycld/books/components/reports/` (15 files); `tinycld/books/lib/report-definition.ts`, `report-filters.ts`, `report-format.ts`, `report-options.ts`, `report-period.ts`, `report-registry.ts`, `report-rows.ts`, `report-shell-fixture.ts`, `report-state.ts`; `tinycld/books/lib/reports/` (3 files); `tinycld/books/hooks/useBackToReports.ts`, `useReportOptionsForm.ts`, `useReportScreen.ts`, `useReportsHub.ts`, `useTrialBalance.ts`; `tinycld/books/stores/report-ui-store.ts`; `tinycld/books/screens/reports/` (2 files); `tests/report-filters.test.ts`, `report-format.test.ts`, `report-options.test.ts`, `report-period.test.ts`, `report-registry.test.ts`, `report-rows.test.ts`, `report-state.test.ts`, `report-table-layout.test.ts`, `report-ui-store.test.ts`, `use-report-options-form.test.tsx`, `use-report-prerequisites.test.tsx`, `use-report-screen.test.tsx`, `use-reports-hub.test.tsx`, `use-trial-balance.test.tsx`, `trial-balance.test.ts` (the report-shell e2e files went in checkpoint 5)
- Test: `tests/live-recovery.test.ts` · `tests/register-range.test.ts`

**Interfaces:**
- Consumes: `recoverLiveQueries` (`@tinycld/core/lib/recover-live-queries`); `isIsoDay` (lib/register-range.ts); the Reports entry from checkpoint 5 (it no longer reads `lib/report-registry`)
- Produces: `type LiveRecovery = Pick<Parameters<typeof recoverLiveQueries>[0], 'queries' | 'sources'>`; `mergeRecoveries(parts: readonly LiveRecovery[]): LiveRecovery` (tinycld/books/lib/live-recovery.ts)

**Gates:** 1 · 3 (nothing new renders; the e2e of checkpoints 4–5 prove the report still opens)

**Spec:**
- §2: "**Removed:** `/a/books/reports`, `/a/books/reports/<report>` and every file of the Books shell copy (§6)."
- §5 Client: "`lib/live-recovery.ts`: `LiveRecovery` and `mergeRecoveries`, moved out of the shell for `useSettingsShell` and `useForm1099Section`."
- §6 end check: "`grep -rl` finds no `report-definition`, `report-state`, `report-registry`, `components/reports`, `useTrialBalance`, `books/reports` under `books/tinycld books/tests books/help`, and the generator leaves no `app/a/(app)/books/reports` route."
- §6 ADR: "`docs/adr/0002-reports-read-monthly-balance-rows.md` (rewritten: reports run on the engine as the reader; by-month reports aggregate `books.account_balances`; as-of-a-day reports read posted lines, because a monthly row cannot stop inside its month)."

**Tests it must add:**
- `tests/live-recovery.test.ts`: `mergeRecoveries([])` has empty `queries` and `sources`; merging two recoveries keeps every query and source of both, in order; a source passed by both parts appears once (read `report-state.ts` `mergeRecoveries` and its old tests in `tests/report-state.test.ts` first and carry each case they asserted).
- `tests/register-range.test.ts`: every `isIsoDay` case of `tests/report-period.test.ts` (lines 176–216 at 0a166ba), unchanged, so the one Books date validator keeps its tests after that file goes.

**Do:**
1. Write the two tests first (red: `lib/live-recovery.ts` does not exist; the `isIsoDay` cases pass already — they are a move, and the test writer says so).
2. Create `lib/live-recovery.ts` with `LiveRecovery` (from `report-definition.ts:106`) and `mergeRecoveries` (from `report-state.ts:15-19`), unchanged. Point `useSettingsShell.ts` and `useForm1099Section.ts` at it.
3. Delete every file under Delete. Run `pnpm run packages:generate` in `tinycld/`; confirm `ls "/Users/nas/tmp/tinycld/books-purchases/tinycld/app/a/(app)/books"` lists no `reports`.
4. End check, from the package root: `grep -rlE 'report-definition|report-state|report-registry|components/reports|useTrialBalance|books/reports' tinycld tests help` prints nothing (fix every hit; the word "Reports" in copy is not a hit).
5. Rewrite `docs/adr/0002-reports-read-monthly-balance-rows.md`: title "Reports run on core's engine as the reader"; Books reports are core engine reports over the Books sources, run under each reader's rules; a report by month aggregates `books.account_balances`; a report as of a day (the Trial Balance) reads posted journal lines, because a monthly balance row cannot stop inside its month; the client never sums lines itself.
6. `pnpm exec tinycld-pkg check`; `cd server && go test ./...`; `E2E_PORT=7210 E2E_PORT_2=7211 pnpm exec tinycld-pkg test:e2e -- -g "trial-balance:"`.
