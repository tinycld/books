# Purchase lists: design spec

Status: APPROVED at the design gate 2026-11-18 (auto-helix unit p3-purchase-lists): direction A (tabs by kind, the document beside its list), every open question of the packet answered as recommended (Qn = the packet's open question n). p3-vendor-pages merged before the build (books PR #71, main @ `0fc80492`). Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Interface ("Every list uses one pattern: search, filter chips, status chips, sortable columns, row menus, batch actions, New button; cards on phones"; sidebar "Sales, Expenses"). Contracts honored: sales-lists-design §8 ("p3-purchase-lists builds them from this unit's shared parts"); vendor-pages-design §5 (`PartyTransactionRow` and the status rules of `lib/vendor-transactions.ts` are the interface; `useVendorTransactions` may move onto the list hook with the vendor fixed). Built against books `books/p3-vendor-pages` @ `9f203b59`, core `main` @ `470a6f7b`.

## 1. Goal

Give Books one Expenses area where the user finds, filters, sorts and acts on every bill, expense, bill payment, vendor credit and vendor refund, with the list pattern that all Books lists share.

## 2. Where it lives

- A new sidebar entry **Expenses** (`books-nav-expenses`, Q1), in the top group between Sales and Lists, opens `books/purchases`. The entry is active on `books/purchases`, on `books/pay-bills`, and on every path under `books/bills`, `books/expenses`, `books/bill-payments`, `books/vendor-credits` and `books/vendor-refunds`.
- Six tabs, each a route:

| Tab | Route | Rows |
|---|---|---|
| All purchases | `books/purchases` | all five kinds |
| Bills | `books/bills` | bills |
| Expenses | `books/expenses` | expenses |
| Bill payments | `books/bill-payments` | bill payments |
| Vendor credits | `books/vendor-credits` | vendor credits |
| Vendor refunds | `books/vendor-refunds` | vendor refunds |

- Each kind route gets a `_layout.tsx` that draws the kind's list once, with a child Stack for the existing `[id]` and `new` screens, and an `index.tsx` that draws nothing (the `screens/invoices/` pattern). `books/bill-payments` has no `new` screen. `books/purchases` is one screen with no child route. `books/pay-bills` stays a screen of the Books root stack.
- A tab press replaces the current list route, so Back leaves the area and does not step through tabs.
- The lists are built from the shared parts of p2-sales-lists. Those parts stop naming Sales: each list belongs to a **list area** (`lib/list-areas.ts`: `sales` or `purchases`), which gives its title, tabs, New items, party (customer or vendor), texts, shortcut group and test-id prefix. Sales keeps its behavior and its `sales-…` test ids; the sales-lists e2e specs guard that, unchanged. Purchase test ids start with `purchases-…`.

## 3. Behavior

### Tabs and header

- The header shows the title "Expenses", the tab strip, and the New button. The tab strip scrolls sideways when the tabs do not fit.
- On a kind tab the New button reads "New bill", "New expense", "Pay bills", "New vendor credit" or "New vendor refund" and opens `books/bills/new`, `books/expenses/new`, `books/pay-bills`, `books/vendor-credits/new` or `books/vendor-refunds/new`. On All purchases it reads "New" and opens a core `Menu` (`@tinycld/core/ui/menu`) with those five actions, in `NEW_ACTIONS` order (the `takesVendor` entries).
- A user without write access (`useBooksAccess().canWrite` is false) sees no New button, no tick boxes and no Batch actions.

### Rows and columns

- A row shows one document. The columns of each tab on a wide screen:

| Tab | Columns |
|---|---|
| All purchases | Date, Type, No., Vendor, Category, Amount, Status |
| Bills | Date, No., Vendor, Due date, Balance, Total, Status |
| Expenses | Date, No., Vendor, Category, Total, Status |
| Bill payments | Date, No., Vendor, Reference no., Amount, Status |
| Vendor credits | Date, No., Vendor, Balance, Total, Status |
| Vendor refunds | Date, No., Vendor, Reference no., Amount, Status |

- The party column reads "Vendor" (Q2). A row with no vendor (an expense may have none), no number (a draft), no due date, no reference no. or no category shows "—" in that cell.
- Category (Q3) is read only. For a bill, an expense or a vendor credit with one line it is the line's account name (an account line) or the line's product name (a product line). With two or more lines it reads "Split", in muted text. With no line, and for every bill payment and vendor refund, it is "—".
- Type reads Bill, Expense, Bill payment, Vendor credit or Vendor refund (`VENDOR_TRANSACTION_TYPE_LABELS`).
- A vendor credit's amount shows negative, with a typographic minus, on All purchases (Q7). Every other kind shows positive. On the Vendor credits tab Total and Balance show positive.
- The Status cell is a `StatusBadge` with the label and tone that `lib/vendor-transactions.ts` gives each kind: a bill is Draft, Void, Paid, Partly paid, Overdue or Open; an expense is Draft, Void or Paid; a bill payment is Paid or Void; a vendor credit is Draft, Void, Unapplied or Closed; a vendor refund is Draft, Void or Received.
- A void original that a correction replaced is not listed (`listedClause`); the correction carries its number.
- All amounts draw in the Books settings' currency.
- Table columns are flex with a minimum width. Below the table's own minimum width (the sum of its column minimums) the list draws cards. The table never scrolls sideways.
- A card on All purchases shows two lines: type and number with the amount at the right, then vendor and date with the status badge at the right. A card on a kind tab shows the number and the vendor with the amount at the right, then the date (and "Due <date>" for a bill) with the status badge at the right. A card shows no category.

### Opening a document

- A press on a row or card opens the document at its existing route (`books/<kind>/<id>`). A draft opens in its form and a posted or void document in its read view, as those routes already do.
- On a window 1360 px wide or wider (core `detailSurfaceFor`, `@tinycld/core/lib/detail-surface`), every purchase document shows beside its kind's list (Q10): the list narrows to a 320 px column of two-line rows (number and vendor, amount and status) with the open row marked, and the document (form or read view, also `new`) takes the rest. Below 1360 px the document is a pushed page and Back returns to the list with its scroll position and filters.
- A document opened from All purchases, from a vendor page or from a report lands on the same kind route, so at 1360 px and wider it also shows beside its kind's list.
- Pay Bills (`books/pay-bills`, also a bill payment's Edit) covers the list at every width; Back returns to the list.
- The 320 px column keeps the search field. The chips, the date-range menu, the vendor picker, the tick boxes, the Batch actions button and the row menus do not draw there. When the open document is not among the column's rows, no row is marked. The selection clears when the list narrows to the column.
- A form that is dirty asks before any way out, as today (`useLeaveGuard`); a press on another row of the column is one of those ways.

### Search and filters

- The toolbar holds a search field, status chips, a date-range menu and a vendor picker. On a wide screen they share one wrapping row; on a phone the search field takes the first row, the chips scroll sideways on the second row, and the date-range menu and vendor picker share the third row.
- Search (Q5) matches each typed piece against the document's number, its reference no. (a bill's and a vendor credit's `ref_no`; an expense's, a bill payment's and a vendor refund's `reference_no`) or its memo (a bill payment has none), on the server, 250 ms after the last key (`searchPieces`, `lib/list-search.ts`). The field is a core `PlainInput` and its placeholder reads "Number, reference or memo". Search does not match the vendor's name.
- Status chips (one chosen at a time, "All" by default) (Q6):

| Tab | Chips |
|---|---|
| All purchases | All, Open, Overdue, Closed, Draft, Void |
| Bills | All, Open, Overdue, Paid, Draft, Void |
| Expenses | All, Paid, Draft, Void |
| Bill payments | All, Paid, Void |
| Vendor credits | All, Unapplied, Closed, Draft, Void |
| Vendor refunds | All, Received, Draft, Void |

- What each All purchases chip lists:

| Chip | Bill | Expense | Bill payment | Vendor credit | Vendor refund |
|---|---|---|---|---|---|
| Open | posted, balance > 0 | none | none | posted, balance > 0 | none |
| Overdue | posted, balance > 0, due date before today | none | none | none | none |
| Closed | posted, balance = 0 | posted | posted | posted, balance = 0 | posted |
| Draft | draft | draft | none | draft | draft |
| Void | void | void | void | void | void |

- On a kind tab a chip lists the rows whose badge reads the chip's label, with one addition: Bills "Open" lists every posted bill with a balance above zero (Open, Partly paid and Overdue badges).
- The date-range menu (core `PickMenu`, `@tinycld/core/ui/pick-menu`) offers This month, Last month, This quarter, This fiscal year, Last fiscal year (the presets of `lib/register-range.ts`) and All dates, on the document date. The default is All dates (Q14).
- The vendor picker is a Books `SearchPicker` over `books_vendors`: every vendor, inactive vendors included, searched by display name. Its first item, "All vendors", removes the filter. A chosen vendor narrows the list to that vendor's documents.
- Each tab keeps its own search text, chip, date range, vendor and sort while the app is open. They reset when the app reloads.

### Sort

- The default order is Date, newest first, then creation time, newest first.
- A press on a sortable column header sorts by that column ascending; a second press sorts descending. The header shows an arrow on the sorted column and states the order to assistive technology (`aria-sort`).
- Sortable columns: Date, No. and Amount or Total on every tab; also Due date and Balance on Bills, and Balance on Vendor credits. Type, Vendor, Category, Reference no. and Status do not sort.
- No. sorts by the document's numeric `sequence`. On All purchases the amount sorts by the signed value, so a vendor credit of −$400.00 comes before a bill of $0.00 in ascending order.
- An empty value (a draft's number, no due date) sorts before every other value in ascending order and after them in descending order. Rows with the same value are in creation order, newest first, in both directions.
- When the list draws cards, there is no header. A "Sort" menu in the toolbar (core `PickMenu`) lists the tab's sortable columns, each in both directions.

### Row menu

- Each row and card ends with a "More actions" button (44 px target) that opens a core `Menu`. A press on it, or on one of its items, does not open the row.
- The menu holds Open, then the actions the document's read view offers for its status and the user's access, in the read view's order and with the read view's labels, without Edit (Q8):

| Kind | Posted, writer | Void, writer | Reader |
|---|---|---|---|
| Bill | Pay bill (balance > 0), Void, Copy, View journal entry | Copy, View journal entry | View journal entry |
| Expense | Void, Copy, View journal entry | Copy, View journal entry | View journal entry |
| Bill payment | Void, View journal entry | View journal entry | View journal entry |
| Vendor credit | Apply to bills and Record refund (balance > 0), Void, Copy, View journal entry | Copy, View journal entry | View journal entry |
| Vendor refund | Void, View journal entry | View journal entry | View journal entry |

- A draft's menu holds Open and Delete draft; a reader's draft menu holds Open only. View journal entry shows only when the document has an entry.
- Each action does what it does on the read view. Pay bill pushes `books/pay-bills?bill=<id>`. Copy pushes the kind's `new` route with `?copy=<id>`. Record refund pushes `books/vendor-refunds/new?vendor=<vendor>&credit=<id>`. View journal entry pushes `books/entries/<entry>`. Apply to bills pushes the vendor credit and opens its Apply dialog there (`useApplyCreditStore.open(id)` after the push; the credit's read section draws the dialog). Void and Delete draft open their confirm dialog (core `Dialog`) over the list, and a refusal from the server shows in the list's banner (Books `ListBanner`) with the server's text. A bill payment's and a vendor refund's Void dialog shows that kind's own text (`pay-bills-texts`, `vendor-refund-flow`).

### Batch actions

- A user with write access sees a tick box at the start of each row and card (44 px target) and, in the table, a tick box in the header that ticks or clears every loaded row.
- The "Batch actions" button opens a core `Menu` with "Delete drafts" and "Void" (Q9). In the table the button is disabled while no row is ticked. When the list draws cards, the button shows as an icon and stays enabled, its menu also holds "Select all" (every loaded row) and "Clear selection", and "Delete drafts" and "Void" are disabled while no row is ticked.
- Each action opens one confirm dialog that names how many of the ticked documents it applies to and how many it skips ("Delete 3 drafts? 2 selected documents are not drafts and stay."). Delete drafts applies to drafts (a bill payment is never one). Void applies to posted documents of all five kinds. When the action applies to none of the ticked documents, the dialog says so and has no confirm button.
- The action writes one document at a time and collects `{ done, failed }`. After it ends, the documents that succeeded leave the selection, the ones the server refused stay ticked, and the banner reads "<n> done, <m> refused" with the first refusal's text.
- A change of tab, chip, search, date range or vendor clears the selection. A change of sort keeps it.

### Paging

- A list loads its first 50 rows and 50 more each time the user scrolls near the end. Rows on screen stay while the next 50 load. The table and the cards draw only the rows near the viewport (`ListTable`, `ListCards`).

### States

- Loading: the first load of a tab shows core `LoadingState`. A change of filter or sort keeps the last rows on screen and marks the list `aria-busy` until the new rows land.
- Empty with no filter set: "No bills yet" (the tab's noun; "No purchase transactions yet" on All purchases) with a core `Button` for the tab's New action when the user has write access.
- Empty with a filter set: "No bills match" ("No purchase transactions match" on All purchases) with a "Clear filters" core `Button` that resets search, chip, date range and vendor.
- Error: the banner reads "Purchase transactions could not load." with Retry, on every tab. Retry restarts every read that failed (each kind's query, the vendor names, the settings) with one core `recoverLiveQueries` call over the merged recoveries (`mergeRecoveries`, `lib/live-recovery.ts`).

### Keyboard (web and iOS hardware keyboard)

- The keys of the Sales lists (Q12): `/` focuses the search field and Escape leaves it. `J` or ArrowDown and `K` or ArrowUp move the row focus. Enter or `O` opens the focused row. `X` or Space ticks it and `A` ticks or clears all loaded rows. `N` runs the tab's New action. `1` to `6` switch tabs.
- The keys are registered with core `useRegisterShortcuts` (`@tinycld/core/lib/shortcuts`), in the group "Expenses" with the area's tab labels. A key is registered only while its action is offered. The keys are in the ⇧? list and in the help topic.
- Android has no list keys; every action has a visible control.

### Vendor page

- The vendor page's Transactions tab keeps its behavior (vendor-pages-design §3.5). Its data hook `useVendorTransactions` becomes a caller of `useDocumentList` with the vendor fixed (`vendorTransactionsTab(filter)`), as `useCustomerTransactions` is (Q11). The vendor-pages e2e specs guard it, unchanged.

### Help

- A new help topic `help/purchase-lists.md` ("To find a bill or an expense, …") covers tabs, search, filters, sort, the Category column, row menus, batch actions and the keys. `help/navigating-books.md` gains the Expenses entry. `help/bills.md`, `help/expenses.md`, `help/pay-bills.md`, `help/vendor-credits.md` and `help/vendor-refunds.md` each link to it.

## 4. Data

- Reads: `books_bills`, `books_expenses`, `books_bill_payments`, `books_vendor_credits`, `books_vendor_refunds`, their line collections `books_bill_lines`, `books_expense_lines`, `books_vendor_credit_lines` (the category), `books_accounts` and `books_products` (the category's name), `books_vendors` (the vendor's name, the vendor picker), `books_settings` (currency, fiscal year start month). No new collection, no new field, no migration, no new endpoint, no Go change.
- `useDocumentList` keeps its window, keep-rows, busy, error and recovery logic and takes its per-kind reads from two hooks, each a set of five live queries: `useSalesListQueries` (the five queries it holds today, moved) and `usePurchaseListQueries` (new). A tab's area picks which set runs; the queries of the other set, and of a kind the chip does not list, return `undefined` and send no request.
- Each purchase query filters by the listed rule, the chip, the date range, the vendor and the search in its `where`, orders by the sort column then `created` descending, and takes the first `n` rows. The merge is `documentListWindow` (exact, as each list is its source's first `n` rows in that order). For the signed amount order on All purchases, the vendor credit query orders by `total` in the opposite direction. A vendor refund's amount column is `amount`; the other kinds' is `total`.
- Each query's `select` reads the vendor's display name with `materialize(… .findOne())` from `books_vendors`, so an expense with no vendor stays listed.
- Category: the bill, expense and vendor credit queries' `select` also reads the document's first two lines by `position` with a to-many `materialize()` over the line collection (`eq(line.<document>, document.id)`, `.orderBy(position)`, `.limit(2)`; the to-many form `hooks/useTaxesScreen.ts` uses). Two lines mean "Split". One line gives an account id or a product id; the list reads those names with one live query over `books_accounts` and one over `books_products` for the ids of the rows on screen (`inArray`), in a hook `usePurchaseCategories`. The plan's first task proves in a hook test that `.limit(2)` holds inside a to-many `materialize()`; if it does not, the subquery has no limit and the rule reads the line count.
- The row type `DocumentListRow` names its party neutrally: `partyId` and `partyName` replace `customerId` and `customerName`, and `DocumentListFilters.customer` becomes `party`. Its `kind` is `TransactionKind | VendorTransactionKind`. A purchase row adds `category` (a category state: none, split, account id or product id).
- Writes: Void and Delete draft use `useVoidDocument` and `useDeleteDraftDocument`, extended to the five purchase kinds (`collection.update(id, draft => { draft.status = 'void' })`, `collection.delete(id)`; the server deletes a draft's lines). The purchase read views' Void and the forms' Delete draft move onto those two hooks, so one write serves the list and the document. Tab state and the selection stay in `stores/document-list-store.ts`, not persisted.
- Access: `useBooksAccess().canWrite` gates New, tick boxes, Batch actions and the write actions of a row menu.
- Seed: `lib/purchase-lists-fixture.ts` adds draft and posted rows that the list specs delete, void and filter (each with a unique memo, on fixed past dates after 2026-06-30, for vendors no other spec totals), wired into `seed.ts`.

## 5. Cut

- Change a category in the row (Q4): a posted document is immutable; a change is a correction, made in the document's form.
- Print checks: check printing is in the "Later" group of the Books scope.
- Purchase notifications, the feedback link: not Books features.
- Export, print and column settings on the list: reports export; the sales lists have none.
- Overview entry: it is the Dashboard (p5-dashboard). Vendors entry: the Lists hub. 1099s: p3-vendor-1099 reports. Mileage, Contractors: not in the Books scope. Purchase orders: "Later".
- Filter by payment method or by paid-from account: the account register shows one account's payments; the chips, the date range and the vendor picker cover the list.
- A Memo column: Category takes its place; search still matches the memo.
- Sort by Vendor, Type, Category or Status; search by vendor name: the vendor picker, the tabs and the chips answer the same need.
- A batch "Pay bills": Pay Bills is the screen that pays several bills, and it has its own vendor filter and tick boxes.
- Custom date range, a totals row, saved filter sets: as in the sales lists.

## 6. Platform notes

- Keyboard shortcuts work on web and with an iOS hardware keyboard; Android uses the visible controls. Approved as the Books default (human, 2026-11-11).
- No other single-platform item.

## 7. Sparks carried

- Status reads from color: `StatusBadge` tones over `--color-success`, `--color-warning`, `--color-destructive`, `--color-muted`, `--color-info`.
- A row with several categories says "Split" in `text-muted-foreground`; one category draws in `text-foreground`.
- Dropped: the category drawn as an input (it served inline edit).
- No core extension.

## 8. Non-goals

- No change to the behavior of a purchase document form or read view, except that at 1360 px and wider it shows beside its kind's list, and that its Void and Delete draft writes move to the shared hooks.
- No change to the behavior of the Sales lists, the customer page or the vendor page; their shared parts take a list area.
- No change to Pay Bills.
- No balance column in the Vendors list (p5-vendor-balance), no A/P aging, no purchase orders tab, no recurring transactions.
- No new server code and no migration.
