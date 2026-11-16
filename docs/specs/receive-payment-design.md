# Receive Payment — design

Status: APPROVED at the design gate 2026-11-15 (auto-helix unit p2-receive-payment): direction A (document form); every open question Q1–Q14 takes its recommended answer. Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Ledger rules ("Payments allocate to many invoices; an invoice takes many partial payments; overpayment becomes customer credit. Received payments go to Undeposited Funds until a Bank Deposit."; "Posted documents are voided …, never deleted. Drafts can be deleted. Document numbers are sequential per type …, assigned at posting."), also §Forms, §Interface, §Scope. Contracts honored: invoice-form-design (p2-invoice), sales-receipt-form-design (`PAYMENT_METHODS`, deposit accounts, Go `ensureUndepositedFunds`), customer-pages-design §5 (Overdue and invoice status from the open amount; `books_party_balances` unchanged; "Receive payment" through `NEW_ACTIONS` `takesCustomer`), report-drill-down (`server/entry_routes.json`). Decisions are marked (Qn); the human accepted every recommended answer. Built against books main@7bb9419, core main@9cc926c.

## 1. Goal

A bookkeeper records money a customer sent: picks the customer, enters the date, how they paid, the reference and the amount, and allocates it over that customer's open invoices (in full, in part, or with some left over as the customer's credit), then posts a numbered payment that moves the money from Accounts receivable to Undeposited funds (or a bank account), keyboard-first on web and fully by touch on a phone.

## 2. Where it lives

- `books/payments/new` — new payment. `?customer=<id>` starts with that customer; `?invoice=<id>` (with `?customer`) also ticks that invoice for its open balance. `?replaces=<id>` edits a posted payment (a correction that keeps its number).
- `books/payments/[id]` — a draft opens in the form; a posted or void payment opens in the read view.
- Entry points: + New → column "Customers" → "Receive payment" (after "Sales receipt", `takesCustomer: true`, so the customer page's New transaction menu lists it too); the invoice read view's **Receive payment** action (§3.9); the Journal Entries list, account register drawer, report drill-down and federated search open `books/payments/<id>` (`entry_routes.json` `"payment": "payments"`).
- No sidebar entry and no payment list (p2-sales-lists owns the Sales list). Both routes are pushed pages; `hidesNewFab` gains `payments`.
- Not a forms host (Q1): the spec's §Forms host list does not name it, so the form is a Books `useForm` + zod screen (as the transfer form) with no Settings → Forms entry and no custom fields.

## 3. Behavior

### 3.1 Speed and keyboard

- On open (new, draft, correction) the Customer picker has focus on web at every width; after Post & new the fresh form focuses Customer again. Nothing takes focus on iOS and Android (standing approval).
- Tab order: Customer → Payment date → Payment method → Reference no. → Deposit to → Amount received → Find invoice no. → row 1 Payment → row 2 Payment … → "Clear payments" → Memo → action bar (Cancel, Save draft, Post, Post & new, More). Picking a customer moves focus to Payment date. Each outstanding row has one Tab stop, its Payment cell; the row's tick box is a press target only (`tabIndex={-1}`, lesson 29) because the keys below do what it does.
- Customer is a Books `SearchPicker` (`CustomerField`'s picker, active customers): Enter, Space, ↓ or a printable character opens it (type-to-open); ↑/↓ move, Enter picks, Esc closes. Payment method and Deposit to are core `SelectInput`s.
- In a Payment cell: Enter (native: return key, `onSubmitEditing`) moves to the next row's Payment cell (the last row moves to "Clear payments"); ⌥↵ toggles the row: an empty or zero cell takes the row's full open balance, a filled cell clears to zero. The cell selects its whole value on focus (lesson 25).
- Every action button with a key is a core `ShortcutButton` with `scopeOwner` from the screen's `useShortcutScope`; a key whose action sits in More is registered with the menu row's `shortcut` text. Every key is in core's ⇧? sheet, group "Receive payment"; form keys use `allowInInputs`.

| Where | Action | Key |
|---|---|---|
| Form | Post | ⌘↵ |
| Form | Post & new | ⌘⇧↵ |
| Form | Save draft | ⌘S |
| Form | Cancel (Discard dialog when dirty) | Esc |
| Form | Delete draft (saved draft only) | ⌘⌫ |
| Form | Clear payments | ⌥⌫ |
| Form | Pay every listed invoice in full | ⌥A |
| Payment cell | Pay this row in full / clear it | ⌥↵ |
| Read view | Edit | E |
| Read view | Void | V |
| Read view | View journal entry | J |
| Invoice read view | Receive payment | R |

- A key does nothing when its button is hidden, disabled or busy, or the user cannot write. While a dialog is open the screen's keys do nothing; Esc closes only the open layer. ⌘S is always taken while the form holds the keys.

### 3.2 Header band

One header band (`rounded-xl border border-border bg-surface-secondary p-4`), two rows wide (a row's fields wrap to the next line when the band is narrower than they are, so the form never scrolls sideways); stacked on a phone.
- Row 1: **Customer** (required) — `SearchPicker` over active customers (sub-customers "Parent: Child"); an inactive stored customer shows by name. **Payment date** (required) — core `DateField`, default today.
- Row 2: **Payment method** (optional) — `SelectInput` over `PAYMENT_METHODS` ("None", Cash, Check, Credit card, Debit card, Bank transfer, Other), default None. **Reference no.** (optional) — text, at most 40 characters, placeholder "Check or reference no.". **Deposit to** (required) — `SelectInput` over active bank accounts and active Undeposited funds accounts in chart order (`depositAccountOptions`); default the first active Undeposited funds account (`defaultDepositAccount`). When the chart has no Undeposited funds account the list starts with the option "Undeposited funds (created when you post)" (value empty) and it is the default; the server creates the account at posting with `ensureUndepositedFunds` (Q6). A stored inactive account shows by name only for the value it mounted with. The Books setting "Sales deposited to" does not apply to payments (sales-receipt-design §3.11).
- **Amount received** (required) — `MoneyInput`, right-aligned, in the band's right column wide (under the big figure) and last in the band on a phone.
- Header right: title ("Receive payment" new, "Draft payment" draft, "Edit payment 1004" correction), status badge, `HelpIcon topic="books:receive-payment"`, and the big figure "Amount received $1,243.56" (`formatMoney`; "—" while the amount is empty or invalid; "Too large" over the limit).
- Changing the customer on a form that has payments entered asks nothing: it replaces the outstanding list with the new customer's and clears every row payment; Amount received keeps its value and is re-applied (§3.4).

### 3.3 Outstanding invoices

- With no customer chosen the list area shows "Choose a customer to see their open invoices." and the Find invoice no. field (§3.5).
- With a customer: the customer's posted invoices whose open balance (`balance`) is above zero, oldest due date first (then number). A draft or correction also lists every invoice its stored allocations name, even one whose balance has since become zero.
- Wide (list at least the grid's least width, 595 px: the tick column 44, 5 × 95, the gaps and the row padding): a grid with a header tick box (ticks or unticks every listed row) and columns **Invoice** ("Invoice 1004 · Oct 3, 2026", a link that opens the invoice, pushed), **Due date** (danger tone with "Overdue" when before today), **Original amount**, **Open balance**, **Payment** (money input). Money columns right-aligned, `tabular-nums`, header and rows share the column width constants. Every data column grows with the list from a least width of 95 px (the tick column a fixed 44 px); long text ellipsizes inside its cell, the Payment input fills its cell, and the grid never scrolls sideways.
- Phone (list narrower than the grid's least width): one card per invoice: tick box and "Invoice 1004" on the first line, due date, then Original and Open balance as a label-value pair, and the Payment input full width.
- Under the list, right-aligned under the Payment column: **Amount to apply** (sum of row payments), **Amount to credit** (Amount received − Amount to apply, when above zero, with the note "Kept as a credit for <Customer>"), and a refusal line when the payments add up to more than Amount received.
- A customer with no open invoices: "<Customer> has no open invoices. The amount you enter is kept as a credit." The form can still post (a payment with nothing applied is all credit, Q4).
- Loading: a skeleton of three rows; error: the Books error banner with Retry (`recoverLiveQueries`, merged recoveries).

### 3.4 Allocation rules (pure, `lib/payment-allocation.ts`)

- The form tracks whether Amount received was typed by the user (`amountTyped`).
- Ticking a row sets its payment to its open balance; unticking sets it to zero. Typing a payment ticks the row when above zero and unticks it at zero.
- While Amount received has not been typed, it follows the rows: Amount received = Amount to apply after every row change.
- Typing Amount received re-applies it (Q2): payments are cleared and the amount is spread over the listed invoices oldest due first, each taking up to its open balance; what is left is Amount to credit. After that, row edits do not change Amount received.
- "Clear payments" (a link button under the list, ⌥⌫) sets every row to zero and, when Amount received was not typed, clears it too.
- "Pay all" (⌥A, also the header tick box) ticks every listed row for its open balance; when Amount received was typed it is not changed, and the rows past it show the over-allocation refusal.
- Every amount is integer cents through the shared money helper; no screen arithmetic on dollars.
- Validation (one zod schema `paymentSchema(currency)` through `zodResolver`; the same schema for Save draft and Post): Customer required; Payment date a real day (`isIsoDay`); Reference no. ≤ 40; Deposit to a listed option; Amount received > 0 ("Enter the amount received") and ≤ the stored-amount limit; each row payment ≥ 0 and ≤ its open balance ("More than the open balance of $243.56", under that cell); Amount to apply ≤ Amount received ("The payments add up to $1,500.00, more than the $1,243.56 received", under the list, `superRefine`).

### 3.5 Find invoice no.

- A search field above the list ("Find invoice no.", `TextInput`). With a customer chosen it filters the listed rows by invoice number prefix (rows hidden by the filter keep their payments). With no customer chosen, Enter looks the number up across posted invoices with an open balance: one match picks its customer and ticks that invoice; no match shows "No open invoice 1099" under the field. This covers the screenshot's "Find by invoice no." in one field (Q7).

### 3.6 Footer and saving

- Left: **Internal memo (not printed)** (textarea, 4000 chars, the journal entry memo).
- Action bar (the shared `DocumentActionBar`): wide Cancel, Save draft, Post, Post & new, More (Delete draft when saved); phone Cancel, Save draft, Post, More (Post & new, Delete draft). Drafts exist as for every Books document (Q3): a draft's allocations do not change any invoice's balance.
- Save writes through `useMutation`: insert/update the `books_payments` row, then the allocation plan (`planTableWrites` / `createTablePlans` over `books_payment_applications`: one row per invoice with a payment above zero; rows at zero are not stored), then for Post set `status: 'posted'`. The form is held through the write by a synchronous store flag (opening-balances pattern). A post refused after the draft was written leaves the draft and shows the refusal.
- After Post: replace with `books/payments/<id>` (read view). Post & new: replace with a fresh `books/payments/new` (keeps `?customer` only when opened with it, never `?invoice`). Save draft stays at `books/payments/<id>`.
- Cancel with edits opens `DiscardDialog`; without edits leaves at once. Delete draft opens `DeleteDraftDialog`.
- Refusals: Customer, Payment date, Deposit to, Reference no., Amount received under those fields; "Invoice 1004: …" under that row's Payment cell (root `applications.<n>`); the rest (close date, sequence, limit) in `FormErrorSummary` with its final period. A refusal after the user left is logged (`log.warn('books.payment', …)`).
- Post refuses an inactive customer ("<Customer name> is inactive. Choose an active customer.", under Customer); a correction keeps its original's customer.
- Writers only (bookkeeper or admin). A non-writer at `books/payments/new` sees "You need bookkeeper access to receive payments"; + New hides for non-writers already.

### 3.7 Read view (posted or void)

- Header as the form, title "Payment 1004", badge Posted / Void, big figure "Amount received".
- Body: Customer (link to the customer page), Payment date, Payment ("Check · 12345 · deposited to 1200 Undeposited funds", `paymentText`), the applied invoices (a grid Invoice link, Due date, Original amount, Applied, every column flex with a least width of 95 px, no sideways scroll; cards while the list is below the grid's least width, 432 px), Amount applied, Amount credited (when above zero, "Kept as a credit for <Customer>"), memo, "Posted by …", "Voided by …", "Replaced by 1004 (edited)".
- Actions (writer, posted): **Edit** (`?replaces=<id>`), **Void** (`VoidDialog`: "A reversing entry is posted in the original period. The number is kept. The invoices it paid are open again."), **View journal entry** (`books/entries/<entry>`). Writer on void, and reader: View journal entry only. No PDF and no Copy (Q9).

### 3.8 States

Loading (`LoadingState` until access, settings, the customer, the deposit accounts and, for an id, the payment and its applications are ready); error "Books could not load this payment." with Retry (merged recoveries); not found "This payment does not exist" with a back link; `?replaces` of a payment that is not posted: "This payment cannot be edited"; offline: action buttons disabled.

### 3.9 Elsewhere in Books

- **Invoice read view**: the big figure "Balance due" shows the open balance (`balance`), not the total; totals gain "Payments −$100.00" (sum applied) above Balance due when any payment is applied; a **Payments** block lists each posted payment applied ("Payment 1003 · Oct 12, 2026 · $100.00", links). Writer action **Receive payment** (R) on a posted invoice with a balance above zero opens `books/payments/new?customer=<customer>&invoice=<id>`. The invoice badge reads Paid (success) when the balance is zero and Partly paid (warning) when 0 < balance < total; otherwise Posted.
- **Invoice void and edit with payments (Q5)**: Void of an invoice that a posted payment pays is refused: "Payments are applied to this invoice. Void or edit those payments first." An invoice correction (`?replaces`) takes over the original's applications at posting (they move to the correction in the posting transaction) and is refused when its total is below them: "Payments of $300.00 are applied to this invoice. Its total cannot be below that." A correction may not change the customer while payments are applied: "Payments are applied to this invoice, so its customer cannot change."
- **Customer page** (customer-pages-design §5): Overdue sums `balance` (not `total`) of posted invoices due before today with a balance above zero. Transactions tab: invoice status Paid (success, balance 0), Partly paid (warning), Overdue (destructive, balance > 0 and due before today), Open (warning), Draft, Void; a fourth kind **Payment** (chip "Payments", type label "Payment", status Draft / Applied (success, nothing credited) / Credit $x (warning, an amount credited) / Void); the row opens `books/payments/<id>`. Open (the A/R view) needs no change: the payment's A/R credit names the customer, so the balance drops and an overpayment shows as Credit.
- **Journal Entries list, registers, entry drawer**: Type "Payment", number "1004"; Open goes to `books/payments/<document>`; Edit opens the payment correction; Reverse hidden. Name column shows the customer on both lines.
- **General Ledger, Journal, drill-down**: Type "Payment" via `entry_type_labels.json` `docTypes.payment`; "Void reversal of 1004".
- **Search**: kind `payment`, title "Payment 1004 · Customer" / "Draft payment · Customer", row id `payment:<id>`; reference no. and memo indexed.
- **Settings → Numbering**: card "Payments" (no prefix, next 1001).
- **Customer delete**: refused when on any payment, draft or posted: "<Customer name> is on payments. Make it inactive instead." (after the sales receipt check).
- **Account delete**: refused for an account that is the Deposit to of any payment: "This account is the deposit account of 1 payment and cannot be deleted. Make it inactive instead." / "…of %d payments…".
- **Help**: new `help/receive-payment.md` (task-led: receive a payment, partial payments, overpayment and credit, Undeposited funds and why, find by invoice number, edit and void, key map); `help/invoices.md` gains balance due, Paid / Partly paid, Receive payment and the void rule; `help/customer-pages.md` gains the Payment kind; cross-links from customers and documents.

## 4. Data

### 4.1 New migration (`<next>_create_books_payments.js`; the number is the next free one when the plan is written)

- `books_payments`: `customer` (relation books_customers, required), `status` select draft/posted/void, `number` text 40 (server), `sequence` number (server), `date` text day (required), `payment_method` select (PAYMENT_METHOD keys, optional), `reference_no` text 40, `deposit_to` relation books_accounts (optional on a draft; the server fills it at posting when empty), `amount` number onlyInt (cents, > 0), `applied` number onlyInt (server), `credited` number onlyInt (server, `amount − applied`), `memo` text 4000, `currency` (server), `entry` relation books_journal_entries (server), `replaces` / `replaced_by` relation books_payments, `posted_by` / `posted_at` / `voided_by` / `voided_at` (server), `sort_key` (server), `created`, `updated`. Rules as the invoice's: READ list/view; create `WRITE && status = "draft"` with server fields unset; update `WRITE` with server fields unset and (`status = "draft"` or posted → void); delete `WRITE && status = "draft"`.
- `books_payment_applications`: `payment` (relation, required, cascade), `invoice` (relation books_invoices, required), `amount` number onlyInt (> 0), `position` onlyInt. Index on `invoice`. Rules as the payment's; writes refused once the payment is not a draft. Unique (`payment`, `invoice`).
- `books_invoices` gains `balance` number onlyInt (server-written; the open amount). Index on (`customer`, `status`, `balance`).
- FTS index `fts_books_payments` over number, reference_no, memo.

### 4.2 Edited migrations (in place; Books is unreleased)

- 2100000001: `books_doc_sequences.doc_type` gains `payment`; seed row `booksseqpayment` (prefix '', next 1001).
- 2100000002: `books_journal_entries.doc_type` gains `payment`.
- `server/entry_type_labels.json` `docTypes.payment = "Payment"`; `lib/register.ts` `DOC_TYPE_LABELS` and `lib/doc-types.ts` `DOC_TYPES` gain it; `server/entry_routes.json` gains `"payment": "payments"` (`TestTransactionDetailOpenPaths` gains a payment poster).

### 4.3 Server (Go, `books/server/`)

- `payments.go`: guards inside `serialized`: customer exists and active when it changes; date valid; reference_no ≤ 40; payment_method a known key; `deposit_to` when set exists, is active and passes `isDepositAccount`; amount > 0 and ≤ maxStoredAmount; applications: each invoice is posted, belongs to the payment's customer, appears once, amount > 0; sum ≤ amount; at most 500 applications.
- Posting (draft → posted) through `postDocument` (doc type `payment`) in one transaction: allocate the number (`payment` sequence); when `deposit_to` is empty, `ensureUndepositedFunds(tx)` and write it; re-read each application's invoice `balance` and refuse "Invoice 1004: the payment is more than its open balance of $243.56." keyed to `applications.<n>`; lines: debit Deposit to for `amount`, credit Accounts receivable (`ensureReceivables`) for `amount`, both naming the customer; post through `postEntry` (close date, balance, accounts); write `applied`, `credited`, `entry`, `posted_by`, `posted_at`; subtract each application from its invoice's `balance`.
- One Go helper set owns every write to `books_invoices.balance` (`invoice_balance.go`: `invoiceBalance(tx, id)` recomputes total − posted applications, `applyToInvoices`, `releaseApplications`), reused by later units that reduce an invoice's balance (credit memo, apply credit, write-off). Invoice posting writes `balance = total`; a verify part (`verifyInvoiceBalances`) recomputes every posted invoice's balance from its applications in the existing ledger verify/rebuild path.
- Correction (Q8): a draft with `replaces` posts like the invoice correction: its entry replaces the original's entry, the original is voided (`voidReplaced`) and its applications released, the correction's applications applied, the original becomes `void` with `replaced_by`, the correction takes the original's number.
- Void: posted → void voids the entry (reversing entry in the original period, number kept) and releases its applications (balances restored).
- Invoice guards (`sales_documents.go`, invoice kind only): void refused while a posted payment applies to it; a correction's posting moves the original's applications to the correction, refuses a total below them and a customer change (§3.9 texts); every posted invoice's `balance` is written at posting.
- `entryNouns('payment')`, `entries.go` document-entry checks, audit labels ("Payment 1004", "Draft payment", "<payment>: Invoice 1004"), OAuth (rw payments and applications), search source (LEFT JOIN customers), customer delete hook, account delete hook (`deposit_to`), report source doc-type option, `TestRegister_BindsEachPartOnce` list.

### 4.4 Client reads (each `useLiveQuery` with an explicit `queryKey`)

- Payment by id (`findOne`) with `materialize()` of posted_by / voided_by; its applications ordered by position with `materialize()` of the invoice.
- Outstanding invoices: one query over `books_invoices` (`customer = id`, `status = 'posted'`, `balance > 0`) ordered by due_date, number; a draft's named invoices through the applications query above (the hook merges the two by invoice id and drops a duplicate, since one reads a filtered set and the other a draft's own rows).
- Find invoice no. without a customer: one bounded query (`number = n`, `status = 'posted'`, `balance > 0`, `.limit(2)`).
- Customer by id (`useRecord`), customer options (`useDocumentCustomerOptions`), deposit accounts (`useDepositAccounts`, query key `books.form.depositAccounts`), settings (currency). Row types derive from the queries.

### 4.5 Seed and fixture

- `lib/receive-payment-fixture.ts` (typed with `satisfies` against generated types): a customer with four open invoices (one overdue, one partly paid, one with a long number and amount), a posted payment that pays two invoices in full, a partial payment, an overpayment with credit, a draft, a void + its correction, a customer with no open invoices.
- `seed.ts` posts two payments dated after mid-2026 on days no GL / journal-report / trial-balance / sales-tax-liability spec reads: one that pays a seeded invoice in full (to 1200 Undeposited funds) and one partial; keeps one seeded invoice fully open. The plan greps every test that counts seeded entries, A/R or customer balances, Undeposited funds lines, the customer Transactions tab rows and invoice badges before adding them.

## 5. Cut

- "Accept payments online", card-brand logos — online payments are Later; fixes doc: no payment-service upsells on sales screens.
- Outstanding list "Filter" (date range / overdue) and the "All" toggle — Find invoice no. and the oldest-first order cover a customer's open invoices; the shared list pattern belongs to p2-sales-lists.
- Table settings gear (column chooser) — not in spec scope.
- Applying existing customer credits or credit memos on this screen — p2-apply-credit (fixes doc: Apply credit has its own entry).
- Payment PDF / receipt print and email — spec §Scope lists PDFs for invoices, estimates, statements and reports only; email is p2-email-share.
- Copy a payment — a payment is tied to the invoices it paid; nothing useful copies.
- Bank deposit grouping and the guard that a deposited payment cannot be voided or edited — p2-bank-deposit.
- Paying several customers or sub-customers' invoices in one payment — one payment, one customer (the parent's payment does not list sub-customer invoices).
- "Save and send", split save button — the shared action bar.

## 6. Platform notes

- Keyboard shortcuts: web and iOS with a hardware keyboard; Android has none; every action keeps a visible button (standing approval, 2026-11-11).
- Customer autofocus and type-to-open picker: web only (standing approval, 2026-11-11).
- Enter / return key in a Payment cell moves to the next row on both platforms. Money inputs use the invoice's native keyboard types. The row tick box is a press target on both; on web it is not a Tab stop.
- No new platform-only item.

## 7. Sparks carried

- Largest figure: "Amount received" in the shared `DocumentHeader` big figure (`text-2xl font-semibold text-foreground tabular-nums`, top right wide, under the title on a phone).
- Money columns as pairs: right-aligned `tabular-nums` cells with shared width constants for header and rows; Payment input right-aligned in the last column; Amount to apply / Amount to credit under the Payment column, the last with `border-t border-border font-semibold`.
- No core extension.

## 8. Non-goals

- No apply credit, credit memo, refund, write-off or statements (later units), though `invoice_balance.go` is built for them.
- No bank deposit (p2-bank-deposit), no change to "Sales deposited to".
- No A/R aging report (p5-ar-aging reads `balance`).
- No multi-currency.
- No new data endpoint.
- No change to invoice behavior beyond §3.9.
