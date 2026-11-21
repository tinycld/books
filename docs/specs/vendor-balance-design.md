# Vendor Balance — design

Unit p5-vendor-balance · package `books` · feature `vendor-balance`. Approved at the design gate by the human on 2026-11-20: direction **A** (ledger lines under each vendor) and the answers of §11. Branch `books/p5-vendor-balance`, from books `main`@9b54d607 (books PR #80, p5-ap-aging, is merged); core `main`@654110f8. Source of scope: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Reports: … A/R and A/P aging, customer and vendor balance …. Every report … is a published report of the core report engine"). This report is the mirror of the Customer Balance (`docs/specs/customer-balance-design.md`, unit p5-customer-balance) over Accounts payable, and it reuses the vendor parts of the A/P Aging (`docs/specs/ap-aging-design.md`, unit p5-ap-aging). A mark (Qn) names the packet's question n.

## 1. Goal

A shipped Books report that shows what the business owes each vendor on one day, and that opens a vendor into the transactions that make its balance.

## 2. Where it lives

- A shipped report `books.vendor_balance`, title **Vendor Balance** (Q6), description "What you owe each vendor on one day, from posted transactions on Accounts payable accounts." It opens in core's report view (`/a/reports/<id>`) and is listed in the Books Reports hub (`/a/reports?package=books`). Like every `books.*` shipped report it is `Unpublished` and shared with every Books reader by `server/report_shares.go` (its filter `shipped_key ~ 'books.%'` covers the new key).
- The Vendors list's **Reports** menu (Books `ShippedReportsMenu`, test id `vendors-reports`, from p5-ap-aging) gains the item **Vendor Balance** (test id `vendors-reports-balance`), above A/P Aging (Q7), through `useShippedReportHref('books.vendor_balance')`. An item whose report is not found is not drawn; the menu is not drawn while neither report is found.
- No new Books screen and no new route.

## 3. Behavior

- **What counts (Q2).** The report reads the posted journal lines on accounts of type `accounts_payable`, dated on or before the As of day. A vendor's balance is its lines' credits minus debits. It is the Open balance of the vendor's page (`books_party_balances`) on the same day, the vendor's Total in the A/P Aging for that day, and the report's Total is the Accounts payable figure of the Balance Sheet for that day. A draft or void document has no posted line, so it does not count; a void's reversal lines cancel the original.
- **Sign (Q2).** A figure is positive when the business owes it. A vendor that owes the business (an unapplied vendor credit) has a negative figure; the Total nets it.
- **Rows.** One level: the vendor. Vendors have no parent, so there is no family row and no subtotal row. The report ends in one Total row.
- **Columns.** **Vendor** (the label) and **Balance**. On a vendor row and on the Total, Balance is the sum of credits minus debits.
- **Opening a vendor (Q3).** A press on a vendor row opens it in place into one row per posted line, labelled "<date> · <type> <number> · <description>" (the date as its ISO day; the type from Books `lineEntryTypeLabel()`: "Bill", "Bill payment", "Vendor credit", "Vendor refund", "Journal entry"; the description from `lineDescriptionFormula()`), with the line's credit minus debit under Balance: a bill is positive, a bill payment and a vendor credit are negative, a vendor refund is positive. The rows are in date order, then posting order (`entry.posted_at`, `position`). They add up to the vendor's Balance. A vendor credit applied to a bill posts no line (both are on Accounts payable for the one vendor), so it has no row.
- **Opening a transaction.** A press on a transaction row opens its document's read view, or the journal entry (core `detail.open` with Books `entryOpenPath()`): beside the report at 1360 px and wider where Books registers a report panel for the path, else as its own screen (p5-drill-down, unchanged).
- **No vendor (Q4).** Accounts payable lines that name no vendor (an opening balance, a journal entry with no name) form one row "No vendor", after every vendor under both Order choices. It opens into its lines like a vendor row. With vendors picked in the filter it does not show.
- **Params.**
  - **As of** (core `asOf`), default **Today**.
  - **Rows** (choice, Q5): **Non-zero** (default) shows a vendor whose balance is not 0; **With activity** also shows a vendor with posted lines that add up to 0. Core `groups[].having` on the vendor level.
  - **Vendor** (Books `vendorsParam()`: multiple, every vendor by name, inactive ones included). Unset = every vendor and the No vendor row. The document header prints "Vendor: …" for the picks.
  - **Order** (choice): **Name** (default; by name, ignoring case) or **Largest balance** (by Balance, largest first).
- **Inactive vendors.** An inactive vendor with a balance (or, under With activity, with lines) shows; its row is muted (core `groups[].muted`) and its label ends with " (inactive)" (Books `vendorGroup()`), as in the A/P Aging.
- **Heading.** The Books business name, "Vendor Balance", "As of <day>" (core `ReportDocumentHeader`, `Source.Heading`).
- **Empty.** A book with no posted Accounts payable line on or before the day shows core's empty report text for the day (`emptyMessage`) and no rows.
- **Live.** A post or a void of a bill, a bill payment, a vendor credit, a vendor refund or a journal entry, a vendor rename, an account type change, or a Books settings change re-runs an open report (the run's topics: `books_journal_lines`, `books_accounts`, `books_vendors`, `books_journal_entries`, `books_settings`).
- **Loading, error and Retry, refresh, Customize, Save as, copy link, share and the Export menu (CSV, Excel, PDF, email):** core's report view, unchanged. PDF writes the rows the view shows with their folds; CSV and Excel open every vendor, so each vendor is followed by its posted lines.
- **Phone.** Two columns fit one line. A long vendor name wraps to at most three lines (`display.columns.name`: `whiteSpace: "normal"`, `lineClamp: 3`); Balance is never cut (`minWidth: "max-content"`). A transaction label wraps the same way. The toolbar's Customize and Export are under More (core). Phase 3 pass 2 measures the display block with this report's fixture at 375 and 390; a width at which a figure is cut gets this report's own value, and the Customer Balance's block is then not changed.
- **Performance (Q8).** On the A/P Aging's L dataset (500,000 journal lines, 2,000 vendors), each run of the report meets the time bars and each SQL statement of each run meets the query-plan bars of §8, and the measured results are in the helix ledger. The recorded results are those of the report engine with p5-report-engine-scale merged (Q13, §9).
- **Help.** `help/reports.md` gains "Read the Vendor Balance report": what counts, why a row equals the vendor page's Open balance and the A/P Aging's Total for the vendor, why the Total equals the Balance Sheet's Accounts payable, what the No vendor row is, how to open a vendor and a transaction, the Rows and Order choices, that a negative figure is money the vendor owes the business, and when to read the A/P Aging instead (open bills with their due dates). Its "Who sees Books reports" list gains the Vendor Balance. `help/vendors.md` names the new menu item and links to the section.

## 4. Data

Collections read (none new, no migration): `books_journal_lines`, `books_journal_entries`, `books_accounts`, `books_vendors`, `books_settings` (heading, currency, fiscal month).

Report sources: unchanged. `books.journal_lines` has the `vendor`, `account` and `entry` links and `debit`, `credit`, `date`, `posted`, `position`; `books.vendors` has `display_name` and `inactive`. The report does not read `books.payable_items`: that table holds parts of open items (two rows for each vendor credit application, one row for each bill a payment pays), which is the A/P Aging's view, not the list of posted transactions.

The report spec (`server/report_vendor_balance.go`: `vendorBalanceKey`, `vendorBalanceShipped()` with Revision 1 and `Unpublished: true`, `vendorBalanceSpec()`), base `books.journal_lines`:

- params: `balanceParams(vendorsParam())` — `asOf` (`ParamAsOf`, default preset `today`); `rows` (choice `nonzero` default, `activity`); `vendors`; `order` (choice `name` default, `balance`);
- filter: `payableLines(asOf)` (`posted = true` and `account.type = "accounts_payable"` and `date <= asOf`) and `vendorKey in vendors`;
- net = `credit − debit`;
- columns: `name` (Vendor; the vendor link), `balance` (Balance; `sum(net)`), hidden `vendorKey` (the vendor link);
- groups: `vendorGroup()` (`byVendor` on `vendorKey`: `hideEmpty`, label `coalesce(display_name, "No vendor")` with " (inactive)", `muted` when inactive) with `having`: `balanceRowsHaving(net)` (`rows = "activity"` or `sum(net) ≠ 0`);
- sort: `vendorSort(net, balanceLineKeys()...)` — the line keys `date`, `entry.posted_at`, `position` (they order the opened rows only), No vendor last, under Largest balance the vendor's `sum(net)` descending, then `lower(display_name)`;
- detail: label `balanceDetailLabel()`, open `entryOpenPath()` (`server/entry_routes.json` has the bill, bill payment, vendor credit and vendor refund routes);
- display: `balanceDisplay()` (`name` wraps to three lines, `balance` `minWidth: "max-content"`).

Shared helpers in `server/report_spec_helpers.go`:

- used as they are (p5-ap-aging): `vendorsParam()`, `vendorGroup()`, `vendorSort()`, `lineEntryTypeLabel()`, `lineDescriptionFormula()`, `entryOpenPath()`;
- extracted from `report_customer_balance.go`, which then calls them with no change to its JSON (its test `customerBalanceSpecSHA256` proves it; its Revision stays 1): `balanceParams(party)` (As of, Rows, the party param, Order), `balanceRowsHaving(net)`, `balanceLineKeys()`, `balanceDetailLabel()` (from `cbDetailLabel`), `balanceDisplay()` (from `cbDisplay`);
- new: `payableLines(asOf)`, the mirror of `receivableLines(asOf)`.

Why the figures hold: each posted line is on one account and names at most one vendor, so it is in exactly one row; the Total adds every row, the No vendor row included, which is every posted Accounts payable line on or before the day. `books_party_balances` sums the same lines per vendor, and every stored payable row is a posted Accounts payable line or a part of one (ap-aging spec §3).

Engine reach. Every part is existing core API with a Books run behind it (the Customer Balance and the A/P Aging): `ParamAsOf`, a choice param with `OptionsFrom` and `Header`, `groups[].hideEmpty` / `muted` / `having` / `label`, `sort[].formula`, `detail.label`, `detail.open`, `display.columns`. This report uses no `inline`, no `lookup`, no pivot and no `display.layouts`. No core change.

Files (Books):

- `server/report_vendor_balance.go` + `_test.go`: `CheckSources`, `Load`/`Validate`, the spec sha, and runs (with `newLedgerEnv` and `readerInfo`) over a book with a bill, a part payment, a paid-off vendor, a vendor credit with no application (a negative balance), a vendor credit applied to a bill (no row, balance unchanged by the apply), a vendor refund, one payment of two bills, a manual Accounts payable journal line with a vendor and one with none, an inactive vendor, a void bill and a void bill payment, a line after the day, both Rows choices, both Order choices (No vendor last in both), the Vendor filter; each vendor row compared with `books_party_balances` and with the vendor's Total of an A/P Aging run on the same day; the Total compared with a Balance Sheet run; a reader without Books access gets no rows.
- `server/report_vendor_balance_scale_test.go` (§8).
- `server/report_spec_helpers.go`, `server/report_customer_balance.go` (calls the extracted helpers), `server/register.go` (`reports.RegisterShipped(vendorBalanceShipped())`), `server/registrations_test.go`.
- `tinycld/books/lib/shipped-reports.ts` (`VENDOR_BALANCE_SHIPPED_KEY`), `tinycld/books/components/vendors/VendorsList.tsx` (the menu item).
- `help/reports.md`, `help/vendors.md`, `tests/help-reports.test.ts`.
- `tinycld/books/lib/vendor-balance-fixture.ts` (phase 3 pass 2: a static `RunResult` and `VENDOR_BALANCE_DISPLAY` for core `ReportView`, as `customer-balance-fixture.ts`; the scratch route follows the kept model `~/tmp/tinycld/auto-helix-books/staging/p5-ap-aging/helix-mockup.tsx.txt`).
- `tinycld/books/seed.ts` (Q9): as one block of its own with fixed 2026 dates, one posted journal entry on Accounts payable with no name and one posted journal entry on Accounts payable that names an inactive seeded vendor, so a dev book and the e2e book show the No vendor row and a muted row. Before the edit, the build greps `tests/` and `tests/e2e/` for the Accounts payable account, the A/P Aging rows, the Balance Sheet and Trial Balance figures and the vendor page totals, and updates each test that reads a changed figure. The two entries move the seeded Accounts payable figure of the Balance Sheet and the Trial Balance; those figures are read again at integration with p5-report-engine-scale (Q13, §9).

E2e (`tests/e2e/books-vendor-balance.spec.ts`, with `vendor-balance-helpers.ts`, the row helpers of `customer-balance-helpers.ts` (`chooseBalanceRows`, `chooseBalanceOrder`, `openBalanceRow`, `expectBalanceRowsFit`, `centsOf`), `ap-aging-helpers.ts` (the vendor and bill helpers, the Vendor picker), `books-report-helpers.ts` and core's report helpers; a helper both specs need moves to a shared module and every caller moves to it): open from the hub and from the Vendors list's Reports menu; a vendor the test creates with a bill it posts shows its balance, equal to the Open balance on its page; open the vendor and see the bill row, press it and land on the bill; pay part of the bill and see the balance fall and the payment row under the vendor; a vendor credit makes the balance fall; Rows With activity shows a vendor whose lines add up to zero (a voided bill); one phone run (375 and 390) of an opened vendor with no sideways scroll. The spec posts documents in months that no report spec's empty-state test reads, and asserts no total that depends on other specs' rows.

## 5. Cut

- Due date, days past due and Open balance per document (screenshot 1; direction B): they describe open bills, and the A/P Aging lists a vendor's open bills and credits with their due dates. This mirrors the human's Customer Balance decision of 2026-11-16.
- A running balance column on the transaction rows: the rows add up to the vendor's Balance in one figure column (as the Customer Balance).
- Billed and Paid columns (direction C).
- A second shipped report "Vendor Balance Detail": opening a vendor row is the detail.
- "All vendors" (zero-balance vendors with no activity) in Rows: a vendor that never had a payable line adds nothing to a balance report.
- A drill from a vendor's Balance figure to the A/P Aging for that vendor: the vendor row opens in place, and the Reports menu and the hub open the A/P Aging.
- A "Pay bills" action from a vendor row: a transaction row opens the bill, which has Pay.
- A link from a vendor row to the vendor's page, and from the vendor page's Open balance to the report.
- Compare to another period; row density and zoom; notes on a report; Print (PDF export covers it).
- The "All Dates" period of the screenshots: the report is for one day.

## 6. Platform notes

None new. Inherited from core's report view and exports, signed off with p5-report-builder, p5-drill-down and p5-exports: `DocumentTitle` (web tab title), `web:[scrollbar-gutter:stable]`, the browser half of `useLeaveGuard`, hover underline and ⌘-click on row links, the file download path of exports. Keyboard shortcuts have standing approval.

## 7. Sparks carried

1. Each vendor is one plain line with one figure — one group level (`vendorGroup()`), core `ReportRow`; `display.columns.balance.minWidth: "max-content"`.
2. The grand total is the heaviest line — core `ReportRow` total row (`border-t-2 border-foreground`, `font-semibold`); no new token.

No core extension.

## 8. Performance acceptance

The A/P Aging's §9 (`docs/specs/ap-aging-design.md`; the A/R Aging's bars, required by the human on 2026-11-18) applies with the same query-plan bars, time bars and failure order, and with these differences only.

- **Where.** `server/report_vendor_balance_scale_test.go`, on the shared harness `server/report_scale_harness_test.go` and the payables bulk writer of `report_ap_aging_scale_test.go` (`writeAPDataset` and the functions and types it needs). The writer moves to the shared harness file with no change of what it writes, and the A/P Aging test calls it there. Sizes S and L as the A/P Aging's dataset; switch `BOOKS_SCALE=1`.
- **Large tables.** `books_journal_lines`, `books_journal_entries`.
- **Runs.** Each at S and at L: (1) default: As of the last day, Rows Non-zero, Order Name, no Vendor pick, the first page; (2) As of the middle day; (3) Order = Largest balance; (4) Rows = With activity; (5) Vendor = five picked vendors; (6) run 1 with the vendor that has the most lines opened; (7) the CSV export of run 1.
- **Time bars.** At L, the median of 5 runs after one warm-up: runs 1 to 6 at 1,000 ms or less, and each of runs 1 to 6 at L at no more than 15 times its time at S.
- **Run 7 and core's export cap (human, 2026-11-20).** Core refuses an export of more than 50,000 rows ("This report has more than 50,000 rows. Narrow the period."; `tinycld/core/server/reports/export.go`), and the cap does not change. The CSV export bar is measured on a book under the cap: at S (about 19,000 rows), the median of 5 after one warm-up at 5,000 ms or less, with the CSV's Total equal to run 1's. At L (far over the cap) run 7 must be refused with exactly that message, and the refusal is quick: the median of 5 refusals after one warm-up at 5,000 ms or less. The L-over-S ratio bar does not apply to run 7 (an export at S and a refusal at L are not the same work).
- **Record.** `docs/plans/vendor-balance-ledger.md`, section Performance, and `docs/plans/vendor-balance-evidence/perf-plans.md`.
- **Engine.** The results of record are measured after this branch has the merged p5-report-engine-scale (Q13, §9). A measurement made before that merge is made again after it.
- **A bar that fails.** The fix is at the source: an index on `books_journal_lines` by a new migration, or a core engine fix as a core task. It is never a design-around in the spec, and it stops the run for the human when it needs a core change.

## 9. Merge order

- **p5-ap-aging** (books PR #80) is merged. This unit's branch `books/p5-vendor-balance` starts from books `main`@9b54d607, which has it (Q11 is moot).
- **p2-statements** (lane reports, in build) edits the same `tinycld/books/lib/shipped-reports.ts`, `server/register.go`, `server/registrations_test.go`, `server/report_spec_helpers.go`, `tinycld/books/seed.ts`, `help/reports.md` and `tests/help-reports.test.ts`. The unit that merges second keeps both sides. In `server/report_spec_helpers.go` this unit only adds new helpers (`payableLines` and the `balance…` helpers of §4); it changes no helper that is there (Q12).
- **p5-report-engine-scale** (lane purchases) merges first. This unit merges after it and keeps both sides. After that merge is in this branch, this unit measures §8 on the merged engine and reads again the Balance Sheet and Trial Balance figures that the Q9 seed entries move, in every test that reads them (Q13).
- In the other files that report units also edit (`tinycld/books/components/vendors/VendorsList.tsx`, `help/vendors.md`) this unit keeps both sides: it adds its parts and removes none of another unit's. p5-expenses-by-vendor adds its item to the same Reports menu.

## 10. Non-goals

- No new Books screen, collection, migration (unless §8 needs an index) or report source.
- No change to `books_party_balances`, `books_payable_items`, the vendor page, Pay bills, or any posting rule.
- No change to what the Customer Balance or the A/P Aging shows, or to their spec JSON and Revisions.
- No aging columns, no due dates, no overdue marking.
- No sub-vendors: `books_vendors` has no parent.
- No expenses-by-vendor report (p5-expenses-by-vendor).
- No balances in a second currency: Books posts in one currency.

## 11. Design gate answers (human, 2026-11-20)

Direction **A**. Q1 to Q10 as the packet recommended; Q11 moot; Q12 and Q13 are the driver's questions, accepted.

- **Q1.** Direction A: ledger lines under each vendor, on `books.journal_lines`. Not B (open bills with Due date), not C (Billed / Paid / Balance columns).
- **Q2.** A vendor's balance is the ledger: posted lines on Accounts payable accounts that name the vendor, credits minus debits, on or before the day. Positive = the business owes it; an unapplied vendor credit is negative.
- **Q3.** An opened vendor shows one row per posted line, "<date> · <type> <number> · <description>", with its amount in the one Balance column; no running balance, no Due date. A vendor credit applied to a bill has no row.
- **Q4.** Accounts payable lines with no vendor are one "No vendor" row, last under both Order choices.
- **Q5.** As of default Today; Rows = Non-zero or With activity, no "All vendors"; Vendor filter; Order = Name or Largest balance; an inactive vendor is muted with " (inactive)".
- **Q6.** One report, titled "Vendor Balance"; opening a vendor is the detail.
- **Q7.** Entry points: a "Vendor Balance" item in the Vendors list's Reports menu, above A/P Aging, and the Reports hub. No link from the vendor page or Pay bills.
- **Q8.** Performance acceptance: the aging reports' bars on the A/P Aging's S and L datasets, with the seven runs of §8. The Customer Balance gets no such test in this unit.
- **Q9.** Seed additions: one posted Accounts payable journal entry with no name and one that names an inactive seeded vendor, fixed 2026 dates, after the grep of §4.
- **Q10.** The Customer Balance's params, Rows condition, line keys, detail label and display block become shared helpers that both reports call; the Customer Balance's JSON and Revision do not change (its sha test proves it).
- **Q11.** Moot: books PR #80 is merged; the branch starts from `main`@9b54d607.
- **Q12.** p2-statements shares `shipped-reports.ts`, `register.go`, `registrations_test.go`, `report_spec_helpers.go`, `seed.ts`, `help/reports.md` and `help-reports.test.ts`; the unit that merges second keeps both sides; this unit only adds new helpers to `report_spec_helpers.go`.
- **Q13.** p5-report-engine-scale merges first; this unit merges after it, keeps both sides, measures performance on the merged engine, and reads again the Balance Sheet and Trial Balance figures that the Q9 seed moves, at integration.
