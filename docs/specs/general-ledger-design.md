# General Ledger on the report engine — design (draft)

Unit `p5-general-ledger`, package `books`. Draft for the design gate, written in helix unattended mode from the Books design spec §Scope ("Reports: … General Ledger …; one report shell (date presets, method toggle, filter chips, Customize panel, live apply, drill-down …); every report … is a published report of the core report engine"), the report engine spec (`docs/superpowers/specs/2026-10-30-report-engine-design.md`), and the Trial Balance design it follows (`books/docs/specs/trial-balance-design.md`). Built against books `books/p5-trial-balance` @ f9e7003 and core `main` @ 40a3b225. The binding rule of 2026-11-01 applies: *design without the limits of what reports support today; what is missing is built in core first.* Every engine gap is a core extension in checkpoint 0 (§4). Decisions marked "(Qn)" follow the packet's recommended answer to open question n.

**Design gate (2026-11-06, human):** direction **A**; every open question Q1–Q10 as recommended (Q1: journal lines get an optional customer or vendor now; Q8 is moot, no lane holds `exclusive`). Note from the gate: a column cut off at the right edge (the artboard's Credit column) is not allowed; the report must use the engine's resize and wrap so every column fits → **F10**. Q10 (core's new `rowsKeyOf` leaves options out) → **F11**. Core PR merge: pre-approved by the human when its checks are green.

## 1. Goal

Books ships the General Ledger as an engine report: every posted line of a period, grouped by account in chart order, each account opening with its beginning balance and closing with its ending balance, each line with its date, type, number, name, description, other account, debit, credit and running balance; and core's engine gains the general features that make this possible for every package.

## 2. Where it lives

- **Report:** core's report view `/a/reports/<id>`, from core's hub `/a/reports?package=books` (the Books sidebar "Reports" entry from p5-trial-balance). Books adds no screen and no route.
- **Server:** Books' Go `Register(app)` registers the shipped report beside the Trial Balance. The share sync (`server/report_shares.go`) already shares every `books.*` shipped report with every Books reader; it needs no change.
- **Core:** checkpoint 0 (§4) on branch `books/p5-general-ledger` in `tinycld`, merged before checkpoint 1.

## 3. Behavior

### The report

- **Title** "General Ledger"; hub description "Every posted line, grouped by account, for a period." Shipped key `books.general_ledger`, revision 1, **unpublished** and shared with every Books reader (the Trial Balance's model).
- **Document header:** the Books business name, "General Ledger", the period in words ("October 1 – 31, 2026"; "All dates" for the open range, F4).
- **Params (chips, in this order):**
  - **Period** (`period`, `dateRange`), default **This month to date** (Q4); presets Today, This month, This month to date, This quarter, This quarter to date, This fiscal year, This fiscal year to date, Last month, Last quarter, Last fiscal year, Last 12 months, **All dates** (F4), Custom. Chip `report-param-period`.
  - **Rows** (`rows`, `choice`): **With activity** (default) — an account shows when it has a posted line in the period or a beginning balance that is not zero; **All** — every active account too, even with nothing to show. Chip `report-param-rows`.
  - **Accounts** (`accounts`, `choice`, multiple, options from `books.accounts` grouped by type in chart order, "All <type> accounts" picks) — the Trial Balance's param, under Add filter. Chip `report-param-accounts`.
- **Rows read:** posted journal lines (`posted = true`) dated in the period. Drafts never show. A void entry and its void reversal both show; they cancel in the account's balance.
- **One section per account** (a record group on the line's account), labelled "<number> <full name>" ("1000 Cash and bank:Business checking"; the full name alone when the account has no number). Sections follow the chart order: account type in `account_types.json` order, then number, then full name (the Trial Balance's sort keys). Every section is **open when the report opens** (core `groups[].open`, E13). A press on a section heading folds it; Expand all / Collapse all in core's toolbar.
- **Beginning balance row** (F5): the first row of each open section, "Beginning balance", with the account's balance on the day before the period starts in **Balance**. Rules (the Trial Balance's, as of that day): balance-sheet accounts count every earlier posted line; income and expense accounts count only lines of the fiscal year that holds the period's first day; the retained-earnings account also counts every income and expense line of earlier fiscal years. With All dates the beginning balance is 0.00. The row shows even when the section has no line in the period.
- **Line rows**, in date order, then posting order (`entry.posted_at`), then line position:
  - **Account / Date** (the label column): the line's date. The label column's heading reads "Account / Date" because section rows show the account and line rows the date.
  - **Type:** the Books register's type label (`lib/register.ts` `entryTypeLabel`): "Journal entry", "Transfer", "Opening balances", "Reversal of JE-12", "Void reversal of JE-12", "Auto reversal of JE-9". One label table serves Go and TS (§5).
  - **No.:** the entry's number ("JE-12", "TR-3"); blank when the entry has none.
  - **Name:** the customer or vendor on the line (Q1); blank when it has none.
  - **Description:** the line's memo, else the entry's memo (the register's rule).
  - **Split:** the other account's full name when the entry has exactly two lines; "-Split-" when it has more (the register's rule, `otherAccountOf`, `isSplit`).
  - **Debit**, **Credit:** the line's amounts; a zero side is blank.
  - **Balance:** the running balance of the account after this line: beginning balance + the posted lines so far in the section, **by the account's normal side** (debit-normal: debits − credits; credit-normal: credits − debits; from `account_types.json` `normal`, the register's `ownBalance`), so a liability's balance reads positive like it does in the register (Q2). A negative balance shows with core's Negative numbers option.
- **Section total row:** "Total <number> <full name>" (core `subtotals`), with the section's period Debit and Credit sums and the **ending balance** in Balance (F6: the rollup formula, beginning + net by the normal side).
- **Report Total row:** "Total": Debit and Credit sums of every line shown (equal when no Accounts filter is set); Balance blank.
- **A large book** (F7): the report is one document that pages as it scrolls. The first answer holds the section rows and the first page of lines in document order; the view asks for the next page when the reader nears the end, as core's detail reports do. Running balances continue across pages. No 5,000-row cut.
- **Sort by a column heading** (F8, Q5): pressing Date, Type, No., Name, Description, Split, Debit or Credit sorts the lines inside each section for this view (press again: descending; a third press returns to the report's order). Sections keep the chart order. **Balance** keeps the running order of the report (date, posting order), so a sorted view still shows each line's true balance; its heading has no sort control. The sort goes into the copied link like the params do.
- **Customize** (core): Divide by 1000, Without cents, Negative numbers, red negatives; Columns: show Type, No., Name, Description, Split, Debit, Credit, Balance.
- **Live:** any post, void, account edit, customer or vendor rename, or settings change re-runs the open report (topics of every collection the run read).
- **States** (core): loading; error with Retry; timeout with Retry; empty "No rows for <period>" with "Show this fiscal year", or "Clear filters" when Accounts is set; no access.
- **Phone** (core E14 wrap, `display.layouts`): each line row wraps onto lines inside the table: date · type · number; then name and description; then split; then debit, credit and balance. Section and total rows: label, then figures. No sideways scroll.
- **Every width fits** (F10, design gate): no column is cut off at the right edge at any width. When the one line does not fit, text columns (Description, Split, Name, the label) narrow with an ellipsis first; Debit, Credit and Balance keep their full width. If it still does not fit, the row wraps (the tablet layout, else core's automatic lines). Desktop does not scroll sideways.
- **Who sees it:** every Books reader, any role, through the Books share sync; no change from the Trial Balance. Readers change params, sort and Customize for the run, copy a link, and "Save as".

### Journal entry lines get a Name (Q1)

- A journal entry line may name one customer **or** one vendor ("Name" in the line table, a `SearchPicker` over active customers and vendors in two groups, between Account and Debit; a card field on phones). Optional. The read view and the register's entry drawer show it.
- The server refuses a line with both, an inactive or deleted party on a new or changed line, and deleting a customer or vendor named on a line ("<name> is on journal lines. Make it inactive instead."): the customer delete guard (`server/customers.go`, inside `serialized`) gains the check, and vendors gain a delete guard with the same check (`server/vendors.go` has none today). PocketBase would otherwise blank an optional relation on delete and the line would lose its name silently.
- Posting freezes it with the rest of the line. Document units (invoice, bill, expense, payment) stamp the same fields on the lines they post, so the General Ledger and later reports read one party model.

### Help

`books/help/reports.md` gains "Read the General Ledger" (sections, beginning balance, running balance by normal side, Split, Rows, Period with All dates, sorting by a heading, opening and folding sections). `books/help/journal-entries.md` gains the Name field. Core help `help/reports.md` gains each F-extension (§4).

## 4. Checkpoint 0 — core extensions (branch `books/p5-general-ledger` in `tinycld`, merged before checkpoint 1)

Each extension is general: it names no package; core tests use the fictional `zoo_*` collections and the `salesstub` e2e package. The spec format moves to **version 3** (every new field optional, the 2→3 upgrade step is the identity, so stored v2 specs keep working and a v3 spec sent to an older server is refused by its version — the v2 rule).

| # | Extension | Engine (Go) | Spec schema | Client lib / view | Builder UI | Help / docs |
|---|---|---|---|---|---|---|
| F1 | **Aggregate lookups:** `lookup.pick` `"sum"` \| `"count"` beside `min`/`max`. A money `sum` keeps the matched rows' currency; rows in more than one currency give no value and the `mixedCurrency` notice. | `lookup.go` (`lookupIn`, `pickedAmount`), formula table rows | `Node.pick` | `lib/spec.ts` | formula editor: lookup "Add up" / "Count" | core help "Look up a value"; packages.md |
| F2 | **Outer-row leaf in a lookup:** `{ "outer": <path> }` reads a field of the report's row (any to-one path from the base source) inside a lookup's `where` or `value`; refused anywhere else. | `lookup.go` `lookupCtx` (correlated subquery), `bind.go` | `Node.outer` | `lib/spec.ts` | formula editor: "This row's <field>" inside a lookup | core help; packages.md |
| F3 | **Date-range bounds:** leaf `{ "param": id, "bound": "from" \| "to" }`, a `Date` value; no value when the range is open. | `params.go`, `formula.go` param leaf | `Node.bound` | `lib/spec.ts` | formula editor: "<param> start / end" | core help "Period" |
| F4 | **All dates:** range preset `allDates` (no bounds): a `between` on it matches every row; the header prints "All dates". | `params.go` `rangePresets`, `rangeDays` | preset list | `lib/dates.ts`, `ParamPeriodControl` presets, `periodWords` | — | core help |
| F5 | **Opening row:** `groups[].opening: { "label": text, "cells": { <colId>: formula } }` — a row of kind `opening` first under each open group of that level (also under a group with no detail rows, a fill group included); formulas read the group's level (record leaves, lookups, params, aggregates). Absent cells are blank. | `assemble.go` (`groupWithLabel`), `levels.go`, `run.go` (`KindOpening`) | `Group.opening` | `lib/types.ts` row kind, `lib/rows.ts`, `ReportRow` (opening style: detail depth, label in the muted token), wrap layout | Group and sort: "Start each group with a row" (label + a formula per column) | core help "Opening rows" |
| F6 | **Rollup formula:** `columns[].rollup` — the formula a column's group, subtotal and total rows show in place of its own aggregate (detail rows keep `path`/`formula`). It may read aggregates, record leaves, lookups and params; a record leaf on a row with no record (the Total) makes the cell blank. Not with `total: "rows"`. | `levels.go`, `assemble.go` cells, `rows.go` totals | `Column.rollup` | `lib/spec.ts` | Columns: "On group and total rows show …" | core help "Totals" |
| F7 | **Paged grouped reports:** a grouped report pages its detail rows in document order. A page holds up to `options.limit` (default 200, at most 1,000) detail rows of the open groups plus the group, opening and subtotal rows around them; `page.next` carries the group path and the detail keyset. Group levels are not paged (still capped at 5,000 group rows). Running values continue across pages (the window is computed before the keyset). The 5,000 detail cap of grouped reports goes. | `run.go` (`run`, `detailPass`, `groupPass`), `paging.go` keyset over group keys + detail keys, `assemble.go` (a page assembles only its sections) | — | `lib/run-client.ts` next page for grouped results, `ReportTable` `onEndReached` appends sections | — | packages.md "What a report returns" |
| F8 | **Viewer sort:** `options.sort: [{ col, dir }]` reorders detail rows inside their groups for one run (group order unchanged); a column whose formula holds a running value is not a sort key; running values keep the spec's order. The cursor fingerprint includes the viewer sort. Header press cycles asc → desc → spec order; the view URL keeps `s=<col>:<dir>`. | `run.go` `Options.Sort`, `detail.go` order vs window frame order, `paging.go` fingerprint | — | `lib/view-url.ts`, `ReportTable` header sort control (core `Pressable` + sort icon, a11y `accessibilityRole="button"`, label "Sort by <column>") | — | core help "Sort a report" |
| F9 | **Spec version 3 and builder round-trip** | `spec.go` `CurrentVersion = 3`, identity upgrade 2→3, `Validate` for every new field | `lib/spec.ts` zod v3 | — | `lib/builder/draft.ts` keeps every v3 field; a part the builder cannot edit stays read-only (R15) | core `help/reports.md`; packages.md spec table |
| F10 | **Fit, never clip (design gate, human):** at every width, desktop included, a table whose one line does not fit its view first narrows its text columns (the label first, then the other text columns from the widest, each to a floor of 8 average characters, with an ellipsis; figure columns keep their full width), and if it still does not fit, wraps: the authored `display.layouts` entry for that width, else core's automatic lines (`autoLines`). A column is never cut off at the view's edge, and the table does not scroll sideways. Replaces the desktop sideways scroller and frozen label (`Sideways`, `FrozenLabel`), signed off with p5-report-builder. | — | — | `lib/table-lines.ts` `tableLines` (no desktop one-line rule; a fit test with narrowed text columns), `ReportTable` (remove `Sideways`), `ReportRow` | builder layout editor: the desktop width is editable like tablet and mobile | core help "Narrow screens" → "When columns do not fit" |
| F11 | **Viewer sort resets the list (Q10):** `rowsKeyOf` includes `options.sort`, so a new sort starts the list at the top like a new param; a fold or the next page still keeps the reader's place. | — | — | `lib/run-client.ts` `rowsKeyOf` | — | — |

**Verdict: MAJOR by the auto-helix rule; the lane holds `exclusive` until the core PR merges.** F9 changes the spec contract every report unit writes (a version bump); F5 adds a row kind and F7 changes the run contract (grouped results now page); F8 adds a run option; F10 changes how every report table fits at desktop width (no sideways scroll). No core migration, no generator change, no removed or renamed export.

Core tests: Go unit tests per extension (F1 sum/count incl. money currency and an empty match; F2 correlation and refusal outside a lookup; F3 open and closed range; F4 preset; F5 opening rows on open, closed, fill and having-hidden groups; F6 rollup on group, subtotal and total rows; F7 pages across group boundaries, running sums across pages, cursor refusal after a spec or sort change; F8 order inside groups, running order kept); the shared formula table gains `lookup` sum/count, `outer`, `bound` rows; the rule-parity fuzz test covers sum lookups and paged grouped reports; vitest for `lib/spec.ts` v3, the `draft.ts` round-trip, grouped paging in `run-client.ts` and the sort URL; e2e on `salesstub` (desktop and phone): an opening row, a rollup cell, a grouped report scrolled past its first page with a running value continuing, a heading sort, All dates; F10: vitest for `tableLines` (desktop one line that fits; desktop that fits only after text columns narrow; desktop that wraps to the authored layout, then to `autoLines`), e2e on `salesstub` at a desktop width too narrow for one line: every column's right edge is inside the table, and the table has no sideways scroll; existing core report e2e that rely on the desktop sideways scroller or frozen label are changed to the new behavior; F11: vitest for `rowsKeyOf` with and without `options.sort`.

## 5. Data (Books)

### Source changes (`books/server/report_sources.go`)

- `books.journal_entries.doc_type` options: `journal` "Journal entry" **and `transfer` "Transfer"** (today only `journal` is listed, while the migration allows both). Options come from one Go list checked against the migration's select values by a test.
- `books.journal_lines` gains `position` (Number, the line's order in its entry) and links `customer` → `books.customers`, `vendor` → `books.vendors` (Q1).
- New source `books.vendors` "Vendors": `display_name` Text MinMax; `company`, `first_name`, `last_name`, `email`, `phone`, `mobile`, `website`, `notes` Text; `inactive` Bool (the customers source's shape; 1099 fields, tax id and json columns left out). `CheckSources` pinned in `server/report_sources_test.go`.
- **Entry type labels:** `server/entry_type_labels.json` (origin → label, the transfer label, the reversal origins) read by the Go spec builder and by `lib/register.ts` `entryTypeLabel`, with a drift test both sides (the `transfer_account_types.json` pattern).

### Ledger change (Q1)

`books_journal_lines.customer` (relation `books_customers`, optional) and `.vendor` (relation `books_vendors`, optional), edited into migration `2100000002` (unreleased). Guards in `server/lines.go` (inside `serialized`): not both; an active party on a new or changed draft line; frozen at posting with the line. The customer delete guard and a new vendor delete guard refuse while a line names the party (§3). Collections `books_journal_lines` relations in `collections.ts`.

### The General Ledger spec (`books/server/report_general_ledger.go`, spec v3)

Built in Go from `account_types.json` and `entry_type_labels.json`, reusing the Trial Balance's helpers (`typeRankCase`, `profitAndLossTypes`, `path`/`fld`/`op`/`rec`…, moved to `server/report_spec_helpers.go`). `CN` = the credit-normal types; `PL` = the income and expense types; `from` = `{ param: period, bound: from }`.

- `source` `books.journal_lines`; `version` 3.
- `params`: `period` (`dateRange`, default `{ preset: thisMonthToDate }`); `rows` (`choice`: `active` "With activity" default, `all` "All"); `accounts` (the Trial Balance's `optionsFrom`).
- Named pieces (inlined): `net` = `sub([debit], [credit])`; `byNormal(x)` = `if( in({record byAccount [type]}, CN), sub(0, x), x )`; `opening` = `coalesce( lookup( source books.journal_lines, where and( eq([account], {record byAccount [id]}), eq([posted], true), lt([date], from), or( not(in([account, type], PL)), gte(fiscalYear([date]), fiscalYear(from)) ) ), value net, pick sum ), 0 ) + if( eq({record byAccount [detail_type]}, "retained_earnings"), coalesce( lookup( source books.journal_lines, where and( eq([posted], true), in([account, type], PL), lt(fiscalYear([date]), fiscalYear(from)) ), value net, pick sum ), 0 ), 0 )`.
- `filter`: `and( eq([posted], true), between([date], {param period}), in({col account}, {param accounts}) )`.
- `columns`:
  1. `account` "Account / Date" = `[account]` (a relation to `books.accounts`)
  2. `type` "Type" = the type-label `case` over `[entry, origin]` / `[entry, doc_type]`, with `concat(" of ", [entry, reverses, number])` for the reversal origins
  3. `number` "No." = `[entry, number]`
  4. `name` "Name" = `coalesce( [customer, display_name], [vendor, display_name] )`
  5. `description` "Description" = `if( isEmpty([memo]), [entry, memo], [memo] )`
  6. `split` "Split" = `case( eq(lookup(source books.journal_lines, where eq([entry], {outer [entry]}), value [id], pick count), 2), lookup(source books.journal_lines, where and( eq([entry], {outer [entry]}), ne([id], {outer [id]}) ), value [account, full_name], pick min), gt(…count…, 2), "-Split-", null )`
  7. `debit` "Debit" = `[debit]`, `aggregate: sum`
  8. `credit` "Credit" = `[credit]`, `aggregate: sum`
  9. `balance` "Balance" = `byNormal( add( opening, runningSum(net) ) )`, `rollup` = `byNormal( add( opening, sum(net) ) )`
- `groups`: `[{ id: byAccount, col: account, open: true, subtotals: true, label: if( isEmpty({record [number]}), {record [full_name]}, concat({record [number]}, " ", {record [full_name]}) ), fill: { where: in([id], {param accounts}) }, having: or( gt(count([id]), 0), ne(opening, 0), and( eq({param rows}, "all"), eq({record [inactive]}, false) ) ), opening: { label: "Beginning balance", cells: { balance: byNormal(opening) } } }]`.
- `sort`: the Trial Balance's chart keys (`RANK({record [type]})`, `{record [number]}`, `{record [full_name]}`), then `[date]`, `[entry, posted_at]`, `[position]`.
- `detail`: `{ label: [date] }`.
- `display.layouts`: one narrow layout (≤ 600) as §3 Phone, and one tablet layout (12 tracks): line 1 date (3) · type (2) · number (1) · debit (2) · credit (2) · balance (2); line 2 name (3) · description (5) · split (4) (F10 picks it when the one line does not fit). Phase 3 moved Name to line 2: on line 1, 12 tracks leave Name one track (about 58 px at 1024) or take a track from a figure. The fixture's `GENERAL_LEDGER_TABLET_LAYOUT` and `GENERAL_LEDGER_PHONE_LAYOUT` are these two layouts.

Why it holds: Balance on the last line of a section = beginning + Σ net of the section's lines = the rollup on its Total row; beginning balance = the Trial Balance's net of the account as of the day before the period (same retained-earnings fold), so the ending balance of the GL equals the Trial Balance's figure for that account as of the period's last day, by the normal side. Pinned in `server/report_general_ledger_test.go`: `CheckSources`, `Load`, `Validate`; `Run` as a Books reader over a ledger built in the test: chart order; beginning balances (balance-sheet, P&L within the fiscal year, retained-earnings fold, start months 1 and 7); running balance by normal side (a liability, a contra asset); ending = Trial Balance as of the last day; Split for 2 and 3 lines; type labels incl. reversal of; Name from a customer and a vendor; Rows; Accounts; All dates; drafts excluded; void pair; paging across a section boundary with the running balance continuing; a reader without Books access getting no rows.

## 6. Files (Books)

New: `server/report_general_ledger.go` (+ test), `server/report_spec_helpers.go` (helpers moved from `report_trial_balance.go`), `server/entry_type_labels.json` (+ Go and TS drift tests), `tests/e2e/general-ledger.spec.ts`, `tinycld/books/lib/general-ledger-fixture.ts` (helix fixture; static `RunResult` for the reference, the Trial Balance's model).

Changed: `server/register.go` (+ `registrations_test.go` hand-bound list); `server/report_sources.go` (+ test); `server/report_trial_balance.go` (helpers moved out); `server/lines.go`, `server/customers.go`, `server/vendors.go` (+ tests: party guards and references); `pb-migrations/2100000002_create_books_ledger.js`; `tinycld/books/collections.ts`; `tinycld/books/lib/register.ts` (labels from the JSON); journal entry line UI `components/entries/EntryEditableLineTable.tsx`, `EntryEditableLineCard.tsx`, `EntryLineTable.tsx`, `EntryLineCard.tsx`, `hooks/useEntrySave.ts` (+ the entry form schema); `tests/e2e/books-report-helpers.ts` (`openGeneralLedger`); `help/reports.md`, `help/journal-entries.md`; `tests/help-reports.test.ts`; `seed.ts` (a customer and a vendor on seeded lines, so the Name column shows in the seeded book).

## 7. Tests (Books)

E2e `tests/e2e/general-ledger.spec.ts`, desktop 1280 and phone 390×844 where the phone path differs; locators are core's ids (`report-param-period`, `report-param-rows`, `report-param-accounts`, `report-row-*`, `report-cell-<col>-<row>`, `report-empty`, `reports-hub-row-*`, `report-document-*`) plus F5/F8's new ids (`report-row-opening:*`, `report-sort-<col>`). Data is set up through the UI with `uniqueName`; rows read in one `page.evaluate` snapshot; no post dated before mid-2026 (books-settings.spec.ts holds a close date).

1. **Hub to report** (desktop, phone): Books sidebar Reports → strip → General Ledger → header shows the business name and "General Ledger"; chips Period (This month to date) and Rows (With activity).
2. **Section, beginning balance, running balance, ending balance** (desktop): new Bank account B and Expense account E; post an entry crediting B 100.00 (debit E) dated D1 and one debiting B 30.00 (credit E) dated D2, where D1 < D2 are the seeded days `GL_DAY_1` / `GL_DAY_2` after the e2e close date; Period Custom D1–D2: section B opens with "Beginning balance" 0.00, then its lines in date order with Balance −100.00 and −70.00 (debit-normal), and its Total row's Balance is −70.00; Period Custom D2–D2: B's beginning balance is −100.00 and its one line ends at −70.00.
3. **Normal side** (desktop): a new Credit card account C: a charge shows as a positive Balance on C.
4. **Type, No., Description, Split, Name** (desktop): a 3-line entry shows "-Split-"; a transfer shows "Transfer", "TR-<n>" and the other account; a line memo wins over the entry memo; a line with a customer shows its display name.
5. **Rows and Accounts** (desktop, phone): an account with lines only before the period shows under With activity with its beginning balance and no lines; an account with nothing shows only under All; Accounts filter as in the Trial Balance.
6. **All dates** (desktop): the header reads "All dates" and every beginning balance is 0.00.
7. **Sort by heading** (desktop): press Debit: lines inside a section reorder by debit, Balance values stay with their lines; the URL keeps the sort; press twice more returns the report's order.
8. **Paging** (desktop): a scroll to the end of a long seeded section loads the next page; the running balance continues (seeded long section, `seed.ts`, ≥ 250 lines in one account, so the first page of 200 ends inside it).
9. **Live** (desktop): page A open; page B posts to a new account; page A shows the section without a reload.
10. **Phone layout** (phone): a line row wraps onto its lines, no sideways scroll.
10a. **Fits at every width** (desktop at 1280 and at 1024): every heading and cell of Debit, Credit and Balance ends inside the table's right edge; at 1024 the rows narrow Description and Split or wrap to the tablet layout; no sideways scroll.
11. **Journal entry Name** (desktop, phone): pick a customer on a line, post; the read view shows it; picking a vendor replaces it; deleting that customer is refused with the message.

Vitest: `register` labels from JSON (drift), entry form schema with Name, `help-reports`. Go: §5 pins, party guards, references, source check, labels drift.

## 8. Cut

- **Accrual / Cash toggle** — Books has no payments or allocations yet; cash basis is derived from them (Books spec, Audience and basis). The method toggle belongs to p5-profit-and-loss and the payment units (p2-receive-payment, p3-pay-bills) (Q3).
- **Press a line to open its entry** — report-to-transaction navigation is the p5-drill-down unit (Q6).
- **Exports, print, email** — p5-exports.
- **Sub-account nesting with rolled-up totals** — sections are flat, labelled by full name, like the Trial Balance (Q7).
- **Line count in the section heading** ("Checking (44)") — dropped; the section's lines show under it.

## 9. Platform notes

None new. Books adds journal-line UI built from its own cross-platform parts (`SearchPicker`, cards on phones). Checkpoint 0's client parts (opening row, header sort control, grouped paging) use core components on web and native.

## 10. Sparks carried

1. One continuous document (§ intake): core `groups[].open` (E13) + F7 paging + core's report view. No new token.

## 11. Non-goals

- No change to the Trial Balance's spec or revision (it moves to helpers only).
- No new Books screen; no Books copy of report UI.
- No sub-account roll-up, no class/location, no multi-currency columns (Books is single-currency; the engine still groups money by currency).
