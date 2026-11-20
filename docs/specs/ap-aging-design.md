# A/P Aging — design

Unit p5-ap-aging · package `books` · feature `ap-aging`. Approved by the human at the design gate on 2026-11-19: direction A, and the answers of §11. Written against books `origin/main`@381fe701 and core `origin/main`@4690f72e; the branch `books/p5-ap-aging` starts from books main 81f3a72d. Source of scope: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Reports: … A/R and A/P aging … Every report … is a published report of the core report engine"). This report is the mirror of the A/R Aging (`docs/specs/ar-aging-design.md`, unit p5-ar-aging, merged in books PR #77) over Accounts payable. A mark (Qn) names decision n of §11.

## 1. Goal

A shipped Books report that shows what the business owes each vendor on one day, split by how many days each open item is past its due date, and that opens a vendor into its open bills and credits.

## 2. Where it lives

- A shipped report `books.ap_aging`, title **A/P Aging** (Q2), description "What you owe each vendor on one day, by how long each open bill is past due." It opens in core's report view (`/a/reports/<id>`) and is listed in the Books Reports hub (`/a/reports?package=books`). Like every `books.*` shipped report it is `Unpublished` and shared with every Books reader by `server/report_shares.go` (its filter `shipped_key ~ 'books.%'` covers the new key).
- The Vendors list gets a **Reports** menu (Q8): Books `ShippedReportsMenu` (test id `vendors-reports`) in `PartyList`'s `headerAction`, as the Customers list has. It has one item, **A/P Aging** (test id `vendors-reports-aging`), through `useShippedReportHref('books.ap_aging')`. The menu is not drawn while the report is not found.
- No new Books screen and no new route.

## 3. Behavior

- **Open items (Q3).** The report reads the posted journal lines on accounts of type `accounts_payable`, dated on or before the As of day, and gives each amount to one open item:
  - A bill is one item. Its open amount on the day is its total, less the lines of posted bill payments dated on or before the day that pay it, less the vendor credit applications dated on or before the day that name it.
  - A vendor credit is one item, a negative figure. Its open amount on the day is its total, less its applications dated on or before the day, less the lines of posted vendor refunds dated on or before the day that refund it.
  - A posted journal entry line on Accounts payable that comes from none of these documents is one item for its credit less its debit.
  - A bill payment and a vendor refund are never items: Books posts each one fully applied, so each of their lines is a part of the bill or the vendor credit it names.
  - A void document and its reversal are one item that adds up to zero. A voided bill payment or vendor refund reads as never applied. A removed vendor credit application reads as never applied, on past days too (Q5).
  - An item whose amount on the day is zero does not show.
- **Sign (Q4).** A figure is positive when the business owes it. A vendor credit is negative and lowers its vendor's Total.
- **The figures tie.** A vendor's Total for today is the Open balance of its vendor page (`books_party_balances`). The report's Total is the Accounts payable figure of the Balance Sheet for the day. This holds because every row comes from a posted Accounts payable line or is a part of one: the lines of a bill payment add up to the Accounts payable debits of its entry, the lines of a vendor refund add up to the Accounts payable credits of its entry, and the two rows of a vendor credit application add up to zero.
- **Age (Q2).** An item's age is the days from its due date to the As of day. A bill has a due date. Every other item ages from its own date.
- **Columns (Q2).** **Vendor** (the label), **Due date**, **Current** (age 0 or less: not yet due), **1 - 30**, **31 - 60**, **61 - 90**, **91 and over**, **Total**. An item's amount is in the one age column of its age and in Total. A vendor row and the Total row add their items in each column. An age column with no money on a row is blank, on the Total row too; Total always shows a figure. Due date shows on an item row only.
- **Rows.** Level 1 is the vendor, level 2 the open item. Vendors have no parent, so there is no family level. A vendor with no open item on the day does not show (core `groups[].hideEmpty`).
- **Opening a vendor (Q2).** A press on a vendor row opens it in place into one row per open item, labelled "<type> <number>" ("Bill 1042", "Vendor credit 3", "Journal entry JE-12": the number is the item's entry number as Books prints it), with its Due date and its open amount in its age column and in Total. Items are in due-date order, oldest first, then by number.
- **Opening an item (Q2).** A press on an item row opens it in place into its lines: the document's own line and one line per part that changed it on or before the day, each labelled "<date> · <type> <number>" (the date as its ISO day). Under a bill: "2026-11-03 · Bill payment 317" for a payment line and "2026-11-05 · Vendor credit 12" for an applied credit, each negative. Under a vendor credit: "2026-11-05 · Bill 1042" for an application and "2026-11-09 · Vendor refund 4" for a refund line, each positive. Each amount is in the item's age column and in Total. The lines add up to the item's open amount.
- **Opening a line.** A press on a line opens the read view of the document the label names, or the journal entry (core `detail.open` with Books `entryOpenPath()`): beside the report at 1360 px and wider where Books registers a report panel for the path, else as its own screen (p5-drill-down, unchanged).
- **No vendor (Q7).** Accounts payable lines that name no vendor form one row "No vendor", after every vendor; it opens into its items like a vendor row. With vendors picked in the filter it does not show.
- **Params.**
  - **As of** (core `asOf`), default **Today** (Q2). A past day shows the items as they were open on that day.
  - **Vendor** (new Books `vendorsParam()`: multiple, every vendor by name, inactive ones included). The document header prints "Vendor: …" for the picks.
  - **Order** (choice, Q2): **Name** (default) or **Largest balance** (by Total, largest first).
- **Inactive vendors (Q2).** The row is muted (core `groups[].muted`) and its label ends with " (inactive)".
- **Heading.** The Books business name, "A/P Aging", "As of <day>" (core `ReportDocumentHeader`, `Source.Heading`).
- **Empty.** With no open item on the day the report shows core's empty text for the day (`emptyMessage`) and no rows.
- **Live.** A post or a void of a bill, a bill payment, a vendor credit, a vendor refund or a journal entry, a correction of one of them, a vendor credit applied to a bill or removed from it, a vendor rename, or a Books settings change re-runs an open report. The run's topics are `collection/books_payable_items`, `collection/books_vendors` and `collection/books_settings`. Books refreshes the stored payable rows inside the transaction of each write that changes one and touches the table's change signal there (core `changesignal.Touch`), so the signal fires after the commit and never for a write that is rolled back.
- **Loading, error and Retry, refresh, Customize, Save as, copy link, share and the Export menu (CSV, Excel, PDF, email):** core's report view, unchanged. PDF writes the rows the view shows with their folds; CSV and Excel open every group.
- **Wide.** The eight columns are on one line where the rows are 940 px wide or wider (`display.oneLine.minWidth: "940px"`, the A/R Aging's measured value; phase 3 pass 2 measures it again on `/a/reports/<id>` with this report's fixture at 1024 and 1280). Every figure column is `minWidth: "max-content"`; the Vendor column wraps to at most three lines.
- **Phone and narrow widths.** Below the one-line width a `display.layouts` arrangement wraps each row, with no sideways scroll. The arrangements are the A/R Aging's (the phone one approved by the human on 2026-11-18): on a phone (three tracks) the label and the Due date are on the first line, Current, 1 - 30 and Total on the second, and 31 - 60, 61 - 90 and 91 and over on the third; on a tablet (rows of 640 px to 939 px, twelve tracks) the label and Total are on the first line and the Due date and the five ages on the second. Phase 3 pass 2 measures both with this report's fixture, the phone one at 375 and 390 and the tablet one at 900. A width at which a figure is cut or the row scrolls sideways gets this report's own value in `apDisplay()`; the A/R Aging's block is then not changed.
- **Performance (Q9).** On a book with 500,000 journal lines, each run of the report meets the time bars and each SQL statement of each run meets the query-plan bars of §9, and the measured results are in the helix ledger.
- **Help.** `help/reports.md` gains "Read the A/P Aging report": what an open item is, how age is counted, that a vendor credit is a negative figure, why a vendor's Total equals its page's Open balance and the report's Total equals the Balance Sheet, how to open a vendor, an item and a document, the As of day, the Order choice. Its "Who sees Books reports" list gains the A/P Aging. `help/vendors.md` links to the new section.

## 4. Data

### 4.1 The stored table

One new migration, `pb-migrations/2100000029_create_books_payable_items.js`. The number is the free one at plan time (Q11; phase 4, 2026-11-20): p2-apply-credit took 2100000031 and moved the audit log view to 2100000032, and 2100000029 was left free between the receivable items (2100000028) and the bank matches (2100000030). It runs after the bills, bill payments, vendor credits and vendor refunds it reads and before the audit log view, which stays the highest migration; `tests/migration-prefixes.test.ts` pins the file at its number. It creates one base collection, `books_payable_items`, with the Books read rule (`books_access` `can_read`) on list and view, and no create, update or delete rule. Only Books writes it; a REST write is refused, a superuser's too. It creates no audited collection.

It is a table of its own, not a column on `books_receivable_items` (Q6): the receivable table, its indexes and its measured query plans do not change.

Each row is a part of one item. Columns: `source` (select: `line`, `payment_line`, `refund_line`, `application_bill`, `application_credit`), `vendor`, `entry`, `date`, `currency`, `debit`, `credit`, `item` (text), `item_kind` (text: `bill`, `vendor_credit`, else `entry`), `item_number` (text: the item's entry number), `item_seq` (integer: the item's entry `sequence`), `due_date` (text day), `settled` (text day).

- `source = line` — one row per posted journal line on an `accounts_payable` account, except the lines of a bill payment's or a vendor refund's own entry and of the reversals of those entries (their parts are the rows below). `id` is the line's id; `item` the document id of the line's entry, else of the entry it reverses, else the line's id (a reversal of a manual line: the reversed line at the same position); `due_date` the bill's due date for a bill item, else the date of the item's first entry, so a reversal ages with what it reverses.
- `source = payment_line` — one row per `books_bill_payment_lines` row of a posted bill payment: `id` the line's id, `vendor` and `currency` the payment's, `entry` the payment's entry, `date` the payment's date, `debit` the line's amount, `credit` 0, `item` the bill id, `item_kind` `bill`, `item_number`, `item_seq` and `due_date` the bill's.
- `source = refund_line` — one row per `books_vendor_refund_lines` row of a posted vendor refund: `id` the line's id, `entry` the refund's entry, `date` the refund's date, `debit` 0, `credit` the line's amount, `item` the vendor credit id, `item_kind` `vendor_credit`, number and sequence the credit's, `due_date` the credit's date.
- `source = application_bill` and `application_credit` — two rows per `books_vendor_credit_applications` row, both dated the application's `date`. The bill row: `id` the application's id, `debit` the amount, `item` the bill, `entry` the vendor credit's entry (the line reads "Vendor credit 12" and opens the credit). The credit row: `id` the application's id followed by `c` (16 characters, so it equals no PocketBase id), `credit` the amount, `item` the vendor credit, `entry` the bill's entry (the line reads "Bill 1042" and opens the bill).
- `settled` — the day the balance of the row's vendor and item becomes zero and stays zero; `9999-12-31` while the item is open. Computed per vendor and item, as for receivables.

Indexes: `(entry)`, `(item)`, `(vendor, item, date)`, `(settled, date)`. `books_accounts (type)` exists since the receivable migration.

### 4.2 One engine for both tables

The receivable code (`server/receivable_items.go`, `server/receivable_refresh.go`) is the model, and this unit does not copy it. Unit p2-apply-credit owns the receivable SQL, refresh, verify and rebuild, and merges first (Q11): the extraction below is made from the receivable code as p2-apply-credit merged it, and the phase 4 plan of this unit is written only after that merge. "Keep their text" and "do not change" below mean: equal to that merged code. The parts that do not name a receivable move to `server/open_items.go` as one type, `openItemsTable` (the collection, the party column, the column list, the row queries, the open day, the read-only message), with the methods `insert`, `settle`, `rebuild`, `verify`, `refresh`, `repair`, `registerWriteGuard` and the shared `ItemDrift` shape. `receivableItems` and `payableItems` are its two values. The receivable SQL constants, the receivable hook points and every statement the A/R Aging runs keep their text, so the A/R Aging's stored rows, its spec JSON, its Revision and its recorded query plans do not change; `server/receivable_*_test.go` and `report_ar_aging_scale_test.go` pass with only their calls renamed.

The definition of a payable row is the SQL constants in `server/payable_items.go` (`payableLinesSQL`, `payablePaymentLinesSQL`, `payableRefundLinesSQL`, `payableApplicationsSQL`, the last one giving both rows of an application); the migration holds no SQL of a row. Three things read them:

- **Refresh** (`server/payable_refresh.go`), after the record write and inside its transaction; it refuses to run outside one. Hook points:
  1. an update of a journal entry that is not a draft (the hook p5-ar-aging bound in `server/ledger.go` refreshes both tables);
  2. an update of a bill that is not a draft (its due day and its entry reach the rows);
  3. an update of a bill payment (post, void, replacement by a correction), and an update of a bill payment line (a bill correction moves it to the correction);
  4. an update of a vendor credit that is not a draft;
  5. the create and the delete of a vendor credit application, after the balances change in the same transaction, and its update (a correction of its credit or its bill moves it);
  6. an update of a vendor refund (post, void, replacement), and an update of a vendor refund line (a vendor credit correction moves it).
  A refresh deletes the stored rows of the entry, payment, refund, bill or credit, stores the rows the queries give, computes `settled` again for each vendor and item that lost or gained a row, and touches the change signal. There is no hook on vendors.
- **Rebuild** (`payableItems.rebuild`): every row of the book again. `POST /api/books/balances/rebuild` runs it when the rows drifted and answers the first 100 drifted rows as `payableDrifts` and the count of all as `payableDriftCount`, beside the receivable ones.
- **Verify** (`payableItems.verify`): the stored rows compared with the queries, both ways, and each `settled` with its computed day. The Go test helper `requireNoDrift` runs it for both tables, so every posting test checks the stored payable rows too.

### 4.3 Report source

`books.payable_items` (`server/report_sources.go`), over the collection `books_payable_items`: fields `date` and `due_date` (`Date`, `TextDay`, `MinMax`), `debit` and `credit` (`Money`, `SumAll`, `Currency: "currency"`), `currency`, `item` (`Text`), `item_kind` (`Select`: Bill, Vendor credit, Journal entry — Journal entry last, the fallback of the kind label), `item_number` (`Text`, `MinMax`), `item_seq` (`Number`, `MinMax`), `settled` (`Text`, compared as the bare column so the index `(settled, date)` serves it); links `vendor` → `books.vendors` and `entry` → `books.journal_entries` (to-one); `Heading`, `FiscalStartMonth`, `Currency` and `Watch` (`books_settings`) as every Books source. `books.vendors` gains no link.

### 4.4 Report spec

`server/report_ap_aging.go`: `apAgingKey`, `apAgingShipped()` (Revision 1, `Unpublished: true`), `apAgingSpec()`, base `books.payable_items`:

- params: `asOf` (`ParamAsOf`, default preset `today`); `vendors` (`vendorsParam()`); `order` (choice `name` default, `balance`);
- filter: `settled > asOf` and `date <= asOf` and `vendorKey in vendors`;
- net = `credit − debit`; age = `diffDays(due_date, asOf)`;
- columns: `name` (Vendor; the vendor link); `due` (Due date; `min(due_date)`, `blankAbove: "byItem"`, `detail: "blank"`); `current`, `d30`, `d60`, `d90`, `d91`, `total` from `agingColumns(age, net)`; hidden `vendorKey` (the vendor link), `itemKey` (`item`), `itemNo` (`min(item_seq)`, `blankAbove: "byItem"`, `detail: "blank"`);
- groups: `byVendor` on `vendorKey` (`hideEmpty`; label `coalesce(display_name, "No vendor")` with " (inactive)" for an inactive vendor; `muted` when inactive); `byItem` on `itemKey` (label `concat(<label of min(item_kind)>, " ", min(item_number))`; `having`: `sum(net) ≠ 0`);
- sort: No vendor last (before the balance key, so it stays last under Largest balance); when `order = "balance"` the vendor's `sum(net)` descending; vendors by `lower(display_name)`; items by `due`, then `itemNo`; lines by `date`, `entry.posted_at`;
- detail: label `concat(date, " · ", <entry type label>, " ", entry.number)` (`lineEntryTypeLabel()` over the `entry` link; `server/entry_type_labels.json` already names Bill, Bill payment, Vendor credit and Vendor refund), open `entryOpenPath()` (`server/entry_routes.json` already has the four routes);
- display: `apDisplay()`. It returns `agingDisplay()` with no change, unless phase 3 pass 2 measures a width at which this report's fixture needs its own value (§3, Wide and Phone); then `apDisplay()` holds that value and `agingDisplay()` does not change.

Shared helpers in `server/report_spec_helpers.go`:

- used as they are: `agingColumns`, `blankZero`, `lineEntryTypeLabel`, `entryOpenPath`;
- extracted from `report_ar_aging.go`, which then calls them with no change to its JSON: `itemKindLabel(source)` (from `arItemKindLabel`), `agingDisplay()` (from `arDisplay`), `agingItemGroup(net, kindLabel)` (the `byItem` level), `agingParams(party)` (As of, the party param, Order);
- new, for this report, p5-vendor-balance and p5-expenses-by-vendor: `vendorsParam()` (`Header: "Vendor: {label}"`, options from `books.vendors` by `display_name`), `vendorGroup()` (the `byVendor` level), `vendorSort(net, inner...)`.

Engine reach. Every part is existing core API with a Books run behind it (the A/R Aging and the Customer Balance): a single-collection source, `diffDays`, `if`, `sum`, `min`, `case`, `columns[].blankAbove` / `detail` / `hidden`, `groups[].hideEmpty` / `muted` / `having` / `label`, a group label that reads `min` of a text field, `sort[].formula`, `detail.label`, `detail.open`, `display.oneLine`, `display.layouts`. This report uses no `lookup` and no `inline`. No core change.

### 4.5 Client, seed, tests

- `tinycld/books/lib/shipped-reports.ts`: `AP_AGING_SHIPPED_KEY`. `tinycld/books/components/vendors/VendorsList.tsx`: the Reports menu. No client collection for `books_payable_items`: only the report engine reads it.
- `tinycld/books/lib/ap-aging-fixture.ts` (phase 3 pass 2): a static `RunResult` and `AP_AGING_DISPLAY` for core `ReportView`, as `ar-aging-fixture.ts`.
- Seed (Q10). `tinycld/books/seed.ts` gains, as one block of its own with fixed 2026 dates, so that the seeded book fills several age columns: one more posted bill that is past due, a part payment on that bill, and a vendor credit applied in part to it, all three of Harbor Freight Logistics (phase 4: the proposal's part payment on Pacific Power's open bill would change a balance that the vendor credit apply tests read). Before the edit, the build greps `tests/` and `tests/e2e/` for the seeded vendors, the Accounts payable account, the Pay bills rows and the vendor page totals, and updates each test that reads a changed figure.
- Go tests (`server/report_ap_aging_test.go`, `server/payable_items_test.go`, `server/payable_refresh_test.go`, with `newLedgerEnv` and `readerInfo`): a bill not yet due, one in each age column, the edges (age 0, 1, 30, 31, 90, 91); a part payment; one payment of two bills; a payment dated after the As of day; a paid bill (hidden); a vendor credit with no application; a credit applied in part, read before and after the apply date; a removed application; a refund of part of a credit; a credit used up by an application and a refund (hidden); a manual Accounts payable journal line with a vendor and one with none; a void bill, a void bill payment (the bill open again), a void vendor credit and a void vendor refund; a corrected bill (its payment lines and applications move), a corrected bill payment, a corrected vendor credit; an inactive vendor; the Vendor filter; both Order choices; each vendor's Total compared with `books_party_balances`; the Total compared with a Balance Sheet run; a reader without Books access gets no rows. For the stored table: the stored rows after each kind of write, with no rebuild; `settled` for a part-paid item, an item paid in two parts, an item settled on its own day and an item opened again by a void; a refresh outside a transaction (refused); a REST write (refused, a superuser's too); a REST read of the 16-character application row id; verify finds a stale row, a missing row and a wrong `settled`; the rebuild route repairs them. `TestRegister_BindsEachPartOnce` gains the new parts.
- E2e (`tests/e2e/books-ap-aging.spec.ts`, with `ap-aging-helpers.ts` over the row helpers of `ar-aging-helpers.ts` and `books-report-helpers.ts`, and the bill, Pay bills and vendor credit helpers): open from the hub and from the Vendors list's Reports menu; a vendor the test creates with a bill it posts, read with a fixed As of day that puts it in 31 - 60, then with a day that puts it in Current; open the vendor, see the bill with its Due date; pay part of the bill and see the item's amount fall and the payment line under the item; press the line and land on the bill payment; a vendor credit shows a negative item, and after it is applied to the bill both items fall; one phone run (375 and 390) of an opened vendor with no sideways scroll. The spec posts documents in months that no report spec's empty-state test reads, sets As of to fixed days, and asserts no total that depends on other specs' rows.

## 5. Cut

- A choice of the days per period and the number of periods: fixed at 30 days and four periods, as the A/R Aging; Save as and the builder let a user change a copy.
- "Age by transaction date": Books ages by due date.
- A separate "A/P Aging Detail" report (direction C): opening a vendor is the detail.
- A "Days past due" column; a red tone on overdue figures; a description on the lines of an item: as the A/R Aging's cuts.
- A drill from an age figure of a vendor row to a filtered report: the vendor row opens in place.
- A "Pay bills" action from a vendor row or an item: Pay bills is its own screen (p3-pay-bills); an item's line opens the bill, which has Pay.
- A link from the vendor page's Open balance or from the Pay bills screen to the report.
- The history of a removed vendor credit application: Books deletes the application row, so a past day reads it as never applied (Q5).
- Compare to another day; row density; Print (PDF export covers it).
- The "All Dates" period of the screenshot: the report is for one day.

## 6. Platform notes

None new. Inherited from core's report view and exports, signed off with p5-report-builder, p5-drill-down and p5-exports: `DocumentTitle` (web tab title), `web:[scrollbar-gutter:stable]`, the browser half of `useLeaveGuard`, hover underline and ⌘-click on row links, the file download path of exports. Keyboard shortcuts have standing approval.

## 7. Sparks carried

1. How late money is reads from where the figure sits: one column per age, older to the right — `agingColumns`; core `ReportTable`.
2. An age with no money is blank — Books `blankZero()`.
3. The grand total is the heaviest line — core `ReportRow` total row; no new token.

No core extension.

## 8. Non-goals

- No change to `books_bills.balance`, `books_vendor_credits.balance`, `books_party_balances`, the vendor page, Pay bills, or any posting rule.
- No change to what the A/R Aging shows or to the SQL it runs.
- No vendor balance report (p5-vendor-balance) and no expenses-by-vendor report (p5-expenses-by-vendor); they reuse `vendorsParam()`, `vendorGroup()` and `vendorSort()`.
- No sub-vendors: `books_vendors` has no parent.
- No unapplied bill payments: Books posts a bill payment only against bills.
- No balances in a second currency: Books posts in one currency.
- No upgrade path for a book that has payable lines before this migration: the package is unreleased and every database starts empty.

## 9. Performance acceptance

The A/R Aging's §9 (`docs/specs/ar-aging-design.md`, required by the human on 2026-11-18) applies to this report with the same query-plan bars, time bars, failure order and record, and with these differences only.

**Where.** `server/report_ap_aging_scale_test.go`. The harness of `report_ar_aging_scale_test.go` (the statement log, `EXPLAIN QUERY PLAN` reader, plan bars, timing, the S and L switch `BOOKS_SCALE=1`) moves to a shared test file that both scale tests call; the bulk writer for payables is new.

**Dataset.** Two sizes, written straight to the tables in one transaction with the columns that posting writes; the same test posts one bill, one bill payment, one vendor credit, one application, one vendor refund and one journal entry through the real posters and compares their rows, column by column, with the rows of the bulk writer.

| | S | L |
|---|---|---|
| `books_journal_lines` | 50,000 | 500,000 |
| vendors | 200 | 2,000 |
| posted bills | 10,000 | 100,000 |
| posted bill payments / bill payment lines | 8,000 / 9,000 | 80,000 / 90,000 |
| posted vendor credits / applications | 200 / 150 | 2,000 / 1,500 |
| posted vendor refunds (one line each) | 50 | 500 |
| manual Accounts payable journal lines (1 in 10 with no vendor) | 100 | 1,000 |
| void bills and void bill payments, each with its reversal | 100 + 100 | 1,000 + 1,000 |
| open items on the last day | about 800 | about 8,000 |

The dates cover five years. A "large table" is a table with 10,000 rows or more in L: `books_journal_lines`, `books_journal_entries`, `books_bills`, `books_bill_payments`, `books_bill_payment_lines`, `books_payable_items`.

**Runs.** Each at S and at L: (1) default: As of the last day, Order Name, no Vendor pick, the first page; (2) As of the middle day; (3) Order = Largest balance; (4) Vendor = five picked vendors; (5) run 1 with the vendor that has the most open items opened; (6) run 5 with that vendor's oldest bill that has a payment opened; (7) the CSV export of run 1.

**Time bars.** At L, the median of 5 runs after one warm-up: runs 1 to 6 at 1,000 ms or less, run 7 at 5,000 ms or less, and each run at L at no more than 15 times its time at S.

**Record.** `docs/plans/ap-aging-ledger.md`, section Performance, and `docs/plans/ap-aging-evidence/perf-plans.md`. The same test runs the A/R Aging's seven runs one time at L after the engine extraction of §4.2 and records that its times still meet its bars. Every measurement is made on the report engine as p5-report-engine-scale merged it (§10).

## 10. Merge order

- **p2-apply-credit** (lane reports) merges before this unit's phase 4 plan is written (Q11). If it has not merged when phase 4 is due, this unit waits for it. Phase 3 pass 2 (the fixture, the scratch route, the reference) does not wait: it reads no receivable code.
- **p5-report-engine-scale** (lane purchases) merges before this unit merges (Q12). In the files that both units edit (`server/balances.go`, `server/report_sources.go`, `server/report_sources_test.go`, `help/reports.md`) this unit keeps both sides: it adds its parts and removes none of the other unit's.

## 11. Decisions of the design gate (human, 2026-11-19)

- **Q1 — direction:** A. One report; a vendor opens into its open items. Directions B and C are not built.
- **Q2 — the A/R Aging's answers of 2026-11-18 apply:** yes. Age from the due date (an item with no due date ages from its own date); fixed periods Current, 1 - 30, 31 - 60, 61 - 90, 91 and over; a credit is a negative figure in the column of its own date's age; As of defaults to Today; a vendor opens into its items, an item into its lines, a line opens its document; empty age cells are blank on every row; Order is Name or Largest balance; an inactive vendor is shown, muted, with " (inactive)"; one report, titled "A/P Aging"; the phone arrangement approved for the A/R Aging.
- **Q3 — what is aged:** open items from the ledger (bills, vendor credits, journal entry lines on Accounts payable). A bill payment and a vendor refund are never items. Not the stored `books_bills.balance`.
- **Q4 — sign:** what the business owes is positive; a vendor credit is negative.
- **Q5 — a removed vendor credit application:** reads as never applied, on past days too. No history of removed applications.
- **Q6 — storage:** a table of its own, `books_payable_items`, and one engine (`server/open_items.go`) for the receivable and the payable tables. No copy of the receivable code and no shared table.
- **Q7 — "No vendor" row:** yes, last.
- **Q8 — entry point:** a new Reports menu on the Vendors list with the one item "A/P Aging", and the Reports hub. No link from Pay bills or the vendor page.
- **Q9 — performance acceptance:** the A/R Aging's, with the payables dataset of §9.
- **Q10 — seed additions:** yes, after the grep of §4.5.
- **Q11 — p2-apply-credit:** it owns the receivable SQL, refresh, verify and rebuild, and merges first. This unit's phase 4 plan is written only after that merge and extracts `server/open_items.go` from the merged receivable code; the unit waits when the merge is not done. The migration takes the free number at plan time: 2100000029 (phase 4, 2026-11-20; §4.1).
- **Q12 — p5-report-engine-scale:** it merges first. This unit merges after it, keeps both sides of the shared files (`server/balances.go`, `server/report_sources.go` and its test, `help/reports.md`), and measures performance on the merged engine.
