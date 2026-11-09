# Profit and Loss on the report engine — design

Approved at the design gate 2026-11-09: direction A (two shipped reports), every open question Q1–Q13 as recommended. Core checkpoint 0 P1–P4 takes `exclusive`; core merge: pre-approved when CI is green.

Unit `p5-profit-and-loss`, package `books`. Written in helix unattended mode on 2026-11-09 from the Books design spec §Scope ("Reports: P&L (by month, % of income, cash/accrual) … One report shell (date presets, method toggle, filter chips, Customize panel, live apply, drill-down …). Every report, the statements included, is a published report of the core report engine"), §Audience ("Accrual basis stored; cash-basis reports derived from payment allocations"), the report engine design, and the merged Trial Balance, General Ledger and Journal designs (`books/docs/specs/`) and the Balance Sheet design (`/Users/nas/tmp/tinycld/books/books/docs/specs/balance-sheet-design.md`, approved 2026-11-08, its core part merged). Built against books `main` @ 9cf2b70 and core `main` @ 95077d35. The binding rule of 2026-11-01 applies: *design without the limits of what reports support today; what is missing is built in core first.* This draft takes every recommended answer of the packet (direction A, Q1–Q12); the gate's answers replace them.

## 1. Goal

Books ships the Profit and Loss as two engine reports — **Profit and Loss** (the period's total and % of income) and **Profit and Loss by Month** (one column per month of the period, then the total and % of income) — in statement order Income, Cost of goods sold, Gross profit, Expenses, Net operating income, Other income, Other expenses, Net other income, Net income, on the accrual basis; and core's engine gains the general features this needs (P1–P4).

## 2. Where it lives

- **Reports:** core's report view `/a/reports/<id>`, from core's hub `/a/reports?package=books` (the Books sidebar "Reports" entry, `lib/shell-nav.ts`). Books adds no screen and no route.
- **Server:** Books' Go `Register(app)` (`server/register.go`) registers both shipped reports after the Journal. The share sync (`server/report_shares.go`, filter `shipped_key ~ 'books.%'`) shares every `books.*` shipped report with every Books reader; it needs no change.
- **Core:** checkpoint 0 (§4) on branch `books/p5-profit-and-loss` in `tinycld`, from core `main`, merged before checkpoint 1.

## 3. Behavior

### Both reports

- **Shipped keys** `books.profit_and_loss` (title "Profit and Loss", hub description "Income and expenses for a period, and what is left, on the accrual basis.") and `books.profit_and_loss_by_month` (title "Profit and Loss by Month", description "Income and expenses month by month for a period, on the accrual basis."). Revision 1, **unpublished** and shared with every Books reader (the Trial Balance's model).
- **Document header** (core): the Books business name, the title, the period in words ("January 1 – November 9, 2026"; "All dates" for All dates).
- **Params (chips, in this order):**
  - **Period** (`period`, `dateRange`), default **This fiscal year to date** (`thisFiscalYearToDate`, Q4); core's presets and Custom. Chip `report-param-period`.
  - **Rows** (`rows`, `choice`): **Non-zero** (default) — an account shows when its amount for the period is not zero; **Active** — an account shows when it has a posted line in the period (Q8). Chip `report-param-rows`.
- **Rows read:** posted journal lines (`posted = true`) of income, other income, cost of goods sold, expense and other expense accounts, dated in the period. Drafts never count; a void and its reversal cancel. **Accrual basis only** (Q1): the method toggle is deferred (§8, Cut).
- **Amounts by the account's normal side:** an income or other income account reads credits − debits; a cost of goods sold, expense or other expense account reads debits − credits. So normal amounts read positive, and a contra account (4200 Discounts and refunds given) reads negative. A section with no line reads 0.00. Negative numbers follow core's Negative numbers option.
- **The statement** (spark 1), every section open when the report opens (`groups[].open`), each with a fold chevron; Expand all / Collapse all in core's toolbar:
  1. **Income** (section) → accounts → "Total Income".
  2. **Cost of goods sold** (section) → accounts → "Total Cost of goods sold".
  3. **Gross profit** (computed) = Total Income − Total Cost of goods sold.
  4. **Expenses** (section) → accounts → "Total Expenses".
  5. **Net operating income** (computed) = Gross profit − Total Expenses.
  6. **Other income** (section) → accounts → "Total Other income".
  7. **Other expenses** (section) → accounts → "Total Other expenses".
  8. **Net other income** (computed) = Total Other income − Total Other expenses.
  9. **Net income** (computed, last row) = Net operating income + Net other income.
  The five sections always show, also when empty (title, then "Total <section>" 0.00), as the Balance Sheet's sections do (Q5). Section titles are fixed text; the subtotal label is core's "Total " + title.
- **Account rows:** labelled "<number> <full name>" ("6600 Rent or lease"; the full name alone when the account has no number), flat by full name (sub-accounts are not nested, Q6). Inside a section, chart order: number, then full name.
- **% of income** column (P1): each row's amount ÷ Total Income for the same period × 100, one decimal ("18.8%"), on account rows, section totals and computed rows; blank when Total Income is 0.00. Total Income reads 100.0%. The denominator is the Income section alone, not Other income (Q11). Customize can hide it.
- **Customize** (core): Divide by 1000, Without cents, Negative numbers, red negatives; Columns: show % of income. The section key column is never listed (G7 `hidden`).
- **Live:** any post, void, account edit (name, number, type, parent) or Books settings change (fiscal start month, business name) re-runs the open report.
- **States** (core): loading; error with Retry; timeout with Retry; no access. A period with no posted P&L line shows the five sections at 0.00 and the four computed rows at 0.00, % of income blank (a layout report has no empty state).
- **Who sees it:** every Books reader, any role, through the Books share sync; readers change params and Customize for the run, copy a link, and "Save as".

### Profit and Loss (`books.profit_and_loss`)

- **Columns:** **Account** (label), **Total** (heading "Total"), **% of income**.
- **Press an account row** opens its posted lines in the period beneath it (the Trial Balance's model, Q7), each labelled "<date> · <entry number> · <memo>" (the entry's memo when the line has none), in date order then entry sequence; Total shows the line's amount by the account's normal side; % of income is blank on an opened line (`detail: "blank"`). Many lines page as the reader scrolls. Computed rows do not open.
- **Phone** (core wrap, `display.layouts` mobile): each row wraps onto two lines: the label; then Total · % of income. No sideways scroll.
- **Every width fits** (core column fit, spec v4): the label narrows with an ellipsis first; figure columns keep their full width.

### Profit and Loss by Month (`books.profit_and_loss_by_month`)

- **Columns:** **Account** (label), then **one column per month of the period** (P2), each headed by the month in words ("Jan 2026", P4), a month with no line reading 0.00; then **Total** (the period, P3); then **% of income** (of Total, P1). Per-month % of income is cut (Q3).
- A period longer than 36 months shows its first 36 month columns and core's `pivotCap` notice ("The pivot shows its first 36 columns; N more are left out."); Total and % of income still cover the whole period. All dates shows one column per month that has a posted line (P2 has no bounds to fill between).
- **Rows do not open** (a pivot's innermost level never opens). Reading the lines behind a month's amount is the p5-drill-down unit (Q7).
- **Every width fits:** where one line holds every column (label at least 12 characters, figures whole), the rows are one line; where it does not, core's automatic lines apply: the label on its own line, then the figures in column order, wrapping, each figure whole. No sideways scroll at 390, 1024 or 1280.

### Help

`books/help/reports.md` gains "## Read the Profit and Loss" after the last statement section: the statement order and the four computed rows, amounts by normal side (why a discount account reads negative), % of income and its denominator, the period and its presets, Rows, opening an account into its lines, the by-month report (every month shown, the 36-month cap), and "Books reports the P&L on the accrual basis: income counts on the day it is entered, not the day it is paid." Core `help/reports.md` gains each P extension (§4).

## 4. Checkpoint 0 — core extensions (branch `books/p5-profit-and-loss` in `tinycld`, merged before checkpoint 1)

Verified against core `main` 95077d35 (intake.md, "Core engine gaps"). Each extension is general: it names no package; core tests use the fictional `zoo_*` collections and the `salesstub` e2e package. **No version bump (Q12):** every field is optional and added at spec version 4; `Load` decodes strictly, so an older server refuses a spec that uses one. Each extension carries its builder round-trip (`lib/builder/draft.ts` keeps the field; a part the builder cannot edit stays read-only) and its row in `docs/packages.md` ("Fields added in version 4").

| # | Extension | Engine (Go, `core/server/reports/`) | Spec schema | Client lib / view | Builder UI | Help / docs |
|---|---|---|---|---|---|---|
| P1 | **Percent of a section:** operator `{ op: "percentOfSection", args: [{ col: <number column> }], subtotal: "<section id>", scale }` in a column formula of a layout report: the row's value of that column ÷ the named layout section's total of the same column × 100 (when the argument is a pivot's cell column, its value is the row's total across the pivot), at `scale` decimals; no figure when that total is 0 or blank. Defined on detail, group, subtotal, section total and computed rows: a computed row and a section total divide their own cell. Refused outside a layout report, when `subtotal` names no section, when the argument is not a `{col}` of a number or amount column, inside another window operator, and on a pivot's cell column. Type Percent. | `formula.go` (window ops), `detail.go` `windowSQL` (denominator read from the section's total), `layout.go` (computed rows and section totals divide their own cell, as G8 derived columns), `bind.go` refusals | `Node.subtotal` on the operator; operator name in the formula table | `lib/spec.ts` operator; `lib/format.ts` percent as today | Column formula editor: "Percent of a section's total" (pick the section) | core help "Show a row as a percent of a section"; `docs/packages.md` |
| P2 | **Pivot over a whole period:** `pivot.range: "<dateRange param id>"` on a pivot with a `bucket` over a date: every bucket the range's `from`..`to` touches is a column, in order, whether or not a row falls in it (cells 0 for a summed amount, blank otherwise as today); at most `maxColumns`, then the `pivotCap` notice. On an unset range or All dates, the columns are the buckets that have rows (today's behavior). Refused when the param is not a `dateRange`, on a pivot without a bucket, and on a pivot that is not over a date. | `pivot.go` `pivotPass` (generate the bucket series from the resolved range), `bind.go` refusals | `Pivot.range` | `lib/spec.ts` | Pivot editor: "Show every <bucket> of <date range param>" | core help "Pivot by month across a whole period" |
| P3 | **Pivot columns in spec order:** `pivot.order: "spec"`: the result keeps the spec's column order and puts the pivot columns immediately before their cell column, which follows them as the row's total across the pivot. Absent: today's order (the cell column, then the pivot columns, last). | `bind.go` (`c.p.cols` order), `assemble.go` `columns()`, `fit.go` label column | `Pivot.order` | `lib/table-lines.ts` `expandPivots` reads the result order; `column-measure.ts` | Pivot editor: "Total after the pivot columns" | core help, the pivot section |
| P4 | **Bucket labels in words:** a bucketed value that labels a pivot column or a group row carries a typed label (`labelType` `month`, `quarter`, `year`, `fiscalYear`, `day`) and the view writes it in words in the reader's locale: month "Jan 2026", quarter "Q1 2026", year "2026", fiscal year "FY 2026" (the fiscal year's end year), day in the short day form. The raw key stays the column's `pivot.key` and the group key. This changes the text of every bucketed label (today "2026-01"), in the view and in exports. | `assemble.go` `display` / `pivotLabel` (typed label for a bucket), `run.go` `PivotColumn.LabelType` | — | `lib/types.ts` label types; `lib/format.ts` `typedLabelText` for buckets; `lib/dates.ts` month words | — | core help (pivot and group by date) |

**Verdict: MAJOR → the lane takes `exclusive` for checkpoint 0 (Q10).** No migration, no generator change, no removed export, but P4 changes the text existing bucketed reports return, P3 changes a pivot result's column order when set, and P1/P2 edit the shared engine files (`formula.go`, `detail.go`, `layout.go`, `pivot.go`, `assemble.go`, `bind.go`) that every report unit's checkpoint 0 edits. Build order: P4 → P3 → P2 → P1 → builder and help; writing-plans, the human's plan review, subagent-driven development, then the PR (the Balance Sheet's order).

Core tests: Go unit tests per extension (P1: a percent of one section on detail, group, section total and computed rows, in a pivot report over the cell column's total, a zero section total giving no figure, each refusal; P2: a month pivot over a range with an empty middle month, a quarter bucket, a range wider than `maxColumns` with its notice, All dates and an unset range keeping today's columns, each refusal; P3: column order with and without `order`, column fit's label column unchanged; P4: month, quarter, year, fiscal year (start month 7) and day labels typed on pivot columns and on bucketed group rows, raw keys unchanged); the rule-parity fuzz test covers `percentOfSection` and `range`; vitest for `lib/spec.ts` (each new field), the `draft.ts` round-trip, `format.ts` bucket words, `table-lines.ts` with `order: "spec"`; e2e on `salesstub` (desktop and phone): a layout statement with a percent-of-section column, a month pivot over a range with an empty month headed "Feb 2026", the total after the months; and every existing core e2e that reads a bucketed label updated to the words.

## 5. Data (Books)

No migration, no new collection, no source change: the sources of p5-trial-balance (`books.journal_lines`, `books.accounts`, `server/report_sources.go`) hold every field these reports read (`debit`, `credit`, `date`, `posted`, `memo`; `account` → `type`, `number`, `full_name`; `entry` → `number`, `sequence`, `memo`).

### The Profit and Loss spec (`books/server/report_profit_and_loss.go`, spec v4)

Built in Go with the Books spec helpers (`server/report_spec_helpers.go`: `path`, `fld`, `link`, `op`, `lit`, `prm`, `col`, `rec`, `profitAndLossTypes`, `creditNormalTypes`, `accountLabel`). `PL` = `profitAndLossTypes()`; `CN` = `creditNormalTypes()`.

- `source` `books.journal_lines`; `version` `reports.CurrentVersion` (4).
- `params`: `period` (`dateRange`, default `{ preset: thisFiscalYearToDate }`); `rows` (`choice`: `nonzero` "Non-zero" default, `active` "Active").
- `signed` (inlined) = `if( in([account, type], CN), sub([credit], [debit]), sub([debit], [credit]) )`.
- `filter`: `and( eq([posted], true), between([date], {param period}), in([account, type], PL) )`.
- `columns`:
  1. `account` "Account" = path `[account]` (relation; the label column).
  2. `amount` "Total" = `coalesce( sum(signed), 0 )`.
  3. `pct` "% of income", `format: "percent"`, `detail: "blank"` = `percentOfSection( {col amount}, subtotal income, scale 1 )` (P1).
  4. `sec` `hidden` (G7) = path `[account, type]` (the section key).
- `groups`:
  1. `section`: col `sec`, `open: true`, `subtotals: true`.
  2. `byAccount`: col `account` (record group), `label` = `accountLabel` over `{record byAccount …}` ("<number> <full name>"), `having` = `or( eq({param rows}, "active"), ne({col amount}, 0) )`.
- `layout`:
  - `{ section: income, title: "Income", key: "income" }`, `{ section: cogs, title: "Cost of goods sold", key: "cost_of_goods_sold" }`,
  - `{ row: grossProfit, label: "Gross profit", formula: sub({subtotal income}, {subtotal cogs}) }`,
  - `{ section: expenses, title: "Expenses", key: "expense" }`,
  - `{ row: netOperatingIncome, label: "Net operating income", formula: sub({subtotal grossProfit}, {subtotal expenses}) }`,
  - `{ section: otherIncome, title: "Other income", key: "other_income" }`, `{ section: otherExpenses, title: "Other expenses", key: "other_expense" }`,
  - `{ row: netOtherIncome, label: "Net other income", formula: sub({subtotal otherIncome}, {subtotal otherExpenses}) }`,
  - `{ row: netIncome, label: "Net income", formula: add({subtotal netOperatingIncome}, {subtotal netOtherIncome}) }`.
  (`{subtotal <row id>}` reads an earlier computed row: core `layout.go` `layoutCtx.subtotal` → `inline`.)
- `sort`: `{record byAccount [number]}`, `{record byAccount [full_name]}`, then `[date]`, `[entry, sequence]` (opened lines only).
- `detail`: `{ label: concat( [date], " · ", [entry, number], " · ", if( isEmpty([memo]), [entry, memo], [memo] ) ) }`.
- `display`: `oneLine` `{ minWidth: "600px" }`; `columns`: `account` `{ minWidth: "12ch" }`; `amount`, `pct` `{ minWidth: "max-content" }`. `layouts`: `mobile` (tracks 2: `account` line 1 span 2; `amount`, `pct` line 2). Why the `oneLine` gate (phase 3 pass 2 measure): without it core's fit puts the three columns on one line at 390 (the label cut to "4000 Service ..."), so the phone wrap of §3 never shows; the gate keeps one line to rows of 600 px and wider (the Journal's 880px and General Ledger's 1040px precedent; the fixture's `PROFIT_AND_LOSS_ONE_LINE_MIN_WIDTH`).

### The Profit and Loss by Month spec (same file)

The Profit and Loss spec with:
- `pivot`: `{ path: [date], bucket: "month", cell: "amount", range: "period" (P2), order: "spec" (P3), maxColumns: 36 }`. Month headings in words (P4).
- No `sort` keys on `[date]` / `[entry, sequence]`, no `detail`, and `pct` without `detail: "blank"` (a pivot report has no detail rows: `bind.go` refuses `detail.label` and a column's `detail` there).
- `display`: `columns` as above; no `layouts` (core automatic lines below the one-line width).

Why it holds: Net income = (Income − COGS − Expenses) + (Other income − Other expenses) over the same lines, and each account's Total equals the General Ledger's net of that account for the same period, by normal side (the Go test compares the two runs). In the by-month report each month column's Net income adds to Total's (the months partition the period; P2 shows every month).

Pinned in `server/report_profit_and_loss_test.go`: `CheckSources`, `Load`, `Validate` for both specs; `Run` as a Books reader (`readerInfo`) over a ledger built in the test (`newLedgerEnv`): the statement order (five sections, four computed rows); signs (income, contra income, expense, other income, other expense); Gross profit, Net operating income, Net other income, Net income; % of income on account, section total and computed rows, and blank with no income; drafts and lines outside the period excluded; a void pair; Rows Non-zero against Active; the by-month report's columns for a period with an empty month (0.00), headings "Jan 2026" …, Total after the months, each month's Net income adding to Total's; the 36-month cap notice; no `sec` column in the result; a reader without Books access getting no rows.

## 6. Files (Books)

New: `server/report_profit_and_loss.go` (+ `_test.go`), `tests/e2e/profit-and-loss.spec.ts`, `tinycld/books/lib/profit-and-loss-fixture.ts` (helix fixture: static `RunResult`s for both reports, the Trial Balance fixture's model; imported by the e2e spec for its constants, so tsc checks it).

Changed: `server/register.go` + `server/registrations_test.go` (hand-bound list), `tests/e2e/books-report-helpers.ts` (`openProfitAndLoss`, `openProfitAndLossByMonth`, `plSnapshot`, `choosePeriod` reuse), `help/reports.md`, `tests/help-reports.test.ts`.

## 7. Tests (Books)

E2e `tests/e2e/profit-and-loss.spec.ts`, titles prefixed `profit-and-loss:`, desktop 1280 and phone 390×844 where the phone path differs; locators are core's ids (`report-param-period`, `report-param-rows`, `report-row-*`, `report-cell-<col>-<row>`, `reports-hub-row-*`, `report-document-*`) and core helpers. Data is set up through the UI with unique memos and new accounts; rows read in one `page.evaluate` snapshot; entries are posted today (inside every fiscal-year-to-date period), no post dated before mid-2026, and no assertion depends on the fiscal start month (lesson 33, memory p5-trial-balance).

1. **Hub to report** (desktop, phone): Books sidebar Reports → Profit and Loss → header shows the business name, "Profit and Loss", the period in words; chips Period (This fiscal year to date) and Rows (Non-zero).
2. **Statement and signs** (desktop): new Income account I and Expense account E; post debit Business checking 500.00 / credit I 500.00 and debit E 120.00 / credit Business checking 120.00: I shows 500.00 under Income, E 120.00 under Expenses. (Not "Net income rises by 380.00 against a snapshot taken before": other workers post today on the shared e2e DB, so a delta between two snapshots is not stable; the Go test pins Net income over a ledger of its own, plan decision D2.)
3. **Computed rows** (desktop): Gross profit = Total Income − Total Cost of goods sold; Net operating income, Net other income and Net income follow (one snapshot).
4. **% of income** (desktop): Total Income reads 100.0%; I's % = I ÷ Total Income; Customize hides the column.
5. **Rows** (desktop): an account whose lines net to zero is hidden under Non-zero and shows 0.00 under Active.
6. **Open an account** (desktop): press I: its line shows "<date> · <number> · <memo>", % of income blank.
7. **By month** (desktop): Profit and Loss by Month, Period Custom = the first day of last month to today: two month columns headed in words, then Total, then % of income; I's amount sits in this month's column, last month's reads 0.00 for I.
8. **Live** (desktop): page A open; page B posts to I; page A shows the new amount without a reload.
9. **Phone layout** (phone): a Profit and Loss row wraps onto label, then Total · % of income; the by-month report wraps its figures; no sideways scroll on either.
10. **Fits** (desktop at 1280 and 1024): every heading and figure cell ends inside the table's right edge on both reports; no sideways scroll; no section key column shows.

Vitest: `help-reports` (the new heading). Go: §5 pins.

## 8. Cut

- **Cash basis / the method toggle** (Q1) — cash basis is derived from payment allocations, and Books has none: no payment collection (`pb-migrations/2100000002_create_books_ledger.js` `doc_type` is `journal`, `transfer`), p2-receive-payment and p3-pay-bills not merged. Recorded as a deferral (reason 1: upstream dependency, verified missing) to the unit that adds bill payments, p3-pay-bills, which the human extends at the gate: "add the Accrual / Cash method param to the Profit and Loss reports (and the Balance Sheet, whose Q7 cut it)". Both reports say "accrual basis" in their descriptions and help.
- **% of income per month** (Q3) — each month column beside its own percent doubles the figure columns (24 for a year) and does not fit 1280; the by-month report gives % of income on Total. (Building it is core P7, several cells per pivot value.)
- **One report with a Columns switch** (Q2, direction B) — two shipped reports instead; it would need core P6 (a param that turns the pivot on and off).
- **Sub-account nesting with "Total <parent>" rows** — flat by full name, as the Trial Balance, General Ledger and Balance Sheet (Q6).
- **Hiding empty sections** — the five sections always show (Q5).
- **Press a month cell** — report-to-transaction navigation is p5-drill-down.
- **Add notes, Edit titles** — core report view has no notes or title editing on a run; "Save as" renames a copy.
- **Exports, print, email** — p5-exports.
- **Uppercase computed rows, logo in the header** (screenshots) — the look is not carried.

## 9. Platform notes

None new. Books adds no UI. Checkpoint 0's client parts (bucket words, pivot column order) are core report-view parts on web and native.

## 10. Sparks carried

1. Statement reads as a calculation: core `layout` sections per account type with top-level computed rows placed where their inputs end; core `ReportRow`'s ruled subtotal and computed rows; `groups[].open`. No new token, no new component.

## 11. Non-goals

- No change to the Trial Balance, General Ledger, Journal or Balance Sheet spec or revision.
- No new Books screen; no Books copy of report UI.
- No comparison columns (prior period, prior year) — not in the Books spec for the P&L.
- No class/location columns, no multi-currency columns (Books is single-currency).
- No budget columns (budgets are "Later").
