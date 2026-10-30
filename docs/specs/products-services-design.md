# Products and services

## Goal
Let a bookkeeper create, edit, deactivate and delete the things the business sells and buys (Service, Non-inventory and Bundle products) on the core forms engine, and find them in a Products and services list. The product shown is in the URL.

## Design decisions
Direction A and the answers to Q1-Q18 were approved at the design gate on 2026-10-29 ("ok, A, platform signed off"). This draft carries every one of them. It is regenerated against the parts p3-vendors built (books `books/p3-vendors` at 2208ad9, core 5217753). p3-vendors merged (books #21 → 91ce648, core #405 → 1bda334); the unit branches from books `main` 91ce648 and builds against core `main` 1bda334.

The design gate on 2026-10-30 approved direction A again ("A - accept recommendations on questions as well") and accepted G1-G9 as recommended:
- G1: `RecordRowMenusConfig` gains a required `titleOf(record)` and its record type widens to `{ id, inactive }`; customers and vendors pass `r => r.display_name`. The product column stays `name`.
- G2: `useRecordList` and `partyListViewState` widen their bound to `{ id: string; inactive: boolean }` (type-only; behavior unchanged).
- G3: the list frame moves out of `components/party/PartyList.tsx` into `RecordListFrame`, `ListTable`, `ListCards` (+ `recordCardHeight`); customers and vendors move onto it unchanged, their e2e specs are the guard.
- G4: the searchable picker moves out of `CustomerPicker` into `SearchPicker`; `ProductPicker` is built on it and `CustomerPicker` moves onto it unchanged.
- G5: `ExpenseAccountField` and `HostSelect` move from `forms/vendor-fields.tsx` to `forms/account-fields.tsx` with the new `IncomeAccountField`; `HostSelect` is exported; the query key becomes `books.form.accounts`. The vendor host keeps the component name.
- G6: `validateExpenseAccount` takes its A/R-A/P message; products pass "A product's expense account cannot be Accounts receivable or Accounts payable."; the vendor text and test do not change.
- G7: the shared seed gets no new account; the e2e fixture uses 4000, 6200, 6210 and 6900 (inactive); `product-defaults` unit tests cover the Product sales and Cost of goods sold choices.
- G8: the list frame's title gets `min-w-0 shrink` so a long title wraps to two lines beside the New button.
- G9: the products list loads the way the customer and vendor lists do (one live query, search and Show inactive on the client). Paged, server-filtered lists for customers, vendors and products are the next unit, p2-books-fts-search, which converts all three.

Where a 2026-10-29 decision named a part differently from what p3-vendors built, the built name is used here:

| 2026-10-29 name | Built name (books 2208ad9) | Note |
|---|---|---|
| record-route | `lib/record-route.ts`: `recordPath(listPath, id)`, `newRecordPath(listPath, params?)`, `openRecordFromPath`, `navigationModeFor`, `RECORD_DETAIL_SCREENS` | `lib/product-route.ts` wraps it as `lib/vendor-route.ts` does. |
| useRecordNavigation | `hooks/useRecordNavigation.ts`: `useRecordNavigation(listPath)` → `open(id)`, `openNew(params?)`, `leave()`; `useIsShowingRecord`, `useOpenRecord` | `openNew({ type })` opens `new?type=`. |
| RecordSurface | `components/RecordSurface.tsx` (`RecordSurface`, `RecordLoadingBody`), plus `RecordChild`, `RecordByIdScreen`, `RecordNotFound` | The product child and the by-id screen use all four. |
| useRecordSave "optional rows step" | `hooks/useRecordSave.ts` + `lib/record-save.ts` have no rows step | This unit adds it (see Save model). `hooks/useRecordForm.ts` also needs an optional `tables` input, because it calls core `useFormEdit` with no table rows. |
| record-refusals | `lib/record-refusals.ts`: `recordRefusalHandler`, `closedRecordRefusalHandler` | Unchanged. |
| useRecordActions | `hooks/useRecordActions.ts` (`setInactive`, `remove`, `get`, `store`, `logContext`; `SERVER_UNREACHED`) and `hooks/useRecordRowMenus.ts`, `components/RecordRowMenu.tsx`, `lib/record-menu.ts`, `components/DeleteRecordDialog.tsx` (`DeleteDialogLine` with a role `key`) | `useRecordRowMenus` reads `display_name`; products have `name` (2026-10-30 gate G1). |
| createRecordFormStore | `stores/record-form-store.ts`: `createRecordFormStore`, `useDeletingRecord` | `stores/product-form-store.ts` is one line, as `vendor-form-store.ts`. |
| ListBanner, ListToolbar | `components/ListBanner.tsx`, `components/ListToolbar.tsx`, plus `components/ListEmptyState.tsx`, `hooks/useRecordList.ts`, `lib/party-list.ts`, `lib/list-query.ts` (`retryListQuery`) | `useRecordList` is bound to the customer/vendor columns (2026-10-30 gate G2). The list frame lives inside `components/party/PartyList.tsx` (2026-10-30 gate G3). |
| ExpenseAccountField + expenseAccountOptions | `forms/vendor-fields.tsx` `ExpenseAccountField` (private `HostSelect`), `lib/expense-account-options.ts` `expenseAccountOptions(accounts, storedId)` → `{ options, triggerLabel }`, over `lib/account-options.ts` `accountOptionList` (options carry `indent`, core `SelectOption.indent`) | Moved, not copied, to `forms/account-fields.tsx` with `HostSelect` exported and a neutral query key; the vendor host keeps the same component name (2026-10-30 gate G5). |
| Go nameKey | `server/names.go`: `nameKey(trimmed)`, `nameKeyTaken(app, collection, key, id, scope)`; `server/guards.go`: `bindSerializedGuard(app, collection, check)` | The product guards bind through `bindSerializedGuard`. |
| Go expense account check | `server/vendors.go` `validateExpenseAccount` | Its A/R-A/P message names a vendor (2026-10-30 gate G6). |
| migration 2100000004 | `pb-migrations/2100000004_create_books_vendors.js` | This unit adds `2100000005_create_books_products.js`. |
| Books `hideBuiltins` (Q4) | not built | This unit adds `lib/form-definition.ts`. |

## Where it lives
`books/` (package files import each other relatively):
- Routes (lesson 6, the p2-customers pattern):
  - `screens/products/_layout.tsx` → `/a/books/products`. `ListDetailLayout` with `list={<ProductsList openId={openId} />}`, `isDetailOpen`, `detailScreens={PRODUCT_DETAIL_SCREENS}`; `useOpenRecord(PRODUCTS_PATH)`.
  - `screens/products/index.tsx` → no product open. Draws nothing.
  - `screens/products/[id].tsx` → `/a/books/products/<id>`: `useRecord` + `useDeletingRecord` + `RecordByIdScreen` → `ProductChild` (edit, or view for read-only users).
  - `screens/products/new.tsx` → `/a/books/products/new` shows `ProductTypeChooser`; `/a/books/products/new?type=service|non_inventory|bundle` shows `ProductChild` in create mode.
- `lib/product-route.ts` (pure, unit-tested): `PRODUCTS_PATH` (`books/products`), `productPath(id)`, `newProductPath(type?)`, `openProductFromPath(pathname)`, `PRODUCT_DETAIL_SCREENS = RECORD_DETAIL_SCREENS`.
- `hooks/useProductNavigation.ts`: `useRecordNavigation(PRODUCTS_PATH)`, plus `openNew(type?)` that passes `{ type }`.
- Forms host: a third entry `books:product` (`PRODUCT_HOST_KEY`) in `tinycld/books/forms/hosts.ts`. Its components: `forms/product-fields.tsx` (`ProductTypeField`, `BundleProductCell`), `forms/money-fields.tsx` (`MoneyField`), `forms/account-fields.tsx` (`HostSelect`, `ExpenseAccountField` moved from `vendor-fields.tsx`, `IncomeAccountField` new), all in the one `components` map of `forms/ui.ts`.
- Components: `components/products/` (`ProductsList`, `ProductRow`, `ProductCard`, `ProductChild`, `ProductTypeChooser`, `DeleteProductDialog`, `ProductPicker`), `components/forms/HostMoneyInput.tsx`. `ProductsList` is built on the shared list frame (2026-10-30 gate G3), `ProductPicker` on the shared search picker (2026-10-30 gate G4). The row menus pass `titleOf: product => product.name` (2026-10-30 gate G1); `useRecordList` takes product rows once its bound is widened (2026-10-30 gate G2).
- Hooks: `hooks/useProductsQuery.ts`, `hooks/useProductForm.ts` (returns `RecordChildState`, as `useVendorForm`), `hooks/useBundleItems.ts`, `hooks/useProductActions.ts` (a thin call of `useRecordActions`).
- Libs: `lib/product-types.ts` (`PRODUCT_TYPES`: key, label, noun, chooser sentence; `productTypeLabel`; drift-tested against the migration), `lib/form-definition.ts` (`hideBuiltins(definition, keys)`, `requireBuiltins(definition, keys)`), `lib/product-form.ts` (`productDefinitionFor(definition, type)`), `lib/product-list.ts` (`productRows`, `productMatches`, `compareProductNames`, `PRODUCT_COLUMNS`, `PRODUCT_TABLE_MIN_WIDTH`, `productCardHeight`), `lib/product-display.ts` (`productListCopy(canWrite)`, `productsEmptyHint`, `productDeleteLines`, `productTitle`), `lib/product-columns.ts` (`productColumnsSchema`, `productColumnsFor(type, columns)`, `EMPTY_PRODUCT_FIELDS`, `EMPTY_PRODUCT_COLUMNS`), `lib/product-messages.ts` (refusal copies, drift-tested; `PRODUCT_SAVE_TEXTS`), `lib/income-account-options.ts`, `lib/product-defaults.ts` (`defaultIncomeAccount(accounts, type)`, `defaultExpenseAccount(accounts)`), `lib/bundle-items.ts` (`BUNDLE_ITEM_MAPPER: TableRowMapper`, `BUNDLE_ITEM_COLUMNS`), `lib/table-writes.ts` (`tableWriteSteps`, `createTablePlans`).
- `stores/product-form-store.ts`: `createRecordFormStore<BooksProducts>()`.
- `lib/shell-nav.ts`: a `products` entry in `LIST_ENTRIES` (label "Products and services", description "What you sell and buy", href `books/products`); a `product` action in `NEW_ACTIONS` (column `other`, label "Product or service", href `books/products/new`); `hidesNewFab` also matches `/books/products/<segment>`.
- `lib/search-target.ts`: kind `product` → `books/products/[id]`.
- Server: `pb-migrations/2100000005_create_books_products.js` (both collections), `server/products.go` (guards and the `productReferences` list), a products refusal in `checkAccountDelete` (`server/accounts.go`), `validateExpenseAccount` takes its A/R-A/P message (`server/vendors.go`), registrations in `server/audit.go`, `server/oauth_scopes.go`, `server/search.go` (`searchProducts`).
- `lib/products-services-fixture.ts` (synthetic data, imported by `seed.ts`).
- `help/products-services.md` (help topic), linked from `help/navigating-books.md`.

## Behavior

List
- The screen shows the shared list frame: the "All lists" back link (`router.dismissTo` the Lists hub), the title "Products and services", a "New product or service" button for writers, the toolbar (shown once at least one product exists), the banner, and the list. On phones the Books New FAB also shows on the list, and the title wraps to two lines beside the New button (the shared header's title gets `min-w-0 shrink`; 2026-10-30 gate G8).
- Products are one flat list sorted by name (case-insensitive, then id).
- Wide columns: Name (the SKU below in muted text when set), Type ("Service", "Non-inventory", "Bundle"), Sales price (right-aligned, `formatMoney` with the row's currency), Cost (right-aligned), row menu. A price or cost of 0 shows blank; a bundle's Sales price and Cost are blank; a Service or Non-inventory item with purchasing off shows a blank Cost. No sortable columns, filter chips, batch actions, thumbnails or category column. The table has a minimum width of 560 px (`useTableMinWidth`) and scrolls sideways in a narrower column; Name shrinks with an ellipsis and never collapses to blank; the header is sticky inside the vertical scroller.
- The toolbar is `ListToolbar`: a search field ("Search products and services") and the "Show inactive" chip (off by default). Search filters by name, SKU or sales description, case-insensitive. Shown inactive products are dimmed with an "Inactive" label.
- Tapping a row opens that product: edit for writers, read-only for read-only users. On the panel surface the open product's row has `bg-accent`; the open product is read from the URL. Tapping the open product's row again does nothing (`useRecordNavigation.open`).
- The row menu (writers only) is `RecordRowMenu` with `recordMenuItems`: Edit, Make inactive or Make active, Delete; test ids from `recordMenuTestIds('product')`; trigger label "Product actions". The menu button is a sibling of the row's open button, never inside it.
- The list is windowed (`useRowWindow`).
- Empty states are `ListEmptyState` with singular "product or service" and plural "products or services": no products → "No products or services yet", hint "Add what you sell and what you buy." and a "New product or service" button for writers; read-only users see the hint "Products and services appear here once a bookkeeper adds them." Search with no match → "No products or services match" with Clear search. Every product inactive, no search, Show inactive off → "No active products or services" with Show inactive.
- Loading: the loading body until the products query is ready. A failed query shows the banner "Could not load products and services" with Retry, which rebuilds only the failed query (`retryListQuery`).
- Phone (core `useBreakpoint() === 'mobile'`): each product is a card (name, then "Type · price" on a muted line, the SKU on a second muted line when set; the height from `productCardHeight`). The toolbar is the same search field and chip.

Surfaces and navigation (the p2-customers and p3-vendors rule, unchanged)
- `useDetailSurface()`: panel at a 1360 px window or more, page below. Panel: a 480 px column at the right; the list stays usable on web and native. Page: covers the content area; the shell rail and sidebar stay. `ListDetailLayout` owns stack options, pointer events and tree shape; the product screen never remounts when the surface flips.
- Surface chrome is `RecordSurface` (test id prefix `product`): panel → 52 px header with the title and ✕ ("Close"); page → "‹ Products and services" above the title, the form in a centered column of at most 720 px. Sticky footer on both.
- `useProductNavigation()`: with no product open, `open` and `openNew` push; with one open they replace it. `leave()` runs `router.dismissTo` the list.
- Escape runs Cancel through `RecordSurface`'s `modal` shortcut scope; an open dialog or menu takes Escape first.
- The Books New FAB is hidden on a product page (`hidesNewFab`).
- An unknown or deleted product (`RecordByIdScreen`): "This product or service doesn't exist or was removed" with a "Back to products and services" button. A product deleted elsewhere turns the open form into that message. Deleting the open product from its row menu: when its form is dirty the Delete dialog adds "Unsaved changes to this product will be lost."; after the delete succeeds it closes with no second question (`useDeletingRecord`, `RecordChild`'s `usePublishDirty`).

Type chooser (direction A)
- `/products/new` with no valid `type` shows `ProductTypeChooser` inside `RecordSurface`: title "New product or service", then three pressable rows, each with the type's name and one sentence:
  - Service — "Work you do for customers, such as consulting, repairs or lessons."
  - Non-inventory — "Goods you buy or sell without counting how many you have, such as parts used on a job."
  - Bundle — "Products and services you sell together as one line, such as a starter kit."
- Pressing a row runs `router.setParams({ type })`, so the form replaces the chooser in place, and Back from the form returns to the list (no extra history entry). The footer has Cancel only. An unknown `?type=` value shows the chooser.
- Read-only users never reach `new` (the New actions are hidden); a deep link shows the chooser with the rows disabled and the line "You can view products but not add them."

Form
- The body is `RecordChild`'s core `FormRenderer` (layout `sections`, `summary="root"`) for host `books:product`, on the form the record names (edit) or the default form (create). Admin custom fields from Settings → Forms appear at the page end; their values never post to the ledger.
- The title is `recordTitle(noun)` with the noun of the form's current type: "New service", "Edit non-inventory item", "Edit bundle"; read-only users see "Service", "Non-inventory item", "Bundle".
- `useProductForm` returns `RecordChildState` with `definition` replaced by `productDefinitionFor(definition, type)`: the stored definition with the built-ins the type does not use set to `hidden: true` (`hideBuiltins`, Q4), and Income account marked required for Service and Non-inventory (`requireBuiltins`, display only; the server enforces it). Service and Non-inventory hide `items`; Bundle hides `price`, `income_account`, `purchases`, `purchase_description`, `cost`, `expense_account`. `type` is read with `useWatch` on the record form, so on create the visible fields follow the type field at once. A built-in an admin hid stays hidden.
- Built-in fields, in default order: Type, Name (required), SKU, Sales description, Bundle items, Sales price, Income account, I purchase this from a vendor, Purchase description, Cost, Expense account.
- Default layout (Q18): one page "Product or service"; half-width pairs Name + SKU, Sales price + Income account, Cost + Expense account. Pairs show side by side at a container of 640 px or more (the page's 720 px column); the 480 px panel and phones show one column.
- Default rule (host layout `rules`, admins see it in Settings → Forms): when "I purchase this from a vendor" is off (`is_false`), hide Purchase description, Cost and Expense account.
- Type is `ProductTypeField`, required. For Service and Non-inventory it is `HostSelect` (core `SelectInput`) with those two options; changing type keeps every value (Q5). For a Bundle it shows "Bundle" as text with the help text "A bundle keeps its type." The create form starts with the chosen type.
- Name is a text field (max 200); SKU a text field (max 100); Sales description and Purchase description are multi-line text fields (max 4000).
- Sales price and Cost are `MoneyField` (`HostMoneyInput` through `useHostValueForm`): a text input with a decimal keyboard, right-aligned, holding integer cents (`parseMoney`, `formatMoney` with the Books currency, `maxStoredAmount`). Empty or 0 shows an empty input and stores 0. On blur the text is reformatted (`1250` → `1,250.00`). Malformed text shows "Enter an amount such as 1,250.00" under the input; a negative amount shows "Enter an amount of 0 or more"; above the stored maximum shows "Too large". These are the input's own checks; the server stays the authority (Q10).
- Income account is `IncomeAccountField`: `HostSelect` over `incomeAccountOptions(accounts, storedId)`: the active Income and Other income accounts in chart order, `indent` by depth, labelled `number name` (`accountOptionList`), and a `triggerLabel` that names a stored account that is not offered (it became inactive or changed type), which is kept on save.
- I purchase this from a vendor is a toggle built-in (off by default) (Q6).
- Expense account is `ExpenseAccountField` (moved to `forms/account-fields.tsx`; "None" first, then active accounts without Accounts receivable and Accounts payable, `triggerLabel` for a stored account not offered). The server requires an account while purchasing is on.
- Defaults (Q7): new Service and Non-inventory products start with Income account = the first active account with detail type Service income (Service) or Product sales (Non-inventory), else the first active Income account, else empty; Expense account = the first active Cost of goods sold account, else empty. A new bundle starts with both empty. The `new?type=` route waits for the accounts query before it mounts the form, so the defaults are in the first values (`createValues`). Changing the type between Service and Non-inventory does not change the chosen accounts.
- The column parse (`productColumnsFor(type, columns)`) writes a bundle's `price` and `cost` as 0, its accounts and purchase description as empty and `purchases` as off, whatever the hidden fields hold, so a bundle never sends a value the server refuses.
- Bundle items (Q11, Q12) is a core table built-in (`storage: 'rows'`) with columns "Product or service" (`product`, text, required, component `BundleProductCell`: `ProductPicker` over active Service and Non-inventory products, searched by name or SKU, 50 at a time) and "Qty" (`quantity`, number, required, 0.01 to 1,000,000). Add row, remove and reorder come from core `TableField`; under a 640 px container the rows are cards. A row whose product is inactive shows the product name with "(inactive)". A product may be on two rows. A bundle may be saved with no rows.
- Validation is the zod schema the forms engine builds: Name and Type required; each bundle row needs a product and a quantity in range. Lengths, account rules, the price and cost range, the bundle rules and duplicate names are server rules; field refusals land on their fields through the host's `onError`; a refusal with no field shows in the root summary. A refused bundle row shows in the root summary as "Item <n>: <message>".

Save model (p3-vendors' `useRecordSave`, the same on both surfaces)
- Footer from `recordFooter`: Cancel, Save, and Save and new (create only). Save and new resets to the starting values of the same type and stays on `products/new?type=<type>`.
- Create inserts into `books_products` with `insertRow(EMPTY_PRODUCT_COLUMNS, columns, …)` (a new id, the form id, the custom-field JSON, the type). For a bundle, the same mutation then runs the rows step: `createTablePlans` (`planTableWrites([], rows, BUNDLE_ITEM_COLUMNS)`) turned into ordered writes by `tableWriteSteps`, one write at a time in row order. When a row is refused after the product was inserted, the product stays saved: the form resets, the screen replaces `new` with `products/<id>` (edit of the saved bundle, which shows the rows that were written), and the toast "The bundle was saved, but an item was not: <message>" shows.
- Edit writes the dirty columns, then the bundle row plan from `patch().tableWrites.items`, one write at a time: removes, then updates, then inserts. When only rows changed, the record update is skipped. A refusal stops the rest and shows on the form; Save again writes what is left. `markSaved` runs after every write landed.
- The rows step is new in `useRecordSave`: an optional `rows` entry in `RecordSaveConfig` (`writes(recordId, plans)` returns the ordered write thunks; `onPartialCreate(recordId, error)` handles a refusal after the insert). `useRecordForm` gains an optional `tables` input, forwarded to core `useFormEdit`, and `useProductForm` passes `{ items: tableRowsOf(rows, BUNDLE_ITEM_MAPPER) }` once the rows have loaded. Vendors and customers pass neither and do not change.
- Every other save behavior is `useRecordSave`'s: one press at a time (`runLocked`), leave paths disabled while saving, a refusal after the user left becomes the toast "The product was not saved." (`closedRecordRefusalHandler`), a throw before the write sets the root error "Books could not save this product." (`startFailed`).
- Discard check: `RecordChild`'s core `useLeaveGuard(isDirty && !isSaving && !isBeingDeleted)` with the `ConfirmDialog` "Discard changes?" (message "This product has changes that are not saved."). It holds ✕, Back, Cancel, Escape, a replace from another row, iOS swipe-back, Android back and the browser Back button on web; reload and tab close ask through `beforeunload`. The chooser has no guard (nothing typed).
- Read-only users see the same surface with `readOnly` and a Close button only (`recordFooter`).

Inactive and delete (Q13)
- Make inactive and Make active run through `useRecordActions` with no dialog, always allowed. Inactive products are left out of the default list and of the bundle product picker; bundles that hold them keep them.
- Delete opens `DeleteProductDialog` on `DeleteRecordDialog` (title "Delete product or service"), lines with role keys: `name`, `explanation` "This cannot be undone.", for a bundle `bundle` "Its item list is deleted with it.", `unsaved` when it applies, `refusal`. Cancel and Delete. The server refuses deleting a product that is on a bundle ("This item is in 2 bundles. Take it out of them first, or make it inactive."); the refusal shows in the dialog. Later units (invoice, sales receipt, bill, expense and others) add their own refusals by appending to the Go `productReferences` list.
- One write runs at a time (`isWorking`). A write that gets no answer shows `SERVER_UNREACHED` ("Your change wasn't saved: the server could not be reached.").

Accounts (Q8)
- Deleting an account that a product names as its income or expense account is refused: "This account is used by 3 products and services and cannot be deleted. Make it inactive instead." (added to `checkAccountDelete`). Making it inactive is allowed; products keep it.

Search, shell, help
- The federated search lists products (name, SKU, sales description); a hit opens `books/products/<id>`. Title = name, subtitle = SKU, or the type label when there is no SKU, meta "Product or service".
- The Lists hub shows a Products and services card; the New menu's Other column shows "Product or service", which opens `books/products/new`.
- Help topic `products-services` explains the three types, creating and editing each, bundles, purchasing information, inactive and delete, custom fields, and that the product opens beside the list on a very wide window and as its own page otherwise.

## Data
- New collection `books_products` (migration `2100000005_create_books_products.js`, rule constants copied from 2100000004):
  - `type` select, required, max 1, values `service`, `non_inventory`, `bundle`.
  - `name` text, required, max 200; `sku` text max 100; `sales_description` text max 4000; `purchase_description` text max 4000.
  - `price`, `cost` number, `onlyInt`, min 0, max 9007199254740991 (integer cents, Q10).
  - `income_account`, `expense_account` relation to `books_accounts`, max 1, no cascade delete (account delete is refused while used).
  - `purchases` bool; `inactive` bool.
  - `currency` text, set by the server from `books_settings` (Q17).
  - `form` relation to core `forms`, `fields` json (maxSize 1000000).
  - `name_key` text, hidden, max 1000, set only by the guard (`nameKey` of the trimmed name). Index: unique on `name_key` (Q9; SKU not unique). Index on `form`.
  - `created`, `updated` autodate.
  - Rules: list and view `READ`, create, update and delete `WRITE`.
- New collection `books_bundle_items` (same migration): `bundle` relation to `books_products`, required, cascade delete; `product` relation to `books_products`, required, no cascade delete; `quantity` number, min 0.01, max 1000000; `position` number, `onlyInt`, min 0; `created`, `updated`. Index on `bundle`. Rules as `books_products`.
- Go guards in `server/products.go`, bound with `bindSerializedGuard` (create and update) and a `serialized` delete hook:
  - Product: name trimmed and stored trimmed; unique among products through `nameKey` / `nameKeyTaken` ("A product or service named “X” already exists." on `name`). Type: a bundle stays a bundle and nothing becomes a bundle after create ("A bundle cannot change type." / "Only a new product can be a bundle." on `type`). Service and Non-inventory: `income_account` set ("Choose an income account."), exists, active when it changes ("The income account is inactive."), of type Income or Other income ("The income account must be an Income or Other income account."), each on `income_account`; while `purchases` is on, `expense_account` set ("Choose an expense account.") and checked by `validateExpenseAccount` with the product message "A product's expense account cannot be Accounts receivable or Accounts payable."; while `purchases` is off the purchase fields are kept and not checked. Bundle: `price`, `cost`, `income_account`, `expense_account`, `purchase_description` empty and `purchases` off ("A bundle has no price, cost or accounts of its own."). `currency` stamped on create. Delete refused while a `productReferences` entry counts a row (this unit's one entry: bundle items, with the count in the message).
  - Bundle item: the bundle exists and is a Bundle ("Items belong to a bundle." on `bundle`), and `bundle` never changes; the product exists, is not a bundle ("A bundle cannot contain another bundle." on `product`), and is active when the row is created or its product changes ("“X” is inactive." on `product`); quantity above 0, at most 1,000,000, at most 2 decimals ("Enter a quantity above 0 with at most 2 decimals." on `quantity`); at most 50 rows per bundle ("A bundle holds at most 50 items.").
  - Every message ends with a period (PocketBase adds one to every ApiError message).
- Registrations: `audit.RegisterCollection` for `books_products` (`LabelFromField("name")`) and `books_bundle_items` (label "<bundle name>: <product name>", read like `lineLabel`); OAuth `books_products: rw`, `books_bundle_items: rw`; a search source of kind `product` (hit id `product:<id>`), interleaved with the four kinds `searchBooks` has.
- `collections.ts`: `books_products` (`onDemand`, `omitOnInsert: ['created', 'updated', 'name_key', 'currency']`, `indexed`) and `books_bundle_items` (`onDemand`, `omitOnInsert: ['created', 'updated']`, `indexed`). No relations. No `subsetGcTime` (as `books_customers` and `books_vendors`).
- Queries, each with an explicit `queryKey`: the list is one `useLiveQuery` over `books_products` (no `where`) in the layout (`useProductsQuery`, retry by `retryListQuery`). The child reads its product with `useRecord`; a bundle's rows with one `useLiveQuery` over `books_bundle_items` where `bundle = id`, ordered by `position` (`useBundleItems`). `ProductPicker` runs its own debounced `useLiveQuery` (type in service and non_inventory, not inactive, `orderBy` name, limit 51 while not searching; name and SKU search on the client). `BundleProductCell` reads its product's name with `useRecord`. `IncomeAccountField`, `ExpenseAccountField` and the new route's defaults read `books_accounts` with one shared query key. Row types derive from the query results.
- Forms host `books:product`: collection `books_products`, `formColumn: 'form'`, `fieldsColumn: 'fields'`, `columns` lists every record column (`id`, `type`, `name`, `sku`, `sales_description`, `price`, `income_account`, `purchases`, `purchase_description`, `cost`, `expense_account`, `inactive`, `currency`, `form`, `fields`, `name_key`, `created`, `updated`). Built-ins: `type` (custom `ProductTypeField`, required), `name` (text, required), `sku` (text), `sales_description` (textarea), `items` (table, storage `rows`, columns `product` text required with component `BundleProductCell`, `quantity` number required min 0.01 max 1000000), `price` (custom `MoneyField`), `income_account` (custom `IncomeAccountField`), `purchases` (toggle), `purchase_description` (textarea), `cost` (custom `MoneyField`), `expense_account` (custom `ExpenseAccountField`); custom ones with chrome `cell`. Layout: one page, the three half pairs, and the purchase rule. No `insertCustomBefore`. Settings → Forms then lists "Product or service" under Books.
- Seed: `lib/products-services-fixture.ts` (about 24 products: 12 services, 8 non-inventory with purchasing on for 5, 4 bundles of 2-5 rows, 2 inactive products of which one is on a bundle, long names and descriptions), wired into `seed.ts`. Accounts are named by `seed-accounts.ts` numbers (lesson 12): income 4000 Consulting Income; expense 6200 Software Subscriptions and 6210 Design Tools; one product keeps 6900 Old Petty Cash (inactive) as its stored expense account. The seed adds no account (2026-10-30 gate G7).

## Cut
- Inventory type and every quantity-on-hand field: the Books spec Scope lists inventory as Later (Q3).
- The "I sell this product/service to my customers" box (Q6): every Service and Non-inventory item can be sold; the sales fields always show.
- Category (Q15): no v0 report groups by category; the sales by product report groups by product.
- Image (Q15): the Books spec gives file attachments to bills and expenses only.
- Taxable (Q15): p2-tax-rates adds per-line taxability as a built-in to this host.
- Preferred vendor (Q15): purchase orders are Later, and no v0 flow reads it.
- "Display bundle components when printing" (Q15): p2-invoice and p2-pdf own how a bundle prints.
- A bundle total or per-row prices on the bundle form.
- Duplicate and Run report in the row menu; thumbnails, sortable columns, filter chips (a Type filter included), batch actions (Q14; p2-sales-lists owns the shared list pattern).
- Price precision finer than a cent (Q10).
- A Books-drawn slide animation on web (platform item 1).
- Import of products from CSV (the QuickBooks importer imports them).
- A paged, server-filtered products list and full-text search (G9; p2-books-fts-search).
- A products report source: the core report engine does not exist at core 1bda334; the report engine units add sources.

## Platform notes
- Native: the product page slides in with the platform push and goes back by swipe (iOS) or hardware back (Android); both ask "Discard changes?" when dirty. `MoneyField` and Qty use the decimal keyboard.
- Web: the product page appears with no slide (expo-router's web stack switches screens by `display`) — platform item 1, signed off 2026-10-29. The browser Back button asks through the core guard.
- The panel at 1360 px or more behaves the same on web and native. No hover-only control: the row menu button is always visible.

## Sparks carried
- Each type explained in one sentence where you choose it: `ProductTypeChooser` rows (React Native `Pressable` rows; name `text-foreground font-semibold`, sentence `text-muted-foreground`, separator `border-border`, pressed `bg-accent`), min height 64 px.
- Prices and costs right-aligned in their own columns: list cells `text-right` with `formatMoney`; `MoneyField` input right-aligned.

## Test reach
- Unit (vitest): `product-route`, `product-types` drift test against the migration, `form-definition` (`hideBuiltins` keeps admin-hidden fields hidden, never hides a host-required built-in), `product-form` (`productDefinitionFor` per type), `product-list`, `product-columns`, `product-defaults` (Service income, Product sales and Cost of goods sold choices, which the e2e book cannot reach), `income-account-options`, `bundle-items` mapper, `table-writes` order and `createTablePlans`, `product-display` (delete lines with role keys), `product-messages` drift test, `useRecordSave` rows step through the accounts-form harness (row refused after insert → `onPartialCreate`; rows-only edit skips the record update), `search-target`, `shell-nav`, help topic.
- Go: guards in `server/products_test.go` (every message, inside `serialized`; schema refusals through `requireSchemaRefusal`), `productReferences` delete refusal, account delete refusal, `validateExpenseAccount` message per caller, registrations and search.
- E2E (Playwright; at most 12 tests in all checkpoints, desktop and phone runs counted; every `test.describe` title starts with `products-services:`; seeded rows open through search; only what drives product-specific code — shared list, surface, guard and delete behavior is already driven by the customer and vendor specs):
  1. Create a service through the chooser; Save and new keeps the type (desktop).
  2. Change type Service → Non-inventory; the purchasing toggle shows and hides its fields; save with an expense account (desktop).
  3. Create a bundle with two rows and reorder them; reopen shows them in order (desktop).
  4. Bundle rows as cards and the form in one column at 390 px (phone).
  5. A refused duplicate name lands on Name (desktop).
  6. Delete refused for an item on a bundle, shown in the dialog (desktop).
  7. Make inactive hides the item from the bundle picker and dims it under Show inactive (desktop).
  8. List columns and money alignment, panel at 1600 px with the open row marked (wide).
  9. Phone cards ("Type · price" and SKU lines), the two-line title beside the New button, and the New FAB hidden on a product page (phone).
  10. A seeded product whose stored expense account is inactive shows it in the trigger and saves without a refusal (desktop).
  11. Not found by URL (desktop).
  Total 11 of 12.

## Non-goals
Inventory, quantity on hand, reorder points, purchase orders, product images, categories, price levels and rules, multi-currency prices, bundle pricing, product-level tax settings, sales by product report, CSV import or export, the invoice line behavior of a bundle.
