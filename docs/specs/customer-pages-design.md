# Customer pages

Status: APPROVED at the design gate, 2026-11-13 (auto-helix unit p2-customer-pages). Direction C. The packet's open questions Q1, Q2, Q4–Q17 are accepted as recommended; Q3 is changed by the human (Open reads a PocketBase view collection, §4); Q18: the two migrations take the next free numbers at plan time. Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Interface ("Customer and vendor pages: balance header, New transaction menu, tabs (Transactions, Statements, Contacts, Details, Notes), edit in place, one notes store"), §Packages, §Ledger rules; `docs/plans/books-quickbooks-fixes.md` line 11 ("Detail pages are editable in place, with one notes store"). Contracts honored: customer-form-design (p2-customers) Q7, Q9, Q14; invoice-form-design, estimate-form-design, sales-receipt-form-design (`?customer=<id>` on `new`). Built against books main@bf4b60e, core main@6b4853f9.

## 1. Goal
Opening a customer shows a page about that customer: who they are and how to reach them, what they owe, every sales document for them, their contact people, and their details and notes, all editable in place, with one menu to start a new transaction for them.

## 2. Where it lives
- Route: `books/tinycld/books/screens/customers/[id].tsx` → `/a/books/customers/<id>` (unchanged URL). Its content changes from the customer form to `CustomerPage`. The route layout `screens/customers/_layout.tsx` (`ListDetailLayout`), `index.tsx` and `new.tsx` keep their files.
- The selected tab is the `tab` search param: `transactions` (default, no param), `contacts`, `details`, `notes` (Q11). A reload or a shared link keeps it. An unknown value selects Transactions.
- Surface (Q10, direction C): on a window of 1360 px or more (`DETAIL_PANEL_MIN_WINDOW`) with a customer page open, the Customers list narrows to a 320 px name column at the left and the page fills the rest of the content area (at 1360: 1036 − 320 = 716 px). `customers/new` keeps the 480 px panel beside the full list. Below 1360 px the page covers the list (the p2-customers page surface), and on phones it is a pushed page. `ListDetailLayout` and `lib/detail-surface.ts` gain a per-route detail width (`'panel' | 'record'`), chosen from the URL (`open.kind`), with the same element tree, so nothing remounts when the route or the window changes.
- New files (books package, relative imports):
  - `components/customers/page/` — `CustomerPage.tsx` (the route component's body; owns the forms and the leave guard), `CustomerPageHeader.tsx`, `CustomerBalance.tsx`, `CustomerContactActions.tsx`, `NewTransactionMenu.tsx`, `CustomerTabs.tsx`, `CustomerTransactionsTab.tsx`, `CustomerContactsTab.tsx`, `ContactPersonDialog.tsx`, `CustomerDetailsTab.tsx`, `CustomerNotesTab.tsx`, `CustomerPageSaveBar.tsx`, `CustomerMoreMenu.tsx`.
  - `components/RecordTabs.tsx` — the tab strip extracted from `components/documents/DocumentTabs.tsx` (tabs from a list, `tab` param, ⌥<n> keys, horizontal scroll on phones); `DocumentTabs` becomes a caller.
  - `hooks/useCustomerPage.ts`, `hooks/usePartyBalance.ts`, `hooks/useCustomerTransactions.ts`, `hooks/usePartyContacts.ts`, `hooks/useCustomerNotesForm.ts`.
  - `lib/customer-page-tabs.ts` (tab keys, labels, `customerTabOf(param)`), `lib/party-transactions.ts` (pure: map invoice, estimate and sales-receipt rows to one row shape, status labels and tones, merge by date, window), `lib/transaction-actions.ts` (the New transaction list, derived from `NEW_ACTIONS`), `lib/contact-person-schema.ts` (zod), `lib/customer-page-fixture.ts`.
  - Server (Q18: each migration takes the next free number in `books/pb-migrations/` when the plan is written; no number is reserved now): `pb-migrations/<next>_create_books_party_balances.js` (the view and its line index), `pb-migrations/<next+1>_create_books_party_contacts.js`, `server/party_balances.go` (the view's change-signal registration, + test), `server/party_contacts.go` (+ test).
  - `help/customer-pages.md`.

## 3. Behavior

### 3.1 Header
- Left: the display name as the page title (`text-2xl font-semibold`), then the Email and Call icon buttons beside it (spark 2), each only when the customer has that value: Email opens `mailto:<email>`, Call opens `tel:<phone>` (phone, else mobile) through React Native `Linking.openURL`. Under the name: the company name when it differs from the display name, then the billing address on up to three lines (`formatAddressLines`, `lib/address.ts`), muted. A sub-customer shows "Sub-customer of <Parent>" as a link that opens the parent's page (replace). An inactive customer shows the `StatusBadge` "Inactive" beside the name.
- Right: the balance block (spark 1, §3.2), then the actions row: **New transaction** (§3.3) and a **More** menu (§3.8).
- Page surface: a back button "‹ Customers" above the title (`leave`, as today). Record surface (very wide): no back button; the list is beside it.
- Phone: the header stacks — name and icons, company and address, the two figures side by side, then New transaction as a full-width button and More as an icon button at the top right.
- The header has no notes block; notes live in the Notes tab (Q9).

### 3.2 Balance (Q1, Q2, Q3)
- Two figures: **Open** — the customer's accounts-receivable balance from the ledger (every posted journal line on an `accounts_receivable` account that names this customer, debits minus credits), and **Overdue** — the sum of `total` over this customer's posted invoices whose due date is before today (local day, `todayIso`). Each is a large figure with a small uppercase label and a 3 px left marker: `border-warning` for Open, `border-danger` for Overdue.
- Open reads this customer's row of the `books_party_balances` view collection (§4) through `usePartyBalance(customerId)`: one `useLiveQuery` with `where customer = id` and `.findOne()`; no row means $0.00 (a customer with no posted A/R line has no row). The view is real-time: the server signals its topic whenever a journal line or an account changes, and the client collection subscribes to that topic (§4), so a post, void or reversal anywhere in Books updates the figure on an open page with no reload.
- Overdue is one live query over `books_invoices` (`customer = id`, `status = 'posted'`, `due_date < today`); the hook sums the rows' `total` with the shared cents helper. Until p2-receive-payment adds an open amount per invoice, a posted invoice is unpaid; that unit changes Overdue to the open amount (contract, §5).
- A parent customer's figures are its own only; sub-customers have their own pages (Q4).
- Loading: the figures show "—". A failed load shows "Balance unavailable" with a Retry link (one `recoverLiveQueries` call over both queries, `mergeRecoveries`).
- Zero shows "$0.00" with the label "Open". A negative Open (a credit) shows as "−$120.00" with the label "Credit" instead of "Open".

### 3.3 New transaction menu (Q5, Q14)
- A core `ShortcutButton` "New transaction" with a chevron opens a controlled core `Menu` (`isOpen` / `onOpenChange`, `presentation: 'auto'`, so a sheet titled "New transaction" on the mobile breakpoint) of the transactions from `NEW_ACTIONS` that take a customer: today **Invoice**, **Estimate**, **Sales receipt**. Each opens `books/<kind>/new?customer=<id>` (push; Back returns to this page). `lib/transaction-actions.ts` derives the list from `NEW_ACTIONS` by a new `takesCustomer: true` flag, so a later unit (receive payment, credit memo, refund receipt, statement) adds its item by adding one `NEW_ACTIONS` entry.
- Shortcut ⌥N opens the menu (web and iOS hardware keyboard, standing approval). Inside the open menu, ↑/↓ and Enter (core Menu).
- Hidden for read-only users. For an inactive customer the button is disabled with the hint "Make this customer active to add transactions." (invoice and sales-receipt posts refuse an inactive customer).

### 3.4 Tabs (Q6, Q7, Q11)
- `RecordTabs` under the header: **Transactions**, **Contacts**, **Details**, **Notes**. The Statements tab is deferred (Q6): p2-statements is not built (no statements code in books), and that unit adds it as a fifth entry of `lib/customer-page-tabs.ts`. The deferral is recorded in the helix ledger's Deferrals section.
- ⌥1–⌥4 select the tabs from anywhere on the page, a text field included. On phones the strip scrolls sideways and the selected tab scrolls into view.
- Only the selected tab's body is mounted, but the Details and Notes form state lives in `CustomerPage` (above the tabs), so switching tabs keeps unsaved edits.

### 3.5 Transactions tab (Q12, Q13)
- One list of this customer's invoices, estimates and sales receipts, newest first (date desc, then `created` desc). A replaced original (void with `replaced_by`) is left out; its correction carries the same number. A plain void stays, with a Void badge.
- Wide columns: Date, Type, No., Due date (invoices only; "—" otherwise), Total, Status. Status is a `StatusBadge`: invoice Draft (neutral) / Open (warning) / Overdue (danger, posted and due before today) / Void (neutral); estimate Pending / Accepted / Rejected / Closed, plus "Expired" (`isExpired`); sales receipt Draft / Paid (success) / Void. Phone: cards with type and number, date, total, status.
- Type filter chips: All, Invoices, Estimates, Sales receipts (`useState` local to the tab; not in the URL, reset to All when the page mounts).
- Pressing a row opens the document (`documentHref(kind, id)`, push). The list is windowed (`useRowWindow`); three live queries (`books_invoices`, `books_estimates`, `books_sales_receipts`, each `customer = id`, ordered date desc then `created` desc, `.limit(n)`) feed a pure merge in `lib/party-transactions.ts`; `n` starts at 50 and grows by 50 when the list nears its end (`isNearEnd`). The merged first `n` rows are exact because each source returns its own first `n`. A type chip other than All runs only that kind's query.
- Empty: "No transactions for this customer yet" with a New transaction button (writers). Filter with no rows: "No <kind> for this customer" with "Show all". Loading: `LoadingState`. Error: the Books error banner with Retry (`recoverLiveQueries` over the three queries, `mergeRecoveries`).

### 3.6 Contacts tab (Q7)
- The people at this customer, stored by Books in the new `books_party_contacts` collection (§4): Name (required), Role, Email, Phone, Primary. Sorted primary first, then by name. Wide: a table (Name with "Primary" badge, Role, Email link, Phone link, row menu); phone: cards.
- Writers: "Add contact" opens `ContactPersonDialog` (core `Dialog`, zod schema `lib/contact-person-schema.ts` through `useForm` + `zodResolver`; first input focused with `useFocusOnOpen`; ⌘↵ Save through `Dialog.ActionButton` `shortcut`). The row menu has Edit, Make primary, Delete (core `ConfirmDialog` "Delete contact"). Making one contact primary clears the others' flag (server, in one transaction).
- Empty: "No contacts yet" with an Add contact button (writers). Read-only users see the list with no actions.
- No link to the `contacts` package in this unit (Q7, cut).

### 3.7 Details and Notes tabs: edit in place (Q8, Q9)
- Details: the p2-customers customer form (`RecordFormBody` on the `books:customer` definition) with the `notes` built-in hidden (`hideBuiltins`), rendered as live inputs; there is no Edit button and no read view for writers. Read-only users get the same form `readOnly`.
- Notes: one multi-line field bound to the customer's `notes` column (core `TextAreaInput`, max 5000, zod), the only place notes are edited. The Details form never shows it, so the text lives in one place.
- Save bar (`CustomerPageSaveBar`): when the Details form or the Notes field has changes, a sticky bar shows at the bottom of the page on every tab with "Unsaved changes", **Cancel** (Esc) and **Save** (⌘S), both `ShortcutButton`s. Save writes the dirty Details keys through the existing `useRecordSave` patch path and the notes through `useMutation`, then marks both clean and stays on the page (it does not `leave`, unlike the p2-customers form). A field refusal shows inline on its field and selects the tab that holds it; a root refusal shows in the bar's `FormErrorSummary`. Cancel asks the existing "Discard changes?" question (`DiscardDialog`); Discard resets both to the stored values and the bar goes away.
- Escape: while the bar shows, Esc runs Cancel (above). While nothing is dirty, Esc leaves the page (`leave`), on both surfaces. An open menu or dialog takes Escape first and closes only itself (core layer scopes).
- The leave guard (`useLeaveGuard`) holds every way out of the page while either form is dirty (the back button, another list row, swipe and hardware back, the browser Back button) and asks "Discard changes?"; Keep editing stays. A save in flight turns the guard off, as in `RecordChild`. Opening a document from the Transactions tab or New transaction pushes a route over the page and removes nothing, so it is not held: the page stays mounted under it with its edits, and Back returns to them.

### 3.8 More menu
- Writers: **Add sub-customer** (top-level customers only; `customers/new?parent=<id>`), **Make inactive** / **Make active**, **Delete** (the existing `DeleteCustomerDialog`; after a delete, `leave`). Uses `useCustomerActions`. Read-only users: no More menu.

### 3.9 After creating a customer (Q15)
- Save on `customers/new` replaces the route with the new customer's page (`customers/<id>`, Transactions tab) instead of returning to the list. Save and new is unchanged. The p2-customers specs that wait for the list URL after a save, or open `customers/<id>` and expect the form, move those steps to the new page and its Details tab (`?tab=details`).

### 3.10 Not found, loading
- Unchanged from p2-customers (`RecordByIdScreen`: loading body; "This customer doesn't exist or was removed" with "Back to customers").

### 3.11 Help
- New topic `help/customer-pages.md` ("To see what a customer owes…", the figures, New transaction, the tabs, editing in place, contacts, shortcuts ⌥N, ⌥1–⌥4, ⌘S, Esc); `help/customers.md` links to it.

## 4. Data
- New **view** collection `books_party_balances` (Q3 as changed at the gate): a SQL sum, never written. Its query, one `SELECT … GROUP BY` with no `UNION ALL` (PocketBase's view parser refuses it):
  `SELECT l.customer AS id, l.customer AS customer, CAST(SUM(l.debit) - SUM(l.credit) AS INTEGER) AS balance FROM books_journal_lines l JOIN books_accounts a ON a.id = l.account WHERE l.posted = TRUE AND a.type = 'accounts_receivable' AND l.customer != '' GROUP BY l.customer`.
  The row id is the customer id, so there is at most one row per customer, and a customer with no posted A/R line has none. Fields: `id`, `customer` (relation to books_customers, inferred by PocketBase from the selected column), `balance` (number, integer cents; debits minus credits, so a credit is negative). Rules: list/view `READ` (the Books `READ` rule of the other migrations); no create/update/delete (a view has none). The same migration adds `CREATE INDEX idx_books_jlines_customer ON books_journal_lines (customer) WHERE customer != ''` to `books_journal_lines`, so a read filtered to one customer does not scan every line. Down: delete the view, drop the index.
  - Real-time: Books `Register` calls `changesignal.RegisterView("books_party_balances", "books_journal_lines", "books_accounts")` (core `tinycld.org/core/changesignal`, by collection name), from `server/party_balances.go`; core `CheckViews` accepts it at boot. The registration joins the hand-bound list in `server/registrations_test.go`. The client collection is on-demand with `...liveViewOptions('books_party_balances')` (`@tinycld/core/lib/change-signal`, i.e. pbtsdb `liveTopics: ['collection/books_party_balances']`), no relations.
  - No Go write path: no posting-transaction write, no verify or rebuild part. Audit: not registered (derived, read-only). OAuth: `books_party_balances: r`. Search: none.
  - Go test (`server/party_balances_test.go`): posted A/R lines for two customers, a draft line, a line on a non-A/R account, a line with no customer, and a void reversal give the expected rows; the registration names the view and both sources.
  - Vendor rows (A/P) are not in this unit: p3-vendor-pages adds them (§5).
- New collection `books_party_contacts`: `customer` (relation, optional, `cascadeDelete: true`), `vendor` (relation, optional, `cascadeDelete: true`; exactly one of the two set), `name` (text, required, max 200), `role` (text max 100), `email` (email), `phone` (text max 40), `is_primary` (bool), `created`/`updated`. Index on `customer` and on `vendor`, each `WHERE <field> != ''`. Rules: list/view `READ`; create/update/delete `WRITE`. Go guards in `serialized`: exactly one party, the party exists; setting `is_primary` clears it on the party's other contacts in the same transaction. Audit registered (label = name), OAuth rw, no search source.
- Reads: header customer via the existing `useRecord(customersCollection, id)`; parent via `useRecord`; balance via `usePartyBalance`; overdue and transactions as in §3.2 and §3.5; contacts one `useLiveQuery` (`customer = id`). Row types derive from the queries.
- Writes: Details through `useRecordSave` (existing); notes, contacts and More-menu actions through `useMutation`.
- Seed: `lib/customer-page-fixture.ts` (contacts for three seeded customers, one with a primary and a long role) wired into `seed.ts`; the seeded posted invoices (p2-invoice) give balances through the view, one dated so it is overdue. Before adding rows, grep tests and e2e for the seeded customers' counts.

## 5. Contracts for later units
- p2-receive-payment: changes Overdue (and the invoice status Open/Overdue/Paid on the Transactions tab) to the invoice's open amount; its payment lines on A/R change `books_party_balances` through the view with no change here; adds "Receive payment" via `NEW_ACTIONS` (`takesCustomer`).
- p2-statements: adds the Statements tab to `lib/customer-page-tabs.ts` (the Q6 deferral ends there).
- p3-vendor-pages: adds vendor rows (A/P lines, credits minus debits) to `books_party_balances` in a new migration that rewrites the view query as one grouped `SELECT` with no `UNION ALL` (for example a `vendor` column and a party key over `customer` or `vendor` with the sign chosen by account type), and adds `books_journal_lines`/`books_accounts` sources only if it reads more collections; reuses `RecordTabs`, `books_party_contacts`, `CustomerBalance`'s parts (to be generalized to `PartyBalance` there), the save bar and the record surface width.

## 6. Cut
- Link from a contact person to a `contacts`-package contact (Q7): an e2e run installs core + Books only, so it cannot be tested in CI, and Books would read another package's collection without its types.
- Balances including sub-customers (Q4).
- Notes block in the header (Q9).
- Date-range filter, status filter, search, sort and batch actions on the Transactions tab: p2-sales-lists owns the shared list pattern (Q13).
- Customer-level "Unbilled" figure and the list-level money band of screenshot 1 (estimates, unbilled activity, overdue across customers): a list feature, p2-sales-lists.
- Map link on the address; the customer's own attachments.
- The screenshot's separate "Edit" button with a dropdown (Q16): edit in place replaces it; its actions are the More menu.

Deferred, not cut (ledger Deferrals): the Statements tab (Q6), until p2-statements exists.

## 7. Platform notes
- None new. Keyboard shortcuts (⌥N, ⌥1–⌥4, ⌘S, Esc, ⌘↵ in the contact dialog) follow the standing approval (web and iOS hardware keyboard; Android uses the visible buttons). First-input focus in the contact dialog follows the standing approval (web only).
- Email and Call use `Linking` on both platforms. On a desktop web browser with no `tel:` handler, Call opens nothing; the help topic says so.

## 8. Sparks carried
- Figures with a small label and a thin status marker: `text-2xl font-semibold text-foreground`, `text-xs uppercase text-muted-foreground`, `border-l-[3px] border-warning` / `border-danger`.
- Contact actions beside the name: lucide `Mail` / `Phone`, `useThemeColor('muted-foreground')`, 44 px targets, `isVisible` when the value exists.

## 9. Non-goals
Receive payment, statements, credit memos, refunds, write-off, apply credit, A/R aging, a customer portal, emailing from the page through the `mail` package, merging customers, customer attachments, a customer activity or audit tab, multi-currency balances, a stored or server-maintained balance table, changing the Customers list columns (no balance column; p2-sales-lists).
