# Refund Receipt — design

Status: APPROVED at the design gate 2026-11-18 (auto-helix unit p2-refund-receipt): direction A, and the recommended answer of every open question (Q1–Q14, §9) accepted as written and marked (Qn). Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Interface, §Scope (also §Ledger rules, §Forms). Contracts: `invoice-form-design.md`, `sales-receipt-form-design.md` and `credit-memo-form-design.md` (the shared sales document layer) — every behavior this spec does not restate is the sales receipt's, with "sales receipt" read as "refund receipt"; `credit-memo-form-design.md` §3.11, §4.3 and Q17 (a credit memo comes back on the cash basis when it is refunded; its `balance` has one writer); `vendor-refund-design.md` §3.9, §3.10 (the mirror on the vendor side: a refund is a payer of a credit's balance); `sales-reports-design.md` (refund receipt lines carry sign −1; a refund of a credit memo is no sale line); `sales-tax-liability-design.md` U1 (union parts); `sales-lists-design.md`; `customer-pages-design.md` §5. Built against books main@94fb5837, core main@470a6f7b.

## 1. Goal

A bookkeeper gives money back to a customer: picks the customer (or starts from a posted sales receipt or a credit memo), enters the lines that are refunded, says how the money went back and which account it left, sees tax and the amount refunded as they type, and posts a numbered refund receipt that takes the money out of that account, with the invoice's keyboard-first flow on web and a full touch path on a phone.

## 2. Where it lives

- `books/refund-receipts/new` — new refund receipt. `?customer=<id>` starts with that customer. `?sales_receipt=<id>` starts from a posted sales receipt (§3.2). `?credit_memo=<id>` pays out a credit memo (§3.3). `?replaces=<id>` edits a posted refund receipt (a correction that keeps its number). `?copy=<id>` starts a new draft from an existing one.
- `books/refund-receipts/[id]` — a draft opens in the form; a posted or void one opens in the read view. `?tab=pdf` opens the PDF view tab.
- Entry points: + New → column "Customers" → "Refund receipt" (after "Credit memo"); the customer page's New transaction menu (`NEW_ACTIONS` `takesCustomer`); the sales receipt read view's **Refund** (§3.11); the credit memo read view's **Refund credit** (§3.12); the Sales lists tab "Refund receipts" and its New menu (§3.13); the Journal Entries list, the account register drawer, report drills, the audit log and federated search open `books/refund-receipts/<id>`.
- No sidebar entry. Both routes are pushed pages; `hidesNewFab` gains `refund-receipts`.

## 3. Behavior

### 3.1 Shared document layer

- The refund receipt is a new kind of the sales document layer: `REFUND_RECEIPT_KIND` (`lib/sales-document-kinds.ts`), `REFUND_RECEIPT_DOCUMENT` (`components/documents/document-kinds.ts`), `REFUND_RECEIPT_DATA` (`hooks/refund-receipt-data.ts`) and the Go `refundReceiptKind` (`server/refund_receipts.go`). No sales receipt or credit memo file is copied into a refund receipt file.
- Kind values: key `refund_receipt`, lifecycle `posting`, host `books:refund_receipt`, test id `refund-receipt`, route base `books/refund-receipts`, noun "Refund receipt", "This refund receipt", "Draft refund receipt", "New refund receipt", shortcut group "Refund receipt", party `customer`, `customerRequired: false`, line tables `SALES_LINE_TABLES`, features `SALES_FEATURES`, help topic `books:refund-receipts`, PDF stem `refund-receipt-<number>` / `draft-refund-receipt`, `bandSplitAt: 'payment_method'`, `keepsEmptyLinesOnRefusal: false`.
- The big figure and the last row of the totals are both labeled **Amount refunded** (Q7): `figure: { label: 'Amount refunded', testId: 'amount-refunded' }`, `lastTotal: { label: 'Amount refunded', testId: 'total-refunded' }`. Both show the total.

### 3.2 Header

Built-ins of the forms host `books:refund_receipt` (§4.4), drawn by the shared document fields in the header band:
- **Customer** (optional, locked; Q4): `CustomerField` over active customers with the "No customer" choice, as the sales receipt. A pick fills Bill to, Email, Tax and the line taxable defaults as the sales receipt does. An exempt customer shows "Tax exempt".
- **Bill to** (snapshot) with "Edit address", and **Email** (editable), as the sales receipt.
- **Refund date** (required, locked): core `DateField`, default today.
- **Tax** (locked optional): `DocumentTaxField`, as the invoice.
- Second band row, **Payment**:
  - **Payment method** (optional): `PaymentMethodField` over `PAYMENT_METHODS`, default None.
  - **Reference no.** (optional): text, at most 40 characters, placeholder "Check or card reference".
  - **Refund from** (required, locked; Q3): `SelectInput` over active accounts of type `bank` and the Undeposited funds accounts (detail type `undeposited_funds`), in chart order, labels as `depositAccountOptions`. Default on a new form: the first active bank account in chart order; when the chart has no bank account, the first active Undeposited funds account; when it has neither, empty with the inline error "Add a bank account or an Undeposited funds account to the chart of accounts". A stored inactive account shows by name only for the value it mounted with. Under the select, the muted line "Balance $4,077.38" (`PaidFromBalance`, the picked account's posted balance; no line while no account is picked). The Books setting "Sales deposited to" does not apply: Refund from always shows.
- **Source link** (Q5): a refund started with `?sales_receipt=<id>` stores that sales receipt in `sales_receipt`. The form shows it as one read-only row in the band, "Refund of sales receipt 1004" (`DocumentSourceLink`, a Tab stop after the Customer's links; Enter opens the sales receipt), with a "Remove link" button after it (a Tab stop, no key). Changing the customer removes the link. When the linked sales receipt is void the row reads "Refund of sales receipt 1004 (void)"; the link stays and a draft that already has it can be saved and posted. `sales_receipt` is no field of the form: it travels as a kind field of the document (`DocumentKindFields` `{ kind: 'refund_receipt' }`), and the save writes it, as the credit memo's `invoice`.
- Start from a sales receipt (`?sales_receipt=<id>`): the form starts with the sales receipt's customer (or none), Bill to, Email, Tax, payment method and a copy of every line (kind, product, description, quantity, rate or percent, taxable); Refund from is the sales receipt's deposit account while it is active, else the default rule; today's date; no reference no.; an empty message and an empty memo. The user removes or changes the lines that are not refunded. Nothing limits the refund to the sales receipt's total (Q5). `?sales_receipt` of a sales receipt that is not posted, or that the user cannot read, shows "This sales receipt cannot be refunded" with a back link.
- Header right: title ("New refund receipt", "Draft refund receipt", "Edit 1003" for a correction), status badge (Draft / Posted / Void), `HelpIcon topic="books:refund-receipts"`, and the big figure "Amount refunded $540.00" (the total; "—" while invalid; "Too large" over the limit).
- Tabs: **Edit** | **PDF view**.

### 3.3 Paying out a credit memo (Q1, direction A)

- A refund started with `?credit_memo=<id>` stores that credit memo in `credit_memo`; it is a **payout**. A payout gives the customer the money of a credit they already hold, so it posts against Accounts receivable, not against income (§4.3).
- The form starts with the credit memo's customer, Bill to, Email, Tax and a copy of every line, today's date (the credit memo's date when that is later than today), Refund from by the default rule, no payment method, no reference no., an empty message and an empty memo. The lines say what is refunded and print on the refund receipt; the user removes or changes lines to refund a part.
- The band shows the read-only row "Pays out credit memo 1001 · $250.00 unapplied" (`DocumentSourceLink` plus the credit memo's live `balance`; for a correction, the balance plus what the original pays out). Under it, a `DocumentNotice`: "This refund pays out a credit. It lowers what Books owes the customer; income and sales tax were lowered by the credit memo."
- In a payout the Customer field is read-only (drawn disabled, not a Tab stop) and the row has no "Remove link": a payout cannot turn into a refund against income. `?customer`, `?sales_receipt` and `?credit_memo` together: `credit_memo` wins and the others are ignored.
- The total must be above zero and at most the credit memo's unapplied credit: "The refund is more than the unapplied credit of $250.00 on credit memo 1001.", drawn under the link row (form error on `credit_memo`; a zod `.superRefine` of the kind's schema, built with the live balance, and the server's refusal with the same text).
- The refund date must be on or after the credit memo's date: "Date the refund on or after the credit memo's date, Nov 12, 2026.", under Refund date (zod and server).
- `?credit_memo` of a credit memo that is not posted, has no unapplied credit, or that the user cannot read, shows "This credit memo cannot be refunded" with a back link.
- Copy of a payout (`?copy`) makes a plain refund draft with no link (§3.8).

### 3.4 Speed and keyboard

Identical to the sales receipt (sales-receipt-form-design §3.2), with these differences:
- Tab order: Customer → "Edit address" → "Edit customer" → the source link → "Remove link" (each only while it shows, in the order they draw) → Refund date → Tax → Payment method → Reference no. → Refund from → line 1 (Product → Description → Qty → Rate → Taxable → row menu) → … → "Add line" → Message → Memo → action bar (Cancel, Save draft, Post, Post & new, More). Picking a customer moves focus to Refund date.
- On open (new, draft, correction, copy, from a sales receipt) the Customer picker has focus on web at every width. A payout opens with focus on Refund date (its Customer is read-only). Nothing takes focus on iOS and Android.
- Key map: the invoice's keys, unchanged; the ⇧? group is "Refund receipt". Read view: Edit E, Void V, Copy C, View journal entry J, Download PDF ⌘P; tabs ⌥1 / ⌥2.
- New read keys: **Refund R** on the sales receipt read view and **Refund credit R** on the credit memo read view (`DOCUMENT_READ_KEYS.refund = 'r'`; no read view offers two actions on R: Receive payment is the invoice's, Record refund the vendor credit's). Each is a `ShortcutButton` with the screen's `scopeOwner`; on a phone it sits in More with its key as the row's `shortcut` text.

### 3.5 Lines

Identical to the invoice (invoice-form-design §3.3): row kinds Item, Description, Subtotal, Percent; bundle expansion; one empty Item line on a new form; an empty trailing Item line dropped at save; at most 250 lines; "Add line" and "Add…" with the same keys; the row menu and the line keys. Amounts are entered positive: a line of Qty 1 × Rate 150.00 refunds $150.00. The table never scrolls sideways: its columns flex with a least width and the lines draw as cards while the form is narrower than the table's own least width.

### 3.6 Footer and totals

- Left: **Message to customer (printed)** (4000 chars; hint "Shown on the refund receipt and its PDF.") and **Internal memo (not printed)** (4000 chars, the journal entry memo), labels from `DOCUMENT_NOTE_LABELS`.
- A new refund receipt's message starts empty (Q8): the setting "Default message to customer" does not fill it. Copy copies the source's message; a correction keeps the original's.
- Right, under Amount: Subtotal, the tax line "<rate or group> (<percent>)" with its amount (none with no tax), **Total** (`border-t`, `font-semibold`), and **Amount refunded** (= Total).
- Totals by `documentTotals`. The total must be ≥ 0 ("A refund receipt total cannot be below zero. Use a sales receipt.") and ≤ the stored-amount limit ("The refund receipt total is more than Books can store.").

### 3.7 Saving

As the sales receipt (§3.6 there): one zod schema for the kind through the forms engine (host schemas) and `zodResolver`; Post adds "Add at least one product or service line"; action bar wide Cancel, Save draft, Post, Post & new, More (Delete draft when saved; Download PDF); phone Cancel, Save draft, Post, More (Post & new, Delete draft, Download PDF); `ShortcutButton`s; writes through `useMutation` in this order, one yielded transaction each: the header row, the line plan (`planTableWrites` / `tableWriteSteps`), then the update `status: 'posted'`; the form held by the synchronous store flag; navigation after Post / Post & new / Save draft with `books/refund-receipts/…` paths (Post & new keeps `?customer` only when opened with it, and never `?sales_receipt` or `?credit_memo`).
- Post refuses an inactive customer (when one is chosen; a correction keeps its original's): "<Customer name> is inactive. Choose an active customer.", under Customer.
- Post refuses an inactive or wrong-type Refund from: "Choose an active bank or Undeposited funds account", under Refund from.
- A zero total cannot be posted: "A refund receipt with a total of zero cannot be posted. Add an amount or keep it as a draft."
- A link the server refuses shows under the link row: "Choose a posted sales receipt of this customer." (field `sales_receipt`); "Choose a posted credit memo of this customer with unapplied credit." (field `credit_memo`); and the payout cap of §3.3. `handleMutationErrorsWithForm` sets the server's message on the field, and the link row draws `formState.errors.sales_receipt` / `.credit_memo`.
- Refusals: "Line n: …" under that line; Customer, Refund date, Tax, Refund from, Reference no. under those fields; the rest (close date, sequence, totals limit) in `FormErrorSummary`.
- Leaving a dirty form asks first (core `useLeaveGuard`, as every document form).
- Writers only; a non-writer at `books/refund-receipts/new` sees "You need bookkeeper access to create refund receipts".

### 3.8 Read view (posted or void)

- Header as the form, title "Refund receipt 1003", badge Posted / Void, big figure "Amount refunded". Tabs **Details** | **PDF view**.
- Body (`RefundReceiptReadDetails`): Customer (link to the customer page, or "No customer"), Bill to, Email, Refund date, Tax, Payment ("Check · 20417 · refunded from 1000 Business Checking", `paymentText` with the new verb "refunded from"; missing parts left out); "Refund of sales receipt 1004" or "Pays out credit memo 1001" (`DocumentSourceLink`, with "(void)" when the source is void) when the refund has a link; the lines read-only (`DocumentReadLines`); totals ending in "Amount refunded"; message; memo; "Posted by …", "Voided by …", "Replaced by 1003 (edited)".
- Actions: writer on posted — Edit (`?replaces=<id>`), Void (`VoidDialog`; for a payout its text adds "The credit memo's credit is unapplied again."), Copy (`?copy=<id>`), View journal entry, Download PDF; writer on void — Copy, View journal entry, Download PDF; reader — View journal entry, Download PDF.
- Copy: same customer, lines, tax, payment method, Refund from (when still active, else the default rule) and message; today's date; a new draft; no reference no., no memo and no link.
- Edit (a correction) keeps the original's link, memo and number. A payout's correction is capped by the credit memo's balance plus the original's total.

### 3.9 PDF view tab

As the sales receipt (§3.8 there) with kind `refund_receipt`: `/api/books/pdf/refund_receipt/<id>`; "Save a draft to see the PDF" on a new form; "Shows the last saved version" with unsaved edits. A draft prints "Draft refund receipt" with no number; a void prints "Refund receipt 1003 (void)". The PDF prints Refund to (the Bill to address; omitted with no customer), number, Date, Payment method and Reference no. (when set), the source line ("Refund of sales receipt 1004" / "Refund of credit memo 1001", the read view's void suffix included), every line kind, subtotal, the tax line, Total and "Amount refunded", and the message under "Notes" (no Notes block when the message is empty). It prints no Refund from and no memo.

### 3.10 States

Loading, error with Retry for each failing read (merged recoveries), not found ("This refund receipt does not exist"), `?replaces` of a refund that is not posted ("This refund receipt cannot be edited"), a source that cannot be refunded (§3.2, §3.3), no write access, offline (actions disabled): as the sales receipt.

### 3.11 Sales receipts, after this unit

- A writer on a posted sales receipt gets **Refund** (key R) after Copy; it opens `books/refund-receipts/new?sales_receipt=<id>`. A void sales receipt and a reader do not get it. On a phone it sits in More.
- Under the sales receipt's totals, a section **Refund receipts** lists the refund receipts that name it and are not a replaced original: number (link), date, amount, status badge. Wide: a grid whose four columns each flex with a least width of 95 px; cards while the section is narrower than the grid's own least width. No refund, no section. The section is the shared `LinkedDocumentsSection`, extracted from `InvoiceCreditMemos` (which becomes a use of it).
- Edit and void (Q13): a correction of the sales receipt moves the link of every refund receipt that names the original to the correction. A correction that changes the customer while a draft or posted refund receipt names the sales receipt is refused under Customer: "Refund receipts are made from this sales receipt, so its customer cannot change." (void refunds do not block it). A void of the sales receipt keeps the links: each refund reads "Refund of sales receipt 1004 (void)".

### 3.12 Credit memos, after this unit

- A credit memo's `balance` is its total less the totals of the posted refund receipts that pay it out. Every screen that reads `balance` follows.
- A writer on a posted credit memo with `balance` above zero gets **Refund credit** (key R) after Copy; it opens `books/refund-receipts/new?credit_memo=<id>`. On a phone it sits in More.
- Read view totals: after "Credit amount", a **Refunded** row (with a minus sign) and an **Unapplied credit** row, both only when a posted refund pays the memo out (`DocumentKind.readTotals`, as the vendor credit's).
- A section **Refunds** (`LinkedDocumentsSection`) lists the refund receipts that name the memo: number (link), date, amount, status badge.
- Customer Transactions status (`creditMemoStatus`): **Refunded** (success tone) when the balance is 0; Unapplied while it is above zero (a partly refunded memo too); Draft and Void unchanged.
- **Void of a credit memo that a posted refund receipt pays out is refused**: "A refund receipt is recorded on this credit memo. Void the refund first."
- **Credit memo correction** while refund receipts name the original: the links of posted, draft and void refunds move to the correction; refused when its total is below what posted refunds paid out ("$80.00 of this credit is refunded. Its total cannot be below that.", in `FormErrorSummary`), when it changes the customer ("A refund receipt is recorded on this credit memo, so its customer cannot change.", under Customer), or when its date is after the date of the earliest posted refund that names the original, under the date: "Refund receipt 1003 refunds this credit on Nov 15, 2026. Date the credit memo on or before that day." (checked inside `serialized`, before the links move).
- The customer's Open figure (`books_party_balances`) rises by a posted payout with no change to the view: the payout's Accounts receivable debit names the customer.

### 3.13 Elsewhere in Books

- **Sales lists** (Q9): `SALES_TABS` gains **Refund receipts** (key `refund-receipts`, after Credit memos); `TransactionKind` gains `refund_receipt`; "All sales" includes it. Columns as the sales receipts tab (Date, No., Customer, Amount, Status); status chips Draft / Refunded (posted, success tone) / Void; the amount shows with a minus sign ("−$150.00"); row menu and batch actions as the sales receipts tab (open, Edit, Copy, Void, Delete draft, Download PDF); `SALES_NEW_ITEMS` gains "Refund receipt"; empty text "No refund receipts yet". Cards on a phone, as every sales tab.
- **Customer page** Transactions tab: a sixth kind **Refund receipt** — chip "Refunds" (after "Credit memos"), type label "Refund receipt", total with a minus sign, status Draft / Refunded / Void; the row opens `books/refund-receipts/<id>`; empty text "No refund receipts for this customer". New transaction menu: "Refund receipt" (from `NEW_ACTIONS`). A plain refund does not change Open (it touches no Accounts receivable); a payout raises it (§3.12).
- **Journal Entries list, registers, entry drawer**: Type "Refund receipt", number "1003"; Open goes to `books/refund-receipts/<document>`; Edit opens the correction; Reverse is hidden. Name shows the customer on every line (blank with none).
- **General Ledger, Journal, Transaction Detail**: Type "Refund receipt" through `entry_type_labels.json`; "Void reversal of 1003"; the open path from `entry_routes.json` (`"refund_receipt": "refund-receipts"`).
- **Sales by Customer / Sales by Product** (Q10): the lines of a plain refund receipt count with sign −1 (sales-reports-design, "Sign"). A payout's lines are no sale lines (the credit memo's lines counted already) and change neither report.
- **Sales Tax Liability** (Q10): a posted plain refund lowers the gross, taxable and tax figures of its rate and agency on its date (negative tax lines, as the credit memo); its row reads "Refund receipt 1003" and opens it. A payout writes no tax lines.
- **Report builder**: the source "Sales documents" includes refund receipts with Kind "Refund receipt" and their stored, positive Subtotal, Tax and Total; `help/reports.md` already says a report that adds totals across kinds filters by Kind.
- **Cash basis** (Q11): a plain refund is no deferred kind; its entry counts on its date on both methods, as a sales receipt's. A payout is a payment of its credit memo: at the refund date it brings back the payout's share of the memo's deferred lines and cash tax rows (memo "Credit memo 1001 refunded (cash basis)"), by the share rule of the other payers. So on the Cash method a refunded credit memo lowers income and sales tax on the day the money went back.
- **Search**: kind `refund_receipt`, title "Refund receipt 1003 · Customer" / "Draft refund receipt · Customer" (no "· Customer" with none), row id `refund_receipt:<id>`; drafts included; reference no., memo and message indexed.
- **Settings → Numbering**: card "Refund receipts" (no prefix, next 1001; Q6).
- **Audit log**: `books_refund_receipts` ("Refund receipt 1003" / "Draft refund receipt") and `books_refund_receipt_lines` ("<refund>: line n"); history opens the refund.
- **Delete guards**: a customer on any refund receipt: "<Customer name> is on refund receipts. Make it inactive instead." (after the credit memo check, before the journal lines check). A product on a refund receipt line and a tax rate on a refund receipt or its tax lines cannot be deleted (`productReferences` / `taxRateReferences` with "refund receipt"). The Refund from account of any refund receipt: "This account is the refund account of 1 refund receipt and cannot be deleted. Make it inactive instead." / "… of %d refund receipts …".
- **Sales receipt texts**: unchanged; "A sales receipt total cannot be below zero. Use a refund receipt." now names a document that exists.
- **Help**: new `help/refund-receipts.md` (task-led: refund a sale, start from a sales receipt, pay out a credit memo and why it posts to Accounts receivable, refund part of a credit, Refund from and its balance, edit and void, cash basis in one paragraph, when to use a credit memo instead (an invoice the customer has not paid), the key map with Mac glyphs); `help/sales-receipts.md` gains Refund (R) and the Refund receipts section; `help/credit-memos.md` gains Refund credit (R), the Refunded row and status, the void and correction rules; `help/sales-lists.md`, `help/customer-pages.md`, `help/sales-tax.md` and `help/reports.md` gain one paragraph each; cross-links from customers and documents.

## 4. Data

### 4.1 New collections (migration `2100000025_create_books_refund_receipts.js`)

The branch ends with `2100000025_create_books_audit_log.js`; it is renamed `2100000027_create_books_audit_log.js` so the audit view stays last (Q15: `2100000026` is left free for p5-ar-aging, lane purchases, which takes it for `2100000026_create_books_receivable_items.js`), and its `LINES` list gains `['books_refund_receipt_lines', 'books_refund_receipts', 'refund_receipt']`. The plan lists `pb-migrations/` again before it names the number.

- `books_refund_receipts`: the sales receipt's fields with `refund_from` (relation books_accounts, required) in place of `deposit_to`: `customer` (relation books_customers, optional), `status` select draft/posted/void, `number` text 40 (server), `sequence` number (server), `date` text day (required), `bill_to` json, `email` email, `tax_rate` relation books_tax_rates (optional), `payment_method` select (PAYMENT_METHODS keys, optional), `reference_no` text 40, `message` text 4000, `memo` text 4000, `subtotal` / `tax_total` number onlyInt (server), `total` number onlyInt min 0 (server), `currency` (server), `entry` relation books_journal_entries (server), `sales_receipt` relation books_sales_receipts (optional, not cascade), `credit_memo` relation books_credit_memos (optional, not cascade), `replaces` / `replaced_by` relation books_refund_receipts, `posted_by` / `posted_at` / `voided_by` / `voided_at` (server), `form` relation (forms), `fields` json, `revision` and `sort_key` as the sales receipt, `created`, `updated`. Rules as the sales receipt's. Indexes: customer; (status, date); tax_rate; refund_from; sales_receipt; credit_memo; form.
- `books_refund_receipt_lines`: as `books_sales_receipt_lines` with `refund_receipt` as the parent relation (cascade).
- `books_refund_receipt_tax_lines`: as `books_credit_memo_tax_lines` with `refund_receipt` (figures from −MAX_STORED to 0).
- `books_refund_receipt_credits` (server-written; the payer rows of a credit memo's balance): `refund_receipt` (relation, required, cascade), `credit_memo` (relation books_credit_memos, required), `amount` (int cents > 0). Unique (refund_receipt). Index (credit_memo). List/view READ; no client create, update or delete.
- View `books_refund_receipt_sale_lines`: the columns of `books_refund_receipt_lines` for the lines whose refund receipt has no `credit_memo` (a join on the parent; no `UNION`). List/view READ. It is the sales reports' part, so a payout's lines never reach them.
- FTS index `fts_books_refund_receipts` over number, reference_no, memo, message.

### 4.2 Edited migrations (in place; Books is unreleased)

- 2100000001: `books_doc_sequences.doc_type` gains `refund_receipt`; seed row `booksseqrefundr` (15 characters; prefix '', next 1001); the header comment names it.
- 2100000002: `books_journal_entries.doc_type` gains `refund_receipt`.
- `server/entry_type_labels.json` `docTypes` gains `"refund_receipt": "Refund receipt"`; `server/entry_routes.json` gains `"refund_receipt": "refund-receipts"`; `lib/doc-types.ts` `DOC_TYPES` gains `refund_receipt: { label: 'Refund receipts', noun: 'refund receipt' }`.

### 4.3 Server (Go, `books/server/`)

- `refund_receipts.go`: `docTypeRefundReceipt = "refund_receipt"`, the refusal texts, and `refundReceiptKind` — a `salesDocKind` with `Lifecycle: lifecyclePosting`, the three collections, `ParentField: "refund_receipt"`, `HostKey: "books:refund_receipt"`, `LineTables: {salesDocLinesKey}`, `Party: partyCustomer`, `AddressField: "bill_to"`, `CustomerRequired: false`, `HasTax: true`, `Credit: true`, `CreditAccount` = the document's `refund_from`, `CheckHeader`, `BeforePost`, `CheckVoid` none, `Replace` (moves nothing of its own; the payout row is written by each post). Registered with `registerSalesDocGuards(app, refundReceiptKind)` in `register.go` and in `TestRegister_BindsEachPartOnce`'s list. `documentDocTypes` gains the doc type; `entryNouns("refund_receipt")` gives "Refund receipt" / "This refund receipt".
- Header guards (`CheckHeader`, inside `serialized`): the date is a real day; reference_no ≤ 40; payment_method a known key; `refund_from` exists, is active and passes `isDepositAccount` (type `bank` or detail type `undeposited_funds`), else `msgRefundFromInvalid`; at most one of `sales_receipt` and `credit_memo` is set ("A refund receipt has one source."); when `sales_receipt` or `customer` changes on a draft: the sales receipt exists, is posted and its customer equals the refund's (both may be empty), else `refuseField("sales_receipt", "Choose a posted sales receipt of this customer.")`; when `credit_memo` or `customer` changes on a draft: the credit memo exists, is posted, is the refund's customer's and has `balance` above zero, else `refuseField("credit_memo", "Choose a posted credit memo of this customer with unapplied credit.")`; `credit_memo` cannot change or clear once stored on a row ("A payout stays with its credit memo."). The link guards do not run when neither field changes, so a draft whose source was voided afterward still saves.
- Posting (through `postSalesDoc`, doc type `refund_receipt`):
  - Plain refund (no `credit_memo`): the `Credit` kind's lines as the credit memo's — the total credited to `refund_from`, each product's income account debited, each tax component debited to its agency's liability account, every line naming the customer (empty with none); `writeTaxSnapshot` writes negated figures with the refund's date.
  - Payout (`credit_memo` set), in `BeforePost` and a kind hook `PostingLines` (one new optional field of `salesDocKind`; nil keeps `salesDocPostingLines`; the existing `LineAccounts` hook replaces only the line accounts, and a payout must also post no tax line): re-read the credit memo inside the transaction; refuse a memo that is not posted or is another customer's; refuse a total above its `balance` (plus the original's payout for a correction) with the §3.3 text keyed `credit_memo`; refuse a refund date before the memo's date keyed `date`. The entry has two lines: a debit of the total to the Accounts receivable account the memo's entry credited, and a credit of the total to `refund_from`, both naming the customer. No tax snapshot is written. Then the server writes the `books_refund_receipt_credits` row (amount = total), lowers the memo's balance (`applyToDocuments`) and rebuilds the memo's cash-basis rows.
  - Correction: the original becomes void with `replaced_by`; a payout original's credit row is released (`releaseLines`) before the correction applies its own. Void: the reversing entry in the original period, the number kept; a payout's void raises the memo's balance again and rebuilds its cash rows.
- `document_balance.go`: `creditMemoBalanceKind.Payers` gains `{LinesCollection: "books_refund_receipt_credits", LineField: "credit_memo", PaymentCollection: "books_refund_receipts", PaymentField: "refund_receipt", CashMemo: "Credit memo %s refunded (cash basis)"}`. The file's functions do not change. p2-apply-credit adds its payer beside it.
- `cash_basis.go`: `creditMemoCashDeferral` gains `PaymentDocType: docTypeRefundReceipt`, so `postedPaymentsOf` finds the payout's posted entry.
- `credit_memos.go`: `creditMemoKind` gains `CheckVoid` and `Replace` with the §3.12 refusals and the link move (under a transaction mark that lets a `credit_memo`-only change of a refund that is not a draft through, as `onlySalesDocUnlinks`). `sales_receipts.go`: `salesReceiptKind.Replace` moves the `sales_receipt` links and refuses the §3.11 customer change.
- Report sources (`report_sources.go`): `books.sales_lines` gains `part("books_refund_receipt_sale_lines", "refund_receipt", -1)`; `books.sales_tax_lines` gains the part `books_refund_receipt_tax_lines` (document ← `refund_receipt`, layer "ledger", beside the sales receipt's part); `books.sales_documents` gains the part `books_refund_receipts` with kind `refund_receipt` (Option "Refund receipt"); `entryDocTypeOptions` gains the doc type. The view is registered with `changesignal.RegisterView("books_refund_receipt_sale_lines", "books_refund_receipt_lines", "books_refund_receipts")`. `report_sales_tax_liability.go` and `report_sales.go`: the row label and the open path choose among four kinds from `entryRoutes`. `TestTransactionDetailOpenPaths` gets a `refund_receipt` poster in `tdDocumentPosters`.
- Delete guards: the `books_customers` hook's kind list gains `refundReceiptKind.Msgs.CustomerOnDocs`; `productReferences` += refund receipt lines; `taxRateReferences` += refund receipts `tax_rate`, refund receipt tax lines `component`; `checkAccountDelete` += `refund_from`.
- PDF kind `refund_receipt` in `documentKinds` (`server/pdf_refund_receipt.go`, `buildRefundReceiptDocument`, `refundReceiptFileName`).
- Registrations: audit (`books_refund_receipts`, `books_refund_receipt_lines`), OAuth (rw refunds and lines; ro tax lines, credits and the view), search source kind `refund_receipt` (LEFT JOIN customers), quota none.
- Go tests carry one case per required cell of each host row kind, both posting shapes (plain and payout), the negated tax snapshot and its absence on a payout, the payout cap and date rule at post and at correction, the memo's balance at post / void / correction of a payout, the memo's void and correction refusals, the cash rows of a refunded memo, the link guards and both link moves.

### 4.4 Forms host `books:refund_receipt`

Collection `books_refund_receipts`, `formColumn: 'form'`, `fieldsColumn: 'fields'`, every column listed. Built-ins: `customer` custom `CustomerField` locked (optional); `bill_to` `BillToField`; `email` `BandEmailField`; `date` `DocumentDateField` required locked (label "Refund date"); `tax_rate` `DocumentTaxField` locked; `payment_method` custom `PaymentMethodField`; `reference_no` text (max 40); `refund_from` custom `RefundFromField` required locked; `lines` table (the invoice's columns and row kinds, `rowShortcuts`, `insertShortcuts`) required; `message`, `memo` textareas labeled from `DOCUMENT_NOTE_LABELS`. `sales_receipt` and `credit_memo` are stored columns, not built-ins: the link row writes them. Layout: page "Refund receipt"; band row 1 customer, bill_to, email, date, tax_rate; band row 2 payment_method, reference_no, refund_from; `insertCustomBefore: 'lines'`.

`RefundFromField` is `DepositAccountField` (`forms/payment-fields.tsx`) made to take its label, its empty-chart text and a `showBalance` flag: the sales receipt passes "Deposit to" and no balance, the refund receipt "Refund from" and `PaidFromBalance`.

### 4.5 Client reads (each `useLiveQuery` with `{ query, queryKey }`)

As the sales receipt, per kind: the refund by id (`findOne`, `materialize()` of posted_by / voided_by), its lines by position, its tax lines (read view), the customer by id (`useRecord`), tax rates, deposit accounts (the existing query, key `books.form.depositAccounts`), the Refund from account's balance (the read `PaidFromBalance` already makes), settings (currency). The linked sales receipt or credit memo by id (`useRecord`: number, status, `balance`). `?sales_receipt` / `?credit_memo`: the source (`findOne`) and its lines, each with an error state and Retry. Sales receipt read view: one `useLiveQuery` of `books_refund_receipts` where `sales_receipt = <id>` and not a replaced original, by date. Credit memo read view: the same with `credit_memo = <id>`; the Refunded row sums the posted ones. Sales lists and customer Transactions: one more source each (`refundReceiptRow` in `lib/party-transactions.ts`; the kind's entry in `lib/document-list.ts`). Row types derive from the queries.

### 4.6 Seed and fixture

- `lib/refund-receipt-form-fixture.ts` (typed with `satisfies` against the generated types): a posted refund made from a sales receipt, a posted refund with no customer, a draft, a void refund and its correction, a payout of part of a credit memo, one with every line kind, a long description and reference, an exempt customer's refund.
- `seed.ts` posts, through the form's writes: one refund receipt from a seeded posted sales receipt (Check, from 1000 Business Checking); one new posted credit memo of a customer with no other seeded credit memo, and a posted payout of part of it; and keeps one draft. All dated after mid-2026 on days no General Ledger, Journal, Trial Balance, Profit and Loss, Balance Sheet, Sales Tax Liability or sales report spec reads. No credit memo seeded by p2-credit-memo changes its balance. The plan greps every test that reads account 1000, 1100, 2200, 4000, the seeded sales receipt, the customer's Open figure and the sales reports before it picks the customer, the receipt and the days.

### 4.7 E2E on the shared e2e DB

Specs create their own sales receipt, credit memo and refund through the UI with a unique memo and open them through Books search. One phone run (390 × 844) covers the stacked band, line cards, More (Post & new, Refund, Refund credit) and the linked sections as cards; it runs because the phone path draws different components. No spec changes a Books setting.

## 5. Cut

- Typed refund receipt number — numbers are assigned at posting (spec Ledger rules).
- "Service date" column and the line number column — the shared lines table has neither (as the invoice).
- "Check no." as its own field and "Print later" — Reference no. holds a check number; check printing is Later in the spec.
- Cc/Bcc, "Send later", Email view, send — p2-email-share.
- "Taxable subtotal" row — the shared totals have none (as the credit memo).
- "Add lines" in batches and "Clear all lines" — "Add line", Remove line (⌘⌥⌫) and Discard cover them.
- Drag-to-reorder grip — the row menu and ⌘⌥↑/↓ (as the invoice).
- "Refund payments in QuickBooks" — online payments are Later.
- The settings gear on the form — settings live in Settings.
- Refund from a credit card account — the list is the sales receipt's deposit list (Q3).
- Attachments — spec: bills and expenses only.
- "Make recurring" — v1.1.
- A picker that links an existing refund to a sales receipt or a credit memo — a link comes only from Refund and Refund credit.
- A refund on an invoice's read view — an unpaid or paid invoice is credited with a credit memo, which is then applied or refunded; the help topic says so.

## 6. Platform notes

- Keyboard shortcuts (the new key R included): web, and iOS with a hardware keyboard; Android has none; every action keeps a visible button or a More row. Standing approval for all Books forms (human, 2026-11-11).
- Customer autofocus and type-to-open pickers: web only. Standing approval (human, 2026-11-11).
- Enter / return key in the last Rate adds a line on all platforms. PDF view on both. No new platform-only item.

## 7. Sparks carried

- Largest figure: "Amount refunded" in the shared header's big figure (`text-2xl font-semibold text-foreground tabular-nums`, top right wide, under the title on a phone).
- The paying account's balance beside the pick: `PaidFromBalance` under Refund from (`text-sm text-muted-foreground tabular-nums`).
- Payment group: the header band's second row (Payment method · Reference no. · Refund from); cells stack on a phone.
- No core extension.

## 8. Non-goals

- No refund of a customer's unapplied payment (an overpayment kept as credit): no document holds that credit as a balance (Q12; p2-apply-credit decides how payment credit is used).
- No applying a credit memo to an invoice (p2-apply-credit), no write-off, no statement.
- No bank deposit grouping; a refund from Undeposited funds lowers that account at once.
- No limit of a refund by its sales receipt; no change to a sales receipt's totals or status.
- No multi-currency. No new data endpoint (the PDF route exists).
- The "Sales deposited to" and "Default message to customer" settings do not apply.
- The server never fills the message or the lines; an API create from a source gets no copy.

## 9. Open questions (each written in above as recommended)

Q1 payout of a credit memo in this unit, on this form; Q2 (none: the direction is the packet's recommendation); Q3 Refund from accounts and default; Q4 customer optional; Q5 start from a sales receipt, stored link, no limit; Q6 own sequence; Q7 labels; Q8 empty message; Q9 Sales lists tab and Transactions chip; Q10 reports; Q11 cash basis; Q12 unapplied payments; Q13 source edit and void; Q14 seed. The packet states each with its recommended answer; the human accepted all of them on 2026-11-18. Q15 (human, 2026-11-18): migration numbers must not collide with p5-ar-aging — this unit takes `2100000025` (refund receipts) and moves the audit view to `2100000027`; `2100000026` stays free for p5-ar-aging. Q16: files shared with p3-vendor-pages and p5-ar-aging are merged keeping both sides; no `waits_for`.

## 10. Engine reach (self-review)

- Header, tabs, action bar, read view, PDF view: Books `DocumentScreen`, `DocumentForm`, `DocumentHeader`, `DocumentTabs`, `DocumentActionBar`, `DocumentReadView`, `DocumentPdfView` through the kind (`document-kinds.ts`); core `ShortcutButton` (`@tinycld/core/ui/shortcut-button`), `useShortcutScope`, `useRegisterShortcuts`; core `PdfCanvasViewer`.
- Form: core forms engine — host built-ins, table row kinds, locked built-ins, `insertCustomBefore`, `FormRenderer`; custom built-ins validate through `FormHostUi.schemas` (`MoneyField`, the account and customer fields), which shows a refusal inline and blocks the save. `refund_from` is always drawn, so it is host-required; nothing is hidden with `hideBuiltins`.
- Kind-only rules (payout cap, date rule): a zod `.superRefine` in the kind's schema factory, merged by the shared `useDocumentForm` as the sales receipt's deposit rule is; errors on `credit_memo` draw in the link row, as the credit memo's `invoice` error does.
- Fields: core `SelectInput` (with `SelectOption.indent`), `DateField`, `TextInput`, `TextAreaInput`, `FormErrorSummary`; Books `CustomerField`, `PaymentMethodField`, `DepositAccountField` (generalized), `PaidFromBalance`, `DocumentTaxField`, `DocumentSourceLink`, `DocumentNotice`.
- Writes: `useMutation` (`@tinycld/core/lib/mutations`), three yielded steps in order (header insert or update; line plan from core `planTableWrites`; the `status: 'posted'` update as its own transaction, never in the insert's). Server refusals through `handleMutationErrorsWithForm` and `recordRefusalHandler`.
- Reads and recovery: `useLiveQuery` with `queryKey`, `materialize()`, `useRecord`, `recoverLiveQueries`, Books `mergeRecoveries`. Leave guard: core `useLeaveGuard`.
- Server: `salesDocKind` (one new optional field, `PostingLines`), `postSalesDoc`, `balancePayer`, `cashDeferral.PaymentDocType`, core `reports.SourcePart`, `changesignal.RegisterView`, `audit`, `oauth`, `search` registries.
- No bullet needs a core API that does not exist. No core change.
