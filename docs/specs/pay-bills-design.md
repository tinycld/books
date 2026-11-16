# Pay Bills — design

Unit p3-pay-bills · package books · feature `pay-bills`. Approved at the second design gate, 2026-11-15 (helix unattended mode): direction A; Q1–Q4 take the recommended answers below. Binding answers from the first gate (`docs/plans/auto-helix/p3-pay-bills.md`): direction A; every earlier recommended answer; N1 (core report-header line, small, no exclusive); Q21 (p2-receive-payment owns `lib/payment-allocation.ts`, the open-document payment table and the Payments section; this unit reuses them); Q22 (bills follow receive-payment: open amount field `balance`; a posted bill payment is edited as a correction; a bill with payments can be edited, its payments move to the correction; void of a paid bill refused); Q23 (migration number taken at build time). Points decided at the second gate are marked "Q<n>": Q1 edit as `?replaces` mode of Pay Bills; Q2 invoices also deferred on cash; Q3 Method on Sales Tax Liability in this unit; Q4 Paid / Partly paid badge on bills.

Built against books main c49a048 (p2-receive-payment merged as PR #55) and core main 9cc926c. Spec sources: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Purchases: Bill, Pay Bills, …"; "Reports: P&L (… cash/accrual) …"; "method toggle"), §Audience and basis ("Accrual basis stored; cash-basis reports derived from payment allocations"), §Ledger rules. Contracts: `docs/specs/receive-payment-design.md` (the payment model this unit copies for bills), `bill-form-design.md` and `expense-form-design.md` (document layer, payment band), `profit-and-loss-design.md` §8, `balance-sheet-design.md` §8, `general-ledger-design.md` §8, `sales-tax-liability-design.md` §6, `report-drill-down-design.md` §8, `report-shell-design.md` (basis text in the document header).

## 1. Goal
A writer pays one or more open bills in one step — from a bank or credit card account, by check or another method, in full or in part — which posts one numbered bill payment per vendor (debit Accounts payable, credit the account paid from) and lowers each bill's balance; a posted bill payment can be edited as a correction or voided; and every Books reader can run the Profit and Loss reports, the Balance Sheet and Sales Tax Liability on the cash basis, derived from bill payments and customer payments.

## 2. Where it lives
- **Pay Bills:** `/a/books/pay-bills` (`screens/pay-bills.tsx`). Query `?vendor=<id>` (Vendor filter set), `?bill=<id>` (that bill selected for its balance, its vendor filtered), `?replaces=<id>` (edit a posted bill payment, §3.6). A pushed page; `hidesNewFab` gains `pay-bills` and `bill-payments`.
- **Bill payment read view:** `/a/books/bill-payments/[id]` (`screens/bill-payments/[id].tsx`). A pushed page. There is no draft bill payment, so this route only reads.
- + New menu → column "Vendors" → "Pay bills", after "Bill" (`lib/shell-nav.ts`, id `pay_bills`).
- Bill read view (posted, `balance` > 0, writer): action **Pay bill** → `books/pay-bills?bill=<id>`.
- Journal Entries list, account registers, entry drawer, General Ledger, Journal, report drills and Books search open a bill payment at `books/bill-payments/<id>` (`server/entry_routes.json` row `"bill_payment": "bill-payments"`).
- Reports: core's report view `/a/reports/<id>`; Books adds no report screen.
- No bill payments list and no sidebar entry (p3-purchase-lists).

## 3. Behavior

### 3.1 Speed and keyboard
Copied from receive-payment §3.1 so the two payment screens work the same way.
- On open (new or `?replaces`) Paid from has focus on web at every width; after Pay & new it has focus again. Nothing takes focus on iOS and Android (standing approval).
- Tab order: Paid from → Payment date → Payment method → Starting check no. (when shown) → Vendor filter → Due filter → row 1 Payment → row 2 Payment … → "Clear payments" → action bar. Each row has one Tab stop, its Payment cell; the row's select box is a press target only (`tabIndex={-1}`, lesson 29).
- In a Payment cell: Enter (native: return key) moves to the next row's cell (the last row moves to "Clear payments"); ⌥↵ toggles the row (empty or zero → its full open balance; filled → cleared). The cell selects its whole value on focus (lesson 25).
- Every action button with a key is a core `ShortcutButton` with `scopeOwner` from the screen's `useShortcutScope`; a key whose action sits in More is registered with the menu row's `shortcut` text. Every key is in core's ⇧? sheet, group "Pay bills"; form keys use `allowInInputs`.

| Where | Action | Key |
|---|---|---|
| Pay Bills | Pay (Save on `?replaces`) | ⌘↵ |
| Pay Bills | Pay & new (not on `?replaces`) | ⌘⇧↵ |
| Pay Bills | Cancel (discard dialog with a selection) | Esc |
| Pay Bills | Pay every shown bill in full / clear them | ⌥A |
| Pay Bills | Clear payments | ⌥⌫ |
| Payment cell | Pay this row in full / clear it | ⌥↵ |
| Bill payment read view | Edit | E |
| Bill payment read view | Void | V |
| Bill payment read view | View journal entry | J |
| Bill read view | Pay bill | P |

- A key does nothing when its button is hidden, disabled or busy, or the user cannot write. While a dialog is open the screen's keys do nothing; Esc closes only the open layer.

### 3.2 Header band
- Title "Pay bills" (`?replaces`: "Edit bill payment 1004"), `HelpIcon topic="books:pay-bills"`, big figure top right **Total payment** (`DocumentHeader` figure; the sum of the row payments; "—" while a row amount is invalid; "Too large" over the stored-amount limit).
- **Paid from** (required): Books `PaymentAccountField` (`forms/payment-fields.tsx`) — active accounts of type `bank` or `credit_card`, chart order, indented, "<number> <name>". Under it, once picked, "Balance $7,218.56" (the expense's balance line, `text-danger` when negative). With no such account the select is empty with `PAID_FROM_EMPTY_TEXT`.
- **Payment date** (required, default today; core `DateField`).
- **Payment method** (required): `PaymentMethodField` without "None", over `PAYMENT_METHODS`. Picking Paid from sets it as the expense does (`defaultMethodFor`); the user may change it.
- **Starting check no.** (shown only while Payment method is Check; optional; digits only, at most 9: "Use digits only, up to 9."). When filled, this batch's payments take consecutive check numbers from it, one per vendor in vendor display-name order (then id); when empty, they have no Ref no. On `?replaces` the field is **Check no.** and holds the payment's own Ref no. (any text up to 40 characters, as the expense's).
- Wide (container ≥ 640 px): one row Paid from · Payment date · Payment method · Starting check no., beside the big figure. Phone: stacked in that order, big figure under the title.

### 3.3 Open bills
- **Rows:** every posted bill with `balance > 0` (`books_bills` `status = posted`, `balance > 0`; a replaced bill is void, so it never shows), with its vendor through `materialize()`. Any date: no 365-day window. On `?replaces` the list is that payment's vendor only, and also lists every bill the original pays, even one whose balance is now 0; such a row's open amount is its balance plus what the original paid on it (receive-payment's `open`).
- **Filters** (a chip row above the list, Books `ListToolbar` chips): **Vendor** (vendor `SearchPicker`, "All vendors" default; fixed and disabled on `?replaces`) and **Due** ("Any time" default, "Overdue" = due before today, "Due in 7 days" = due on or before today + 7). "4 open bills" (shown rows) at the right of the chips. Filters are screen state.
- **Order:** Due date ascending, then bill number. Pressing the Vendor or Due date header sorts by it; pressing again reverses (an arrow marks the sorted column).
- **Wide:** receive-payment's `OutstandingGrid`, given the bill document descriptor and the party column: header select box · **Vendor** · **Bill** ("Bill 1003" link, and the vendor's bill no. "No. 88412" muted under it) · **Due date** (`DueText`: "Overdue" in danger tone) · **Bill total** · **Open balance** · **Payment** (`PaymentCell`). A totals row under the rows: Open balance of the shown rows, Payment of every row with a payment.
- **Phone (list width < 640 px):** receive-payment's `OutstandingCards` with the same descriptor: a "Pay all" select box over the cards; each card has the select box and Vendor on top, "Bill 1003 · No. 88412", the due date, Bill total and Open balance as a pair, and the Payment input full width.
- **Selection** (receive-payment's `lib/payment-allocation.ts`): ticking a row sets its payment to its open amount; unticking clears it; typing an amount above zero ticks it; zero unticks it. The header select box / "Pay all" / ⌥A pays every shown row in full, or clears them all when every shown row is paid. "Clear payments" (link under the list, ⌥⌫) clears every row. A row with a payment that a filter hides keeps its payment and counts in the totals; the summary then says "2 selected bills are hidden by the filter". A row with a refusal under its cell is never hidden by a filter.
- **Empty:** no open bill at all — "No open bills. Bills you post show here until they are paid." with a Button "New bill" (`books/bills/new`); filters hide every bill — "No open bills match these filters." with "Clear filters".
- No paging: one list in the page scroller (lesson 11 applies to its e2e).

### 3.4 Summary and actions
- Under the list, left: "3 bills selected · 2 vendors" (or "No bills selected"), and with Check and a starting number "Pacific Power gets check 1050, Office Supply World check 1051." Right, once Paid from is picked, three `TotalLine`s: **Current balance**, **Total payment** (with a minus sign), **New balance** (strong): a bank account's balance minus the total; a credit card account's balance plus the total. New balance in `text-danger` when a bank account goes below zero; no block. On `?replaces` Current balance already holds the original payment, so a fourth line "Payment 1004 now +$920.00" (a credit card account: −) sits between Current balance and Total payment, and New balance is Current balance + original total − new total.
- Action bar (shared `DocumentActionBar`, sticky): wide Cancel, **Pay & new**, **Pay** (primary); phone Cancel, Pay, More (Pay & new). On `?replaces`: Cancel, **Save** (primary).

### 3.5 Validation and saving
- One zod schema (`payBillsSchema(currency, openByBill)`) through `useForm` + `zodResolver`: Paid from, Payment date (`isIsoDay`), Payment method required; Starting check no. digits ≤ 9 (Check no. ≤ 40 on `?replaces`); at least one row paid ("Select at least one bill to pay.", in `FormErrorSummary`); each row payment ≥ 0 and at most its open amount ("More than the open balance of $1,250.00", under that cell, the receive-payment text); the total at most the stored-amount limit. Amounts are cents through the shared money helpers.
- **Pay** writes, in ONE PocketBase batch through `useMutation` (all or nothing): per vendor (display-name order) one `books_bill_payments` create with `status: 'posted'` and its `books_bill_payment_lines` (bill, amount, position). The server posts each payment from the payment create's request hook after `e.Next()`, when its lines exist, inside the batch transaction (the `bindSalesDocDeferral` pattern, `server/sales_document_deferral.go`; human decision 2026-11-15, option A). No draft bill payment is ever stored. A refused batch writes nothing and keeps the typed values. The form is held through the write by a synchronous Zustand save flag set before the mutation (memory p1-opening-balances).
- **Save** on `?replaces` writes in one batch the correction (a create with `status: 'posted'`, `replaces = <id>`, same vendor) and its lines; the same request hook posts it (§3.7).
- Refusals map to the screen: a line's refusal ("Bill 1003: the payment is more than its open balance of $50.00.", "Bill 1003 is not open. Clear it to continue.") under that row's cell (root `lines.<n>` of the payment it belongs to, mapped back to the bill); a taken check number (the expense's "Check no. 1042 from 1000 Business Checking is already on Expense 1004." / "… on Bill payment 1006.") under Starting check no.; Paid from inactive under Paid from; the close date and the rest in `FormErrorSummary` with PocketBase's final period. A refusal after the user left is logged (`log.warn('books.billPayment', …)`).
- **After Pay:** a toast "Posted Bill payment 1004" / "Posted 3 bill payments (1004–1006)" and `router.back()` (replace with the first payment's read view when there is nothing to go back to). **Pay & new:** the same toast; the screen stays, rows and filters clear, the paid bills leave the list, Paid from, date and method stay, Starting check no. becomes the number after the last one used (empty stays empty); focus to Paid from. **Save** (`?replaces`): replace with `books/bill-payments/<correction id>`.
- Cancel with a payment entered opens `DiscardDialog` ("Discard this payment? The bills stay open."); otherwise leaves at once.
- Writers only (bookkeeper or admin). A non-writer sees "You need bookkeeper access to pay bills". Offline: Pay, Pay & new and Save disable (`useWritesAvailable`).
- States: loading (static skeleton of the band and three rows); a load error with Retry per failing read (bills, vendors, accounts with balances; merged recoveries); `?replaces` of a payment that is not posted: "This bill payment cannot be edited"; not found: "This bill payment does not exist".

### 3.6 Editing a bill payment (Q1)
- The read view's **Edit** (E) opens `books/pay-bills?replaces=<id>`: the same screen in edit mode, with the payment's Paid from, date, method and Check no. filled, its vendor fixed, and its rows paid as the original paid them. The user may change the header, change or clear a row's payment, and pay more of that vendor's open bills.
- Save posts a correction that takes the original's number (receive-payment §4.3 Correction): its entry replaces the original's, the original becomes void with `replaced_by`, its lines release their amounts back to their bills, the correction's lines are applied. A correction with no row paid is refused ("Select at least one bill to pay."): to undo a payment the user voids it.

### 3.7 A bill payment (server)
- **One payment per vendor**: the selected bills of each vendor make one payment.
- **Posting** (one transaction, `serialized`, through `postDocument` with doc type `bill_payment`): allocate the number from the `bill_payment` sequence (Settings → Numbering "Bill payments", no prefix, next 1001); re-read each line's bill `balance` and refuse a line above it ("Bill 1003: the payment is more than its open balance of $50.00." keyed `lines.<n>`); entry: one debit per Accounts payable account the paid bills credited (read from each bill's entry, summed per account, chart order) and one credit to Paid from for the total, every line naming the vendor, memo "Payment of Bill 1003, Bill 1004"; post through `postEntry`; write `entry`, `number`, `total`, `posted_by`, `posted_at`; subtract each line from its bill's `balance` (the document-balance helper, §4.3); rebuild the cash-basis rows of each bill (§3.10).
- **Guards** (inside `serialized`): at least one line, at most 250; each line's bill posted, of the payment's vendor, listed once, amount > 0; Paid from exists, is active, and passes `isPaymentAccount`; method a known key; Ref no. ≤ 40; the check number (method Check, Ref no. not empty) is not on another non-void expense or bill payment from the same Paid from with method Check, other than the payment this one corrects (`checkExpenseCheckNo` widened to both collections); date a real day, after the close date. An inactive vendor does not block a payment. Lines are written only inside the batch that creates their payment, before its request hook posts it, or while a bill correction moves them.
- **Correction:** as receive-payment's (`voidReplacedPayment` pattern): same vendor required ("A bill payment correction keeps its vendor."); the original must be posted.
- **Void** (writer, posted): reversing entry in the original period, number kept, status void, its lines released (balances back), the bills' cash rows rebuilt. Refused on or before the close date.

### 3.8 Bill payment read view
- Header: title "Bill payment 1004", badge Posted / Void, big figure **Amount paid**.
- Body: Vendor, Paid from, Payment date, Payment ("Check · 1042", `paymentText`); **Bills paid** (receive-payment's `AppliedInvoices` given the bill descriptor: wide grid Bill link · Vendor's bill no. · Due date · Bill total · Paid; phone cards), a Total row; "Posted by <name>, <date time>"; "Voided by …"; "Replaced by 1004 (edited)" on a replaced original.
- Actions (writer, posted): **Edit** (E), **Void** (V; `VoidDialog` "A reversing entry is posted in the original period. The number is kept. The bills it paid are open again."), **View journal entry** (J). Writer on a void payment, and reader: View journal entry only (receive-payment's `PaymentReadActions` with the bill-payment routes).
- States: loading, load error with Retry, not found ("This bill payment does not exist").

### 3.9 Bills, after this unit
- `books_bills.balance` (Q22): posting writes total less the posted payments already applied (a correction's taken-over payments), void and replacement write 0; every other change goes through the document-balance helper.
- Bill read view: the big figure **Balance due** reads `balance`; the totals gain "Payments −$100.00" above Balance due when a payment applies; a **Payments** block (receive-payment's Payments block, generalized) lists each posted bill payment applied ("Bill payment 1004 · Nov 5, 2026 · $100.00", opens it). Writer action **Pay bill** (P) on a posted bill with `balance > 0`.
- Badge (Q4): Paid (success) when `balance` is 0, Partly paid (warning) when 0 < balance < total, otherwise Posted / Draft / Void — the invoice's `document-lifecycle` rule.
- **Void of a bill a posted payment pays is refused**: "Payments are applied to this bill. Void or edit those payments first." (the read view shows the refusal as the invoice's does).
- **Bill correction** (`?replaces`) with payments: at posting the original's payment lines move to the correction (the `moveApplications` pattern); refused when the correction's total is below them ("Payments of $300.00 are applied to this bill. Its total cannot be below that.") or when it changes the vendor ("Payments are applied to this bill, so its vendor cannot change.").
- Bill delete: drafts only (unchanged); a draft has no payments.

### 3.10 Cash basis (derived from payment allocations)
- **Rule:** on the cash basis a document of a deferred kind counts when and as far as it is paid. Each posted journal line of its entries (the document's entry, a correction's, a void reversal's) is taken out at its own date; each payment brings back that payment's share of the document's current lines at the payment's date. Every other entry (journal entries, transfers, expenses, sales receipts, bill payments, customer payments, opening balances) counts as posted.
- **Deferred kinds** (Go registry `cashDeferrals`, each kind = its document collection, its payment-line collection and field, its payment collection): `bill` (paid by `books_bill_payment_lines`) and, Q2, `invoice` (paid by `books_payment_applications`). A customer payment's unapplied credit stays on its own date (it is cash received).
- **Share:** over the document's current entry, each line other than the A/P (A/R) line, signed amount × paid ÷ document total, cumulative over the document's posted payments in payment order (date, then number), largest remainder, so each payment's share adds to its amount, its A/P (A/R) line is −amount (+amount), and a document paid in full brings back exactly its lines. A void or replaced payment's share is gone; the rebuild may move another payment's share of the same document by a cent.
- **Stored rows:** `books_cash_basis_lines` (§4.1), server-maintained, rebuilt for one document inside the transaction of every write that changes its entries or payments (document post, correction, void; payment post, correction, void; payment lines moved by a correction), and fully rebuildable (`rebuildCashBasis`, run in the ledger verify/rebuild path; a Go test compares it with the incremental rows). Readers list them; nothing else writes them.
- **Source:** union source `books.basis_lines` ("Journal lines by basis", core `SourcePart`): part `books_journal_lines` with `layer` = "ledger", part `books_cash_basis_lines` with `layer` = "cash"; fields and links as `books.journal_lines`. A report on it filters `or(eq([layer], "ledger"), eq({param method}, "cash"))`.
- **Reports:** Profit and Loss, Profit and Loss by Month, Balance Sheet and Transaction Detail by Account move to `books.basis_lines` and gain the param **Method** (`method`, `choice`: `accrual` "Accrual" default, `cash` "Cash"; chip `report-param-method` after Period / As of). The Balance Sheet's Retained earnings and Net income lookups read the same source under the same condition. The three statements' drills copy the method to Transaction Detail (`{ "param": "method" }`). Each shipped revision +1. Hub descriptions drop "on the accrual basis". The document header prints "Accrual basis" or "Cash basis" (N1).
- **Sales Tax Liability (Q3):** gains the same Method param. Its source `books.sales_tax_lines` (today a union of `books_invoice_tax_lines` and `books_sales_receipt_tax_lines`, dated through the document link) gains a third part, `books_cash_basis_tax_lines`, and two fields on every part: `layer` (ledger parts "ledger", the new part "cash") and `date` (stored on the two ledger tables at posting — their migrations edited in place — and on the cash rows as the payment date). On cash an invoice's tax line is taken out at the invoice date and comes back by each payment's share (gross, taxable and tax amounts × paid ÷ total, cumulative, largest remainder) at the payment date; sales receipt tax lines count on their date. The report filters by the tax line's `date` instead of the document's, and adds the same `layer`/method condition. Revision +1; description and help drop "accrual basis".
- **Opened lines** on cash: a taken-out line reads the document entry's number and the memo "Unpaid bill (cash basis)" / "Unpaid invoice (cash basis)"; a brought-back share reads the payment entry's number and "Bill 1003 paid (cash basis)" / "Invoice 1004 paid (cash basis)".
- **Balance Sheet balances on cash:** taken-out rows negate balanced entries, share rows are balanced (lines + A/P or A/R), so each period's cash rows add to zero.
- General Ledger, Trial Balance and Journal keep accrual only (first gate).

### 3.11 Elsewhere in Books
- Journal Entries, registers, entry drawer, General Ledger, Journal, Transaction Detail: Type "Bill payment" (`entry_type_labels.json` `docTypes.bill_payment`), No. "1004", Name the vendor on both lines; Open goes to the payment; Edit opens `books/pay-bills?replaces=<id>`; Reverse hidden. "Void reversal of 1004".
- Search: kind `bill_payment`, title "Bill payment 1004 · Pacific Power"; number, Ref no. and the vendor's name indexed.
- Account delete refused while it is the Paid from of a bill payment ("This account paid 1 bill payment and cannot be deleted. Make it inactive instead." / "… paid 3 bill payments …").
- Vendor delete is already refused while the vendor is on bills; a payment always pays its vendor's bill.
- Audit log (labels "Bill payment 1004", "<payment>: Bill 1003"), OAuth scopes (rw bill payments and lines; read cash-basis lines), `entryNouns("bill_payment")`, `entries.go` document-entry checks, report source doc-type option, `TestRegister_BindsEachPartOnce`, `tdDocumentPosters` gains a bill-payment poster.
- 1099: no 1099 effect in this unit; the payment stores what p5-1099-report counts.

### 3.12 Help
- New `help/pay-bills.md` (id `books:pay-bills`): pay bills (Paid from and its balance, date, method, starting check no.), select and partial payments, filters and sort, one payment per vendor, Pay / Pay & new, edit a bill payment, void, what a payment posts, the key table of §3.1 (Mac glyphs only). Cross-links bills ↔ pay-bills, expenses, reports.
- `help/bills.md`: balance due, Paid / Partly paid, Payments, Pay bill, the void and correction rules.
- `help/reports.md`: "Accrual and cash basis" — what Method does, which reports have it, that bills and invoices count when paid on cash, that a voided payment can move another payment's share by a cent; statement sections drop "on the accrual basis". `help/sales-tax-liability.md` (or its section) gains the method.

## 4. Data

### 4.1 New migration (`<next>_create_books_bill_payments.js`; the next free number at build time — 2100000020 on this branch today; the second unit to merge renumbers)
- `books_bill_payments`: vendor (relation books_vendors, required), paid_from (relation books_accounts, required), payment_method (select PAYMENT_METHOD keys, required), reference_no (text ≤ 40), status (select posted/void; no draft, human decision 2026-11-15 option A), number (text ≤ 40, server), sequence (number, server), date (text day, required), total (number onlyInt, server), currency (server), entry (relation books_journal_entries, server), replaces / replaced_by (relation books_bill_payments), posted_by, posted_at, voided_by, voided_at (server), sort_key (server), created, updated. Rules: READ list/view; create `WRITE && status = "posted"` with server fields unset — the create is admitted only inside a batch transaction, and its request hook posts it after `e.Next()` when its lines exist (a create outside a batch, or one whose batch adds no line, is refused "Select at least one bill to pay." and nothing is stored); update `WRITE` with server fields unset and posted → void only; no client delete.
- `books_bill_payment_lines`: payment (relation, required, cascade), bill (relation books_bills, required), amount (number onlyInt > 0), position (onlyInt). Index on bill; unique (payment, bill). List/view READ; create `WRITE`, admitted only for a payment created in the same batch and not yet posted; no client update or delete (a bill correction's move is server-side).
- `books_cash_basis_lines`: document_kind (select bill/invoice), bill (relation books_bills, optional, cascade), invoice (relation books_invoices, optional, cascade), payment_entry (relation books_journal_entries, optional), entry (relation books_journal_entries, required), account (relation books_accounts, required), vendor, customer (relations, optional), debit, credit (onlyInt ≥ 0), date (text day), posted (bool, true), memo (text), currency, position. List/view READ; no client create/update/delete. Indexes (account, date), (bill), (invoice).
- `books_cash_basis_tax_lines` (Q3): invoice (relation books_invoices, cascade), the shared tax-line columns (gross_amount, taxable_amount, amount, rate_ppm, currency, rate, component, agency), date (text day), payment_entry (relation, optional), position. READ only, server-written. Index (date).
- Edited in place (Q3): `books_invoice_tax_lines` and `books_sales_receipt_tax_lines` gain `date` (text day, server-written at posting from the document date).
- FTS `fts_books_bill_payments` (number, reference_no).

### 4.2 Edited migrations (in place; Books is unreleased)
- 2100000001: `books_doc_sequences.doc_type` gains `bill_payment`; seed row `booksseqbillpay` (15 characters), no prefix, next 1001.
- 2100000002: `books_journal_entries.doc_type` gains `bill_payment`.
- 2100000013: `books_bills` gains `balance` (number onlyInt, server-written, min 0); index (vendor, status, balance).

### 4.3 Server (Go)
- `document_balance.go` (Q21 reuse): receive-payment's `invoice_balance.go` generalized to a table of balance kinds (invoice: `books_invoices` / `books_payment_applications.invoice` / `books_payments`; bill: `books_bills` / `books_bill_payment_lines.bill` / `books_bill_payments`) with the same functions (`documentBalance`, `saveDocumentBalance`, `setPostedDocumentBalance`, `clearDocumentBalance`, `applyToDocuments`, `releaseLines`, `moveLines`, `verifyDocumentBalances`, `rebuildDocumentBalances`). Invoice behavior and tests unchanged.
- `bill_payments.go` / `bill_payment_posting.go`: guards, posting, correction, void (the `payments.go` / `payment_posting.go` pattern).
- `bills.go` / the document layer's bill kind: balance at posting, void refusal, correction move and refusals.
- `cash_basis.go`: `cashDeferrals`, per-document rebuild (also tax lines), `rebuildCashBasis`, largest remainder.
- `checkExpenseCheckNo` → `checkCheckNo` over expenses and bill payments (`payment_accounts.go`).
- `report_sources.go` (`books.basis_lines`, the tax-lines cash part), report specs (P&L, P&L by Month, Balance Sheet, Transaction Detail, Sales Tax Liability), `report_spec_helpers.go` (`methodParam()`, `basisFilter()`), `entry_routes.json`, `entry_type_labels.json`, `entryNouns`, search, audit, OAuth, account delete hook.

### 4.4 Client reads (each `useLiveQuery` with an explicit `queryKey`)
- Open bills: one query on `books_bills` (`status = 'posted'`, `balance > 0`, plus `vendor = v` on `?replaces`) with the vendor through `materialize()`; on `?replaces` the original's lines with each bill through `materialize()`, merged by bill id (receive-payment's `useOutstandingInvoices` pattern).
- Paid from options and balances (`accountsWithBalances`), vendor picker options, settings (currency).
- Payment by id (`findOne`) with `materialize()` of posted_by / voided_by; its lines ordered by position with `materialize()` of the bill.
- Bill read view Payments: `books_bill_payment_lines` where bill = id with `materialize()` of the payment, posted kept (receive-payment's `invoicePayments` pattern).
- Row types derive from the queries.

### 4.5 Seed and fixture
- `lib/pay-bills-fixture.ts` (typed with `satisfies` against generated types once the migration lands): open bills for three vendors (one overdue, one partly paid, one long vendor name and amount), a posted payment of two bills, a partial payment, a void payment, a correction and its original, a vendor with no open bill.
- `seed.ts`: three more posted bills dated after mid-2026 for two vendors, one partly paid by a seeded bill payment (Check 1050 from 1000 Business Checking), one void bill payment. The plan greps every report, register, expense and customer/vendor spec that reads 1000, 2000 and the bills' accounts first (lessons 1, 23).

## 5. Cut
- **Credit applied** (vendor credits) — p3-vendor-credit not merged (no `books_vendor_credits` on dd767ac). Deferral, reason 1: p3-vendor-credit adds the column and a credit line.
- **Print later**, printing checks — check printing is Later in the Books spec.
- **Draft bill payments**, Save without posting — a payment posts at once (first gate).
- **The 365-day window and paging**; **gear** (column chooser); **close (X)** — Cancel and the stack's back cover close.
- **Overpayment / vendor credit from overpayment** — a payment is at most the open balance.
- **One payment per bill / per batch** — one per vendor.
- **Pay from the bill form** ("Save and schedule payment") — Pay bill on the read view.
- **Method on General Ledger, Trial Balance, Journal** — first gate.
- **Method as a Books setting**; **a segmented Accrual/Cash toggle** — the chip is the control, per run.

## 6. Platform notes
Standing approval (human, 2026-11-11): keyboard shortcuts on web and iOS with a hardware keyboard (Android uses visible buttons and menus); first-field autofocus and type-to-open pickers on web only. No new platform item.

## 7. Sparks carried
- Total payment is the largest figure: `DocumentHeader` big figure.
- Balance before and after in view: the balance line under Paid from; Current balance / Total payment / New balance as `TotalLine`s.
- Core extension N1 (accepted): a `choice` param's chosen option as a document-header line.

## 8. Non-goals
- No bill list, A/P aging, vendor balance report (p3-purchase-lists, p5-ap-aging, p5-vendor-balance).
- No 1099 counting (p5-1099-report).
- No change to receive payment's behavior; its shared parts are generalized, not changed.
- No multi-currency payment.
- No change to General Ledger, Trial Balance or Journal.

## 9. Engine reach (self-review)
- Row selection and amounts: `lib/payment-allocation.ts` (`tickRow`, `untickRow`, `typeRowPayment`, `toggleRow`, `payAll`, `isEveryRowPaid`, `clearPayments`); `OutstandingRow` gains optional `party` and `ref`.
- Grid and cards: `OutstandingGrid` / `OutstandingCards` take a document descriptor (noun "Bill"/"Invoice", route base, test-id prefix) and an optional party column; `PaymentCell`'s label takes the noun. Column widths in `lib/payment-columns.ts` gain `party` and the bill grid's min width.
- Payments block: `InvoicePayments` → `DocumentPayments` with a noun and a route.
- One batch for several payments: one pbtsdb `batch` (one TanStack DB transaction) carries every vendor's payment create (`status: 'posted'`) and its line creates; no row is created and updated in the same batch, because TanStack DB merges an insert and a later update of one row into one insert (phase 4 finding). The server posts each payment from its own create's request hook after `e.Next()` (`bindSalesDocDeferral` pattern). In a batch, operation N+1 runs inside operation N's `e.Next()`, so the last payment in the batch posts first; the client therefore writes the vendors in reverse display-name order (each payment followed by its lines), and the numbers follow vendor display-name order. A refusal in a payment's post is reported at that payment's operation (PocketBase's batch `failedIndex`), so the client maps it to the right payment. Human decision 2026-11-15, option A.
- Method param: core `choice` param, `{param}` in `filter` and `lookup.where`, union source (`SourcePart`), drill `{ "param": "method" }`. Header line: N1.
