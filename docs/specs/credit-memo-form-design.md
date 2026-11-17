# Credit Memo — design

Status: APPROVED at the design gate on 2026-11-16 (auto-helix unit p2-credit-memo), written against p3-pay-bills. Decided by the human: direction A (full-page document form, one more kind of the shared sales document layer; picked 2026-11-15, confirmed 2026-11-16), Q1–Q16 as recommended (2026-11-15) and Q17–Q20 as recommended (2026-11-16). Each decision is marked (Qn) where it applies; §9 records Q17–Q20. No question is open. Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Interface, §Forms (also §Ledger rules, §Scope). Contracts: `invoice-form-design.md` and `sales-receipt-form-design.md` (the shared document layer) — every behavior this spec does not restate is the invoice's, with "invoice" read as "credit memo"; `receive-payment-design.md` §4.3 (single writer of a document balance); `pay-bills-design.md` §3.10, §4.3 (document balance kinds, cash-basis deferral, cash-basis tax rows); `customer-pages-design.md` §5; tax-rates-design §Contracts. Built against books books/p3-pay-bills@0c74532c, core books/p3-pay-bills@b178a2f1.

## 1. Goal

A bookkeeper gives a customer a credit: picks the customer (or starts from a posted invoice), enters the lines that are credited, sees tax and the credit amount as they type, and posts a numbered credit memo that lowers what the customer owes (credit Accounts receivable, debit income and sales tax), with the invoice's keyboard-first flow on web and a full touch path on a phone.

## 2. Where it lives

- `books/credit-memos/new` — new credit memo. `?customer=<id>` starts with that customer. `?invoice=<id>` starts from a posted invoice (§3.2). `?replaces=<id>` edits a posted credit memo (a correction that keeps its number). `?copy=<id>` starts a new draft from an existing one.
- `books/credit-memos/[id]` — a draft opens in the form; a posted or void one opens in the read view. `?tab=pdf` opens the PDF view tab.
- Entry points: + New → column "Customers" → "Credit memo" (after "Receive payment"); the customer page's New transaction menu (through `NEW_ACTIONS` `takesCustomer`); the invoice read view's "Create credit memo" (Q2); the Journal Entries list, the account register drawer, report drills, the audit log and federated search open `books/credit-memos/<id>`.
- No sidebar entry, no list (p2-sales-lists owns the Sales list). Both routes are pushed pages; `hidesNewFab` gains `credit-memos`.

## 3. Behavior

### 3.1 Shared document layer

- The credit memo is a new kind of the sales document layer: `CREDIT_MEMO_KIND` (`lib/sales-document-kinds.ts`), `CREDIT_MEMO_DOCUMENT` (`components/documents/document-kinds.ts`), `CREDIT_MEMO_DATA` (`hooks/credit-memo-data.ts`) and the Go `creditMemoKind` (`server/credit_memos.go`). No invoice file is copied into a credit memo file.
- Kind values: key `credit_memo`, lifecycle `posting`, host `books:credit_memo`, test id `credit-memo`, route base `books/credit-memos`, noun "Credit memo", "This credit memo", "Draft credit memo", "New credit memo", shortcut group "Credit memo", party `customer` (required), line tables `SALES_LINE_TABLES`, features `SALES_FEATURES` (tax, message, email, PDF, party address; no attachments), help topic `books:credit-memos`, PDF stem `credit-memo-<number>` / `draft-credit-memo`, `bandSplitAt: null`.
- The big figure and the last row of the totals are both labeled **Credit amount** (Q3): `figure: { label: 'Credit amount', testId: 'credit-amount' }`, `lastTotal: { label: 'Credit amount', testId: 'total-credit' }`. Both show the total.

### 3.2 Header

- Built-ins of the forms host `books:credit_memo` (§4.4), drawn by the shared document fields in the header band:
  - **Customer** (required, locked): `CustomerField`, as the invoice. A pick fills Bill to, Email, Tax and the line taxable defaults as the invoice does, without Terms.
  - **Bill to** (snapshot) with "Edit address", and **Email** (editable), as the invoice.
  - **Credit memo date** (required, locked): core `DateField`, default today.
  - **Tax** (locked optional): `DocumentTaxField`, as the invoice.
- A credit memo has no Terms and no Due date.
- **Invoice link** (Q2): a memo started with `?invoice=<id>` stores that invoice in `invoice`. The form shows it as one read-only row in the band, "For invoice 1004" (`DocumentSourceLink`, a Tab stop after the Customer's links; Enter opens the invoice), with a "Remove link" button after it (a Tab stop, no key). Changing the customer removes the link (the invoice is another customer's). When the linked invoice is void, the row reads "For invoice 1004 (void)" (Q18); the link stays, and a draft that already has the link can be saved and posted. A memo not started from an invoice shows no link row; the form has no picker for an invoice. `invoice` is no field of the form: it travels as a kind field of the document (`DocumentKindFields` `{ kind: 'credit_memo' }`, start value `invoice`), and the save writes it, as the invoice's `estimate`.
- Start from an invoice (`?invoice=<id>`, Q20): the form starts with the invoice's customer, Bill to, Email, Tax and a copy of every line of the invoice (kind, product, description, quantity, rate or percent, taxable), today's date, an empty message and an empty memo. The user removes or changes the lines that are not credited. Nothing limits the credit to the invoice's total or balance (Q1: the credit is the customer's). `?invoice` of an invoice that is not posted, or that the user cannot read, shows "This invoice cannot be credited" with a back link.
- Header right: title ("New credit memo", "Draft credit memo", "Edit 1004" for a correction), status badge (Draft / Posted / Void), `HelpIcon topic="books:credit-memos"`, and the big figure "Credit amount $250.00" (the total; "—" while invalid; "Too large" over the limit).
- Tabs: **Edit** | **PDF view**.

### 3.3 Speed and keyboard

Identical to the invoice (invoice-form-design §3.1), with these differences:
- Tab order: Customer → "Edit address" → "Edit customer" → "For invoice 1004" → "Remove link" (each only while it shows, in the order they draw) → Credit memo date → Tax → line 1 (Product → Description → Qty → Rate → Taxable → row menu) → … → "Add line" → Message → Memo → action bar (Cancel, Save draft, Post, Post & new, More). Picking a customer moves focus to Credit memo date.
- On open (new, draft, correction, copy, from an invoice) the Customer picker has focus on web at every width; nothing takes focus on iOS and Android.
- Key map: the invoice's keys, unchanged; the ⇧? group is "Credit memo". Read view: Edit E, Void V, Copy C, View journal entry J, Download PDF ⌘P; tabs ⌥1 / ⌥2.
- New key on the invoice read view (Q2): **Create credit memo M** (`DOCUMENT_READ_KEYS.credit_memo = 'm'`), a `ShortcutButton` with the screen's `scopeOwner`; in More on a phone, with its key as the menu row's `shortcut` text.

### 3.4 Lines

Identical to the invoice (§3.3 there, Q13): row kinds Item, Description, Subtotal, Percent; bundle expansion; one empty Item line on a new form; an empty trailing Item line dropped at save; at most 250 lines; "Add line" and "Add…" with the same keys; the row menu and the line keys. Amounts are entered positive: a line of Qty 1 × Rate 250.00 credits $250.00. The lines table never scrolls sideways: its columns flex with a least width, and the lines draw as cards while the form is narrower than the table's own least width (the shared lines table's rule; this unit adds no fixed breakpoint).

### 3.5 Footer and totals

- Left: **Message to customer (printed)** (4000 chars; hint "Shown on the credit memo and its PDF.") and **Internal memo (not printed)** (4000 chars, the journal entry memo), labels from `DOCUMENT_NOTE_LABELS`.
- A new credit memo's message starts empty (Q8): the Books setting "Default message to customer" does not fill it (`CREDIT_MEMO_DOCUMENT.values.new` ignores `message`). Copy copies the source's message; a correction keeps the original's.
- Right, under Amount: Subtotal, the tax line "<rate or group> (<percent>)" with its amount (none with no tax), **Total** (`border-t`, `font-semibold`), and **Credit amount** (= Total).
- Totals by `documentTotals` (shared TS/Go vectors). The total must be ≥ 0 (Q13: "A credit memo total cannot be below zero. Use an invoice.") and ≤ the stored-amount limit ("The credit memo total is more than Books can store.").

### 3.6 Saving

As the invoice (§3.5 there): one zod schema for the kind through the forms engine (host schemas) and `zodResolver`; Post adds "Add at least one product or service line"; action bar wide Cancel, Save draft, Post, Post & new, More (Delete draft when saved; Download PDF); phone Cancel, Save draft, Post, More (Post & new, Delete draft, Download PDF); `ShortcutButton`s; writes through `useMutation` (header row, line plan, then `status: 'posted'`); the form held by the synchronous store flag; navigation after Post / Post & new / Save draft as the invoice with `books/credit-memos/…` paths (Post & new keeps `?customer` only when opened with it, and never `?invoice`).
- Post refuses an inactive customer (a correction keeps its original's): "<Customer name> is inactive. Choose an active customer.", under Customer.
- A zero total cannot be posted: "A credit memo with a total of zero cannot be posted. Add an amount or keep it as a draft."
- A link the server refuses ("Choose a posted invoice of this customer.", field `invoice`) shows under the link row: `handleMutationErrorsWithForm` sets the server's message on `invoice` (`setError`), and the link row draws `formState.errors.invoice`. It is a server refusal only; no client rule checks the link.
- Refusals: "Line n: …" under that line; Customer, Credit memo date, Tax refusals under those fields; the rest (close date, sequence, totals limit) in `FormErrorSummary`.
- Writers only; a non-writer at `books/credit-memos/new` sees "You need bookkeeper access to create credit memos".

### 3.7 Read view (posted or void)

- Header as the form, title "Credit memo 1001", badge Posted / Void, big figure "Credit amount". Tabs **Details** | **PDF view**.
- Body (`CreditMemoReadDetails`): Customer (link to the customer page), Bill to, Email, Credit memo date, Tax; "For invoice 1004" (`DocumentSourceLink`; "For invoice 1004 (void)" when that invoice is void) when the memo has a link; the lines read-only (grid wide, cards narrow, the shared `DocumentReadLines`); totals ending in "Credit amount"; message; memo; "Posted by …", "Voided by …", "Replaced by 1001 (edited)".
- Actions (Q12): writer on posted — Edit (`?replaces=<id>`), Void (`VoidDialog`), Copy (`?copy=<id>`), View journal entry, Download PDF; writer on void — Copy, View journal entry, Download PDF; reader — View journal entry, Download PDF.
- Copy (Q16): same customer, lines, tax and message; today's date; a new draft; no memo and no invoice link.
- Edit (a correction) keeps the original's invoice link, memo and number.

### 3.8 PDF view tab (Q7)

As the invoice (§3.7 there) with kind `credit_memo`: `/api/books/pdf/credit_memo/<id>`; "Save a draft to see the PDF" on a new form; "Shows the last saved version" with unsaved edits. A draft prints "Draft credit memo" with no number; a void prints "Credit memo 1001 (void)". The PDF prints Credit to (the Bill to address), number, Date, "For invoice 1004" when linked (the read view's text, so "For invoice 1004 (void)" when that invoice is void), every line kind, subtotal, the tax line, Total and "Credit amount", and the message under "Notes" (no Notes block when the message is empty). It prints no memo, no terms and no due date.

### 3.9 States

Loading, error with Retry (merged recoveries), not found ("This credit memo does not exist"), `?replaces` of a memo that is not posted ("This credit memo cannot be edited"), `?invoice` that cannot be credited (§3.2), offline (actions disabled): as the invoice.

### 3.10 Elsewhere in Books

- **Invoice read view** (Q2): a writer on a posted invoice gets **Create credit memo** (key M) after Copy; it opens `books/credit-memos/new?invoice=<id>`. A void invoice and a reader do not get it. Under the invoice's payments, a section **Credit memos** lists the credit memos that name the invoice and are not a replaced original: number (link), date, amount, status badge (as the Transactions tab). Wide: a grid whose four columns each flex with a least width of 95 px, no sideways scroll; cards while the section is narrower than the grid's own least width. No memo, no section. The invoice's Balance due does not change (Q1).
- **Invoice edit and void** (Q18): an edit of the invoice (a correction) moves the link of every credit memo that names the original to the correction, so the memos read "For invoice 1004" as before and the correction's read view lists them. A correction that changes the customer while a draft or posted credit memo names the invoice is refused under Customer in the invoice form: "Credit memos are made from this invoice, so its customer cannot change." (void memos do not block it). A void of the invoice keeps the links: each memo reads "For invoice 1004 (void)", and the void invoice's read view still lists its credit memos.
- **Report builder** (Q19): the source "Sales documents" includes credit memos with Kind "Credit memo" and their stored, positive Subtotal, Tax and Total. A user-built report that adds totals across kinds must filter by Kind; `help/reports.md` says so.
- **Customer page**: Open (the A/R view `books_party_balances`) drops by the posted memo's total with no change to the view, because the memo's A/R credit names the customer; a customer with more credit than invoices shows "Credit". Overdue does not change (it sums invoice balances). Transactions tab (Q11): a fifth kind **Credit memo** — chip "Credit memos" (after "Payments"), type label "Credit memo", total shown with a minus sign ("−$250.00"), status Draft / Unapplied (warning, balance above zero) / Applied (success, balance zero; reached only when p2-apply-credit exists) / Void; the row opens `books/credit-memos/<id>`; empty text "No credit memos for this customer". New transaction menu: "Credit memo" (from `NEW_ACTIONS`).
- **Journal Entries list, registers, entry drawer**: Type "Credit memo", number "1001"; Open goes to `books/credit-memos/<document>`; Edit opens the correction; Reverse is hidden. Name shows the customer on every line of the entry.
- **General Ledger, Journal, Transaction Detail**: Type "Credit memo" through `entry_type_labels.json` `docTypes.credit_memo`; "Void reversal of 1001"; the open path comes from `entry_routes.json` (`"credit_memo": "credit-memos"`).
- **Sales Tax Liability**: a posted credit memo lowers the gross, taxable and tax figures of its rate and agency on its date (Q5, negative tax lines); its row reads "Credit memo 1001" and opens the memo. On the Cash method it counts as Q17 says (§3.11).
- **Profit and Loss, Balance Sheet, Trial Balance** on Accrual: the memo's entry counts on its date as every posted entry does.
- **Search**: kind `credit_memo`, title "Credit memo 1001 · Customer" / "Draft credit memo · Customer", row id `credit_memo:<id>`; drafts included; memo and message indexed.
- **Settings → Numbering**: card "Credit memos" (no prefix, next 1001; Q6).
- **Audit log**: `books_credit_memos` ("Credit memo 1001" / "Draft credit memo") and `books_credit_memo_lines` ("<memo>: line n"); history opens the memo.
- **Delete guards** (Q14): a customer on any credit memo, draft or posted: "<Customer name> is on credit memos. Make it inactive instead." (after the invoice and sales receipt checks, before the journal lines check). A product on a credit memo line and a tax rate on a credit memo or its tax lines cannot be deleted (the existing texts of `productReferences` / `taxRateReferences` with "credit memo").
- **Help**: new `help/credit-memos.md` (task-led: give a credit, start from an invoice, what the credit does to the customer's balance and to sales tax, edit and void, cash basis, key map); `help/invoices.md` gains Create credit memo (M) and the Credit memos section; `help/customer-pages.md` gains the Credit memo kind; `help/sales-tax.md` and `help/reports.md` gain one paragraph each; cross-links from customers and documents.

### 3.11 Cash basis (Q17)

- A credit memo is a deferred kind of the cash basis, as an invoice is. Its entry's lines are taken out of the cash layer on their own date. Nothing brings them back in this unit, because nothing applies or refunds a credit memo yet. So on the Cash method a credit memo changes no figure of Profit and Loss, the Balance Sheet, Trial Balance or Sales Tax Liability; on Accrual it counts on its date.
- p2-apply-credit and p2-refund-receipt add the rows that bring a credit memo back (when it is applied to an invoice or refunded).

## 4. Data

### 4.1 New collections (migration `2100000022_create_books_credit_memos.js`)

p3-pay-bills' `2100000022_create_books_audit_log.js` is renamed `2100000023_create_books_audit_log.js` so the audit view stays the last migration; its `LINES` list gains `['books_credit_memo_lines', 'books_credit_memos', 'credit_memo']`. The plan lists `pb-migrations/` again before it names the number.

- `books_credit_memos`: the invoice's fields without `terms` and `due_date`: `customer` (relation books_customers, required), `status` select draft/posted/void, `number` text 40 (server), `sequence` number (server), `date` text day (required), `bill_to` json, `email` email, `tax_rate` relation books_tax_rates (optional), `message` text 4000, `memo` text 4000, `subtotal` / `tax_total` number onlyInt (server), `total` number onlyInt min 0 (server), `balance` number onlyInt min 0 (server, Q10: the credit not yet applied; the total at posting, 0 on a draft or a void memo), `currency` (server), `entry` relation books_journal_entries (server), `invoice` relation books_invoices (optional, not cascade; Q2), `replaces` / `replaced_by` relation books_credit_memos, `posted_by` / `posted_at` / `voided_by` / `voided_at` (server), `form` relation (forms), `fields` json, `revision` and `sort_key` as the invoice, `created`, `updated`. Rules as the invoice's, with `balance` among the server fields a client may not set. Index (customer, status, balance), for p2-apply-credit's "open credits of a customer".
- `books_credit_memo_lines`: as `books_invoice_lines` with `credit_memo` as the parent relation (cascade).
- `books_credit_memo_tax_lines`: as `books_invoice_tax_lines` with `credit_memo`, including `gross_amount`, `currency` and `date`; `gross_amount`, `taxable_amount` and `amount` allow values from −MAX_STORED to 0 as well (Q5).
- FTS index `fts_books_credit_memos` over number, memo, message.
- Cash basis (Q17), in the same migration because `books_credit_memos` must exist: `books_cash_basis_lines.document_kind` gains `credit_memo`, and the collection gains the relation `credit_memo` (books_credit_memos, optional, cascade) with an index; `books_cash_basis_tax_lines` gains the relation `credit_memo` (optional, cascade), its `invoice` relation becomes optional, and it gains `document` (text 15, server-written: the id of the row's invoice or credit memo), which the report source reads as the document link for both kinds.

### 4.2 Edited migrations (in place; Books is unreleased)

- 2100000001: `books_doc_sequences.doc_type` gains `credit_memo`; seed row `booksseqcreditm` (prefix '', next 1001); the header comment names it.
- 2100000002: `books_journal_entries.doc_type` gains `credit_memo`.
- `server/entry_type_labels.json` `docTypes` gains `"credit_memo": "Credit memo"`; `server/entry_routes.json` gains `"credit_memo": "credit-memos"`; `lib/doc-types.ts` `DOC_TYPES` gains `credit_memo: { label: 'Credit memos', noun: 'credit memo' }`.

### 4.3 Server (Go, `books/server/`)

- `credit_memos.go`: `docTypeCreditMemo = "credit_memo"`, the refusal texts, and `creditMemoKind` — a `salesDocKind` with `Lifecycle: lifecyclePosting`, the three collections, `ParentField: "credit_memo"`, `HostKey: "books:credit_memo"`, `LineTables: {salesDocLinesKey}`, `Party: partyCustomer`, `AddressField: "bill_to"`, `CustomerRequired: true`, `HasTax: true`, `TracksBalance: true`, `Credit: true`, `CreditAccount` = `ensureReceivables`, `CheckHeader` (the date, and the invoice link), no `CheckVoid`, no `Replace` (p2-apply-credit adds both when something applies a memo). Registered with `registerSalesDocGuards(app, creditMemoKind)` in `register.go` and in `TestRegister_BindsEachPartOnce`'s hand-bound list. `documentDocTypes` gains the doc type; `entryNouns("credit_memo")` gives "Credit memo" / "This credit memo".
- `salesDocKind` gains one field, `Credit bool`: a credit kind posts the mirror of a sale (Q4, Q5). In `salesDocPostingLines` the total is credited to `CreditAccount` (as a bill's), the line accounts default to the income accounts **debited** (`incomeByAccount` with the sign turned: a sum above zero is a debit, a sum below zero a credit), and each tax component is **debited** to its agency's liability account. In `writeTaxSnapshot` a credit kind writes `gross_amount`, `taxable_amount` and `amount` negated, with the memo's date. Every other kind keeps its lines and figures.
- Invoice link guard (in `CheckHeader`, inside `serialized`, when `invoice` or `customer` changes on a draft): the invoice exists, is posted, and its customer is the memo's; else `refuseField("invoice", "Choose a posted invoice of this customer.")`. The guard does not run when neither field changes, so a draft whose invoice was voided after the link was stored still saves and posts (Q18: a void keeps the link).
- Invoice correction and void (Q18): the invoice's `Replace` step also moves the `invoice` link of every credit memo that names the original to the correction (posted and void memos too, under a transaction mark that lets an `invoice`-only change of a memo that is not a draft through, as the estimate link's `onlySalesDocUnlinks`), and refuses a correction that changes the customer while a draft or posted credit memo names the invoice: `refuseField("customer", "Credit memos are made from this invoice, so its customer cannot change.")`. A void of the invoice leaves the links.
- Balance (Q10), in `document_balance.go`: `creditMemoBalanceKind = balanceKind{Collection: "books_credit_memos", Noun: "credit memo"}` with no lines and no payment collection (nothing applies a credit memo yet), added to `balanceKinds`. `postedAppliedTo` answers 0 for a kind with no `LinesCollection`, and `verifyDocumentBalances` uses 0 for its applied sum. So `postSalesDoc` writes `balance = total` (`setPostedDocumentBalance`), a void and a replaced original write 0 (`clearDocumentBalance`), and the ledger rebuild verifies and repairs it. p2-apply-credit fills in the kind's lines and payment collections; nothing else writes `balance`.
- Cash basis (Q17), in `cash_basis.go`: `creditMemoCashDeferral = cashDeferral{Kind: "credit_memo", DocType: docTypeCreditMemo, Balance: creditMemoBalanceKind, UnpaidMemo: "Unapplied credit memo (cash basis)", PaidMemo: "Credit memo %s applied (cash basis)", TaxLines: "books_credit_memo_tax_lines"}`, added to `cashDeferrals`. `documentPayments` answers no payment for a kind with no `LinesCollection`. `postSalesDoc`, `voidSalesDoc` and the ledger rebuild then keep the memo's rows in `books_cash_basis_lines` and `books_cash_basis_tax_lines` through the existing `rebuildCashBasisOf` / `syncCashRows` path. `syncCashTaxRows` also writes `document` on every row it writes.
- Report sources (`report_sources.go`): `books.sales_tax_lines` gains the part `books_credit_memo_tax_lines` (document ← `credit_memo`, layer "ledger"), and its cash part maps document ← `document`; `books.sales_documents` gains the part `books_credit_memos` with kind `credit_memo` (Option "Credit memo"; Q19); the cash-basis lines part of `books.journal_lines` needs no change. `entryDocTypeOptions` gains the doc type. `report_sales_tax_liability.go`: the row label and `stlDetailOpen` choose among three kinds (Invoice, Sales receipt, Credit memo) from `entryRoutes`. `TestTransactionDetailOpenPaths` gets a `credit_memo` poster in `tdDocumentPosters`.
- Customer delete: `creditMemoKind.Msgs.CustomerOnDocs` = "%s is on credit memos. Make it inactive instead." joins the kinds the `books_customers` delete hook counts. `productReferences` += credit memo lines; `taxRateReferences` += credit memos `tax_rate`, credit memo tax lines `component`.
- PDF kind `credit_memo` in `documentKinds` (`server/pdf_credit_memo.go`, `buildCreditMemoDocument`, `creditMemoFileName`).
- Registrations: audit (`books_credit_memos`, `books_credit_memo_lines`), OAuth (rw memos and lines, ro tax lines), search source kind `credit_memo` (join customers), quota none.
- Go tests carry one case per required cell of each host row kind (lesson: Go line check must match the TS host), the posting sides, the negated tax snapshot, the balance at post / void / correction, the cash rows of a posted and a void memo, and the link guard and move.

### 4.4 Forms host `books:credit_memo`

Collection `books_credit_memos`, `formColumn: 'form'`, `fieldsColumn: 'fields'`, every column listed. Built-ins: `customer` custom `CustomerField` required locked; `bill_to` `BillToField`; `email` `BandEmailField`; `date` `DocumentDateField` required locked (label "Credit memo date"); `tax_rate` `DocumentTaxField` locked; `lines` table (the invoice's columns and row kinds, `rowShortcuts`, `insertShortcuts`) required; `message`, `memo` textareas labeled from `DOCUMENT_NOTE_LABELS`. `invoice` is a stored column, not a built-in: the form's link row writes it. Layout: page "Credit memo"; one band row customer, bill_to, email, date, tax_rate; `insertCustomBefore: 'lines'`. Host schemas through `FormHostUi.schemas` as the invoice. Engine reach: every part is one the invoice host already uses (table row kinds, locked built-ins, `addOnSubmit`, `FormHostUi.schemas`); no core change.

### 4.5 Client reads (each `useLiveQuery` with an explicit `queryKey`)

As the invoice, per kind: the memo by id (`findOne`, `materialize()` of posted_by / voided_by), its lines by position, its tax lines (read view), the customer by id (`useRecord`), tax rates, settings (currency). The linked invoice by id (`useRecord`, for the link row's number and status). `?invoice`: the invoice (`findOne`) and its lines, each with an error state and Retry. Invoice read view: one `useLiveQuery` of `books_credit_memos` where `invoice = <id>` and not a replaced original, ordered by date. Customer Transactions: one more source in `useCustomerTransactions` (`creditMemoRow` in `lib/party-transactions.ts`). Row types derive from the queries.

### 4.6 Seed and fixture (Q15)

- `lib/credit-memo-form-fixture.ts` (typed with `satisfies` against the generated types): a posted memo made from an invoice, a draft, a void memo and its correction, one with every line kind, a long description, an exempt customer's memo, a 0-tax memo.
- `seed.ts` posts one credit memo (linked to a seeded posted invoice of the same customer, with "Denver combined" tax) and keeps one draft, both through the form's writes, dated after mid-2026 on days no General Ledger, Journal, Trial Balance, Profit and Loss, Balance Sheet or Sales Tax Liability spec reads. The posted memo changes its customer's Open figure, the income and tax accounts and the linked invoice's read view: the plan greps every test that reads those (seeded A/R, customer balance, `books-report-helpers.ts`, the invoice specs that open that invoice) before it picks the customer, the invoice and the day.

## 5. Cut

- Typed credit memo number — numbers are assigned at posting (spec Ledger rules).
- "Message displayed on statement" — cut (Q9); statements are p2-statements.
- Applying the credit to an invoice, and any change to an invoice's balance — p2-apply-credit (Q1). Refunding the credit — p2-refund-receipt.
- Location of sale and "Based on location" tax — Books charges the one header tax the user picks.
- Shipping information — not in spec scope (as the invoice).
- "Send later", Email view, send — p2-email-share.
- "Taxable subtotal" row and the line number column — the invoice's totals and grid have neither.
- "Clear all lines" and the footer "Clear" — Remove line and Discard cover them.
- "Make recurring" — v1.1.
- "Print or Preview" as a separate action — the PDF view tab and Download PDF (⌘P).
- Drag-to-reorder grip — the row menu and ⌘⌥↑/↓ (as the invoice).
- Attachments — spec: bills and expenses only. The settings gear on the form.
- A picker to link an existing memo to an invoice — the link comes only from "Create credit memo".

## 6. Platform notes

- Keyboard shortcuts (the new key M included): web, and iOS with a hardware keyboard; Android has none; every action keeps a visible button. Standing approval for all Books forms (human, 2026-11-11).
- Customer autofocus and type-to-open pickers: web only. Standing approval (human, 2026-11-11).
- Enter / return key in the last Rate adds a line on all platforms. PDF view on both. No new platform-only item.

## 7. Sparks carried

- Largest figure: "Credit amount" in the shared header's big figure (`text-2xl font-semibold text-foreground tabular-nums`, top right wide, under the title on a phone).
- Totals in one column under Amount: the shared `DocumentTotalsPanel` (`tabular-nums text-right`, last row `border-t border-border font-semibold`).
- No core extension.

## 8. Non-goals

- No change to an invoice's balance, status badge or Overdue; no limit of a credit by an invoice.
- No apply credit, refund, write-off or statement.
- No multi-currency. No new data endpoint (the PDF route exists).
- No change to the cash-basis rows of invoices and bills.
- The server never fills the message or the lines; an API create from an invoice gets no copy.

## 9. Open questions

None open. Q1–Q16 were answered on 2026-11-15 and are marked (Qn) in the sections above. Q17–Q20 were answered by the human at the design gate on 2026-11-16, each as recommended:

- Q17 (answered). Cash basis: a credit memo is a deferred kind like the invoice. It is taken out of the cash layer on its date and brought back only when it is applied to an invoice or refunded (p2-apply-credit, p2-refund-receipt). In this unit it changes no cash-basis figure, sales tax included; on Accrual it counts on its date. Recorded in §3.10 (Sales Tax Liability), §3.11, §4.1, §4.3.
- Q18 (answered). The stored invoice link: an edit (correction) of the invoice moves the link to the correction and is refused when it changes the customer while a draft or posted credit memo names the invoice; a void keeps the link and the memo reads "For invoice 1004 (void)". Recorded in §3.2, §3.7, §3.10, §4.3.
- Q19 (answered). Credit memos join the "Sales documents" report source with kind "Credit memo" and their stored (positive) Subtotal, Tax and Total; a user-built report that adds totals across kinds filters by Kind. Recorded in §3.10, §4.3.
- Q20 (answered). "Create credit memo" starts with the invoice's customer, Bill to, Email, Tax and a copy of all its lines, today's date, an empty message and an empty memo; the credit is not limited by the invoice's total or balance. Recorded in §3.2, §3.3, §8.
