# Vendor refund — design

Unit p3-vendor-refund · package books · feature `vendor-refund`. Built against books `books/p3-vendor-credit`@0d54d1a2 (p3-vendor-credit at its eval gate, not merged), core main@aadbe7f8. Spec sources: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Purchases: … Vendor Credit, vendor refund, Bank Deposit"), §Ledger rules, §Interface; `docs/plans/books-quickbooks-fixes.md` ("Record vendor refund is one step. QuickBooks needs a deposit to A/P, then Pay Bills."). Contracts: `docs/specs/vendor-credit-form-design.md` (p3-vendor-credit; §8 "p3-vendor-refund lowers a credit's balance through the same balance helper", §3.11 "A credit that is never applied to a bill but refunded by the vendor is unit p3-vendor-refund"), `docs/specs/receive-payment-design.md` (p2-receive-payment: the form this one mirrors), `docs/specs/pay-bills-design.md` (p3-pay-bills). "Q<n>" points to a design-gate question. Design gate 2026-11-17: the human picked direction A (a document of its own) and accepted the recommended answers to Q1–Q6, so every statement below is decided. p3-vendor-credit has since merged (books #67); the step branch starts from books main.

## 1. Goal
A writer records money a vendor sent back: picks the vendor, the date, the account the money arrived in and the amount, and places it on that vendor's unapplied vendor credits; posting debits that account, credits Accounts payable, and lowers each credit's unapplied balance, in one step.

## 2. Where it lives
- Routes: `/a/books/vendor-refunds/new` (`?vendor=<id>` starts with that vendor; `?credit=<id>` with `?vendor` also ticks that credit for its unapplied balance; `?replaces=<id>` edits a posted refund as a correction that keeps its number) and `/a/books/vendor-refunds/[id]`. Screens `screens/vendor-refunds/new.tsx`, `screens/vendor-refunds/[id].tsx`. Both are pushed pages; `hidesNewFab` gains `vendor-refunds`.
- A draft opens in the form; a posted or void refund opens in the read view.
- + New menu → Vendors column → "Vendor refund", after "Vendor credit" (`lib/shell-nav.ts`, id `vendor_refund`).
- The vendor credit read view gains the action **Record refund** (§3.9).
- Journal Entries list, account registers, General Ledger, report drills, the entry view and Books search open a refund at `books/vendor-refunds/<id>` (`server/entry_routes.json` row `"vendor_refund": "vendor-refunds"`).
- Not a forms host: the spec's §Forms list does not name it. The form is a Books `useForm` + zod screen, as the receive-payment form. No Settings → Forms entry, no custom fields.
- No list screen and no sidebar entry (p3-purchase-lists), no vendor page row (p3-vendor-pages).

## 3. Behavior

### 3.1 Shared payment layer
- The vendor refund is the mirror of the received payment: one party, a date, a method, a reference, an account, an amount, and a table of that party's open documents with one amount cell per row. It uses the same parts: `DocumentHeader` and `DocumentActionBar` through `DocumentChromeContext`, `OutstandingGrid` / `OutstandingCards` / `PaymentCell` with a fourth `OutstandingDocument` descriptor, `lib/payment-allocation.ts`, the payment save store pattern, `DiscardDialog`, `DeleteDraftDialog`, `VoidDialog`.
- No vendor refund file copies a receive-payment file. Where receive-payment code names the customer, the invoice or `books_payments` for something the refund shares, the plan gives it the party and the collections as parameters (lessons 9, 41). The receive-payment form behaves exactly as before and its unit and e2e tests stay green.

### 3.2 Keyboard (speed first)
- On new, draft and correction the Vendor picker has focus (web, every width). After Post & new the fresh form focuses Vendor again. Vendor is a Books `SearchPicker` and opens by typing (web); native opens every picker by tap.
- Tab order: Vendor → Refund date → Payment method → Reference no. → Refunded to → Amount refunded → row 1 Refund → row 2 Refund … → "Clear refunds" → Memo → action bar. Picking a vendor moves focus to Refund date. Each credit row has one Tab stop, its Refund cell; the row's tick box is a press target only (`tabIndex={-1}`).
- In a Refund cell: Enter (native: the return key) moves to the next row's cell (the last row moves to "Clear refunds"); ⌥↵ toggles the row (an empty or zero cell takes the row's unapplied credit, a filled cell clears). The cell selects its whole value on focus.
- Keys, ⇧? group "Vendor refund", each registered only while its action is offered:

| Where | Action | Key |
|---|---|---|
| Form | Post | ⌘↵ |
| Form | Post & new | ⌘⇧↵ |
| Form | Save draft | ⌘S |
| Form | Cancel (Discard dialog when dirty) | Esc |
| Form | Delete draft (saved draft only) | ⌘⌫ |
| Form | Clear refunds | ⌥⌫ |
| Form | Refund every listed credit in full | ⌥A |
| Refund cell | Refund this credit in full / clear it | ⌥↵ |
| Read view | Edit | E |
| Read view | Void | V |
| Read view | View journal entry | J |
| Vendor credit read view | Record refund | R |

- Every action button that has a key is a core `ShortcutButton` with `scopeOwner` from the screen's `useShortcutScope`; a key whose action sits in More is registered with the menu row's `shortcut` text. Form keys use `allowInInputs`.

### 3.3 Header band
One band (`rounded-xl border border-border bg-surface-secondary p-4`), two rows wide; a row's fields wrap when the band is narrower than they are; stacked in Tab order on a phone.
- Row 1: **Vendor** (required; `SearchPicker` over active vendors; an inactive stored vendor shows by name). **Refund date** (required; core `DateField`, default today).
- Row 2: **Payment method** (optional; core `SelectInput` over `PAYMENT_METHODS`, default None). **Reference no.** (optional text ≤ 40, placeholder "Check or reference no."). **Refunded to** (required; core `SelectInput`; Q3): active accounts of type `bank` or `credit_card` and active Undeposited funds accounts, chart order, "<number> <name>", indented by depth (`SelectOption.indent`). Default: the first active bank account in chart order; with none, the first listed account; with no listed account the select is empty with the text "Add a bank or credit card account to the chart of accounts". Under it, once picked, "Balance $7,218.56" (`PaidFromBalance`, `text-danger` when negative). A stored inactive account shows by name only for the value it mounted with.
- **Amount refunded** (required; `MoneyInput`, right-aligned), in the band's right column wide and last in the band on a phone.
- Header right: title ("Vendor refund" new, "Draft vendor refund", "Edit vendor refund 1001" correction), status badge, `HelpIcon topic="books:vendor-refunds"`, and the big figure "Amount refunded $150.00" ("—" while empty or invalid, "Too large" over the stored-amount limit).
- Changing the vendor on a form that has refunds entered asks nothing: the list becomes the new vendor's credits and every row clears; Amount refunded keeps its value and is placed again (§3.5).

### 3.4 Unapplied vendor credits
- With no vendor chosen the list area shows "Choose a vendor to see their unapplied credits."
- With a vendor: the vendor's posted vendor credits whose `balance` is above zero, oldest credit date first, then number. A draft or correction also lists every credit its stored lines name, even one whose balance has since become zero.
- Wide (list at or above the grid's least width, computed from its columns): a grid with a header tick box (ticks or unticks every listed row) and columns **Vendor credit** ("Vendor credit 1002", a link that opens the credit, pushed; the vendor's credit no. "No. CM-8841" muted under it), **Credit date**, **Credit total**, **Unapplied credit**, **Refund** (money input). Money columns right-aligned, `tabular-nums`; header and rows share the width constants; every data column is flex with a least width of 95 px, the tick column a fixed 44 px; long text ellipsizes; the grid never scrolls sideways.
- Below the grid's least width: one card per credit: tick box and "Vendor credit 1002 · No. CM-8841" on the first line, Credit date, Credit total and Unapplied credit as label-value pairs, and the Refund input at full width. A "Refund all" button above the cards does what the header tick box does (lesson 54).
- Under the list, right-aligned under the Refund column: **On vendor credits** (the sum of the rows) and, only when it differs from Amount refunded, **Not placed** (Amount refunded − the sum, `text-danger`) with the refusal line of §3.5.
- A vendor with no unapplied credit (Q2): "Pacific Power has no unapplied vendor credit. Record the vendor credit first, then its refund." with a core `Button` "New vendor credit" (`books/vendor-credits/new?vendor=<id>`). The form does not post without a row.
- Loading: three skeleton rows. A failed read: the Books error banner with Retry (`recoverLiveQueries`, merged recoveries).

### 3.5 Allocation rules (`lib/payment-allocation.ts`, unchanged functions)
- The form tracks whether Amount refunded was typed.
- Ticking a row sets its refund to its unapplied credit; unticking clears it. Typing a refund above zero ticks the row.
- While Amount refunded has not been typed it follows the rows (`followedAmount`).
- Typing Amount refunded places it (`spreadAmount`): the rows clear and the amount goes on the listed credits oldest first, each up to its unapplied credit. After that, row edits do not change Amount refunded.
- "Clear refunds" (link under the list, ⌥⌫) clears every row and, when Amount refunded was not typed, clears it too. "Refund all" (⌥A, the header tick box) ticks every listed row for its unapplied credit.
- A refund is on vendor credits in full (Q2): the rows must add up to Amount refunded.
- Validation: one zod schema `vendorRefundSchema(currency)` through `useForm` + `zodResolver`, the same for Save draft and Post: Vendor required; Refund date a real day (`isIsoDay`); Reference no. ≤ 40; Refunded to a listed option; Amount refunded > 0 ("Enter the amount refunded") and ≤ the stored-amount limit; each row ≥ 0 and ≤ its unapplied credit ("More than the unapplied credit of $650.00", under that cell); a ticked credit dated after the refund date ("Vendor credit 1002 is dated after the refund date.", under that cell); the rows above the amount ("The refunds add up to $700.00, more than the $650.00 refunded", under the list); the rows below the amount ("$20.00 of the refund is not on a vendor credit. Put it on a credit or lower the amount.", under the list) (`.superRefine`).
- Every amount is integer cents through the shared money helper.

### 3.6 Footer and saving
- Left: **Memo** (textarea ≤ 4000, hint "Only your team sees this. Saved as the journal entry memo.").
- Action bar, sticky, the shared `DocumentActionBar`: wide — Cancel, Save draft, Post (primary), Post & new, More (Delete draft, on saved drafts); phone — Cancel, Save draft, Post, More (Post & new, Delete draft).
- Save writes through `useMutation`: insert/update the `books_vendor_refunds` row, then the line plan (`planTableWrites` / `createTablePlans` over `books_vendor_refund_lines`: one row per credit with a refund above zero), then for Post `status: 'posted'`. A synchronous Zustand flag set before the mutation holds the form through the write. A post refused after the draft was written leaves the draft and shows the refusal.
- After Post: replace with `books/vendor-refunds/<id>` (read view). Post & new: replace with a fresh `books/vendor-refunds/new` (keeps `?vendor` only when opened with it, never `?credit`). Save draft stays at `books/vendor-refunds/<id>`.
- Cancel with edits opens `DiscardDialog`; Delete draft opens "Delete this draft vendor refund? This can't be undone."
- Refusals: Vendor, Refund date, Refunded to, Reference no. and Amount refunded under those fields; "Vendor credit 1002: …" under that row's Refund cell (root `lines.<n>`); the rest (close date, sequence, limit) in `FormErrorSummary`, with PocketBase's final period. A refusal after the user left is logged (`log.warn('books.vendorRefund', …)`).
- Post refuses an inactive vendor ("<Vendor> is inactive. Choose an active vendor."; a correction keeps its original's), an inactive Refunded to account, and a refund date on or before the close date (the ledger's refusal).
- Writers only (bookkeeper or admin). Without write access `books/vendor-refunds/new` shows "You need bookkeeper access to record vendor refunds".
- **Posting (server)**, one transaction (`serialized`, through `postDocument`, doc type `vendor_refund`): allocate the number from the `vendor_refund` sequence; re-read each line's credit and refuse a credit that is not posted or is another vendor's ("Vendor credit 1002 is not open. Clear it to continue."), a line above its `balance` ("Vendor credit 1002: the refund is more than its unapplied credit of $50.00."), a credit dated after the refund, each keyed `lines.<n>`; refuse a line sum that is not the amount; create the journal entry (`doc_type vendor_refund`, `origin document`, `document = refund.id`, the refund date, the memo) with one debit to Refunded to for the amount and one credit per Accounts payable account that the refunded credits' entries debited (the bill payment's `billPayableOf` rule, read for a credit), every line naming the vendor; post it through `postEntry`; set `entry`, `number`, `posted_by`, `posted_at`; lower each credit's `balance` (`applyToDocuments`) and rebuild its cash-basis rows.
- **Correction:** a draft with `replaces` posts as the bill payment's correction: the original's lines are released, the original becomes void with `replaced_by`, the correction takes its number and applies its own lines. A correction keeps its vendor.
- **Void:** posted → void posts the reversing entry in the original period, keeps the number, and raises each credit's `balance` again (`releaseLines`).

### 3.7 Read view (posted or void)
- Header as the form: title "Vendor refund 1001", badge Posted / Void, big figure "Amount refunded".
- Body: Vendor, Refund date, the payment line ("Check · 20417 · refunded to 1010 Business checking"; `paymentText` with the verb as a parameter), the refunded credits (grid Vendor credit link, Credit date, Credit total, Refunded; every column flex, least width 95 px; cards below the grid's least width), memo, "Posted by <name>, <date time>", "Voided by …", "Replaced by 1001 (edited)".
- Actions (writer, posted): **Edit** (E; `?replaces=<id>`), **Void** (V; `VoidDialog`: "A reversing entry is posted in the original period. The number is kept. The vendor credits it refunded are unapplied again."), **View journal entry** (J). Writer on a void refund, and a reader: View journal entry only.

### 3.8 States
Loading (`LoadingState` until access, settings, the vendor, the accounts and, for an id, the refund and its lines are ready); load error "Books could not load this vendor refund." with Retry for each failing read (merged recoveries); not found "This vendor refund does not exist" with a back link; `?replaces` of a refund that is not posted: "This vendor refund cannot be edited"; no write access on `/new`; offline: the bar's buttons disable while writes are unavailable.

### 3.9 Vendor credits, after this unit
- A vendor credit's `balance` is its total less its applications and less the lines of posted vendor refunds. Every screen that reads `balance` (Unapplied credit, the apply dialog's cap, the Pay Bills notice of unapplied credits) follows with no other change: a credit refunded in full leaves that notice.
- Read view totals: a **Refunded** row (with a minus sign; only when a posted refund names the credit) after **Applied**, then **Unapplied credit**.
- The **Applied to** block also lists each posted refund, in date order with the applications: "Vendor refund 1001 · Nov 17, 2026 · $50.00", a link that opens the refund. A refund row has no Remove: the refund is voided or edited on its own page.
- Badge (Q4): **Refunded** (success tone) when the balance is 0 and nothing is applied to a bill; otherwise the labels of p3-vendor-credit (Partly applied while 0 < balance < total, Applied at 0), where a refund counts as use of the credit.
- Action **Record refund** (R; writer, posted, `balance` > 0), after Apply to bills: opens `books/vendor-refunds/new?vendor=<vendor>&credit=<id>`. On a phone it sits in More; Apply to bills stays visible.
- The apply dialog's text for a vendor with no open bill becomes "Pacific Power has no open bills. The credit stays on the vendor until you post a bill or record a refund." and gains the Button "Record refund" beside "New bill".
- **Void of a vendor credit that a posted refund names is refused**: "A vendor refund is recorded on this credit. Void the refund first."
- **Vendor credit correction** with refund lines: the lines of posted refunds move to the correction with the applications (`movePostedLines`); refused when its total is below applications plus refunds ("$80.00 of this credit is applied or refunded. Its total cannot be below that."; the applications-only text stays when no refund names it) or when it changes the vendor ("A vendor refund is recorded on this credit, so its vendor cannot change."), or when its credit date is after the date of the earliest posted (not void; drafts do not count) refund that names the original, under `date`: "Vendor refund 1003 refunds this credit on Nov 15, 2026. Date the credit on or before that day." (the same day and an earlier day are allowed; checked inside `serialized`, before the lines move).

### 3.10 Cash basis (Q5)
- A refund line counts as a payment of the vendor credit at the refund date: it brings back that line's share of the credit's lines (memo "Vendor credit 1002 refunded (cash basis)"), by the share rule of the other payers. The rows read the refund's entry.
- So on the Cash method a credit that was never applied to a bill lowers the expense on the day the money came back. On Accrual it counts on its credit date, as before.

### 3.11 Elsewhere in Books
- Settings → Numbering gains a "Vendor refunds" card (sequence `vendor_refund`, no prefix, next 1001).
- Journal Entries, registers, entry drawer, General Ledger, Journal, Transaction Detail: Type "Vendor refund" (`entry_type_labels.json`), No. "1001", Name the vendor on both lines; Open goes to the refund; Edit opens its correction; Reverse is hidden. "Void reversal of 1001".
- Search: kind `vendor_refund`, title "Vendor refund 1001 · Pacific Power" / "Draft vendor refund · Pacific Power"; matches number, reference no., memo and the vendor's name.
- Vendor delete refused while the vendor is on any vendor refund: "<Vendor> is on vendor refunds. Make it inactive instead." (after the vendor credits check).
- Account delete refused for the Refunded to account of any refund: "This account is the refund account of 1 vendor refund and cannot be deleted. Make it inactive instead." / "… of 3 vendor refunds …".
- Audit log (labels "Vendor refund 1001", "Draft vendor refund", "Vendor refund 1001: Vendor credit 1002" for a line), OAuth scopes (rw vendor refunds and lines), `entryNouns("vendor_refund")`, `documentDocTypes`, `DOC_TYPES`, `DOC_TYPE_LABELS`, `lib/audit-record-route.ts`, the report source's doc-type option, `TestRegister_BindsEachPartOnce`, `tdDocumentPosters`.

### 3.12 Help
- New topic `help/vendor-refunds.md` (id `books:vendor-refunds`): when to record a vendor refund (the vendor sends money back for a credit, in place of applying it to a bill); record the vendor credit first; the steps (vendor, date, method, reference, Refunded to with bank, card and Undeposited funds, amount, the credits); one refund over several credits; Save draft / Post / Post & new; what posting does; Edit and Void; cash basis in one paragraph; the key list of §3.2 (Mac glyphs only). Cross-links: vendor credits ↔ vendor refunds, vendors, banking, reports.
- `help/vendor-credits.md`: Record refund, the Refunded row and badge, the void and correction rules. `help/reports.md`: refunds under "Accrual and cash basis".

## 4. Data
- New migration `<next>_create_books_vendor_refunds.js` (the branch ends with `2100000023_create_books_vendor_credits.js` and `2100000024_create_books_audit_log.js`; the plan lists `pb-migrations/` before it names the number, lesson 49). The audit view migration is renumbered so it stays last; its `LINES` list gains `['books_vendor_refund_lines', 'books_vendor_refunds', 'refund']`. The new migration holds:
  - `books_vendor_refunds`: vendor (relation books_vendors, required), status (select draft, posted, void; required), number (text ≤ 40, server), sequence (int, server), date (text day, required), payment_method (select, `PAYMENT_METHODS` keys, optional), reference_no (text ≤ 40), refunded_to (relation books_accounts, required), amount (int cents > 0), memo (text ≤ 4000), currency (server), entry (relation books_journal_entries, server), replaces, replaced_by (relation books_vendor_refunds), posted_by, posted_at, voided_by, voided_at (server), sort_key (hidden, server), created, updated. Rules as `books_payments`: list/view READ; create `WRITE && status = "draft"` with the server fields unset; update WRITE with the server fields unset and (draft, or posted → void); delete `WRITE && status = "draft"`. Index (vendor, status).
  - `books_vendor_refund_lines`: refund (relation, required, cascade), vendor_credit (relation books_vendor_credits, required), amount (int cents > 0), position (int). Index (vendor_credit). Unique (refund, vendor_credit). Rules as the refund's; writes refused once the refund is not a draft.
  - FTS table `fts_books_vendor_refunds` (record_id, number, reference_no, memo).
- Migrations edited in place (Books unreleased), for select values only: 2100000001 — `books_doc_sequences.doc_type` gains `vendor_refund`, seed row `booksseqvrefund` (15 characters), no prefix, next 1001; 2100000002 — `books_journal_entries.doc_type` gains `vendor_refund`.
- Server (Go):
  - `server/vendor_refunds.go`: the guards inside `serialized` — vendor exists (active at post); date a real day; reference_no ≤ 40; payment_method a known key; refunded_to exists, is active and passes `isRefundAccount` (type `bank` or `credit_card`, or detail type `undeposited_funds`); amount > 0 and ≤ `maxStoredAmount`; lines: the credit is posted and of the refund's vendor, appears once, amount > 0, at most 500 lines; the Books-written fields kept.
  - `server/vendor_refund_posting.go`: post, correction and void of §3.6.
  - `server/document_balance.go`: `vendorCreditBalanceKind.Payers` gains `{LinesCollection: "books_vendor_refund_lines", LineField: "vendor_credit", PaymentCollection: "books_vendor_refunds", PaymentField: "refund", CashMemo: "Vendor credit %s refunded (cash basis)"}`. The file's functions do not change: `paymentPayer`, `applyToDocuments`, `releaseLines`, `movePostedLines`, `verifyDocumentBalances` and `rebuildDocumentBalances` read it.
  - `server/cash_basis.go`: `vendorCreditCashDeferral` gains `PaymentDocType: docTypeVendorRefund`, so `postedPaymentsOf` finds the refund's posted entry.
  - `server/vendor_credits.go`: the void and correction refusals of §3.9.
  - `entry_routes.json`, `entry_type_labels.json`, `documentDocTypes`, `entryNouns`, the vendor and account delete guards, search source, audit, OAuth, numbering, `TestRegister_BindsEachPartOnce`, `tdDocumentPosters`.
- Client reads (each `useLiveQuery` with an explicit `queryKey`; row types derive from the queries):
  - Refund by id (`findOne`) with `materialize()` of posted_by / voided_by; its lines ordered by position with `materialize()` of the vendor credit.
  - Refundable credits: `books_vendor_credits` where `vendor = v`, `status = 'posted'`, `balance > 0`, ordered by date, number; a draft's named credits through its lines query; the hook merges the two by credit id.
  - Refunds of a credit (the credit read view's block and Refunded row): `books_vendor_refund_lines` where `vendor_credit = id`, with the refund through `materialize()`; lines of a refund that is not posted are dropped in JS after the query.
  - The vendor by id (`useRecord`), vendor options (the vendor picker's query), refund accounts (`useRefundAccounts`, query key `books.form.refundAccounts`), settings (currency).
- Seed (`seed.ts`, through the fixture `lib/vendor-refund-fixture.ts`): one new posted vendor credit of a vendor with no other seeded credit and no open bill, with a posted refund of part of it to Business Checking and a draft refund of the rest; one void refund. All dated after mid-2026. No seeded credit of p3-vendor-credit changes its balance. The plan greps every report, register, pay-bills, vendor-credit and vendor spec that reads account 1000, account 2000, the credited expense account and the Pay Bills credits notice before adding them (lessons 1, 23).
- E2E: specs create their own vendor credit and refund through the UI with a unique memo and open them by Books search; one phone-width run (390 × 844) covers the stacked band, the credit cards, "Refund all" and More.

## 5. Cut
- A refund as a line of the Bank Deposit ("Add funds to this deposit": Received from, Account, Description per line) (Q1) — the refund is its own document, so the vendor is in the header, the account is always Accounts payable, and no second step links it to the credit.
- The deposit's list of received customer payments, Select all / Clear all, paging — p2-bank-deposit.
- Cash back (account, memo, amount) — p2-bank-deposit.
- "Track returns for customers" — not a Books concept.
- Several vendors in one refund — one refund, one vendor.
- A free description per line — the memo covers it; a line names its vendor credit.
- Drag grip, "Add lines", "Clear all lines", the per-line delete icon — the rows are the vendor's credits; tick boxes, "Clear refunds" and "Refund all" cover them.
- A refund that names no vendor credit (Q2) — Accounts payable for a vendor moves only through a document; the writer records the vendor credit first.
- A refund of a purchase that was never in Accounts payable (an expense paid by card) — that is money in against the expense account: a journal entry now, a Bank Deposit line in p2-bank-deposit.
- "Clear", "Print", the split save button ("Save and new", "Save and close") — Cancel, and Save draft / Post / Post & new as every Books document.
- "Make recurring" — recurring transactions are v1.1.
- Title-bar history, Feedback and close (X) — Cancel and the stack's back cover them.
- Copy, PDF, email and attachments of a refund — spec §Scope gives attachments to bills and expenses and PDFs to sales documents.
- Vendor refunds list, vendor page Transactions row — p3-purchase-lists, p3-vendor-pages.

## 6. Platform notes
Standing approval for every Books form (human, 2026-11-11): keyboard shortcuts on web and iOS with a hardware keyboard (Android uses visible buttons and menus) — the new key R and the form's keys included, each with a visible button, tick box or link; first-field autofocus and type-to-open pickers on web only (native opens a picker by tap). No new platform item.

## 7. Sparks carried
- The amount of money that arrived is the largest figure: `DocumentHeader` big figure "Amount refunded".
- The account's balance beside the account pick: `PaidFromBalance` under Refunded to.
- No core extension.

## 8. Non-goals
- No change to Pay Bills, bills or bill payments.
- No Bank Deposit. A refund put in Undeposited funds waits there for p2-bank-deposit, which lists posted vendor refunds with the received payments (Q3).
- No 1099 effect: the 1099 totals are p5-1099-report's.
- No report source for purchase documents (p5-ap-aging, p5-vendor-balance).
- No multi-currency refund.
- No change to the receive-payment form's look or behavior.
- No refund paid to a customer (p2-refund-receipt).

## 9. Engine reach (self-review)
- Header and action bar: Books `DocumentHeader` / `DocumentActionBar` through `DocumentChromeContext` (`VENDOR_REFUND_CHROME`), core `ShortcutButton`, `useShortcutScope`, `useRegisterShortcuts` (`@tinycld/core/lib/shortcuts`).
- Fields: Books `SearchPicker` (vendor), core `DateField` (`@tinycld/core/ui/forms/fields/DateField`), core `SelectInput` with `SelectOption.indent`, core `TextInput`, `TextAreaInput`, Books `MoneyInput`, Books `PaidFromBalance`, `PaymentMethodSelect`.
- Validation and refusals: `useForm` + `zodResolver` + `FormErrorSummary` (`@tinycld/core/ui/form`), `.superRefine` for the sum rules, the payment refusal handler pattern (`lib/payment-refusals.ts`) for `lines.<n>`.
- Credits table: Books `OutstandingGrid` / `OutstandingCards` / `PaymentCell` with `REFUND_OUTSTANDING`; the descriptor gains the date column's header, the open column's header and card label, and an overdue switch, which the grid has as fixed texts today ("Due date", "Open balance", "Overdue"). Width switch: core `useContainerWidth`.
- Writes: `useMutation` (`@tinycld/core/lib/mutations`), core `planTableWrites` (`@tinycld/core/lib/forms/table-rows`), a synchronous Zustand save flag.
- Reads and recovery: `useLiveQuery` with `queryKey`, `materialize()`, `useRecord`, `recoverLiveQueries`, Books `mergeRecoveries`.
- Dialogs: Books `DiscardDialog`, `DeleteDraftDialog`, `VoidDialog` (core `Dialog`).
- No bullet needs a core API that does not exist. No core change.
