# 1099 Summary and Detail — design

Unit p5-1099-report · package `books` · feature `report-1099`. Draft for the design gate: direction **A**, the two core extension asks (E1, E2) and every answer marked (Qn) are the packet's recommendations, not yet approved. Built against books `books/p5-expenses-by-vendor`@9f6dbaca (PR #85, at its eval gate, not merged) and core `books/p5-expenses-by-vendor`@e1a140b1 (PR #513, open). Source of scope: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("1099 tracking: … payments counted by payment date in the calendar year, excluding card payments (reported by the processor on 1099-K); the reporting threshold is a setting, not a constant. No form printing or filing." and "Reports: … 1099 summary and detail …. Every report … is a published report of the core report engine"). The models are the Expenses by Vendor (`docs/specs/expenses-by-vendor-design.md`, its ledger's Performance section and its `Live: false` decision) and the 1099 settings (`docs/specs/vendor-1099-design.md`). A mark (Qn) names the packet's question n.

## 1. Goal

A shipped Books report that shows, for a calendar year, what the business paid each 1099 vendor in each 1099 box without the card payments, which vendors reach the 1099 threshold, and the payments behind each figure.

## 2. Where it lives

- A shipped report `books.form_1099`, title **1099 Summary and Detail** (Q1), description "Payments to each 1099 vendor by box for a calendar year, without card payments, against your 1099 threshold." It opens in core's report view (`/a/reports/<id>`) and is listed in the Books Reports hub (`/a/reports?package=books`). Like every `books.*` shipped report it is `Unpublished` and shared with every Books reader by `server/report_shares.go` (its filter `shipped_key ~ 'books.%'` covers the new key).
- The Vendors list's **Reports** menu (Books `ShippedReportsMenu`, test id `vendors-reports`) gains a fourth item **1099 Summary and Detail** (test id `vendors-reports-1099`), after Expenses by Vendor (Q13), through `useShippedReportHref('books.form_1099')`. An item whose report is not found is not drawn.
- Settings → 1099s (`components/settings/Form1099Section.tsx`) gains a button **Open the 1099 report** (test id `books-1099-open-report`, core `Button` `variant="outline"`) above the three cards (Q13), through the same hook. It is not drawn when the report is not found.
- No new Books screen and no new route.

## 3. Behavior

- **What counts (Q2).** The report reads payments by their payment date. A payment row is one of:
  - a posted ledger line of an entry that is not a bill, a vendor credit, an invoice, a credit memo or a write-off (an expense counts on its date, which is its payment date; a journal entry line counts on its date);
  - a cash-basis share row (`books_cash_basis_lines` with `payment_entry` set): the share of a bill's line that a bill payment paid, on the payment's date; the share of a bill's line that a vendor credit paid, on the application's date; and the share of a vendor credit's line that was applied or refunded, on that date, below zero.

  A row counts when it is posted, dated in the period, on an account of the types Cost of goods sold, Expense or Other expense, and names a vendor. A row's figure is its debit minus its credit. A bill counts only as far as it is paid, and in the year it is paid. A draft and a void document have no row that counts; a void's reversal cancels the original. The rows the report leaves out (a bill's and a vendor credit's own ledger lines, and the cash-basis rows that take them out) add up to zero for each vendor, account and day, so for each vendor the report's All payments equals the vendor's Total in the Expenses by Vendor on Method = Cash for the same period (with Form = NEC and MISC).
- **Journal entries (Q3).** A journal entry line on an expense account that names a vendor counts on the entry's date and is never a card payment. A line that moves an amount from one account to another for a vendor moves it between boxes.
- **Card payments (Q4).** A payment is a card payment when its document (an expense, a bill payment or a vendor refund) has the payment method Credit card or Debit card, or is paid from (a vendor refund: refunded to) a credit card account. The server marks the payment's journal entry (`card_payment`) when it posts it, and a reversal of the entry carries the same mark. A card payment is never reportable: the card processor reports it on a 1099-K.
- **Boxes.** A row's box is the box of its account (Settings → 1099s) at the time the report runs. An account with no box has no box ("Not reported"). A change of an account's box moves the account's payments of every year.
- **Rows (direction A).** Two levels, then the payments:
  1. the vendor: its name, then " (inactive)" when it is inactive, then " (legal name: <legal name>)" when the vendor has a legal name that differs from its name, ignoring case (Q10). An inactive vendor's row is muted (core `groups[].muted`);
  2. the box under the vendor: "NEC 1 · Nonemployee compensation", "MISC 1 · Rents" and the other eight labels of `box1099Label` (Books `lib/form-1099.ts`), in the order of the box list, then **Not reported** (accounts with no box) last;
  3. the payments of the box, in date order, then posting order (`entry.posted_at`), then `position`.

  The vendor level is open when the report opens (core `groups[].open`), so each vendor shows its boxes; the box level is closed (Q11). Expand all and Collapse all are core's. The report ends in one Total row. A vendor with no payment row in the period has no row (Q19).
- **Columns (Q5).**
  - **Reportable**: the rows that are not card payments and are on an account with a box.
  - **Excluded**: the card payments and the rows on accounts with no box. Blank when zero.
  - **All payments**: every row; Reportable plus Excluded.

  The Total row adds the vendors the report shows (core `columns[].total: "rows"`), so under a threshold choice the Total is the total of the shown vendors.
- **Opening a payment (Q17).** A press on a box row opens it in place into one row per payment row, labelled "<date> · <type> <number> · <account> · <description>", as an opened line of the Expenses by Vendor (`expenseDetailLabel()`), followed by " · paid by card" on a card payment. A bill payment's share reads "2026-05-08 · Bill payment 14 · 6210 Design Tools · Bill 1058 paid (cash basis)". A press on a payment opens its document's read view, or the journal entry (core `detail.open` with Books `entryOpenPath()`; p5-drill-down, unchanged).
- **Params.**
  - **Period** (core `dateRange`), default **This calendar year** (Q7; core extension E1 adds the presets This calendar year and Last calendar year). The calendar year is January 1 to December 31, whatever the Books fiscal year start is. Core's period picker also offers its other presets and Custom; the threshold is then compared with the payments of that period.
  - **Show** (choice; Q6): **At or above the threshold** (default): 1099 vendors whose Reportable in the run is equal to or more than the threshold setting. **Below the threshold**: 1099 vendors whose Reportable is less than it. **All 1099 vendors**: every vendor with Track payments for 1099 on. **Not tracked for 1099**: vendors with tracking off that have payment rows, so the reader finds a vendor that was not marked. The document header prints "Vendors: <choice>".
  - **Form** (choice; Q9): **NEC and MISC** (default), **1099-NEC** (box NEC 1), **1099-MISC** (the MISC boxes). With a form picked, rows of the other form's boxes and of accounts with no box are left out, and the threshold is compared with that form's Reportable. The document header prints "Form: <choice>".
  - **Vendor** (Books `vendorsParam()`: multiple, every vendor by name). Unset = every vendor of the Show choice. The document header prints "Vendor: …" for the picks.
  - **Order** (choice): **Name** (default; by name, ignoring case) or **Largest reportable** (by Reportable, largest first).
- **Threshold (Q6, Q8).** The threshold is `books_settings.threshold_1099` (Settings → 1099s), read when the report runs. One threshold applies to a vendor's Reportable across the boxes of the run. The document header prints "1099 threshold: $2,000.00" under the other header lines (core extension E2). The exports print the line too.
- **Tax ID.** The report shows no tax ID (Q10). Settings → 1099s lists the 1099 vendors with the last four digits or "Missing tax ID".
- **Heading.** The Books business name, "1099 Summary and Detail", the period in words, then "Vendors: …", "Form: …", "Vendor: …" for picked vendors, and "1099 threshold: …" (core `ReportDocumentHeader`, `Source.Heading`, `params[].header`, E2).
- **Empty.** A run with no row to show (no 1099 vendor, no payment in the period, or no vendor at or above the threshold) shows core's empty report text for the period (`emptyMessage`) and no rows.
- **Live (Q14).** The report is not live: it reads `books.basis_lines`, a source core marks NotLive, and it ships with `Live: false`, as the Expenses by Vendor does. The open report shows Refresh. A post or a void, a change of an account's box, of a vendor's tracking or of the threshold shows after a press on Refresh.
- **Loading, error and Retry, Refresh, Customize, Save as, copy link, share and the Export menu (CSV, Excel, PDF, email):** core's report view, unchanged. PDF writes the rows the view shows with their folds; CSV and Excel open every vendor and every box.
- **Phone.** A phone arrangement (`display.layouts`, width `mobile`, 3 tracks) puts the label on line 1 (span 3) and Reportable, Excluded and All payments on line 2. A long vendor label and a payment's label wrap to at most three lines (`whiteSpace: "normal"`, `lineClamp: 3`); the figures are never cut (`minWidth: "max-content"`). Phase 3 pass 2 measures `oneLine.minWidth` for this report's own columns at 375 and 390, and proves that three figures of eight digits fit one phone line; when they do not, the arrangement puts All payments on line 3.
- **Performance (Q15).** On the Expenses by Vendor's L dataset with 1099 marks added, each run of the report meets the time bars and each SQL statement of each run meets the query-plan bars of §8, and the measured results are in the helix ledger.
- **Help.** `help/reports.md` gains "Read the 1099 Summary and Detail report": what counts (payments by payment date; a bill counts when it is paid), what a card payment is and why it is excluded, what Reportable, Excluded and All payments are, the Not reported row and what to do about it (give the account a box in Settings → 1099s), how the threshold applies and where to change it, the Show, Form and Order choices, that the period is a calendar year, how to open a box and a payment, that the report shows no tax ID, and that it needs Refresh. Its "Who sees Books reports" and "Reports that you refresh" lists gain the report. `help/1099-tracking.md` and `help/vendors.md` name the report and link to the section.

## 4. Data

Collections read: `books_journal_lines`, `books_cash_basis_lines`, `books_journal_entries`, `books_accounts`, `books_vendors`, `books_settings`.

**New field (Q4).** `books_journal_entries.card_payment` (bool), server-owned: no client sets it (pinned with `@request.body.card_payment:isset = false` in the entry's create and update rules). Migration `2100000002_create_books_ledger.js` is edited in place (Books is unreleased; p3-vendor-1099 edited the same file). Posting sets it on the entry of an expense, a bill payment and a vendor refund: true when the document's `payment_method` is `credit_card` or `debit_card`, or its payment account (`paid_from`; the vendor refund's Refunded to account) has the type `credit_card`. `server/reversal.go` copies it to a reversal. Every other entry has false. **Copies on the lines (Q21 changed, §11):** `books_journal_lines` and `books_cash_basis_lines` carry server-owned copies of their entry's `card_payment` and `doc_type`, written on every line create and cash-basis rebuild and kept equal to the entry's, so this report reads them from the row and never reads the entry for them.

**Report sources (`server/report_sources.go`).**

- `books.journal_entries` gains `card_payment` (Bool, "Card payment").
- `books.basis_lines` gains the to-one link `payment_entry` ("Payment entry", target `books.journal_entries`), mapped by the cash part only; the ledger part reads blank. It also gains `card_payment` (Bool, "Card payment") and `doc_type` (Select, "Document type", the entry's options), mapped by both parts from the row's copies (Q21 changed, §11).
- `books.accounts` gains `form_1099_box` (Select, "1099 box", options from `boxes1099` with the labels of `box1099Label`).
- `books.vendors` gains `track_1099` (Bool, "Track payments for 1099"), `legal_name` (Text) and `tax_id_type` (Select: EIN, SSN), as the 1099 settings spec planned (its packet Q14). `tax_id` stays out of every source.
- New source `books.settings` ("Books settings", collection `books_settings`, list rule: Books readers): `threshold_1099` (Money, "1099 threshold", currency field `currency`) and `currency` (Text, `SameCurrencyAs: "books.journal_lines.currency"`). No other settings column is a field.

Adding a field or a link changes no shipped report's spec JSON (the sha tests of the other reports prove it).

**The report spec** (`server/report_form_1099.go`: `form1099Key`, `form1099Shipped()` with Revision 1 and `Unpublished: true`, `form1099Spec()`), base `books.basis_lines`:

- params: `period` (`ParamDateRange`, default preset `thisCalendarYear`, E1); `show` (choice `meets` default, `below`, `tracked`, `untracked`; header "Vendors: {label}"); `form` (choice `all` default, `nec`, `misc`; header "Form: {label}"); `vendorsParam()`; `order` (choice `name` default, `amount` "Largest reportable");
- filter: `posted = true` and `date between period` and `account.type in typesInGroup("expense")` and the payment-row term (`layer = "ledger"` and `doc_type` (the row's copy of its entry's) not in the five deferred doc types of `cashDeferrals`, or `layer = "cash"` and `payment_entry` not blank) and `vendor` not blank and `vendor.track_1099` = (`show` ≠ `untracked`) and `vendorKey in vendors` and the form term (`form = "all"`, or `account.form_1099_box` in that form's boxes);
- net = `debit − credit`; card = `card_payment = true` (the row's copy of its entry's); boxed = `account.form_1099_box` not blank;
- columns: `name` (Vendor; the `vendor` link), `reportable` (`sum(if(boxed and not card, net, 0))`), `excluded` (`blankZero` of the column `excludedSum`, with the default total and no aggregate, so it is blank when zero on a payment, a box, a vendor and the Total row), `all` (`sum(net)`); `reportable` and `all` have `total: "rows"`; hidden `excludedSum` (`sum(if(boxed and not card, 0, net))`, `total: "rows"`), `vendorKey` (the `vendor` link) and `boxKey` (`account.form_1099_box`). A hidden column is in no cell, Customize entry or export;
- groups: `byVendor` (Books `vendorGroup()` with the legal-name part added to its label by a local wrapper, `open: true`, `hideEmpty` off, `having`: `show` is `tracked` or `untracked`, or `show = "meets"` and `sum(reportable net) ≥ threshold`, or `show = "below"` and `sum(reportable net) < threshold`), then `byBox` (col `boxKey`; label: a `case` over the box keys, "Not reported" for blank);
- threshold = `lookup` on `books.settings`, value `threshold_1099`, pick `min` (the collection has one row);
- header (E2): one line "1099 threshold: {value}" with that lookup as its value;
- sort: `vendorSortBy("amount", <reportable net>, …)`: No vendor never shows; under Largest reportable the vendor's Reportable descending; then `lower(display_name)`; inside a vendor the boxes by a rank `case` over `boxKey` (the order of `boxes1099`, blank last); inside a box `balanceLineKeys()`;
- detail: label `form1099DetailLabel()` (`expenseDetailLabel()` and the card suffix), open `entryOpenPath()`;
- display: `name` wraps to three lines, the three figures `minWidth: "max-content"`, a `mobile` arrangement of 3 tracks, `oneLine.minWidth` measured in phase 3 pass 2.

Shared helpers in `server/report_spec_helpers.go`: used as they are: `vendorsParam()`, `vendorGroup()`, `vendorSortBy()`, `typesInGroup()`, `balanceLineKeys()`, `expenseDetailLabel()` (in `report_expenses_by_vendor.go`), `entryOpenPath()`, `blankZero()`. New, in the report's file: `form1099DetailLabel()`, `paymentRowFilter()`, `box1099LabelCase()`, `box1099RankCase()`, `thresholdLookup()`. No existing helper's output changes.

**Engine reach.** Existing core API, each with a Books run behind it: a union source with a per-part constant and a link one part maps (`books.basis_lines`; core docs "A key a part does not map reads blank there"); `between` on a `dateRange`; choice params with `Header`; `groups[].open`, `muted`, `having`, `label`; a `lookup` inside a level condition (A/R Aging `arGroups()`); a comparison of two amounts whose currency fields declare `SameCurrencyAs` (core `formula.go`); `columns[].total: "rows"` (Trial Balance); `sort[].formula`; `detail.label`, `detail.open`; `display.oneLine` / `layouts` / `columns`. No pivot, no `fill`, no `inline`. Phase 4 pins with Go tests: that the Total under `having` adds the shown vendors only; that the payment-row filter gives, for each vendor and account, the sum of `basisFilter()` on Cash; and that `having` reads the lookup. If core gives another result, that is a core task, not a Books workaround.

**Core extensions (checkpoint 0; core branch `books/p5-1099-report`; the core PR merges at the next design gate, before the Books PR). All three name no package.**

- **E1. Calendar-year period presets.** `thisCalendarYear` and `lastCalendarYear` in `core/server/reports/params.go` (January 1 to December 31 of the reader's current or last year, whatever the source's `FiscalStartMonth`) and in `core/reports/lib/params.ts` with the labels "This calendar year" and "Last calendar year"; core's period picker lists them. Core has only fiscal-year presets today, and Books lets the fiscal year start in any month.
- **E2. A document header line with a value the run reads.** `Spec.header: [{ text, value }]`: `text` holds `{value}` exactly once; `value` is a formula of params, values and lookups (no row, column or total), of type text, day, number or amount. The run adds each line to `headerLines` after the param lines, with the value written as the exports write a cell of its type (an amount with its currency); a blank value prints no line. The PDF and Excel exports print these lines under the period. Refused (400, `header.<i>`) for any other shape. Core's tests use a fictional package. Today `params[].header` prints a choice's labels only, and `columns[].heading` refuses a lookup, so no report can print a setting.
- **E3. A typed blank for a union key a part does not map.** `unionPartCols` in `core/server/reports/rules.go` writes a key that a union part does not map as a NULL with the affinity of the column the other parts map (numeric for a number or yes/no column, TEXT for every other field type), not as an untyped `NULL`. SQLite then flattens the UNION ALL into the outer query, so a filter on an account and a day reaches each part and each part is read by its indexes. The cell still reads blank. A key no part maps keeps `NULL`. Found by the phase 4 probe: with the untyped `NULL`, every run of this report scans both parts of `books.basis_lines` (the `payment_entry` link is mapped by the cash part only) and fails the plan bars of §8. Core's tests use a fictional package.

**Files (Books).**

- `pb-migrations/2100000002_create_books_ledger.js` (`card_payment`, its rule pins; the line copies `card_payment` and `doc_type`), `pb-migrations/2100000021_create_books_bill_payments.js` (the cash-row copies), `pb-migrations/2100000036_index_books_lines_account_date_covering.js` (the copies in the covering indexes) — Q21 changed, §11.
- `server/lines.go`, `server/immutability.go`, `server/posting.go`, `server/entries.go`, `server/cash_basis.go` (write and guard the line and cash-row copies), with `server/line_entry_copy_test.go`.
- `server/document_posting.go`, `server/expenses.go`, `server/bill_payment_posting.go`, `server/vendor_refund_posting.go`, `server/reversal.go` (set and copy `card_payment`), with Go tests: each payment method and account type on each of the three documents, a void, a correction.
- `server/report_sources.go` + `_test.go`.
- `server/report_form_1099.go` + `_test.go`: `CheckSources`, `Load`/`Validate`, the spec sha, and runs (with `newLedgerEnv` and `readerInfo`) over a book with: an expense by check, by credit card, by debit card and from a credit card account; a bill paid in two payments in two years; a bill paid by card; a bill paid in part by a vendor credit; a vendor refund; a journal entry line; a line on an account with no box; a vendor with two boxes; a vendor exactly at the threshold, one cent below, and below zero; an untracked vendor; an inactive vendor; a vendor with and without a legal name; a draft and a void; each Show, Form and Order choice; a changed threshold; a fiscal year that starts in July (the period stays the calendar year); the tie-out with an Expenses by Vendor run on Cash; a reader without Books access gets no rows.
- `server/report_form_1099_scale_test.go` (§8).
- `server/register.go` (`reports.RegisterShipped(form1099Shipped())`), `server/registrations_test.go`, `server/report_live_test.go`.
- `tinycld/books/lib/shipped-reports.ts` (`FORM_1099_SHIPPED_KEY`), `tinycld/books/components/vendors/VendorsList.tsx` (the menu item), `tinycld/books/components/settings/Form1099Section.tsx` (the button).
- `help/reports.md`, `help/1099-tracking.md`, `help/vendors.md`, `tests/help-reports.test.ts`, `tests/help-1099-tracking.test.ts`, `tests/help-vendors.test.ts`.
- `tinycld/books/lib/report-1099-fixture.ts` (phase 3 pass 2: a static `RunResult` and the display block for core `ReportView`, as `expenses-by-vendor-fixture.ts`).
- `tinycld/books/seed.ts` (Q16): phase 4 reads which posted payments the seed has for the five 1099 vendors on 6100 Rent and 6210 Design Tools; it adds only what is missing of: a vendor at or above the threshold with a non-card payment and a card payment, a vendor with two boxes, a vendor below the threshold, the inactive 1099 vendor with a payment, an untracked vendor paid on a boxed account, each on fixed 2026 dates. Before the edit, the build greps `tests/` and `tests/e2e/` for the accounts and registers the new rows use and updates each test that reads a changed figure.

**E2e** (`tests/e2e/books-report-1099.spec.ts`, titles "report-1099: …", with `report-1099-helpers.ts`, `expenses-by-vendor-helpers.ts`, `vendor-1099-helpers.ts`, `expense-helpers.ts`, `pay-bills-helpers.ts`, `books-report-helpers.ts` and core's report helpers). Open from the hub, from the Vendors list's Reports menu and from Settings → 1099s. With the Vendor filter set to vendors the test creates, a custom period in months no other spec reads, and its own expense account with a box set through Settings → 1099s (so every asserted figure is its own): an expense by check shows under Reportable in its box; an expense by credit card shows under Excluded with " · paid by card"; a bill shows nothing until a bill payment, then the paid share on the payment date; a payment on an account with no box is in Not reported; Show moves a vendor between At or above and Below around the threshold the header prints; an untracked vendor shows only under Not tracked for 1099; Form = 1099-NEC leaves out a MISC box; a press on a payment lands on its document; a new post shows after Refresh. One phone run (375 and 390) of an opened box: the two-line row and no sideways scroll. The spec does not change `threshold_1099` (a shared setting).

## 5. Cut

- A column for each box (direction B) and a second shipped report "1099 Detail": a box is a row under its vendor, and opening a box is the detail.
- A box-first arrangement (direction C).
- "Prepare 1099s", form printing, e-filing, the information sheet print, W-9 requests (Books scope: Later). PDF export prints the report.
- The tax ID on the report or in its exports (Q10).
- A threshold for each box (the IRS amounts differ by box): Books has one threshold setting; the Form choice compares one form.
- A threshold typed in the report: the setting is the one source.
- 1099 vendors with no payment in the period as 0.00 rows (Q19).
- Payments on asset, liability, equity or income accounts: only expense accounts have a box.
- Payments that name no vendor.
- A box as of the payment's date: the report reads the account's box as it is now.
- State boxes, backup withholding, 1099-K and other forms (1099 settings spec, Cut).
- Row density and zoom; notes on a report; Print.

## 6. Platform notes

None new. Inherited from core's report view and exports, signed off with p5-report-builder, p5-drill-down and p5-exports: `DocumentTitle` (web tab title), `web:[scrollbar-gutter:stable]`, the browser half of `useLeaveGuard`, hover underline and ⌘-click on row links, the file download path of exports. Keyboard shortcuts have standing approval.

## 7. Sparks carried

1. The reportable figure and what was left out of it are side by side on every row — the columns Reportable, Excluded and All payments; core `ReportRow` figure cells; `display.columns.<col>.minWidth: "max-content"`; the phone arrangement keeps the three figures on one line.
2. The grand total is the heaviest line — core `ReportRow` total row (`border-t-2 border-foreground`, `font-semibold`); no new token.

Core extensions: E1, E2 and E3 (§4), for behavior and performance, not for a spark.

## 8. Performance acceptance

The Expenses by Vendor's §8 applies (the A/P Aging's bars, required by the human on 2026-11-18) with the same query-plan bars, time bars and failure order, and with these differences only.

- **Where.** `server/report_form_1099_scale_test.go`, on the shared harness `server/report_scale_harness_test.go` and the Expenses by Vendor's dataset `writeEBVDataset` (unchanged), followed by a bulk pass of this report: 10 % of the vendors get `track_1099`, half of the expense accounts get a box (NEC 1 and three MISC boxes), and 20 % of the bill payment entries get `card_payment`. Sizes S and L; switch `BOOKS_SCALE=1`. The pass changes no row the other reports' recorded results read (it writes columns their specs do not read), except that it moves the `account` of rows (plan D11) and copies each row's entry's `card_payment` and `doc_type` onto it, as posting does.
- **Large tables.** `books_journal_lines`, `books_cash_basis_lines`, `books_journal_entries`.
- **Runs.** Each at S and at L: (1) default: a period that holds every line, Show At or above, Form NEC and MISC, Order Name, the first page; (2) Show = All 1099 vendors; (3) Show = Not tracked for 1099 (the largest vendor set); (4) Form = 1099-NEC; (5) Order = Largest reportable; (6) Vendor = five picked vendors; (7) run 2 with the box that has the most payments opened; (8) the CSV export of run 1.
- **Time bars.** At L, the median of 5 runs after one warm-up: runs 1 to 7 at 1,000 ms or less, and each at L at no more than 15 times its time at S. Run 8 as the Expenses by Vendor's run 8 (5,000 ms; at L either the CSV or core's 50,000-row refusal).
- **Plans.** Each statement, with no statistics and after a replayed ANALYZE (`server/testdata/form_1099_stats.json`, written by the scale run): no scan of a large table but the one outermost covering-index scan the bars permit; `books_journal_entries` by primary key only.
- **Record.** `docs/plans/report-1099-ledger.md`, section Performance, and `docs/plans/report-1099-evidence/perf-plans.md`.
- **A bar that fails.** The fix is at the source: an index by a new migration, the card mark copied to the lines by the server, or a core engine fix as a core task. It is never a design-around in the spec, and it stops the run for the human when it needs a core change. A plan-bar failure is diagnosed with a probe that changes one SQL term at a time. Every scale run is the driver's (`NEEDS-RUN`).

## 9. Merge order

- **p5-expenses-by-vendor** (books PR #85, core PR #513) merges before this unit builds. This unit's branch `books/p5-1099-report` starts from books `main` after that merge; core is `main` after #513, then the core branch `books/p5-1099-report` for E1, E2 and E3.
- This unit edits files that every report unit edits (`tinycld/books/lib/shipped-reports.ts`, `server/register.go`, `server/registrations_test.go`, `server/report_live_test.go`, `server/report_sources.go`, `tinycld/books/components/vendors/VendorsList.tsx`, `tinycld/books/seed.ts`, `help/reports.md`, `help/vendors.md`, `tests/help-reports.test.ts`). The unit that merges second keeps both sides.
- It edits posting files of p3-expense, p3-pay-bills and p3-vendor-refund (`server/document_posting.go`, `server/expenses.go`, `server/bill_payment_posting.go`, `server/vendor_refund_posting.go`, `server/reversal.go`) and migration `2100000002`: one added server-owned field, no change to what any entry posts.

## 10. Non-goals

- No new Books screen, collection or route.
- No change to what any entry posts, to the cash-basis rows (beyond the two copied fields of Q21 changed, §11), or to any other report's figures, spec JSON or Revision.
- No 1099 form, no filing, no tax computation, no TIN check.
- No change to the 1099 settings, the vendor form or the account box guard.
- No tax ID in any report source.
- No amounts in a second currency: Books posts in one currency.

## 11. Decisions (design gate, 2026-11-21)

- **Direction A**, picked by the human. B and C are cut.
- **Q1–Q21 accepted as recommended** (packet `packet.md` §Open questions). In short: Q1 title "1099 Summary and Detail", key `books.form_1099`, one report · Q2 cash-basis payment rows by payment date on COGS, Expense and Other expense accounts with a vendor; All payments ties out to the Expenses by Vendor on Cash · Q3 journal entry lines that name a vendor count, never a card payment · Q4 server-owned bool `books_journal_entries.card_payment`, set at posting (method Credit card or Debit card, or paid from a credit card account), copied to a reversal, migration `2100000002` edited in place · Q5 columns Reportable, Excluded (card payments and accounts with no box, "Not reported" box row), All payments · Q6 one threshold against the vendor's Reportable across the run's boxes, at the threshold is shown; Show choices At or above (default), Below, All 1099 vendors, Not tracked for 1099 · Q7 default period This calendar year · Q8 header prints "1099 threshold: $2,000.00" · Q9 Form choice NEC and MISC (default), 1099-NEC, 1099-MISC · Q10 vendor label with " (inactive)" and " (legal name: …)"; no tax ID anywhere · Q11 vendors open, boxes closed · Q12 direction A · Q13 hub, Vendors list Reports menu item, Settings → 1099s button "Open the 1099 report" · Q14 `Live: false` with Refresh · Q15 §8 performance bars · Q16 seed payments on fixed 2026 dates (after a grep of tests that read the changed figures) · Q17 payment row label "<date> · <type> <number> · <account> · <description>" + " · paid by card" · Q18 merge order §9 · Q19 no row for a 1099 vendor with no payment · Q20 files shared with p2-bank-deposit, p2-email-share, p4-reconcile (`2100000002_create_books_ledger.js`, `report_sources.go`, `register.go`, `registrations_test.go`, `seed.ts`): the unit that merges later merges `origin/main` and keeps both sides · Q21 this unit adds no new migration; `2100000036` belongs to the covering indexes (merged with #85).
- **Core extensions E1 and E2 accepted** (checkpoint 0, core branch `books/p5-1099-report`, not exclusive: added presets and an added optional `Spec.header`, no changed contract). The core PR merges at the next design gate or the phase end, before this unit's package PR.
- **Core extension E3 accepted** (the human, 2026-11-22, after the phase 4 probe): a typed NULL for a union key a part does not map (`core/server/reports/rules.go`, `unionPartCols`). It is part of checkpoint 0, in the same core PR as E1 and E2, not exclusive.
- **Excluded is blank when zero on every row** (the human, 2026-11-22): §3 stands as written, on payment, box, vendor and Total rows. The spec has a hidden column `excludedSum` with `total: "rows"` and the shown column `excluded` = `blankZero(excludedSum)` with the default total (§4). Excluded is never a recompute sum of its own: its Total would add the vendors that `having` hides.
- **Q21 changed: the card mark and the doc type on the line tables** (the human, 2026-11-22, option 1 after probe 3 at L, checkpoint 4): run 3 (`show: "untracked"`) missed the 1,000 ms bar of §8 because `w` read `books_journal_entries` on every row for the card mark and the doc type. `books_journal_lines` and `books_cash_basis_lines` gain two server-owned copies of their entry's `card_payment` and `doc_type`, kept in step on every write path, and the covering indexes of `2100000036` hold them (and `payment_entry` on the cash rows); the spec reads the line columns. Migrations `2100000002`, `2100000021` and `2100000036` are edited in place (unreleased); still no new migration file. Probe 3 at L: run 3's statement CPU median 603 ms against 1,435 ms as built, same rows.
- No platform-only item.
