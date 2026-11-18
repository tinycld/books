# Vendor credit form — design (draft for the design gate)

Unit p3-vendor-credit · package books · feature `vendor-credit-form`. Regenerated 2026-11-17 against books main@70207674 (p2-credit-memo merged, PR #62), core main@87ed80f9. Decided by the human on 2026-11-16: direction A and Q1–Q19 as recommended; they are statements here, not questions. §10 lists what the regeneration changed and the four new questions (Q20–Q23), each written here as its recommended answer. Spec sources: `docs/superpowers/specs/2026-10-21-books-design.md` §Interface, §Forms (also §Scope "Vendor Credit", §Ledger rules, §Audience and basis). Contracts: `docs/specs/bill-form-design.md` (p3-bill) and `docs/specs/expense-form-design.md` (p3-expense): every form behavior this spec does not restate is the bill's, with "bill" read as "vendor credit"; `docs/specs/pay-bills-design.md` (p3-pay-bills), whose Cut hands "Credit applied" to this unit. "Q<n>" points to the packet's question; each statement below is the recommended answer.

## 1. Goal
A writer records a credit a vendor gave — vendor, date, the vendor's credit number, lines that credit expense accounts or return products — saves it as a draft and posts it, which debits Accounts payable and credits each line's account; then applies the posted credit to that vendor's open bills, which lowers each bill's balance and what Pay Bills asks for.

## 2. Where it lives
- Routes: `/a/books/vendor-credits/new` (query `?vendor=<id>`, `?copy=<id>`, `?replaces=<id>`, `?fresh=`), `/a/books/vendor-credits/[id]`. Screens `screens/vendor-credits/new.tsx`, `screens/vendor-credits/[id].tsx`, each a `DocumentScreen` of the new kind `VENDOR_CREDIT_DOCUMENT`. Both are pushed pages; `hidesNewFab` gains `vendor-credits`.
- A draft opens in the form; a posted or void vendor credit opens in the read view.
- + New menu → Vendors column → "Vendor credit", after "Expense" (`lib/shell-nav.ts`, id `vendor_credit`).
- Books search finds vendor credits (kind `vendor_credit`, drafts included).
- Journal Entries list, account registers, General Ledger, report drills and the entry view open a vendor credit's entry at `books/vendor-credits/<id>` (`server/entry_routes.json` row `"vendor_credit": "vendor-credits"`).
- Applying: a dialog on the vendor credit read view (§3.9). The bill read view and Pay Bills show the result (§3.10).
- No list screen and no sidebar entry (p3-purchase-lists), no vendor page link (p3-vendor-pages).

## 3. Behavior

### 3.1 Shared layer (Q2)
- The vendor credit is one more kind of the shared document layer (`SalesDocumentKind` / `DocumentKind`, `components/documents/*`, `hooks/useDocument*`, Go `salesDocKind`): party `vendor` (required), the two purchase line tables (`PURCHASE_LINE_TABLES`, `PURCHASE_LINE_SPECS`, `PurchaseReadLines`), features `{ tax: false, message: false, email: false, pdf: false, partyAddress: false, attachments: true }`, lifecycle `posting`, `keepsEmptyLinesOnRefusal: true`, and posting side debit = Accounts payable, credit = the lines. On the server it is a `Credit` kind, the switch p2-credit-memo added to `salesDocKind`: the mirror of a bill, as the credit memo is the mirror of an invoice.
- The invoice, sales receipt, estimate, bill and expense behave exactly as before and their unit and e2e tests stay green. No vendor credit file copies a bill or expense file: where their code names `BILL_*` or `EXPENSE_*` for something the vendor credit shares, it is renamed to a purchase name or takes the kind as a parameter (lessons 9, 41).

### 3.2 Keyboard (speed first)
- On new, draft, correction and copy the Vendor picker has focus (web, every width). Vendor, Account and Product are Books `SearchPicker`s and open by typing (web); native opens every picker by tap.
- Tab order: Vendor → Credit date → Vendor's credit no. → custom fields → account line 1 (Account → Description → Amount → row menu) → … → "Add account line" → product line 1 (Product → Description → Qty → Rate → row menu) → … → "Add product line" → Memo → Attachments → action bar. A table that is not shown (§3.8) has no Tab stops. Picking a vendor moves focus to Credit date.
- Enter in Amount of the last account line adds an account line and focuses its Account picker; Enter in Rate of the last product line adds a product line and focuses its Product picker (core `addOnSubmit`; the native return key the same). A numeric cell selects its whole value on focus.
- Keys, ⇧? group "Vendor credit": Post ⌘↵, Post & new ⌘⇧↵, Save draft ⌘S, Cancel Esc, Delete draft ⌘⌫ (`FORM_KEYS`). ⇧? group "Lines": Add account line ⌥↵ and Add product line ⌥P (each registered only while its table shows) and the core row keys on the focused line. Read view: Edit E, Void V, Copy C, View journal entry J, Apply to bills A (registered only while the action is offered).
- Every action button that has a key is a core `ShortcutButton` with `scopeOwner` from the screen's `useShortcutScope`; in the apply dialog, `Dialog.ActionButton` with `DIALOG_SUBMIT_SHORTCUT`.

### 3.3 Header band
Built-ins of the forms host `books:vendor_credit`, drawn by Books components in the band, one row (`bandSplitAt: null`), thirds on a wide form, full width stacked in Tab order under 640 px:
- **Vendor** (required, locked; active vendors; `VendorField`).
- **Credit date** (required, locked, default today; `DocumentDateField`, label "Credit date"; built-in `date`).
- **Vendor's credit no.** (optional text ≤ 40, hint "The number on the vendor's credit note"; `VendorRefField`; built-in `ref_no`).
- Custom fields follow Vendor's credit no.
- Picking a vendor fills nothing in the band. When the Account details table shows and its first line has no account, the pick puts the vendor's default expense account on that line, only when the Account picker lists it, as the bill does.
- Title: "New vendor credit", "Draft vendor credit", "Edit 1002" (a correction), "Vendor credit 1002" (read view), with the status badge (§3.7). The big figure top right is **Credit amount** (= Total on every view), "—" while invalid, "Too large" over the stored-amount limit. `HelpIcon topic="books:vendor-credits"`.
- No tabs: a vendor credit has no PDF and no email view.

### 3.4 Lines
- The bill's two tables, in its order and with its columns, cells, row menu, bounds and phone cards: **Account details** (`account_lines`; Account = active `expense`, `other_expense` or `cost_of_goods_sold` accounts; Description; Amount typed, may be negative, not 0) and **Product and service details** (`item_lines`; active Service or Non-inventory products with "I purchase this" on; Description; Qty > 0; Rate ≥ 0; Amount = Qty × Rate, server-written). Picking a product fills Description with its purchase description and Rate with its cost while the cell is empty.
- Amounts are typed as positive numbers: a line of 50.00 is $50.00 of credit. A negative account line lowers the credit (Q6).
- Starting lines of a new vendor credit follow the Purchase lines setting as the bill's (§3.8).
- No description, subtotal or percent rows, no drag grip, no "Clear all lines", no collapsible sections.
- An empty trailing line of either table is dropped at save; a save the client refuses puts it back.
- At most 250 lines in the two tables together ("A vendor credit holds at most 250 lines.").
- Wide (lines container ≥ 640 px): a grid per table with the Amount column at one shared width so the totals align. Below that: each line is a card.

### 3.5 Footer and totals
- Left: **Memo** (textarea ≤ 4000, hint "Only your team sees this. Saved as the journal entry memo."), then the **Attachments** section of the shared layer (Q8), as on the bill.
- Right, under Amount: **Account lines** and **Products and services** subtotals (each only when its table has a line with an amount), then **Total** (`border-t`, `font-semibold`). On the form no row follows Total. On the read view of a posted credit two rows follow: **Applied** (with a minus sign; only when an application exists) and **Unapplied credit** (the stored `balance`).
- Total ≥ 0 at every save ("A vendor credit total cannot be below zero. Use a bill."), ≤ the stored-amount limit ("The vendor credit total is more than Books can store."); Post refuses a zero total ("A vendor credit total must be more than zero to post.").

### 3.6 Saving and posting
- Validation: one zod schema for the kind through the forms engine (`FormHostUi.schemas`) and `zodResolver`; Post adds the bill's line-count rule with the same texts by the shown tables.
- Action bar, sticky: the shared `DocumentActionBar` in the bill's order: wide — Cancel, Save draft, Post (primary), Post & new, More (Delete draft, on saved drafts); phone — Cancel, Save draft, Post, More (Post & new, Delete draft).
- Save writes through `useMutation`: insert/update the `books_vendor_credits` row, then the line plan of each shown table (one `books_vendor_credit_lines` collection, `kind` account/item), then for Post `status: 'posted'`. The form is held through the write by the document save store. A post refused after the draft was written leaves the draft and shows the refusal.
- Revision conflict as the bill, with "vendor credit" words: "This vendor credit changed after you opened it. Load it again, then review it before you save or post." and the notice action **Load the current vendor credit**.
- After Post: replace with `books/vendor-credits/<id>` (read view). Post & new: replace with a fresh `books/vendor-credits/new` (keeps `?vendor` only when opened with it). Save draft stays at `books/vendor-credits/<id>`.
- Cancel with edits opens the discard dialog; Delete draft opens "Delete this draft vendor credit? This can't be undone."
- Every save refuses an account line whose account is not an expense type (the bill's text with "Account line n") and a Vendor's credit no. over 40 characters.
- Duplicate vendor's credit no. (Q3): a save is refused, under the field, when another non-void vendor credit of the same vendor has the same number (trimmed, exact): "Pacific Power already has credit no. CM-8841 (Vendor credit 1002)." A draft without a number is named "a draft vendor credit". An empty number never clashes. A correction does not clash with the credit it replaces.
- Post refuses an inactive vendor ("<Vendor> is inactive. Choose an active vendor."; a correction keeps its original's), an inactive account or product on a line, a product without "I purchase this", a product whose expense account is inactive (the bill's line texts), and a credit date on or before the close date (the ledger's refusal).
- Refusals: "Account line n: …" / "Product line n: …" under that row; Vendor, Credit date, Vendor's credit no. under their fields; the rest in `FormErrorSummary`, with PocketBase's final period.
- The server does not read the Purchase lines setting.
- Writers only (bookkeeper or admin). Without write access, `books/vendor-credits/new` shows "You need bookkeeper access to create vendor credits".
- **Posting (server)**, in one transaction (`serialized`, through `postDocument`): allocate the number from the `vendor_credit` sequence; create the journal entry (`doc_type vendor_credit`, `origin document`, `document = credit.id`, `date` = credit date, `memo`) with one debit to Accounts payable for the total and one credit per account (account lines' accounts and product lines' product expense accounts, summed per account, chart order, a negative sum a debit); every line names the vendor in `vendor`. Post it through `postEntry`. Set `entry`, `number`, `posted_by`, `posted_at`, and `balance` = total less the applications a correction took over.
- Accounts payable is the first active `accounts_payable` account in chart order; a chart with none gets one inside the posting transaction (`ensurePayables`).

### 3.7 Read view (posted or void)
- `DocumentReadView` with: Vendor, Credit date, Vendor's credit no.; each line table that has lines, read-only, whatever the Purchase lines setting; totals (§3.5); memo; attachments; "Posted by <name>, <date time>"; "Voided by …"; "Replaced by 1002 (edited)".
- Badge: Draft; Posted (nothing applied); **Partly applied** (warning tone; 0 < balance < total); **Applied** (success tone; balance 0); Void. The `document-lifecycle` rule that gives a bill Paid / Partly paid, with these labels for this kind.
- **Applied to** block (only when an application exists): one row per application — "Bill 1003 · Nov 16, 2026 · $30.00", the bill a link — and, for a writer on a posted credit, a **Remove** button per row (§3.9).
- Notice (writer, posted, `balance` > 0, the vendor has an open bill): "Pacific Power has 2 open bills. Apply this credit to lower what you pay." with the button **Apply to bills** (the same action as the read action).
- Actions (writer, posted): **Apply to bills** (A; only while `balance` > 0), **Edit** (E; `?replaces=<id>`, a correction that keeps the number), **Void** (V; "A reversing entry is posted in the original period. The number is kept."), **Copy** (C; `?copy=<id>`: vendor, lines of both tables, memo; today's credit date, empty Vendor's credit no., no attachments), **View journal entry** (J). Writer on a void credit: Copy, View journal entry. Reader: View journal entry only. On a phone the actions that do not fit sit in More; Apply to bills stays visible.
- States: loading, load error with Retry for each failing read (merged recoveries; the settings, applications and open-bills reads included), not found ("This vendor credit does not exist"), `?replaces` of a credit that is not posted ("This vendor credit cannot be edited"), no write access on `/new`. Offline: the bar's and the dialog's buttons disable while writes are unavailable.

### 3.8 Purchase lines setting (decided by the human 2026-11-13)
- `books_settings.purchase_lines` decides the vendor credit form's tables exactly as the bill's: a table shows when the setting includes it, or when the credit the form opens with already has a line in it; once shown in a form session it stays shown.
- The setting's words change to name all three forms: Settings → Purchases card **Bills, expenses and vendor credits**; note "Which line tables new bills, expenses and vendor credits show. A form still shows a table its record already has lines in." The select's label ("Purchase lines"), its options and the section-list line do not change. `help/bills.md`, `help/expenses.md`, `help/settings.md` and the books-settings e2e spec change with the words.

### 3.9 Apply to bills (Q1, Q11, Q12)
- **Apply to bills** opens a core `Dialog` (a Sheet on a phone), title "Apply vendor credit 1002":
  - A line "Unapplied credit $50.00".
  - **Apply date** (core `DateField`, required, default today; a real day, not before the credit date — "The apply date can't be before the credit date." — and after the close date; its calendar stays inside the dialog, lesson 2).
  - The vendor's open bills (posted, `balance` > 0, this vendor), by due date then bill number. Wide (dialog content at or above the grid's least width): a grid of tick box (44 px fixed) · **Bill** ("Bill 1003", the vendor's bill no. "No. 88412" muted under it) · **Due date** (`DueText`, "Overdue" in danger tone) · **Open balance** · **Credit to apply** (`PaymentCell`); every data column flex with a least width of 95 px, long text ellipsized, no sideways scroll. Below the grid's least width: cards (tick box and bill on top, due date, Open balance, the Credit to apply input full width), as Pay Bills' cards.
  - The dialog opens with the credit spread over the bills oldest due first (`spreadAmount`), so ⌘↵ applies it in one key. Ticking a row sets it to the lesser of its open balance and the credit not yet placed; unticking clears it; typing an amount above zero ticks it; ⌥↵ in a cell toggles the row. "Clear" (link under the list) empties every row.
  - Summary under the list: "Applying $50.00 to 2 bills · $0.00 stays unapplied".
  - Buttons: Cancel (Esc), **Apply credit** (⌘↵, primary).
  - On open, the first Credit to apply cell has focus (web; Books `useFocusOnOpen`).
- Validation: one zod schema through `useForm` + `zodResolver`: Apply date; each row ≥ 0 and at most its open balance ("More than the open balance of $1,250.00", under that cell); the sum at most the unapplied credit ("More than the unapplied credit of $50.00.", in `FormErrorSummary`); at least one row above zero ("Select at least one bill.").
- **Apply credit** writes, in one pbtsdb batch through `useMutation` (all or nothing), one `books_vendor_credit_applications` row per bill with an amount. The dialog is held through the write by a synchronous Zustand flag set before the mutation. A refusal keeps the dialog and the typed values: a row's refusal ("Bill 1003: the credit is more than its open balance of $50.00.", "Bill 1003 is not open. Clear it to continue.") under that row's cell; the rest in the dialog's `FormErrorSummary`. After success the dialog closes and a toast reads "Applied $50.00 to 2 bills".
- An application posts no journal entry: the credit already debited Accounts payable and the bill already credited it, for the same vendor. It is a stored record with its own label ("Credit applied") on both documents and in the audit log.
- **Server guard** (inside `serialized`, on each application create): the credit is posted; the bill is posted and of the credit's vendor; amount > 0, at most the credit's `balance` and at most the bill's `balance`, both re-read; the date is a real day, not before the credit date, after the close date. Then it lowers the credit's and the bill's `balance` (the document-balance helper) and rebuilds the cash-basis rows of both (§3.11). An application is never updated.
- **Remove** (writer; on the credit's Applied to block and on the bill's Payments block): `ConfirmDialog` "Remove this credit from Bill 1003? The bill's balance goes up by $30.00 and the credit is unapplied again." It deletes the application through `useMutation`; the server restores both balances and rebuilds both documents' cash-basis rows. Refused when the application's date is on or before the close date (the ledger's close-date refusal).
- No open bill for the vendor: the Apply to bills action stays (while `balance` > 0) and the dialog shows "Pacific Power has no open bills. The credit stays on the vendor until you post a bill." with a Button "New bill" (`books/bills/new?vendor=<id>`) and Cancel.
- Dialog states: loading (three skeleton rows); a failed read shows `DialogLoadError` with Retry and Apply credit disabled.

### 3.10 Bills and Pay Bills, after this unit
- A bill's `balance` is its total less posted bill payments and less credit applications. Every screen that reads `balance` (Pay Bills' Open balance, the bill's Balance due, the Paid / Partly paid badge) follows with no other change: a bill a credit covers in full reads Paid and leaves Pay Bills.
- Bill read view: the totals gain "Credits applied −$30.00" above Balance due when an application exists; the **Payments** block (`DocumentPayments`) also lists each application ("Vendor credit 1002 · Nov 16, 2026 · $30.00", opens the credit, with Remove for a writer), in date order with the payments.
- **Void of a bill a credit is applied to is refused**: "Vendor credits are applied to this bill. Remove them first."
- **Bill correction** with applications: at posting they move to the correction with the payments; refused when the correction's total is below payments plus credits ("Payments and credits of $300.00 are applied to this bill. Its total cannot be below that." — the existing payments-only text stays when no credit is applied) or when it changes the vendor ("Vendor credits are applied to this bill, so its vendor cannot change.").
- **Void of a vendor credit that is applied is refused**: "This credit is applied to bills. Remove it from those bills first."
- **Vendor credit correction** with applications: they move to the correction; refused when its total is below them ("$30.00 of this credit is applied to bills. Its total cannot be below that.") or when it changes the vendor ("This credit is applied to bills, so its vendor cannot change.").
- **Pay Bills**: above the open bills, a notice lists each posted vendor credit with `balance` > 0 of a vendor that has a shown open bill: "Vendor credit 1002 · Office Supply World · $50.00 unapplied", each a link that opens the credit. No notice when there is none. Nothing else on Pay Bills changes: no credit column, and a payment is still at most the open balance.

### 3.11 Cash basis (Q14)
- The vendor credit is a deferred kind (`cashDeferrals`): on the Cash method each posted line of its entries is taken out at its own date (memo "Unapplied vendor credit (cash basis)"), and each application brings back that application's share of the credit's lines at the apply date (memo "Vendor credit 1002 applied (cash basis)"), by the bill's share rule (amount ÷ total, cumulative, largest remainder).
- For the bill, an application counts as a payment at the apply date: it brings back that share of the bill's lines (memo "Bill 1003 paid by vendor credit (cash basis)"). The brought-back rows read the vendor credit's entry number.
- So an unapplied credit changes no cash-basis figure, and a credit applied in full to a bill shows the bill's cost less the credit on the apply date. On Accrual a credit counts on its credit date.
- A credit that is never applied to a bill but refunded by the vendor is unit p3-vendor-refund.

### 3.12 Elsewhere in Books
- Settings → Numbering gains a "Vendor credits" card (sequence `vendor_credit`, no prefix, next 1001).
- Journal Entries, registers, entry drawer, General Ledger, Journal, Transaction Detail: Type "Vendor credit" (`entry_type_labels.json`), No. "1002", Name the vendor on every line; Open goes to the credit; Edit opens its correction; Reverse is hidden. "Void reversal of 1002".
- Search: kind `vendor_credit`, title "Vendor credit 1002 · Pacific Power" / "Draft vendor credit · Pacific Power"; matches number, Vendor's credit no., memo and the vendor's name.
- Vendor delete refused while the vendor is on any vendor credit: "<Vendor> is on vendor credits. Make it inactive instead." (after the expenses check).
- Product delete refused while on a vendor credit line (`productReferences`).
- Account delete refused while on a vendor credit account line (`accountLineReferences`: "This account is on 1 vendor credit and cannot be deleted. Make it inactive instead." / "… on 3 vendor credits …").
- Attachments: `books_attachments` takes a vendor credit as a third parent ("A vendor credit holds at most 25 attachments.", "This vendor credit is void. Its attachments can't change.", "An attachment belongs to one bill, one expense or one vendor credit."); a correction takes its original's files.
- Audit log (labels "Vendor credit 1002", "<credit>: line", "Vendor credit 1002: Bill 1003" for an application), OAuth scopes (rw vendor credits, lines and applications), `entryNouns("vendor_credit")`, `documentDocTypes`, `DOC_TYPES`, `lib/audit-record-route.ts`, `TestRegister_BindsEachPartOnce`, `tdDocumentPosters`, `verifyDocumentBalances` / `rebuildDocumentBalances` and `rebuildCashBasis` cover the new kind.
- The bill's refusal "A bill total cannot be below zero. Use a vendor credit." now has its target; `help/bills.md` links it.

### 3.13 Help
- New topic `help/vendor-credits.md` (id `books:vendor-credits`): when to use a vendor credit (a return, an overcharge, a credit note) instead of a negative bill line; vendor, credit date, vendor's credit no. (the duplicate refusal); account and product lines; Save draft / Post / Post & new; what posting does; Apply to bills (the dialog, oldest first, the apply date, partial use), Remove; Edit, Void (and why an applied credit must be removed first), Copy; attachments; the Purchase lines setting; cash basis in one paragraph; the key list of §3.2 and the dialog keys (Mac glyphs only). Cross-links: bills ↔ vendor credits ↔ pay bills, vendors, settings, reports.
- `help/bills.md`: Credits applied, the Payments block rows, the void and correction rules. `help/pay-bills.md`: the unapplied-credits notice and that Open balance is after credits. `help/reports.md`: vendor credits under "Accrual and cash basis". `help/settings.md`, `help/expenses.md`: the setting's words.

## 4. Data
- New migration `2100000023_create_books_vendor_credits.js` (main ends with `2100000022_create_books_credit_memos.js` and `2100000023_create_books_audit_log.js`; the plan lists `pb-migrations/` again before it names the number, lesson 49). The audit view migration is renamed `2100000024_create_books_audit_log.js` so it stays last; its `LINES` list gains `['books_vendor_credit_lines', 'books_vendor_credits', 'vendor_credit']` and `['books_vendor_credit_applications', 'books_vendor_credits', 'vendor_credit']`, and its header comment names the new migration. The new migration holds:
  - `books_vendor_credits`: vendor (relation books_vendors, required), status (select draft, posted, void; required), number (text ≤ 40, server), sequence (int, server), date (day, required), ref_no (text ≤ 40), memo (text ≤ 4000), subtotal, total (int cents, server), balance (int cents ≥ 0, server), currency (server), revision (int, server), entry (relation books_journal_entries, server), replaces, replaced_by (relation books_vendor_credits), posted_by, posted_at, voided_by, voided_at (server), form, fields, sort_key (hidden, server), created, updated. Rules as the bill. Index (vendor, status, balance).
  - `books_vendor_credit_lines`: as `books_bill_lines` with `vendor_credit` as the parent relation (cascade).
  - `books_vendor_credit_applications`: vendor_credit (relation, required), bill (relation books_bills, required), amount (int cents > 0), date (text day, required), applied_by (relation users, server), created. Indexes (vendor_credit), (bill). Rules: list/view READ; create WRITE with `applied_by` unset; no client update; delete WRITE. The server guard of §3.9 runs on create and delete.
  - FTS table `fts_books_vendor_credits` (record_id, number, ref_no, memo).
  - In the same migration, because `books_vendor_credits` must exist first (the pattern of `2100000022`, which adds `credit_memo` to the cash-basis tables there and not in `2100000021`): `books_attachments` gains the optional relation `vendor_credit` (cascade) and its index; `books_cash_basis_lines.document_kind` gains `vendor_credit`, and the table gains the optional relation `vendor_credit` (cascade) with an index. The down step takes them out again, as `2100000022` does.
- Migrations edited in place (Books unreleased), for select values only:
  - 2100000001 — `books_doc_sequences.doc_type` gains `vendor_credit`, seed row `booksseqvcredit` (15 characters), no prefix, next 1001.
  - 2100000002 — `books_journal_entries.doc_type` gains `vendor_credit`.
- Server (Go):
  - `server/vendor_credits.go`: `vendorCreditKind` of `salesDocKind` (party vendor, required; the purchase line tables and row labels; `CheckHeader` = credit date and the duplicate credit no.; `BeforePost` = `checkPurchaseLinesToPost`, set in `init` as the bill's; `HasTax: false`; `TracksBalance`; `CheckVoid` and `Replace` of §3.10). Posting reuses p2-credit-memo's switch with no new line function: `Credit: true`, `DebitAccount` = `ensurePayables` (no `CreditAccount`, so `salesDocPostingLines` debits the total) and `LineAccounts: expenseByAccount`, whose lines `mirroredLines` turns (each account's sum credited, a negative sum debited). `salesDocPostingLines` does not change; the comment on `salesDocKind.Credit` names both credit kinds.
  - `server/vendor_credit_applications.go`: the create and delete guards and the balance writes.
  - `server/document_balance.go` (Q20): main's `balanceKind` has one payer (`LinesCollection`, `LineField`, `PaymentCollection`, `PaymentField`), and `creditMemoBalanceKind` has none. This unit gives a balance kind a list of payers. A payer names its lines collection, the field that names the document, and, when its lines belong to a payment with a status, the payment collection and field; a payer with no payment collection (an application) always counts. `billBalanceKind` has two payers (bill payment lines of posted payments; `books_vendor_credit_applications` by `bill`); the new `vendorCreditBalanceKind` (`books_vendor_credits`, noun "vendor credit") has one (`books_vendor_credit_applications` by `vendor_credit`); `invoiceBalanceKind` keeps its one and `creditMemoBalanceKind` its none. `postedAppliedTo`, `documentBalance`, `setPostedDocumentBalance`, `movePostedLines`, `verifyDocumentBalances` and `rebuildDocumentBalances` read every payer; `applyToDocuments` / `releaseLines` stay per payment. p2-apply-credit then adds a payer to the invoice and to the credit memo with no further change to this file.
  - `server/cash_basis.go`: `vendorCreditCashDeferral = cashDeferral{Kind: "vendor_credit", DocType: docTypeVendorCredit, Balance: vendorCreditBalanceKind, UnpaidMemo: "Unapplied vendor credit (cash basis)", PaidMemo: "Vendor credit %s applied (cash basis)"}` (no `TaxLines`), added to `cashDeferrals` after `creditMemoCashDeferral`. `documentPayments` reads every payer of the kind's balance kind: main's query joins a payment's posted entry (`PaymentDocType`); a payer without a payment collection gives one `cashPayment` per application with the application's date and the vendor credit's entry and sequence. Payments of one document sort by date, then entry sequence, then id. The bill's rows that an application brings back carry the memo "Bill %s paid by vendor credit (cash basis)" (a per-payer memo; the bill payment's "Bill %s paid (cash basis)" stays).
  - `server/bills.go`: the void and correction refusals of §3.10. `server/attachments.go`: the third parent.
  - `documentDocTypes`, `entryNouns`, `entry_routes.json`, `entry_type_labels.json`, the vendor, product and account delete guards, search source, audit, OAuth, `TestRegister_BindsEachPartOnce`, `tdDocumentPosters`. Go line checks per required cell of each row kind are the shared purchase ones (lesson 34).
- Forms host `books:vendor_credit` (`forms/hosts.ts`): built-ins vendor (`VendorField`, locked, required), date ("Credit date", locked, required), ref_no ("Vendor's credit no."), account_lines, item_lines, memo; band layout as §3.3; custom fields insert before `account_lines`.
- Client reads (each `useLiveQuery` with an explicit `queryKey`; row types derive from the queries):
  - `hooks/vendor-credit-data.ts` (its `useStore` calls), as `bill-data.ts`; `books_settings` through `useBooksSettings`; the vendor through its own live query; accounts and products through the purchase pickers' queries.
  - Applications of a credit: `books_vendor_credit_applications` where `vendor_credit = id`, ordered by date, with the bill through `materialize()`. Applications of a bill: where `bill = id`, with the credit through `materialize()`.
  - The apply dialog and the read view's notice: `books_bills` where `status = 'posted'`, `balance > 0`, `vendor = v` (the `useOpenBills` query with a vendor).
  - Pay Bills notice: `books_vendor_credits` where `status = 'posted'`, `balance > 0`, with the vendor through `materialize()`; filtered in JS to the vendors of the shown bills.
- Seed (`seed.ts`, through the fixture `lib/vendor-credit-form-fixture.ts`): one draft vendor credit (Office Supply World, one product line); one posted, unapplied credit (Pacific Power, one account line, a vendor's credit no.); one posted credit applied in full to a new seeded bill of a vendor with no other open bill (so no seeded bill's open balance and no Pay Bills row count changes), leaving part of the credit unapplied; one void credit. All dated after mid-2026. The plan greps every report, register, pay-bills, bill and vendor spec that reads account 2000, the credited expense accounts, the seeded products and the "open bills" counts before adding them (lessons 1, 23).
- E2E: specs create their own vendor credits and bills through the UI with a unique memo and open them by Books search; one phone-width run (390 × 844) covers the band, the account-line card, More, and the apply sheet's cards; a spec that changes the Purchase lines setting goes in the `purchase-lines-setting` project and restores it in `afterEach` (lessons 35, 42).

## 5. Cut
- Mailing address on the credit, with "Edit address" / "Edit vendor" (Q7) — nothing prints or sends a vendor credit; the vendor's page holds the address (as the expense).
- "Permit no." — not a US federal field; custom fields cover it (as the bill).
- The vendor's number as the title's number — Books numbers the credit itself at posting (Ledger rules); the vendor's number is "Vendor's credit no.".
- Collapsible sections — the Purchase lines setting hides a table a company does not use (as the bill).
- Drag grip, "Add lines" in bulk, "Clear all lines" — the row menu, row keys, Enter-adds-a-line and Cancel cover them (as the bill).
- "Revert" — Cancel discards a new form; a posted credit is changed by Edit.
- "Make recurring" — recurring transactions are v1.1.
- The save button's menu ("Save and close", "Save and new") — Save draft, Post, Post & new are separate buttons (as every Books document).
- Title-bar gear and close (X) — Cancel and the stack's back cover them.
- A "Credit" column in Pay Bills and automatic use of credits while paying (packet direction B) — applying is its own action with its own record (Books design rule "Apply credit has its own label and entry").
- Applying one credit to another vendor's bill, or to a draft bill.
- "Create vendor credit" on the bill read view, a `?bill=<id>` start and a stored bill link, as the invoice's "Create credit memo" (Q22) — a vendor's credit note seldom repeats a bill's lines, and the application records which bill the credit went to; `?vendor=<id>` and Copy start a credit fast.
- A repeated "Credit amount" row under Total, as the credit memo's totals have (Q21) — the header figure shows it, and the read view's last row is "Unapplied credit".
- Customer / billable column on lines, sales tax, PDF, print and email of a vendor credit — as the bill.
- Vendor credits list, vendor page Transactions row, A/P aging and vendor balance columns — p3-purchase-lists, p3-vendor-pages, p5-ap-aging, p5-vendor-balance.

## 6. Platform notes
Standing approval for every Books form (human, 2026-11-11): keyboard shortcuts on web and iOS with a hardware keyboard (Android uses visible buttons and menus) — the new key A and the dialog's ⌘↵ and ⌥↵ included, each with a visible button or tick box; first-field autofocus and type-to-open pickers on web only (native opens a picker by tap). No new platform item.

## 7. Sparks carried
- The credit amount is the largest figure: `DocumentHeader` big figure "Credit amount".
- The total in one column under the line amounts: `DocumentTotalsPanel` under the shared Amount column.
- No core extension.

## 8. Non-goals
- No vendor refund (p3-vendor-refund lowers a credit's balance through the same balance helper).
- No credit from an overpayment in Pay Bills (a payment is at most the open balance).
- No 1099 effect.
- No report source for purchase documents (p5-ap-aging, p5-vendor-balance).
- No multi-currency vendor credit.
- No change to how the invoice, sales receipt, estimate, bill and expense forms look or behave, beyond the Purchase lines words (§3.8) and the bill changes of §3.10.
- No change to receive payment or to an invoice's balance.

## 9. Engine reach (self-review)
- Two tables, the Purchase lines setting, typed and computed Amount, line refusals, the line-count rule: the bill's engine paths (Books `hideBuiltins`, core `TableField` per-instance keys and `addOnSubmit`, the `useRecordSave` rows step, `.superRefine` in `lib/document-schema.ts`, `FormHostUi.schemas`).
- No address built-in: the host has none; `features.partyAddress: false` (the expense's path).
- Duplicate credit no. under the field: a server field refusal keyed `ref_no`, shown inline by the document layer's refusal handler (the bill's path).
- Figure "Credit amount" always the total while the totals end in "Unapplied credit": `SalesDocumentKind.figure` and `lastTotal` are separate; the read view's figure reads the total for this kind (Books, `DocumentHeader` / `document-kinds.ts`).
- Badge Partly applied / Applied: Books `lib/document-lifecycle.ts` with per-kind labels and `StatusBadge` tones.
- Attachments: `features.attachments` and `AttachmentsSection` (Books), the third parent in `server/attachments.go`.
- Apply dialog: core `Dialog` (Sheet on a phone) with `Dialog.ActionButton` + `DIALOG_SUBMIT_SHORTCUT`; core `DateField`; `useForm` + `zodResolver` + `FormErrorSummary` (`@tinycld/core/ui/form`); Books `OutstandingGrid` / `OutstandingCards` / `PaymentCell` with a third `OutstandingDocument` descriptor (noun "Bill", cell label "Credit to apply"), `lib/payment-allocation.ts` (`spreadAmount`, `typeRowPayment`, `toggleRow`, `clearPayments`, and a capped tick — a new function; `tickRow` is unchanged for its two callers); `useFocusOnOpen`; one pbtsdb batch through `useMutation`; `DialogLoadError`.
- Remove: core `ConfirmDialog`; `useMutation` delete.
- No bullet needs a core API that does not exist. No core change.

## 10. Regeneration against main (2026-11-17)

### Changed by p2-credit-memo's merge (no decision needed)
- Posting: `Credit: true` + `DebitAccount` + `expenseByAccount` replaces the draft's "mirror of `expenseByAccount`" function (§4 Server).
- Migration: `2100000023_create_books_vendor_credits.js`; the audit view moves to `2100000024`. The attachments and cash-basis relations are added in the new migration, not by editing `2100000020` / `2100000021` (§4).
- Cash basis: the deferral is one more `cashDeferral` after `creditMemoCashDeferral`; main's `documentPayments` needs a posted payment entry, so the application payer is new code there (§4 Server).
- The client kind sits beside `CREDIT_MEMO_KIND` in `lib/sales-document-kinds.ts` (`VENDOR_CREDIT_KIND`, key `vendor_credit`, `figure: { label: 'Credit amount', testId: 'credit-amount' }`, `lastTotal: null`), with `VENDOR_CREDIT_MESSAGES` in `lib/document-texts.ts`.
- + New menu: "Vendor credit" follows "Expense" in the Vendors column; main's `books-shell-fixture.ts` already names the label.

### New questions, decided by the human 2026-11-17 (direction A; Q20–Q23 as recommended)
- Q20. Main's document balance has one payer per kind, and nothing applies a credit memo yet. Recommended: this unit makes the balance kind multi-payer (§4 Server) and p2-apply-credit reuses it for invoices and credit memos.
- Q21. The merged credit memo ends its totals with a "Credit amount" row equal to Total. Recommended: the vendor credit does not repeat it; the form's totals end in Total and the read view's in Applied / Unapplied credit (§3.5, as decided on 2026-11-16).
- Q22. The merged invoice read view has "Create credit memo" (M), which starts a memo from the invoice's lines and stores a link. Recommended: no such action on the bill (§5 Cut).
- Q23. The merged customer Transactions tab calls a posted credit memo with an open balance "Unapplied". Recommended: the vendor credit read view keeps Posted / Partly applied / Applied (§3.7, the bill's Paid / Partly paid rule with these labels); p3-purchase-lists picks the list's words.
