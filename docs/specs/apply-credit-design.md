# Apply credit — design

Status: APPROVED at the design gate (human, 2026-11-19; auto-helix unit p2-apply-credit). Direction A of the packet; the answers to Q1–Q19 are in §9. Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Apply credit"), §Ledger rules ("an invoice takes many partial payments; overpayment becomes customer credit"), §Interface; `docs/plans/books-quickbooks-fixes.md` (Sales: "Apply credit has its own label and entry. QuickBooks records it as a $0 payment."). Contracts: `vendor-credit-form-design.md` §3.9–§3.11 (Apply to bills: the dialog, the application record, the guards, the cash basis — this unit is its customer-side twin and makes its parts shared), `credit-memo-form-design.md` §3.10, §3.11, §4.3 (a credit memo's `balance`; "p2-apply-credit fills in the kind's payers"), `receive-payment-design.md` §3.9, §4.3 (an invoice's `balance` has one writer, `server/document_balance.go`), `refund-receipt-form-design.md` §3.3, §3.12 (a payout reads the memo's live `balance`), `write-off-design.md` §3.4, §5 (a write-off takes the whole balance; a part is reduced by a credit memo applied to the invoice: this unit), `sales-lists-design.md`, `customer-pages-design.md`, `ar-aging-design.md` (p5-ar-aging, books PR #77: the stored receivable rows, §3.8 and §4.3 here). Designed against books `books/p2-write-off`@a0c2a49c and core `main`@470a6f7b; built on the step branch `books/p2-apply-credit` after p4-match and p5-ar-aging merge (§4.7).

## 1. Goal

A bookkeeper uses a customer's credit memo to pay that customer's open invoices, in full or in part, with no money received: they open the credit memo or the invoice, press Apply, confirm a date and the amounts, and each invoice's balance due and the memo's unapplied credit go down by a stored, dated, removable record labeled "Credit applied".

## 2. Where it lives

- **Apply to invoices** on a posted credit memo's read view (`books/credit-memos/[id]`): a read action, a notice above the band, and the credit memo row's menu on the Sales lists and on the customer page's Transactions tab. It opens the **apply dialog** for that credit memo (one credit, the customer's open invoices).
- **Apply credit** on a posted invoice's read view (`books/invoices/[id]`): a read action and a notice above the band. It opens the apply dialog for that invoice (one invoice, the customer's credit memos with unapplied credit).
- The dialog is a core `Dialog` (a Sheet on a phone) over the read view. There is no `new` route, no page of its own, no sidebar entry, no + New entry and no Sales lists tab (Q3).
- An application has no page. It shows as a row on both documents (§3.5, §3.6) and in the audit log.

## 3. Behavior

### 3.1 Where the actions are offered

- A writer (bookkeeper or admin) gets **Apply to invoices** on a posted credit memo whose `balance` (unapplied credit) is above zero. Key **A** (`DOCUMENT_READ_KEYS.apply_credit`), first in the action list (before Edit), a `ShortcutButton` with the screen's `scopeOwner`. On a phone it stays visible in the bar (as the vendor credit's Apply to bills).
- A writer gets **Apply credit** on a posted invoice whose `balance` is above zero while the invoice's customer has a posted credit memo with a `balance` above zero. Key **A**, after Receive payment and before Edit. On a phone it is a row of More with its key as the row's `shortcut` text.
- A reader, a draft and a void document do not get them. Each key is registered only while its action is offered.
- The action's label comes from the record's kind (`applyCreditLabel(kind)`: vendor credit "Apply to bills", credit memo "Apply to invoices", invoice "Apply credit"); `DOCUMENT_READ_LABELS.apply_credit` keeps its value for the vendor credit and its other callers.
- Credit memo read view notice (writer, posted, `balance` above zero, the customer has an open invoice), above the band: "Harbor Lane Bakery has 2 open invoices. Apply this credit to lower what they owe." with the button **Apply to invoices**.
- Invoice read view notice (writer, posted, `balance` above zero, the customer has unapplied credit), above the band: "Harbor Lane Bakery has $250.00 of unapplied credit on 2 credit memos." with the button **Apply credit**.
- Invoice read view, second notice line (Q2), when the customer has posted payments with an amount that is not applied (`credited` above zero): "Payment 1004 has $100.00 that is not applied to an invoice. Open the payment and edit it to apply that amount." The payment number is a link to `books/payments/<id>`. At most three payments are named, oldest first; more read "and 2 more payments on the customer's page" (a link to the customer page). This line has no Apply button.
- Sales lists (Credit memos tab and All sales) and the customer page's Transactions tab: the credit memo row menu gains "Apply to invoices" (posted, `balance` above zero, writer), first in the menu. It opens the credit memo and its apply dialog there (the purchase lists' "Apply to bills" path through `useApplyCreditStore`). The invoice row menu does not change (Q4).

### 3.2 The apply dialog, from a credit memo

- Title "Apply credit memo 1001". Core `Dialog` size `xl`, `hasCloseButton={false}`; a Sheet on a phone.
- Body, top to bottom:
  - The figure: label "Unapplied credit", value "$250.00" (the spark: label `text-xs text-muted-foreground`, value `text-2xl font-semibold text-foreground tabular-nums`). The vendor credit's dialog shows its unapplied credit the same way after this unit.
  - **Apply date** (required): core `DateField`, default today, or the credit memo's date when that is later than today. Its calendar stays inside the dialog.
  - `FormErrorSummary` (root errors only, after a submit).
  - The customer's open invoices (posted, `balance` above zero, this customer; a sub-customer's invoices are not listed, Q9). Order: the invoice the memo was made from (`invoice`, "For invoice 1004") first when it is listed, then by due date, then by number.
    - Wide (dialog content at or above the grid's least width): a grid of tick box (44 px fixed) · **Invoice** ("Invoice 1009 · Sep 14, 2026", a link text, not a Tab stop) · **Due date** (`DueText`, "Overdue" in danger tone) · **Open balance** · **Credit to apply** (`PaymentCell`). Every data column is flex with a least width of 95 px, long text ellipsizes, no sideways scroll.
    - Below the grid's least width: cards (tick box and invoice on top, due date, Open balance, the Credit to apply input full width).
  - "Clear" (a link under the list) and the summary line: "Applying $150.00 to 1 invoice · $100.00 stays unapplied".
- The dialog opens with the credit spread over the listed invoices in list order (`spreadAmount`), so ⌘↵ applies it with one key. A tick sets a row to the lesser of its open balance and the credit not yet placed; a second tick clears it; a typed amount above zero ticks the row; ⌥↵ in a cell toggles its row; Enter in a cell moves to the next row's cell, and from the last row to Clear.
- **A part of an invoice**: the user types an amount below the invoice's open balance in its Credit to apply cell (or the credit is smaller than the open balance, and the spread places all of it). The invoice then stays open for the rest.
- Footer: `Dialog.CancelButton` (Esc) and `Dialog.ActionButton` "Apply credit" (⌘↵, `DIALOG_SUBMIT_SHORTCUT`).
- On open, the first Credit to apply cell has focus on web (the shared dialog's first-cell focus, through `initialFocusRef`); nothing takes focus on iOS and Android.
- No open invoice for the customer: the action stays offered and the dialog shows "Harbor Lane Bakery has no open invoices. The credit stays on the customer until you post an invoice or refund it." with the buttons **New invoice** (`books/invoices/new?customer=<id>`) and **Refund credit** (`books/refund-receipts/new?credit_memo=<id>`); Apply credit is disabled. Both buttons close the dialog and push.

### 3.3 The apply dialog, from an invoice

- Title "Apply credit to invoice 1009". The same shared dialog with the other side fixed.
- The figure: label "Open balance", value "$400.00" (the invoice's live `balance`).
- **Apply date**: default today, or the latest credit date of the credit memos the dialog ticks at open when that is later than today. It is set once, at open; a later tick does not change it (the schema's date rule of §3.4 then names the credit memo).
- The list: the customer's posted credit memos with a `balance` above zero, by credit date, then number; a credit memo made from this invoice (`invoice` = this invoice) first. Columns: tick box · **Credit memo** ("Credit memo 1001") · **Credit date** · **Unapplied credit** · **Credit to apply**. No overdue mark. Cards below the grid's least width.
- The dialog opens with credit placed in list order up to the invoice's open balance. A tick sets a row to the lesser of that memo's unapplied credit and the open balance not yet covered.
- Summary line: "Applying $150.00 from 1 credit memo · $250.00 stays due".
- Under the list, the payments line of §3.1 (Q2), when the customer has payments with an amount that is not applied.
- The action is offered only while the customer has unapplied credit, so the dialog has no empty state of its own. When the last credit memo leaves the list while the dialog is open (applied or voided elsewhere), the dialog shows "Harbor Lane Bakery has no unapplied credit." and Apply credit is disabled.

### 3.4 Validation and the write

- One zod schema (`applyCreditSchema`, `lib/apply-credit-schema.ts`, made shared for the three uses: vendor credit → bills, credit memo → invoices, invoice ← credit memos) through `useForm` and `zodResolver`:
  - the Apply date is a real day (`isIsoDay`): "Enter a date";
  - the Apply date is not before the credit date of an applied credit memo: "The apply date can't be before the credit date." (from an invoice, with several memos: "The apply date can't be before the credit date of credit memo 1002, Nov 12, 2026.");
  - the Apply date is after the close date, unless the user holds an unexpired close-date override (the write-off dialog's rule and text, `closedThroughMessage`);
  - each row is a well-formed amount, not below zero, at most the row's own limit, under that cell: from a credit memo "More than the open balance of $400.00"; from an invoice "More than the unapplied credit of $250.00";
  - the sum is at most the fixed side's amount, in `FormErrorSummary`: from a credit memo "More than the unapplied credit of $250.00."; from an invoice "More than the open balance of $400.00.";
  - at least one row is above zero: "Select at least one invoice." / "Select at least one credit memo.".
- **Apply credit** validates, sets the dialog's hold flag (`useApplyCreditStore.hold()`, synchronous, before the mutation) and writes, in one atomic pbtsdb batch through `useMutation` (`atomic`, all or nothing), one `books_credit_memo_applications` row for each row with an amount: `id`, `credit_memo`, `invoice`, `amount`, `date`. No row is inserted and then updated.
- While the write runs the dialog stays open, its fields are disabled and Cancel does nothing.
- Success: the dialog closes; a toast reads "Applied $150.00 to 1 invoice" (from an invoice: "Applied $150.00 from 1 credit memo"); the read view under the dialog stays and its live queries show the new state.
- A refusal keeps the dialog and the typed values: a row's refusal under that row's cell ("Invoice 1009: the credit is more than its open balance of $250.00.", "Invoice 1009 is not open. Clear it to continue.", "Credit memo 1001 has $50.00 of unapplied credit. Clear it or lower the amount."); every other refusal (the date, the close date) in `FormErrorSummary`.
- Loading: three skeleton rows under the date; Apply credit disabled. A failed read shows `DialogLoadError` ("Books could not load the open invoices." / "Books could not load the customer's credits.") with Retry (one `recoverLiveQueries` call over the merged recoveries). Offline: Apply credit is disabled.
- An application posts no journal entry (Q5): the credit memo already credited Accounts receivable and the invoice already debited it, for the same customer. The customer's Open figure does not change at apply time; it changed when the credit memo was posted.

### 3.5 The credit memo, after this unit

- A credit memo's `balance` is its total less its applications and less the posted refund receipts that pay it out. Every screen that reads `balance` follows: the refund payout's cap ("$100.00 unapplied"), Refund credit's offer, the customer's Transactions row.
- `books_credit_memos.applied` holds the cents of its applications (server-written, §4.2), so a list tells Applied from Refunded with no other read (Q7).
- Read view totals, after "Credit amount" (`creditMemoTotalsOf`): **Applied** with a minus sign ("−$150.00", only while `applied` is above zero), **Refunded** (as today), **Unapplied credit** (the stored `balance`).
- Read view badge: Posted (nothing applied or refunded); **Partly applied** (warning; `applied` above zero and `balance` above zero); **Applied** (success; `balance` 0 and `applied` above zero); **Refunded** (success; `balance` 0 and `applied` 0); Void.
- Block **Applied to** (in the kind's `ReadFrame`, above the Refund receipts section; only when an application exists): one row for each application, oldest apply date first — "Invoice 1009 · Nov 16, 2026 · $150.00", the invoice a link — and, for a writer on a posted memo, a **Remove** button on each row (§3.7). A failed read shows the block's notice with Retry.
- **Void of a credit memo that is applied is refused**: "This credit is applied to invoices. Remove it from those invoices first." (checked before the refund receipt text).
- **Credit memo correction** (`?replaces`) with applications: they move to the correction. It is refused when its total is below what is applied and refunded ("$150.00 of this credit is applied to invoices. Its total cannot be below that."; with refunds too: "$230.00 of this credit is applied or refunded. Its total cannot be below that."; the refund-only text stays when nothing is applied), in `FormErrorSummary`; when it changes the customer ("This credit is applied to invoices, so its customer cannot change.", under Customer); or when its date is after the earliest application's apply date ("This credit is applied to invoice 1009 on Nov 16, 2026. Date the credit memo on or before that day.", under the date).
- Statuses elsewhere (`creditMemoStatus`, the Sales lists status and the customer's Transactions tab): Draft; **Unapplied** (warning; `balance` above zero, also when a part is used); **Applied** (success; `balance` 0 and `applied` above zero); **Refunded** (success; `balance` 0 and `applied` 0); Void. The Credit memos tab's chips become All, Unapplied, Applied, Refunded, Draft, Void.

### 3.6 The invoice, after this unit

- An invoice's `balance` is its total less its posted payments' applications, less its credit applications and less its posted write-offs. Every screen that reads `balance` follows: Receive payment's open invoices, Write off's amount (the balance after credits), the customer's Overdue, the Sales lists Balance column, the Paid / Partly paid / Written off badge and status. An invoice that credit covers in full reads **Paid** (Q8).
- Read view totals: after the Payments row and before Written off, a row **Credits applied** with a minus sign ("−$150.00", test id `invoice-total-credits-applied`), only while a credit is applied. It reads the invoice's applications (as the bill's "Credits applied"); the Payments row is the total less the balance, the credits applied and `written_off`, so the rows add up.
- The **Payments** block (`DocumentPayments`) also lists each application ("Credit memo 1001 · Nov 16, 2026 · $150.00", opens the credit memo, with **Remove** for a writer on a posted invoice), in date order with the payments. A failed applications read shows the block's notice with Retry ("Books could not load the credits applied to this invoice.").
- **Void of an invoice a credit is applied to is refused**: "Credit memos are applied to this invoice. Remove them first." (after the write-off check, before the payments check).
- **Invoice correction** with applications: at posting they move to the correction with the payments. It is refused when its total is below payments plus credits ("Payments and credits of $300.00 are applied to this invoice. Its total cannot be below that."; the payments-only text stays when no credit is applied) or when it changes the customer ("Credit memos are applied to this invoice, so its customer cannot change.").
- A written-off invoice has a balance of zero, so nothing is applied to it. Remove of an application on an invoice that also has a posted write-off is allowed: the invoice is open again for that amount and Write off is offered again (as after a payment's void, write-off spec §3.4).

### 3.7 Remove

- **Remove** (writer; on the credit memo's Applied to block and on the invoice's Payments block) opens `RemoveApplicationDialog`: "Remove this credit from Invoice 1009? The invoice's balance goes up by $150.00 and the credit is unapplied again." Confirm deletes the application through `useMutation` (one delete). The server raises both balances, lowers the memo's `applied`, rebuilds both documents' cash-basis rows, and takes the application's two stored receivable rows away (§4.3), all in the delete's transaction.
- Refused when the application's date is on or before the close date and the user holds no unexpired override (the ledger's close-date refusal), shown in the dialog.
- An application is never edited. To change an amount, remove it and apply again.

### 3.8 Elsewhere in Books

- **Receive payment**: above the open invoices, when the chosen customer has posted credit memos with a `balance` above zero, a notice lists each: "Credit memo 1001 · $250.00 unapplied", each a link that opens the credit memo (the Pay Bills credits notice, made shared). Nothing else on Receive payment changes: no credit column, and a payment is still at most the open balance.
- **Sales lists**: the Credit memos tab's status and chips (§3.5), and the row menu item (§3.1). The Invoices tab needs no change (it reads `balance` and `written_off`).
- **Customer page**: the credit memo row's status (§3.5) and its row menu item. Open does not change at apply time. Overdue falls when a credit pays an overdue invoice (it sums invoice balances). No new transaction kind: an application is no transaction (Q10).
- **Refund receipt payout**: its cap and its "unapplied" text read the memo's `balance`, so a memo that is partly applied pays out only what is left; no code change besides the texts' tests.
- **Write off**: the dialog's amount is the invoice's balance after credits; no change.
- **Journal Entries, registers, General Ledger, Journal, Trial Balance, Profit and Loss, Balance Sheet (Accrual), Customer Balance, Sales by Customer / Product, Sales Tax Liability (Accrual)**: unchanged; an application posts nothing.
- **A/R Aging** (p5-ar-aging; Q16): an application counts against its invoice's item from the apply date, and the credit memo's item is its unapplied rest from that date. On an As of day before the apply date both items read whole (the invoice's full open amount, the credit memo's full total as a negative figure); from the apply date on, the invoice's item is lower by the amount and the credit memo's item is "−(total less applied)". An invoice that credit covers in full, and a credit memo that is applied in full, leave the report from the apply date (their `settled` day). The report's Total and each customer's Total do not change at apply time: they still equal the Balance Sheet's Accounts receivable figure and the Customer Balance for every As of day. An opened customer shows the application under the invoice's item; a press on it opens the credit memo. Remove puts both items back. An open report re-runs after Apply and after Remove (the table's change signal).
- **Cash basis** (Q11): an application counts as a payment of the invoice at the apply date. It brings back that share of the invoice's deferred lines (memo "Invoice 1009 paid by credit memo (cash basis)") and of its cash tax rows, and that share of the credit memo's deferred lines (memo "Credit memo 1001 applied (cash basis)") and of its cash tax rows, by the share rule of the other payers (amount ÷ total, cumulative, largest remainder). The rows read the credit memo's entry number. So on the Cash method an applied credit shows the sale less the credit, and the sales tax less the credit's tax, on the apply date. An unapplied credit memo still changes no cash figure. Remove takes the rows away again.
- **Audit log**: `books_credit_memo_applications`, label "Credit memo 1001: Invoice 1009"; a create reads "Credit applied", a delete "Credit removed"; history opens the credit memo.
- **Search, Settings → Numbering, the report builder**: nothing; an application has no number and is no report source.
- **Help**: new `help/apply-credit.md` (id `books:apply-credit`; task-led: use a credit memo on an invoice, from the memo and from the invoice; pay a part of an invoice; lower one invoice by a part of its amount (Create credit memo, then Apply to invoices); the apply date; Remove; why an applied memo or invoice cannot be voided; a payment amount that is not applied (edit the payment); cash basis in one paragraph; the keys with Mac glyphs: A, ⌘↵, ⌥↵, Esc). `help/credit-memos.md` gains Apply to invoices (A), the Applied row, badge and block, the void and correction rules; `help/invoices.md` gains Apply credit (A), Credits applied and the Payments block rows; `help/receive-payment.md`, `help/sales-lists.md`, `help/customer-pages.md`, `help/write-offs.md` and `help/refund-receipts.md` gain one paragraph each; `help/reports.md` gains one paragraph in "Read the A/R Aging report" (an applied credit lowers the invoice's item from the apply date; the credit memo shows only its unapplied rest). `HelpIcon topic="books:apply-credit"` stands beside the dialog's figure.

## 4. Data

### 4.1 New collection (migration `<next free number>_create_books_credit_memo_applications.js`)

The migration takes the next free number when the plan is written (Q15): the plan lists `pb-migrations/` on the step branch, after p4-match and p5-ar-aging are merged into it (p5-ar-aging takes `2100000028` for `books_receivable_items`; p4-match adds a migration of its own), and names the number then. The audit-log view stays the last migration: `…_create_books_audit_log.js` is renamed to the number after this unit's. Its `LINES` list gains `['books_credit_memo_applications', 'books_credit_memos', 'credit_memo']`.

- `books_credit_memo_applications` (the shape of `books_vendor_credit_applications`): `credit_memo` (relation books_credit_memos, required, not cascade), `invoice` (relation books_invoices, required, not cascade), `amount` (number onlyInt, min 1, max 2^53−1, required), `date` (text day, required), `applied_by` (relation users, server), `close_override` (relation, server), `created`.
- Rules: list and view for a Books reader; create for a Books writer with `applied_by` and `close_override` unset; no update rule; delete for a Books writer. The guards (§4.3) run on create and delete.
- Indexes: (`credit_memo`), (`invoice`).

### 4.2 Edited migrations (in place; Books is unreleased)

- 2100000022: `books_credit_memos` gains `applied` (number onlyInt min 0; server-written; among the fields a client may not set).

### 4.3 Server (Go, `books/server/`)

- `credit_applications.go` (new, shared): `applicationKind` — the applications collection, the credit field and its `balanceKind`, the document field and its `balanceKind`, the party field (`vendor` / `customer`), the stored-sum field of the credit (`""` / `applied`), and the refusal texts. `checkApplicationCreate`, `checkApplicationDate`, `checkApplicationUpdate`, `checkApplicationDelete`, `shiftApplicationBalances` and the three hooks of `registerVendorCreditApplications` move here and take the kind. `vendor_credit_applications.go` keeps `vendorCreditApplicationKind` and its texts; its behavior and its tests do not change.
- `credit_memo_applications.go` (new): `creditMemoApplicationsCollection`, `creditMemoApplicationKind`, its texts, and `registerCreditMemoApplications(app)` (in `register.go` and in `TestRegister_BindsEachPartOnce`'s list). Every guard runs inside `serialized`.
- Create guard, in this order: the credit memo is posted ("Only a posted credit memo is applied to invoices.", keyed `credit_memo`); the invoice is posted, has a `balance` above zero and is of the memo's customer ("Invoice 1009 is not open. Clear it to continue.", keyed `invoice`); the amount is at most the invoice's `balance` ("Invoice 1009: the credit is more than its open balance of $250.00.", keyed `invoice`) and at most the memo's `balance` ("Credit memo 1001 has $50.00 of unapplied credit. Clear it or lower the amount.", keyed `credit_memo`), both re-read; the date is a real day, not before the memo's date ("The apply date can't be before the credit date."), and after the close date unless the applier holds an unexpired override (it stamps `close_override`). An inactive customer does not block an application.
- After the row is saved, in the same transaction (the then-step of `bindSerializedGuardThen`, as the write-off's): lower the memo's and the invoice's `balance` (`saveDocumentBalance`), raise the memo's `applied` in the same save, rebuild the cash-basis rows of both (`rebuildCashBasisOf`), and refresh the stored receivable rows (next bullet).
- **Stored receivable rows** (`books_receivable_items`, p5-ar-aging; Q16). The contract of `server/receivable_refresh.go` holds for every write of an application: the rows are refreshed inside the transaction of the write (`refreshReceivables` refuses a call outside one), and the Go tests call `requireNoDrift` (it runs `verifyReceivables`) after each write.
  - A third row query, `receivableCreditApplicationsSQL` (in `server/receivable_items.go`, beside `receivableLinesSQL` and `receivableApplicationsSQL`), gives two rows for each application of a posted credit memo, both `source = 'application'`, both dated the application's `date`, with the credit memo's `customer`, `currency` and `entry` (so a press opens the credit memo): a **credit** of the amount on the invoice's item (`item` the invoice id, `item_kind` `invoice`, the invoice's number, sequence and due date; `id` the application's id), and a **debit** of the amount on the credit memo's item (`item` the credit memo id, `item_kind` `credit_memo`, the memo's number and sequence, `due_date` the memo's date; `id` a second id derived from the application's id, 15 characters, the same on every run). The credit memo's own Accounts receivable line row keeps its full credit at the memo's date. The two rows add to zero, so the figures tie on every As of day; the memo's item is settled on the day its applications reach its total. A refund receipt's line stays what p5-ar-aging made it (this unit does not change which item it belongs to).
  - `verifyReceivables` and `rebuildReceivables` read the three queries.
  - `refreshReceivableCreditMemo(tx, memo)` (new, the shape of `refreshReceivablePayment`): `refreshReceivables` with the stale condition `entry = {:entry}` and the parts "lines of the memo's entry" (the part of `refreshReceivableEntry`) and "applications of the memo". A memo with no entry has no row. It runs: in the then-step of an application's create; in the delete of an application, inside its `serialized` transaction after the row is gone; after each update of an application (a correction's move; `bindReceivableRefresh` on `books_credit_memo_applications`, for the memo the row now names); and after each update of a credit memo (`bindReceivableRefresh` on `books_credit_memos`: its post, and its replacement by a correction).
  - `refreshReceivableInvoice` gains the part "credit applications that name the invoice" (the invoice-side rows; its stale condition `item = {:invoice} AND source = 'application'` already matches them), so an invoice correction that takes the applications writes their rows with the correction's number and due date.
  - An application has no entry of its own, so `refreshReceivableEntry` alone stores nothing for it; the entry refresh that p5-ar-aging binds on `books_journal_entries` still stores the memo's and the invoice's line rows.
- Update: refused ("A credit application is not changed. Remove it and apply the credit again."), except a correction's move of the row (`markMovingApplications`) and PocketBase clearing `applied_by` of a deleted user.
- Delete: refused on or before the close date without an override (the request hook checks with the request's user); else it raises both balances, lowers `applied`, and rebuilds both documents' cash rows.
- `document_balance.go`: `invoiceBalanceKind.Payers` gains `{LinesCollection: creditMemoApplicationsCollection, LineField: "invoice", EntryField: "credit_memo", EntryCollection: "books_credit_memos", CashMemo: "Invoice %s paid by credit memo (cash basis)"}`; `creditMemoBalanceKind.Payers` gains `{LinesCollection: creditMemoApplicationsCollection, LineField: "credit_memo", EntryField: "credit_memo", EntryCollection: "books_credit_memos"}` (its rows take the deferral's `PaidMemo`, "Credit memo %s applied (cash basis)"). `paymentPayer()` still returns each kind's payment payer. The verify and the rebuild follow through `appliedSQL`; they also compare each credit memo's `applied` with the sum of its applications and repair it (the `written_off` drift made a list of stored sums).
- `invoices.go`: `checkInvoiceVoid` refuses while an application names the invoice (§3.6 text), after `refuseWrittenOff`. `moveInvoicePayments` counts payments and credits apart (as `billAppliedTo`) for the two "below" texts and the two customer texts; `moveUnvoidedLines` already moves an application payer's rows.
- `credit_memos.go`: `CheckVoid` refuses an applied memo before the refunded check; `replaceCreditMemo` adds the applied sum to its total check, refuses a customer change and a date after the earliest application (§3.5 texts), and `movePostedLines` moves the applications with the payout rows. The credit memo guard treats `applied` as a server field; the balancing mark lets Books write it on a posted memo.
- `cash_basis.go`, `cash_basis_tax.go`: no new code path. `documentPayments` reads the two new application payers through `applicationsOf`; the plan confirms with tests that the invoice's and the memo's cash tax rows take the application's share.
- Registrations: audit (`books_credit_memo_applications`, label and the create / delete words), OAuth (read and write `books_credit_memo_applications`). No search source, no quota, no report source.
- Go tests: each refusal of the create in its order; the balances and `applied` at create and delete; a part of an invoice (the invoice stays open for the rest); two memos on one invoice and one memo on two invoices; the update refusal and the correction move from both sides; the delete in a closed period with and without an override; the invoice's and the memo's void refusals; the correction refusals (total, customer, date); the refund payout cap after an application; a write-off after an application takes the rest, and a Remove after a write-off reopens the invoice; the balance verify and rebuild with `applied`; the cash rows and cash tax rows of both documents at the apply date and after Remove; the vendor credit application tests unchanged and green. Each test that writes an application (create, Remove, a correction of the invoice and of the credit memo that moves applications) ends with `requireNoDrift`. Stored receivable rows and the A/R Aging (`server/receivable_refresh_test.go`, `server/report_ar_aging_test.go`): the two rows of an application after a create, with no rebuild; no row after Remove; the rows after each correction; `settled` of an invoice paid in full by credit, of one paid by a payment and a credit, and of a credit memo applied in full; an aging run on a day before the apply date (both items whole) and on the apply date (the invoice lower, the memo's unapplied rest); a memo partly applied and partly refunded (the customer's Total still ties); the customer Totals compared with `books_party_balances` and the Total with a Balance Sheet run, before and after the apply date; verify finds a missing application row and the rebuild repairs it.

### 4.4 Client

- `collections.ts` registers `books_credit_memo_applications` (`onDemand`).
- Shared parts (each replaces a vendor-only part; the vendor credit's screens use them with the vendor kind and keep their test ids and texts):
  - `lib/credit-application-kinds.ts`: `CreditApplicationKind` (`VENDOR_CREDIT_APPLICATION`, `CREDIT_MEMO_APPLICATION`): the applications collection, the credit and document fields, the nouns, the texts, the outstanding descriptors, the routes of the empty state's buttons.
  - `lib/apply-credit-schema.ts`, `hooks/useApplyCredit.ts`, `components/documents/ApplyCreditDialog.tsx`: take the kind and the fixed side (`from: 'credit' | 'document'`).
  - `hooks/useCreditApplications.ts`, `hooks/useRemoveApplication.ts`, `components/documents/DocumentApplications.tsx` (`APPLICATION_TARGETS` gains `invoice` and `credit_memo`), `components/documents/DocumentPayments.tsx`: take the kind.
  - `components/documents/CreditApplySection.tsx` (from `VendorCreditApplySection.tsx`): the `ReadFrame` of both credit kinds; `CreditMemoReadFrame` and `VendorCreditReadFrame` are its two uses. `InvoiceApplyFrame` is the invoice's `ReadFrame` (the notices and the dialog slot).
  - `lib/outstanding-documents.ts`: descriptors `MEMO_INVOICES_OUTSTANDING` (invoices under a credit memo) and `INVOICE_CREDITS_OUTSTANDING` (credit memos under an invoice: "Credit date", "Unapplied credit", no overdue mark), both with no total column and no header tick box; `lib/payment-columns.ts` reuses `CREDIT_APPLY_COLUMNS`.
  - `components/documents/UnappliedCreditsNotice.tsx` (from `components/pay-bills/PayBillsCreditsNotice.tsx`): Pay Bills and Receive payment use it.
- Reads (each `useLiveQuery` with `{ query, queryKey }`; row types derive from the queries):
  - the dialog from a credit memo: the customer's open invoices (`useOutstandingInvoices`, the Receive payment read) and settings (close date) and the user's close-date override (the write-off dialog's read);
  - the dialog from an invoice: the customer's credit memos with `status = 'posted'` and `balance > 0` (`useUnappliedCreditMemos`, by date then sequence; the index (customer, status, balance) exists);
  - the invoice read view: the same credit memos read (for the offer and the notice), the invoice's applications, and the customer's posted payments with `credited > 0` (`useUnappliedPayments`, by date, `limit 4`);
  - the credit memo read view: its applications, and the customer's open invoices count for the notice (only for a writer on a posted memo);
  - Receive payment: `useUnappliedCreditMemos` for the chosen customer.
- Writes: `useMutation` (`@tinycld/core/lib/mutations`): Apply is ONE `atomic` batch of inserts; Remove is ONE delete.
- `CREDIT_MEMO_DATA` reads `applied`; the credit memo's `kindFields` gain it; `creditMemoRow`, `creditMemoStatus` and the Sales lists' chip fields gain it.

### 4.5 Seed and fixture

- `lib/apply-credit-fixture.ts` (typed with `satisfies` against the generated types): a credit memo applied in part to the invoice it was made from (the invoice stays open), a credit memo applied in full over two invoices, an invoice paid by a payment, a credit and a write-off together, a credit memo partly applied and partly refunded, a customer with unapplied credit and a payment that is not fully applied, long document numbers and large amounts.
- `seed.ts` posts, through the dialog's writes: one new invoice and one new credit memo of a seeded customer, and one application of a part of the memo to that invoice, dated after mid-2026 on days no General Ledger, Journal, Trial Balance, Profit and Loss, Balance Sheet, Customer Balance, Sales Tax Liability or sales report spec reads. The plan greps every test that reads the customer's Open and Overdue figures, the invoice and credit memo counts and statuses, account 1100, the Sales Tax Liability cash rows and the A/R Aging figures (p5-ar-aging's seed block and `tests/e2e/books-ar-aging.spec.ts`) before it picks the customer and the days. The rows are their own block in `seed.ts`, after the blocks of p4-match and p5-ar-aging.

### 4.6 E2E on the shared e2e DB

Specs create their own invoice and credit memo through the UI with a unique memo and open them through Books search. They cover: apply from the credit memo with one key; a part of an invoice by a typed amount; apply from the invoice; Remove; the void refusals; the vendor credit's apply specs unchanged. One phone run (390 × 844) covers the Sheet, the cards, More → Apply credit and the blocks as stacked rows; it runs because the phone path draws different components. No spec changes a Books setting. No spec posts before mid-2026.

### 4.7 Build order

- p4-match merges first (Q18). It shares `collections.ts`, `types.ts`, `seed.ts`, `server/register.go`, `server/audit.go` and `server/registrations_test.go` with this unit.
- p5-ar-aging (books PR #77, branch `books/p5-ar-aging`) merges first (Q19). It shares `server/register.go`, `server/registrations_test.go`, `seed.ts` and `help/reports.md`, and this unit builds on its `books_receivable_items`, `server/receivable_items.go` and `server/receivable_refresh.go` (§4.3).
- The plan is written from the step branch with both merged in: it reads those files there, and adds this unit's parts beside theirs.

## 5. Cut

- The "$0.00 received" payment as the carrier of an applied credit, and the Amount received, Payment method, Reference no. and Deposit to fields with it — an application is its own record. This is the fix of the design rule.
- A page with the customer's invoices and credits in two lists (direction B of the packet) — the dialog on each document covers it with the pairing in view.
- A Credits section on Receive payment with amount cells — the notice with links replaces it (receive-payment spec §5 gave it to this unit; Q12).
- The find-by-number fields and the Filter of each list — a customer's open invoices and credits are short lists in a fixed order.
- The column settings gear.
- A memo on an application — the credit memo and the invoice have their memos.
- Print of an application.
- The Original amount column in the dialog — the read views show it; the dialog shows what is open.
- Applying the amount of a received payment that is not applied (Q2) — the payment's Edit already applies it; the invoice names such payments with a link.
- An "Apply credit" row in the invoice row menu of the Sales lists (Q4), and a + New entry (Q3).
- An application as a transaction kind on the customer page (Q10).

## 6. Platform notes

- Keyboard shortcuts (A, ⌘↵, ⌥↵, Enter, Esc): web, and iOS with a hardware keyboard; Android has none; every action keeps a visible button, a More row or a tick box. Standing approval for all Books forms (human, 2026-11-11).
- Focus on the first Credit to apply cell when the dialog opens: web only. Standing approval (human, 2026-11-11).
- No new platform-only item.

## 7. Sparks carried

- The amount that the action moves is the figure the eye finds first: "Unapplied credit" / "Open balance" at the top of the apply dialog, value `text-2xl font-semibold text-foreground tabular-nums` under a `text-xs text-muted-foreground` label (the write-off dialog's figure). The vendor credit's dialog takes the same figure, because the dialog is one component.
- No core extension.

## 8. Non-goals

- No journal entry, no number and no page for an application.
- No change to the customer's Open figure at apply time, to `books_party_balances`, or to any Accrual report.
- No credit of one customer on another customer's invoice, a parent's and a sub-customer's included (Q9).
- No change to what a received payment's amount that is not applied does; no new application rows on a posted payment.
- No automatic application: posting a credit memo made from an invoice applies nothing until the user presses Apply (the dialog pre-fills that invoice).
- No change to the vendor credit's behavior, texts or test ids besides the dialog's figure.
- No statement (p2-statements reads `books_credit_memo_applications`: `credit_memo`, `invoice`, `amount`, `date`).
- No change to the A/R Aging report's columns, levels, parameters or spec, and no new report source field: this unit adds only the application rows to `books_receivable_items` (Q16).
- No multi-currency. No new data endpoint. No forms host.

## 9. Decisions (design gate, human, 2026-11-19)

The packet states Q1–Q17 with a recommended answer each. The human picked direction A and accepted every recommended answer, with the updates marked below, and added Q18 and Q19.

Q1 direction A (a dialog on each document); Q2 credit memos only, a payment amount that is not applied is named with a link; Q3 no + New entry and no page; Q4 no invoice row-menu item; Q5 no journal entry; Q6 Remove deletes the application, no edit; Q7 the stored `applied` field and the Applied status and chip; Q8 the invoice reads Paid / Partly paid; Q9 the same customer only; Q10 no transaction kind on the customer page; Q11 cash basis; Q12 the notice on Receive payment; Q13 the apply date rules; Q14 void and correction rules of both documents; Q17 the seed.

- Q15 (updated): the migration number is the next free number when the plan is written; the audit-log view stays the last migration (§4.1).
- Q16 (updated): this unit builds on p5-ar-aging. Every write of an application (create, Remove, and a correction that moves applications) refreshes `books_receivable_items` in the same transaction, and the Go tests call `requireNoDrift`; the aging counts an application against its invoice's item and the credit memo's unapplied rest as a credit (§3.8, §4.3).
- Q18 (new): p4-match merges first (§4.7).
- Q19 (new): p5-ar-aging merges first (§4.7).

## 10. Engine reach (self-review)

- Dialog: core `Dialog`, `Dialog.Body`, `Dialog.Footer`, `Dialog.CancelButton`, `Dialog.ActionButton` with `shortcut={DIALOG_SUBMIT_SHORTCUT}`, `initialFocusRef` (`@tinycld/core/ui/dialog`); a Sheet on a phone is the Dialog's own presentation.
- Fields: core `DateField` (`@tinycld/core/ui/forms/fields/DateField`), `FormErrorSummary`, `useForm`, `useWatch`, `zodResolver`, `z` (`@tinycld/core/ui/form`); Books `PaymentCell`, `OutstandingGrid`, `OutstandingCards`, `ClearLink`. The dialog is a plain zod form, not a forms-engine host: each rule is in `applyCreditSchema` and shows under its field or in the summary. No `FormHostUi.schemas` path is needed.
- Width: core `useContainerWidth` (`@tinycld/core/ui/forms/use-container-width`) picks grid or cards from the grid's own least width.
- Keys: core `ShortcutButton` (`@tinycld/core/ui/shortcut-button`), `useShortcutScope`, `useRegisterShortcuts` (`@tinycld/core/lib/shortcuts`; the ⌥↵ row key in the dialog's modal scope).
- Writes: `useMutation` and `atomic` (`@tinycld/core/lib/mutations`): one atomic batch of inserts (no insert-then-update of a row); one delete for Remove. Refusals: `extractValidationErrors`, `handleMutationErrorsWithForm` (`@tinycld/core/lib/errors`); Books `refusedRecordId` names the refused row of the batch. Toast: core `useToastStore`. Offline: core `useWritesAvailable`.
- Reads and recovery: `useLiveQuery` with `queryKey`, `materialize()`, `recoverLiveQueries` (`@tinycld/core/lib/recover-live-queries`), Books `mergeRecoveries`.
- Server: `bindSerializedGuardThen`, `serializedRequest`, `saveDocumentBalance`, `balancePayer` (no new field), `rebuildCashBasisOf`, `closeOverrideFor`; core `audit` and `oauth` registries. Stored receivable rows: `refreshReceivables`, `receivablePart`, `refreshReceivableEntry`, `refreshReceivableInvoice`, `bindReceivableRefresh`, `verifyReceivables`, `rebuildReceivables` and the test helper `requireNoDrift` (`server/receivable_refresh.go`, `server/receivable_items.go`, `server/env_test.go` on `origin/books/p5-ar-aging`; read there 2026-11-19; on the step branch after that unit merges, §4.7); the table's change signal is `changesignal.Touch` inside `refreshReceivables`.
- No bullet needs a core API that does not exist. No core change.
