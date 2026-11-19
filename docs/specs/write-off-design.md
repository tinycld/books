# Write off — design

Status: DRAFT for the design gate (auto-helix unit p2-write-off). Direction A of the packet and the recommended answer of every open question (Q1–Q16, §9) are written in. Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Write off"), §Interface ("single Write off action"), also §Ledger rules; `docs/plans/books-quickbooks-fixes.md` (Sales: "Write off is one action"). Contracts: `invoice-form-design.md` (the invoice read view), `receive-payment-design.md` §4.1, §4.3 (an invoice's `balance` has one writer, `server/document_balance.go`), `refund-receipt-form-design.md` (`LinkedDocumentsSection`, a payer of a balance, the date rule of two linked documents), `vendor-refund-design.md` and `transfer-design.md` (a document that is no forms host and has its own read page), `sales-lists-design.md`, `customer-pages-design.md`. Built against books `books/p2-refund-receipt`@59910ea4, core `main`@470a6f7b.

## 1. Goal

A bookkeeper who will not collect an invoice opens it, presses Write off, confirms a date and an account, and the invoice's open balance moves to that account in one posted, numbered write-off that can be voided.

## 2. Where it lives

- The action **Write off** on a posted invoice's read view (`books/invoices/[id]`), and in the invoice's row menu on the Sales lists and the customer page's Transactions tab. It opens the **Write off dialog** over the screen it was pressed on (a core `Dialog`; a Sheet on a phone). There is no `new` route.
- `books/write-offs/[id]` — the read page of one write-off (posted or void). A pushed page; `hidesNewFab` gains `write-offs`. The invoice's Write-offs section, the customer's Transactions tab, the Journal Entries list, the account register drawer, report drills, the audit log and federated search open it.
- No sidebar entry, no + New entry, no Sales lists tab (Q12).

## 3. Behavior

### 3.1 Where Write off is offered

- A writer (bookkeeper or admin) gets **Write off** on a posted invoice whose `balance` is above zero. A reader, a draft, a void invoice and an invoice with a balance of zero do not get it.
- Invoice read view: `DocumentReadAction` gains `write_off` (label "Write off", key **W**: `DOCUMENT_READ_KEYS.write_off = 'w'`), after Create credit memo. It is a `ShortcutButton` with the screen's `scopeOwner`; on a phone it is a row of More with its key as the row's `shortcut` text.
- Sales lists (Invoices tab and All sales) and the customer page's Transactions tab: the invoice row menu gains "Write off" (`RowMenuAction` `write_off`), after "Receive payment". It opens the same dialog over the list.
- The key W is registered only while the action is offered.

### 3.2 The Write off dialog

- Title "Write off invoice 1009". Core `Dialog` size `md`, `hasCloseButton={false}`; a Sheet on a phone.
- Body, top to bottom:
  - A summary line: "Harbor Lane Bakery · Invoice 1009 · Sep 14, 2026" (`text-sm text-muted-foreground`).
  - The figure: label "Amount to write off", value the invoice's open balance, "$400.00" (the spark: `text-2xl font-semibold text-foreground tabular-nums`). The amount is not a field: a write-off takes the whole open balance (Q1).
  - **Write-off date** (required): core `DateField`, default today, or the invoice date when that is later than today.
  - **Write off to** (required): core `SelectInput` over the active accounts of type `expense` and `other_expense`, in chart order, labels "<number> <name>", depth through `SelectOption.indent` (Q3). Default (Q4): the account of the newest posted write-off in the books; when there is none, the first active account with detail type `bad_debts` in chart order; when there is none, empty. A chart with no active expense account shows the inline error "Add an expense account to the chart of accounts" and the action button stays disabled.
  - **Reason (internal)** (optional): core `TextAreaInput`, at most 4000 characters, placeholder "Why the balance will not be collected". It is the journal entry's memo. It is not printed.
  - A notice (`DocumentNotice`): "The invoice stays posted. Its balance due becomes $0.00." For an invoice with sales tax, a second sentence: "Its sales tax of $80.00 stays owed to the tax agency." (Q2).
  - `FormErrorSummary` (root errors only, after a submit).
- Footer: `Dialog.CancelButton` (Esc) and `Dialog.ActionButton` "Write off $400.00" (⌘↵, `DIALOG_SUBMIT_SHORTCUT`).
- On open the Write-off date has focus on web (`useFocusOnOpen`); nothing takes focus on iOS and Android. Tab order: Write-off date → its "Open calendar" button → Write off to → Reason → Cancel → Write off.
- Validation is one zod schema (`writeOffSchema`, `lib/write-off-schema.ts`) through `useForm` and `zodResolver`:
  - the date is a real day (`isIsoDay`): "Enter a date";
  - the date is on or after the invoice date: "Date the write-off on or after the invoice date, Sep 14, 2026.";
  - the date is after the close date, unless the user holds an unexpired close-date override: the text of the close-date rule that the apply-credit schema uses;
  - an account is chosen: "Choose an account";
  - the reason has at most 4000 characters.
- Loading: while the accounts, the settings or the newest write-off load, the body shows three skeleton rows under the figure and the action button is disabled. A failed read shows `DialogLoadError` ("Books could not load the accounts for the write-off.") with Retry (one `recoverLiveQueries` call over the merged recoveries); the action button stays disabled.
- Offline: the action button is disabled.

### 3.3 Writing off

- The action button validates, sets the dialog's hold flag (a synchronous Zustand flag, `stores/write-off-store.ts`, set before the mutation) and writes ONE row with `useMutation`: an insert into `books_write_offs` with `id`, `invoice`, `date`, `account`, `amount` (the balance the dialog showed), `memo` and `status: 'posted'`. There is no draft and no second step.
- While the write runs the dialog stays open, its fields are disabled and Cancel does nothing.
- Success: the dialog closes; a toast reads "Invoice 1009 written off: $400.00"; the screen under the dialog stays (the invoice read view, the list or the customer page) and its live queries show the new state.
- Refusals from the server (§4.3) show in the dialog: a field refusal (`date`, `account`) under that field through `handleMutationErrorsWithForm`; every other refusal (the invoice, the amount, the sequence, the totals limit) in `FormErrorSummary`. The dialog stays open and takes the hold off.
- A balance that changed while the dialog was open (a payment posted by another user) is refused by the server: "The open balance of invoice 1009 is now $300.00. Check it and write it off again." The figure in the dialog follows the live balance, so the next press sends the new amount.

### 3.4 The invoice, after a write-off

- The invoice stays posted. Its `balance` is its total less its posted payments' applications and less its posted write-offs. Every screen that reads `balance` follows (the customer's Open figure, Receive payment's open invoices, the Sales lists Balance column).
- `books_invoices.written_off` holds the cents of its posted write-offs (server-written, §4.2).
- Read view badge (`balanceBadge`): **Written off** (tone `muted`) when the balance is 0 and `written_off` is above zero; Paid when the balance is 0 and `written_off` is 0; unchanged otherwise.
- Read view totals: after the Payments row and before Balance due, a row **Written off** with a minus sign ("−$400.00", test id `invoice-total-written-off`), only while `written_off` is above zero (`readTotals` of the invoice kind, from the stored record, so the rows add up with no other read).
- Read view section **Write-offs** (the shared `LinkedDocumentsSection`, under the Credit memos section): each write-off that names the invoice — number (a link to `books/write-offs/<id>`), date, amount, status badge (Posted / Void). No write-off, no section. A failed read shows the section's notice with Retry.
- With a balance of zero the invoice offers no Write off and no Receive payment.
- **Edit and void of a written-off invoice are refused** while a posted write-off names it: "This invoice is written off. Void the write-off first." (the invoice's `CheckVoid` and its correction's `Replace`; shown in the void dialog and in the correction form's `FormErrorSummary`). Create credit memo and Copy stay.
- A payment whose void or correction raises the invoice's balance again leaves the write-off as it is: the invoice is open for the new balance, and Write off is offered again for it. An invoice can so have more than one posted write-off; `written_off` is their sum.

### 3.5 The write-off page (`books/write-offs/[id]`)

- Header: title "Write-off 1001", status badge (Posted / Void), `HelpIcon topic="books:write-offs"`, and the big figure "Amount written off $400.00" (top right wide, under the title on a phone).
- Band (the read band of the payment and transfer read views, `READ_BAND`): Customer (a link to the customer page), Invoice ("Invoice 1009", a link to the invoice), Write-off date, Written off to ("6050 Bad debts"), Reason (left out when empty). Stamps: "Posted by Dana Ortiz on Nov 18, 2026", "Voided by … on …".
- Actions, each a `ShortcutButton` with the screen's `scopeOwner`; on a phone Void stays visible and the others are in More:
  - writer on posted: **Void** (V), **Open invoice** (I), **View journal entry** (J);
  - writer on void, and a reader: Open invoice (I), View journal entry (J).
- Void opens the shared `VoidDialog` ("Void write-off 1001?", body "The invoice's balance due rises by $400.00 again.", confirm "Void write-off"). The write is one `useMutation` update of `status` to `void`. After it the page shows Void; a refusal (the close date) shows in the dialog.
- A write-off is not edited, copied or deleted. To change it, void it and write the invoice off again.
- States: loading (`DocumentLoading`), a failed read with Retry (`DocumentLoadError`), not found ("This write-off does not exist"), offline (Void disabled). The page has no form, so no leave guard.

### 3.6 Elsewhere in Books

- **Sales lists**: the invoice status reads **Written off** (tone `muted`) by the §3.4 badge rule on the Invoices tab and on All sales. The Invoices tab's chips become All, Open, Overdue, Paid, Written off, Draft, Void: "Written off" is posted, balance 0, `written_off` above zero; "Paid" is posted, balance 0, `written_off` 0 (Q11). No batch action (§5).
- **Customer page**, Transactions tab: the invoice row's status follows the same rule. A seventh kind **Write-off**: chip "Write-offs" (after "Refunds"), type label "Write-off", number, date, total with a minus sign ("−$400.00"), status Written off (posted, tone `muted`) / Void; the row opens `books/write-offs/<id>`; empty text "No write-offs for this customer". The customer's Open figure falls by a posted write-off with no change to `books_party_balances`: the write-off's Accounts receivable credit names the customer.
- **Journal Entries list, registers, entry drawer**: Type "Write-off", number "1001"; Open goes to `books/write-offs/<document>`; Edit and Reverse are hidden (the page's Void is the one way back); Name shows the customer on both lines.
- **General Ledger, Journal, Transaction Detail**: Type "Write-off" through `entry_type_labels.json`; "Void reversal of 1001"; the open path from `entry_routes.json` (`"write_off": "write-offs"`).
- **Profit and Loss, Balance Sheet, Trial Balance** (Accrual): the chosen account rises and Accounts receivable falls on the write-off date.
- **Cash basis** (Q5): a write-off is no payment. On the Cash method the written-off part of the invoice never counts as income or as sales tax collected, and the write-off's own entry does not count either: the account it names and Accounts receivable show nothing for it.
- **Customer Balance report**: follows (it reads posted Accounts receivable lines).
- **Sales by Customer / Sales by Product, Sales Tax Liability**: unchanged on Accrual (a write-off is no sale line and writes no tax line, Q2).
- **Search**: kind `write_off`, title "Write-off 1001 · Harbor Lane Bakery", row id `write_off:<id>`; the reason is indexed.
- **Settings → Numbering**: card "Write-offs" (no prefix, next 1001; Q6).
- **Audit log**: `books_write_offs` ("Write-off 1001"); history opens the write-off.
- **Delete guards**: the account of any write-off: "This account is the write-off account of 1 write-off and cannot be deleted. Make it inactive instead." / "… of %d write-offs …". An invoice with a write-off is posted and cannot be deleted already.
- **Chart of accounts**: the account types gain the Expense detail type `bad_debts` ("Bad debts"); the starter chart and the seed chart gain **6050 Bad debts** (Q4).
- **Help**: new `help/write-offs.md` (task-led: write off an invoice the customer will not pay; what it posts; which account to choose and how to add a Bad debts account to an older chart; a customer who paid a part; sales tax stays owed; void a write-off, also when the customer pays after all; why a written-off invoice cannot be edited; cash basis in one paragraph; when to use a credit memo instead (a price change or a return); the keys with Mac glyphs: W, ⌘↵, Esc, V, I, J). `help/invoices.md` gains Write off (W), the Written off row, badge and section; `help/sales-lists.md`, `help/customer-pages.md`, `help/receive-payment.md` and `help/reports.md` gain one paragraph each; `help/credit-memos.md` links to it.

## 4. Data

### 4.1 New collection (migration `2100000027_create_books_write_offs.js`)

The branch ends with `2100000026_add_vendor_party_balances.js` and `2100000027_create_books_audit_log.js`. The audit view stays last: it is renamed `2100000029_create_books_audit_log.js`, this unit takes `2100000027`, and `2100000028` is left free for p5-ar-aging (Q15). The plan lists `pb-migrations/` again before it names the number. The audit view's `LINES` list does not change: a write-off has no line collection.

- `books_write_offs`: `invoice` (relation books_invoices, required, not cascade), `customer` (relation books_customers; server, from the invoice), `status` select posted/void (required), `number` text 40 (server), `sequence` number (server), `date` text day (required), `account` (relation books_accounts, required), `amount` number onlyInt min 1 (required), `memo` text 4000, `currency` (server), `entry` relation books_journal_entries (server), `close_override` (server, as the entry's), `posted_by` / `posted_at` / `voided_by` / `voided_at` (server), `sort_key` (server, as the payment's), `created`, `updated`.
- Rules: list and view for a Books reader; create and update for a Books writer; no delete rule (nobody deletes). The guards (§4.3) admit a create only as `posted` and an update only as posted → void.
- Indexes: invoice; customer; (status, date); account.
- FTS index `fts_books_write_offs` over number and memo.

### 4.2 Edited migrations (in place; Books is unreleased)

- 2100000001: `books_doc_sequences.doc_type` gains `write_off`; seed row `booksseqwriteof` (15 characters; prefix '', next 1001); the header comment names it.
- 2100000002: `books_journal_entries.doc_type` gains `write_off`.
- 2100000010: `books_invoices` gains `written_off` (number onlyInt min 0; server-written).
- `books_cash_basis_lines` is not edited in place: the new migration `2100000027` adds `write_off` to its `document_kind` values and adds the relation `write_off`, and takes both away on the way down, as `2100000022` and `2100000023` do for their kinds.
- `server/account_types.json`: Expense gains `{"key": "bad_debts", "label": "Bad debts"}`. `lib/starter-chart.ts` and the seed chart gain `account('6050', 'Bad debts', 'expense', 'bad_debts')`.
- `server/entry_type_labels.json` `docTypes` gains `"write_off": "Write-off"`; `server/entry_routes.json` gains `"write_off": "write-offs"`; `lib/doc-types.ts` `DOC_TYPES` gains `write_off: { label: 'Write-offs', noun: 'write-off' }`.

### 4.3 Server (Go, `books/server/`)

- `write_offs.go`: `docTypeWriteOff = "write_off"`, `writeOffsCollection`, the refusal texts, and `registerWriteOffGuards(app)` (in `register.go` and in `TestRegister_BindsEachPartOnce`'s list). Every guard runs inside `serialized` (`bindSerializedGuard`).
- Create (the one way a write-off is made; the row arrives with `status: posted`), in one transaction:
  - `ensureRecordID`; refuse any status but `posted` ("A write-off is posted when it is made."); refuse a body that sets a server field (`refuseServerFields`); stamp the currency and `posted_by` (the request's user).
  - Re-read the invoice: refuse one that is not posted or has a `balance` of zero ("Invoice 1009 has no open balance.", keyed `invoice`); refuse an `amount` that is not the balance ("The open balance of invoice 1009 is now $300.00. Check it and write it off again.", keyed `amount`).
  - The date is a real day and on or after the invoice's date ("Date the write-off on or after the invoice date, Sep 14, 2026.", keyed `date`).
  - The account exists, is active and is of type `expense` or `other_expense` ("Choose an active expense account", keyed `account`).
  - An inactive customer does not block a write-off.
  - Post through `postDocument` (doc type `write_off`, `DocumentID` the write-off, the date, the memo, the actor, the customer): one debit of the amount to the account and one credit of the amount to the Accounts receivable account that the invoice's entry debited, both naming the customer. `postEntry` runs every ledger rule (close date and override, the stored-amount limit).
  - Set `customer`, `number`, `sequence`, `entry`, `posted_at`, `sort_key`. Lower the invoice's `balance` by the amount (`saveDocumentBalance`, under the balancing mark) and raise its `written_off` by the amount in the same save. Rebuild the cash-basis rows of the invoice and of the write-off.
- Update: only posted → void, changing only `status`, `voided_by`, `voided_at`. Void posts the reversing entry in the original period (as `voidPayment`), keeps the number, raises the invoice's `balance` and lowers its `written_off` by the amount, and rebuilds both documents' cash rows. Any other change is refused ("A write-off is not changed. Void it and write the invoice off again."), except PocketBase clearing `posted_by` / `voided_by` of a deleted user. Delete is refused ("A write-off is voided, not deleted.").
- `document_balance.go`: `balancePayer` gains two optional fields, and `invoiceBalanceKind.Payers` gains the write-off payer `{LinesCollection: "books_write_offs", LineField: "invoice", OwnStatus: true, NoCash: true}`:
  - `OwnStatus`: the row is its own document. `appliedSQL` counts the rows whose own `status` is `posted`; `moveLinesWhere` does not move them (an invoice correction is refused while a posted one names it, and a void one stays on the original, as a void payment's lines do); `paymentPayer()` never returns it.
  - `NoCash`: the payer lowers the balance and is no payment on the cash basis: `documentPayments` leaves it out.
  - `verifyDocumentBalances` and `rebuildDocumentBalances` follow with no change (they read `appliedSQL`). The verify also compares `written_off` with the sum of the posted write-offs, and the rebuild repairs it. p2-apply-credit adds its payer beside this one.
- `cash_basis.go`: a deferred kind `writeOffCashDeferral` (`Kind: "write_off"`, `DocType: docTypeWriteOff`, a balance kind of `books_write_offs` with no payer, `UnpaidMemo: "Write-off (cash basis)"`). Its entry's lines are taken out of the cash layer at their dates and nothing brings them back; its void reversal is taken out too. The balance kind is not in `balanceKinds` (a write-off has no `balance`).
- `invoices.go`: `invoiceKind.CheckVoid` and `Replace` refuse while a posted write-off names the invoice ("This invoice is written off. Void the write-off first."), before the payment checks. The invoice guard treats `written_off` as a server field: a person's body cannot set it; the balancing mark lets Books write it on a posted invoice.
- `accounts.go` `checkAccountDelete` += `books_write_offs.account` with the §3.6 text. `entryNouns("write_off")` gives "Write-off" / "This write-off"; `documentDocTypes` gains the doc type; `entryDocTypeOptions` (`report_sources.go`) gains it. `TestTransactionDetailOpenPaths` gets a `write_off` poster in `tdDocumentPosters`.
- Registrations: audit (`books_write_offs`), OAuth (read and write `books_write_offs`), search source kind `write_off` (JOIN customers), quota none. No report source of its own (§8).
- Go tests: the posted entry's two lines and the customer on both; the invoice's `balance` and `written_off` at post and at void; each refusal of the create (status, server fields, invoice not posted, no balance, amount not the balance, date before the invoice, closed period with and without an override, account inactive, account of another type); the update and delete refusals; the invoice's void and correction refusals; a second write-off after a payment's void; the balance verify and rebuild with a write-off; the cash rows (an invoice paid in part and written off brings back only the paid share; the write-off's entry nets to nothing on the cash basis; a void restores it); the account delete guard.

### 4.4 Client

- `collections.ts` registers `books_write_offs` (`onDemand`).
- Reads (each `useLiveQuery` with `{ query, queryKey }`; row types derive from the queries):
  - the dialog: active expense accounts (the account options query, `filteredAccountOptions`), settings (currency, close date), the user's close-date override (the existing read), and the newest posted write-off (`orderBy created desc`, `limit 1`) for the default account. The invoice (number, date, balance, tax total, customer name) comes from the caller's row; on a list the dialog reads the invoice by id with its own `findOne` so the figure is live.
  - the invoice read view: one `useLiveQuery` of `books_write_offs` where `invoice = <id>`, by date (`useInvoiceWriteOffs`).
  - the write-off page: the write-off by id (`findOne`, `materialize()` of `posted_by` / `voided_by`, the invoice, the customer and the account).
  - the customer's Transactions tab: one more source (`writeOffRow` in `lib/party-transactions.ts`).
- Writes: `useMutation` (`@tinycld/core/lib/mutations`); the write-off is ONE insert (one transaction); the void is ONE update. No row is inserted and then updated.
- `INVOICE_DATA` reads `written_off`; the invoice's `kindFields` gain it; `invoiceRow` and the Sales lists' chip fields gain it.

### 4.5 Seed and fixture

- `lib/write-off-fixture.ts` (typed with `satisfies` against the generated types): a posted write-off of a whole invoice, a posted write-off of the rest of a partly paid invoice with sales tax, a void write-off, one with a long reason, and the invoices they name.
- `seed.ts` posts, through the same writes as the dialog: one new posted invoice of a seeded customer and its write-off to 6050 Bad debts. Both are dated after mid-2026 on days no General Ledger, Journal, Trial Balance, Profit and Loss, Balance Sheet, Customer Balance or sales report spec reads. The plan greps every test that reads account 1100, the 6xxx accounts, the whole seeded chart (the new 6050 sorts between 6000 and 6100), the customer's Open figure and the invoice counts before it picks the customer and the days.

### 4.6 E2E on the shared e2e DB

Specs create their own invoice through the UI with a unique memo, open it through Books search, write it off and void the write-off. One phone run (390 × 844) covers the Sheet, More → Write off, the Write-offs section as cards and the write-off page's stacked layout; it runs because the phone path draws different components. No spec changes a Books setting. No spec posts before mid-2026.

## 5. Cut

- The "Bad Debt" product and its form (name, SKU, category, sales price, income account) — the write-off names an account; no product is needed. This is the fix of the design rule.
- The credit memo as the carrier of a write-off (lines, quantity, rate, tax rate, message on the credit memo) — one dialog replaces it.
- A typed amount (a write-off of a part of the open balance) — Q1: a part that will not be collected for a price reason is a credit memo; a customer who paid a part leaves a balance that is written off whole. The human decided at the design gate (2026-11-18): no partial write-off; a partial reduction waits for credit memos applied to an invoice (p2-apply-credit).
- Writing off several invoices at once (a batch action on the Invoices tab, or a page with the customer's open invoices) — Q13: each write-off is one press on one invoice; a batch is direction B of the packet.
- A typed write-off number — numbers are assigned at posting (spec Ledger rules).
- Editing or copying a write-off — void and write off again.
- A PDF of a write-off, and "Written off" on the invoice PDF — the invoice PDF prints the invoice as issued.
- Email, attachments, custom fields on a write-off.

## 6. Platform notes

- Keyboard shortcuts (W, ⌘↵, Esc, V, I, J): web, and iOS with a hardware keyboard; Android has none; every action keeps a visible button or a More row. Standing approval for all Books forms (human, 2026-11-11).
- Focus on the Write-off date when the dialog opens: web only. Standing approval (human, 2026-11-11).
- No new platform-only item.

## 7. Sparks carried

- The amount given up is the most prominent figure of the action: "Amount to write off" in the dialog body and "Amount written off" in the write-off page header, `text-2xl font-semibold text-foreground tabular-nums` under a `text-xs text-muted-foreground` label.
- No core extension.

## 8. Non-goals

- No change to sales tax: the write-off writes no tax line and does not lower a tax liability account (Q2). No bad-debt tax deduction.
- No allowance method: the account list has no asset account (Q3).
- No write-off of a bill, a credit memo's unapplied credit or a customer's unapplied payment.
- No forms host: a write-off has no admin-editable form and no custom fields.
- No report source of its own in the report builder: its lines are in "Journal lines".
- No Sales lists tab and no + New entry for write-offs (Q12).
- No new data endpoint. No multi-currency.
- No statement and no apply credit (p2-statements, p2-apply-credit).
- The invoice PDF does not change.

## 9. Open questions (answered at the design gate, 2026-11-18)

The human picked direction A (the dialog on the invoice) and accepted every recommended answer. Q17 (p5-ar-aging overlap): the unit that merges second adds `write_off` to the `books_receivable_lines` view so a write-off's A/R line belongs to its invoice; if p5-ar-aging merges first, this unit adds it. Q18 (p3-purchase-lists overlap): p3-purchase-lists merges first; this unit merges main before each gate and keeps both sides in `lib/document-list.ts`, `lib/party-transactions.ts`, `lib/sales-lists.ts` and `seed.ts`.

Q1 whole balance only; Q2 sales tax unchanged; Q3 expense and other expense accounts; Q4 default account and the new 6050 Bad debts; Q5 cash basis; Q6 own number sequence; Q7 a read page of its own; Q8 void as the one way back, no edit; Q9 written-off invoice cannot be edited or voided; Q10 the stored `written_off` field; Q11 the Written off status and chip; Q12 the customer Transactions row, no Sales tab; Q13 no batch; Q14 the key W; Q15 migration numbers; Q16 seed. The packet states each with its recommended answer.

## 10. Engine reach (self-review)

- Dialog: core `Dialog`, `Dialog.Body`, `Dialog.Footer`, `Dialog.CancelButton`, `Dialog.ActionButton` with `shortcut={DIALOG_SUBMIT_SHORTCUT}`, `initialFocusRef` (`@tinycld/core/ui/dialog`); a Sheet on a phone is the Dialog's own `auto` presentation. Focus: Books `useFocusOnOpen`.
- Fields: core `DateField` (`@tinycld/core/ui/forms/fields/DateField`), `SelectInput` with `SelectOption.indent`, `TextAreaInput`, `FormErrorSummary`, `useForm`, `zodResolver` (`@tinycld/core/ui/form`). The dialog is a plain zod form, not a forms-engine host, so no `FormHostUi.schemas` path is needed: each rule is in `writeOffSchema` and shows under its field.
- Read page and actions: Books `DocumentHeader` figure classes, `READ_BAND`, `Detail`, `TextLink`, `Stamp` (`components/payments/read-view-parts.tsx`), `VoidDialog`, `DocumentLoading`, `DocumentLoadError`; core `ShortcutButton` (`@tinycld/core/ui/shortcut-button`), `useShortcutScope`, `useRegisterShortcuts` (`@tinycld/core/lib/shortcuts`).
- Invoice read view: `DocumentKind.readTotals`, `balanceBadge`, `ReadSection`; `LinkedDocumentsSection`.
- Writes: `useMutation` (`@tinycld/core/lib/mutations`): one insert; one update for the void. No write has more than one row. Server refusals through `handleMutationErrorsWithForm`; the toast through core `useToastStore`.
- Reads and recovery: `useLiveQuery` with `queryKey`, `materialize()`, `recoverLiveQueries`, Books `mergeRecoveries`.
- Server: `postDocument`, `saveDocumentBalance`, `balancePayer` (two new optional fields), `cashDeferral`, `bindSerializedGuard`, core `audit`, `oauth`, `search`, `fts` registries.
- No bullet needs a core API that does not exist. No core change.
