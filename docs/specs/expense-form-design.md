# Expense form — design

Unit p3-expense · package books · feature `expense-form`. Approved at the design gate 2026-11-14 (Direction A; every open question answered as the packet recommended). Built against books origin/main@9b8984e (p3-bill merged), core f201007. Spec sources: `docs/superpowers/specs/2026-10-21-books-design.md` §Interface, §Forms (also §Scope "Expense (check/card/cash method)", §Ledger rules). Contract: `docs/specs/bill-form-design.md` (p3-bill, approved 2026-11-13): every behavior this spec does not restate is the bill's, with "bill" read as "expense".

## 1. Goal
A writer records money already paid — from a bank or credit card account, by check, card, cash or another method, optionally to a vendor — with lines that charge expense accounts or buy products, saves it as a draft and posts it, which credits the account paid from and debits each line's account, in the same transaction form layout as the bill.

## 2. Where it lives
- Routes: `/a/books/expenses/new` (query `?vendor=<id>`, `?copy=<id>`, `?replaces=<id>`, `?fresh=`), `/a/books/expenses/[id]`. Screens `screens/expenses/new.tsx`, `screens/expenses/[id].tsx`, each a `DocumentScreen` of the new kind `EXPENSE_DOCUMENT`. Both are pushed pages; `hidesNewFab` gains `expenses`.
- A draft opens in the form; a posted or void expense opens in the read view.
- + New menu → Vendors column → "Expense", after "Bill" (`lib/shell-nav.ts`, id `expense`).
- Books search finds expenses (kind `expense`, drafts included).
- Journal Entries list, account registers, General Ledger and the entry view open an expense's entry at `books/expenses/<id>` (`lib/entry-route.ts`).
- No list screen and no sidebar "Expenses" entry (p3-purchase-lists), no vendor page link (p3-vendor-pages).

## 3. Behavior

### 3.1 Shared layer
- The expense is the fifth kind of the shared document layer (`SalesDocumentKind` / `DocumentKind`, `components/documents/*`, `hooks/useDocument*`, Go `salesDocKind`), with party `vendor`, the bill's two line tables (`BILL_LINE_TABLES`, `BILL_LINE_SPECS`, `PurchaseReadLines`), features `{ tax: false, message: false, email: false, pdf: false }`, lifecycle `posting`, and posting side credit = the expense's Paid from account, debit = the lines (`expenseByAccount`).
- The layer gains, per kind:
  - an **optional vendor** (`customerRequired: false` on a vendor kind): `VendorField` offers "No vendor" first, as `CustomerField` offers "No customer";
  - a **party address** flag (`features.partyAddress`): a kind without it has no address built-in and draws neither the address nor the "Edit address" / "Edit vendor" links (the expense). The invoice, sales receipt, estimate and bill keep theirs.
- The invoice, sales receipt, estimate and bill behave exactly as before and their unit and e2e tests stay green. No expense file copies a bill file: where the bill's code names `BILL_*` for something the expense shares (purchase lines, the starting lines from the Purchase lines setting, the vendor pick's account fill, `isPurchaseLine`), it is renamed to a purchase name or takes the kind as a parameter.

### 3.2 Keyboard (speed first)
- On new, draft, correction and copy the Vendor picker has focus (web, every width). Vendor, Account and Product are Books `SearchPicker`s and open by typing (web); Paid from and Payment method are core `SelectInput`s (↑/↓, first-letter typeahead, Enter picks); native opens every picker by tap.
- Tab order: Vendor → Paid from → Payment date → Payment method → Ref no. → custom fields → account line 1 (Account → Description → Amount → row menu) → … → "Add account line" → product line 1 (Product → Description → Qty → Rate → row menu) → … → "Add product line" → Memo → action bar. A table that is not shown (§3.10) has no Tab stops. Picking a vendor moves focus to Paid from.
- Enter in Amount of the last account line adds an account line and focuses its Account picker; Enter in Rate of the last product line adds a product line and focuses its Product picker (core `addOnSubmit`; the native return key the same).
- Keys, ⇧? group "Expense": Post ⌘↵, Post & new ⌘⇧↵, Save draft ⌘S, Cancel Esc, Delete draft ⌘⌫ (`FORM_KEYS`). ⇧? group "Lines" (core's table group): Add account line ⌥↵ and Add product line ⌥P (each registered only while its table shows) and the core row keys on the focused line. Read view: Edit E, Void V, Copy C, View journal entry J.
- Every action button that has a key is a core `ShortcutButton` with `scopeOwner` from the screen's `useShortcutScope`.

### 3.3 Header band
Built-ins of the forms host `books:expense`, drawn by Books components in the band:
- Row 1, thirds on a wide form:
  - **Vendor** (optional, locked; active vendors, "No vendor" first; `VendorField`). Empty shows "No vendor" in muted text.
  - **Paid from** (required, locked; `PaymentAccountField`, a `SelectInput` of the active accounts of type `bank` or `credit_card` in chart order, indented, "<number> <name>"). Under it, once an account is picked, its current balance: "Balance $7,118.56" (`accountsWithBalances` + `transferAccountBalance`, `text-sm text-muted-foreground tabular-nums`, `text-danger` when negative) — the account's own posted balance, as the transfer form shows it, not as of the payment date and not after this expense. No warning or block when the expense exceeds it. A stored account that is now inactive shows by name for the value it mounted with only (`filteredAccountOptions` rule). With no bank or credit card account in the chart the select is empty with the inline error "Add a bank or credit card account to the chart of accounts".
  - **Payment date** (required, default today; `DocumentDateField`, label "Payment date").
- Row 2 (`bandSplitAt: 'payment_method'`), thirds on a wide form:
  - **Payment method** (required; `PaymentMethodField` without its "None" choice, over `PAYMENT_METHODS`: Cash, Check, Credit card, Debit card, Bank transfer, Other). Picking Paid from sets it: a `credit_card` account → Credit card; a `bank` account of detail type `cash_on_hand` → Cash; any other bank account → Check. The user may change it after; a later Paid from pick sets it again.
  - **Ref no.** (optional text ≤ 40, hint "Check number or card reference"; built-in `reference_no`).
  - Custom fields follow Ref no.
- Under 640 px every cell is full width, stacked in Tab order.
- Picking a vendor fills nothing in the band. When the Account details table shows and its first line has no account, the pick puts the vendor's default expense account on that line, only when the Account picker lists it (§3.4), as the bill does.
- Title: "New expense", "Draft expense", "Edit 1004" (a correction), "Expense 1004" (read view), with the status badge Draft / Posted / Void (`StatusBadge`). The big figure top right is **Amount paid** (= Total), "—" while invalid, "Too large" over the stored-amount limit. `HelpIcon topic="books:expenses"`.
- No tabs: an expense has no PDF and no email view.

### 3.4 Lines
- The bill's two tables, in its order and with its columns, cells, row menu, bounds and phone cards: **Account details** (`account_lines`; Account = active `expense`, `other_expense` or `cost_of_goods_sold` accounts; Description; Amount typed, may be negative, not 0) and **Product and service details** (`item_lines`; active Service or Non-inventory products with "I purchase this" on; Description; Qty > 0; Rate ≥ 0; Amount = Qty × Rate, server-written). Picking a product fills Description with its purchase description and Rate with its cost while the cell is empty.
- Starting lines of a new expense follow the Purchase lines setting as the bill's (§3.10).
- No description, subtotal or percent rows, no drag grip, no "Clear all lines", no collapsible sections.
- An empty trailing line of either table is dropped at save; a save the client refuses puts it back (`keepsEmptyLinesOnRefusal: true`).
- At most 250 lines in the two tables together ("An expense holds at most 250 lines.").
- Wide (lines container ≥ 640 px): a grid per table with the Amount column at one shared width so the totals align. Phone: each line is a card.

### 3.5 Footer and totals
- Left: **Memo** (textarea ≤ 4000, hint "Only your team sees this. Saved as the journal entry memo."). No message field.
- Right, under Amount: **Account lines** and **Products and services** subtotals (each only when its table has a line with an amount), then **Total** (`border-t`, `font-semibold`). No row after Total (`lastTotal: null`); the big figure repeats it as "Amount paid".
- Total ≥ 0 at every save ("An expense total cannot be below zero."), ≤ the stored-amount limit ("The expense total is more than Books can store."); Post refuses a zero total ("An expense total must be more than zero to post.").

### 3.6 Saving
- Validation: one zod schema for the kind through the forms engine (`FormHostUi.schemas`) and `zodResolver`; Post adds the bill's line-count rule with the same texts by the shown tables.
- Action bar, sticky: the shared `DocumentActionBar`, in the bill's order: wide — Cancel, Save draft, Post (primary), Post & new, More (Delete draft, on saved drafts); phone — Cancel, Save draft, Post, More (Post & new, Delete draft).
- Save writes through `useMutation`: insert/update the `books_expenses` row, then the line plan of each shown table (one `books_expense_lines` collection, `kind` account/item), then for Post `status: 'posted'`. The form is held through the write by the document save store. A post refused after the draft was written leaves the draft and shows the refusal.
- Revision conflict as the bill, with "expense" words: "This expense changed after you opened it. Load it again, then review it before you save or post." and the notice action **Load the current expense**.
- After Post: replace with `books/expenses/<id>`. Post & new: replace with a fresh `books/expenses/new` (keeps `?vendor` only when opened with it). Save draft stays at `books/expenses/<id>`.
- Cancel with edits opens the discard dialog; Delete draft opens "Delete this draft expense? This can't be undone."
- Every save refuses: an account line whose account is not an expense type (the bill's text with "Account line n"); a Paid from account that is not of type `bank` or `credit_card` ("Choose a bank or credit card account.", under Paid from); a payment method outside the list; a Ref no. over 40 characters.
- Duplicate check number: when Payment method is Check and Ref no. is not empty, a save is refused when another non-void expense from the same Paid from account, method Check, has the same Ref no. (trimmed, exact): "Check no. 1042 from 1000 Business Checking is already on Expense 1004." (the account as "<number> <name>") under Ref no. A draft without a number is named "a draft expense". A correction does not clash with the expense it replaces.
- Post refuses an inactive vendor (when one is chosen; a correction keeps its original's), an inactive Paid from account ("1000 Business Checking is inactive. Choose an active account.", under Paid from), an inactive account or product on a line, a product without "I purchase this", a product whose expense account is inactive (the bill's line texts), and a payment date on or before the close date (the ledger's refusal).
- Refusals: "Account line n: …" / "Product line n: …" under that row; Vendor, Paid from, Payment date, Payment method, Ref no. under their fields; the rest in `FormErrorSummary`, with PocketBase's final period.
- The server does not read the Purchase lines setting.
- Writers only (bookkeeper or admin). Without write access, `books/expenses/new` shows "You need bookkeeper access to create expenses".

### 3.7 Posting (server)
- In one transaction (`serialized`): allocate the number from the `expense` sequence; create the journal entry (`doc_type expense`, `origin document`, `document = expense.id`, `date` = payment date, `memo`) with one debit per account (account lines' accounts and product lines' product expense accounts, summed per account, chart order, a negative sum a credit — `expenseByAccount`) and one credit to Paid from for the total; every line names the vendor in `vendor` (empty when none; `customer` empty). Post it through `postEntry`. Set `entry`, `number`, `posted_by`, `posted_at`.
- Paid from is read from the expense inside the transaction and checked again (exists, active, bank or credit card).
- Posting creates no account.

### 3.8 Read view (posted or void)
- `DocumentReadView` with: Vendor (or "No vendor"), Paid from ("1000 Business Checking"), Payment date, and a Payment row "Check · 1042" (method label and Ref no., an empty part left out; `paymentText` without the deposit part); each line table that has lines, read-only, whatever the Purchase lines setting; totals; memo; "Posted by <name>, <date time>"; "Voided by …"; "Replaced by 1004 (edited)".
- Actions (writer, posted): **Edit** (`?replaces=<id>`, a correction that keeps the number), **Void** ("A reversing entry is posted in the original period. The number is kept."), **Copy** (`?copy=<id>`: vendor, Paid from when still active (else empty), payment method, lines of both tables, memo; today's payment date, empty Ref no.), **View journal entry**. Writer on a void expense: Copy, View journal entry. Reader: View journal entry only.

### 3.9 States
- Loading, load error with Retry for each failing read (merged recoveries, the accounts-with-balances read and the settings read included), not found ("This expense does not exist"), `?replaces` of an expense that is not posted ("This expense cannot be edited"), no write access on `/new`.
- Offline: the bar's buttons disable while writes are unavailable (`useWritesAvailable`).

### 3.10 Purchase lines setting (decided by the human 2026-11-13)
- `books_settings.purchase_lines` decides the expense form's tables exactly as the bill's: a table shows when the setting includes it, or when the expense the form opens with already has a line in it; once shown in a form session it stays shown.
- Because the one setting now covers bills and expenses (and vendor credits later), its words change: Settings → Purchases card **Bills and expenses**, select **Purchase lines** ("Accounts and products" / "Accounts only" / "Products only"), section-list line "Purchase lines: <the chosen option's label>" (for example "Purchase lines: Accounts only"), note "Which line tables new bills and expenses show. A form still shows a table its record already has lines in." `help/bills.md`, `help/settings.md` and the books-settings and bill e2e specs change with the words.

### 3.11 Elsewhere in Books
- Settings → Numbering gains an "Expenses" card (sequence `expense`, no prefix, next 1001).
- Journal Entries, registers, entry drawer, General Ledger, Journal report: Type "Expense", No. "1004", Name the vendor on every line (blank with none); Open goes to the expense; Edit opens its correction; Reverse is hidden. Void reversal "Void reversal of 1004".
- Search: kind `expense`, title "Expense 1004 · Pacific Power" / "Draft expense · Pacific Power" (no "· vendor" with none); matches number, Ref no., memo and the vendor's name.
- Vendor delete refused while the vendor is on any expense: "<Vendor> is on expenses. Make it inactive instead." (after the bills check).
- Product delete refused while on an expense line (`productReferences`).
- Account delete refused while on an expense account line (`accountLineReferences`: "This account is on 1 expense and cannot be deleted. Make it inactive instead." / "… on 3 expenses …") or while it is the Paid from of an expense, draft or posted ("This account paid 1 expense and cannot be deleted. Make it inactive instead." / "This account paid 3 expenses …").
- Audit log, OAuth scopes and every registry the bill joined include `books_expenses` and `books_expense_lines`.
- Merge-time item: unit p5-drill-down (another lane, not merged when this spec was approved) adds `entryOpenPath()` and `books/server/entry_routes.json`. Whichever of p3-expense and p5-drill-down merges second adds the `expense` row there (open path `books/expenses/<id>`), so drill-down from an expense's journal entry opens the expense.

### 3.12 Help
- New topic `help/expenses.md` (id `books:expenses`): when to use an expense instead of a bill (paid now, no bill to pay later), Paid from and its balance, payment method and Ref no. (the duplicate check number refusal), account and product lines, negative account lines, Save draft / Post / Post & new, Edit, Void, Copy, the Purchase lines setting, and the key list of §3.2 (Mac glyphs only). Cross-links: bills ↔ expenses, vendors, settings.

## 4. Data
- New migration `2100000017_create_books_expenses.js` (2100000014–16 are taken on books main by estimate_public, party_balances and party_contacts; if 17 is taken at build, use the next free number):
  - `books_expenses`: vendor (relation books_vendors, optional), paid_from (relation books_accounts, required), payment_method (select PAYMENT_METHOD_KEYS, required), reference_no (text ≤ 40), status (select draft, posted, void; required), number (text ≤ 40, server), sequence (int, server), date (day, required), memo (text ≤ 4000), subtotal, total (int cents, server), currency (server), revision (int, server), entry (relation books_journal_entries, server), replaces, replaced_by (relation books_expenses), posted_by, posted_at, voided_by, voided_at (server), form, fields, sort_key (hidden, server), created, updated. Rules as the bill.
  - `books_expense_lines`: as `books_bill_lines` with `expense` as the parent relation (cascade).
  - FTS table `fts_books_expenses` (record_id, number, reference_no, memo).
- Migrations edited in place (Books unreleased): 2100000001 — `books_doc_sequences.doc_type` gains `expense`, seed row `booksseqexpense` (15 characters), no prefix, next 1001; 2100000002 — `books_journal_entries.doc_type` gains `expense`.
- Server (Go): `expenseKind` of `salesDocKind` in `server/expenses.go` (party vendor, not required; line tables and row labels as the bill; `CheckHeader` = payment date, paid_from type, payment method, duplicate check number; `BeforePost` = the bill's line check plus Paid from active; `CreditAccount` = the expense's paid_from; `LineAccounts` = `expenseByAccount`); `isPaymentAccount` (bank or credit card); `documentDocTypes` += expense; `entryNouns("expense")`; `entry_type_labels.json` docTypes `expense: "Expense"`; vendor, product and account delete guards; search source (LEFT JOIN vendors); audit; OAuth; `TestRegister_BindsEachPartOnce` list. Go line checks per required cell of each row kind (lesson 33) — shared with the bill's.
- Forms host `books:expense` (`forms/hosts.ts`): built-ins vendor (`VendorField`, locked, optional), paid_from (`PaymentAccountField`, locked, required), date ("Payment date", locked, required), payment_method (`PaymentMethodField`, required), reference_no ("Ref no."), account_lines, item_lines, memo; band layout as §3.3; custom fields insert before `account_lines`.
- Reads: `hooks/expense-data.ts` (its `useStore` calls), as `bill-data.ts`; Paid from options and balances through `accountsWithBalances` (query key `books.form.paymentAccounts`); `books_settings` through `useBooksSettings`; the vendor through its own live query; accounts and products through the bill's picker queries.
- Seed (`seed.ts`, through `lib/expense-form-fixture.ts`): one draft expense (no vendor, Cash from 1000 Business Checking, 6100 Rent), two posted expenses dated after mid-2026 (Pacific Power, Check 1042 from 1000 Business Checking, account lines; Office Supply World, Credit card from 2100 Company Card, an account line and a product line), one void expense. The plan greps every report, register and transfer spec that reads 1000, 2100 and the seeded expense accounts and products before adding them (lessons 1, 23).
- E2E: specs create their own expenses through the UI with a unique memo and open them by Books search; one phone-width run (390 × 844) covers the band, the account-line card and the More menu; a spec that changes the Purchase lines setting restores it in `afterEach` (lesson 34).

## 5. Cut
- "Print check", "Print later", "Order checks" — check printing is Later in the spec.
- "Make recurring" — recurring transactions are v1.1.
- Attachments — p3-attachments.
- Expenses list, sidebar "Expenses" entry, filters — p3-purchase-lists.
- Mailing address and its links — nothing prints an expense in v0.
- Customers and employees as the party ("payee") — the glossary's party for money paid is a Vendor; payroll is Later.
- Separate "Check" and "Expense" screens — one form; Payment method holds the method.
- Automatic next check number — no check printing in v0; the user types Ref no.
- Collapsible sections, drag grip, "Clear all lines", the form-wide "Clear" — as the bill.
- Customer / billable column on lines — not in spec scope.
- Sales tax on an expense — not in spec scope.
- PDF, print and email of an expense.
- Title-bar gear and close (X) — Cancel and the stack's back cover them.

## 6. Platform notes
Standing approval for every Books form (human, 2026-11-11): keyboard shortcuts on web and iOS with a hardware keyboard (Android uses visible buttons and menus); first-field autofocus and type-to-open pickers on web only (native opens a picker by tap). No new platform item.

## 7. Sparks carried
- Amount paid is the largest figure: `DocumentHeader` big figure "Amount paid".
- Paid-from balance in view: the transfer form's balance line under Paid from.
- No core extension.

## 8. Non-goals
- No 1099 effect at posting. The 1099 counting (payments by payment date, card payments excluded) belongs to the unit that builds 1099 reporting; this unit stores `payment_method` and `paid_from` so that unit can tell a card payment.
- No bank feed matching (p4-for-review may later create or match expenses; not here).
- No vendor refund, no negative total.
- No multi-currency expense.
- No change to how the invoice, sales receipt, estimate and bill look or behave, beyond the Purchase lines words (§3.10).

## 9. Engine reach (self-review)
- Optional vendor: `VendorField` reads `scope.kind.customerRequired` as `CustomerField` does (Books, `forms/document-fields.tsx`); Go `salesDocKind.CustomerRequired` already makes the party optional (sales receipt).
- No address built-in: the host simply has none; `features.partyAddress` stops the layer's band, read view and copy/correction values from reading one (Books).
- Paid from with balance: Books `PaymentAccountField` over core `SelectInput` (+ `onValueChange` to set Payment method — no `watch`/`useEffect`), the balance line from `accountsWithBalances`; required through the host `required` flag and the kind's zod schema.
- Payment method without "None": Books `PaymentMethodField` with an `allowNone` prop (sales receipt keeps None).
- Duplicate check number under Ref no.: a server field refusal keyed `reference_no`, shown inline by the document layer's refusal handler (as the bill's `ref_no`).
- Two tables, the Purchase lines setting, typed vs computed Amount, line refusals, line-count rule: the bill's engine paths (`hideBuiltins`, `TableField` per-instance keys, `useRecordSave` rows step, `.superRefine` in `lib/document-schema.ts`).
