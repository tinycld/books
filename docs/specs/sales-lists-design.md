# Sales lists: design spec

Status: APPROVED at the design gate, 2026-11-17 (auto-helix unit p2-sales-lists). Direction A (tabs by kind, the document beside its list). The packet's open questions Q1 to Q10 are accepted as recommended. No platform-only item, no core change, no migration. Built against books `main` @ `7020767` and core `main` @ `87ed80f`.

## 1. Goal

Give Books one Sales area where the user finds, filters, sorts and acts on every invoice, estimate, sales receipt, payment and credit memo, with the list pattern that all Books lists share.

## 2. Where it lives

- A new sidebar entry **Sales** (`books-nav-sales`), in the top group between Banking and Lists, opens `books/sales`. The entry is active on `books/sales` and on every path under `books/invoices`, `books/estimates`, `books/sales-receipts`, `books/payments` and `books/credit-memos` (the list routes and every sales document).
- Six tabs, each a route:

| Tab | Route | Rows |
|---|---|---|
| All sales | `books/sales` | all five kinds |
| Invoices | `books/invoices` | invoices |
| Estimates | `books/estimates` | estimates |
| Sales receipts | `books/sales-receipts` | sales receipts |
| Payments | `books/payments` | payments |
| Credit memos | `books/credit-memos` | credit memos |

- Each kind route gets a `_layout.tsx` that draws the kind's list once, with a child Stack for the existing `new` and `[id]` screens (the `screens/customers/_layout.tsx` pattern). `books/sales` is one screen with no child route.
- A tab press replaces the current list route, so Back leaves the Sales area and does not step through tabs.

## 3. Behavior

### Tabs and header

- The header shows the title "Sales", the tab strip, and the New button. The tab strip scrolls sideways when the tabs do not fit.
- On a kind tab the New button reads "New invoice", "New estimate", "New sales receipt", "Receive payment" or "New credit memo" and opens that kind's `new` route. On All sales it reads "New" and opens a core `Menu` (`@tinycld/core/ui/menu`) with those five actions, taken from `NEW_ACTIONS` (`takesCustomer` entries).
- A user without write access (`useBooksAccess().canWrite` is false) sees no New button, no tick boxes and no Batch actions.

### Rows and columns

- A row shows one document. The columns of each tab on a wide screen:

| Tab | Columns |
|---|---|
| All sales | Date, Type, No., Customer, Memo, Amount, Status |
| Invoices | Date, No., Customer, Due date, Balance, Total, Status |
| Estimates | Date, No., Customer, Expires, Total, Status |
| Sales receipts | Date, No., Customer, Memo, Total, Status |
| Payments | Date, No., Customer, Reference no., Amount, Status |
| Credit memos | Date, No., Customer, Balance, Total, Status |

- A row with no customer, no number (a draft), no memo, no due date or no expiration date shows "—" in that cell.
- A credit memo's amount shows negative, with a typographic minus, on All sales. On the Credit memos tab Total and Balance show positive.
- The Status cell is a `StatusBadge` with the label and tone that `lib/party-transactions.ts` gives each kind: an invoice is Draft, Void, Paid, Partly paid, Overdue or Open; an estimate is Pending, Accepted, Rejected, Closed or Expired; a sales receipt is Draft, Void or Paid; a payment is Draft, Void, Applied or "Credit $x"; a credit memo is Draft, Void, Unapplied or Applied.
- A void original that a correction replaced is not listed (`isListedTransaction`); the correction carries its number.
- All amounts draw in the Books settings' currency.
- Table columns are flex with a minimum width. Below the table's own minimum width (the sum of its column minimums) the list draws cards. The table never scrolls sideways.
- A card on All sales shows two lines: type and number with the amount at the right, then customer and date with the status badge at the right. A card on a kind tab shows the number and the customer with the amount at the right, then the date (and "Due <date>" for an invoice) with the status badge at the right.

### Opening a document

- A press on a row or card opens the document at its existing route (`books/<kind>/<id>`). A draft opens in its form and a posted or void document in its read view, as those routes already do.
- On a window 1360 px wide or wider (core `detailSurfaceFor`, `@tinycld/core/lib/detail-surface`), every sales document shows beside its kind's list: the list narrows to a 320 px column of two-line rows (number and customer, amount and status) with the open row marked, and the document (form or read view, also `new`) takes the rest. Below 1360 px the document is a pushed page and Back returns to the list with its scroll position and filters.
- A document opened from All sales, from a customer page or from a report lands on the same kind route, so at 1360 px and wider it also shows beside its kind's list.
- The 320 px column keeps the search field. The chips, the date-range menu, the customer picker, the tick boxes, the Batch actions button and the row menus do not draw there; the document beside the column offers the actions. The column lists the kind tab's rows with the tab's kept chip, date range, customer, search and sort. When the open document is not among those rows, no row is marked.
- The selection clears when the list narrows to the column.

### Search and filters

- The toolbar holds a search field, status chips, a date-range menu and a customer picker. On a wide screen they share one wrapping row; on a phone the search field takes the first row, the chips scroll sideways on the second row, and the date-range menu and customer picker share the third row.
- Search matches each typed piece against the document's number or memo, on the server, 250 ms after the last key (the `listFilter` and `searchPieces` rules of `lib/list-search.ts`). The field is a core `PlainInput` and its placeholder reads "Number or memo". Search does not match the customer's name.
- Status chips (one chosen at a time, "All" by default):

| Tab | Chips |
|---|---|
| All sales | All, Open, Overdue, Closed, Draft, Void |
| Invoices | All, Open, Overdue, Paid, Draft, Void |
| Estimates | All, Pending, Accepted, Rejected, Closed, Expired |
| Sales receipts | All, Paid, Draft, Void |
| Payments | All, Applied, Credit left, Draft, Void |
| Credit memos | All, Unapplied, Applied, Draft, Void |

- What each All sales chip lists:

| Chip | Invoice | Estimate | Sales receipt | Payment | Credit memo |
|---|---|---|---|---|---|
| Open | posted, balance > 0 | pending or accepted, not expired | none | posted, credited > 0 | posted, balance > 0 |
| Overdue | posted, balance > 0, due date before today | none | none | none | none |
| Closed | posted, balance = 0 | rejected, closed, or expired | posted | posted, credited = 0 | posted, balance = 0 |
| Draft | draft | none | draft | draft | draft |
| Void | void | none | void | void | void |

- On a kind tab a chip lists the rows whose badge reads the chip's label, with these three additions: Invoices "Open" lists every posted invoice with a balance above zero (Open, Partly paid and Overdue badges); Payments "Credit left" lists the "Credit $x" rows; an estimate is Expired when it is pending or accepted and its expiration date is before today (`isExpired`), and then it is not listed under Pending or Accepted.
- The date-range menu (core `PickMenu`, `@tinycld/core/ui/pick-menu`) offers This month, Last month, This quarter, This fiscal year, Last fiscal year (the presets of `lib/register-range.ts`) and All dates, on the document date. The default is All dates.
- The customer picker is a Books `SearchPicker` (`components/SearchPicker.tsx`) over `books_customers`: every customer, sub-customers and inactive customers included, searched by display name. Its first item, "All customers" (`noneOption`), removes the filter. A chosen customer narrows the list to the documents of exactly that customer (not its sub-customers). The Books `CustomerPicker` is the Parent customer picker (top-level, active customers only) and is not used here.
- Each tab keeps its own search text, chip, date range, customer and sort while the app is open. They reset when the app reloads.

### Sort

- The default order is Date, newest first, then creation time, newest first.
- A press on a sortable column header sorts by that column ascending; a second press sorts descending. The header shows an arrow on the sorted column and states the order to assistive technology (`aria-sort`).
- Sortable columns: Date, No. and Amount or Total on every tab; also Due date and Balance on Invoices, Expires on Estimates, and Balance on Credit memos. Type, Customer, Memo, Reference no. and Status do not sort.
- No. sorts by the document's numeric `sequence`, so 999 comes before 1012. On All sales the amount sorts by the signed value, so a credit memo of −$400.00 comes before an invoice of $0.00 in ascending order.
- An empty value (a draft's number, no due date, no expiration date) sorts before every other value in ascending order and after them in descending order.
- Rows with the same value in the sort column are in creation order, newest first, in both directions.
- When the list draws cards, there is no header. A "Sort" menu in the toolbar (core `PickMenu`) lists the tab's sortable columns, each in both directions.

### Row menu

- Each row and card ends with a "More actions" button (44 px target) that opens a core `Menu`. A press on it, or on one of its items, does not open the row.
- The menu holds Open, then the actions the document's read view offers for its status and the user's access, in the read view's order and with the read view's labels (`documentReadActions`, `quoteReadActions`, `lib/payment-read-actions.ts`), without Edit. For a draft it holds Open and Delete draft; a reader's draft menu holds Open only.
- Each action does what it does on the read view: Receive payment, Copy, Create credit memo and View journal entry navigate; Download PDF downloads; Void and Delete draft open their confirm dialog (core `Dialog`) over the list, and a refusal from the server shows in the list's banner (Books `ListBanner`) with the server's text.

### Batch actions

- A user with write access sees a tick box at the start of each row and card (44 px target) and, in the table, a tick box in the header that ticks or clears every loaded row.
- The "Batch actions" button opens a core `Menu` with "Delete drafts" and "Void". In the table the button is disabled while no row is ticked. When the list draws cards, the button shows as an icon and stays enabled, its menu also holds "Select all" (every loaded row) and "Clear selection", and "Delete drafts" and "Void" are disabled while no row is ticked.
- Each action opens one confirm dialog (core `Dialog`) that names how many of the ticked documents it applies to and how many it skips ("Delete 3 drafts? 2 selected documents are not drafts and stay."). Delete drafts applies to drafts. Void applies to posted invoices, sales receipts, payments and credit memos; it never applies to an estimate. When the action applies to none of the ticked documents, the dialog says so and has no confirm button.
- The action writes one document at a time and collects `{ done, failed }`. After it ends, the documents that succeeded leave the selection, the ones the server refused stay ticked, and the banner reads "<n> done, <m> refused" with the first refusal's text.
- A change of tab, chip, search, date range or customer clears the selection. A change of sort keeps it.

### Paging

- A list loads its first 50 rows and 50 more each time the user scrolls near the end. Rows on screen stay while the next 50 load. The table and the cards draw only the rows near the viewport (`ListTable`, `ListCards`).

### States

- Loading: the first load of a tab shows core `LoadingState`. A change of filter or sort keeps the last rows on screen and marks the list `aria-busy` until the new rows land.
- Empty with no filter set (chip All, All dates, no customer, no search text): "No invoices yet" (the tab's noun; "No sales transactions yet" on All sales) with a core `Button` for the tab's New action when the user has write access.
- Empty with a filter set: "No invoices match" ("No sales transactions match" on All sales) with a "Clear filters" core `Button` that resets search, chip, date range and customer.
- Error: the banner reads "Sales transactions could not load." with Retry, on every tab. Retry restarts every read that failed (each kind's query, the customer names, the settings) with one core `recoverLiveQueries` call over the merged recoveries (`mergeRecoveries`, `lib/live-recovery.ts`).

### Keyboard (web and iOS hardware keyboard)

- `/` focuses the search field and Escape leaves it. `J` or ArrowDown and `K` or ArrowUp move the row focus. Enter or `O` opens the focused row. `X` or Space ticks it and `A` ticks or clears all loaded rows. `N` runs the tab's New action. `1` to `6` switch tabs.
- The keys are registered with core `useRegisterShortcuts` (`@tinycld/core/lib/shortcuts`). A key is registered only while its action is offered (no `X`, `A` or `N` for a reader; no `X` or `A` in the 320 px column). The keys are in the ⇧? list and in the help topic.
- Android has no list keys; every action has a visible control.

### Help

- A help topic `help/sales-lists.md` ("To find a sales transaction, …") covers tabs, search, filters, sort, row menus, batch actions and the keys. `help/navigating-books.md` gains the Sales entry.

## 4. Data

- Reads: `books_invoices`, `books_estimates`, `books_sales_receipts`, `books_payments`, `books_credit_memos`, `books_customers` (the customer's name, the customer picker), `books_settings` (currency, fiscal year start month for the date presets). No new collection, no new field, no migration, no new endpoint.
- One hook, `useDocumentList`, runs one live query per kind the tab lists (five on All sales, one on a kind tab; a chip that lists none of a kind does not run that kind's query). Each query filters by the chip, the date range, the customer and the search in its `where`, orders by the sort column then `created` descending, and takes the first `n` rows (`n` starts at 50 and grows by 50). The hook maps each row to one row shape and merges the lists in the same order, cut to `n`; the merge is exact because each list is its source's first `n` rows in that order (`mergeTransactions`). For the signed amount order on All sales, the credit memo query orders by `total` in the opposite direction.
- A draft's `sequence` is 0 and an unset date is the empty string, so the server's order and the merge both put an empty value first in ascending order.
- Each query's `select` reads the customer's display name with `materialize()` from `books_customers`, so a document with no customer stays listed. The row type comes from the query result.
- `useCustomerTransactions` becomes a caller of `useDocumentList` with a fixed customer; its tab's behavior does not change.
- Writes: Delete draft, Void and the batch actions use the mutations the document read view and form already use (`useMutation`), moved to hooks the list and the read view share (`useVoidDocument`, `useDeleteDraftDocument`). Tab state (search, chip, range, customer, sort) and the selection live in a Zustand store, `stores/document-list-store.ts`, not persisted.
- Access: `useBooksAccess().canWrite` gates New, tick boxes, Batch actions and the write actions of a row menu.

## 5. Cut

- Money summary bar (five totals above the list): the Dashboard unit (p5-dashboard) shows these figures, the status chips do the filtering, and no collection holds the totals today.
- Delivery method filter: Books stores no sent or delivery state on a document; email is unit p2-email-share.
- Overview tab: it is the Dashboard (p5-dashboard).
- Payment links tab: online payments are in the "Later" group of the Books scope.
- Customers and Products & services tabs: both lists are in the Lists hub.
- Feedback link: not a Books feature.
- Sort by Customer, Type or Status: the customer picker, the tabs and the chips answer the same need.
- Search by customer name: the customer picker answers it.
- Batch Send: it needs unit p2-email-share, which is not built (no mail hook in `books/tinycld/books`); that unit adds the action to the Batch actions menu.
- Batch Download PDF: a batch of PDFs opens one share sheet per file on native.
- Custom date range: the entries list has none either; the presets and All dates cover it.

## 6. Platform notes

- Keyboard shortcuts work on web and with an iOS hardware keyboard; Android uses the visible controls. Approved as the Books default (human, 2026-11-11).
- No other single-platform item.

## 7. Sparks carried

- Status reads from color: `StatusBadge` tones (`info`, `success`, `destructive`, `muted`, `warning`) over `--color-info`, `--color-success`, `--color-destructive`, `--color-muted`, `--color-warning`.
- A credit stands apart: `transactionTotalText` (typographic minus), `text-foreground`.
- Dropped: the proportional money bar (it belonged to direction C only).
- No core extension.

## 8. Non-goals

- No Refund receipts tab: unit p2-refund-receipt is not built (`screens/refund-receipts/` does not exist). That unit adds its kind to the Sales tab table (`lib/sales-lists.ts`).
- No Statements tab (unit p2-statements).
- No change to the behavior of the customer page's Transactions tab; its data hook and its chips move to the shared parts.
- No change to the behavior of a document form or read view, except that at 1360 px and wider it shows beside its kind's list; its Void and Delete draft mutations move to shared hooks.
- No purchase lists (unit p3-purchase-lists builds them from this unit's shared parts).
- No saved filter sets, no column chooser, no export from the list (reports export).
- No totals row under the list.
