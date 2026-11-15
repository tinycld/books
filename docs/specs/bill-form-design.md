# Bill form — design

Unit p3-bill · package books · feature `bill-form`. Built against books `books/p2-estimate`@1c2a9f0 (p2-estimate PR #43, not merged), core 7545389. Approved at the design gate by the human on 2026-11-13: Direction A (two line tables), the "Bill lines" setting (§3.11), the narrowed account picker (§3.4), and the packet's recommended answers to every other question. "Q<n>" points to the packet's question.

## 1. Goal
A writer records a bill a vendor sent — vendor, dates, terms, the vendor's bill number, lines that charge expense accounts or buy products — saves it as a draft and posts it, which credits Accounts payable and debits each line's account, using the same transaction form layout as the invoice.

## 2. Where it lives
- Routes: `/a/books/bills/new` (query `?vendor=<id>`, `?copy=<id>`, `?replaces=<id>`, `?fresh=`), `/a/books/bills/[id]`. Screens `screens/bills/new.tsx`, `screens/bills/[id].tsx`, each a `DocumentScreen` of the new kind `BILL_DOCUMENT`. Both are pushed pages; `hidesNewFab` gains `bills`.
- A draft opens in the form; a posted or void bill opens in the read view.
- + New menu → Vendors column → "Bill", after "Vendor" (`lib/shell-nav.ts`, id `bill`).
- Books search finds bills (kind `bill`, drafts included).
- Journal Entries list, account registers, General Ledger and the entry view open a bill's entry at `books/bills/<id>` (`lib/entry-route.ts`).
- Settings gains a "Purchases" section (after "Sales") with a "Bills" card holding the "Bill lines" setting (§3.11).
- No list screen (p3-purchase-lists), no sidebar entry, no vendor page link (p3-vendor-pages).

## 3. Behavior

### 3.1 Shared layer (Q1)
- The bill is the fourth kind of the shared document layer (`SalesDocumentKind` / `DocumentKind`, `components/documents/*`, `hooks/useDocument*`, Go `salesDocKind`). The layer gains, per kind:
  - a **party**: `customer` (invoice, sales receipt, estimate) or `vendor` (bill) — the header field, its collection, its address fill, the "Edit <party>" link, the inactive-party refusal, and the party named on every journal line;
  - its **line tables**: one (`lines`, the sales kinds) or two (`account_lines` and `item_lines`, the bill), all summed into one set of totals, and a per-kind function that says which tables the form shows (the sales kinds: always `lines`; the bill: §3.11);
  - whether it has **sales tax**, a **message to the customer**, an **email**, and a **PDF** (the bill has none of the four);
  - its **posting side**: the sales kinds debit the control account (A/R or the deposit account) and credit the lines; the bill credits Accounts payable and debits the lines.
- The invoice, sales receipt and estimate behave exactly as before and their unit and e2e tests stay green. No bill file copies a layer file. Names of the layer are kept (no rename of `SalesDocumentKind` / `salesDocKind`); their comments say the layer serves purchase documents too.

### 3.2 Keyboard (speed first, carried from p2-invoice)
- On new, draft, correction and copy the Vendor picker has focus (web, every width). Pickers (Vendor, Account, Product) are Books `SearchPicker`s and open by typing (web); native opens a picker by tap.
- Tab order: Vendor → "Edit address" → "Edit vendor" (each only while it shows) → Terms → Bill date → Due date → Vendor's bill no. → account line 1 (Account → Description → Amount → row menu) → … → "Add account line" → product line 1 (Product → Description → Qty → Rate → row menu) → … → "Add product line" → Memo → action bar. A table that is not shown (§3.11) has no Tab stops. Picking a vendor moves focus to Terms.
- Enter in Amount of the last account line adds an account line and focuses its Account picker; Enter in Rate of the last product line adds a product line and focuses its Product picker (core `addOnSubmit`; native return key the same).
- Keys, ⇧? group "Bill": Post ⌘↵, Post & new ⌘⇧↵, Save draft ⌘S, Cancel Esc, Delete draft ⌘⌫ (`FORM_KEYS`); Add account line ⌥↵ (the account table's add button, registered only while that table shows); Add product line ⌥P (the product table's add button, registered only while that table shows); the core row keys on the focused line (remove, move up/down, duplicate, open menu). Read view: Edit E, Void V, Copy C, View journal entry J.
- Every action button that has a key is a core `ShortcutButton` with `scopeOwner` from the screen's `useShortcutScope`.

### 3.3 Header band
- Built-ins of the forms host `books:bill`, drawn by Books components in the band:
  - Row: **Vendor** (required, locked; active vendors; `VendorField`), **Mailing address** (the vendor's `address` as a text snapshot, with "Edit address" revealing the address inputs and "Edit vendor" pushing `books/vendors/<id>`; `MailingAddressField`). Halves.
  - Row: **Terms** (the vendor's terms on pick; `DocumentTermsField`), **Bill date** (required, default today; `DocumentDateField`), **Due date** (required; from Terms and Bill date; a typed date is kept; not before the bill date — "Due date can't be before the bill date."; `DueDateField`), **Vendor's bill no.** (optional text ≤ 40, hint "The number on the vendor's bill"; `VendorRefField`). Each a quarter on a wide form, halves under 640 px. Custom fields follow Vendor's bill no.
- Picking a vendor fills Mailing address and Terms (Due date follows; a vendor with no terms gives Due date = Bill date). When the Account details table shows and its first line has no account, the pick also puts the vendor's default expense account on that line — only when that account is one the Account picker lists (§3.4); otherwise the line stays empty. Changing the vendor again refills Mailing address and Terms only (Q8).
- Title: "New bill", "Draft bill", "Edit 1003" (a correction), "Bill 1003" (read view), with the status badge Draft / Posted / Void (`StatusBadge`, posting tones). The big figure top right is **Balance due** (= Total in this unit; Pay Bills changes it later), "—" while invalid, "Too large" over the stored-amount limit. `HelpIcon topic="books:bills"`.
- No tabs: a bill has no PDF view and no email view (Q10), so `DocumentTabs` is not drawn and ⌥1 / ⌥2 are not registered.

### 3.4 Lines (Q4–Q7)
- Two table built-ins, each under its own section heading, stacked in this order; §3.11 decides which of them show:
  - **Account details** (`account_lines`): one row kind `account` with columns **Account** (required; `SearchPicker` of the active accounts of type `expense`, `other_expense` or `cost_of_goods_sold`, chart order, indented, "<number> <name>"), **Description** (≤ 4000, grows to 3 lines), **Amount** (required, typed money, may be negative, not 0).
  - **Product and service details** (`item_lines`): one row kind `item` with columns **Product or service** (required; active Service or Non-inventory products with "I purchase this" on — `purchases` true), **Description**, **Qty** (> 0, 2 decimals), **Rate** (money ≥ 0), **Amount** (display only, Qty × Rate rounded to cents by the shared money helper; the server writes it). Picking a product fills Description with its purchase description and Rate with its cost; a typed value is replaced only while the cell is empty.
- Starting lines of a new bill: setting Both — one empty account line, and the product table shows its heading, the column headers and "Add product line" with no line; setting Accounts — one empty account line; setting Products — one empty product line.
- No description, subtotal or percent rows on a bill, no drag grip, no "Clear all lines" (Q6).
- Each line has one row menu button (Insert line above, Insert line below, Move up, Move down, Duplicate, Remove), as the invoice.
- An empty trailing line of either table (nothing picked or typed) is dropped at save.
- At most 250 lines in the two tables together (server bound, "A bill holds at most 250 lines.").
- Wide (lines container ≥ 640 px): a grid per table with its own headers and the Amount column at the same width and position in both tables, so totals align under it. Phone: each line is a card (kind label, fields stacked, Amount right-aligned, row menu top right).

### 3.5 Footer and totals
- Left: **Memo** (textarea ≤ 4000, hint "Only your team sees this. Saved as the journal entry memo."). No message field (a bill prints nothing).
- Right, under Amount: **Account lines** subtotal, **Products and services** subtotal (each only when its table has a line with an amount), **Total** (`border-t`, `font-semibold`), **Balance due** (= Total).
- Totals are computed on every change by the shared totals helper, mirrored in Go. Total ≥ 0 at every save ("A bill total cannot be below zero. Use a vendor credit."), ≤ the stored-amount limit; Post refuses a zero total ("A bill total must be more than zero to post.").

### 3.6 Saving
- Validation: one zod schema for the kind through the forms engine (`FormHostUi.schemas`) and `zodResolver`; Save draft and Post use it. Post adds a line-count rule (a `superRefine` on the post variant) shown under the first shown table, its text by the shown tables: both — "Add at least one account or product line", Account details only — "Add at least one account line", Product and service details only — "Add at least one product line".
- Action bar, sticky: wide — Cancel, Save draft, Post & new, Post (primary), More (Delete draft, on saved drafts), as the approved reference and the shared layer (human, 2026-11-13); phone — Cancel, Save draft, Post, More (Post & new, Delete draft). As the invoice's bar without Download PDF.
- Save writes through `useMutation`: insert/update the `books_bills` row, then the line plan of each shown table (one `books_bill_lines` collection, `kind` account/item), then for Post `status: 'posted'`. The form is held through the write by the document save store. A post refused after the draft was written leaves the draft and shows the refusal.
- Revision conflict: a draft bill has a `revision` that counts the saves that changed it. Every Save draft and Post of a saved draft states the revision the form loaded. The server refuses a stale save with a 409 ("This bill changed after you opened it. Load it again, then review it before you save or post."), and the form refuses one itself when the stored draft has moved on. The refused save writes nothing (a new bill's refused post keeps the draft its first step wrote), and the typed values stay. The form then shows the notice "This bill changed after you opened it. Load the current bill, then review it before you save or post." with the action **Load the current bill**, which replaces the typed values with the stored bill. As help/bills.md ("When someone else changed the draft").
- After Post: replace with `books/bills/<id>` (read view). Post & new: replace with a fresh `books/bills/new` (keeps `?vendor` only when opened with it). Save draft stays at `books/bills/<id>`.
- Cancel with edits opens the discard dialog; Delete draft opens the delete-draft dialog ("Delete this draft bill? This can't be undone.").
- Refusals: "Account line n: …" / "Product line n: …" under that row; Vendor, Due date, Vendor's bill no. under their fields; everything else (close date, sequence, totals limit) in `FormErrorSummary`, with PocketBase's final period.
- Every save (draft and post) refuses an account line whose account is not of type `expense`, `other_expense` or `cost_of_goods_sold` ("Account line 2: Office equipment is not an expense account. Choose an expense or cost of goods account.").
- Post refuses an inactive vendor ("<Vendor> is inactive. Choose an active vendor.", under Vendor), an inactive account or product on a line ("Account line 2: Utilities is inactive. Choose an active account."), a product without "I purchase this" ("Product line 1: <name> is not purchased. Turn on “I purchase this” for it first."), a product whose expense account is inactive ("Product line 1: the expense account of <name> is inactive. Choose an active one on the product or service."), and the bill date on or before the close date (the ledger's refusal). A correction keeps its original's vendor even when now inactive.
- Duplicate vendor's bill no. (Q3): saving a bill whose Vendor's bill no. another non-void bill of the same vendor already has is refused under the field: "Pacific Power already has bill no. 88412 (Bill 1003)." A draft that has no number yet is named "a draft bill". An empty bill no. is never a duplicate. Comparison is exact after trimming.
- The server does not read the Bill lines setting: it accepts lines of both kinds on every bill.
- Writers only (bookkeeper or admin). Without write access, `books/bills/new` shows "You need bookkeeper access to create bills".

### 3.7 Posting (server)
- In one transaction (`serialized`): allocate the number from the `bill` sequence; create the journal entry (`doc_type bill`, `origin document`, `document = bill.id`, `date` = bill date, `memo`) with lines: one debit per account — each account line's account and each product line's product expense account, amounts summed per account, in chart order (a negative sum is a credit) — and one credit to Accounts payable for the total; every line names the bill's vendor in `vendor` (`customer` empty). Then post it through `postEntry` (close date, balance, accounts, numbering). Set `entry`, `number`, `posted_by`, `posted_at`.
- Accounts payable is the first active `accounts_payable` account in chart order; a chart with none gets "Accounts payable" (number 2000 when free) inside the posting transaction (`ensurePayables`, as `ensureReceivables`).
- A product line's account is read at posting from the product's `expense_account`.

### 3.8 Read view (posted or void)
- `DocumentReadView` with the bill's details: Vendor, Mailing address, Terms, Bill date, Due date, Vendor's bill no.; each line table that has lines, read-only (grids wide, cards phone), whatever the Bill lines setting; totals; memo; "Posted by <name>, <date time>"; for void "Voided by …"; for a replaced original "Replaced by 1003 (edited)".
- Actions (writer, posted): **Edit** (`?replaces=<id>`: a correction that keeps the number), **Void** (dialog: "A reversing entry is posted in the original period. The number is kept."), **Copy** (`?copy=<id>`: same vendor, mailing address, terms, lines of both tables and memo; today's bill date, due date from terms, empty vendor's bill no.), **View journal entry**. Writer on a void bill: Copy, View journal entry. Reader: View journal entry only.

### 3.9 States
- Loading, load error with Retry for each failing read (merged recoveries, the settings read included), not found ("This bill does not exist"), `?replaces` of a bill that is not posted ("This bill cannot be edited"), no write access on `/new`: the document layer's states.
- Offline: the bar's buttons disable while writes are unavailable (`useWritesAvailable`).

### 3.10 Elsewhere in Books
- Settings → Numbering gains a "Bills" card (sequence `bill`, no prefix, next 1001).
- Settings → Purchases (§3.11).
- Journal Entries, registers, entry drawer, General Ledger, Journal report: Type "Bill", No. "1003", Name the vendor on every line; Open goes to the bill; Edit opens the bill correction; Reverse is hidden. Void reversal "Void reversal of 1003".
- Search: kind `bill`, title "Bill 1003 · Pacific Power" / "Draft bill · Pacific Power"; matches number, vendor's bill no., memo and the vendor's name.
- Vendor delete refused while the vendor is on any bill: "<Vendor> is on bills. Make it inactive instead." (before the journal-lines check).
- Product delete refused while on a bill line (`productReferences`).
- Account delete refused while on a bill account line: "This account is on 1 bill and cannot be deleted. Make it inactive instead." / "… on 3 bills …".
- Audit log, OAuth scopes and every other registry the invoice joined include `books_bills` and `books_bill_lines`.

### 3.11 Bill lines setting
- Settings → **Purchases** section (id `purchases`, after Sales; every Books user sees it; section-list line "Bill lines: Accounts and products" / "Bill lines: Accounts only" / "Bill lines: Products only"). It holds one card **Bills** with the select **Bill lines**: "Accounts and products" (`both`, the default), "Accounts only" (`accounts`), "Products only" (`products`), and the card's own Save, as the other Settings cards.
- Only a Books admin edits it, the same gate as every other Settings card (the `isAdmin` prop that `SettingsShell` passes to each section, as `SalesSection` uses it); every other user sees a read-only row. The server enforces the same through the existing `books_settings` update rule (§4). Decided by the human 2026-11-13.
- The form: `useForm` with `zodResolver` over `z.object({ purchase_lines: z.enum(['both', 'accounts', 'products']) })`; save through `useMutation` on `books_settings`; a server refusal goes to the form through `handleMutationErrorsWithForm` and shows in `FormErrorSummary`.
- The bill form shows a table when the setting includes it, or when the bill it opens with already has a line of that table (a saved draft, the original of a correction, the source of a copy). Once shown in a form session a table stays shown, even after its last line is removed. So editing an older bill never loses lines.
- Only the bill reads the setting in this unit. The field is named `purchase_lines` so p3-expense and p3-vendor-credit can read it later; neither is built here.

### 3.12 Help
- New topic `help/bills.md` (id `books:bills`, linked by the form's `HelpIcon`): how to enter a bill (vendor, dates, terms, vendor's bill no.), account lines and product lines and when to use each, negative account lines for a vendor discount, Save draft / Post / Post & new, Edit (correction), Void, Copy, the duplicate bill no. refusal, the Bill lines setting (Settings → Purchases, who can change it, that a hidden table still shows on a bill that has its lines), and the key list of §3.2 (Mac glyphs only).

## 4. Data
- New migration `2100000013_create_books_bills.js`:
  - `books_bills`: vendor (relation books_vendors, required), status (select draft, posted, void; required), number (text ≤ 40, server), sequence (int, server), date (day, required), due_date (day, required), terms (select PAYMENT_TERMS keys, optional), mailing_address (json, address shape, 8 KB), ref_no (text ≤ 40), memo (text ≤ 4000), subtotal, total (int cents, server), currency (server), entry (relation books_journal_entries, server), replaces, replaced_by (relation books_bills), posted_by, posted_at, voided_by, voided_at (server), form, fields, sort_key (hidden, server), created, updated. Rules as the invoice: list/view READ; create WRITE with status draft and server fields unset; update WRITE, server fields unset, and (draft, or posted → void); delete WRITE and draft.
  - `books_bill_lines`: bill (relation, required, cascade), kind (select account, item), account (relation books_accounts), product (relation books_products), description (≤ 4000), quantity (2 decimals), rate (int cents), amount (int cents; typed on an account line, server-computed on an item line), position (int). Writes refused once the bill is not a draft.
  - FTS table `fts_books_bills` (record_id, number, ref_no, memo).
- Migrations edited in place (Books unreleased):
  - 2100000001 — `books_doc_sequences.doc_type` gains `bill`, seed row with a 15-character id (`booksseqbill…`), no prefix, next 1001. `books_settings` gains `purchase_lines` (select `both`, `accounts`, `products`; required; the seeded row is `both`); its existing Books admin update rule covers it, with no new clause.
  - 2100000002 — `books_journal_entries.doc_type` gains `bill` (create rule keeps refusing every document doc type).
- Server (Go): a `billKind` of `salesDocKind` (posting lifecycle, party vendor, two line kinds, credit side) in `server/bills.go`; the account-line type check (§3.6); `ensurePayables` in `document_posting.go`; `documentDocTypes` += bill; `entryNouns("bill")`; `entry_type_labels.json` docTypes `bill: "Bill"`; duplicate ref check; vendor, product and account delete guards; search source; audit; OAuth; `TestRegister_BindsEachPartOnce` list.
- Forms host `books:bill` (`forms/hosts.ts`): built-ins vendor, mailing_address, terms, date ("Bill date"), due_date, ref_no ("Vendor's bill no."), account_lines, item_lines, memo; layout as §3.3; custom fields insert before `account_lines`.
- Reads: the bill's data source `hooks/bill-data.ts` (its `useStore` calls), as `invoice-data.ts`, plus `books_settings` through the existing `useBooksSettings`; the vendor through `materialize()` / its own live query; accounts for the Account picker through the existing `books.form.accounts` query filtered to the three types; products through the product picker's query.
- Seed (`seed.ts`, through the fixture `lib/bill-form-fixture.ts`): one draft bill (Pacific Power, account 6900, due on receipt), two posted bills dated after mid-2026 (Office Supply World with account and product lines; Summit IT Services, one account line), one void bill; the seeded `books_settings` row has `purchase_lines` `both`. The plan greps every report and register spec that reads accounts 2000, 6400, 6900 and the seeded products before adding them (lessons 1, 23).

## 5. Cut
- "Save and schedule payment", paying a bill, payments and a balance after payment — p3-pay-bills.
- "Make recurring" — recurring transactions are v1.1.
- Attachments — p3-attachments.
- Bills list, filters, Open/Paid/Overdue statuses — p3-purchase-lists and p3-pay-bills.
- Collapsible sections (the triangles) — both sections are short, and the Bill lines setting hides a table a company does not use; collapse adds a Tab stop and a state for no gain.
- Drag grip — the row menu and row keys reorder on every platform (as the invoice).
- "Clear all lines" and the form-wide "Clear" — Cancel discards the form; a row menu removes a line.
- "Permit no." — not a US federal field; custom fields cover it.
- Customer / billable column on lines (billable expenses) — not in spec scope.
- Sales tax on a bill — Books sales tax covers sales; use tax is not in scope.
- PDF, print and email of a bill — the spec's PDF list does not name bills.
- Description, subtotal and percent rows — a bill copies the vendor's bill; discounts are a negative account line.
- Title-bar gear and close (X) — Cancel and the stack's back cover them.
- The Bill lines setting's use by expenses and vendor credits — p3-expense and p3-vendor-credit.

## 6. Platform notes
Standing approval for every Books form (human, 2026-11-11): keyboard shortcuts on web and iOS with a hardware keyboard (Android uses visible buttons and menus); Vendor autofocus and type-to-open pickers on web only (native opens a picker by tap). No new platform item.

## 7. Sparks carried
- Amount owed is the largest figure: `DocumentHeader` big figure "Balance due".
- Two separate line groups: two core table built-ins, each under a Books section heading (`text-sm font-semibold text-foreground`), the Amount column at one shared width so the totals align under both.
- No core extension.

## 8. Non-goals
- No payment, balance after payment or aging (p3-pay-bills, p5-ap-aging).
- No 1099 effect at posting (1099 counts payments; p3-pay-bills).
- No PDF or emailing.
- No multi-currency bill.
- No change to how the invoice, sales receipt and estimate look or behave.
- No server refusal of a line kind the Bill lines setting hides.

## 9. Engine reach (self-review)
- Two tables in one form: core `lib/forms/values.ts` keys table values by field key (`out.tables[f.key]`); each `TableField` registers its row keys per instance (`use-table-field.ts`, id `table.<instance>.<name>.<key>`, gated on its focused row); the first kind's key belongs to each table's add `ShortcutButton`, so the two tables take different add keys (⌥↵, ⌥P).
- A table hidden by the Bill lines setting: Books `hideBuiltins` (lib/form-definition.ts) passes `FormRenderer` a definition copy with that table built-in hidden, as products hide built-ins by kind; a hidden built-in draws nothing, has no Tab stops and registers no keys, and the save writes only the shown tables' plans.
- Typed Amount on an account line and computed Amount on a product line: Books cell components (`LineAmountCell` variant per table), not core.
- Account and product line refusals inline: the Books `useRecordSave` rows step (`tableWriteSteps` / `createTablePlans`) per table, with each table's row label.
- Due date not before bill date, and the post line-count rule: `.superRefine` of the kind's zod schema (`lib/document-schema.ts`), as the invoice's.
- Settings card: core `useForm` + `zodResolver`, `SelectInput`, `FormErrorSummary`; the admin gate is the section's `isAdmin` prop from `SettingsShell`.
