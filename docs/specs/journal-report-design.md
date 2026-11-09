# Journal report on the report engine — design

Unit `p5-journal-report`, package `books`. **Approved at the design gate (2026-11-08): direction A; open questions Q1–Q9 as recommended** (Q1 build J1 in core checkpoint 0, MAJOR, the lane takes `exclusive`; Q2 heading "<number> · <type>"; Q3 This month to date; Q4 Period only; Q5 posted only, void pairs show; Q6 drill-down cut to p5-drill-down; Q7 date, posting order, sequence; Q8 line count cut; Q9 direction A). The core merge of the J1 PR is not pre-approved: the human is asked before it merges. §4 checked against core `main` @ b021c3af (after core PR #452, report performance). Written in helix unattended mode from the Books design spec §Scope ("Reports: … Journal …; one report shell (date presets, method toggle, filter chips, Customize panel, live apply, drill-down …); every report … is a published report of the core report engine"), the General Ledger design it follows (`books/docs/specs/general-ledger-design.md`), core `docs/packages.md` "Report sources" and core `help/reports.md` (spec v4, column fit). Built against books `books/p5-general-ledger` @ f1b6096 and core `main` @ 047f71cb. The binding rule of 2026-11-01 applies: *design without the limits of what reports support today; what is missing is built in core first.* The one engine gap is a core extension in checkpoint 0 (§4). Decisions marked "(Qn)" are the human's answer to the packet's open question n. Direction **A** of the artboards is written here.

## 1. Goal

Books ships the Journal as an engine report: every posted entry of a period as one block, headed by its number and type, listing its lines with date, account, name, description, debit and credit, and closed by a total row whose Debit and Credit are equal; and core's engine gains paged group rows, so a report with one group per record (an entry, an invoice, an order) has no 5,000-group cut.

## 2. Where it lives

- **Report:** core's report view `/a/reports/<id>`, from core's hub `/a/reports?package=books` (the Books sidebar "Reports" entry). Books adds no screen and no route.
- **Server:** Books' Go `Register(app)` registers the shipped report after the General Ledger. The share sync (`server/report_shares.go`) already shares every `books.*` shipped report with every Books reader; it needs no change.
- **Core:** checkpoint 0 (§4) on branch `books/p5-journal-report` in `tinycld`, merged before checkpoint 1 after the human approves the merge.

## 3. Behavior

### The report

- **Title** "Journal"; hub description "Every posted entry with its debit and credit lines, for a period." Shipped key `books.journal`, revision 1, **unpublished** and shared with every Books reader (the Trial Balance's and General Ledger's model).
- **Document header:** the Books business name, "Journal", the period in words ("October 1 – 31, 2026"; "All dates" for the open range).
- **Params:** one chip, **Period** (`period`, `dateRange`), default **This month to date** (Q3); core's presets, All dates and Custom. Chip `report-param-period`. No other param (Q4).
- **Rows read:** posted journal lines (`posted = true`) dated in the period. Drafts never show. A voided entry and its void reversal both show, each as its own block (Q5).
- **One block per entry** (a record group on the line's `entry`), every block **open when the report opens** (core `groups[].open`). A press on a block heading folds it; Expand all / Collapse all in core's toolbar. A folded block's heading shows the entry's Debit and Credit totals (core: a closed group row carries its cells).
- **Block heading** (the group label, Q2): "<number> · <type>", for example "JE-41 · Journal entry", "TR-7 · Transfer", "JE-12 · Void reversal of JE-12", "JE-15 · Reversal of JE-12", "JE-3 · Opening balances". The type is the Books register's label (`entry_type_labels.json`, the GL's `typeLabelCase` rule). An entry with no number shows the type alone.
- **Block order:** entry date, then posting order (`posted_at`), then entry number sequence (Q7).
- **Line rows**, in line position order (the order of the lines in the entry form):
  - **Entry / Date** (the label column): the line's date. The heading reads "Entry / Date" because block rows show the entry and line rows the date.
  - **Account:** "<number> <full name>" ("6100 Supplies:Job materials"); the full name alone when the account has no number.
  - **Name:** the customer or vendor on the line (the GL's party model); blank when it has none.
  - **Description:** the line's memo, else the entry's memo (the register's rule, the GL's column).
  - **Debit**, **Credit:** the line's amounts; a zero side is blank.
- **Block total row:** "Total <number> · <type>" (core `subtotals`), with the entry's Debit and Credit sums. They are equal for every posted entry.
- **Report Total row:** "Total": Debit and Credit sums of every line shown (equal).
- **A large period** (J1, Q1): the report is one document that pages as it scrolls, block after block. The first answer holds the first page of blocks and their lines in document order; the view asks for the next page when the reader nears the end. A block longer than one page continues on the next page (core F7). No 5,000-entry cut; the Total row shows with the last page.
- **Sort by a column heading** (core F8): pressing Date, Account, Name, Description, Debit or Credit sorts the lines inside each block for this view (press again: descending; a third press returns to the report's order). Blocks keep their order. The sort goes into the copied link.
- **Customize** (core): Divide by 1000, Without cents, Negative numbers, red negatives; Columns: show Account, Name, Description, Debit, Credit.
- **Live:** any post, void, account edit, customer or vendor rename, or settings change re-runs the open report (topics of every collection the run read).
- **States** (core): loading; error with Retry; timeout with Retry; empty "No rows for <period>" with "Show this fiscal year"; no access.
- **Phone** (core wrap, `display.layouts` mobile): each line row wraps onto three lines inside the table: date and account; then name and description; then debit and credit. Block headings and total rows: label and figures on one line when they fit, else label, then figures. No sideways scroll.
- **Every width fits** (core spec v4 column fit): no column is cut off at the right edge, and nothing the reader needs is cut: dates, Debit, Credit, the block heading and Total labels never show an ellipsis (core runs group and total labels across empty cells). Account keeps an ordinary account name of about 20 characters whole and Name about 16 (Name is 16 characters wide at every width, so a longer name ends in an ellipsis; phase 4, plan D1); Description takes the most of the spare room and narrows with an ellipsis first. When the one line does not fit, the row wraps to the tablet layout (≥ 600 px), else the mobile layout. Desktop does not scroll sideways.
- **Who sees it:** every Books reader, any role, through the Books share sync; no change. Readers change the period, sort and Customize for the run, copy a link, and "Save as".

### Help

`books/help/reports.md` gains "Read the Journal" (blocks and their heading, line columns, totals that balance, posted only with void pairs, Period with All dates, sorting inside a block, folding, long periods loading as you scroll, phone and tablet arrangement); "Who sees Books reports" names the Journal beside the Trial Balance and the General Ledger. Core help `help/reports.md` and `docs/packages.md` change for J1 (§4).

## 4. Checkpoint 0 — core extension J1 (branch `books/p5-journal-report` in `tinycld`, merged before checkpoint 1)

General: names no package; core tests use the fictional `zoo_*` collections and the `salesstub` e2e package. **No spec schema change** (spec stays version 4): J1 changes the run contract only.

| # | Extension | Engine (Go) | Run contract | Client lib / view | Builder UI | Help / docs |
|---|---|---|---|---|---|---|
| J1a | **Paged group rows.** A grouped report (not a layout report, not a pivot) reads its group rows a page at a time in document order, not whole. A page holds up to `options.limit` rows (default 200, at most 1,000) counting group, opening, detail and subtotal rows, in document order; a closed group counts as its one row. `page.next` carries the group path (each level's sort-key values and key) and, inside an open group, the detail keyset (F7's). The 5,000 cap on group rows (`rowCap`, `capLevelRows`) goes for grouped reports; it stays for pivots, nests and layout reports (a statement needs every section for its computed rows). `having` and `fill` apply before the keyset. The Total row is computed over every row the filter keeps, in a statement of its own, and every page still ends with it (the current contract). The cursor fingerprint already covers sort keys, viewer sort and group levels; it gains the fold state (J1b). | `run.go` (`groupPass`, `capLevelRows`, `runLimits`, and `groupStatement` with a keyset and limit per page; it takes a `limit` today, `rowCap+1`), `paging.go` (`cursorOf`, `readCursor`, `keysetAfter`, `keysetCond`: keyset over group levels before the detail keyset), `assemble.go` (`assemble`, `pageWindow`: assemble the page's slice of groups), `levels.go` (`level`: the level row reads that `groupStatement` builds on), `fill.go` (`parentKeys`, `fillKeys`: a level's parent keys under the fold state) | `page.next` on every grouped result that has more rows; the `rowCap` notice no longer fires for a grouped report | `lib/run-client.ts` next page for grouped results already merges by row id; `lib/rows.ts` fold state keeps working across pages; `ReportTable` `onEndReached` unchanged | — | packages.md: the paging paragraph ("The group rows themselves are read whole, at most 5,000." goes: group rows page too) and "What a report returns" ("Group, pivot and nest results stop at 5,000 rows" becomes pivot, nest and layout results only); core help "When columns do not fit" paragraph on long reports ("A long report loads more rows as you scroll, also when it has groups" already; add "however many groups it has") |
| J1b | **Fold list.** Run option `options.collapse: [groupKey]` (at most 5,000): groups closed by the reader under a level that is open by default or under `expandAll`. Today the client sends every other open group in `options.expand` (capped at 5,000), so a fold in an open report with more than 5,000 groups is refused. `expand` keeps its meaning for levels that are closed by default. | `run.go` `Options.Collapse` (beside `Expand`/`ExpandAll`), `parseExpansion`, `expansion.has` | `options.collapse` | `lib/rows.ts` (`Expansion` gains `collapsed`; folding a group under an open level or Expand all adds it to `collapse` instead of listing the open ones), `lib/run-client.ts` (`RunOptions` gains `collapse`, sent as `body.options.collapse`; `rowsKeyOf` leaves it out of the rows key as it does `expand`), `lib/view-url.ts` no change (the fold state is not in the link) | — | packages.md: "`options.expand` lists at most 5,000 group keys" gains `options.collapse` (same cap) |

**Verdict: MAJOR by the auto-helix rule.** After the design gate the human released `exclusive` for J1: the lane does not take it ("the others will not conflict"). The core merge still needs the human's approval. J1a changes the run contract of every grouped report (group rows page; the group-row cap goes) and J1b adds a run option. No spec version change, no core migration, no generator change, no removed or renamed export.

**Core PR #452 (report performance, merged after the packet's core 047f71cb).** The packet's `levels.go` location of `groupStatement` was wrong: it is in `run.go` at 047f71cb and still is (the table above is corrected). #452 changed `run.go`, `levels.go`, `record.go`, `detail.go`, `fill.go`, `stmt.go` and `options.go`; J1 builds on what it added and must not undo it:

- **Group records joined once per level** (`record.go` `recordJoins`: `newRecordJoins`, `column`, `reader`, `from`; used by `levels.go` and by `run.go` `detailSelect`'s `windowFrame.recs`). The Journal's group label and sort read `{record byEntry …}`; the group-level keyset of J1a orders and compares on those joined columns, not on a subquery per read.
- **A level's lookups computed once per group row** (`levels.go` `lookupsIn`, `lookupLayers`, `rowsFrom`) and **a repeated detail lookup compiled once** (`detail.go`, `windowFrame.lookupOf`). A paged level statement keeps these layers; the keyset and limit go on the level's outer select.
- **Fill keysets loop over their parent rows first** (`fill.go` `parentKeys`, `fillKeys`): `fill` groups at a page boundary (a J1a test) page through this plan.
- **Topics from rule CTEs, cached per run** (`stmt.go` `stmt.topics`; `readRows` takes the run's `ruleTopics` map; the `checkTopics` test hook in `topics_check_test.go`). The per-page group statement and the separate Total statement of J1a both go through `rn.query`, so their topics stay complete and the topics check covers them.
- **Pinned output** (`ledger_scale_test.go` with `testdata/ledger_scale.golden.json`, `ledger_guard_test.go`, `fillplan_test.go`, `balance_shape_test.go`). A grouped report whose groups fit one page returns the same rows after J1; the golden changes only where it pages, and the reason is written in the test.

Core tests: Go unit tests — J1a: a grouped report with more groups than one page pages through every group in order with no repeat and no gap (closed groups; open groups; two levels; an open group whose details span a page boundary; `having` hiding groups at a boundary; `fill` groups at a boundary; viewer sort), the Total on every page equals the whole report's, a cursor from another fold state is refused, a 6,000-group report returns every group and no `rowCap` notice, a pivot and a layout report still cap at 5,000 with the notice; J1b: `collapse` under an open level and under `expandAll`, more than 5,000 refused, `collapse` with `expand` together. The rule-parity fuzz test covers paged group rows. Vitest: `rows.ts` fold state builds `collapse` under open levels and Expand all; `run-client.ts` merges grouped pages that end between groups. E2e on `salesstub` (desktop and phone): a grouped report with more groups than one page loads the next groups on scroll, the Total shows at the end, a fold of one group near the end keeps every other group open after the next page loads. Existing core report e2e that count on the 5,000 notice for a grouped report change to the new behavior.

## 5. Data (Books)

No source change: `books.journal_lines` already has `position`, `date`, `posted`, `memo`, `debit`, `credit` and the links `entry`, `account`, `customer`, `vendor`; `books.journal_entries` has `number`, `sequence`, `origin`, `doc_type`, `memo`, `date`, `posted_at` and the link `reverses` (p5-general-ledger). No migration, no ledger change.

### Shared helpers (`books/server/report_spec_helpers.go`)

- `entryTypeLabel(read func(...string) *reports.Node)`: the type-label `case` of `entry_type_labels.json`, over an entry read through `read`. The General Ledger calls it with `fld("entry", …)` (a line's path), the Journal with `rec("byEntry", …)` (the group's record). It replaces `typeLabelCase` in `report_general_ledger.go` (moved, same output; the GL spec's JSON is unchanged, pinned by its test).
- `accountLabel(read)`: "<number> <full name>", the full name alone with no number; the General Ledger's group label moves to it (same output).
- `blankZero` moves here from `report_general_ledger.go`.

### The Journal spec (`books/server/report_journal.go`, spec v4)

- `source` `books.journal_lines`; `version` 4.
- `params`: `period` (`dateRange`, default `{ preset: thisMonthToDate }`).
- `filter`: `and( eq([posted], true), between([date], {param period}) )`.
- `columns`:
  1. `entry` "Entry / Date" = `[entry]` (a relation to `books.journal_entries`)
  2. `account` "Account" = `accountLabel` over `[account, number]`, `[account, full_name]`
  3. `name` "Name" = `coalesce( [customer, display_name], [vendor, display_name] )`
  4. `description` "Description" = `if( isEmpty([memo]), [entry, memo], [memo] )`
  5. `debit` "Debit" = `blankZero([debit])`, `rollup` = `sum([debit])`
  6. `credit` "Credit" = `blankZero([credit])`, `rollup` = `sum([credit])`
- `groups`: `[{ id: byEntry, col: entry, open: true, subtotals: true, label: if( isEmpty({record byEntry [number]}), T, concat({record byEntry [number]}, " · ", T) ) }]` where `T` = `entryTypeLabel` over `{record byEntry …}` (to-one record paths, `[reverses, number]` included).
- `sort`: `{record byEntry [date]}`, `{record byEntry [posted_at]}`, `{record byEntry [sequence]}` (group keys), then `[position]` (detail rows).
- `detail`: `{ label: [date] }`.
- `display`:
  - `columns`: `account` `minWidth: "20ch"`, `name` `minWidth: "16ch"`, `maxWidth: "16ch"` (phase 4, plan D1: core shares spare room by what each column lacks of its natural width, so without a cap a long Name drew wider than Description at 1024 and 1280; capped, Name stays 16 characters and Description takes the most of the spare room), `description` `flexGrow: 2`, `debit` and `credit` `minWidth: "max-content"`. No `oneLine.minWidth` unless phase 3 pass 2 measures a cut column at 900, 1024 or 1280; then it is set to the narrowest width where all six fit, and the reason is written here.
  - `layouts`: mobile (3 tracks): line 1 entry/date (1) · account (2); line 2 name (1) · description (2); line 3 debit (`start: 2`) · credit (`start: 3`), so Credit ends at the right edge (the GL's phone pattern; phase 3 reference correction — with tracks 1 and 2 the figures stopped short of the edge). Tablet (`minWidth: "600px"`, 12 tracks): line 1 entry/date (2) · account (4) · debit (3) · credit (3); line 2 name (4) · description (8).

Why it holds: every line of a posted entry is posted with the entry's date (posting stamps `date` and `posted` on each line, p1-ledger), so a period never splits an entry; each block holds all its entry's lines and its Total row's Debit equals its Credit. Pinned in `server/report_journal_test.go`: `CheckSources`, `Load`, `Validate`; `Run` as a Books reader over a ledger built in the test (`newLedgerEnv`): block order by date then posting order; lines in position order; heading for a journal entry, a transfer, a reversal, a void and its void reversal (both blocks, same number), opening balances; Account label with and without a number; Name from a customer and a vendor; Description from the line memo and from the entry memo; block totals equal; report Total; drafts excluded; a line outside the period excluded; All dates; a period with more entries than one page pages across a block boundary (J1); a reader without Books access gets no rows. The GL spec JSON is pinned unchanged after the helper move.

## 6. Files (Books)

New: `server/report_journal.go` (+ test), `tests/e2e/journal-report.spec.ts`, `tinycld/books/lib/journal-report-fixture.ts` (helix fixture; static `RunResult` for the reference, the General Ledger's model).

Changed: `server/register.go` (`reports.RegisterShipped(journalShipped())`; + `registrations_test.go` if its hand-bound list counts shipped reports), `server/report_spec_helpers.go` (helpers above), `server/report_general_ledger.go` (uses the moved helpers; spec unchanged), `tests/e2e/books-report-helpers.ts` (`openJournal`), `help/reports.md`, `tests/help-reports.test.ts`.

## 7. Tests (Books)

E2e `tests/e2e/journal-report.spec.ts` (titles prefixed `journal-report:`), desktop 1280 and phone 390×844 where the phone path differs; locators are core's ids (`report-param-period`, `report-row-*`, `report-cell-<col>-<row>`, `report-empty`, `reports-hub-row-*`, `report-document-*`, `report-sort-<col>`, `report-table` with `data-layout` / `waitForTableFit`). Data is set up through the UI with `uniqueName`; rows read in one `page.evaluate` snapshot; no post dated before mid-2026 (books-settings.spec.ts holds a close date): entries are dated `GL_DAY_1` / `GL_DAY_2` (`books-report-helpers.ts`) or today.

1. **Hub to report** (desktop, phone): Books sidebar Reports → Journal → header shows the business name and "Journal"; chip Period (This month to date).
2. **Block, lines, totals** (desktop): post a 3-line entry (two debits, one credit, one line with a line memo, one with a customer) dated `GL_DAY_1`; Period Custom `GL_DAY_1`–`GL_DAY_1`: its block heading reads "<number> · Journal entry"; its lines show in form order with date, "<number> <name>" accounts, the customer's name, the line memo and the entry memo; its Total row reads "Total <number> · Journal entry" with equal Debit and Credit.
3. **Order and types** (desktop): a transfer posted after it on the same day shows below it as "TR-<n> · Transfer"; a void of the entry shows the entry's block and a "<number> · Void reversal of <number>" block; drafts do not show.
4. **Report Total** (desktop): the Total row's Debit equals its Credit and equals the sum of the block totals shown.
5. **Fold** (desktop): pressing a block heading folds it and its heading shows the entry's Debit and Credit; Collapse all / Expand all.
6. **Sort by heading** (desktop): press Debit: lines reorder inside each block, blocks keep their order; the URL keeps the sort; press twice more returns the report's order.
7. **Long block** (desktop): Period Custom over the seeded long section (`GENERAL_LEDGER_LONG_SECTION`, two entries of 131 lines, 130 and the offset): the first page (200 rows, J1) holds the first block and part of the second; scrolling to the end loads the rest of the second block, then the Total (phase 4, plan D3).
8. **Live** (desktop): page A open; page B posts an entry in the period; page A shows the new block without a reload.
9. **Phone layout** (phone): a line row wraps onto three lines; no sideways scroll.
10. **Fits at every width** (desktop at 1280 and 1024, and 900): every heading and cell of Debit and Credit ends inside the table's right edge; no sideways scroll; `data-layout` is the one line where phase 3 measured it fits.
11. **Empty** (desktop): a Custom period with no posted line shows "No rows for <period>" and "Show this fiscal year".

Vitest: `help-reports` (the new section). Go: §5 pins, helper move (GL JSON unchanged).

## 8. Cut

- **Line count in the block heading** ("143 (2)") — the lines show under the heading; the GL dropped it too (Q8).
- **Press a line to open its entry** — report-to-transaction navigation is the p5-drill-down unit (Q6).
- **Exports, print, email** — p5-exports.
- **Accounts, type or name filters** — an Accounts filter would show part of an entry, and its block total would no longer balance; a type filter is not in the Books spec for the Journal (Q4).
- **Density control ("Compact | 100%")** — core's report view has one row density, which the GL and Trial Balance use; no Books report asked for another.
- **Refresh button** — the report is live.
- **"Ask a question", "Add note", run timestamp footer** — not in the Books spec.
- **Accrual / Cash toggle** — not in the screenshot; the Journal lists entries as posted.

## 9. Platform notes

None. Checkpoint 0's client part (fold list in `rows.ts`, paged grouped results in `run-client.ts`) is shared TS used by core's report view on web and native.

## 10. Sparks carried

1. Each transaction reads as one balanced block: core record group on `entry`, `open: true`, `subtotals: true`, Debit/Credit `rollup: sum`; core `ReportRow` subtotal style. No new token.

## 11. Non-goals

- No change to the General Ledger's or Trial Balance's output (the GL's helpers move, its spec JSON stays the same).
- No new Books screen; no Books copy of report UI.
- No multi-currency columns (Books is single-currency; the engine still groups money by currency).
