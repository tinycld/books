# Sales by Customer and Sales by Product/Service — design

Unit p5-sales-reports · package `books` · feature `sales-reports`. Direction **A** and every answer marked (Qn) were approved by the human at the design gate on 2026-11-17 (`docs/plans/auto-helix/p5-sales-reports.md`); Q15 was changed there (Sales by Customer has a % of sales column). Regenerated against books `main`@70207674 and core `main`@87ed80f9, after p2-credit-memo merged. Source of scope: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Reports: … sales by customer / by product …. Every report … is a published report of the core report engine") and §Report engine ("Books registers its report sources (… and later vendors, invoices, bills and products)"). A mark (Qn) names the packet's question n.

## 1. Goal

Two shipped Books reports that show what the business sold in a period, one by customer and one by product or service, each of which opens a row into the sale lines behind its figure and a sale line into its document.

## 2. Where it lives

- Two shipped reports: `books.sales_by_customer`, title **Sales by Customer**, description "What each customer bought in a period, from posted invoices and sales receipts, less posted credit memos, before sales tax."; and `books.sales_by_product`, title **Sales by Product/Service**, description "What you sold of each product and service in a period, from posted invoices and sales receipts, less posted credit memos, before sales tax." Each opens in core's report view (`/a/reports/<id>`) and is listed in the Books Reports hub (`/a/reports?package=books`). Like every `books.*` shipped report each is `Unpublished` and shared with every Books reader by `server/report_shares.go` (its filter `shipped_key ~ 'books.%'` covers the new keys).
- The Products and services list (`tinycld/books/components/products/ProductsList.tsx`) gets a **Sales report** button in its header (Q13): the existing `components/reports/ShippedReportButton.tsx` with `useShippedReportHref('books.sales_by_product')`; while the report is not found the button is not shown.
- The Customers list (`components/customers/CustomersList.tsx`) has the **Balance report** button today. It becomes a **Reports** menu button (Q13) with two items, **Customer Balance** and **Sales by Customer**: a new `components/reports/ShippedReportsMenu.tsx` (core `Menu`; an item shows only while its report is found; the button is not shown while no report is found). p5-ar-aging adds its item there.
- No new Books screen and no new route.

## 3. Behavior

Both reports:

- **What counts (Q2).** A sale line is an `item` or a `percent` line of a posted invoice, a posted sales receipt or a posted credit memo. Its figure is the line's stored amount, before sales tax, times the line's sign. A draft or a void document has no sale line that counts. `description` and `subtotal` lines never count (a subtotal line repeats the lines above it). The two reports read the same lines, so their Totals are equal for the same period and filters, and each Total equals the Subtotals of the posted invoices and sales receipts of the period less the Subtotals of its posted credit memos.
- **Date (Q3).** A sale counts on its document's date; a credit memo lowers sales on the memo's date, whether or not it is applied or refunded. The reports have no Method choice: they are on the accrual basis.
- **Sign (Q4).** Each sale line carries a sign: 1 for an invoice and a sales receipt, −1 for a credit memo (a credit memo's line amounts and quantities are stored positive). Every amount and quantity in both reports is multiplied by it, so a credit memo line shows below zero and lowers its customer's and its product's figures. A row can be below zero (a period with only a credit memo for that customer or product); it shows, with its negative figures. Refund receipts do not exist; the unit that adds one adds its lines to the same source with sign −1, with no spec change.
- **Params shared.** **Period** (core `dateRange` param), default **This fiscal year to date** (Q9). **Customer** (Books `customersParam()`: multiple, sub-customers under their parent with "All <parent> sub-customers", inactive customers included); unset = every sale; the document header prints "Customer: …" when customers are picked. **Order** (choice): **Name** (default) or **Largest sales** (Q10).
- **Opening a sale line.** Pressing an opened sale line opens its document's read view (core `detail.open`: `books/invoices/<id>`, `books/sales-receipts/<id>` or `books/credit-memos/<id>`, by the document's kind, the segments from `server/entry_routes.json`; the formula is p2-credit-memo's `stlDetailOpen()`, used unchanged). It opens as its own screen: Books registers a report panel only for `history`, and this unit adds none.
- **% of sales (Q15).** Both reports have a **% of sales** column: the row's amount ÷ the Total's amount × 100, 2 places (core `percentOfTotal`). It is blank on sale-line rows and 100.00% on the Total. A row below zero has a share below zero. When the Total is zero the column is blank on every row.
- **Inactive records.** An inactive customer or product with sales in the period shows, marked: its row is in muted text (core `groups[].muted`) and its label ends with " (inactive)" (the human's Customer Balance answer, 2026-11-16).
- **Heading.** The Books business name, the report's title, the period in words, and "Customer: …" / "Product: …" lines for picked filters (core `ReportDocumentHeader`, `Source.Heading`, `params[].header`).
- **Empty.** A period with no posted sale line shows core's empty report text for the period (`emptyMessage`) and no rows.
- **Live.** A post, a void, a customer or product rename, a re-parent, or a Books settings change re-runs an open report (the run's topics: the three line collections, `books_invoices`, `books_sales_receipts`, `books_credit_memos`, `books_customers`, `books_products`, `books_settings`).
- **Loading, error and Retry, refresh, Customize, Save as, copy link, share, and the Export menu (CSV, Excel, PDF, email):** core's report view, unchanged. Exports follow p5-exports: PDF writes the rows the view shows, with its folds; CSV and Excel open every group.

Sales by Customer:

- **Columns.** **Customer** (the label), **Sales** (the sum of sign × amount) and **% of sales** (Q15). A family header row and its "Total <parent name>" row show the family's Sales and share; a customer row inside a family shows its own share of the report's Total.
- **Rows (Q6).** Level 1 is the family: the customer's parent, or the customer itself when it has no parent. Level 2 is the customer. A family whose sale lines name no sub-customer draws no family row and no family total: its one customer row sits at depth 0 (core `groups[].inline`). A family with a sub-customer sale draws a header row with the parent's name, open when the report opens, then the parent's own row first (when it has sales), the sub-customers in order, then "Total <parent name>". A header folds its family.
- **No customer (Q5).** Sale lines of a sales receipt with no customer form one row "No customer", after every customer. It opens like a customer row. With customers picked in the filter it is not shown.
- **Opening a customer.** Pressing a customer row opens it in place into one row per sale line, labelled `<date> · <Invoice|Credit memo|Sales receipt> <number> · <product name>`, with the line's signed amount under Sales and a blank % of sales, in date order, then document order (`document.sequence`), then line order (`position`). A discount line and a credit memo line each show as their own negative row. The rows add up to the customer's Sales.
- **Order.** Name orders families and customers by name, ignoring case. Largest sales orders the depth-0 rows by their sales (a family by its total), largest first, and the customers inside a family the same way.
- **Phone (Q15).** A phone arrangement (`display.layouts`, width `mobile`, 2 tracks) puts the name on line 1 (span 2) and Sales and % of sales on line 2. A long customer name and a sale line's label wrap to at most three lines (`whiteSpace: "normal"`, `lineClamp: 3`); the figures are never cut (`minWidth: "max-content"`). Phase 3 pass 2 measures `oneLine.minWidth` for this report's own columns at 375 and 390.

Sales by Product/Service:

- **Columns.** **Product/Service** (the label), **Quantity** (the sum of sign × quantity, rounded to 2 places), **Amount** (the sum of sign × amount), **% of sales** (the row's Amount ÷ the Total's Amount × 100, 2 places), **Avg price** (Amount ÷ Quantity, whole cents; blank when the quantity is 0 or blank).
- **Rows (Q7).** One row per product or service with a sale line in the period, in one flat list. Products have no category in Books v0. A product with no sale line in the period is not listed (Q8).
- **Discounts (Q11).** A percent line names its own product (the form requires one; the seed's is "Discount"). Its amount counts on that product's row, with no quantity, so that row has no average price. The discounted product's row keeps its full amount.
- **Total.** Amount and % of sales (100.00%). Quantity and Avg price are blank on the Total (core `columns[].blankAbove`): units of different products do not add up.
- **Opening a product.** Pressing a product row opens it in place into one row per sale line, labelled `<date> · <Invoice|Credit memo|Sales receipt> <number> · <customer name>` (a sale with no customer ends after the number; the shape of the Sales Tax Liability's row label, with the document's date), with the line's signed quantity, signed amount, and amount ÷ quantity under Avg price; % of sales is blank on these rows. Date order, then document order, then line order.
- **Params.** Period, **Product** (choice, `multiple`, `optionsFrom` the new `books.products` source: value `id`, label `name`, grouped by type with a whole-group pick (`groupLabel` "All {group} items": "All Service items", "All Non-inventory items"), inactive products included, bundles left out by `optionsFrom.where` because a bundle is never on a line; header "Product: {label}"), Customer, Order (Name, or **Largest sales** by Amount).
- **Phone.** Four figures do not fit one line at 390. A phone arrangement (`display.layouts`, width `mobile`, 2 tracks) puts the label on line 1, Quantity and Amount on line 2, % of sales and Avg price on line 3. The product name wraps to at most three lines. Phase 3 pass 2 measures the display block (`oneLine.minWidth`, the arrangement) for this report's own columns at 375 and 390.

Both, last:

- **Help.** `help/reports.md` gains "Read the sales reports": what counts (posted invoices and sales receipts, less posted credit memos, the document's date, before tax), why the two Totals are equal and equal the documents' Subtotals, what % of sales is, that it is on the accrual basis and so can differ from Income on a cash-basis Profit and Loss, how a family and the No customer row read, where a discount counts, why the Total has no quantity and no average price, how to open a row and a sale, the filters and the Order choice. `help/customers.md`, `help/products-services.md` and `help/credit-memos.md` link to it; `help/credit-memos.md` says that a posted credit memo lowers both sales reports on its date.

## 4. Core

One core change (human ruling 2026-11-17, added in phase 4): R1 — a percent column prints its `scale` places. Core's run result gains `columns[].scale` for a column whose formula is `percentOfTotal`, `percentOfParent` or `percentOfSection`, and the report view, the PDF and the Excel export print the column at it; a percent with no column scale keeps 1 place (so every other report prints as before). It is the plan's checkpoint 0, a small change with no `exclusive`. Every other bullet's engine path exists:

| Behavior | Core API |
|---|---|
| Lines of three collections as one source; a link whose column differs per part; a constant per part | `reports.Source.Parts` (`SourcePart.Columns`, `Values`), as `books.sales_tax_lines` |
| Money with no currency column on the row | `Source.Currency` (a `Money` field with `Currency: ""`, `core/server/reports/registry.go:108-110,345`) |
| Period, default preset | `ParamDateRange`, `between`, preset `thisFiscalYearToDate` |
| Customer / Product filter, grouped options, header line | `params[].optionsFrom` (`group`, `groupLabel`, `groupOrder`), `params[].header`, `in` on a hidden key column |
| Family row only for a family; hide an empty family; mark inactive | `groups[].inline`, `hideEmpty`, `muted`, `open`, subtotals, `label` (on core main) |
| Order by a param | `sort[].formula` over the level's `sum` and the param (as `cbSort()`) |
| Share of sales, on both reports | `percentOfTotal` with `scale: 2` (type percent; no figure when the total is zero, `core/server/reports/detail.go` `windowSQL`), `columns[].detail: "blank"` |
| Average price | `div` of a money sum by a number sum, `scale: 0` (money) |
| Blank Quantity and Avg price on the Total | `columns[].blankAbove: "byProduct"` |
| Sale line label and its document | `detail.label`, `detail.open` |
| Phone arrangement, wrapping names | `display.oneLine`, `display.layouts`, `display.columns` |

`groups[].inline` and `groups[].muted` are on core main (87ed80f9). Phase 4 pins with a Go test that `percentOfTotal` on the two-level Sales by Customer gives each customer row its share of the report's Total (not of its family) and each family row the family's share; if core gives another figure, that is a core task, not a Books workaround.

## 5. Data

Collections read (none new, no migration): `books_invoice_lines`, `books_sales_receipt_lines`, `books_credit_memo_lines`, `books_invoices`, `books_sales_receipts`, `books_credit_memos`, `books_customers`, `books_products`, `books_settings`.

New report sources (`server/report_sources.go`), both with the shared `FiscalStartMonth`, `Heading`, `Watch` and `Currency`:

- **`books.sales_lines`** ("Sales lines"): a union of `books_invoice_lines` (`document` ← `invoice`, `sign: 1`), `books_sales_receipt_lines` (`document` ← `sales_receipt`, `sign: 1`) and `books_credit_memo_lines` (`document` ← `credit_memo`, `sign: -1`); the three collections have the same line columns. The lines have no currency column, so the Money fields name no currency field and read the source's `Currency` (`booksCurrency`, set for every Books source with money). Fields: `kind` (Select: Item, Description, Subtotal, Percent), `description` (Text), `quantity` (Number, sum), `rate` (Money), `amount` (Money, sum), `taxable` (Bool), `position` (Number), `sign` (Number). Links: `document` → `books.sales_documents` (to-one), `product` → `books.products` (to-one).
- **`books.products`** ("Products and services"): `books_products`. Fields: `name`, `sku`, `type` (Select: Service, Non-inventory, Bundle), `sales_description`, `price` (Money, currency field `currency`), `currency`, `inactive`. Links: `income_account` → `books.accounts`. Left out: purchase fields, form columns, name and sort keys.
- Back links for the builder: `books.sales_documents.lines` (to-many, back field `document`) and `books.products.sales_lines` (to-many, back field `product`).

Shared helpers added to `server/report_spec_helpers.go`:

- `postedSaleLines(period)`: the filter terms `kind in ("item", "percent")`, `document.status = "posted"` (the `document` link `required`, so a line whose document the reader cannot read drops out), `document.date between period`.
- `saleAmount()` = `sign × amount` and `saleQuantity()` = `sign × quantity`.
- `productsParam()`.

Reused unchanged from p2-credit-memo's Sales Tax Liability code (`server/report_sales_tax_liability.go`), which reads `document.kind` and `document.id` from a line that has a `document` link to `books.sales_documents`, as a sale line has: `stlDetailOpen()` (the read view path by kind) and `byDocumentKind(...)` with `stlDocumentKinds` (the words "Invoice", "Credit memo", "Sales receipt"). This unit does not rename or move them and adds no second copy.

The specs (`server/report_sales.go`: `salesByCustomerKey`, `salesByProductKey`, `salesByCustomerShipped()`, `salesByProductShipped()`, each Revision 1 and `Unpublished: true`), base `books.sales_lines`:

Sales by Customer:
- params: `period`, `customers`, `order` (`name` default, `sales`);
- filter: `postedSaleLines(period)` and `customerKey in customers`;
- columns: `name` (Customer; `document.customer`), `sales` (Sales; `sum(saleAmount())`), `pct` (% of sales; `percentOfTotal(sales)`, scale 2, `detail: "blank"`), hidden `topKey` = `coalesce(document.customer.parent, document.customer)` and `customerKey` = `document.customer`;
- groups: `byTop` on `topKey` (open, subtotals, `hideEmpty`, label `coalesce(display_name, "No customer")`, `inline` when no line of the group names a customer with a parent); `byCustomer` on `customerKey` (label with " (inactive)", `muted` when inactive);
- sort: the parent's own row first; the line keys `document.date`, `document.sequence`, `position`; under `order = "sales"` the level's `sum(saleAmount())` descending; No customer last; `lower(byTop.display_name)`; `lower(byCustomer.display_name)` (the shape of `cbSort()`);
- detail: label `concat(document.date, " · ", byDocumentKind(words), " ", document.number, " · ", product.name)`, open `stlDetailOpen()`;
- display: `name` wraps to 3 lines, `sales` and `pct` `minWidth: "max-content"`; a `mobile` arrangement of 2 tracks (`name` line 1 span 2; `sales`, `pct` line 2); `oneLine.minWidth` measured in phase 3 pass 2.

Sales by Product/Service:
- params: `period`, `products`, `customers`, `order`;
- filter: `postedSaleLines(period)` and `productKey in products` and `customerKey in customers`;
- columns: `name` (Product/Service; the `product` link), `quantity` (`round(sum(saleQuantity()), 2)`, blank when that sum is 0, `blankAbove: "byProduct"`), `amount` (`sum(saleAmount())`), `pct` (`percentOfTotal(amount)`, scale 2, format percent, `detail: "blank"`), `avg` (`div(sum(saleAmount()), sum(saleQuantity()))`, scale 0, blank when the quantity sum is 0, `blankAbove: "byProduct"`; both blanks are `if(eq(<quantity sum>, 0), lit(nil), …)`, because the engine's sum of no rows and its division by zero are 0 — added in phase 4, so a product whose quantities net to 0 shows a blank Quantity), hidden `productKey` = the `product` link and `customerKey` = `document.customer`;
- groups: `byProduct` on `productKey` (label `name` with " (inactive)", `muted` when inactive);
- sort: the line keys; under `order = "sales"` the level's amount descending; `lower(byProduct.name)`;
- detail: label `concat(document.date, " · ", byDocumentKind(words), " ", document.number, <" · " customer name when there is one>)`, open `stlDetailOpen()`;
- display: `name` wraps to 3 lines, figures `max-content`; `oneLine.minWidth` and the phone arrangement measured in phase 3 pass 2.

Why the figures hold: a sale line is in one document, names one product, and its document names at most one customer, so it is in exactly one row of each report; each Total adds every sale line the filter keeps, a credit memo's with sign −1. A document's Subtotal is the sum of its item and percent amounts (`server/document_totals.go`); a credit memo's is stored positive.

Files (Books): `server/report_sales.go` (+ `_test.go`: `CheckSources`, `Load`/`Validate`, and runs over a book with an invoice of two products, a sales receipt with no customer, a percent discount line, a subtotal and a description line (not counted), a posted credit memo (its lines below zero, its customer and product lowered, its row label and open path), a draft and a void credit memo (not counted), a customer whose only document in the period is a credit memo (a row below zero with a share below zero), a period whose Total is zero (blank % of sales), the % of sales of a family row, of a customer inside a family and of the Total, a draft, a void, an edited posted invoice (counted once), a document outside the period, a parent with its own sale and a sub-customer sale, a sub-customer whose parent has no sale, an inactive customer and an inactive product, a fractional quantity, both Order choices, the Customer and Product filters with a whole-group pick; the two Totals compared with each other and with the documents' Subtotals, credit memos subtracted); `server/report_sources.go` + `report_sources_test.go`; `server/report_spec_helpers.go`; `server/register.go`; `tinycld/books/lib/shipped-reports.ts` (two keys); `tinycld/books/components/reports/ShippedReportsMenu.tsx`; `components/customers/CustomersList.tsx`; `components/products/ProductsList.tsx`; `tests/e2e/books-customer-balance.spec.ts` (the Customers list entry is now a menu item); `help/reports.md`, `help/customers.md`, `help/products-services.md`, `help/credit-memos.md`, `tests/help-reports.test.ts`; `tinycld/books/lib/sales-reports-fixture.ts` (phase 3 pass 2: two static `RunResult`s for core `ReportView`, as the Customer Balance fixture). `seed.ts`: phase 4 reads which seeded posted invoices and sales receipts exist; it adds only what is missing of: a sale for a sub-customer, a sales receipt with no customer, a percent line, a sale of the long-named product, a sale of an inactive product, a posted credit memo (the seed already posts credit memos: `seed.ts` `books_credit_memos`).

E2e (`tests/e2e/books-sales-reports.spec.ts`, with `books-report-helpers.ts` and core's report helpers): a customer and two products the test creates; it posts an invoice (two products, one with a fractional quantity, and a discount line) and a sales receipt, dated mid-2026 or later. With the Customer filter set to its customer (so every asserted figure is its own): Sales by Customer shows the customer's sales, equal to the two Subtotals, and 100.00% of sales on the Total; opening the row shows the sale lines with a blank % of sales; pressing one lands on the invoice. Sales by Product/Service with the same filter shows each product's quantity, amount, share and average price, the Total with blank Quantity and Avg price and the same amount as the other report; a void of the sales receipt lowers both. A posted credit memo for the customer (through `tests/e2e/credit-memo-helpers.ts`) lowers both reports by its Subtotal, shows as a "Credit memo <number>" row below zero, and pressing that row lands on the credit memo. A sub-customer sale turns the row into a family with a total. Opened from the Products list button and from the Customers list Reports menu. One phone run (375 and 390), because the phone arrangements are a different display path: the two-line row of Sales by Customer, and the three-line arrangement and an opened product of Sales by Product/Service.

## 6. Cut

- COGS, Gross margin and Gross margin % (screenshot 2): Books v0 tracks no inventory and stores no cost per sale (scope: "no inventory tracking"; inventory is "Later").
- Product categories with category totals (screenshot 2): Books products have no category. Grouping by type (Service / Non-inventory) is not a stand-in the reader asked for (Q7); Save as and the builder group by type.
- A Method (cash / accrual) choice (Q3): the cash basis in Books is kept per journal line (`books_cash_basis_lines`), not per sale line; a sales receipt is the same on both.
- Products with no sale in the period (Q8), and customers with none.
- Columns by month, and Compare to another period: not in the v0 scope line for these reports; Save as and the builder pivot by month.
- A third "Sales Detail" report and a drill from a figure into it (direction C): opening a row is the detail.
- A link from a row to the customer's page or the product's form: a group row folds; the sale lines open their documents.
- Sales by customer nested by product, and by product nested by customer (direction B).
- Print: p5-exports gives PDF.

## 7. Platform notes

None new. Inherited from core's report view and exports, signed off with p5-report-builder, p5-drill-down and p5-exports: `DocumentTitle` (web tab title), `web:[scrollbar-gutter:stable]`, `useLeaveGuard`'s browser half, hover underline and ⌘-click on row links, the file download path of exports. Keyboard shortcuts have standing approval.

## 8. Sparks carried

1. A figure that would mislead is blank on the Total (Quantity, Avg price) — core `columns[].blankAbove`.
2. Each row's share of sales reads beside its amount, on both reports — core `percentOfTotal`.
3. Only a family of customers gets a header and a total — core `groups[].inline`.

Core extension: §4 R1 (percent places), for spark 2's "100.00%".

## 9. Non-goals

- No new Books screen, collection, migration or route.
- No refund receipt lines: that collection does not exist; the `sign` field is its entry point. A refund of a credit memo is a payment, not a sale line, and changes neither report.
- No Cash method: an unapplied credit memo lowers sales on its date, unlike the Sales Tax Liability on Cash.
- No change to posting, to `books.sales_documents` fields, or to the Sales Tax Liability report: its spec, its figures, and its `stlDetailOpen()` / `byDocumentKind` code stay as p2-credit-memo merged them (its Revision stays 3).
- No tie-out to the Profit and Loss: a product's income account can be any account, so Income on the statement can differ from sales.
- No expenses by vendor (its own unit).
