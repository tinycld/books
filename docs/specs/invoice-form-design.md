# Invoice — design

Status: APPROVED at the design gate of 2026-11-08 (auto-helix unit p2-invoice). Direction A (full-page document form). Q1–Q19 accepted as recommended on 2026-11-06; Q20 resolved (p5-general-ledger's party model); Q21–Q24 accepted as recommended on 2026-11-08; Q25 decided on 2026-11-08 (§4.2). Platform items signed off: keyboard shortcuts on web and iOS hardware keyboard only (2026-11-06); autofocus on Customer and type-to-open pickers on web only (2026-11-08). Core checkpoint 0 (E1, E2 reshaped, E3) accepted, `exclusive`, core merge pre-approved. No open questions. Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Interface, §Forms, §Ledger rules, §Scope. Contracts honored: tax-rates-design §Contracts, products-services-design Q15, customer-form-design Q6, vendor-form-design `PAYMENT_TERMS`, p2-pdf (`documentKinds`, `pdfDocument`), general-ledger-design §"Journal entry lines get a Name" (document units stamp `customer`/`vendor` on the lines they post). Built against books main@66846ed, core main@b021c3af.

## 1. Goal

A bookkeeper bills a customer: picks the customer, enters lines from the product list, sees tax and the total as they type, and posts a numbered invoice to Accounts receivable, using the keyboard alone if they want, with the same screen working by touch on a phone.

## 2. Where it lives

- `books/invoices/new` — new invoice. `?customer=<id>` starts with that customer. `?replaces=<id>` edits a posted invoice (a correction that keeps its number, Q7). `?copy=<id>` starts a new draft from an existing invoice (read view "Copy").
- `books/invoices/[id]` — a draft opens in the form; a posted or void invoice opens in the read view.
- Entry points: + New → column "Customers" → "Invoice" (after "Customer"); Journal Entries list, account register drawer, and federated search open an invoice at `books/invoices/<id>` (Q13).
- No sidebar entry, no Lists hub entry, no invoice list: p2-sales-lists owns the Sales list.
- Both routes are pushed pages; `hidesNewFab` gains `invoices`.

## 3. Behavior

### 3.1 Speed and keyboard (stated goal)

The invoice form is a screen users live in. Every action is reachable from the keyboard in a predictable order, and every action button has a shortcut. Touch keeps every action through visible buttons.

- On open (new, draft, correction, copy) the Customer picker has focus on web at every width; after Post & new the fresh form focuses Customer again. On iOS and Android nothing takes focus, so the soft keyboard does not cover the form (signed off, §6).
- Tab order: Customer → Terms → Invoice date → Due date → Tax → line 1 (Product → Description → Qty → Rate → Taxable → row menu) → line 2 … → "Add line" → Message → Memo → action bar (Cancel, Save draft, Post, Post & new, More). Bill to, Email and the totals are not Tab stops until "Edit address" is pressed. Header custom fields that an admin adds sit after Tax in Tab order.
- Pickers (Customer, Product) are Books `SearchPicker`s: Enter, Space or ↓ on a focused picker opens it with its search field focused; typing a printable character on a focused closed picker opens it with that character in the search (type-to-open); ↑/↓ move, Enter picks, Esc closes and returns focus to the trigger. Picking moves focus to the next field in Tab order. The tax picker is core `SelectInput` (a menu): ↑/↓ and first-letter typeahead (core menu), Enter picks.
- Enter in the last editable cell (Taxable toggle excluded: Enter on Rate) of the last line adds an item line and focuses its Product picker (web and native: the native return key does the same through `onSubmitEditing`).
- Each line has one row menu button (one Tab stop) holding Insert line above, Insert line below, Move up, Move down, Duplicate, Remove; the same actions have keys (below). Drag to reorder is not offered (the row menu and keys reorder on every platform).
- Every action button that has a key is a core `ShortcutButton` (`@tinycld/core/ui/shortcut-button`) with `scopeOwner` from the screen's `useShortcutScope`; never a `Button` plus a separate registration (human decision 2026-11-08). On web, holding ⌘ (Ctrl off Apple) swaps each label for its keys and the tooltip names them; native has no hint and the accessibility hint names the key. Inside a dialog the key goes on `Dialog.ActionButton`'s `shortcut` (`DIALOG_SUBMIT_SHORTCUT` for its submit). Keys with no button (the line keys acting on the focused line, the tabs) are registered by the table (core E2) or by `useRegisterShortcuts`. Every key is listed in core's ⇧? sheet; form keys use `allowInInputs`.
- Key map:

| Where | Action | Key |
|---|---|---|
| Form | Post | ⌘↵ |
| Form | Post & new | ⌘⇧↵ |
| Form | Save draft | ⌘S |
| Form | Cancel (Discard dialog when dirty) | Esc |
| Form | Delete draft (saved draft only) | ⌘⌫ |
| Form | Add item line after the focused line (end when focus is outside the table) | ⌥↵ |
| Form | Add description line | ⌥T |
| Form | Add subtotal line | ⌥S |
| Form | Add percent line | ⌥5 |
| Line (focus inside a line) | Remove line | ⌘⌥⌫ |
| Line | Move line up / down | ⌘⌥↑ / ⌘⌥↓ |
| Line | Duplicate line | ⌘⌥D |
| Line | Open the row menu | ⌥M |
| Form and read view | Edit (form) or Details (read view) tab / PDF view tab | ⌥1 / ⌥2 |
| Form and read view | Download PDF | ⌘P |
| Read view | Edit | E |
| Read view | Void | V |
| Read view | Copy to a new invoice | C |
| Read view | View journal entry | J |

- A key does nothing when its button is hidden, disabled or busy, or the user cannot write. While a dialog or sheet is open, the screen's keys do nothing; Esc closes only the open layer. ⌘S and ⌘P are always taken while the form or read view holds the keys, so the browser's Save Page and Print never open.
- Focus after line actions: a removed line moves focus to the same cell of the next line (previous when it was last; "Add line" when none remain); a moved or duplicated line keeps focus in the moved/new line's same cell.
- The help topic lists every key and says the Customer field has focus when the form opens in a web browser.

### 3.2 Header

- Built-ins of the forms host `books:invoice` (§4.4), drawn by Books components inside the header band:
  - **Customer** (required, locked): `CustomerField` over active customers (sub-customers as "Parent: Child"); an inactive stored customer shows by name. Picking a customer fills Bill to, Email, Terms (customer `terms`, Q8), Tax (customer `default_tax_rate` unless exempt; else the `is_default` rate; else none) and every line's taxable default (exempt → all off). Changing the customer on a form that has lines asks nothing and refills only the header fields (Bill to, Email, Terms, Tax; the new Terms recompute Due date as below); line taxable flags are reset only when the customer's exemption differs. A customer `default_tax_rate` that is inactive is not filled: Tax falls to the `is_default` rate, else none (`TaxRateField` lists an inactive choice only for the value it mounted with).
  - **Bill to** (snapshot, Q9): the customer's billing address shown as lines (`formatAddressLines`) with "Edit address", which reveals the shared `AddressField` in the band. Stored on the invoice; later customer edits do not change it.
  - **Email**: the customer's email, editable (p2-email-share sends to it).
  - **Terms** (locked optional): `PaymentTermsField` (None, Due on receipt, Net 10/15/30/60).
  - **Invoice date** (required, locked): core `DateField`, default today.
  - **Due date** (required): core `DateField`. Picking Terms or changing the invoice date sets Due date = invoice date + term days (`dueDateFor`, through `onValueChange`, never an effect); Due on receipt is 0 days; Terms None leaves Due date as it is (a new form starts with Due date = invoice date). Typing a due date keeps it and keeps Terms. A due date before the invoice date: "The due date cannot be before the invoice date".
  - **Tax** (locked optional): `DocumentTaxField` (rate or group, "None" first; an inactive stored rate shows by name only for the value it mounted with, `TaxRateField` rule).
- "Edit customer" link under Bill to opens `books/customers/<id>` (pushed; returning keeps the unsaved form).
- Header right: title ("New invoice", "Draft invoice", "Edit 1004" for a correction), status badge (Draft / Posted / Void), `HelpIcon topic="books:invoices"`, and the big figure "Balance due $243.56" (the total in this unit; `formatMoney`; "—" while invalid; "Too large" over the limit).
- Tabs under the title: **Edit** | **PDF view** (Q14).

### 3.3 Lines (core table built-in `lines`, extended by core checkpoint 0)

- Row kinds (Q4): **Item**, **Description**, **Subtotal**, **Percent**.
  - Item: Product or service (required; `ProductPicker`, active Service / Non-inventory / Bundle), Description (prefilled from the product's sales description, editable, 4000 chars), Qty (default 1, > 0, at most 2 decimals, ≤ 1,000,000), Rate (money, prefilled from the product price, may be 0 or negative), Amount (read-only, Qty × Rate rounded half away from zero to cents by `lineAmount`), Taxable (toggle, default the product's `taxable`, off for an exempt customer).
  - Description: Description only (required, 4000 chars); no amounts; prints as text.
  - Subtotal: no inputs; shows the sum of Item and Percent amounts since the previous Subtotal line (or the first line); label "Subtotal".
  - Percent: Product or service (required; its income account receives it — a "Discount" service, say), Description, Percent (−100 to +1000, up to 4 decimals, e.g. −10 for a 10% discount), Amount (read-only: Percent × the amount of the line directly above, which must be an Item or a Subtotal; rounded half away from zero), Taxable (default: the line above is taxable; for a Subtotal, on when every taxable-eligible line it covers is taxable).
- A Percent line whose line above is not an Item or Subtotal shows the inline error "A percent line applies to the item or subtotal right above it".
- Picking a Bundle on an Item line replaces that line with one Item line per bundle item (product, its sales description, Qty = bundle qty × line qty, its price, its taxable) followed by a Subtotal line, and focus goes to the first new line's Qty (Q10).
- A new form starts with one empty Item line. An empty trailing Item line (no product, no description) is dropped at save.
- At most 250 lines (server bound).
- Wide (form ≥ 640 px): a grid with column headers Product or service · Description · Qty · Rate · Amount · Tax · (menu); Description cell grows to 3 lines. Phone: each line is a card (kind label, fields stacked, Amount right-aligned, row menu top right). Subtotal and Description lines span the row.
- Buttons under the table: "Add line" (a `ShortcutButton`, ⌥↵) and a menu "Add…" (Description line, Subtotal, Percent line), each menu row showing its key through core `Menu`'s `shortcut` text; the three kind keys are registered by the table (core E2).

### 3.4 Footer and totals

- Left: **Message on invoice** (textarea, 4000 chars, prints) and **Memo** (textarea, 4000 chars, internal; it is the journal entry memo; does not print).
- Right, under the Amount column: Subtotal (sum of Item and Percent amounts), one tax line "Denver combined (8.71%)" with its amount (the header tax; a group's tax is the sum of its components, each by `taxOn` on the taxable total, contract), **Total** (`border-t`, `font-semibold`), and **Balance due** (= Total in this unit). With no tax chosen, no tax line shows.
- Totals are computed by `documentTotals(lines, tax)` (lib/document-lines.ts) on every change, the same function the server mirrors in Go (shared vectors). The total must be ≥ 0 ("An invoice total cannot be below zero. Use a credit memo.") and ≤ the stored-amount limit.

### 3.5 Saving

- Validation: one zod schema `invoiceSchema(currency)` through the forms engine (host schemas) and `zodResolver`; Save draft and Post use the same schema, so a draft is always complete except that a draft may have zero item lines; Post adds one check on top of it, at least one Item line ("Add at least one product or service line", under the lines table), run in the Post handler through the same `zodResolver` errors (a `superRefine` on a `mode: 'post'` variant of the schema), never a hand-written `if`.
- Action bar (Q3), sticky at the bottom: wide — Cancel, Save draft, Post, Post & new, More (Delete draft when saved; Download PDF); phone — Cancel, Save draft, Post, More (Post & new, Delete draft, Download PDF). Each bar button is a `ShortcutButton` (Post, Post & new, Save draft and Delete draft with `serverAction`); a key whose action sits in More is registered with the menu row's `shortcut` text and does what the row does.
- Post refuses a draft whose customer is inactive (Q23): "<Customer name> is inactive. Choose an active customer.", under Customer. A correction (`replaces`) keeps the original's customer even when it is now inactive, because the user did not choose it again (the journal line guard allows a party that a line of the replaced entry names).
- Save writes through `useMutation`: insert/update the `books_invoices` row, then the line plan (`planTableWrites` / `createTablePlans`, "Line n: …" refusals), then for Post set `status: 'posted'`. The form is held through the write by a synchronous store flag (opening-balances pattern). A post refused after the draft was written leaves the draft and shows the refusal.
- After Post: replace with `books/invoices/<id>` (read view). Post & new: replace with a fresh `books/invoices/new` (keeps `?customer` only when opened with it). Save draft stays at `books/invoices/<id>`.
- Cancel with edits opens `DiscardDialog`; without edits leaves at once. Delete draft opens `DeleteDraftDialog`.
- Refusals: "Line n: …" goes under that line's row (root `lines.<n>`); "Customer…", "Due date…", "Tax…" under those fields; everything else (close date, sequence, totals limit) in `FormErrorSummary` with its final period. A refusal after the user left is logged (`log.warn('books.invoice', …)`).
- Writers only (bookkeeper or admin). Without write access, `books/invoices/new` shows "You need bookkeeper access to create invoices"; + New hides for non-writers already.

### 3.6 Read view (posted or void)

- Header as the form, title "Invoice 1004", badge Posted / Void, big figure "Balance due". Tabs **Details** | **PDF view** (⌥1 / ⌥2).
- Body: Bill to, Email, Terms, Invoice date, Due date ("Due Nov 30, 2026"), Tax; the lines read-only (grid wide, cards phone); totals; message; memo. "Posted by Ana Ruiz, Oct 21, 2026, 3:14 PM"; for void also "Voided by …"; for a replaced original, "Replaced by 1004 (edited)" linking to the replacement.
- Actions (writer, posted): **Edit** (`?replaces=<id>`), **Void** (`VoidDialog`: "A reversing entry is posted in the original period. The number is kept."), **Copy** (`?copy=<id>`: same customer, lines, tax, message; today's date; new draft), **View journal entry** (`books/entries/<entry>`), **Download PDF**. Writer on a void invoice: Copy, View journal entry, Download PDF. Reader: View journal entry and Download PDF only.

### 3.7 PDF view tab (Q14)

- Shows the server PDF of the saved invoice (`/api/books/pdf/invoice/<id>`) in core `PdfCanvasViewer` (web: Blob URL; native: cache file), fetched with the bearer token like `usePdfDownload`. A new unsaved form shows "Save a draft to see the PDF" with a Save draft button. A form with unsaved edits shows a notice "Shows the last saved version" above the viewer.
- A draft prints with title "Draft invoice" and no number; a void prints "Invoice 1004 (void)".
- The PDF prints Bill to, number, Date and Due, every line kind (percent lines print "−10%" in Qty and the amount), subtotal, the tax line "<rate or group name> (<percent>)", Total and Balance due, and the message.

### 3.8 States

- Loading: `LoadingState` until access, settings, customer, tax rates and, for an id, the invoice and its lines are ready.
- Error: "Books could not load this invoice." with Retry (`recoverLiveQueries`, merged recoveries).
- Not found: "This invoice does not exist" with a back link.
- `?replaces` of an invoice that is not posted: "This invoice cannot be edited" with a back link.
- Offline: action buttons disabled (core writes-available state).

### 3.9 Elsewhere in Books

- Journal Entries list and registers: an invoice entry shows Type "Invoice" and number "1004"; Open goes to `books/invoices/<document>`; Edit opens the invoice correction; Reverse is hidden (Void or Edit instead); the journal entry view's Edit opens the invoice form. The register's Name column and the entry drawer show the customer on every line of the invoice's entry (Q21).
- General Ledger (and the Journal report when p5-journal-report lands): Type "Invoice", No. "1004", Name the customer, on every line of the entry; a void reversal shows "Void reversal of 1004" (Q24 label table).
- Search: kind `invoice`, title "Invoice 1004 · Customer" / "Draft invoice · Customer", row id `invoice:<id>`; drafts are found here (Q13).
- Settings → Numbering: card "Invoices" (no prefix, next 1001).
- Customers form: new built-in Terms (Q8). Delete of a customer on any invoice, draft or posted, is refused (Q22): "<Customer name> is on invoices. Make it inactive instead." (checked before the existing "<name> is on journal lines. Make it inactive instead.").
- Products and tax rates: an item on an invoice line, or a rate on an invoice, cannot be deleted (append to `productReferences` / `taxRateReferences`).
- Help: `books/help/invoices.md` (task-led, key map, line kinds, edit and void), cross-linked from customers, products-services, sales-tax, documents.

## 4. Data

### 4.1 New collections (migration `2100000010_create_books_invoices.js`; 2100000009 is p5-general-ledger's `add_books_journal_line_parties`)

- `books_invoices`: `customer` (relation books_customers, required), `status` select draft/posted/void, `number` text 40 (server), `sequence` number (server), `date` text day (required), `due_date` text day (required), `terms` select (PAYMENT_TERMS keys, optional), `bill_to` json (address shape, 8 KB), `email` email, `tax_rate` relation books_tax_rates (optional), `message` text 4000, `memo` text 4000, `subtotal`/`tax_total`/`total` number onlyInt (server-written at every save), `currency` (server), `entry` relation books_journal_entries (server), `replaces` relation books_invoices, `replaced_by` relation books_invoices (server), `posted_by`/`posted_at`/`voided_by`/`voided_at` (server), `form` relation (forms), `fields` json (custom values), `sort_key` (server), `created`, `updated`. Rules: READ list/view; create `WRITE && status = "draft"` and server fields unset; update `WRITE` with server fields unset and (`status = "draft"` or posted → void); delete `WRITE && status = "draft"`.
- `books_invoice_lines`: `invoice` (relation, required, cascade), `kind` select item/description/subtotal/percent, `product` relation books_products, `description` text 4000, `quantity` number (2 decimals), `rate` number onlyInt (cents), `percent_ppm` number onlyInt (−1,000,000..10,000,000), `amount` number onlyInt (server-recomputed), `taxable` bool, `position` onlyInt. Rules: as the invoice; writes refused once the invoice is not a draft.
- `books_invoice_tax_lines` (server-written at posting, the tax-rates snapshot contract): `invoice`, `rate` (the header rate or group), `component` (the rate whose tax this is), `agency`, `rate_ppm`, `taxable_amount`, `amount`, `position`. Read only for clients.

### 4.2 Edited migrations (in place; Books is unreleased)

- 2100000001: `books_doc_sequences.doc_type` gains `invoice`; seed row `booksseqinvoice` (prefix '', next 1001).
- 2100000002: `books_journal_entries.doc_type` gains `invoice`; `origin` gains `document`; new text field `document` (15, the source document id, server-written).
- 2100000003: `books_customers.terms` select (PAYMENT_TERMS keys).
- 2100000009 is not edited: `books_journal_lines.customer` / `vendor` (p5-general-ledger) already exist; the invoice's entry lines set `customer`.
- `server/entry_type_labels.json` (Q24): the single `"transfer": "Transfer"` key becomes `"docTypes": { "transfer": "Transfer", "invoice": "Invoice" }`; a non-reversal entry whose `doc_type` the map names shows that label, reversal origins keep "<origin label> of <number>", any other entry shows its origin's label. Origin `document` gets no label of its own (every document entry has a doc type). The Go type formula and `lib/register.ts` `entryTypeLabel` (`TRANSFER_LABEL` becomes `DOC_TYPE_LABELS`) read the map; the drift test in `tests/register.test.ts` covers it. Ownership of the Go formula (Q25, human 2026-11-08): p5-journal-report (lane purchases) owns the `entryTypeLabel` helper in `server/report_spec_helpers.go`; p2-invoice does not wait for it. If p2-invoice merges first, it changes `typeLabelCase` (server/report_general_ledger.go) to read `docTypes`, and p5-journal-report carries that rule into its helper. If p5-journal-report merges first, p2-invoice makes `entryTypeLabel` in `server/report_spec_helpers.go` read `docTypes` and adds no second formula. Either way one Go formula reads the map.

### 4.3 Server (Go, `books/server/`)

- `invoices.go`: guards inside `serialized` (customer exists and active when it changes; tax rate exists and active when it changes; due ≥ date; dates valid; ≤ 250 lines; kinds' required cells; percent line target; product type and active when changed; bundle never stored on a line; total ≥ 0 and ≤ maxStoredAmount); recompute every line amount and the totals with `document_totals.go` (`lineAmount`, `percentAmount`, `documentTotals`, using `taxOn`/`groupTax` after the bounds checks), and write `amount`, `subtotal`, `tax_total`, `total`.
- Posting (status draft → posted), through `postDocument` in `document_posting.go` (reused by later documents with their own control account): in one transaction, allocate the number (`invoice` sequence), write the tax lines snapshot, create the journal entry (`doc_type invoice`, `origin document`, `document = invoice.id`, `date`, `memo`) with lines: debit Accounts receivable (the system A/R account) for the total; credit each product's income account for the sum of its Item and Percent amounts (a negative sum is a debit); credit each tax component's agency liability account; every line names the invoice's customer in `customer` (Q21; `vendor` empty); then post it through `postEntry` (close date, balance, accounts). Set `entry`, `posted_by`, `posted_at`. The journal line guard (`checkLineParty`, server/lines.go) runs on these lines; the invoice guard checks the customer is active first so its refusal names the field (Q23).
- Correction (Q7): a draft with `replaces` posts like the transfer correction: its entry sets `replaces` to the original's entry, the original's entry is voided (`voidReplaced`), the original becomes `void` with `replaced_by`, the correction takes the original's number. Because the new entry `replaces` the old one, the line guard accepts the original's customer even when it is now inactive.
- Void reversal lines copy `customer` from the posted lines (server/reversal.go already does).
- Void: posted → void voids the entry (reversing entry in the original period, number kept).
- Customer delete (Q22): the existing `OnRecordDelete("books_customers")` hook (server/customers.go, inside `serialized`) counts `books_invoices` rows naming the customer before `refusePartyOnLines`; no separate `customerReferences` list. `productReferences` += invoice lines; `taxRateReferences` += invoices `tax_rate`, invoice tax lines `component`.
- `entryName`/audit/search read `invoice`: "Invoice 1004"; search source kind `invoice` over `books_invoices` (drafts included).
- PDF kind `invoice` in `documentKinds` (`server/pdf_invoice.go`), Collection `books_invoices`; FileName "invoice-1004" / "draft-invoice".
- Registrations: audit (`books_invoices` label "Invoice 1004" / "Draft invoice", `books_invoice_lines` label "<invoice>: line n"), OAuth rw for invoices and lines, read for tax lines; `TestRegister_BindsEachPartOnce` list.

### 4.4 Forms host `books:invoice`

Collection `books_invoices`, `formColumn: 'form'`, `fieldsColumn: 'fields'`, every column listed. Built-ins (key, kind, component, required/locked): `customer` custom `CustomerField` required; `bill_to` custom `BillToField`; `email` custom `EmailField`; `terms` custom `PaymentTermsField` locked; `date` custom `DocumentDateField` required; `due_date` custom `DueDateField` required; `tax_rate` custom `DocumentTaxField` locked; `lines` table rows (row kinds, columns product/description/quantity/rate/percent/amount/taxable) required; `message` textarea; `memo` textarea. Layout: page "Invoice"; customer, bill_to, email full; terms, date, due_date, tax_rate quarter/half widths; `insertCustomBefore: 'lines'`. Host schema `MoneyField` and the line schema through `FormHostUi.schemas`.

### 4.5 Client reads (each `useLiveQuery` with an explicit `queryKey`)

Invoice by id (`findOne`) with `materialize()` of posted_by/voided_by; its lines ordered by position; its tax lines (read view); customer by id (`useRecord`); tax rates (`useTaxRateOptions`); products in lines through `ProductPicker` / `useRecord` per cell; settings (currency). Row types derive from the queries.

### 4.6 Seed and fixture

`lib/invoice-form-fixture.ts` typed with `satisfies` against generated types (posted, draft, void + its correction, one with every line kind, a long description, an exempt customer's invoice, a 0-tax invoice). `seed.ts` posts three invoices dated after mid-2026 for seeded customers and products, with "Denver combined" tax; customers gain `terms` (two Net 30, one Due on receipt). The posted invoices add journal entries and lines that name customers: the plan greps every test that counts seeded entries, trial-balance rows, A/R balances, General Ledger sections (`GL_DAY_1`/`GL_DAY_2`, `GENERAL_LEDGER_LONG_SECTION`, `tests/e2e/books-report-helpers.ts`) and register Name cells, and dates the seeded invoices so they stay out of those fixed days.

## 5. Cut

- Typed invoice number — numbers are assigned at posting (spec Ledger rules).
- Email view tab, "Review and send", send dropdown — p2-email-share.
- Payor view tab, customer payment options, online payments — spec Later (online payments).
- "Edit tax" / "Edit totals" overrides — tax is computed (tax-rates contract); a typed tax would break the liability report.
- Seller block editing on the form ("Edit company") — company details live in Settings and print on the PDF.
- Ship to, shipping fee, deposit, discount-on-total field — the Percent line covers discounts; shipping is not in spec scope.
- Attachments — spec: bills and expenses only.
- Create credit memo (More) — p2-credit-memo. Audit history (More) — p5-audit-log.
- Manage / Take tour / Feedback / Old layout links — not Books features.
- Drag-to-reorder grip — the row menu and ⌘⌥↑/↓ reorder on every platform (Q4 alt).
- Invoice list, filters, status chips, Overdue/Paid status — p2-sales-lists and p2-receive-payment.
- Recurring invoices — v1.1. Progress invoicing — v1.1.
- "Display bundle components when printing" option — a bundle is expanded into its item lines (Q10).

## 6. Platform notes

- Keyboard shortcuts: full on web; iOS only with a hardware keyboard (core iOS shortcut provider); Android has no shortcut capture. Every action keeps a visible button. Signed off by the human at the 2026-11-06 gate.
- Autofocus of Customer and type-to-open pickers: web only; iOS and Android open pickers by tap with the search field focused so a touch user taps once more than a web user. Signed off by the human at the 2026-11-08 gate.
- Enter-to-add-line works on both (web keydown, native return key `onSubmitEditing`).
- Qty, Rate and Percent use `keyboardType="decimal-pad"` / `numbers-and-punctuation` (minus sign) on native.
- PDF view renders on both (web react-pdf from a Blob URL; native react-native-pdf from a cache file).

## 7. Sparks carried

- Largest figure: "Balance due" `text-2xl font-semibold text-foreground tabular-nums`, top right wide, under the title on a phone.
- One header band: `rounded-xl border border-border bg-surface-secondary p-4` holds customer, bill to, terms, dates, tax.
- Totals aligned under Amount: shared amount-column width constant; `tabular-nums text-right`; Total row `border-t border-border font-semibold`.
- Core extension (checkpoint 0, accepted 2026-11-06 with `exclusive` and merge pre-approved; re-checked against core b021c3af): E1 table row kinds and E3 locked optional built-ins unchanged; E2 reshaped. E1: a host table built-in declares `rowKinds: [{ key, label, columns, span? }]` with a `kind` cell per row; `TableField` draws each row with its kind's cells (span rows for description and subtotal), offers "Add <kind>" actions, and gives a host cell `TableCellContext.rowsAbove`; the Go mirror validates the kind and its cells; the builder shows kinds read-only. E2: `TableField`'s add actions are core `ShortcutButton`s when the host passes a `shortcut` per row kind (Books wraps `FormRenderer` in a `ScopeProvider` with the screen's owner); one row menu button (one Tab stop, replacing the three icon buttons) uses core `Menu` with each row's key as `shortcut` text; the table tracks its focused row and registers the row keys (remove, move up/down, duplicate, open menu) through `useRegisterShortcuts`; a column option `addOnSubmit` adds a row on Enter / return key in the last editable cell of the last row; focus is restored after each action as §3.1 states. E3: `builtinSchema` gains `locked: boolean` — a locked built-in may be moved and relabeled but not hidden (field flag, rule, or hidden page), enforced by the Go mirror (`actionError`) and the builder (no Hide toggle).

## 8. Non-goals

- No payments, balances after payment, aging, or statements (later units).
- No multi-currency invoice.
- No change to journal entry posting rules for other doc types.
- No new data endpoint (PDF route exists; it is not a data endpoint).
- No public invoice link (p2-email-share).
