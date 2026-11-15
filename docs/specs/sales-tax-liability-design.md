# Sales Tax Liability — design

Unit p5-sales-tax-liability · package `books` · feature `sales-tax-liability`. Approved at the design gate 2026-11-14: direction **A** (agency, then rate, a rate opening into its documents; agency total and Total show the tax alone), open questions Q1–Q11 as recommended in the packet. Built against books `main`@18a4e10 and core `main`@58bafaec, after **p5-drill-down** (a dependency of this unit, Q3). Source of scope: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Sales tax: rates and groups, per-line taxability, liability account, tax reports. No filing." and "Reports: … sales tax liability …"). A mark (Qn) names the design-gate answer to the packet's question n.

## 1. Goal

A shipped Books report that shows, for a period, the sales tax the business charged on posted sales, per agency and per rate, with the gross, non-taxable and taxable sales behind each rate's tax.

## 2. Where it lives

- A shipped report `books.sales_tax_liability`, title **Sales Tax Liability**, description "The sales tax you charged on posted invoices and sales receipts, by agency and rate (accrual basis)." It opens in core's report view (`/a/reports/<id>`) and is listed in the Books Reports hub (`/a/reports?package=books`, the sidebar's Reports entry). Like every `books.*` shipped report it is `Unpublished` and shared with every Books reader by `server/report_shares.go` (bookkeepers are guests).
- The Sales tax page (`tinycld/books/screens/taxes.tsx`) gets a **Liability report** button in its header (Q5). It opens the report through a new Books hook `useShippedReportHref('books.sales_tax_liability')` (`tinycld/books/hooks/useShippedReportHref.ts`), which finds the shipped report the reader can open and returns its href; while that report is not found the button is not shown.

## 3. Behavior

- The report reads the tax lines of posted invoices and posted sales receipts (one row per document and tax component, written at posting). Drafts have no tax lines. A voided document, and a document replaced by its correction (Edit of a posted document voids the original), drops out: only documents whose status is `posted` count.
- Accrual basis only (Q1): a document counts in the period by its own date. The title's description and the help topic say "accrual basis". Cash basis is deferred (§6, and the ledger's Deferrals).
- Rows are grouped by **agency** (the agency stored on the tax line at posting), then by **rate** (the tax line's component rate: a rate, or one rate of a group). Agencies and rates are in name order. An inactive agency or rate with tax lines in the period shows like an active one.
- Columns: **Tax name** (the agency, rate or document label), **Gross total**, **Non-taxable**, **Taxable amount**, **Tax amount**.
  - Gross total is the document's subtotal before tax; Taxable amount is the part of it the tax was computed on; Non-taxable is Gross total − Taxable amount; Tax amount is the component's tax. All four are the figures stored at posting, so a later change to a rate, a product's taxable setting or a customer's exemption never changes them.
  - On a rate row each figure is the sum over the documents that charged that rate.
  - On an agency's total row ("Total <agency>") and on the report's Total row, only **Tax amount** shows; the three sales columns are blank there, because a document taxed by two rates of one agency would be counted twice (core G2, `blankAbove: "byRate"`).
- The agency level is open when the report opens (core `groups[].open`); the rate level is closed. Pressing a rate opens it into one row per document that charged it, labelled `<date> · <Invoice|Sales receipt> <number> · <customer>` (a sales receipt with no customer ends after the number; core `detail.label` formula with `concat` and `if`), in date then number order, each with its four figures.
- A document row opens that document's read view (`books/invoices/<id>`, `books/sales-receipts/<id>`) through p5-drill-down's core `detail.open` (Q3).
- Params: **Period** (date range, default **Last month**, core preset `lastMonth`, Q2) and **Agency** (choice param with `multiple` and `optionsFrom` the `books.tax_agencies` source, inactive agencies included; unset = every agency).
- A document with no tax rate (an exempt customer, or no default and none chosen) has no tax line and is not in the report (Q4); the help topic says so. A document with a rate and no taxable line is in the report under that rate: its sales are Non-taxable and its tax 0.00. A rate of 0% (for example "Exempt food sales (state)") shows its sales with tax 0.00.
- Empty: a period with no posted taxed sales shows core's empty report text for the period (`emptyMessage`); no agency or rate rows.
- Loading, refresh after a post or void, error and Retry, Customize, sort, copy link, Save as, phone layout (rows wrap: label, then the figures on two lines): core's report view, unchanged.
- Help: `help/reports.md` gains "Read the Sales Tax Liability report" (what counts, accrual basis, why the agency total shows only tax, how to open a rate and a document, that sales with no tax rate are not in it, and that the liability account's balance on the Balance Sheet also holds payments and adjustments, which this report does not). `help/sales-tax.md` links to it.

## 4. Core checkpoint 0 (core branch `books/p5-sales-tax-liability`; spec version 4, no bump — Q7)

| id | what | why | files (expected) |
|---|---|---|---|
| U1 | **Union source** (Q8). `reports.Source.Parts []SourcePart{ Collection, Columns map[key]column, Values map[key]constant }`: the source's rows are the rows of each part's collection, each part read under its own list rule; a field or link a part does not map reads NULL there; `Values` gives a part a constant field (a document kind). The source's rule CTE is the `UNION ALL` of the parts' rule selects, projected to the source's keys, so joins, links to and from it, record groups, labels, fill, param options, lookups and change-signal topics read it like a one-collection source. `CheckSources` checks each part (collection, columns, types, list rule) and refuses a part whose mapped column types differ. | Tax lines and their documents live in one collection per document kind; a `lookup` sum across two collections is refused as two currency sources. Merging the two tax-line collections into one Books collection was not picked: it refactors invoice and receipt posting, PDFs, read views and tests, and each later document kind would add a relation. Every later report over several document kinds (sales by customer / product, A/R aging, customer balance, and credit memos and refund receipts joining this report) reads through U1. | `core/server/reports/{registry,check,stmt,rules,join,catalog}.go`, tests with a fictional package; `docs/packages.md` "Report sources" |
| G2 | **`columns[].blankAbove: "<group id>"`.** The column totals on that group level and the levels inside it; the group and subtotal rows of outer levels, layout sections and the Total leave the cell blank (no `@currency` cell either). Refused on a pivot's cell column, with `rollup`, with `total: "rows"`, on a column a group groups by, and for an unknown group id (422 `unknown_group`). The builder edits it (Q10): a column's Totals choice "On every row" / "Up to <group>". | The agency total must show the tax and not a double-counted sales figure. `rollup` blanks every level; no other setting stops at a level. | `core/server/reports/{spec,bind,levels,assemble}.go`; `core/reports/lib/{spec,types}.ts`; builder column editor in `core/reports/components/builder/`; core `help/reports.md`; `docs/packages.md` "Fields added in version 4" |

This adds a core PR; the package builds on its branch, and it merges at the next design gate, before the package PR. U1 and G2 touch the engine files every report unit's checkpoint 0 edits, so the lane holds `exclusive` for checkpoint 0 (Q6). Checkpoint 0 (U1 and G2) starts now on core `main` (human, 2026-11-14), beside p5-drill-down's open core PR tinycld#475, which edits the same G2 files; the core PR that merges second merges `main` and fixes the conflicts at the source. The checkpoint that opens document rows through `detail.open` is the last one, and it starts only after tinycld#475 merges (Q3). Build order U1 → G2 → builder and docs.

## 5. Data

Collections read (none new): `books_tax_agencies`, `books_tax_rates`, `books_invoices`, `books_sales_receipts`, `books_invoice_tax_lines`, `books_sales_receipt_tax_lines`, `books_customers`.

New fields (Q9), in one new migration `pb-migrations/<N>_add_books_tax_line_gross.js`, where `<N>` is the next free number in `books/pb-migrations/` when the migration is written (2100000014–2100000016 are taken on books main; another lane may take the next one first). No backfill: Books is not live.
- `books_invoice_tax_lines` and `books_sales_receipt_tax_lines`: `gross_amount` (number, onlyInt, ±2^53-1: the document's subtotal at posting) and `currency` (text, `^([A-Z]{3})?$`: the document's currency). `writeTaxSnapshot` (`server/sales_document_posting.go`) sets both. Clients still only read tax lines.

New report sources (`server/report_sources.go`, Books `Register`):
- `books.tax_agencies` (name, inactive) and `books.tax_rates` (type, name, rate_ppm, inactive; link agency).
- `books.sales_documents` — union (U1) of `books_invoices` and `books_sales_receipts`: kind (constant select: invoice "Invoice", sales_receipt "Sales receipt"), date (TextDay), status, number, sequence, subtotal, tax_total, total (Money, Currency `currency`), currency; links customer → books.customers, entry → books.journal_entries.
- `books.sales_tax_lines` — union (U1) of `books_invoice_tax_lines` and `books_sales_receipt_tax_lines`: gross_amount, taxable_amount, amount (Money, Currency `currency`), rate_ppm, currency; links document → books.sales_documents (part columns `invoice` / `sales_receipt`), rate and component → books.tax_rates, agency → books.tax_agencies.

The report spec (`server/report_sales_tax_liability.go`, `salesTaxLiabilityShipped()` + `salesTaxLiabilitySpec()`, Revision 1, `Unpublished: true`), base `books.sales_tax_lines`:
- filter: `document.status = "posted"` (required link), `document.date between period`, `agency in agencies`;
- groups: `byAgency` on the agency link (open, label the agency's name), `byRate` on the component link (label the rate's name), sorted by name;
- columns: `name` (the group label / detail label), `gross` = sum gross_amount, `nontaxable` = sum (gross_amount − taxable_amount), `taxable` = sum taxable_amount — each with `blankAbove: "byRate"` — and `tax` = sum amount;
- detail label: concat(document.date, " · ", document.kind label, " ", document.number, " · " and the customer's name when the document has a customer), sort by document.date then document.sequence;
- detail open: the document's route by kind (p5-drill-down's `detail.open`).
- display (phase 3 pass 2, the fixture's `SALES_TAX_LIABILITY_DISPLAY`): `oneLine.minWidth` "600px"; column `name` minWidth "12ch"; one `mobile` layout of 2 tracks: `name` on line 1 (span 2), `gross` and `nontaxable` on line 2, `taxable` and `tax` on line 3. Four figures do not fit one line of a 390 px phone (core's row is 374 px wide there), and without a layout core's automatic lines cut a document label to its date.

Why the totals hold: every tax line is one document × one component; a rate's rows are the documents that charged it, each once, so its sales sums are that rate's sales; the agency total and the Total add the rate rows' tax, which is each document's tax once per component, i.e. what posting credited to the agencies' liability accounts in the period.

Files (Books): `pb-migrations/<N>_add_books_tax_line_gross.js`; `server/sales_document_posting.go` (snapshot); `server/report_sources.go`; `server/report_sales_tax_liability.go` (+ `_test.go`: sources check, Load/Validate, a run over invoices and receipts with a group rate, a void, a correction, a 0% rate, a document with no taxable line, period edges); `server/register.go` + `server/registrations_test.go`; `tinycld/books/screens/taxes.tsx` + `tinycld/books/hooks/useShippedReportHref.ts`; `help/reports.md`, `help/sales-tax.md`, `tests/help-reports.test.ts`; `tinycld/books/lib/sales-tax-liability-fixture.ts` (phase 3 pass 2); `seed.ts`: posted taxed invoices and sales receipts dated in October 2026 — at least one invoice under a group rate (two agencies), one sales receipt with no customer, one sale under a 0% rate, and one invoice the seed posts and then voids (the fixture's void document, so a dev book shows a void drop out). Phase 4: the void e2e does not void a seeded invoice (a retry, or a second run on the same database, would find it void already); it posts an invoice of its own under an agency and rate it creates.

E2e (`tests/e2e/books-sales-tax-liability.spec.ts`): open from the hub and from the Sales tax page; the seeded month's agency totals and Total; open a rate and see its documents; press a document and land on its read view; post an invoice under an agency and rate the test creates, see it in the report, void it through the UI and see its tax leave the report; one phone run of opening a rate (the row wraps).

## 6. Cut

- Cash basis (Q1): needs payment allocations, and Books has no payment collection (none in `books/pb-migrations/`; p2-receive-payment is not merged). Deferred to p2-receive-payment, which adds the Accrual / Cash method param to this report (recorded in the ledger's Deferrals).
- Sales with no tax rate as a "No sales tax" row (Q4): no agency is owed anything on them.
- Tax payments to agencies, adjustments, "net tax owed", filing: the design spec says "No filing."
- The liability account's balance per agency (direction C, not picked): wrong when agencies share an account, and it mixes payments into a report of tax charged.
- A flat rate list with an Agency column and no agency total (direction B, not picked): it drops the per-agency total a return is filed from.
- A rate's percentage in its label: a rate's percent can change between documents in one period.
- Credit memos and refund receipts: they do not exist yet; their units add their tax lines as union parts (a negative amount, by a stored sign or a core part sign, decided in those units).

## 7. Platform notes

None new. Inherited from core's report view (signed off with p5-report-builder): `DocumentTitle` (web tab title), `web:[scrollbar-gutter:stable]`, `useLeaveGuard`'s browser half. Document rows carry p5-drill-down's platform items (hover underline, ⌘-click new tab) as signed off there.

## 8. Sparks carried

1. The agency total shows the tax alone — core G2 `blankAbove` on the three sales columns; core `ReportRow` subtotal style; no new token.

## 9. Non-goals

- No new Books screen; the report is core's view.
- No editing of tax lines; no recomputing past tax from current rates.
- No per-customer or per-product tax breakdown (Customize and Save as let a user build one from `books.sales_tax_lines`).
