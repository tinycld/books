# Vendor pages

Status: APPROVED at the design gate 2026-11-18 (auto-helix unit p3-vendor-pages): direction A; every open question Q1–Q20 accepted as recommended. Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Interface ("Customer and vendor pages: balance header, New transaction menu, tabs (Transactions, Statements, Contacts, Details, Notes), edit in place, one notes store"). Contracts honored: customer-pages-design §5 (p3-vendor-pages adds vendor rows to `books_party_balances`; reuses `RecordTabs`, `books_party_contacts`, the balance parts, the save bar and the record surface width); vendor-form-design ("p3-vendor-pages grows this child later; there is no `/edit` sub-path"); bill, expense, vendor-credit, vendor-refund and pay-bills specs (`?vendor=<id>` on their new routes). Built against books main@94fb5837, core main@470a6f7. Qn = the packet's open question n; each statement below is the recommended answer.

## 1. Goal
Opening a vendor shows a page about that vendor: who they are and how to reach them, what the business owes them, every purchase document for them, their contact people, and their details and notes, all editable in place, with one menu to start a new transaction for them.

## 2. Where it lives
- Route: `books/tinycld/books/screens/vendors/[id].tsx` → `/a/books/vendors/<id>` (unchanged URL). Its content changes from `VendorChild` (the vendor form) to `VendorPage`. `screens/vendors/_layout.tsx`, `index.tsx` and `new.tsx` keep their files; `new.tsx` keeps `VendorChild`.
- The selected tab is the `tab` search param: `transactions` (default, no param), `contacts`, `details`, `notes`. A reload or a shared link keeps it. An unknown value selects Transactions.
- Surface (Q16): the built customer rule. On a window of 1360 px or more with a vendor page open, the Vendors list narrows to the 320 px name column (`listLayoutFor`, `PartyList` layout `names`) and the page fills the rest (at 1360: 716 px). `vendors/new` keeps the 480 px panel beside the full list. Below 1360 px the page covers the list; on phones it is a pushed page. `screens/vendors/_layout.tsx` passes `detailWidth` `'record'` for `open.kind === 'id'` and `'panel'` otherwise, as `screens/customers/_layout.tsx` does; `VendorsList` takes a `layout` prop.
- Shared page parts (Q18). The customer page's parts that hold no customer rule move to `components/party/page/` and take the party (`'customer' | 'vendor'`), the record id and a test-id prefix. Customers move onto them with no behavior change and keep their `customer-…` test ids; the customer-pages e2e specs guard that, unchanged. Vendor test ids start with `vendor-…`.
  - `components/party/page/`: `PartyBalance.tsx`, `PartyContactActions.tsx`, `PartyContactsTab.tsx`, `ContactPersonDialog.tsx`, `PartyDetailsTab.tsx`, `PartyNotesTab.tsx`, `PartyPageSaveBar.tsx`, `PartyPageHeader.tsx` (back link, name row, identity lines as a slot, the balance and action slots, the phone stack), `PartyTransactionsList.tsx` (chips, table, cards, empty, loading and error states over `PartyTransactionRow`), `NewTransactionMenu.tsx`, `PartyTabs.tsx`.
  - `hooks/usePartyPage.ts` (the Details and Notes forms above the tabs, save order, cancel question, leave guard, delete dialog state, New transaction menu state), `hooks/usePartyNotesForm.ts`, `hooks/usePartyBalance.ts` (takes the party), `hooks/usePartyContacts.ts` (takes the party).
  - `lib/party-page-tabs.ts` (tab keys, labels, ⌥ keys, `partyTabOf`), `lib/party-notes-schema.ts`.
- New vendor files: `components/vendors/page/VendorPage.tsx`, `VendorMoreMenu.tsx`, `VendorIdentity.tsx`; `hooks/useVendorPage.ts`, `hooks/useVendorTransactions.ts`; `lib/vendor-page-tabs.ts` (`vendorPageControls`), `lib/vendor-transactions.ts` (pure row mappers and status rules for the five purchase kinds), `lib/vendor-page-fixture.ts`; `help/vendor-pages.md`.
- Server: one new migration, `pb-migrations/<next free number>_add_vendor_party_balances.js` (the number is taken when the plan is written); `server/party_balances_test.go` gains vendor cases. No new Go file.

## 3. Behavior

### 3.1 Header
- Left: the display name as the page title (`text-2xl font-semibold`), then the Email and Call icon buttons beside it (spark 2), each only when the vendor has that value: Email opens `mailto:<email>`, Call opens `tel:<phone>` (phone, else mobile) through React Native `Linking.openURL`. Under the name: the company name when it differs from the display name, then the vendor's address on up to three lines (`formatAddressLines`), muted. An inactive vendor shows the `StatusBadge` "Inactive" beside the name.
- Right: the balance block (§3.2), then the actions row: **New transaction** (§3.3) and **More** (§3.8).
- Page surface: a back button "‹ Vendors" above the title (`leave`). Record surface (very wide): no back button; the names column is beside it.
- Phone: the header stacks — name and icons with More as an icon button at the top right, company and address, the two figures side by side, then New transaction as a full-width button.
- The header shows no notes, no account number, no payment terms and no payment-service line (Q17); they are in the Details and Notes tabs.

### 3.2 Balance (Q2, Q3, Q4)
- Two figures: **Open** — the vendor's accounts-payable balance from the ledger (every posted journal line on an `accounts_payable` account that names this vendor, credits minus debits), so bills raise it and bill payments and vendor credits lower it; and **Overdue** — the sum of `balance` over this vendor's posted bills whose due date is before today (`todayIso`) and whose `balance` is above 0. Each is a large figure with a small uppercase label and a 3 px left marker: `border-warning` for Open, `border-danger` for Overdue.
- Open reads this vendor's row of the `books_party_balances` view (§4) through `usePartyBalance({ party: 'vendor', id })`: one `useLiveQuery` with `where vendor = id` and `.findOne()`; no row means $0.00. The view is live through its change signal, so a post, payment or void anywhere in Books updates the figure on an open page with no reload.
- Overdue is one live query over `books_bills` (`vendor = id`, `status = 'posted'`, `due_date < today`, `balance > 0`); the hook sums `balance` with the shared cents helper (`overdueCents`).
- Loading: both figures show "—" until both reads and the Books settings (the currency) are in. A failed read shows "Balance unavailable" with a Retry link (one `recoverLiveQueries` call, `mergeRecoveries`).
- Zero shows "$0.00" with the label "Open". A negative Open (the vendor owes the business: unapplied credits above open bills) shows as "−$120.00" with the label "Credit" (`balanceFigures`, unchanged).

### 3.3 New transaction menu (Q5, Q6)
- A core `ShortcutButton` "New transaction" with a chevron opens a controlled core `Menu` (`presentation: 'auto'`: a sheet titled "New transaction" on the mobile breakpoint) of the `NEW_ACTIONS` that take a vendor, in `NEW_ACTIONS` order: **Bill**, **Pay bills**, **Expense**, **Vendor credit**, **Vendor refund**. Each opens its route with `?vendor=<id>` (`books/bills/new`, `books/pay-bills`, `books/expenses/new`, `books/vendor-credits/new`, `books/vendor-refunds/new`), pushed, so Back returns to this page. `lib/transaction-actions.ts` takes the party: it lists the actions flagged `takesVendor: true` (a new `NEW_ACTIONS` flag beside `takesCustomer`) and builds the href with the party's param name.
- Shortcut ⌥N opens the menu (scope `modal`, `allowInInputs`), as on the customer page.
- Hidden for read-only users. For an inactive vendor the button is disabled with the hint "Make this vendor active to add transactions." (bill, expense, vendor-credit and vendor-refund posts refuse an inactive vendor with `msgVendorInactive`).

### 3.4 Tabs (Q7)
- `RecordTabs` under the header: **Transactions**, **Contacts**, **Details**, **Notes**. A vendor page has no Statements tab: a statement is a document sent to a customer.
- ⌥1–⌥4 select the tabs from anywhere on the page, a text field included. On phones the strip scrolls sideways and the selected tab scrolls into view.
- Only the selected tab's body is mounted; the Details and Notes form state lives in the page hook above the tabs, so switching tabs keeps unsaved edits.

### 3.5 Transactions tab (Q8–Q11)
- One list of this vendor's bills, expenses, bill payments, vendor credits and vendor refunds, newest first (date desc, then `created` desc). A void original that a correction replaced (`status = 'void'` and `replaced_by` set) is left out; a plain void stays, with a Void badge.
- Wide columns: Date, Type, No., Due date (bills only; "—" otherwise), Total, Status. No. is the document's Books number. A vendor credit's total shows negative (it lowers what is owed); every other kind shows positive. Phone, and any width below the table's own minimum (640 px): cards with type and number, date, total, status.
- Status (`StatusBadge`):
  - bill, the first rule that applies winning, as the invoice rule: Draft (muted), Void (muted), Paid (success, balance 0), Partly paid (warning, balance below total), Overdue (destructive, due before today), Open (warning);
  - expense: Draft / Paid (success) / Void;
  - bill payment: Paid (success) / Void (a bill payment has no draft);
  - vendor credit: Draft / Unapplied (warning, balance above 0) / Closed (success, balance 0) / Void;
  - vendor refund: Draft / Received (success) / Void.
- Type chips: All, Bills, Expenses, Bill payments, Vendor credits, Vendor refunds (`useState` local to the tab; not in the URL; All when the page mounts). The chip row scrolls sideways on a narrow page.
- Pressing a row opens the document (`documentHref`, push): `books/bills/<id>`, `books/expenses/<id>`, `books/bill-payments/<id>`, `books/vendor-credits/<id>`, `books/vendor-refunds/<id>`. A row has no action of its own (Q9).
- The list is windowed (`useRowWindow`). `useVendorTransactions(vendorId, filter)` runs one live query per kind (`vendor = id`, the listed rule in the `where`, ordered date desc then `created` desc, `.limit(n)`), and `mergeTransactions` (`lib/party-transactions.ts`) cuts the merged rows to `n`; `n` starts at 50 and grows by 50 when the list nears its end. A chip other than All runs only that kind's query. Amounts draw in the Books settings' currency.
- Empty: "No transactions for this vendor yet" with a New transaction button (writers; it opens the header's menu). Chip with no rows: "No bills for this vendor" (the kind's noun) with "Show all". Loading: `LoadingState`. Error: the Books error banner with Retry (`recoverLiveQueries` over the failed queries, `mergeRecoveries`).

### 3.6 Contacts tab (Q12)
- The people at this vendor, stored in the existing `books_party_contacts` collection (`vendor = id`): Name (required), Role, Email, Phone, Primary. Sorted primary first, then by name. Wide: a table; phone: cards. The same part as the customer page (`PartyContactsTab`).
- Writers: "Add contact" opens `ContactPersonDialog` (core `Dialog`; zod schema `lib/contact-person-schema.ts` through `useForm` + `zodResolver`; first input focused with `useFocusOnOpen`; ⌘↵ Save through `Dialog.ActionButton` `shortcut`); it writes `vendor: id, customer: ''`. The row menu has Edit, Make primary, Delete (core `ConfirmDialog`, "Delete <name> from this vendor's contacts?"). The server clears the other contacts' primary flag in the same transaction (existing guard).
- Empty: "No contacts yet" with an Add contact button (writers). Read-only users see the list with no actions.

### 3.7 Details and Notes tabs: edit in place (Q13)
- Details: the vendor form (`RecordFormBody` on the `books:vendor` definition, the 1099 built-ins of p3-vendor-1099 included) with the `notes` built-in hidden (`hideBuiltins`), as live inputs; no Edit button and no read view for writers. Read-only users get the same form `readOnly`.
- Notes: one multi-line field bound to the vendor's `notes` column (core `TextAreaInput`, max 5000, zod `lib/party-notes-schema.ts`), the only place notes are edited.
- Save bar (`PartyPageSaveBar`): when the Details form or the Notes field has changes, a sticky bar shows at the bottom of the page on every tab with "Unsaved changes", **Cancel** (Esc) and **Save** (⌘S), both `ShortcutButton`s. Save writes the dirty Details keys through `useRecordSave` (the patch path of `useVendorForm`, given `afterEdit`, `afterWrite`, `onRefused` as `useCustomerForm` takes them), then the notes through `useMutation` (a second, later update of the same row; never one transaction with the first), then marks both clean and stays on the page. A field refusal shows inline on its field and selects the tab that holds it; a root refusal shows in the bar's `FormErrorSummary` (on the Details tab the form's own summary shows it). Cancel asks "Discard changes?" (`DiscardDialog`, "This vendor has changes that are not saved."); Discard resets both to the stored values (`reset(undefined, { keepDirtyValues: false })`).
- Escape: while the bar shows, Esc runs Cancel. While nothing is dirty, Esc leaves the page (`leave`). An open menu or dialog takes Escape first.
- The leave guard (core `useLeaveGuard`) holds every way out of the page while either form is dirty and no save or delete runs (the back button, another list row, swipe and hardware back, the browser Back button). A document opened from the Transactions tab or from New transaction is pushed over the page and is not held; Back returns to the edits.

### 3.8 More menu (Q14)
- Writers: **Make inactive** / **Make active**, **Delete vendor** (the existing `DeleteVendorDialog`; after a delete, `leave`). Every Books reader: **Audit history** (`useOpenHistory('books_vendors', id)`), so a reader's More holds Audit history alone. Uses `useVendorActions`. A refusal shows in the page's banner (`ListBanner`); Delete's shows in its dialog. Write items are disabled while a write runs or writes cannot reach the server (`useWritesAvailable`).

### 3.9 Ways in (Q15)
- Save on `vendors/new` replaces the route with the new vendor's page (`vendors/<id>`, Transactions tab). Save and new is unchanged.
- The Vendors list row opens the page. The row menu's Edit opens the page on `?tab=details`.
- A document's "Edit vendor" link (`DOCUMENT_PARTIES.vendor`) gains `editParams: { tab: 'details' }`, as the customer has.
- A search hit and a deep link open the page on Transactions.
- The vendor-form and vendor-1099 e2e specs that open `vendors/<id>` and expect the form, or that wait for the list URL after a save, move those steps to the page and its Details tab.

### 3.10 Not found, loading
- Unchanged (`RecordByIdScreen`: loading body; "This vendor doesn't exist or was removed" with "Back to vendors").

### 3.11 Help
- New topic `help/vendor-pages.md` ("To see what you owe a vendor…": the figures, New transaction, the tabs, editing in place, contacts, shortcuts ⌥N, ⌥1–⌥4, ⌘S, Esc; that Call needs a `tel:` handler on a desktop browser). `help/vendors.md` links to it and no longer says the vendor opens as a form.

## 4. Data
- **View `books_party_balances`, rewritten in a new migration** (Q4). One grouped `SELECT` with no `UNION ALL` (PocketBase's view parser refuses it):
  `SELECT (CASE WHEN l.customer != '' THEN l.customer ELSE l.vendor END) AS id, l.customer AS customer, l.vendor AS vendor, CAST(SUM(CASE WHEN a.type = 'accounts_receivable' THEN l.debit - l.credit ELSE l.credit - l.debit END) AS INTEGER) AS balance FROM books_journal_lines l JOIN books_accounts a ON a.id = l.account WHERE l.posted = TRUE AND ((a.type = 'accounts_receivable' AND l.customer != '') OR (a.type = 'accounts_payable' AND l.vendor != '')) GROUP BY l.customer, l.vendor`.
  A journal line names one customer or one vendor, never both (the p1 line-party guard), so each row is one party and its id is the party id. Fields: `id`, `customer` (relation, '' on a vendor row), `vendor` (relation, '' on a customer row), `balance` (integer cents; a customer row is debits minus credits, a vendor row credits minus debits, so "owed" is positive on both). Rules unchanged (list/view `READ`). The migration also adds `CREATE INDEX idx_books_jlines_vendor ON books_journal_lines (vendor) WHERE vendor != ''`. Down: restore the customer-only query of `2100000015`, drop the index.
  - The plan's first server task proves in a Go test that PocketBase accepts the `CASE` id column and types `customer` and `vendor` as relations; if the parser refuses the `CASE`, the id is `(l.customer || l.vendor)` (one of the two is always '').
  - Real-time: the `changesignal.RegisterView("books_party_balances", "books_journal_lines", "books_accounts")` registration is unchanged (the SQL reads the same two collections); `CheckViews` still passes. Client collection unchanged (`liveViewOptions`).
  - Go test (`server/party_balances_test.go`): the customer cases stay; new cases — a posted bill, a bill payment, a vendor credit and a void for two vendors give the expected vendor rows; an A/P line with no vendor and an A/R line that names a vendor give no row; a customer and a vendor never share a row.
- `books_party_contacts`: no schema change; the vendor relation, index and Go guards exist since p2-customer-pages.
- No other collection changes. `books_bills`, `books_expenses`, `books_bill_payments`, `books_vendor_credits`, `books_vendor_refunds` each have `vendor`, `status`, `date`, `number`, `created`, `replaced_by`, and a total (`total`; `amount` on a vendor refund); bills and vendor credits have `balance`.
- Reads: the vendor via the existing `useRecord(vendorsCollection, id)`; balance and overdue via `usePartyBalance`; transactions via `useVendorTransactions` (five live queries); contacts via `usePartyContacts` (`vendor = id`). Row types derive from the queries.
- Writes: Details through `useRecordSave`; notes, contacts and More-menu actions through `useMutation`.
- Seed: `lib/vendor-page-fixture.ts` (contacts for three seeded vendors, one with a primary and a long role) wired into `seed.ts`. The seeded bills, bill payments, vendor credits and vendor refunds give balances through the view. The plan checks that one seeded posted bill is past due; if none is, it adds one on a fixed past date for a vendor no other spec totals (grep the specs first).

## 5. Contracts for later units
- p3-purchase-lists: owns the shared purchase list pattern (search, date range, status chips, sort, batch actions). It may move `useVendorTransactions` onto its list hook with the vendor fixed, as p2-sales-lists did for `useCustomerTransactions`; the row shape (`PartyTransactionRow`) and the status rules of `lib/vendor-transactions.ts` are the interface.
- p5-vendor-balance, p5-ap-aging: read the ledger through report sources, not this view.
- A later unit that adds a vendor transaction adds its item by a `takesVendor` `NEW_ACTIONS` entry.
- p2-statements: adds Statements to the customer tab order only (`lib/customer-page-tabs.ts` keeps its exports).

## 6. Cut
- Statements tab on a vendor page (Q7): a statement goes to a customer.
- Row action "Schedule payment" / "Pay" on a bill row, and the Category column with inline edit (Q9): the bill's own screen has Pay bill; New transaction → Pay bills opens Pay Bills for this vendor.
- Tick boxes and batch actions, print, export, column settings, date-range filter, search, sort, total row and page links on the Transactions tab: p3-purchase-lists owns the shared list pattern; this list is windowed.
- Balance beside each name in the Vendors list, and sort by balance: a list feature (p3-purchase-lists / p5-vendor-balance).
- Header lines for notes, account number, payment terms and a payment-service ("Bill Pay ACH") status (Q17).
- A third figure for unapplied vendor credits (Q19): Open is already net of them.
- The screenshot's separate Edit button with a dropdown: edit in place replaces it; its actions are the More menu.
- Link from a contact person to a `contacts`-package contact (cut in customer-pages for the same reason: CI installs core + Books only).

## 7. Platform notes
- None new. Keyboard shortcuts (⌥N, ⌥1–⌥4, ⌘S, Esc, ⌘↵ in the contact dialog) follow the standing approval (web and iOS hardware keyboard; Android uses the visible buttons). First-input focus in the contact dialog follows the standing approval (web only).
- Email and Call use `Linking` on both platforms. On a desktop web browser with no `tel:` handler, Call opens nothing; the help topic says so.

## 8. Sparks carried
- Figures with a small label and a thin status marker: `text-2xl font-semibold text-foreground`, `text-xs uppercase text-muted-foreground`, a 3 px left border in `border-warning` / `border-danger` (`PartyBalance`).
- Contact actions beside the name: lucide `Mail` / `Phone`, `useThemeColor('muted-foreground')`, 44 px targets, drawn only when the value exists (`PartyContactActions`).
- No core extension.

## 9. Non-goals
Scheduling or making a payment from the page, vendor statements, A/P aging, 1099 totals on the page, a vendor portal, emailing through the `mail` package, merging vendors, vendor attachments, an activity tab, multi-currency balances, a stored balance table, changing the Vendors list columns, a purchases list screen, sub-vendors.
