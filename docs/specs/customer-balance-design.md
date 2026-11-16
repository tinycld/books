# Customer Balance — design (draft)

Unit p5-customer-balance · package `books` · feature `customer-balance`. Design gate approved 2026-11-16: direction **A** (families nested, one report), R1 accepted, open questions answered as recommended except Q11 (inactive customers are marked; core R2). Open invoices by customer (direction C) belong to p5-ar-aging. Built against books `books/p5-exports`@265d6e6 and core `books/p5-exports`@11fd89f3. Source of scope: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Reports: … A/R and A/P aging, customer and vendor balance …. Every report … is a published report of the core report engine") and §Report engine. A mark (Qn) names the packet's question n.

## 1. Goal

A shipped Books report that shows what each customer owes on one day, with a customer's sub-customers under it and a total for the family, and that opens a customer into the transactions that make its balance.

## 2. Where it lives

- A shipped report `books.customer_balance`, title **Customer Balance** (Q8), description "What each customer owes on one day, from posted transactions on Accounts receivable accounts." It opens in core's report view (`/a/reports/<id>`) and is listed in the Books Reports hub (`/a/reports?package=books`, the sidebar's Reports entry). Like every `books.*` shipped report it is `Unpublished` and shared with every Books reader by `server/report_shares.go` (its filter `shipped_key ~ 'books.%'` already covers the new key).
- The Customers list (`tinycld/books/components/customers/CustomersList.tsx`) gets a **Balance report** button in its header (Q9). It opens the report through the existing hook `useShippedReportHref('books.customer_balance')`; while the report is not found the button is not shown. The button is the taxes page's `LiabilityReportButton`, extracted to a shared `components/reports/ShippedReportButton.tsx` that both pages use.
- No new Books screen and no new route.

## 3. Behavior

- **What counts (Q3).** The report reads posted journal lines on accounts of type `accounts_receivable`, dated on or before the As of day. A customer's balance is its lines' debits minus credits. This is the Open figure of the customer's page (`books_party_balances`) on the same day, and the report's Total is the Accounts receivable figure of the Balance Sheet for that day. A draft or void document has no posted line, so it does not count; a void's reversal lines cancel the original.
- **Rows (direction A).** Level 1 is the family: the customer's parent, or the customer itself when it has no parent. Level 2 is the customer. Customers have one level of sub-customers.
  - A family whose lines name no sub-customer draws no family row and no family total: its one customer row sits at depth 0 (core R1, `groups[].inline`).
  - A family with a sub-customer line draws a header row labelled with the parent's name, open when the report opens (core `groups[].open`), then one row per customer of the family that shows — the parent's own balance first, as a row with the parent's name, then the sub-customers in name order — then "Total <parent name>" (core subtotal row).
  - The header row of a family folds and unfolds the family (core group row).
- **Columns.** **Customer** (the label) and **Balance**. On a customer row, a family total and the Total, Balance is the sum of debits minus credits. A credit balance is a negative figure (Q12); a family total and the Total net it.
- **Opening a customer.** Pressing a customer row opens it in place into one row per posted line (core detail rows), labelled `<date> · <type> <number> · <description>` (core `detail.label`; the type from `lineEntryTypeLabel()`, the description from `lineDescriptionFormula()`), with the line's debit minus credit under Balance: an invoice is positive, a payment negative. The rows are in date order, then posting order (`entry.posted_at`, `position`). They add up to the customer's Balance (Q7).
- **Opening a transaction.** Pressing a transaction row opens its document's read view or the journal entry (core `detail.open` with Books `entryOpenPath()`): beside the report at 1360 px and wider where Books registers a report panel for the path, else as its own screen (p5-drill-down, unchanged).
- **No customer (Q5).** Accounts receivable lines that name no customer (an opening balance, a journal entry with no name) form one plain row labelled "No customer", after every customer. It opens into its lines like a customer row. It keeps the Total equal to the Balance Sheet.
- **Params.**
  - **As of** (core `asOf` param), default **Today** (Q4).
  - **Rows** (choice): **Non-zero** (default) shows a customer whose balance is not 0; **With activity** also shows a customer with posted lines that net to 0 (Q6). Core `groups[].having` on the customer level; a family whose customers are all hidden is hidden with its total (core `groups[].hideEmpty`).
  - **Customer** (choice, `multiple`, `optionsFrom` the `books.customers` source, inactive customers included, sub-customers listed under their parent's name with a whole-group pick "All <parent> sub-customers": core `optionsFrom.group` and `groupLabel`) (Q10). Unset = every customer and the No customer row. With customers picked, the No customer row is not shown, and the document header names the picks (core view).
  - **Order** (choice): **Name** (default) or **Largest balance** (Q13). Name orders families and customers by name, ignoring case. Largest balance orders the depth-0 rows by their balance (a family by its total), largest first, and the customers inside a family the same way. Core `sort[].formula` over the level's total and the param.
- **Inactive customers (Q11, human 2026-11-16).** An inactive customer with a balance (or, under With activity, with lines) shows, marked as inactive: its row label and figure are in muted text (core R2, `groups[].muted` on the customer level, condition `inactive`), and its label ends with " (inactive)" so CSV, Excel, PDF and screen readers keep the mark. A family total is never muted. An inactive parent's own row is muted; its header is not.
- **Heading.** The Books business name, "Customer Balance", "As of <day>" (core `ReportDocumentHeader`, `Source.Heading`, the `asOf` param's words).
- **Empty.** A book with no posted Accounts receivable line on or before the day shows core's empty report text for the day (`emptyMessage`) and no rows.
- **Live.** A post, a void, a customer rename or re-parent, an account type change, or a Books settings change re-runs an open report (the run's topics: `books_journal_lines`, `books_accounts`, `books_customers`, `books_journal_entries`, `books_settings`).
- **Loading, error and Retry, refresh, Customize, Save as, copy link, share, and the Export menu (CSV, Excel, PDF, email: p5-exports):** core's report view, unchanged. An export writes the rows the view shows: an inlined family as its one row, a family as header, rows and total.
- **Phone.** Two columns fit one line. A long customer name wraps to at most three lines (`display.columns.name`: `whiteSpace: "normal"`, `lineClamp: 3`); Balance is never cut (`minWidth: "max-content"`). A transaction label wraps the same way. The toolbar's Customize and Export are under More (core). Phase 3 pass 2 measures the display block for this report's own columns at 375 and 390.
- **Help.** `help/reports.md` gains "Read the Customer Balance report": what counts, why a row equals the customer page's Open figure and the Total equals the Balance Sheet's Accounts receivable, what the No customer row is, how a family and its total read, how to open a customer and a transaction, the Rows and Order choices, and that a credit balance is negative. `help/customers.md` links to it.

## 4. Core checkpoint 0 (core branch `books/p5-customer-balance`; spec version 4, no bump)

| id | what | why | files (expected) |
|---|---|---|---|
| R1 | **`groups[].inline: <condition>`** on a group level that is not the last. A group for which the condition holds draws no group row and no subtotal; its child rows take its place, at its depth, in its place in the order. The condition reads what `having` reads (the level's totals, columns, record fields, params). An inlined group is not a row the reader opens or folds (`options.expand` and `options.collapse` do not name it); its children fold as usual, and a page's row count does not count it. Its rows count in the parent's totals and in the Total as before. Exports, the drill panel and the phone view read the same row tree. Refused on the last level, on a pivot's last level, on a bucketed level, on the first group of a layout report (sections always show), and when the condition is not a condition. The builder's group editor offers it as a per-level choice with a condition (as `having`). | A customer with no sub-customers must be one row, in name order among the families. `groups[].blank: "skip"` is refused on the first and the last level, and where it is allowed the skipped rows sit together at the blank key's place, not in name order. No setting leaves out a group's own row. | `core/server/reports/{spec,bind,levels,assemble,run,paging}.go`, tests with a fictional package; `core/reports/lib/{spec,types,rows}.ts`; `core/reports/components/builder/` group editor; core `help/reports.md`; `docs/packages.md` "Fields added in version 4" |
| R2 | **`groups[].muted: <condition>`** on any group level. A group row for which the condition holds carries `muted: true` in the row tree, and `ReportRow` draws its label and figures in `text-muted-foreground` (red and error figures keep their tone). The condition reads what `having` reads. Subtotal and total rows are never muted. Exports ignore it (the label carries any words the package wants). The builder's group editor offers it as a per-level condition (as `having`). | The human wants an inactive customer marked; no spec field changes a row's tone. | `core/server/reports/{spec,bind,assemble}.go`, tests with a fictional package; `core/reports/lib/{spec,types}.ts`; `core/reports/components/ReportRow.tsx`; the builder group editor; core `help/reports.md`; `docs/packages.md` "Fields added in version 4" |

R2 is small (an optional field); it rides in the same checkpoint 0 and core PR as R1.

**Size: major.** It changes the row tree a run returns and edits the engine files every report unit's checkpoint 0 edits, so the lane holds `exclusive` for checkpoint 0. It adds a core PR; the package builds on its branch, and it merges at the next design gate, before the package PR. Checkpoint 0 starts from core `main` after p5-exports' core PR merges (Q14), because exports read the row tree R1 changes.

Core tests: Go unit tests (an inlined first-level group among drawn ones in sort order; an inlined middle level; totals unchanged; fold options that name an inlined group ignored; paging across an inlined group; the refusals; an export of an inlined group), vitest for `lib/spec.ts`, `lib/rows.ts` and the builder draft round-trip, e2e on `salesstub` (wide and phone): a two-level report with inlined and drawn groups, fold a drawn group, open an inlined group's child.

The human accepted R1 at the design gate (2026-11-16); p5-exports' core PR #484 merged the same day, so checkpoint 0 starts from core `main`.

## 5. Data

Collections read (none new, no migration): `books_journal_lines`, `books_journal_entries`, `books_accounts`, `books_customers`, `books_settings` (heading, currency, fiscal month).

Report sources: unchanged. `books.journal_lines` already has the `customer`, `account` and `entry` links and `debit`, `credit`, `date`, `posted`, `position`; `books.customers` has `display_name`, `inactive` and the `parent` link.

The report spec (`server/report_customer_balance.go`: `customerBalanceKey`, `customerBalanceShipped()` with Revision 1 and `Unpublished: true`, `customerBalanceSpec()`), base `books.journal_lines`:

- params: `asOf` (`ParamAsOf`, default preset `today`); `rows` (choice `nonzero` default, `activity`); `customers` (choice, multiple, `optionsFrom` `books.customers`: value `id`, label `display_name`, group `parent.display_name`, `groupLabel` "All {group} sub-customers"); `order` (choice `name` default, `balance`);
- filter: `posted = true` and `account.type = "accounts_receivable"` and `date <= asOf` and `customerKey in customers`;
- columns: `name` (Customer; the customer link), `balance` (Balance; `debit − credit`, aggregate sum), and two hidden group keys: `topKey` = `coalesce(customer.parent, customer)` and `customerKey` = the customer link;
- groups: `byTop` on `topKey` (open, subtotals, label `coalesce(display_name, "No customer")`, `hideEmpty`, `inline` when the group has no line whose customer has a parent); `byCustomer` on `customerKey` (label the same way; `having`: `rows = "activity"` or `sum(debit − credit) ≠ 0`);
- sort: when `order = "balance"`, the level's `sum(debit − credit)` descending; then `lower(byTop.display_name)` (a blank name last, so No customer is last); inside a family the parent's own row first, then `lower(byCustomer.display_name)`; then the line keys `date`, `entry.posted_at`, `position`;
- detail: label `concat(date, " · ", <type label>, " ", entry.number, " · ", <description>)`, open `entryOpenPath()`;
- display: `name` wraps (`whiteSpace: "normal"`, `lineClamp: 3`), `balance` `minWidth: "max-content"`; `oneLine` and any phone layout are measured in phase 3 pass 2.

Shared helpers added to `server/report_spec_helpers.go`: `receivableLines(asOf)` (the posted, Accounts receivable, on-or-before filter terms) and `customersParam()`; p5-ar-aging and p2-statements read the same lines.

Why the figures hold: each posted line is on one account and names at most one customer, so it is in exactly one customer row; a family total adds its customer rows; the Total adds every row, the No customer row included, which is every posted Accounts receivable line on or before the day.

Files (Books): `server/report_customer_balance.go` (+ `_test.go`: `CheckSources`, `Load`/`Validate`, and runs over a book with an invoice, a partial payment, a paid-off customer, an overpayment (credit balance), a parent with its own balance and two sub-customers, a parent whose only lines are its own, a sub-customer whose parent has no line, an inactive customer, a void, an Accounts receivable line with no customer, a line after the day, both Rows choices, both Order choices, the Customer filter with a whole-group pick; the customer rows compared with `books_party_balances`); `server/report_spec_helpers.go`; `server/register.go` + `server/registrations_test.go`; `tinycld/books/components/reports/ShippedReportButton.tsx`, `components/taxes/TaxesPage.tsx` (uses it), `components/customers/CustomersList.tsx`; `help/reports.md`, `help/customers.md`, `tests/help-reports.test.ts`; `tinycld/books/lib/customer-balance-fixture.ts` (phase 3 pass 2: a static `RunResult` for core `ReportView`, as the Trial Balance fixture); `seed.ts`: the seeded invoices and payments already give Harborview Hospitality Group and Cedar & Pine Landscaping balances; the seed adds one posted invoice for the sub-customer Harborview Kitchen and one posted journal entry on Accounts receivable with no name, both dated in October 2026, and (phase 4, plan D2) one posted invoice for the long-named sub-customer St. Jude Annual Spring Gala and Silent Auction Catering and one posted Accounts receivable entry that names the inactive customer Old Mill Bakery, so a dev book and the e2e book show a three-line name and a muted row, after a grep of the unit and e2e specs that read those customers, the Accounts receivable account and the statement totals.

E2e (`tests/e2e/books-customer-balance.spec.ts`, with `books-report-helpers.ts` and core's report helpers): open from the hub and from the Customers list; a customer the test creates with an invoice it posts shows its balance, equal to the Open figure on its page; open the customer and see the invoice row, press it and land on the invoice; receive a part payment and see the balance fall; a sub-customer the test creates under it turns the row into a family with a total; Rows With activity shows a customer whose lines net to zero (phase 4, plan D3: a voided invoice in e2e; the paid-off customer is a Go case); one phone run (375 and 390) of a family and an opened customer. The spec posts documents dated mid-2026 or later (the shared book's close date) and asserts no total that depends on other specs' rows.

## 6. Cut

- A running balance column on the transaction rows (Q7): the rows add up to the customer's Balance in one figure column; a dated running balance is the customer statement's job (p2-statements).
- Terms, Due date and Open balance per document (screenshot 1; direction C): they describe open invoices today, not the balance on a day; the A/R aging report (p5-ar-aging) lists open invoices with their due dates (the human's decision, 2026-11-16).
- A second shipped report "Customer Balance Detail" (Q8): opening a customer row is the detail.
- "All customers" (zero-balance customers with no activity) in Rows (Q6): a customer that never had a receivable line adds nothing to a balance report.
- Compare to another period: not in the v0 scope line; Save as and the builder let a user build one.
- Row density and zoom: core's report view has neither; no Books report has them.
- A link from a customer row to the customer's page: a group row folds; the transaction rows open their documents.
- A link from the customer page's Open figure to the report filtered to that customer: the page's Transactions tab already lists them.
- Print: p5-exports gives PDF.

## 7. Platform notes

None new. Inherited from core's report view and exports, signed off with p5-report-builder, p5-drill-down and p5-exports: `DocumentTitle` (web tab title), `web:[scrollbar-gutter:stable]`, `useLeaveGuard`'s browser half, hover underline and ⌘-click on row links, the file download path of exports. Keyboard shortcuts have standing approval.

## 8. Sparks carried

1. Only a family of customers gets a header and a total; a customer with no sub-customers is one plain line — core R1 (`groups[].inline`), accepted at the design gate.
2b. An inactive customer's row reads muted — core R2 (`groups[].muted`), the human's Q11 answer.
2. The grand total is the heaviest line — core `ReportRow` total row (`border-t-2 border-foreground`, `font-semibold`); no new token.

## 9. Non-goals

- No new Books screen, collection, migration or report source.
- No change to `books_party_balances` or the customer page.
- No vendor balance (p5-vendor-balance mirrors this spec over Accounts payable; vendors have no sub-vendors, so it needs no R1).
- No aging buckets, no overdue marking, no statements.
- No balances in a second currency: Books posts in one currency.
