# A/R Aging — design

Unit p5-ar-aging · package `books` · feature `ar-aging`. Approved at the design gate by the human on 2026-11-18: direction **A** (one report; a customer opens into its open items), the 16 packet questions answered as the packet recommends, and one added requirement (§9 Performance acceptance). Built against books `main`@94fb583 and core `main`@470a6f7b. Source of scope: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Reports: … A/R and A/P aging … Every report … is a published report of the core report engine") and §Report engine. A mark (Qn) names the packet's question n.

## 1. Goal

A shipped Books report that shows what each customer owes on one day, split by how many days each open item is past its due date, and that opens a customer into its open invoices and credits.

## 2. Where it lives

- A shipped report `books.ar_aging`, title **A/R Aging** (Q15), description "What each customer owes on one day, by how long each open invoice is past due." It opens in core's report view (`/a/reports/<id>`) and is listed in the Books Reports hub (`/a/reports?package=books`). Like every `books.*` shipped report it is `Unpublished` and shared with every Books reader by `server/report_shares.go` (its filter `shipped_key ~ 'books.%'` covers the new key).
- The Customers list's Reports menu (`ShippedReportsMenu` in `tinycld/books/components/customers/CustomersList.tsx`) gets an item **A/R Aging** after Customer Balance (Q14), test id `customers-reports-aging`, through `useShippedReportHref('books.ar_aging')`; the item is not shown while the report is not found.
- No new Books screen and no new route.

## 3. Behavior

- **Open items (Q2).** The report reads the posted journal lines on accounts of type `accounts_receivable`, dated on or before the As of day, and gives each line to one open item:
  - An invoice is one item. Its open amount on the day is its total less the amounts that posted payments dated on or before the day apply to it.
  - A payment is one item for the part of it that is applied to no invoice (`credited`). The item is a credit: a negative figure.
  - A credit memo is one item for its total, a negative figure (nothing applies a credit memo yet).
  - A posted journal entry line on Accounts receivable that comes from none of these documents is one item for its debit less its credit.
  - A void document and its reversal are one item that adds up to zero; a voided payment reads as never applied.
  - An item whose amount on the day is zero does not show.
- **The figures tie.** A customer's Total is its figure on the Customer Balance for the same day and the Open figure of its page for today. The report's Total is the Accounts receivable figure of the Balance Sheet for the day. This holds because every row comes from a posted Accounts receivable line, and a payment's line is split into its applications and its unapplied part, which add up to the line.
- **Age (Q4).** An item's age is the days from its due date to the As of day. An invoice has a due date. Every other item ages from its own date (Q6).
- **Columns (Q5).** **Customer** (the label), **Due date**, **Current** (age 0 or less: not yet due), **1 - 30**, **31 - 60**, **61 - 90**, **91 and over**, **Total**. An item's amount is in the one age column of its age and in Total. A customer row, a family total and the Total row add their items in each column. An age column with no money on a row is blank, on the Total row too (Q11); Total always shows a figure. Due date shows on an item row only.
- **Rows (Q8).** As the Customer Balance: level 1 is the family (the customer's parent, or the customer when it has no parent), level 2 the customer, and here level 3 the open item.
  - A family draws a header row with the parent's name, open when the report opens, one row per customer of the family that has an open item (the parent's own row first, then sub-customers by name), then "Total <parent name>", when a sub-customer of the family that is in the Customer pick has a receivable row dated on or before the As of day. The row counts when its item is paid in full too: a family whose only sub-customer has no open item keeps its header, the parent's row and its total.
  - Every other family draws no family row and no family total: its one customer row is at depth 0 (core `groups[].inline`). The No customer row is always drawn so.
  - A customer with no open item on the day does not show (core `groups[].hideEmpty`); a family with no shown customer does not show.
- **Opening a customer (Q10).** A press on a customer row opens it in place into one row per open item, labelled "<type> <number>" ("Invoice 1042", "Payment 17", "Credit memo 3", "Journal entry JE-12": the number is the item's entry number as Books prints it), with its Due date and its open amount in its age column and in Total. Items are in due-date order, oldest first, then by number.
- **Opening an item (Q10).** A press on an item row opens it in place into its lines: the document's own line and, for an invoice, one line per payment applied on or before the day, each labelled "<date> · <type> <number>" (the date as its ISO day, "2026-11-03 · Payment 317") with its amount (the invoice positive, a payment negative) in the item's age column and in Total. The lines add up to the item's open amount.
- **Opening a line.** A press on a line opens its document's read view or the journal entry (core `detail.open` with Books `entryOpenPath()`): beside the report at 1360 px and wider where Books registers a report panel for the path, else as its own screen (p5-drill-down, unchanged).
- **No customer (Q9).** Accounts receivable lines that name no customer form one plain row "No customer", after every customer; it opens into its items like a customer row. With customers picked in the filter it does not show.
- **Params.**
  - **As of** (core `asOf`), default **Today** (Q7). A past day shows the items as they were open on that day.
  - **Customer** (Books `customersParam()`, unchanged: multiple, sub-customers under their parent with "All <parent> sub-customers"). The document header prints "Customer: …" for the picks.
  - **Order** (choice, Q12): **Name** (default) or **Largest balance** (by Total, largest first; a family by its total; customers inside a family the same way).
- **Inactive customers (Q13).** As the Customer Balance: the row is muted (core `groups[].muted`) and its label ends with " (inactive)".
- **Heading.** The Books business name, "A/R Aging", "As of <day>" (core `ReportDocumentHeader`, `Source.Heading`).
- **Empty.** With no open item on the day the report shows core's empty text for the day (`emptyMessage`) and no rows.
- **Live.** A post or a void of an invoice, a payment, a credit memo or a journal entry, an invoice or payment correction, a customer rename or re-parent, or a Books settings change re-runs an open report. The run's topics are `collection/books_receivable_items`, `collection/books_customers` and `collection/books_settings`. Books refreshes the stored receivable rows inside the transaction of each write that changes one and touches the table's change signal there (core `changesignal.Touch`), so the signal fires after the commit and never for a write that is rolled back. An account's type cannot change while a line uses the account, so it moves no row.
- **Loading, error and Retry, refresh, Customize, Save as, copy link, share and the Export menu (CSV, Excel, PDF, email):** core's report view, unchanged. PDF writes the rows the view shows with their folds; CSV and Excel open every group.
- **Wide.** The eight columns are on one line where the rows are 940 px wide or wider (`display.oneLine.minWidth: "940px"`, measured in phase 3 pass 2 on `/a/reports/<id>`: a 1024 px window and wider); every figure column is `minWidth: "max-content"`; the Customer column wraps to at most three lines.
- **Phone and narrow widths.** Below the one-line width a `display.layouts` arrangement wraps each row, with no sideways scroll. On a phone (three tracks) the label and the Due date are on the first line, Current, 1 - 30 and Total on the second, and 31 - 60, 61 - 90 and 91 and over on the third: Total always has a figure, so the second line is on every row and a figure's place always names its age (human, 2026-11-18, finding F1 of the ledger, option a). On a tablet (rows of 640 px to 939 px, twelve tracks) the label and Total are on the first line and the Due date and the five ages on the second. Phase 3 pass 2 measured both for this report's own columns, the phone one at 375 and 390 and the tablet one at 900.
- **Performance.** On a book with 500,000 journal lines, each run of the report meets the time bars and each SQL statement of each run meets the query-plan bars of §9 (Performance acceptance), and the measured results are in the helix ledger.
- **Help.** `help/reports.md` gains "Read the A/R Aging report": what an open item is, how age is counted, where credits show, why a customer's Total equals the Customer Balance and the report's Total equals the Balance Sheet, how to open a customer, an item and a document, the As of day, the Order choice. `help/customers.md` links to it.

## 4. Data

One new migration, `pb-migrations/<number>_create_books_receivable_items.js`. Its number is the next free number in `pb-migrations/` when the checkpoint that adds it commits (2100000026 on 2026-11-18). Unit p3-vendor-pages (another lane) may also add 2100000026: when that unit merges first, the integration renames this file to the next free number; nothing else names the number. An index that §9 needs is created in this same migration. It creates one base collection, `books_receivable_items`, with the Books read rule (`books_access` `can_read`) on list and view, and no create, update or delete rule. Only Books writes it; a REST write is refused, a superuser's too.

The stored table (p5-report-perf, human 2026-11-18) replaced two view collections that computed the same rows on every read. The views were too slow at the L size of §9: a run read every receivable row of the book's history.

Each row is a part of one item. Columns: `source` (select: `line` or `application`), `customer`, `entry`, `date`, `currency`, `debit`, `credit`, `item` (text), `item_kind` (text: `invoice`, `payment`, `credit_memo`, else `entry`), `item_number` (text: the item's entry number), `item_seq` (integer: the item's entry `sequence`, the number that `item_number` formats in `server/numbering.go`), `due_date` (text day), `settled` (text day).

- `source = line` — one row per posted journal line on an `accounts_receivable` account: `id` is the line's id, `item` the document id of the line's entry, else of the entry it reverses, else the line's id; `due_date` the invoice's due date for an invoice item, else the date of the item's first entry, so a reversal ages with what it reverses. On the Accounts receivable line of a posted payment's own entry, `credit` is the payment's `credited` (the unapplied part), not the whole amount.
- `source = application` — one row per `books_payment_applications` row of a posted payment: `id` is the application's id, `customer` and `currency` the payment's, `entry` the payment's entry, `date` the payment's date, `debit` 0, `credit` the application's amount, `item` the invoice id, `item_kind` `invoice`, `item_number` and `item_seq` the invoice entry's, `due_date` the invoice's.
- `settled` — the day the balance of the row's customer and item becomes zero and stays zero; `9999-12-31` while the item is open. It is computed per customer and item (the report's item level is under its customer level), so an item whose rows name two customers is not dropped while one customer's part is open. A payment's void opens its invoice again: zero for a time is not settled. `settled` has no rule for sub-customers, and a customer change moves no `settled` day.

Indexes: `(entry)`, `(item)`, `(customer, item, date)`, `(settled, date)`; and `books_accounts (type)`, which the whole-book queries start from.

The definition of a row is two SQL constants in `server/receivable_items.go` (`receivableLinesSQL`, `receivableApplicationsSQL`); the migration holds no SQL of a row. Three things read them:

- **Refresh** (`server/receivable_refresh.go`), after the record write and inside its transaction, at four hook points: an update of a journal entry that is not a draft (a post of any kind: manual entries, documents, reversals, void reversals, auto-reverse, opening balances); an update of a payment (post, void, replacement by a correction); an update of a payment application (an invoice correction moves it to the correction); an update of an invoice that is not a draft (its due day and its entry reach the rows). A refresh deletes the stored rows of the entry, payment or invoice, stores the rows the queries give, computes `settled` again for each customer that lost or gained a row, and touches the change signal. It refuses to run outside a transaction. There is no hook on customers.
- **Rebuild** (`rebuildReceivables`): every row of the book again, for a book written past the hooks. `POST /api/books/balances/rebuild` runs it when the rows drifted and answers the drifted rows as `receivableDrifts`.
- **Verify** (`verifyReceivables`): the stored rows compared with the queries, both ways, and each `settled` with its computed day. The Go test helper `requireNoDrift` runs it, so every posting test checks the stored rows.

One report source, `books.receivable_items` (`server/report_sources.go`), over the collection `books_receivable_items`: fields `date` and `due_date` (`Date`, `TextDay`, `MinMax`), `debit` and `credit` (`Money`, `SumAll`, `Currency: "currency"`), `currency`, `item` (`Text`), `item_kind` (`Select`: Invoice, Payment, Credit memo, Journal entry), `item_number` (`Text`, `MinMax`), `item_seq` (`Number`, `MinMax`: items sort by it, since "JE-10" sorts before "JE-9" as text), `settled` (`Text`); links `customer` → `books.customers` and `entry` → `books.journal_entries` (to-one); `Heading`, `FiscalStartMonth`, `Currency` and `Watch` as `books.journal_lines`. `settled` is a `Text` field, not a `Date` field: core compares a text field as the bare column, which the index `(settled, date)` serves, and wraps a date field in `substr` and `NULLIF`, which no index serves. A customized copy of the report can show the column; an open item shows `9999-12-31`. The source `books.customers` gains the to-many link `receivable_items` → `books.receivable_items` (`BackField: "customer"`), which the family level reads.

The report spec (`server/report_ar_aging.go`: `arAgingKey`, `arAgingShipped()` with Revision 1 and `Unpublished: true`, `arAgingSpec()`), base `books.receivable_items`:

- params: `asOf` (`ParamAsOf`, default preset `today`); `customers` (`customersParam()`); `order` (choice `name` default, `balance`);
- filter: `settled > asOf` and `date <= asOf` and `customerKey in customers`. An item whose balance is zero on the day and stays zero adds nothing to any sum, so its rows are not read; an item paid after the day is read whole;
- net = `debit − credit`; age = `diffDays(due_date, asOf)` (core `diffDays(a, b)` is b − a);
- columns: `name` (Customer; the customer link); `due` (Due date; `min(due_date)`, `blankAbove: "byItem"`, `detail: "blank"`); `current`, `d30`, `d60`, `d90`, `d91` (each `blankZero(sum(if(<age in the column's range>, net, 0)))`); `total` (`sum(net)`); hidden group keys `topKey` (`coalesce(customer.parent, customer)`), `customerKey` (the customer link), `itemKey` (`item`), and the hidden sort column `itemNo` (`min(item_seq)`, `blankAbove: "byItem"`, `detail: "blank"`);
- groups: `byTop` on `topKey` (open, subtotals, `hideEmpty`, label `coalesce(display_name, "No customer")`, `inline` when the family key is blank (No customer) or a lookup counts 0: the count of `books.customers` rows whose `parent` is the family's record, that are in `customers`, and that have a `receivable_items` row with `date <= asOf` (core `lookup` with `exists` over the to-many link). The lookup reads the stored rows, settled ones too: the spec filter does not apply inside a lookup. The Customer Balance keeps `customerFamilyGroups()`'s row rule; `arGroups()` replaces it for this report only); `byCustomer` on `customerKey` (`hideEmpty`, the label and `muted` of the Customer Balance); `byItem` on `itemKey` (label `concat(<label of min(item_kind)>, " ", min(item_number))`; `having`: `sum(net) ≠ 0`);
- sort: the parent's own row first inside a family; No customer last (its key comes before the balance key, so it stays last under Largest balance too); when `order = "balance"` the level's `sum(net)` descending; families and customers by `lower(display_name)`; items by `min(due_date)`, then `itemNo` (`min(item_seq)`, the number as an integer); lines by `date`, `entry.posted_at`;
- detail: label `concat(date, " · ", <entry type label>, " ", entry.number)` (`entryTypeLabel` over the `entry` link), open `entryOpenPath()`;
- display: `name` wraps (`whiteSpace: "normal"`, `lineClamp: 3`), every figure column and `due` `minWidth: "max-content"`; `oneLine.minWidth: "940px"`; `layouts`: the tablet arrangement (`width: "tablet"`, `minWidth: "640px"`, 12 tracks: line 1 `name` span 10 and `total` span 2; line 2 `due`, `current`, `d30`, `d60`, `d90`, `d91`, span 2 each) and the phone arrangement (`width: "mobile"`, 3 tracks: line 1 `name` span 2 and `due`; line 2 `current`, `d30`, `total`; line 3 `d60`, `d90`, `d91`). The fixture's `AR_AGING_DISPLAY` holds the same values.

Engine reach. Every part is existing core API: a single-collection source, `diffDays`, `if`, `sum`, `min`, `columns[].blankAbove`, `columns[].detail`, `columns[].hidden`, `groups[].inline` / `hideEmpty` / `muted` / `having` / `label`, a `lookup` with `pick: "count"` and an `exists` over a to-many link inside a level condition, `sort[].formula`, `detail.label`, `detail.open`, `display.layouts`. One use is pinned by the Go test of checkpoint 1 (`CheckSources`, `Load`, `Validate`, a run): a group label that reads `min` of a text field on a group whose key is a text column. (Checkpoint 1 also pinned a union part that is a view collection; the stored table ended that use.) Per the human's rule (2026-11-01), a refusal there is fixed in core as checkpoint 0, not designed around.

Shared helpers, moved or added in `server/report_spec_helpers.go` so that p5-ap-aging and p2-statements reuse them: `customerFamilyGroups()` and `customerFamilySort()` (extracted from `report_customer_balance.go`, which then calls them; its spec JSON does not change, so its Revision stays), `agingColumns(age, net)` (the five age columns and Total).

Seed (Q16). `tinycld/books/seed.ts` gains, with fixed 2026 dates so that the seeded book fills several age columns: a part payment on a seeded invoice, one unapplied payment, and one more posted invoice. Before the edit, the build greps `tests/` and `tests/e2e/` for the seeded customers, the Accounts receivable account and the statement totals, and updates each test that reads a changed figure. Unit p3-vendor-pages also edits `seed.ts`: this unit's rows are added as their own block, and at merge both sides are kept.

Files (Books): `pb-migrations/<number>_create_books_receivable_items.js`; `server/receivable_items.go`, `server/receivable_refresh.go` (+ `receivable_items_test.go`, `receivable_stored_test.go`, `receivable_refresh_test.go`); `server/ledger.go`, `server/payments.go`, `server/sales_documents.go` (one bind line each); `server/balances.go` (the rebuild route); `server/oauth_scopes.go`; `server/report_ar_aging.go` (+ `_test.go`); `server/report_ar_aging_scale_test.go` (§9); `server/report_sources.go`, `server/report_sources_test.go`; `server/report_spec_helpers.go`; `server/report_customer_balance.go`; `server/register.go`, `server/registrations_test.go`; `tinycld/books/lib/shipped-reports.ts`; `tinycld/books/components/customers/CustomersList.tsx`; `help/reports.md`, `help/customers.md`, `tests/help-reports.test.ts`; `tinycld/books/lib/ar-aging-fixture.ts` (phase 3 pass 2: a static `RunResult` for core `ReportView`, as the Customer Balance fixture); `tinycld/books/seed.ts` (Q16).

Go test cases (`server/report_ar_aging_test.go`, with `newLedgerEnv` and `readerInfo`): an invoice not yet due, one in each age column, the edges (age 0, 1, 30, 31, 90, 91); a part payment; a payment dated after the As of day (the invoice is whole on the day); a paid invoice (hidden); an overpayment (the unapplied part as a credit item at the payment's date); a credit memo; a manual Accounts receivable journal line with a customer and one with none; a void invoice and a void payment (hidden, and the invoice open again); a corrected payment; a parent with its own item and two sub-customers; an inactive customer; the Customer filter; both Order choices; the customer Totals compared with `books_party_balances` and with a Customer Balance run of the same day; the Total compared with a Balance Sheet run; a reader without Books access gets no rows. For the stored table: the stored rows after each kind of post, with no rebuild; `settled` for a part-paid item, an item paid in two parts, an item paid on its own day, and an item opened again by a payment's void; an invoice correction that moves a live payment's applications; a refresh outside a transaction (refused); a REST write (refused, a superuser's too); verify finds a stale row, a missing row and a wrong `settled`; the rebuild route repairs them; an item paid in full is read whole on a day before its `settled` day and not at all from that day on; the family header with a settled sub-customer, on a day before the sub-customer's first row, and with the sub-customer left out of the Customer pick.

E2e (`tests/e2e/books-ar-aging.spec.ts`, with `books-report-helpers.ts` and core's report helpers): open from the hub and from the Customers list's Reports menu; a customer the test creates with an invoice it posts, read with a fixed As of day that puts it in 31 - 60, then with a day that puts it in Current; open the customer, see the invoice with its Due date; receive a part payment and see the item's amount fall and the payment line under the item; press the line and land on the payment; an overpayment shows a negative item; one phone run (375 and 390) of an opened customer with no sideways scroll. The spec posts documents dated mid-2026 or later, sets As of to fixed days, and asserts no total that depends on other specs' rows.

## 5. Cut

- A choice of the days per period and the number of periods (Q5): the periods are fixed at 30 days and four periods; Save as and the builder let a user change a copy.
- "Age by transaction date" (Q4): Books ages by due date; an item with no due date ages from its date.
- A separate "A/R Aging Detail" report (Q15, direction C): opening a customer is the detail.
- A "Days past due" column: the age column an amount sits in says it.
- A red tone on overdue figures: core's report view has no per-cell tone; the column says it.
- A description on the lines of an item: the source carries no memo; the line's document shows it.
- Rows = "With activity": the report lists open items only.
- A drill from an age figure of a customer row to a filtered report: the customer row opens in place.
- Statements, reminders and collection letters from the report (p2-statements).
- A link from the customer page's Overdue figure to the report.
- Compare to another day; row density; Print (PDF export covers it).

## 6. Platform notes

None new. Inherited from core's report view and exports, signed off with p5-report-builder, p5-drill-down and p5-exports: `DocumentTitle` (web tab title), `web:[scrollbar-gutter:stable]`, the browser half of `useLeaveGuard`, hover underline and ⌘-click on row links, the file download path of exports. Keyboard shortcuts have standing approval.

## 7. Sparks carried

1. How late money is reads from where the figure sits: one column per age, older to the right — one formula column per age; core `ReportTable`.
2. An age with no money is blank — Books `blankZero()`.
3. The grand total is the heaviest line — core `ReportRow` total row; no new token.

No core extension.

## 8. Non-goals

- No change to `books_invoices.balance`, `books_party_balances`, the customer page's Overdue figure, or payment posting.
- No client collection for `books_receivable_items`: only the report engine reads it.
- No upgrade path from the two views the table replaced: the migration is unreleased and was edited in place.
- No A/P aging (p5-ap-aging mirrors this spec over Accounts payable, bills and bill payments).
- No applying of credit memos or unapplied payments to invoices.
- No balances in a second currency: Books posts in one currency.

## 9. Performance acceptance

Required by the human (2026-11-18). This report is the first use of two core report features: a union source over view collections, and a group label that reads `min` of a text field. Since p5-report-perf the source is one stored table (§4), not a union over views; the runs, the dataset and the bars did not change. The build proves that its queries use indexes and stay fast on a large book. The checkpoint plan carries this section as acceptance of the checkpoint that adds the report, and no later checkpoint starts while a bar fails.

**Where.** `server/report_ar_aging_scale_test.go`, with `newLedgerEnv`. The runs call core `reports.Run` as a Books reader that is not a superuser (`readerInfo`), so the access rules are in the SQL. The statements of a run are read from the test app's database with dbx `QueryLogFunc` (precedent: `server/sales_document_deferral_test.go`), and each one is given to SQLite as `EXPLAIN QUERY PLAN <statement>`.

**Dataset.** Two sizes, written straight to the tables in one transaction with the columns that posting writes. The same test posts one invoice, one payment with an application, one credit memo and one journal entry through the real posters and compares their rows, column by column, with the rows of the bulk writer.

| | S | L |
|---|---|---|
| `books_journal_lines` | 50,000 | 500,000 |
| lines on Accounts receivable | about 18,500 | about 185,000 |
| customers (10% are sub-customers, in families of 2 to 6) | 200 | 2,000 |
| posted invoices | 10,000 | 100,000 |
| posted payments / payment applications | 8,000 / 9,000 | 80,000 / 90,000 |
| posted credit memos | 200 | 2,000 |
| manual Accounts receivable journal lines (1 in 10 with no customer) | 100 | 1,000 |
| void invoices and void payments, each with its reversal | 100 + 100 | 1,000 + 1,000 |
| open items on the last day | about 800 | about 8,000 |

The dates cover five years, and the other lines are entries on other accounts. A "large table" below is a table with 10,000 rows or more in L: `books_journal_lines`, `books_journal_entries`, `books_invoices`, `books_payments`, `books_payment_applications`, `books_receivable_items` (about 275,000 rows in L: the Accounts receivable lines and the applications). The bulk writer rebuilds the stored rows in its transaction, and the comparison with the real posters reads the stored rows too.

**Runs.** Each at S and at L:

1. Default: As of the last day of the data, Order Name, no Customer pick, the first page.
2. A past day: As of the middle day of the data.
3. Order = Largest balance.
4. Customer = one family (the parent and its sub-customers).
5. Run 1 with the customer that has the most open items opened.
6. Run 5 with that customer's oldest invoice that has a payment opened.
7. The CSV export of run 1 (core `reports` export, `export_csv.go`; every group open).

**Query-plan bars.** For each statement of each run at L, read two times: with no statistics, and after `ANALYZE`.

- No step is `SCAN books_journal_lines` or `SCAN books_journal_entries`: each is read with `SEARCH … USING INDEX`, `USING COVERING INDEX` or the primary key.
- No other large table has a `SCAN` step inside a loop (the inner side of a join, a correlated subquery, or a subquery that runs one time for each outer row). One `SCAN` of such a table as the outermost loop is permitted only in a statement that reads the whole book (runs 1, 2, 3 and 7).
- A statement that is bound to picked customers, one customer or one item (run 4, and the statements that runs 5 and 6 add to run 1) has no `SCAN` step of a large table.
- No step is `AUTOMATIC … INDEX` on a large table.
- No view or subquery over a large table is built whole (`MATERIALIZE`, `CO-ROUTINE`) and then scanned inside a loop.
- `USE TEMP B-TREE FOR GROUP BY` and `FOR ORDER BY` are permitted.

A plan check of the same statements at a small size (about 500 lines) is an ordinary Go test, so `tinycld-pkg check` and CI keep the plan bars. The S and L runs start only with `BOOKS_SCALE=1`; the build runs them one time for each change to the stored table, its queries, the indexes or the spec.

**Time bars.** At L, the median of 5 runs after one warm-up run, on the build machine:

- runs 1 to 6: 1,000 ms or less each;
- run 7: 5,000 ms or less;
- each run at L takes no more than 15 times its time at S (ten times the data), so no query grows faster than the data.

The test also records, with no bar, the time of a Customer Balance run of the same day on the same dataset.

**When a bar fails.** In this order: add an index in this unit's migration; rework the stored table (a column that lets an index apply or lets the report read fewer rows, as `settled` does) or the two queries that fill it. When the cause is the SQL that core's engine writes for the source, the family lookup or the `min` label, the fix is in core as checkpoint 0 (the human's rule of 2026-11-01); the build stops and reports it. A bar is never changed and a run is never removed to pass.

**Record.** The helix ledger (`docs/plans/ar-aging-ledger.md`, section Performance) holds: the machine, the date and the commit; the row counts of S and L; for each run, the number of statements and the median time at S and at L with the ratio; for each statement, one line with the tables it reads and the index of each read, before and after `ANALYZE`; each index added and each change to the stored table or its queries, with the plan step and the time before and after it; and the Customer Balance time. The full plan text of each statement is in `docs/plans/ar-aging-evidence/perf-plans.md`, committed with the checkpoint.
