# Expenses by Vendor — design

Unit p5-expenses-by-vendor · package `books` · feature `expenses-by-vendor`. Draft for the design gate: direction **A** and every answer marked (Qn) are the packet's recommendations, not yet approved. Built against books `books/p5-vendor-balance`@2b52d19f (contains `origin/main`@ced66e9c) and core `books/p5-vendor-balance`@f5415b15. Source of scope: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Reports: … sales by customer / by product, expenses by vendor …. Every report … is a published report of the core report engine"). The models are the Sales by Customer (`docs/specs/sales-reports-design.md`), the Vendor Balance (`docs/specs/vendor-balance-design.md`) and the Profit and Loss (`docs/specs/profit-and-loss-design.md`). A mark (Qn) names the packet's question n.

## 1. Goal

A shipped Books report that shows what the business spent with each vendor in a period, and that opens a vendor into the expense lines behind its figure.

## 2. Where it lives

- A shipped report `books.expenses_by_vendor`, title **Expenses by Vendor** (Q8), description "What you spent with each vendor in a period, from posted transactions on expense accounts." It opens in core's report view (`/a/reports/<id>`) and is listed in the Books Reports hub (`/a/reports?package=books`). Like every `books.*` shipped report it is `Unpublished` and shared with every Books reader by `server/report_shares.go` (its filter `shipped_key ~ 'books.%'` covers the new key).
- The Vendors list's **Reports** menu (Books `ShippedReportsMenu`, test id `vendors-reports`) gains a third item **Expenses by Vendor** (test id `vendors-reports-expenses`), after Vendor Balance and A/P Aging (Q9; the Customers menu has Sales by Customer in the same place), through `useShippedReportHref('books.expenses_by_vendor')`. An item whose report is not found is not drawn.
- No new Books screen and no new route.

## 3. Behavior

- **What counts (Q2).** The report reads the posted lines on accounts of the types Cost of goods sold, Expense and Other expense (the `expense` group of `server/account_types.json`), dated in the period. A line's figure is its debit minus its credit. Books names the vendor of a purchase document on every line of its entry (`server/document_posting.go`), so the expense lines of a bill, an expense and a vendor credit carry the vendor; a journal entry line carries the vendor its Name column holds. A draft or a void document has no posted line that counts; a void's reversal lines cancel the original. A line on an asset, liability, equity or income account never counts: a bill that buys equipment on a fixed asset account is not an expense.
- **Sign (Q2).** A figure is positive when it is an expense. A vendor credit and a refund of an expense credit the expense account, so each shows below zero and lowers its vendor's figure. A vendor's figure can be below zero (a period with only a vendor credit); the row shows.
- **Method (Q3).** A **Method** choice, **Accrual** (default) or **Cash**, as the Profit and Loss has (Books `methodParam()`, `basisFilter()` on `books.basis_lines`). On Accrual a bill counts on its date. On Cash a bill counts when it is paid, by each payment's share, and an expense counts on its date on both. The document header prints "Accrual basis" or "Cash basis".
- **Tie-out.** For the same period and Method, with no Vendor picked, the report's Total equals Cost of goods sold + Expenses + Other expenses of the Profit and Loss.
- **Rows.** One level: the vendor. Vendors have no parent, so there is no family row and no subtotal row. The report ends in one Total row.
- **Columns (Q5).** **Vendor** (the label), **Total** (the sum of debit minus credit) and **% of expenses** (the row's Total ÷ the report's Total × 100, 2 places; core `percentOfTotal`). % of expenses is blank on an opened line and 100.00% on the Total. A row below zero has a share below zero. When the report's Total is zero the column is blank on every row. A vendor at 0.00 under Rows = With activity, in a report whose Total is not zero, shows 0.00% (core `tc_pct`; phase 4, from the code).
- **No vendor (Q4).** Expense lines that name no vendor form one row "No vendor", after every vendor under both Order choices: an expense with no payee, a journal entry line with no name, and a line that names a customer (a write-off's bad debt line). It opens into its lines like a vendor row. With vendors picked in the filter it does not show.
- **Opening a vendor (Q6).** A press on a vendor row opens it in place into one row per posted expense line, labelled "<date> · <type> <number> · <account> · <description>": the date as its ISO day; the type and number as in the Vendor Balance ("Bill 1042", "Expense 57", "Vendor credit 12", "Journal entry 88"; a reversal's label holds its number once); the account as "<number> <full name>", or the full name alone when it has no number (Books `accountLabel()`); the description from `lineDescriptionFormula()`, left out with its " · " when blank. The line's debit minus credit is under Total; % of expenses is blank. The rows are in date order, then posting order (`entry.posted_at`), then `position`. They add up to the vendor's Total. On Method = Cash the rows are the rows of `books.basis_lines` on that basis (`server/cash_basis.go`; phase 4, from the code): each expense line of a bill, a vendor credit or a write-off, then the row that takes it out of the cash basis, with the same date, type, number and account, the opposite figure, and the description "Unpaid bill (cash basis)" ("Unapplied vendor credit (cash basis)", "Write-off (cash basis)"); and, for each bill payment, vendor credit application or vendor refund, one row for each expense line of the document it pays, with that line's share of the paid amount, on the payment's date, labelled with the payment's entry ("Bill payment 317"; an application: the vendor credit's entry), the line's account, and the description "Bill 1042 paid (cash basis)" (a bill paid by a vendor credit: "Bill 1042 paid by vendor credit (cash basis)"; the vendor credit's own lines: "Vendor credit 12 applied (cash basis)" or "Vendor credit 12 refunded (cash basis)"). A void's reversal lines have take-out rows too. An expense and a journal entry line have one row on both Methods. A cash-basis row carries its line's vendor and account, so it is under the same vendor. A line and its take-out row have the same date, posting time and position: the ledger line is first (a last sort key on `layer`). The rows still add up to the vendor's Total.
- **Opening a transaction.** A press on an opened line opens its document's read view, or the journal entry (core `detail.open` with Books `entryOpenPath()`): beside the report at 1360 px and wider where Books registers a report panel for the path, else as its own screen (p5-drill-down, unchanged).
- **Params (Q7).**
  - **Period** (core `dateRange`), default **This fiscal year to date**. Core's period picker offers All dates.
  - **Method** (above).
  - **Rows** (choice): **Non-zero** (default) shows a vendor whose Total is not 0; **With activity** also shows a vendor whose lines of the period add up to 0 (a bill and its void in one period). Core `groups[].having` on the vendor level.
  - **Vendor** (Books `vendorsParam()`: multiple, every vendor by name, inactive ones included). Unset = every vendor and the No vendor row. With vendors picked, the Total is the picked vendors' total, and % of expenses is the share of that total. The document header prints "Vendor: …" for the picks.
  - **Order** (choice): **Name** (default; by name, ignoring case) or **Largest expenses** (by Total, largest first).
- **Inactive vendors.** An inactive vendor with expenses in the period shows; its row is muted (core `groups[].muted`) and its label ends with " (inactive)" (Books `vendorGroup()`).
- **Heading.** The Books business name, "Expenses by Vendor", the period in words, the basis line, and "Vendor: …" for picked vendors (core `ReportDocumentHeader`, `Source.Heading`, `params[].header`).
- **Empty.** A period with no posted expense line shows core's empty report text for the period (`emptyMessage`) and no rows.
- **Live.** A post or a void of a bill, an expense, a vendor credit, a bill payment or a journal entry, a vendor rename, an account type change, or a Books settings change re-runs an open report (the run's topics: `books_journal_lines`, `books_cash_basis_lines`, `books_accounts`, `books_vendors`, `books_journal_entries`, `books_settings`).
- **Loading, error and Retry, refresh, Customize, Save as, copy link, share and the Export menu (CSV, Excel, PDF, email):** core's report view, unchanged. PDF writes the rows the view shows with their folds; CSV and Excel open every vendor, so each vendor is followed by its expense lines.
- **Phone.** A phone arrangement (`display.layouts`, width `mobile`, 2 tracks) puts the name on line 1 (span 2) and Total and % of expenses on line 2, as the Sales by Customer. A long vendor name and an opened line's label wrap to at most three lines (`whiteSpace: "normal"`, `lineClamp: 3`); the figures are never cut (`minWidth: "max-content"`). Phase 3 pass 2 measures `oneLine.minWidth` for this report's own columns at 375 and 390; it does not copy the Sales by Customer's value.
- **Performance (Q10).** On the A/P Aging's L dataset (500,000 journal lines, 2,000 vendors), each run of the report meets the time bars and each SQL statement of each run meets the query-plan bars of §8, and the measured results are in the helix ledger.
- **Help.** `help/reports.md` gains "Read the Expenses by Vendor report": what counts (posted lines on Cost of goods sold, Expense and Other expense accounts, in the period, on the chosen basis), that a vendor credit lowers a vendor's figure, why the Total equals the three expense sections of the Profit and Loss for the same period and basis, what the No vendor row is, what % of expenses is, how to open a vendor and a transaction, the Rows and Order choices, and when to read the Vendor Balance instead (what is still owed). Its "Who sees Books reports" list gains the report. `help/vendors.md` names the new menu item and links to the section.

## 4. Data

Collections read (none new, no migration unless §8 needs an index): `books_journal_lines`, `books_cash_basis_lines`, `books_journal_entries`, `books_accounts`, `books_vendors`, `books_settings` (heading, currency, fiscal month).

Report sources: unchanged. `books.basis_lines` (the union of the ledger lines and the cash-basis rows, each with `layer`) has the `vendor`, `account` and `entry` links and `debit`, `credit`, `date`, `posted`, `position`; `books.vendors` has `display_name` and `inactive`; `books.accounts` has `type`, `number`, `name`. The report does not read the bill, expense or vendor credit line collections: the ledger lines hold the same amounts with the account each one posted to, journal entries included, and only they tie out to the Profit and Loss.

The report spec (`server/report_expenses_by_vendor.go`: `expensesByVendorKey`, `expensesByVendorShipped()` with Revision 1 and `Unpublished: true`, `expensesByVendorSpec()`), base `books.basis_lines`:

- params: `period` (`ParamDateRange`, default preset `thisFiscalYearToDate`); `methodParam()`; `rowsParam()`; `vendorsParam()`; `order` (choice `name` default, `amount` "Largest expenses");
- filter: `basisFilter()` and `posted = true` and `date between period` and `account.type in typesInGroup("expense")` and `vendorKey in vendors`;
- net = `debit − credit`;
- columns: `name` (Vendor; the `vendor` link), `amount` (Total; `sum(net)`), `pct` (% of expenses; `percentOfTotal(amount)`, scale 2, format percent, `detail: "blank"`), hidden `vendorKey` (the `vendor` link);
- groups: `vendorGroup()` with `HideEmpty` off (core refuses `hideEmpty` on the last level, as `vbGroup()` records) and `having`: `balanceRowsHaving(net)` (`rows = "activity"` or `sum(net) ≠ 0`);
- sort: `vendorSortBy("amount", net, expenseLineKeys()...)` — the line keys `date`, `entry.posted_at`, `position` (`balanceLineKeys()`), then the ledger layer before the cash layer (they order the opened rows only), No vendor last, under Largest expenses the vendor's `sum(net)` descending, then `lower(display_name)`;
- detail: label `expenseDetailLabel()`, open `entryOpenPath()`;
- display: `name` wraps to three lines, `amount` and `pct` `minWidth: "max-content"`, a `mobile` arrangement of 2 tracks (`name` line 1 span 2; `amount`, `pct` line 2), `oneLine.minWidth` measured in phase 3 pass 2.

Shared helpers in `server/report_spec_helpers.go` (Q12):

- used as they are: `vendorsParam()`, `vendorGroup()`, `methodParam()`, `basisFilter()`, `typesInGroup()`, `balanceRowsHaving()`, `balanceLineKeys()`, `lineEntryTypeLabel()`, `lineDescriptionFormula()`, `accountLabel()`, `entryOpenPath()`;
- `vendorSortBy(orderValue, net, inner...)`: `vendorSort()` with the Order value it compares as an argument. `vendorSort(net, inner...)` stays and calls it with `"balance"`, so the A/P Aging's and the Vendor Balance's spec JSON do not change (their sha tests prove it; their Revisions stay);
- `rowsParam()`: the Rows choice (Non-zero, With activity), taken out of `balanceParams()`, which then calls it; the Customer Balance's and the Vendor Balance's JSON do not change;
- `entryTypeNumber()`: the "<type> <number>" part of `balanceDetailLabel()` (a reversal's label holds its number once), taken out so `expenseDetailLabel()` uses it; `balanceDetailLabel()` calls it and its JSON does not change;
- new: `expenseDetailLabel()` (in the report's file).

Why the figures hold: each posted line is on one account and names at most one vendor, so it is in exactly one row; the Total adds every row, the No vendor row included, which is every posted line of the period on an account of the three types, on the run's basis. The Profit and Loss reads the same lines of `books.basis_lines` with the same `basisFilter()`, and its three expense sections add debit minus credit for the same three types.

Engine reach. Every part is existing core API with a Books run behind it: `ParamDateRange` and `between` (Profit and Loss), a union source with a constant per part (`books.basis_lines`), a choice param with `OptionsFrom` and `Header` (Vendor Balance), `groups[].muted` / `having` / `label` on one level (Vendor Balance), `sort[].formula` (Vendor Balance), `percentOfTotal` with `scale: 2` and `columns[].detail: "blank"` (Sales by Customer; core PR #492), `detail.label`, `detail.open`, `display.oneLine` / `layouts` / `columns` (Sales by Customer). No pivot, no `lookup`, no `inline`. Phase 4 pins with a Go test that `percentOfTotal` under `having` gives each shown row its share of the Total row the report prints; if core gives another figure, that is a core task, not a Books workaround. No core change is planned.

Files (Books):

- `server/report_expenses_by_vendor.go` + `_test.go`: `CheckSources`, `Load`/`Validate`, the spec sha, and runs (with `newLedgerEnv` and `readerInfo`) over a book with a bill on two expense accounts, a bill on a fixed asset account (not counted), an expense with a vendor and one with none, a vendor credit (below zero), a vendor whose only line in the period is a vendor credit (a row below zero with a share below zero), a manual journal entry on an expense account with a vendor and one with none, a write-off (its bad debt line in No vendor), a draft, a void bill in the period (Non-zero hides the vendor, With activity shows it at 0.00), a line outside the period, an inactive vendor, a part-paid bill on both Methods (Cash counts the paid share on the payment's date), both Order choices (No vendor last in both), the Vendor filter (Total and shares of the picks), a period whose Total is zero (blank % of expenses); the Total compared with the three expense sections of a Profit and Loss run for the same period, on Accrual and on Cash; a reader without Books access gets no rows.
- `server/report_expenses_by_vendor_scale_test.go` (§8).
- `server/report_spec_helpers.go`, `server/report_customer_balance.go` and `server/report_vendor_balance.go` only if an extracted helper's caller moves (their JSON unchanged), `server/register.go` (`reports.RegisterShipped(expensesByVendorShipped())`), `server/registrations_test.go`.
- `tinycld/books/lib/shipped-reports.ts` (`EXPENSES_BY_VENDOR_SHIPPED_KEY`), `tinycld/books/components/vendors/VendorsList.tsx` (the menu item).
- `help/reports.md`, `help/vendors.md`, `tests/help-reports.test.ts`, `tests/help-vendors.test.ts`.
- `tinycld/books/lib/expenses-by-vendor-fixture.ts` (phase 3 pass 2: a static `RunResult` and the display block for core `ReportView`, as `vendor-balance-fixture.ts`; the scratch route follows the kept model `~/tmp/tinycld/auto-helix-books/staging/p5-ap-aging/helix-mockup.tsx.txt`).
- `tinycld/books/seed.ts` (Q11): phase 4 reads which posted bills, expenses and vendor credits the seed has; it adds only what is missing of: an expense with no vendor, a vendor credit that lowers a vendor's expenses, an expense line for an inactive vendor, an expense for the long-named vendor, each on fixed 2026 dates. Before the edit, the build greps `tests/` and `tests/e2e/` for the accounts the new rows use, the Profit and Loss, Trial Balance and Balance Sheet figures and the vendor page totals, and updates each test that reads a changed figure. Phase 4 found: the seed already posts expense lines with no vendor (the journal entries of `seedVendorBalance` and of the opening book) and vendor credits that lower a vendor (Pacific Power, Office Supply World, Harbor Freight Logistics); it posts no expense line for an inactive vendor and none for the long-named vendor. The seed gains one journal entry on 6200 Software Subscriptions that nets to zero (plan decision D5), so no statement figure moves.

E2e (`tests/e2e/books-expenses-by-vendor.spec.ts`, with `expenses-by-vendor-helpers.ts`, `vendor-balance-helpers.ts`, `ap-aging-helpers.ts` (the vendor and bill helpers, the Vendor picker), `books-report-helpers.ts` and core's report helpers; a helper two specs need moves to a shared module and every caller moves to it): open from the hub and from the Vendors list's Reports menu; with the Vendor filter set to a vendor the test creates and a Custom period (so every asserted figure is its own and no figure depends on the fiscal month): a posted bill on two expense accounts shows the vendor's Total and 100.00% on the Total row; open the vendor and see both lines with their accounts; press one and land on the bill; a posted vendor credit lowers the Total and shows as a row below zero; a posted expense for the vendor adds a row; Method Cash shows the bill only by the share a bill payment paid; a void of the bill hides its lines, and Rows With activity keeps the vendor. One phone run (375 and 390) of an opened vendor, because the phone arrangement is a different display path: the two-line row and no sideways scroll. The spec posts documents in months that no report spec's empty-state test reads.

## 5. Cut

- An expense account level under each vendor (direction B): the opened line names its account; Save as and the builder group by account.
- Columns by month (direction C), and Compare to another period: not in the v0 scope line for this report; Save as and the builder pivot by month.
- An Account filter (Q13): the report answers "how much with each vendor"; the Profit and Loss and Transaction Detail by Account answer "how much on an account".
- Purchases that post to an asset, liability or equity account (Q2): they are not expenses, and they would break the tie-out to the Profit and Loss.
- A second shipped report "Expenses by Vendor Detail": opening a vendor row is the detail.
- A drill from a vendor's figure to another report: the row opens in place. Transaction Detail by Account has no Vendor filter.
- A link from a vendor row to the vendor's page, and from the vendor page to the report.
- A count of transactions per vendor; an average per transaction.
- Row density and zoom; notes on a report; Print (PDF export covers it).

## 6. Platform notes

None new. Inherited from core's report view and exports, signed off with p5-report-builder, p5-drill-down and p5-exports: `DocumentTitle` (web tab title), `web:[scrollbar-gutter:stable]`, the browser half of `useLeaveGuard`, hover underline and ⌘-click on row links, the file download path of exports. Keyboard shortcuts have standing approval.

## 7. Sparks carried

1. Each vendor is one plain line with its figure at the right edge — one group level (`vendorGroup()`), core `ReportRow`; `display.columns.amount.minWidth: "max-content"`.
2. The grand total is the heaviest line — core `ReportRow` total row (`border-t-2 border-foreground`, `font-semibold`); no new token.

No core extension.

## 8. Performance acceptance

The A/P Aging's §9 (`docs/specs/ap-aging-design.md`; the bars the human required on 2026-11-18) applies with the same query-plan bars, time bars and failure order, and with these differences only.

- **Where.** `server/report_expenses_by_vendor_scale_test.go`, on the shared harness `server/report_scale_harness_test.go` and its payables bulk writer `writeAPDataset` (its bills, vendor credits and their reversals already write the expense line with the vendor). Sizes S and L as the A/P Aging's dataset; switch `BOOKS_SCALE=1`. The writer does not write `books_cash_basis_lines` today; for run 3 this report's dataset is the writer's book followed by the server's own `rebuildCashBasis` (`server/cash_basis.go`; phase 4, plan decision D7), which writes the cash-basis rows that posting writes for each document, with no change to `writeAPDataset` or the rows it writes, so the A/P Aging's and the Vendor Balance's recorded results stay valid.
- **Large tables.** `books_journal_lines`, `books_cash_basis_lines`, `books_journal_entries`.
- **Runs.** Each at S and at L: (1) default: the period that holds every line, Method Accrual, Rows Non-zero, Order Name, no Vendor pick, the first page; (2) a period of the middle three months; (3) Method = Cash; (4) Order = Largest expenses; (5) Rows = With activity; (6) Vendor = five picked vendors; (7) run 1 with the vendor that has the most lines opened; (8) the CSV export of run 1.
- **Time bars.** At L, the median of 5 runs after one warm-up: runs 1 to 7 at 1,000 ms or less, and each of runs 1 to 7 at L at no more than 15 times its time at S.
- **Run 8 and core's export cap.** As the Vendor Balance's run 7 (human, 2026-11-20): at S the CSV export's median of 5 after one warm-up is 5,000 ms or less, with the CSV's Total equal to run 1's; at L (over core's 50,000-row cap) the export is refused with core's message, and the refusal's median is 5,000 ms or less. The L-over-S ratio bar does not apply to run 8.
- **Record.** `docs/plans/expenses-by-vendor-ledger.md`, section Performance, and `docs/plans/expenses-by-vendor-evidence/perf-plans.md`.
- **A bar that fails.** The fix is at the source: an index on `books_journal_lines` or `books_cash_basis_lines` by a new migration, or a core engine fix as a core task. It is never a design-around in the spec, and it stops the run for the human when it needs a core change. A plan-bar failure is diagnosed with a probe that changes one SQL term at a time before a fix is proposed (helix lesson, p5-vendor-balance). Every scale run is the driver's (`NEEDS-RUN`).

## 9. Merge order

- **p5-vendor-balance** (books PR #82, core PR #509) merges at this unit's design-gate approval. This unit's branch `books/p5-expenses-by-vendor` starts from books `main` after that merge; core is `main` after #509.
- This unit edits files that every report unit edits (`tinycld/books/lib/shipped-reports.ts`, `server/register.go`, `server/registrations_test.go`, `server/report_spec_helpers.go`, `server/report_scale_harness_test.go`, `tinycld/books/components/vendors/VendorsList.tsx`, `tinycld/books/seed.ts`, `help/reports.md`, `help/vendors.md`, `tests/help-reports.test.ts`). The unit that merges second keeps both sides. In `server/report_spec_helpers.go` and the scale harness this unit adds helpers and extracts parts with no change to what any present caller's spec or dataset holds.

- **p4-categorize-split** (lane reports, claimed first) also edits `server/register.go`, `server/registrations_test.go` and `tinycld/books/seed.ts`: the unit that merges second keeps both sides (gate Q15).
- **p5-report-engine-scale** (lane purchases) also edits `server/report_spec_helpers.go`, `server/report_scale_harness_test.go`, `help/reports.md` and the core reports engine: it merges first; when it merges in, this unit runs §8 again on the merged engine and those are the results of record (gate Q16).

## 10. Non-goals

- No new Books screen, collection, route or report source; no migration unless §8 needs an index.
- No change to posting, to the cash-basis rows, to `books_party_balances`, or to the vendor page.
- No change to what the Profit and Loss, the Vendor Balance, the Customer Balance or the A/P Aging shows, or to their spec JSON and Revisions.
- No reading of bill, expense or vendor credit lines; no product or quantity figures (a "Purchases by Product" report is not in the v0 scope).
- No 1099 figures: the 1099 reports are their own unit.
- No sub-vendors: `books_vendors` has no parent.
- No amounts in a second currency: Books posts in one currency.

## 11. Decisions (design gate, human, 2026-11-21)

- Direction A: one row per vendor with Total and % of expenses; a vendor opens into its expense lines.
- Packet questions Q1–Q16 accepted as recommended: ledger lines on Cost of goods sold / Expense / Other expense (Q2); Method on `books.basis_lines` (Q3); "No vendor" row last (Q4); % of expenses at 2 places (Q5); opened-vendor line label and document open (Q6); params Period / Method / Rows / Vendor / Order, inactive muted (Q7); one report `books.expenses_by_vendor` (Q8); third item of the Vendors Reports menu plus the hub (Q9); §8 performance bars with cash-basis rows added to the bulk writer (Q10); seed adds only the missing rows, after a grep of the tests they move (Q11); `vendorSortBy()`, `rowsParam()`, `entryTypeNumber()` by extraction, other reports' spec JSON unchanged (Q12); no Account filter (Q13); merge order §9 (Q14–Q16).
- No core extension; no new platform-only item.
