# Balance Sheet on the report engine — design (approved at the design gate 2026-11-08)

Unit `p5-balance-sheet`, package `books`. Approved by the human at the design gate on 2026-11-08 (decisions below). Written in helix unattended mode from the Books design spec §Scope ("Reports: … Balance Sheet (with prior-year comparison) …; one report shell …; every report … is a published report of the core report engine"), the report engine design (`docs/superpowers/specs/2026-10-30-report-engine-design.md`: "the engine supports fixed section layouts and computed rows"), the merged Trial Balance and General Ledger designs (`books/docs/specs/trial-balance-design.md`, `books/docs/specs/general-ledger-design.md`), and the human's answers at the 2026-11-06 design gate (direction A; Q1–Q11 as recommended). Built against books `main` @ 66846ed and core `main` @ b021c3a. The binding rule of 2026-11-01 applies: *design without the limits of what reports support today; what is missing is built in core first.* Decisions marked "(Qn)" are the human's answer to question n of the 2026-11-06 packet (kept on 2026-11-08); "(Nn)" is the human's answer to question n of the 2026-11-08 packet.

### Design gate decisions (2026-11-08)

- **Direction A** (kept): section › class › type › account; Current · Prior year · Change · % change; Retained earnings and Net income inside Equity.
- **Q1–Q12** as in the packet's Decided questions: Q1 always compute the four figure columns, Customize hides the last three; Q2 prior-year day = same day twelve months earlier (Feb 29 → Feb 28); Q3 build G3; Q4 default as-of Today; Q5 Rows Non-zero (default) and Active, All cut; Q6 Accounts filter cut; Q7 Accrual / Cash cut; Q8 pressing an account opens its posted lines; Q9 superseded by N1; Q10 sub-accounts flat by full name; Q11 "Total " + label; Q12 p5-general-ledger merged.
- **N1:** the new fields are added at spec version 4; no version bump.
- **N2:** G8 replaces G2 (no column params).
- **N3:** G8's derived-column change is accepted as a fix for every layout report (no opt-in flag).
- **N4:** checkpoint 0 is MAJOR; the lane takes `exclusive` and holds it now.
- **N5:** opened lines show Change and % change blank (`detail: "blank"`).
- **Overlap with p5-journal-report:** build now. Whichever unit merges first adds `accountLabel` to `server/report_spec_helpers.go`; the other uses it (no second copy). The two core checkpoint 0s run one after the other, serialized by the `exclusive` claim; the second rebases.
- **Core PR:** pre-approved to merge when its checks are green.

## 1. Goal

Books ships the Balance Sheet as an engine report: every balance-sheet account's balance on one day, beside the same day a year earlier, in the outline Assets / Liabilities / Equity with class and type totals, Retained earnings and Net income computed inside Equity, and Total liabilities and equity equal to Total assets; and core's engine gains the general features this needs (G1, G3, G4, G5, G7, G8).

## 2. Where it lives

- **Report:** core's report view `/a/reports/<id>`, from core's hub `/a/reports?package=books` (the Books sidebar "Reports" entry, `lib/shell-nav.ts`). Books adds no screen and no route.
- **Server:** Books' Go `Register(app)` (`server/register.go`) registers the shipped report after the Trial Balance and the General Ledger. The share sync (`server/report_shares.go`, filter `shipped_key ~ 'books.%'`) shares every `books.*` shipped report with every Books reader; it needs no change.
- **Core:** checkpoint 0 (§4) on branch `books/p5-balance-sheet` in `tinycld`, from core `main`, merged before checkpoint 1.

## 3. Behavior

### The report

- **Title** "Balance Sheet"; hub description "What the business owns and owes on one day, beside the same day a year earlier." Shipped key `books.balance_sheet`, revision 1, **unpublished** and shared with every Books reader (the Trial Balance's model).
- **Document header:** the Books business name, "Balance Sheet", "As of <day in words>" (core's as-of header).
- **Params (chips, in this order):**
  - **As of** (`asOf`, type `asOf`), default **Today** (Q4); presets Today, End of last month, End of last quarter, End of last fiscal year, Custom. Chip `report-param-asOf`.
  - **Rows** (`rows`, `choice`): **Non-zero** (default) — an account shows when its balance on either day is not zero; **Active** — an account shows when it has a posted line on or before the as-of day (Q5). Chip `report-param-rows`.
- **Rows read:** posted journal lines (`posted = true`) dated on or before the as-of day. Drafts never count; a void and its reversal cancel.
- **Columns** (Q1, Q3):
  1. **Account** — the label column (sections, classes, types, accounts, opened lines).
  2. **Current** — heading the as-of day in short form ("Nov 8, 2026", G3): the balance on the as-of day.
  3. **Prior year** — heading the same day twelve months earlier ("Nov 8, 2025"; Feb 29 → Feb 28, core `addMonths`) (Q2): the balance on that day.
  4. **Change** — Current − Prior year.
  5. **% change** — Change ÷ |Prior year| × 100, one decimal ("12.3%"); blank when Prior year is zero.
  Customize can hide Prior year, Change and % change for the run (core's Columns lists every column after Account, so Current is listed too; the report opens with all four shown). Every figure column is a balance **by the account's normal side**: an asset reads debits − credits, a liability or equity account credits − debits, so every normal balance reads positive and a contra account (Accumulated depreciation, Owner's draws) reads negative. A balance with no line on its day reads 0.00. Negative numbers follow core's Negative numbers option.
- **The outline** (direction A), every level open when the report opens (core `groups[].open`), each group with a fold chevron; Expand all / Collapse all in core's toolbar:
  - **Assets** (section) → **Current assets** (class) → **Bank accounts**, **Accounts receivable**, **Other current assets** (type) → accounts; **Fixed assets** (class) → accounts; **Other assets** (class) → accounts. Section total "Total Assets".
  - **Liabilities** (section) → **Current liabilities** (class) → **Accounts payable**, **Credit cards**, **Other current liabilities** (type) → accounts; **Long-term liabilities** (class) → accounts. "Total Liabilities".
  - **Equity** (section) → equity accounts directly (no class, no type: G1), then **Retained earnings**, then **Net income** (G4). "Total Equity".
  - **Total liabilities and equity** — the last row: Total Liabilities + Total Equity, per column.
  - Every class and type ends in its total row ("Total Current assets", "Total Bank accounts": core prefixes "Total " to the label, Q11). A class or type whose every account the Rows choice hides does not show, with its total (G5). The three sections always show, also when empty (core layout sections).
- **Account rows:** labelled "<number> <full name>" ("1010 Cash and bank:Business checking"; the full name alone when the account has no number), flat by full name (sub-accounts are not nested, Q10). Inside a type, chart order: number, then full name.
- **Retained earnings row** (G4, G8): in each figure column, on that column's day X (the as-of day for Current, the prior-year day for Prior year): the retained-earnings account's own posted lines on or before X, plus every income and expense line dated before the fiscal year that holds X (credits − debits). Books keeps exactly one retained-earnings account, and its lines never also show as an account row. Always shown, 0.00 when zero.
- **Net income row** (G4, G8): on each column's day X, the income and expense lines dated in the fiscal year that holds X, on or before X (credits − debits, so a profit reads positive). Always shown. Fiscal years start in the Books fiscal start month, read at each run.
- **Change and % change on computed rows and section totals** (G8): computed from that row's own Current and Prior year, as on every other row. Total Equity adds Retained earnings and Net income in Current and Prior year; its Change and % change come from its own Current and Prior year.
- **Why it balances:** with drafts excluded and every posted entry balanced, Σ asset lines = Σ liability, equity and P&L lines; the P&L lines are split exactly once between Retained earnings and Net income for each column's day, so Total Assets = Total liabilities and equity in both columns.
- **Press an account row** opens its posted lines beneath (the Trial Balance's model, Q8), each labelled "<date> · <entry number> · <memo>" (the entry's memo when the line has none), in date order then entry sequence. Current shows the line's amount by the account's normal side; Prior year shows it when the line is dated on or before the prior-year day and 0.00 when not; Change and % change are blank on an opened line (N5). Many lines page as the reader scrolls (core paged grouped reports). Retained earnings and Net income do not open (computed rows).
- **Customize** (core): Divide by 1000, Without cents, Negative numbers, red negatives; Columns: show Prior year, Change, % change. The group key columns (class and type ranks) are never listed (G7).
- **Live:** any post, void, account edit (name, number, type, parent) or Books settings change (fiscal start month, business name) re-runs the open report (topics of every collection the run and its lookups read).
- **States** (core): loading; error with Retry; timeout with Retry; no access. A book with no posted lines shows the three sections at 0.00, Retained earnings and Net income at 0.00 and Total liabilities and equity 0.00 (a layout report has no empty state).
- **Phone** (core wrap, `display.layouts` mobile): each row wraps onto two lines inside the table: the label; then Current · Prior year · Change. % change is not in the phone layout, so a phone does not show it. No sideways scroll.
- **Every width fits** (core column fit, spec v4): the label narrows with an ellipsis first; figure columns keep their full width (`minWidth: max-content`); where one line does not fit, a row wraps to the tablet layout (label, then the four figures). Desktop does not scroll sideways.
- **Who sees it:** every Books reader, any role, through the Books share sync; readers change params and Customize for the run, copy a link, and "Save as".

### Help

`books/help/reports.md` gains "## Read the Balance Sheet" (after "Read the General Ledger"): the outline, balances by normal side, the prior-year column (same day a year earlier) and Change / % change, Retained earnings and Net income and the fiscal year, Rows, opening an account into its lines, why Total assets equals Total liabilities and equity. Core `help/reports.md` gains each G extension (§4).

## 4. Checkpoint 0 — core extensions (branch `books/p5-balance-sheet` in `tinycld`, merged before checkpoint 1)

Re-verified against core `main` b021c3a (intake.md lists what the engine has). The General Ledger's F1 (`lookup` `pick: "sum"`), paged grouped reports and v4 column fit are merged and used here, not repeated. Each extension is general: it names no package; core tests use the fictional `zoo_*` collections and the `salesstub` e2e package. **No version bump (N1):** every field is optional and added at spec version 4; `Load` decodes strictly, so a server without these fields refuses a spec that uses one by its unknown key. Each extension carries its own builder round-trip (`lib/builder/draft.ts` keeps the field; a part the builder cannot edit stays read-only) and its row in `docs/packages.md` ("Fields added in version 4" table, after the column fit rows).

| # | Extension | Engine (Go, `core/server/reports/`) | Spec schema | Client lib / view | Builder UI | Help / docs |
|---|---|---|---|---|---|---|
| G1 | **Ragged levels:** `groups[].blank: "skip"` — a base row whose key at that level is blank skips the level: no group row and no subtotal for it; its rows sit directly under the parent group (or the layout section), one depth less per skipped level, and count in the parent's totals as direct children. Absent: a blank key forms a `(none)` group as today. Refused on the last group level and on a bucketed group. A fill below a skipped level fills under the parent the rows reach. | `levels.go` (the level's blank-key rows pass up), `assemble.go` (`groupWithLabel`: children of a skipped key emitted at the parent's depth), `fill.go` parent keys, `paging.go` keyset across a skipped level, `bind.go` refusals | `Group.blank` | `lib/spec.ts`; `lib/types.ts` `ResultRow.level` (the row's group level, sent by `assemble.go`, because with a skipped level `depth + 1` is no longer the level); `lib/rows.ts` `endsInSubtotal` reads `level`, not `depth + 1` (today an Equity account row at depth 1 would be taken for a class row whose subtotal follows, and lose its figures) | Group and sort, per level: "Rows with no <col>: put them in a '(none)' group / place them directly under the group above" | core help "Group by levels some rows do not have" |
| G3 | **Column heading from params:** `columns[].heading`: a formula over params and values only, computed once per run; the result's column carries `heading` (value and type). A date heading prints in the reader's short day form ("Nov 8, 2026"), text as is; `label` stays the column's name in Customize and the builder. An unset param gives no heading, and the header shows `label`. | `run.go` result columns gain `heading`; evaluation with the run's params; `bind.go` refuses any other leaf | `Column.heading` | `lib/types.ts` `ResultColumn.heading`; `ReportTable` header cell shows `heading` when set; `ReportCustomizePanel` keeps `label` | Columns: "Heading: from a parameter" (formula editor over params) | core help "Column headings that name a day" |
| G4 | **Computed rows inside a section:** a layout computed row may name `within: "<section id>"` (a section earlier in the layout): it shows after that section's rows, before the section's total, at depth 1, only while the section is open, and does not open. The section's total and the section's group row add it (G8 says how per column), and a later row's `{subtotal <section>}` reads the total with it. Its formulas may read lookups, params, values, earlier computed rows and sections other than its own; reading its own section is refused (it would read itself). | `layout.go` (`layoutLegs` adds the row's cells to its section's subtotal; the row is emitted inside the section), `assemble.go` section subtotal, `bind.go` refusals | `LayoutItem.within` | `lib/rows.ts` (computed row inside a section: depth 1, not openable, hidden when the section is folded) | Layout editor: "Add a row to this section" | core help "Statements: sections and computed rows" |
| G5 | **Hide empty groups:** `groups[].hideEmpty: true` — a group whose child groups the having hides, every one, and that has no direct child rows from a skipped level (G1), is hidden with its subtotal, as a having would hide it; totals above it add nothing it did not show. Refused on the last group level. | `levels.go` (the shown-children count feeds the level's shown flag), `assemble.go` | `Group.hideEmpty` | `lib/spec.ts` | Group and sort: "Hide a group when every row in it is hidden" | core help "Hide groups with nothing to show" |
| G7 | **Hidden key columns:** `columns[].hidden: true` — the column is computed (a group key, a sort key, a `{col}` read, a section key) but never shown: the result leaves it and its cells out, so it has no heading, no cell, no Customize entry, no `display` arrangement and no export column. Refused on the first column and on a column `display.columns` or `display.layouts` names. | `bind.go` refusals; `run.go`/`assemble.go` leave the column and its cells out of the result | `Column.hidden` | `lib/spec.ts` only (the result no longer carries the column) | Columns: "Use only to group or sort (do not show)" | core help "Group by a formula" |
| G8 | **Computed-row cells by column, and derived columns** (new; replaces the 2026-11-06 G2). (a) `layout[].cells: { <col id>: formula }` on a computed row: the row's cell in a column it names is that formula (same leaves as `formula`: `{subtotal}`, earlier rows, lookups, params); a number column it does not name takes `formula`; a row with neither `formula` nor `cells` is refused; not on the first column or a non-number column. (b) A **derived column** is a number column whose formula reads only `{col}`, `{param}`, values and scalar operators (no path, record, aggregate, lookup, outer or subtotal leaf). On a computed row, a derived column's cell is its formula over that row's own cells (unless `cells` names it). On a section total that holds a `within` row (G4), a derived column is computed from the total's own cells; every other number column adds the `within` row's cell. Today a derived column on a computed row reads the row's formula, so a percent column of "A + B" reads pct(A) + pct(B): (b) changes those cells for every layout report (no shipped report has a layout today). | `layout.go` (`layoutLegs`: per-column formula from `cells`; derived columns compiled over the row's cells in an outer select), `assemble.go` section totals, `bind.go` (derived-column test, refusals) | `LayoutItem.cells` | — (cells arrive as today) | Layout editor: per-column formula on a computed row ("This column: …") | core help "Statements: sections and computed rows" (cells, and how Change/percent columns compute on them) |

**Verdict: MAJOR → the lane holds `exclusive` for checkpoint 0 (N4; taken at the design gate 2026-11-08). Core merge: pre-approved — the PR merges when its checks are green.** No version bump, no migration, no generator change, no removed or renamed export, but: G8(b) changes the cells existing layout specs return for derived columns, G1 and G4 change the row tree a run returns (rows at a parent's depth, computed rows inside a section), G3 and G7 change the result's columns — and every other report unit's core checkpoint 0 edits the same files (`levels.go`, `assemble.go`, `layout.go`, `run.go`). p5-journal-report (claimed by another lane) plans its own exclusive checkpoint 0 (J1 paged group rows) in `run.go`, `paging.go`, `levels.go`, `assemble.go`: the two run one after the other, and the second rebases. Build order: G7 → G1 → G5 → G3 → G4 → G8 → builder and help; writing-plans, then the human's plan review, then subagent-driven development, then the PR (the Trial Balance's order).

Core tests: Go unit tests per extension (G1: a blank key skipped on a middle level, the parent's subtotal adding the passed rows, a skip refused on the last level and on a bucket, paging across a skipped level, fill below a skipped level; G3: a date and a text heading, an unset param's heading absent, a path leaf refused; G4: a computed row within a section counted in its total and in a later row's `{subtotal}`, hidden with its folded section, a row reading its own section refused, `within` naming a later section refused; G5: a type group hidden when all its accounts are hidden, kept when one shows or a skipped row sits under it, refused on the last level; G7: a hidden key column absent from the result's columns and cells while its groups and sort apply, refused as the first column and when `display` names it; G8: `cells` per column with lookups at two param-derived days, a column it does not name taking `formula`, a derived Change and percent column on a computed row and on a section total with a `within` row, an existing top-level computed row's percent column now from its own cells, refusals); the shared formula table gains no row (no new operator); the rule-parity fuzz test covers ragged levels and `cells`; vitest for `lib/spec.ts` (every new field), the `draft.ts` round-trip of every new field, `rows.ts` for a computed row inside a folded section, the header cell's `heading`; e2e on `salesstub` (desktop and phone): a statement with a ragged level, a dated heading on two columns, a computed row inside a section with per-column cells and its total, an emptied type group hidden, no hidden-key column in the table or in Customize.

## 5. Data (Books)

No migration, no new collection, no source change: the sources of p5-trial-balance (`books.journal_lines`, `books.accounts`, `server/report_sources.go`) hold every field this report reads (`debit`, `credit`, `date`, `posted`, `memo`; `account` → `type`, `detail_type`, `number`, `full_name`; `entry` → `number`, `sequence`, `memo`).

### The Balance Sheet spec (`books/server/report_balance_sheet.go`, spec v4)

Built in Go from `account_types.json` with the Books spec helpers (`server/report_spec_helpers.go`: `path`, `fld`, `link`, `op`, `lit`, `prm`, `col`, `rec`, `profitAndLossTypes`, `creditNormalTypes`, plus the new `typesInGroup(group)`, and `accountLabel` — see §6). `PL` = `profitAndLossTypes()`; `CN` = `creditNormalTypes()`; `D` = `{param asOf}`; `D′` = `addMonths(D, -12)`. `CLASS` and `KIND` are two `case` tables built in Go from a Books-owned table in `report_balance_sheet.go` (a test checks that every type of `account_types.json` whose group is asset, liability or equity is in it):

| type | class (rank, label) | kind (rank, label) |
|---|---|---|
| bank | 1 Current assets | 1 Bank accounts |
| accounts_receivable | 1 Current assets | 2 Accounts receivable |
| other_current_asset | 1 Current assets | 3 Other current assets |
| fixed_asset | 2 Fixed assets | blank |
| other_asset | 3 Other assets | blank |
| accounts_payable | 4 Current liabilities | 4 Accounts payable |
| credit_card | 4 Current liabilities | 5 Credit cards |
| other_current_liability | 4 Current liabilities | 6 Other current liabilities |
| long_term_liability | 5 Long-term liabilities | blank |
| equity | blank | blank |

- `source` `books.journal_lines`; `version` `reports.CurrentVersion` (4).
- `params`: `asOf` (`asOf`, default `{ preset: today }`); `rows` (`choice`: `nonzero` "Non-zero" default, `active` "Active").
- Named pieces (inlined): `signed` = `if( in([account, type], CN), sub([credit], [debit]), sub([debit], [credit]) )`.
- `filter`: `and( eq([posted], true), lte([date], D), not(in([account, type], PL)), ne([account, detail_type], "retained_earnings") )` — P&L and retained-earnings lines are read only by the two computed rows.
- `columns`:
  1. `account` "Account" = path `[account]` (relation to `books.accounts`; the label column).
  2. `current` "Current", `heading` `D` (G3) = `coalesce( sum(signed), 0 )`.
  3. `prior` "Prior year", `heading` `D′` (G3) = `coalesce( sum( if( lte([date], D′), signed, null ) ), 0 )`.
  4. `change` "Change", `detail: "blank"` = `sub( {col current}, {col prior} )` (a derived column, G8).
  5. `pct` "% change", `format: "percent"`, `detail: "blank"` = `if( eq({col prior}, 0), null, mul( div({col change}, max({col prior}, sub(0, {col prior})), scale 4), 100 ) )` (no `abs` operator; scalar `max` of x and −x; a derived column, G8).
  6. `side` `hidden` (G7) = `case( in([account, type], typesInGroup("asset")), "asset", in([account, type], typesInGroup("liability")), "liability", "equity" )`.
  7. `cls` `hidden` = `CLASS([account, type])` (number rank, or null).
  8. `knd` `hidden` = `KIND([account, type])` (number rank, or null).
- `groups`:
  1. `section`: col `side`, `open: true`, `subtotals: true`.
  2. `class`: col `cls`, `label` = the class label `case` over `{col cls}`, `blank: "skip"` (G1), `hideEmpty: true` (G5), `open: true`, `subtotals: true`.
  3. `kind`: col `knd`, `label` = the kind label `case` over `{col knd}`, `blank: "skip"`, `hideEmpty: true`, `open: true`, `subtotals: true`.
  4. `byAccount`: col `account` (record group), `label` = `accountLabel(byAccount)` (`if( isEmpty({record byAccount [number]}), {record byAccount [full_name]}, concat({record byAccount [number]}, " ", {record byAccount [full_name]}) )`), `having` = `or( eq({param rows}, "active"), ne({col current}, 0), ne({col prior}, 0) )`.
- `layout`:
  - `{ section: assets, title: "Assets", key: "asset" }`, `{ section: liabilities, title: "Liabilities", key: "liability" }`, `{ section: equity, title: "Equity", key: "equity" }`;
  - `{ row: retainedEarnings, label: "Retained earnings", within: equity, cells: { current: RE(D), prior: RE(D′) } }`;
  - `{ row: netIncome, label: "Net income", within: equity, cells: { current: NI(D), prior: NI(D′) } }`;
  - `{ row: totalLE, label: "Total liabilities and equity", formula: add( {subtotal liabilities}, {subtotal equity} ) }`.
  - where `RE(X)` = `coalesce( lookup( source books.journal_lines, where and( eq([posted], true), lte([date], X), or( eq([account, detail_type], "retained_earnings"), and( in([account, type], PL), lt( fiscalYear([date]), fiscalYear(X) ) ) ) ), value sub([credit], [debit]), pick sum ), 0 )` and `NI(X)` = `coalesce( lookup( source books.journal_lines, where and( eq([posted], true), lte([date], X), in([account, type], PL), gte( fiscalYear([date]), fiscalYear(X) ) ), value sub([credit], [debit]), pick sum ), 0 )`. Change and % change on these three rows, and on Total Equity, are derived (G8).
- `sort`: `{col cls}`, `{col knd}`, `{record byAccount [number]}`, `{record byAccount [full_name]}`, then `[date]`, `[entry, sequence]` (opened lines; core applies a formula key that reads a row's fields to detail rows only).
- `detail`: `{ label: concat( [date], " · ", [entry, number], " · ", if( isEmpty([memo]), [entry, memo], [memo] ) ) }` (the Trial Balance's).
- `display`: `columns`: `account` `{ minWidth: "12ch" }` (one line, ellipsis); `current`, `prior`, `change`, `pct` `{ minWidth: "max-content" }`. `layouts`: `mobile` (tracks 3: `account` line 1 span 3; `current`, `prior`, `change` line 2); `tablet` (`minWidth` 600px, tracks 4: `account` line 1 span 4; `current`, `prior`, `change`, `pct` line 2). No desktop layout and no `oneLine` gate: core fits one line to the view and wraps to the tablet layout when it does not fit.

Why it holds: every account row's Current = its lines on or before D by normal side = the Trial Balance's figure for that account as of D by normal side; Retained earnings + Net income on D = the retained-earnings account plus every P&L line on or before D, which the Trial Balance shows on its retained-earnings and P&L rows; so Total Assets − Total Liabilities − Total Equity = 0 because every posted entry balances. The same holds on D′ for the Prior year column, whose filter rows (≤ D) include every line ≤ D′.

Pinned in `server/report_balance_sheet_test.go`: `CheckSources`, `Load`, `Validate`; `Run` as a Books reader (`readerInfo`) over a ledger built in the test (`newLedgerEnv`): the outline (sections, classes, kinds, ragged Equity and Fixed assets); signs (an asset, a liability, a contra asset, owner's draws); Total Assets = Total liabilities and equity in both columns; Retained earnings and Net income across a fiscal-year boundary (start months 1 and 7) for both D and D′; D on Feb 29; the class/type table covers every balance-sheet type; Rows Non-zero against Active; a type hidden when its accounts are, Fixed assets kept when Equipment and Accumulated depreciation net to zero; Change and % change on account, class, section, computed and Total liabilities and equity rows; drafts excluded; a void pair; the Current column of each account equal to the Trial Balance run's net for that account as of D, by normal side; no hidden key column in the result; a reader without Books access getting no rows.

## 6. Files (Books)

New: `server/report_balance_sheet.go` (+ `_test.go`), `tests/e2e/balance-sheet.spec.ts`, `tinycld/books/lib/balance-sheet-fixture.ts` (helix fixture: a static `RunResult` for the reference, the Trial Balance fixture's model; imported by the e2e spec for its constants, so tsc checks it).

Changed: `server/report_spec_helpers.go` (adds `typesInGroup(group)`; adds `accountLabel(group)` unless p5-journal-report merged it first, then uses it), `server/register.go` + `server/registrations_test.go` (hand-bound list), `tests/e2e/books-report-helpers.ts` (`openBalanceSheet`, `bsSnapshot`), `help/reports.md`, `tests/help-reports.test.ts`.

## 7. Tests (Books)

E2e `tests/e2e/balance-sheet.spec.ts`, titles prefixed `balance-sheet:`, desktop 1280 and phone 390×844 where the phone path differs; locators are core's ids (`report-param-asOf`, `report-param-rows`, `report-row-*`, `report-cell-<col>-<row>`, `reports-hub-row-*`, `report-document-*`) and core helpers (`openReportsHub`, `hubRow`, `rowOf`, `cellOf`, `pressToolbar`, `chooseParamOption`), plus checkpoint 0's new ids as core names them. Data is set up through the UI with unique memos and account names; rows read in one `page.evaluate` snapshot; no post dated before mid-2026 (books-settings.spec.ts holds a close date), and no assertion depends on the fiscal start month.

1. **Hub to report** (desktop, phone): Books sidebar Reports → Balance Sheet → header shows the business name, "Balance Sheet", "As of <today>"; chips As of (Today) and Rows (Non-zero); headings show today and the same day a year earlier.
2. **Outline and signs** (desktop): new Bank account B and Credit card account C; post debit B 250.00 / credit C 250.00: B shows 250.00 under Assets › Current assets › Bank accounts, C shows 250.00 under Liabilities › Current liabilities › Credit cards.
3. **Balances** (desktop): Total Assets equals Total liabilities and equity in Current and in Prior year (one snapshot).
4. **Net income and retained earnings** (desktop): post debit B 80.00 / credit a new Income account: Net income (Current) rises by 80.00 and the income account has no row; the seeded `PRIOR_YEAR_SEED` entry (Accounts receivable / Consulting income 3,000.00, two calendar years ago) counts in Retained earnings (Current), not in Net income.
5. **Prior year column** (desktop): As of Custom = a day one year after a seeded entry's day shows that entry's account in Prior year; Change reads Current − Prior year on that row and on its section total.
6. **Rows** (desktop): an account whose lines net to zero is hidden under Non-zero and shows 0.00 under Active; a type whose every account is hidden does not show.
7. **Open an account** (desktop): press B: its lines show labelled "<date> · <number> · <memo>", Change blank.
8. **Live** (desktop): page A open; page B posts to a new Bank account; page A shows it without a reload.
9. **Phone layout** (phone): a row wraps onto label, then Current · Prior year · Change; no sideways scroll.
10. **Fits** (desktop at 1280 and 1024): every heading and figure cell ends inside the table's right edge; no sideways scroll; no class or type rank column shows.

Vitest: `help-reports` (the new heading). Go: §5 pins.

## 8. Cut

- **Accrual / Cash toggle** — Books has no payments or allocations yet; cash basis is derived from them. The toggle belongs to p5-profit-and-loss and the payment units (Q7).
- **Accounts filter** — a balance sheet filtered to some accounts no longer balances; the Trial Balance and General Ledger keep it (Q6).
- **Rows "All"** — an account with no line has a zero balance on both days and adds nothing; listing it would need fill records under derived class and type groups (Q5).
- **A Compare param** — the prior-year columns are always computed and Customize hides them (Q1).
- **Sub-account nesting with rolled-up totals** — flat by full name, as the Trial Balance and General Ledger (Q10).
- **A subtotal label formula** — core's "Total " + label stays (Q11).
- **Press a line to open its entry** — report-to-transaction navigation is the p5-drill-down unit.
- **Exports, print, email** — p5-exports.

## 9. Platform notes

None new. Books adds no UI. Checkpoint 0's client parts (dated headings, computed rows inside a section) are core report-view parts on web and native.

## 10. Sparks carried

1. Nested outline with stepped totals: core `layout` sections, nested groups with `subtotals`, `groups[].open`, core `ReportRow`'s depth indent and ruled subtotal rows, plus G1 (ragged levels) and G5 (hide empty groups). No new token.

## 11. Non-goals

- No change to the Trial Balance's or the General Ledger's spec or revision.
- No new Books screen; no Books copy of report UI.
- No class/location, no multi-currency columns (Books is single-currency; the engine still groups money by currency).
- No percent-of-total column — not in the Books spec.
- No column params (the 2026-11-06 G2): the prior column's formula names its own day.
