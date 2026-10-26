# Customers

## Goal
Let a bookkeeper create, edit, deactivate and delete customers, with one level of sub-customers, on the core forms engine, and find them in a Customers list. The customer shown is in the URL.

## Design decisions
Draft for the design gate, revised after gate 1. Direction A, with the customer as a side panel on a very wide window and a pushed page otherwise (Q18). Approved at gate 2 (2026-10-25): every open question Q1-Q22 takes its recommended answer, except Q15 and Q16, where the human accepted both core extensions (checkpoint 0, a core PR on branch books/p2-customers that merges before checkpoint 1). Platform-only item 1 (no slide on web) is signed off. Platform-only item 2 no longer applies, because Q16 closes it.

## Where it lives
`books/` (package files import each other relatively, never with `~/tinycld/books/...`):
- Routes (the boards `[boardSlug]/_layout.tsx` + `[card].tsx` pattern; Q2, Q11):
  - `screens/customers/_layout.tsx` → `/a/books/customers`. Renders the Customers list once, plus a child `Stack` (core `FrozenSlideStack`) for the customer. The list keeps its queries, scroll position and search text while customers open and close.
  - `screens/customers/index.tsx` → no customer open. Draws nothing; it only marks the child stack as empty.
  - `screens/customers/[id].tsx` → `/a/books/customers/<id>`, edit (or view, for read-only users) that customer.
  - `screens/customers/new.tsx` → `/a/books/customers/new`, create. `?parent=<id>` creates a sub-customer of `<id>`.
- `lib/customer-route.ts` (pure, unit-tested): `CUSTOMERS_PATH` (`books/customers`), `customerPath(id)`, `newCustomerPath(parentId?)`, `openCustomerFromPath(pathname)` (returns `{ kind: 'new' }`, `{ kind: 'id', id }` or `{ kind: 'none' }`).
- `lib/detail-surface.ts` (pure, unit-tested): `DETAIL_PANEL_WIDTH = 480`, `DETAIL_PANEL_MIN_WINDOW = 1360` (Q12), `detailSurfaceFor(windowWidth)` → `'panel' | 'page'`. `hooks/useDetailSurface.ts` reads it through a primitive selector on core `useWindowSizeStore`, so a component re-renders only when the surface flips, not on every pixel of a resize.
- `components/ListDetailLayout.tsx`: the layout body shared by list-and-detail screens. Props: `list` (node), `isDetailOpen`, and the child `Stack.Screen` names. It owns the tree shape, the container styles, the child stack options and the pointer-events rule (see Behavior, Surfaces).
- Forms host: `tinycld/books/forms/hosts.ts` (host `books:customer`) and `tinycld/books/forms/ui.ts` (host components); manifest gains `forms: { hosts: 'forms', ui: 'forms-ui' }` and `package.json` exports `./forms` → `./tinycld/books/forms/hosts.ts` and `./forms-ui` → `./tinycld/books/forms/ui.ts` (the boards shape). This is the first Books form host; later units append hosts to the same file.
- `components/customers/` (CustomersList, CustomerToolbar, CustomerRow, CustomerCard, CustomerRowMenu, CustomerChild, CustomerSurface, CustomerNotFound, DeleteCustomerDialog, CustomersEmptyState, CustomerPicker), `components/forms/` (AddressField, ContactInput), `hooks/useCustomersList.ts`, `hooks/useCustomersQuery.ts`, `hooks/useCustomerForm.ts`, `hooks/useCustomerActions.ts`, `hooks/useCustomerNavigation.ts`.
- `lib/customer-tree.ts` (pure: group sub-customers under parents, search, sort), `lib/customer-display.ts` (pure: `customerLabel` "Parent : Child"), `lib/address.ts` (pure: address type, empty address, `formatAddressLines`), `lib/customer-messages.ts` (refusal text mapping).
- `lib/shell-nav.ts`: a `customers` entry in `LIST_ENTRIES` (label "Customers", description "People and companies you sell to"), a `customer` action in `NEW_ACTIONS` (column `customers`, label "Customer", href `books/customers/new`), and `hidesNewFab` also matches `/books/customers/<segment>`.
- `lib/drawer-placement.ts` (pure, unit-tested): `drawerPlacement({ isWide, isTablet })`, the Drawer placement now private to `AccountPanel`, extracted with no behavior change so p3-vendors can reuse it (Q21).
- `lib/search-target.ts`: kind `customer` → `books/customers/[id]`; kind `entry` corrected to `books/entries/[id]` (Q22).
- Server: `pb-migrations/2100000003_create_books_customers.js`, `server/customers.go` (guards), registrations in `server/audit.go`, `server/oauth_scopes.go`, `server/search.go`.
- `lib/customer-form-fixture.ts` (synthetic data, imported by `seed.ts`).
- `help/customers.md` (help topic), linked from `help/navigating-books.md`.

## Behavior

List
- The screen shows a back link "All lists" (to `books/lists`), the title "Customers", a toolbar (shown once at least one customer exists), and the list. Writers see a "New customer" button in the header. On phones the Books New FAB also shows on the list.
- Each top-level customer is a row; its sub-customers follow it, indented one level. Top-level rows sort by display name (case-insensitive); sub-customers sort by display name under their parent.
- Wide columns: Name (display name; company name below in muted text when it differs), Email, Phone, row menu. No balance column (Q10). The table has a minimum width of 540 px; the Name and Email cells shrink with an ellipsis and never collapse to blank.
- Search filters by display name, company name, email or phone, case-insensitive. A matching sub-customer keeps its parent row visible. A "Show inactive" toggle (off by default) shows inactive customers dimmed with an "Inactive" label.
- Tapping a row opens that customer (see Navigation): edit for writers, read-only for read-only users. On the panel surface, the open customer's row has `bg-accent`; the open customer is read from the URL (`openCustomerFromPath`), never from a store.
- The row menu (writers only) has: Edit, Add sub-customer (top-level rows only), Make inactive or Make active, Delete. The menu sits in a stop-propagation boundary so a menu press never also opens the row.
- The list is windowed (the existing `useRowWindow`), so ten thousand customers scroll without rendering every row.
- Empty state (no customers): "No customers yet" with a New customer button for writers. Search with no match: "No customers match" with a Clear search button. Every customer inactive, no search and Show inactive off: "No active customers" with a Show inactive button.
- Loading: `LoadingState` until the customers query is ready. A failed query shows the error banner with Retry, which rebuilds only the failed query (`recoverLiveQueries`).
- Phone: each customer is a card (display name, then company, email and phone on muted lines), sub-customer cards indented. The toolbar is a search field and the Show inactive toggle.

Surfaces (Q12, Q18)
- `useDetailSurface()` picks the surface at render time from the window width: `panel` at 1360 px or more, `page` below. The rule reads the window width only; collapsing the Books sidebar does not change the surface.
- Panel: the child stack sits in a 480 px column at the right of the content area, with a left border; the list fills the rest and stays usable (search, scroll, row menu, open another row). With no customer open the column has zero width and the list fills the content area.
- Page: the child stack covers the content area (`StyleSheet.absoluteFill` over the list; the shell rail and sidebar stay). The index child is transparent, so the list shows while no customer is open. A customer screen is opaque (`bg-background`).
- Child stack options: every screen uses `presentation: 'card'` at all widths, so a mounted screen never changes presentation. The index screen has `contentStyle: { backgroundColor: 'transparent' }`. The `[id]` and `new` screens get `animation: 'default'` and `gestureEnabled: true` on the page surface (native slide-in from the right, swipe from the left edge to go back), and `animation: 'none'` and `gestureEnabled: false` on the panel surface.
- Pointer events (the boards rule): on web the stack container is always `pointerEvents="none"` and the customer surface root is `pointerEvents="auto"`, because CSS pointer-events is inherited and the transparent index layer would otherwise take every click on the list. On native the container is `none` while no customer is open and `box-none` while one is.
- Tree shape: `ListDetailLayout` renders the same element tree at every width (list column, then stack container); only style values change. The stack, its routes and the customer screen therefore never remount when the surface flips.
- Resize with a customer open: the open customer moves to the other surface at once, with no animation. The URL does not change. The form state lives in `useCustomerForm`, called in the route component (`CustomerChild`), which does not remount, so typed values, dirty flags, field errors and an open picker query survive. A text field may lose keyboard focus because the surface chrome around the form changes. A "Discard changes?" dialog that is open stays open.
- Surface chrome (`CustomerSurface`, props `surface`, `title`, `onLeave`, footer): panel → a 52 px header with the title and a ✕ button (accessibility label "Close"); page → a header with a "‹ Customers" back button and the title, and the form in a centered column of at most 640 px. Both have the same scrolling body and sticky footer.
- Titles: "New customer", "New sub-customer", "Edit customer", or "Customer" (read-only).
- Escape (web, and hardware keyboards on native) runs Cancel, through core `useRegisterShortcuts` in a `useShortcutScope('modal')` scope owned by the surface. While a dialog (Discard changes?, Delete customer) or the parent picker menu is open, Escape closes that layer only.
- The Books New FAB is hidden on a customer page (`hidesNewFab`); on the panel surface the window is desktop width, where the FAB does not show.

Navigation (Q11, Q13)
- `useCustomerNavigation()` gives `open(id)`, `openNew(parentId?)` and `leave()`.
- `open` and `openNew` push the customer route when no customer is open. When a customer is already open they replace it (`router.replace`), so one customer is in the child stack at a time and Back always returns to the list. On the page surface no list row is reachable while a page is open, so this applies to the panel surface and to the header's New customer button.
- Links from outside the list (the New menu, a search hit, a deep link) push, as any link does. Back then returns to what was open before.
- `leave()` runs `router.dismissTo(CUSTOMERS_PATH)` (the boards `leave`), so the ✕, Back button, Cancel and Escape return to the list even after a deep link with no history.
- A reload of `/a/books/customers/<id>` or `/new` shows the list with that customer on the surface the window width picks, with no animation.
- `?parent=<id>` is used only when it names an active top-level customer in the loaded list; otherwise it is ignored and the Parent customer picker starts at "None (top level)".
- The open customer is unknown (bad id) or deleted: the child shows "This customer doesn't exist or was removed" with a "Back to customers" button (`leave`). When the customer is deleted elsewhere (another user, another tab), the guard turns off with the record gone and the not-found message replaces the form. Deleting the open customer from its row menu: when its form is dirty, the Delete customer dialog adds "Unsaved changes to this customer will be lost."; after the delete succeeds, `CustomerChild` turns its leave guard off and runs `leave()`, so no second question appears.

Form
- The body is the core `FormRenderer` (layout `sections`) for host `books:customer`, on the form the record names (edit) or the default form (create). Admin custom fields from Settings → Forms appear before Notes; their values never post to the ledger.
- Default layout (Q15 core extension): the `books:customer` host declares one page with half-width pairs (first name + last name, email + phone, mobile + website). The renderer shows a pair side by side when its container is 640 px or wider (core `widths.ts` `NARROW_BELOW`), so the medium and wide pushed page show pairs, and the 480 px panel and phones show one column. An admin may change the layout in Settings → Forms.
- The edit form reads its record with core `useRecord(customersCollection, id)`, so the row stays live while the child shows it.
- Built-in fields, in default order: Display name (required), Company name, First name, Last name, Email, Phone, Mobile, Website, Parent customer, Billing address, Shipping address, Notes.
- Display name is a plain text field; no suggestions are generated (Q4).
- Email, Phone, Mobile and Website use a Books `ContactInput` host component, so native shows the email, phone or URL keyboard. The core cell draws the label and the error.
- Parent customer is the Books `CustomerPicker`: a searchable menu whose first item is "None (top level)", listing only active top-level customers other than this one, 50 at a time, searched by display name. When the customer being edited has sub-customers, the picker is disabled with the help text "A customer with sub-customers cannot be a sub-customer." "Add sub-customer" opens `customers/new?parent=<id>`.
- Billing address is the Books `AddressField`: Street, Street line 2, City, State or region, Postal code, Country, each a text input. At the tablet and desktop breakpoints (`useBreakpoint() !== 'mobile'`; the panel and the medium page are both at least 440 px wide there), City/State/Postal code share a line; at the mobile breakpoint each is its own line. No layout measurement.
- Shipping address is the same component with a "Same as billing address" checkbox, checked by default. While checked, the address inputs are hidden and the stored value is empty (null). Unchecking shows empty inputs.
- Notes is a multi-line text field.
- Validation is the zod schema the forms engine builds from the definition (`useFormCreate` / `useFormEdit` with their resolver): Display name required. Lengths, email format, URL format, parent rules, the address shape and duplicate names are server rules; their refusals map to the field through the host's `onError` (`formErrorHandler`), and a refusal with no field shows in `FormErrorSummary` (shown only after submit, root errors only, as in Books settings).

Save model (Q9), the same on both surfaces
- Footer: Cancel, Save, and Save and new (create only).
- Create: `useFormCreate(...).submit()` gives the split values; `useMutation` inserts into `books_customers` with a new id, the form id and the custom-field JSON. On success, Save resets the form to clean and runs `leave()`; Save and new resets the form to empty and stays on `customers/new` (keeping `?parent` when it was a new sub-customer).
- Edit: `useFormEdit(...)`; Save runs `patch()` and writes only the dirty keys with `useMutation`, then `markSaved(written)` and `leave()`. No autosave in this unit.
- Discard check: core `useLeaveGuard(isDirty)` (`@tinycld/core/components/forms-builder/use-leave-guard`) in `CustomerChild`. It holds back every navigation action that removes the customer route: the ✕, the back button, Cancel, Escape, `router.replace` from another row, iOS swipe-back (native-stack sets `preventNativeDismiss` from the prevented route) and Android hardware back. While held, a core `ConfirmDialog` asks "Discard changes?" (message "This customer has changes that are not saved.", confirm "Discard", destructive, cancel "Keep editing", `requiresServer={false}`; located by its text in e2e, as it has no button testIDs); Discard dispatches the held action. The guard is off while the form is clean, so a saved form leaves without asking. On web, reload and tab close ask through the browser's `beforeunload` prompt (the same hook). The browser's own Back button on web is caught too, through the core extension of Q16 (checkpoint 0).
- Read-only users see the same surface with `readOnly`, a Close button and no footer actions; the guard is never dirty.

Inactive and delete
- Make inactive and Make active run through `useMutation` with no dialog. The server refuses Make inactive while the customer has active sub-customers; the message names the count ("This customer has 2 active sub-customers"), shown in the list's error banner.
- Inactive customers are left out of the Parent customer picker and of the default list.
- Delete opens a confirm dialog (core `Dialog`, found by its title "Delete customer" on phones). When the customer has sub-customers, the dialog says "This customer has sub-customers" and offers no Delete. If every sub-customer is inactive, it offers Make inactive instead; if any sub-customer is active, it says "Make its sub-customers inactive first" and offers only Close (the server refuses Make inactive while active sub-customers exist). Otherwise Delete runs through `useMutation`; the server's refusal text is shown if the server still refuses. Later units (invoice and others) add their own server refusals for customers used on transactions.

Search, shell, help
- The federated search lists customers (display name, company, email); a hit opens `books/customers/<id>`.
- The Lists hub shows a Customers card; the New menu's Customers column shows "Customer", which opens `books/customers/new`.
- Help topic `customers` explains creating, editing, sub-customers, inactive and delete, custom fields, and that the customer opens beside the list on a very wide window and as its own page otherwise.

## Data
- New collection `books_customers` (migration `2100000003_create_books_customers.js`):
  - `display_name` text, required, max 200; `company` text max 200; `first_name`, `last_name` text max 100; `email` (PocketBase email field); `phone`, `mobile` text max 40; `website` (PocketBase url field).
  - `parent` relation to `books_customers`, max 1, no cascade delete.
  - `billing_address` json (max 8 KB, so six 200-character parts of 4-byte characters fit), `shipping_address` json (null means same as billing). Address shape: `{ line1, line2, city, region, postal_code, country }`, every key a string of at most 200 characters; unknown keys are refused.
  - `notes` text max 5000; `inactive` bool.
  - `form` relation to core `forms`, `fields` json (forms engine host columns).
  - `created`, `updated` autodate.
  - Rules: list and view `READ`, create, update and delete `WRITE` (the same `books_access` expressions as `books_accounts`).
  - `name_key` text, hidden (a non-superuser never sees it in an API response), set only by the server guard: the trimmed display name, NFD-normalized, case-folded (Cherokee folded to uppercase, as Unicode's CaseFolding.txt does) and NFC-normalized (Unicode canonical caseless matching), so names that differ only in case or composition share one key. Index: unique on `(parent, name_key)`, the backstop for the guard below.
- Go guards in `server/customers.go`, every read-then-write inside the `serialized` helper: the parent exists, is top-level and is not the record itself; a customer with sub-customers cannot get a parent; an active customer cannot be under an inactive parent (a create or a move under an inactive parent is refused on `parent`, and Make active of a sub-customer whose parent is inactive is refused), so no active customer sits under an inactive one; display name trimmed and stored trimmed, then unique among siblings, case-insensitive for every letter, not ASCII only, and the same however the text is composed (canonical equivalence) — one indexed lookup of `name_key` ("A customer named “X” already exists here."); the address shape, each part counted in characters (code points); delete refused while sub-customers exist; Make inactive refused while active sub-customers exist (count in the message). Every server message ends with a period: PocketBase adds one to each refusal it sends. A customer and a vendor may share a name (no cross-collection check).
- Registrations: `audit.RegisterCollection` (label = display name), OAuth `books_customers: rw`, a search source of kind `customer` whose hit id is `customer:<id>`.
- `collections.ts`: `books_customers` (on-demand, `omitOnInsert: ['created', 'updated']`, indexed). No relations: the list loads all customers in one query and builds the tree in `lib/customer-tree.ts`.
- Queries: the list is one `useLiveQuery` over `books_customers` (no `where`; customers are a bounded list) in the layout, shaped by pure functions. The child reads its customer with `useRecord`. The picker runs its own debounced `useLiveQuery` (`parent = ''`, `inactive = false`, display name matches the term, limit 50). Row types derive from the query results.
- Routes and URL state: the open customer and the create mode are in the path; the parent of a new sub-customer is the `parent` search param. No Zustand store holds which customer is open. The list's search text and Show inactive are local UI state of the layout (it does not remount).
- Forms host `books:customer`: collection `books_customers`, `formColumn: 'form'`, `fieldsColumn: 'fields'`, `columns` lists every column (including `id`), `insertCustomBefore: 'notes'`. Built-ins: `display_name` (text, required), `company`, `first_name`, `last_name` (text), `email` (custom, component `EmailField`), `phone` and `mobile` (custom, component `PhoneField`), `website` (custom, component `WebsiteField`), all three built on `ContactInput`, chrome cell, `parent` (custom, component `ParentCustomerField`, chrome cell), `billing_address` and `shipping_address` (custom, components `BillingAddressField` and `ShippingAddressField`, chrome cell), `notes` (textarea). Settings → Forms then lists "Customer" under Books.
- Seed: `lib/customer-form-fixture.ts` (about 25 customers, 4 with sub-customers, 2 inactive, long names and addresses) wired into `seed.ts`.

## Cut
- Title, middle name, suffix (Q3): invoices print display name, company and address; these parts add fields and no behavior.
- Display-name suggestions from the name parts (Q4).
- Fax, Other phone, Name to print on checks (Q6): check printing is in the Books spec's Later list (Scope), not v0.
- Bill-with-parent for sub-customers (Q8): a sub-customer is billed itself; no v0 report groups by parent.
- Payment terms, preferred payment method, delivery method, language (Q6): p2-invoice owns terms and due dates and may add a customer default terms built-in to this host.
- Tax exemption details and taxability (Q6): p2-tax-rates adds them as built-ins to this host.
- Opening balance with "as of" (Q6): a customer A/R opening balance needs an invoice or an A/R line with a customer; the importer's cutover mode and the invoice unit cover it.
- Customer type (Q6): no v0 report uses it.
- Link to a `contacts` contact (Q7): p2-customer-pages owns the Contacts tab and adds the column then.
- Map link on addresses; "Add lines" beyond two street lines (Q6).
- Section icon bar and collapsible sections; several pages in the default form. Q15 makes pages possible; this unit declares one page only.
- Balance column, sortable columns, filter chips, batch actions (Q10): p2-sales-lists owns the shared list pattern.
- Customer record page with balance header, New transaction menu and tabs (Q14): p2-customer-pages, built on `customers/[id]`.
- A user-resizable panel, and a remembered panel width.
- A Books-drawn slide animation on web (platform-only item 1).
- Attachments on customers, merge customers, import customers from CSV (the QuickBooks importer imports customers).

## Platform notes
- Native (iOS, Android): the customer page slides in with the platform-default push and goes back by swipe (iOS) or hardware back (Android); both ask "Discard changes?" when the form is dirty.
- Web: the customer page appears with no slide (expo-router's web stack view switches screens by `display`; `animation` has no effect) — platform-only item 1. The browser Back button asks the discard question through the Q16 core extension (expo-router web resets the navigation state without a navigation action, so `usePreventRemove` alone never runs). Reload and tab close ask through `beforeunload`.
- The keyboard type of `ContactInput` is a native refinement; web ignores it harmlessly. No hover-only controls: the row menu button is always visible.

## Sparks carried
- Shipping address folded to one checked line while it equals billing: `AddressField` shipping variant with core `Toggle` (checkbox look) and an `isVisible` address block; tokens `text-foreground`, `text-muted-foreground`, `border-border`, `bg-background`.
- Core extension (checkpoint 0), Q15: a forms host may declare its default layout (optional `layout`: pages, per-built-in `page` and `width`, default `rules`), read by `defaultDefinitionFor` (core/lib/forms/host.ts) and `defaultDefinition` (core/server/forms/seed.go) when the default form is first seeded; the TS and Go results must match (shared test fixture). The `books:customer` host declares one page with half-width pairs: first name + last name, email + phone, mobile + website. Below a 640 px container (the 480 px panel, phones) the renderer puts each pair in one column.
- Core fix (checkpoint 0): core `TextInput` (core/ui/form/TextInput.tsx) gets `min-w-0` on its input, so on web an input in a flex row shrinks below its intrinsic width (about 200 px). Without it, City, State or region and Postal code cannot share one line in the 480 px panel. Native layout does not change.
- Core extension (checkpoint 0): core `FormRenderer` (core/ui/forms/FormRenderer.tsx) gets an optional `summary: 'root'` that makes its `FormErrorSummary` list only root (server, no-field) errors and show whenever one exists, so an edit save, which never marks the form submitted, shows a refusal too. Books passes it on create and edit. Without it the summary lists every field error after a create submit and never shows on an edit save.
- Core extension (checkpoint 0), Q16: `core/components/forms-builder/use-leave-guard.ts` also catches the browser Back button on web while dirty (asks the same question; on Keep editing the URL returns to the record). The core Forms editor gets the same fix. Native behavior does not change.

## Non-goals
Customer balances and A/R, transactions on the customer, statements, terms, taxes, opening balances, contacts link, merge, import, CSV export, multi-currency per customer, customer portal or sharing, autosave edit in place, the customer record page.
