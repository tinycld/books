# Sales Receipt — design

Status: APPROVED at the design gate 2026-11-11 (auto-helix unit p2-sales-receipt). Human decisions: direction A; Q1, Q2, Q4–Q31 accepted as recommended; Q3 replaced by the "Sales deposited to" setting (D-Q3, settled by Q16–Q25); the "Default message to customer" setting shared with the invoice (D-MSG, settled by Q26–Q31); both platform items approved as the standing default for all Books forms; no core change. Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Interface, §Forms (also §Ledger rules, §Scope). Contract: `invoice-form-design.md` (p2-invoice, approved 2026-11-08) — every behavior this spec does not restate is the invoice's, with "invoice" read as "sales receipt". Built against books main@09a4593, core main@5a97168c.

## 1. Goal

A bookkeeper records a sale paid on the spot: optionally picks the customer, enters lines from the product list, says how the customer paid (and, only when the business asks, where the money went; otherwise a Books setting decides), sees tax and the amount received as they type, and posts a numbered sales receipt that debits the deposit account, with the same keyboard-first flow as the invoice and a full touch path on a phone.

## 2. Where it lives

- `books/sales-receipts/new` — new sales receipt. `?customer=<id>` starts with that customer. `?replaces=<id>` edits a posted sales receipt (a correction that keeps its number). `?copy=<id>` starts a new draft from an existing one.
- `books/sales-receipts/[id]` — a draft opens in the form; a posted or void one opens in the read view. `?tab=pdf` opens the PDF view tab.
- Entry points: + New → column "Customers" → "Sales receipt" (after "Invoice"); the Journal Entries list, the account register drawer and federated search open `books/sales-receipts/<id>`.
- Books Settings → **Sales** (new section, §3.11) holds "Sales deposited to" and "Default message to customer".
- No sidebar entry, no list (p2-sales-lists owns the Sales list). Both routes are pushed pages; `hidesNewFab` gains `sales-receipts`.

## 3. Behavior

### 3.1 Shared document layer

The invoice screens, form fields, line cells, hooks, schema, save flow, read view, PDF view and Go guards/posting are generalized into one **sales document** layer parameterized by a document kind (`invoice` | `sales_receipt`); the invoice becomes one kind of it with unchanged behavior, and the sales receipt is the second. No invoice file is copied into a sales receipt file. The kind config names: collections, forms host key, doc type, nouns ("Sales receipt", "This sales receipt", "Draft sales receipt"), routes, header built-ins, the big figure's label, the message hint, refusal texts, the posting debit account, and the More/read actions. The invoice's e2e and unit tests stay green, changed only for renamed imports and the shared message label (§3.5).

### 3.2 Speed and keyboard

Identical to the invoice (invoice-form-design §3.1), with these differences:
- On open (new, draft, correction, copy) the Customer picker has focus on web at every width; after Post & new the fresh form focuses Customer again; nothing takes focus on iOS and Android.
- Tab order: Customer → Sale date → Tax → Payment method → Reference no. → Deposit to (only when "Sales deposited to" is "Ask") → line 1 (Product → Description → Qty → Rate → Taxable → row menu) → … → "Add line" → Message → Memo → action bar (Cancel, Save draft, Post, Post & new, More). Bill to and Email are not Tab stops until "Edit address" is pressed (Email is in the band like the invoice's). Admin-added header fields sit after Deposit to (after Reference no. when Deposit to is hidden).
- Payment method and Deposit to are core `SelectInput`s (↑/↓, first-letter typeahead, Enter picks).
- Key map: the invoice's, unchanged keys; the ⇧? group is "Sales receipt". Read view: Edit E, Void V, Copy C, View journal entry J, ⌘P Download PDF; ⌥1 / ⌥2 tabs.

### 3.3 Header

Built-ins of the forms host `books:sales_receipt`, drawn by the shared document fields in the header band:
- **Customer** (optional, locked): `CustomerField` over active customers, with a clear ("No customer") choice. Picking fills Bill to, Email, Tax (customer `default_tax_rate` unless exempt or inactive; else the `is_default` rate; else none) and the line taxable defaults (exempt → all off), as the invoice does, minus Terms. Clearing the customer clears Bill to and Email, sets Tax to the `is_default` rate, and keeps line taxable flags. An exempt customer shows the muted hint "Tax exempt" under the picker (new in the shared `CustomerField`, so the invoice shows it too).
- **Bill to** (snapshot) with "Edit address", and **Email** (editable), as the invoice. With no customer both are empty; Bill to shows "No customer" in muted text and "Edit address" still works.
- **Sale date** (required, locked): core `DateField`, default today. Label "Sale date".
- **Tax** (locked optional): `DocumentTaxField`, as the invoice.
- Second band row, **Payment**:
  - **Payment method** (optional): `SelectInput` over `PAYMENT_METHODS` — "None", Cash, Check, Credit card, Debit card, Bank transfer, Other. Default none.
  - **Reference no.** (optional): text, at most 40 characters ("Check or card reference").
  - **Deposit to** (locked; shown only when the Books setting "Sales deposited to" is "Ask", §3.11): `SelectInput` over active accounts of type `bank` plus the Undeposited funds account(s) (detail type `undeposited_funds`), in chart order, account labels as `filteredAccountOptions`. Required while shown. Default: the first active Undeposited funds account in chart order; when the chart has none, the first active bank account; when it has neither, empty with the inline error "Add a bank account or an Undeposited funds account to the chart of accounts" and Post refused by the server with the same text. A stored inactive account shows by name only for the value it mounted with (`TaxRateField` rule). A draft shows its stored account; a correction (`?replaces`) shows the original's account, editable; a copy follows §3.7.
  - With an account set in "Sales deposited to", Deposit to is not drawn: the row holds Payment method and Reference no., the third cell stays empty so the cells keep their widths, and no text on the form names the account. The server writes the set account to the receipt (§4.3).
- "Edit customer" link under Bill to when a customer is chosen.
- Header right: title ("New sales receipt", "Draft sales receipt", "Edit 1004" for a correction), status badge, `HelpIcon topic="books:sales-receipts"`, and the big figure "Amount received $540.00" (the total; "—" while invalid; "Too large" over the limit).
- Tabs: **Edit** | **PDF view**.

### 3.4 Lines

Identical to the invoice (§3.3 there): row kinds Item, Description, Subtotal, Percent; bundle expansion; one empty Item line on a new form; empty trailing Item line dropped at save; at most 250 lines; grid wide, cards on a phone; "Add line" and "Add…" with the same keys; row menu and line keys.

### 3.5 Footer and totals

- Left: **Message to customer (printed)** (textarea, 4000 chars, prints; hint "Shown on the sales receipt and its PDF.") and **Internal memo (not printed)** (4000 chars, the journal entry memo). The labels come from the shared `DOCUMENT_NOTE_LABELS`, so the invoice uses the same words (its message label changes from "Message to customer (prints on invoice)"; its hint becomes "Shown on the invoice and its PDF."; `invoice-host.test.ts`, `help-invoices.test.ts`, `tests/e2e/invoice-form-post.spec.ts` and `help/invoices.md` change with it).
- On a new blank form (new, Post & new, `?customer=`) the message starts as the text of the Books setting "Default message to customer" (§3.11), empty when the setting is empty. The user may edit or clear it; a cleared message stays cleared; changing the customer does not touch it. Copy copies the source's message; a correction keeps the original's; a saved draft keeps its stored text. The invoice gets the same fill.
- Right, under Amount: Subtotal, the tax line "<rate or group> (<percent>)" with its amount (none with no tax), **Total** (`border-t`, `font-semibold`), and **Amount received** (= Total). No Balance due row.
- Totals by `documentTotals` (shared TS/Go vectors). Total ≥ 0 ("A sales receipt total cannot be below zero. Use a refund receipt.") and ≤ the stored-amount limit.

### 3.6 Saving

As the invoice (§3.5 there): one zod schema for the kind through the forms engine and `zodResolver`, Post adds "Add at least one product or service line"; action bar wide Cancel, Save draft, Post, Post & new, More (Delete draft when saved; Download PDF); phone Cancel, Save draft, Post, More (Post & new, Delete draft, Download PDF); `ShortcutButton`s; writes through `useMutation` (header row, line plan, then `status: 'posted'`), form held by a synchronous store flag; navigation after Post / Post & new / Save draft as the invoice with `books/sales-receipts/…` paths.
- Post refuses an inactive customer (when one is chosen; a correction keeps its original's): "<Customer name> is inactive. Choose an active customer.", under Customer.
- Post refuses an inactive or wrong-type Deposit to: "Choose an active bank or Undeposited funds account", under Deposit to when it is drawn, else in `FormErrorSummary` (hidden-field refusals, `recordRefusalHandler`). With an account set the settings and account guards (§3.10, §3.11) keep this from happening.
- A zero total cannot be posted: "A sales receipt with a total of zero cannot be posted. Add an amount or keep it as a draft."
- Refusals: "Line n: …" under that line; Customer, Sale date, Tax, Deposit to, Reference no. refusals under those fields; the rest in `FormErrorSummary`.
- Writers only; a non-writer at `books/sales-receipts/new` sees "You need bookkeeper access to create sales receipts".

### 3.7 Read view (posted or void)

Header as the form, title "Sales receipt 1004", badge Posted / Void, big figure "Amount received". Body: Customer (or "No customer"), Bill to, Email, Sale date, Tax, Payment ("Check · 43567 · deposited to 1010 Business checking"; missing parts left out), lines read-only, totals, message, memo, "Posted by …", "Voided by …", "Replaced by 1004 (edited)". Actions as the invoice's: writer on posted — Edit (`?replaces`), Void (`VoidDialog`), Copy (`?copy`: same customer, lines, tax, payment method, message; with "Ask" the source's deposit account when still active, else the default rule; with an account set, the set account; today's date; no reference no., no memo), View journal entry, Download PDF; writer on void — Copy, View journal entry, Download PDF; reader — View journal entry, Download PDF.

### 3.8 PDF view tab

As the invoice (§3.7 there) with kind `sales_receipt`: `/api/books/pdf/sales_receipt/<id>`; "Save a draft to see the PDF" on a new form; "Shows the last saved version" with unsaved edits. A draft prints "Draft sales receipt" with no number; a void prints "Sales receipt 1004 (void)". The PDF prints Sold to (omitted with no customer), number, Date, Payment method and Reference no. (when set), every line kind, subtotal, tax line, Total and "Amount received", and the message under "Notes" (no Notes block when the message is empty, as the invoice PDF). It does not print Deposit to or Memo.

### 3.9 States

Loading, error with Retry (merged recoveries), not found ("This sales receipt does not exist"), `?replaces` of a non-posted one ("This sales receipt cannot be edited"), offline (actions disabled): as the invoice.

### 3.10 Elsewhere in Books

- Journal Entries list, registers, entry drawer: Type "Sales receipt", number "1004"; Open goes to `books/sales-receipts/<document>`; Edit opens the correction; Reverse hidden. Name column shows the customer on every line of the entry (blank with no customer).
- General Ledger and Journal report: Type "Sales receipt" via `entry_type_labels.json` `docTypes.sales_receipt`; "Void reversal of 1004".
- Search: kind `sales_receipt`, title "Sales receipt 1004 · Customer" / "Draft sales receipt · Customer" (no "· Customer" with none), row id `sales_receipt:<id>`; drafts included; reference no., memo and message indexed.
- Settings → Numbering: card "Sales receipts" (no prefix, next 1001).
- Customer delete: refused when on any sales receipt, draft or posted: "<Customer name> is on sales receipts. Make it inactive instead." (after the invoice check, before the journal lines check).
- Products and tax rates: a product on a sales receipt line, a rate on a sales receipt or its tax lines cannot be deleted ("This product or service is on 1 sales receipt…" / "This tax rate is on sales receipts. Make it inactive instead.").
- Account delete: the `books_accounts` delete hook (server/accounts.go, which already refuses accounts used by products and tax agencies) also refuses an account that is the Deposit to of any sales receipt, draft or posted: "This account is the deposit account of 1 sales receipt and cannot be deleted. Make it inactive instead." / "…of %d sales receipts…". Making inactive an account that is a draft's Deposit to is allowed (Post then refuses it, §3.6); making an account active needs no receipt check.
- Account guards for the set deposit account: while `books_settings.sales_deposit_account` names an account, making it inactive, deleting it, or changing its type or detail type away from `bank` / `undeposited_funds` is refused: "This account is where sales are deposited (Settings → Sales). Choose another account or Ask there first."
- Help: `books/help/sales-receipts.md` (task-led, payment and deposit, the "Sales deposited to" setting and why Deposit to may be absent, the default message, key map, edit and void, when to use an invoice instead), cross-linked from invoices, customers, documents, banking; `help/invoices.md` gains the default message and the new label; the Books settings help topic gains the Sales section.

### 3.11 Settings → Sales

A new Settings section **Sales** (id `sales`, after Accounting, before Numbering; shown to every Books user). Section-list summary: "Sales deposited to: Ask" or "Sales deposited to 1200 Undeposited funds", plus " · Default message set" when the default message is not empty. Admins edit (the `books_settings` update rule is admin-only); bookkeepers and readers see read-only rows. Edits show in the audit log as other settings edits do. Each card saves on its own Save button through `useSettingsForm` (zod schema in `lib/settings-schema.ts`, server refusals in its `FormErrorSummary` with `rootErrorOnly`).
- Card **Sales receipts** — "Sales deposited to": `SelectInput`, first option "Ask" (default), then every active bank and Undeposited funds account in chart order ("<number> <name>", `depositAccountOptions`). Note: "Ask shows Deposit to on every sales receipt. Choose an account to hide Deposit to and deposit every sale there." With no deposit account in the chart the only option is "Ask". Read-only row: "Sales deposited to — Ask" / "— 1200 Undeposited funds".
- Card **Invoices and sales receipts** — "Default message to customer": `TextAreaInput`, at most 4000 characters, empty by default. Note: "New invoices and sales receipts start with this message. You can change it on each one." Read-only row shows the text or "None".
- The sales receipt form reads the settings row live: if "Sales deposited to" changes while a form is open, Deposit to appears or hides at once; when it appears it holds the draft's stored account or the default rule. A changed default message changes no open or saved document.
- The setting covers sales receipts only; receive payment and refund receipt are not covered by this unit.

## 4. Data

### 4.1 New collections (migration `2100000011_create_books_sales_receipts.js`)

- `books_sales_receipts`: the invoice's fields minus `terms` and `due_date`; `customer` optional; `replaces` / `replaced_by` relate to `books_sales_receipts`; plus `payment_method` select (PAYMENT_METHODS keys, optional), `reference_no` text 40, `deposit_to` relation books_accounts (required). Rules as the invoice's.
- `books_sales_receipt_lines`: as `books_invoice_lines` with `sales_receipt` as the parent relation (cascade).
- `books_sales_receipt_tax_lines`: as `books_invoice_tax_lines` with `sales_receipt`.
- FTS index `fts_books_sales_receipts` over number, reference_no, memo, message.
- `books_settings` gains `sales_deposit_account` (relation `books_accounts`, optional, not cascade; empty = "Ask"). It is added here, not in 2100000001, because `books_accounts` is created after 2100000001.

### 4.2 Edited migrations (in place; Books is unreleased)

- 2100000001: `books_doc_sequences.doc_type` gains `sales_receipt`; seed row `booksseqsalesrc` (prefix '', next 1001). `books_settings` gains `default_customer_message` (text, max 4000; the row starts it empty); the header comment names both new settings.
- 2100000002: `books_journal_entries.doc_type` gains `sales_receipt`.
- `server/entry_type_labels.json` `docTypes` gains `"sales_receipt": "Sales receipt"`; `lib/register.ts` `DOC_TYPE_LABELS` and `lib/doc-types.ts` `DOC_TYPES` gain it.

### 4.3 Server (Go)

- `invoices.go` / `invoice_posting.go` become a generic sales-document guard and posting set driven by a `salesDocKind` value (collections, host key, doc type, refusal texts, header guards, `debitAccount(tx, doc)`); `registerInvoiceGuards` becomes one registration per kind.
- Sales receipt header guards: customer exists and active when it changes (optional); tax rate as the invoice; date valid; reference_no ≤ 40; payment_method a known key. Deposit account: inside `serialized`, `salesDepositAccount(tx)` reads the setting; when it names an account, the guard writes that account to `deposit_to` on every create and update and again in the posting transaction, whatever the client sent (a draft, a correction and a copy all take the current setting); when it is "Ask", the client's `deposit_to` must exist, be active, and be type `bank` or detail type `undeposited_funds` (`isDepositAccount`).
- `books_settings` update guard (existing `registerSettingsGuard`, checked only when the field changes): `sales_deposit_account` empty or an account that passes `isDepositAccount`, else "Choose Ask or an active bank or Undeposited funds account" keyed to the field. `default_customer_message` needs no guard beyond the schema.
- `books_accounts` guards (server/accounts.go `checkAccountChange`, `checkAccountDelete`): the §3.10 refusal for the account the setting names.
- Posting: debit Deposit to for the total; credit each product's income account; credit each tax component's agency liability; every line names the customer (empty when none); through `postDocument` (doc type `sales_receipt`). Correction, void and tax snapshot as the invoice.
- `entryNouns('sales_receipt')`, `entries.go` document-entry checks extended to the doc type, audit labels ("Sales receipt 1004", "Draft sales receipt", "<receipt>: line n"), OAuth (rw receipts and lines, ro tax lines), search source (LEFT JOIN customers), PDF kind `sales_receipt` (`pdf_sales_receipt.go` or the generalized invoice builder), report source doc-type option, `productReferences`, `taxRateReferences`, customer delete hook, `TestRegister_BindsEachPartOnce` list.
- Go `ensureUndepositedFunds(tx)` in `document_posting.go` (the first active `undeposited_funds` account in chart order, created inside the transaction when the chart has none, as `ensureReceivables`) is added with its unit test as a shared part for p2-receive-payment and p2-bank-deposit. No sales receipt path calls it: posting a sales receipt never creates an account.
- `PAYMENT_METHODS` Go mirror (`server/payment_methods.json`, drift-tested by `lib/payment-methods.ts`).

### 4.4 Forms host `books:sales_receipt`

Built-ins: `customer` custom `CustomerField` locked (optional); `bill_to` `BillToField`; `email` `BandEmailField`; `date` `DocumentDateField` required locked (label "Sale date"); `tax_rate` `DocumentTaxField` locked; `payment_method` custom `PaymentMethodField`; `reference_no` text (max 40); `deposit_to` custom `DepositAccountField` locked, not host-required (a hidden built-in cannot be host-required): the form passes `FormRenderer` a definition with `deposit_to` hidden through `hideBuiltins` when the setting names an account, the zod schema requires it only in "Ask" mode, and the server enforces it; `lines` table (the invoice's columns and row kinds, `rowShortcuts`, `insertShortcuts`) required; `message`, `memo` textareas labeled from `DOCUMENT_NOTE_LABELS` (the invoice host `books:invoice` takes the same labels). Layout: page "Sales receipt"; band row 1 customer, bill_to, email, date, tax_rate; band row 2 payment_method, reference_no, deposit_to; `insertCustomBefore: 'lines'`.

### 4.5 Client reads

As the invoice, per kind: the receipt by id (`findOne`, `materialize()` of posted_by/voided_by), its lines by position, its tax lines (read view), customer by id (`useRecord`, skipped with none), tax rates, deposit accounts (one `useLiveQuery` over books_accounts filtered by type, query key `books.form.depositAccounts`), settings (`useBooksSettings`, live: `sales_deposit_account` decides whether Deposit to is drawn; `default_customer_message` fills a new form's message, invoice included).

### 4.6 Seed and fixture

- `lib/sales-receipt-form-fixture.ts` (typed with `satisfies` against generated types): posted (Check, deposited to Undeposited funds), posted with no customer (Cash, to 1000 Business Checking), draft, void + correction, every line kind, a long description and reference, an exempt customer's receipt.
- The e2e book (`lib/seed-accounts.ts`) gains `1200 Undeposited funds` (other_current_asset / undeposited_funds), so posting with the default deposit account needs no account created mid-suite. The plan greps every test that lists the seeded chart or names the account after 1100.
- `seed.ts` posts two sales receipts (Check to 1200 Undeposited funds with a customer; Cash to 1000 Business Checking with no customer) dated after mid-2026, on days no GL / journal-report / trial-balance spec reads, and keeps one draft. The plan greps the tests that count seeded entries or A/R. The seed leaves "Sales deposited to" as "Ask" and the default message empty.

### 4.7 E2E on the shared e2e DB

Every test that changes or depends on either new setting lives in one file, `tests/e2e/sales-receipt-form-settings.spec.ts` (one file's tests run in order on one worker; no serial mode is configured), and an `afterEach` puts both settings back through the Settings UI. Its tests: with "Ask", Deposit to shows and a post to 1000 Business Checking lands there; with 1200 Undeposited funds set through Settings → Sales, a new receipt has no Deposit to, posts, and the read view says "deposited to 1200 Undeposited funds" (once also at 390 wide); making 1200 inactive while set is refused; a unique default message fills a new invoice and a new sales receipt and prints on the receipt's PDF view, and Copy keeps the source's message. The set account in the test is 1200, the "Ask" default, so a receipt that a parallel spec posts with the default lands on the same account in either mode. No other spec asserts Deposit to's visibility, picks a non-default deposit account, or asserts that a new form's message is empty. `books-settings.spec.ts` section-list checks gain the Sales section.

## 5. Cut

- Typed sales receipt number — assigned at posting (spec Ledger rules).
- Location of sale — Books charges the one header tax the user picks; location-based tax is not in spec scope.
- Shipping information, shipping fee — not in spec scope (as the invoice).
- Tags — not in v0 scope.
- Cc/Bcc, "Send later", Email view tab, send — p2-email-share.
- "Sign up for Payments" — online payments are Later.
- "Clear all lines" button — Remove line (⌘⌥⌫) and Discard cover it; one more destructive button in the bar is not worth it.
- Drag-to-reorder grip — row menu and ⌘⌥↑/↓ (as the invoice).
- Refund from a sales receipt (More) — p2-refund-receipt. Audit history — p5-audit-log.
- Managed payment method list (add/rename methods) — fixed list (Q4).
- Settings gear on the form — company and numbering settings live in Settings.

## 6. Platform notes

- Keyboard shortcuts: web, and iOS with a hardware keyboard; Android has none; every action keeps a visible button. Approved 2026-11-11 as the standing default for all Books forms.
- Customer autofocus and type-to-open pickers: web only. Approved 2026-11-11 as the standing default for all Books forms.
- Both settings cards work on both platforms (the Settings section list as rows on a phone, the menu as a sheet).
- Enter / return key in the last Rate adds a line on all platforms. Qty, Rate, Percent use the invoice's native keyboard types. PDF view on both.

## 7. Sparks carried

- Largest figure: "Amount received" in the shared header's big figure (`text-2xl font-semibold text-foreground tabular-nums`, top right wide, under the title on a phone).
- Payment group: a second row inside the shared header band (`rounded-xl border border-border bg-surface-secondary p-4`) holding Payment method · Reference no. · Deposit to (Deposit to only with "Ask"), same cell chrome; on a phone the cells stack under the first row's fields.
- No core extension.

## 8. Non-goals

- No bank deposit grouping (p2-bank-deposit, which also adds the guard that a deposited receipt cannot be voided or edited).
- No A/R effect, no customer balance, no payment allocation.
- No multi-currency.
- No new data endpoint (the PDF route exists).
- No change to invoice behavior beyond the shared-layer refactor, the shared message label, and the default-message fill.
- "Sales deposited to" does not apply to receive payment or refund receipts. No default message per document kind.
- The server never fills the message; an API create gets no default.
