# Trial Balance on the report engine — design

Unit `p5-trial-balance`, package `books`. Revision 2 follows the design gate of 2026-11-01: the human picked **direction A**, accepted Q1–Q12, and set a binding rule: *design without the limits of what reports support today; when something is missing, stop and implement it in core, because reports must be as powerful and flexible as possible.* Every place revision 1 worked around an engine or report-view gap is now a core extension in **checkpoint 0** (§4). Sources: Books design spec §Scope and §Report engine, the report engine spec (`docs/superpowers/specs/2026-10-30-report-engine-design.md`, "Books changes", §2, §3, §4), and the behaviour the Books shell's Trial Balance had (p5-report-shell). Built against books `main` 0377271b, core `main` 7a21579b. Approved at the design gate on 2026-11-01; the decisions are in §0.

## 0. Decisions (design gate, 2026-11-01)

- **Direction A:** Account · No. · Debit · Credit, one row per account in chart order.
- **Rule:** reports are designed without the limits of what the engine supports today; what is missing is built in core first.
- **Q1** posted journal lines are the rows read. **Q2** Debit and Credit by sign, totals that add the rows shown (E2). **Q3** Rows choice Non-zero (default) / Active / All through a group filter (E3) and fill (E4). **Q4** `books_accounts.full_name`. **Q5** direction A. **Q6** the Accounts filter, options from a source (E8). **Q7** opened rows carry their own label (E7). **Q8**, **Q11**, **OQ7** shipped unpublished (E10), shared by Books with every user who has Books read access, any role. **Q9** `Field.TextDay` (E1). **Q10** vendors and products wait for their units. **Q12** rows are keyed by account id (E4), so no two accounts merge.
- **OQ1** one core PR for E1–E13 and the formula editor (OQ2), `exclusive` held by lane purchases; it merges before checkpoint 1. Order: writing-plans, then the human's plan review, then subagent-driven development, then the PR.
- **OQ2** the builder's formula editor offers every report operator (`if`, `case`, comparisons, `and`/`or`/`not`, `isEmpty`, `coalesce`, date parts, `lookup`, `record`), through an optional operator-set prop on the forms `FormulaEditor`.
- **OQ3** one retained-earnings account per chart: the owners' starter chart gains `3900 Retained earnings`; the server refuses a second one and refuses deleting, deactivating or re-typing the only one.
- **OQ4** E13 (groups open by default) is built in this checkpoint 0.
- **OQ5** `POST /api/reports/param-options` is approved under the reports read exception.
- **OQ6** with `total: "rows"`, a group hidden by `having` or the Accounts filter adds nothing to the total; `recompute` columns total every base row.

## 1. Goal

Books registers its report sources and ships the Trial Balance as an engine report with everything the Books shell's Trial Balance did — sign-split Debit and Credit with equal totals, the Rows choice (Non-zero by default), the account filter, the Books business name, drill-down — and core's engine gains the general features that make this possible for every package.

## 2. Where it lives

- **Report:** core's report view `/a/reports/<id>`, from core's hub `/a/reports`. Books adds no screen and no route.
- **Books sidebar "Reports"** (desktop sidebar, phone Books menu) opens `/a/reports?package=books` (strip "Showing reports from Books", "Show all reports").
- **Removed:** `/a/books/reports`, `/a/books/reports/<report>` and every file of the Books shell copy (§6).
- **Server:** Books' Go `Register(app)` registers the sources, the shipped report and the share sync. Core changes of checkpoint 0 (§4) land first, on branch `books/p5-trial-balance` in `tinycld`.

## 3. Behavior

### The Trial Balance

- **Title** "Trial Balance"; hub description "Each account's balance on one day, as a debit or a credit." Shipped key `books.trial_balance`, revision 1, **shipped unpublished** (E10) and shared by Books with every Books reader (below).
- **Document header:** the Books business name (`books_settings.business_name` through the source heading, E9; the organization name when it is empty), "Trial Balance", "As of <day in words>".
- **Params (chips, in this order):**
  - **As of** (`asOf`, type `asOf`), default End of last month; presets Today, End of last month, End of last quarter, End of last fiscal year, Custom. Fiscal periods start in the Books fiscal start month, read at each run. Chip `report-param-asOf`.
  - **Rows** (`rows`, `choice`), options **Non-zero** (default), **Active**, **All**. Non-zero: accounts whose balance is not zero. Active: accounts with a posted line on or before the day (a balance that is not zero implies one). All: every active account, and any inactive account with a posted line. Chip `report-param-rows`.
  - **Accounts** (`accounts`, `choice`, multiple, options from `books.accounts` grouped by account type, E8), no default, under Add filter. The picker searches by name and offers "All <type> accounts" per type. Chip `report-param-accounts`, removable.
- **Rows read:** posted journal lines dated on or before the as-of day (Q1). Drafts never count; a void and its reversal cancel.
- **One row per account** (a record group on the line's account, E4), labelled with the account's full name ("Cash and bank:Business checking", Q4). The group key is the account id, so two accounts never merge (closes revision 1's Q12 edge).
- **Columns** (direction A): **Account · No. · Debit · Credit**.
  - **No.:** the account's number (read from the group record), blank when it has none.
  - **Debit / Credit by sign** (the shell's rule): net = debits − credits of the account's lines. A positive net shows in Debit; a negative net shows, as a positive amount, in Credit. A net of exactly zero shows `0.00` in Debit. An account with no lines (Rows = All) shows nothing in either column. No negative amounts.
- **Retained earnings:** income and expense lines dated before the fiscal year that holds the as-of day count on the retained-earnings account's row, not on their own (the line's group key is re-keyed by a lookup, E6). Books keeps exactly one retained-earnings account in every chart (OQ3), so the row is always a real account ("3500 Retained earnings" in a corporation chart, "3900 Retained earnings" in an owners' chart).
- **Order:** the chart order — account type in the order of `account_types.json` (Bank … Other expense), then No., then full name (sort keys are formulas over the group record, E5). Retained earnings sits among the equity accounts because it is one.
- **Total row:** "Total" with the currency symbol. Debit and Credit totals **add the rows shown** (E2): Debit total = the sum of the debit balances, Credit total = the sum of the credit balances; they are equal when the Accounts filter is not set, and with it they still add the rows shown.
- **Press on an account row** opens it: its posted lines show beneath, each labelled "<date> · <entry number> · <memo>" (detail label, E7; the entry's memo when the line has none), with the line's amount by its own sign in Debit or Credit. Expand all / Collapse all (core toolbar).
- **Customize** (core): Divide by 1000, Without cents, Negative numbers, red negatives; Columns: show No., Debit, Credit.
- **Live:** any post, void, account edit or settings change re-runs the open report (topics of every collection the run read, the lookup's and the fill's included).
- **States** (core): loading; error with Retry; timeout with Retry; empty "No rows as of <day>" with "Show end of last fiscal year", or "Clear filters" when Accounts is set; no access.
- **Who sees it:** every user with Books read access, any role (guest bookkeepers included), through a viewer share that Books keeps in step with `books_access`. Users without Books access do not see it: it is not published (E10; replaces revision 1's Q8 guest-only shares and Q11 "listed but empty"). Readers change params and Customize for the run, copy a link, and "Save as". The owner (first admin) and editors edit; nobody deletes it while Books ships it.

### Report sources

Five sources (§5 table). Books days register as `Date` (E1); every source prints the Books heading (E9). People build their own Books reports from them with every checkpoint 0 feature.

### Books sidebar, Help

- Sidebar entry `{ href: 'reports', params: { package: 'books' }, available: true }` through `SidebarEntry.params` and `orgHref`.
- `books/help/reports.md` rewritten: Open Books reports; Read the Trial Balance (debit and credit by sign, Rows, Accounts filter, retained earnings, as-of presets, opening an account into its lines); Who sees Books reports (every Books reader, through a share); Build your own Books report (`[Build, share and publish reports](help://core:reports)`). `help/navigating-books.md` updates its Reports line.

## 4. Checkpoint 0 — core extensions (branch `books/p5-trial-balance` in `tinycld`, merged before checkpoint 1)

Each extension is general: it names no package; core tests use the fictional `zoo_*` collections and the `salesstub` e2e package. The spec format moves to **version 2**: every v2 field is optional and the 1→2 upgrade step is the identity, so stored v1 specs keep working; a v2 spec sent to an older server is refused by its version instead of silently losing fields.

| # | Extension | Engine (Go) | Spec schema | Client lib / view | Builder UI | Help / docs |
|---|---|---|---|---|---|---|
| E1 | **Date over a text day column**: `reports.Field.TextDay` (with `Type: Date`) | `registry.go` field; `check.go` accepts a `text` column for it | — | — | — (the catalog says `date`) | packages.md "Report sources" |
| E2 | **Totals that add the rows shown**: `columns[].total: "recompute"` (default) \| `"rows"` | `levels.go`, `assemble.go`, `layout.go`: a `rows` column's group, subtotal and total cells are the sum of the cells of the rows directly under them that the result shows (after `having`), per currency; the innermost group computes from its base rows; layout sections add their rows; computed rows unchanged | `Column.total` | `lib/spec.ts` | Columns section: per numeric column "Total: recompute / add the rows shown" | core help "Totals"; packages.md |
| E3 | **Group filter**: `groups[].having`, a condition over that level (aggregates, columns, record fields, params; a condition on an unset param matches all, as in `filter`) | `levels.go`: compiled in the level context as a condition on the level's rows; a hidden group hides its children; `recompute` totals still read every base row, `rows` totals add only rows shown | `Group.having` | `lib/spec.ts` | Group and sort: "Show only <groups> where …", the filter editor in aggregate mode (totals, counts, Ask when run) | core help "Hide groups" |
| E4 | **Record groups**: a group whose column's value is a relation to one source (a to-one path ending at a link, or a formula whose results are all that relation) carries the linked record. New leaf `{ "record": "<groupId>", "path": [...] }` reads the record's fields on that level, its subtotal, and the rows below. `groups[].label` (a formula; default the target's first text field) labels the row. `groups[].fill: { "where": … }` adds the target's records that have no base rows | binder: relation values carry their target source; `if`, `case`, `coalesce` of relations need one target; levels join the target's rule CTE by key; fill joins from the target's filtered rule CTE; record reads add the target's topic | `Group.label`, `Group.fill`, leaf `record` | `lib/spec.ts`, `lib/types.ts` | Group and sort: "Group by <link>" (a to-one link), a Label field picker, "Show every <target>, even with no rows" with its own condition editor | core help "Group by a linked record" |
| E5 | **Sort by a formula**: `sort[]` accepts `{ "formula": …, "dir" }` beside `{ "col" }` | `levels.go order` and detail order; a paged detail report refuses a formula sort key it cannot page by, as it refuses a total | `SortKey.formula` | `lib/spec.ts` | Group and sort: sort by any field of the group record (picker) or a formula | core help "Sort" |
| E6 | **`lookup` operator**: `{ "op": "lookup", "source": "<key>", "where": …, "value": { "path": … }, "pick": "min" \| "max" }` — one value from another source's rows the reader may see (its rule CTE); NULL when none match | `formula.go`: a scalar subquery over the source's rule CTE (one CTE per statement when it reads no row value); its collection joins the result's topics; allowed in columns, filter, group keys, having, sort | node fields `source`, `value`, `pick` | `lib/spec.ts` | formula editor (OQ2) | core help "Look up a value" |
| E7 | **Detail row label**: `detail: { "label": <formula> }` (default: the first column, as today) | `assemble.go detail` | `Spec.detail` | `lib/rows.ts` (a label that is not a cell drops no cell) | Columns section: "Row label" formula | core help "Opened rows" |
| E8 | **Choice params with options from a source**: `params[].optionsFrom: { "source", "value": path, "label": path, "group": path?, "where"? }` | new read route `POST /api/reports/param-options` `{ reportId \| spec, param, search, after }` → `{ options, groups, next }` under the reader's rules; a run checks a posted value by type only | `ParamDef.optionsFrom` | `lib/run-client.ts` options fetch; `ParamPickers` choice picker with search, paging, "All <group>" picks, the selected count on the chip | Filter: "Ask when run" on a relation condition makes such a param | core help "Filters that list records" |
| E9 | **Source heading**: `reports.Source.Heading func(app core.App) string`, the name a report from this source prints above its title | `run.go`: result field `heading` | — | `ReportDocumentHeader` prints `heading`, else the organization name | — | packages.md |
| E10 | **Unpublished shipped reports**: `reports.Shipped.Unpublished bool` — core creates the report unpublished and never publishes it on a revision; the package shares it | `shipped.go` | — | — | — | packages.md "Shipped and saved reports" |
| E11 | **Report e2e helpers exported**: the generic part of `tests/e2e/reports-helpers.ts` (`openReportsHub`, `hubRow`, `rowOf`, `cellOf`, `pressToolbar`, plus a new `chooseParamOption`) moves to `tests/e2e/report-view-helpers.ts`, exported through `@tinycld/core/e2e-helpers`; the salesstub helpers stay | — | — | e2e helpers | — | — |
| E13 | **Groups that open by default**: `groups[].open: true` — a run with no expansion state opens that level (the Books shell opened its sections; P&L and Balance Sheet need it; the Trial Balance does not use it) | `run.go`: no `options.expand` → the levels marked `open` expand | `Group.open` | `lib/rows.ts`: the first run sends no expansion, so the engine's default applies; Collapse all still closes them for the session | Group and sort: "Open when the report opens" per level | core help "Fold groups" |
| E12 | **Spec version 2 and builder round-trip** | `spec.go`: `CurrentVersion = 2`, upgrade step 1→2 (identity), `Validate` for every new field; Go tests per extension | `lib/spec.ts` zod schema v2 | — | `lib/builder/draft.ts`: `draftFromSpec`/`specFromDraft` keep every v2 field; a part the builder cannot edit is kept unchanged and shown read-only (the R15 rule) | core `help/reports.md`; `docs/packages.md` |

**Formula editor (OQ2, in checkpoint 0):** the builder's formula editor offers every report operator the engine has (`if`, `case`, comparisons, `and`/`or`/`not`, `isEmpty`, `coalesce`, date parts, `lookup`, `record` fields), through an optional operator-set prop on the forms engine's `FormulaEditor` (forms keep today's set).

**Verdict: MAJOR by the auto-helix rule; lane purchases holds `exclusive` until the PR merges.** E12 changes the report spec contract that every lane's report unit writes (a version bump, new fields the builder must round-trip). E4 and E8 change the run contract (a new route, the result field `heading`, relation-typed values) and the builder draft contract. OQ2 adds a prop to a forms-engine component. E1, E9, E10 and E11 alone would be small (additive optional fields, a test-helper export) but ride in the same PR. No core migration, no generator change, no removed or renamed export.

Core tests: Go unit tests per extension; the shared formula table gains `lookup` and `record` rows; the rule-parity fuzz test covers `lookup` and fill; vitest for `lib/spec.ts` v2, the `draft.ts` round-trip and the options fetch; e2e on `salesstub` (desktop and phone): `rows` totals, a group `having` with a param, group by a link with fill, sort by a record field, a detail label, a choice param from a source with search and a group pick, a source heading, an unpublished shipped report reached through a share.

## 5. Data (Books)

### Sources (`books/server/report_sources.go`)

Every Books source: key `books.<name>`; `FiscalStartMonth` = `books_settings.fiscal_year_start_month` (1 when no row); `Heading` = `books_settings.business_name` (E9). No `Source.Currency`: each money field names its row's `currency` column, which posting stamps from the Books currency setting.

| Source | Collection | Fields | Links |
|---|---|---|---|
| `books.accounts` "Accounts" | `books_accounts` | `name`, `full_name`, `number` Text MinMax; `type` Select (labels from `account_types.json`); `detail_type` Text; `description` Text; `inactive` Bool; `currency` Text | `parent` toOne → accounts; `sub_accounts` toMany ← accounts (`parent`); `lines` toMany ← journal lines (`account`); `balances` toMany ← account balances (`account`) |
| `books.journal_entries` "Journal entries" | `books_journal_entries` | `date` Date (TextDay); `status`, `origin`, `doc_type` Select; `number` Text MinMax; `memo` Text; `total` Money SumAll (`currency`); `currency` Text; `auto_reverse_on` Date (TextDay); `posted_at` DateTime MinMax | `lines` toMany ← journal lines (`entry`); `reverses`, `replaces` toOne → entries |
| `books.journal_lines` "Journal lines" | `books_journal_lines` | `debit`, `credit` Money SumAll (`currency`); `memo` Text; `date` Date (TextDay); `posted` Bool; `currency` Text | `entry` toOne → entries; `account` toOne → accounts |
| `books.account_balances` "Monthly account balances" | `books_account_balances` | `period` Text MinMax ("Month", `YYYY-MM`); `debit_total`, `credit_total` Money SumAll (`currency`); `currency` Text | `account` toOne → accounts |
| `books.customers` "Customers" | `books_customers` | `display_name` Text MinMax; `company`, `first_name`, `last_name`, `email`, `phone`, `mobile`, `website`, `notes` Text; `inactive` Bool | `parent` toOne → customers; `sub_customers` toMany ← customers (`parent`) |

Left out: json columns, `sort_key`, hidden `name_key`, `form`, `form_1099_box`, `position`, `close_override`, user relations. Vendors and products: their own units (Q10). Pinned by `reports.CheckSources` in `server/report_sources_test.go`.

### Account changes

- `books_accounts.full_name` (Q4): text max 1100, server-set on create and on any change of `name` or `parent`, for the account and every sub-account below it, inside the `serialized` account guard; refused in request bodies, like `currency`. Edited into migration 2100000002 (unreleased).
- **One retained-earnings account per chart (OQ3):** the owners' starter chart gains `3900 Retained earnings` (equity, `retained_earnings`; `inferOwnership` still reads 3000/3100/3200 against 3300/3400/3500). The server refuses a second account with detail type `retained_earnings`, and refuses deleting, deactivating or re-typing the only one ("Books needs one Retained earnings account. Rename it instead."). The setup wizard creates it in both charts.

### The Trial Balance spec (`books/server/report_trial_balance.go`, spec v2)

Built in Go from `account_types.json`. `PL` = the types whose group is income or expense; `RANK(t)` = a `case` over the types in file order (1 to 15). Paths start at a journal line.

- `source` `books.journal_lines`; `version` 2.
- `params`:
  - `{ id: asOf, type: asOf, label: "As of", default: { preset: endOfLastMonth } }`
  - `{ id: rows, type: choice, label: "Rows", options: [nonzero "Non-zero", active "Active", all "All"], default: "nonzero" }`
  - `{ id: accounts, type: choice, label: "Accounts", multiple: true, optionsFrom: { source: books.accounts, value: [id], label: [full_name], group: [type] } }`
- Named pieces (inlined): `net` = `sub([debit], [credit])`; `priorPL` = `and( in([account,type], PL), lt( fiscalYear([date]), fiscalYear({param asOf}) ) )`; `reAccount` = `lookup( source books.accounts, where eq([detail_type], "retained_earnings"), value [id], pick min )`.
- `filter`: `and( eq([posted], true), lte([date], {param asOf}), in({col account}, {param accounts}) )`.
- `columns`:
  1. `account` "Account" = `if( priorPL, reAccount, [account] )` (a relation to `books.accounts`)
  2. `number` "No." = `{ record: byAccount, path: [number] }`
  3. `debit` "Debit", `total: rows` = `if( eq(count([id]), 0), null, if( gte(sum(net), 0), sum(net), null ) )`
  4. `credit` "Credit", `total: rows` = `if( lt(sum(net), 0), sub(0, sum(net)), null )`
- `groups`: `[{ id: byAccount, col: account, label: { record: byAccount, path: [full_name] }, fill: { where: and( eq([inactive], false), in([id], {param accounts}) ) }, having: or( eq({param rows}, "all"), and( eq({param rows}, "active"), gt(count([id]), 0) ), ne(sum(net), 0) ) }]`. The fill `where` reads `books.accounts`: active accounts, narrowed by the Accounts param; an inactive account with lines comes in through its lines.
- `sort`: `[{ formula: RANK({ record: byAccount, path: [type] }) }, { col: number }, { formula: { record: byAccount, path: [full_name] } }]`.
- `detail`: `{ label: concat( [date], " · ", [entry, number], " · ", if( isEmpty([memo]), [entry, memo], [memo] ) ) }`.

Why it holds: an account's Debit and Credit cells are its net by sign; with `total: rows` the Total adds the account rows shown, so Debit total = Σ debit balances and Credit total = Σ credit balances, equal over all accounts because posted entries balance; Non-zero hides only rows whose net is zero, which add nothing to either total. Pinned in `server/report_trial_balance_test.go`: `CheckSources`, `Load`, `Validate`; `Run` as a Books reader over a ledger built in the test: chart order; sign split with a contra account in Credit; `0.00` against blank; each Rows choice; the Accounts param; the retained-earnings fold across a fiscal-year boundary (start months 1 and 7); the boundary day; drafts excluded; a void pair; equal totals; the heading; detail labels; a reader without Books access getting no rows.

### Share sync (`books/server/report_shares.go`)

For every user whose `books_access` grants read (any role): one viewer `report_shares` row on each report whose `shipped_key` starts with `books.`; removed when the access is revoked; reconciled at serve start (after core creates shipped reports) and when core creates one. The first admin owns the reports and gets no share. Go tests: grant, revoke, role change, reconcile, a user without access getting none.

### Client

`lib/shell-nav.ts`: `SidebarEntry.params`; the Reports entry as §3. `lib/live-recovery.ts`: `LiveRecovery` and `mergeRecoveries`, moved out of the shell for `useSettingsShell` and `useForm1099Section`.

## 6. Files (Books)

New: `server/report_sources.go` (+ test), `server/report_trial_balance.go` (+ test), `server/report_shares.go` (+ test), `tinycld/books/lib/live-recovery.ts`, `tests/e2e/trial-balance.spec.ts`, `tests/e2e/books-report-helpers.ts` (`openBooksReports`, `openTrialBalance`, over core's exported helpers, E11).

Changed: `server/register.go`; `server/accounts.go` (+ tests: `full_name`, the retained-earnings rule); `pb-migrations/2100000002_create_books_ledger.js`; `tinycld/books/lib/starter-chart.ts` (+ its test); `tinycld/books/lib/shell-nav.ts`; `tinycld/books/sidebar.tsx`; `hooks/useSettingsShell.ts`; `hooks/useForm1099Section.ts`; `tests/shell-nav.test.ts`; `tests/books-sidebar.test.tsx`; `help/reports.md`; `help/navigating-books.md`; `tests/help-reports.test.ts`; `docs/adr/0002-reports-read-monthly-balance-rows.md` (rewritten: reports run on the engine as the reader; by-month reports aggregate `books.account_balances`; as-of-a-day reports read posted lines, because a monthly row cannot stop inside its month).

Deleted (the shell copy): `tinycld/books/components/reports/` (15 files); `tinycld/books/lib/report-definition.ts`, `report-filters.ts`, `report-format.ts`, `report-options.ts`, `report-period.ts`, `report-registry.ts`, `report-rows.ts`, `report-shell-fixture.ts`, `report-state.ts`; `tinycld/books/lib/reports/` (3 files); hooks `useBackToReports.ts`, `useReportOptionsForm.ts`, `useReportScreen.ts`, `useReportsHub.ts`, `useTrialBalance.ts`; `stores/report-ui-store.ts`; `screens/reports/` (2 files); unit tests `tests/report-*.test.ts` (9 files), `use-report-options-form`, `use-report-prerequisites`, `use-report-screen`, `use-reports-hub`, `use-trial-balance`, `trial-balance.test.ts`; e2e `tests/e2e/report-shell-*.spec.ts` (5) and `report-shell-helpers.ts`. End check: `grep -rl` finds no `report-definition`, `report-state`, `report-registry`, `components/reports`, `useTrialBalance`, `books/reports` under `books/tinycld books/tests books/help`, and the generator leaves no `app/a/(app)/books/reports` route.

## 7. Tests (Books)

E2e `tests/e2e/trial-balance.spec.ts`, desktop 1280 and phone 390×844 where the phone path differs. Locators are core's kept ids (`report-param-asOf`, `report-param-rows`, `report-param-accounts`, `report-row-*`, `report-cell-<col>-<row>`, `report-empty`, `reports-hub-filter`, `reports-hub-row-*`, `report-document-*`). Every created record uses `uniqueName`; rows and totals are read in one `page.evaluate` snapshot.

1. **Sidebar to report and back** (desktop, phone): Books sidebar Reports → `/a/reports?package=books`, strip "Showing reports from Books" → Trial Balance → the header shows the Books business name, chips As of (End of last month) and Rows (Non-zero) → back to the filtered hub.
2. **Sign split and totals** (desktop): new Expense and Credit card accounts; post debit expense 123.45 / credit card 123.45 dated today; As of Today: the expense shows 123.45 in Debit, the card 123.45 in Credit. A second entry, debit card 200.00 / credit expense 200.00: the expense shows 76.55 in Credit, the card 76.55 in Debit. No amount in the table is negative; Debit total equals Credit total.
3. **Rows choice** (desktop): new accounts A and B; post A→B 50.00 and B→A 50.00, so A and B net zero; As of Today: Non-zero hides A; Active shows A with `0.00` in Debit; a third new account C with no lines appears only under All, with empty cells.
4. **Accounts filter** (desktop, phone): Add filter → Accounts → search the new expense account's name, pick it, Apply: only its row shows; "All Expense accounts" picks the whole type; the chip's remove control clears the filter.
5. **Drill-down** (desktop): open the expense row: its lines show labelled "<date> · <entry number> · <memo>" with their amounts by sign.
6. **Live update** (desktop): page A shows As of Today; page B (same context) posts to a new account; page A shows the row without a reload.
7. **Retained earnings** (desktop): post an entry dated two calendar years ago on a new Income account; As of Today: the Income account has no row and the Retained earnings row sits among the equity accounts; As of Custom = that day: the Income account shows the amount in Credit.
8. **Period and empty** (desktop, phone): Custom 1900-01-01 → "No rows as of Jan 1, 1900" with "Show end of last fiscal year"; the URL keeps `p-asOf`; no history entry is added.
9. **Phone layout** (phone): the four columns scroll sideways inside the table; the page has no horizontal scroll.

Who sees the report is covered by the share-sync Go tests and by core's e2e of an unpublished shipped report reached through a share (E10). Vitest: `shell-nav`, `books-sidebar` (the entry's href and params), `help-reports` (headings, the `help://core:reports` link), `starter-chart` (3900 in the owners' chart).

## 8. Cut (behaviour the shell's Trial Balance or the spec never had)

- Accrual/Cash toggle, Display columns by, comparison columns — the shell's Trial Balance did not use them; later report units own them.
- Exports (CSV, PDF, email) — later units (Books spec, Scope).
- Books' hub sections ("For my accountant") — core's hub has tabs; the Books strip takes their place.

## 9. Platform notes

None new. Books adds no UI; checkpoint 0's client parts (the param picker's search and paging, builder controls) use core components that run on web and native. The inherited web-only details of core's view were signed off with p5-report-builder.

## 10. Sparks carried

None (core's report view).

## 11. Non-goals

- The Trial Balance itself uses no layout and no `open` group (direction A); E13 is built and tested in core for the statement units (OQ4).
- No Books report besides the Trial Balance; vendors, products, invoices and bills sources wait for their units.
