# Vendors

## Goal
Let a bookkeeper create, edit, deactivate and delete vendors on the core forms engine, and find them in a Vendors list. The vendor shown is in the URL.

## Design decisions
Approved at the design gate on 2026-10-29: direction A (the built p2-customers pattern) and the recommended answers to packet questions 1-13, built from books `main` 3c32b22 (p2-customers PR #18 merged) and core 12759a7. Platform item 1 (no slide on web) is signed off. The 2026-10-25 gate settled direction B (the list renders once in `screens/vendors/_layout.tsx`; the vendor is a child route in a Stack over or beside it; URL `/a/books/vendors/<id>` and `/a/books/vendors/new`; Back closes) and questions Q2-Q20 of the deleted packet ("note Qn"); packet questions 1-6 replace the note's Q16 surface width, the native list dimming, the reanimated slide, the own-width column drop and Q2 (no core layout) with the built p2-customers pattern. Answers to the other packet questions are marked "(packet Qn)". The extracted shared parts keep the post-merge changes of p2-customers: `ViewInstance` ref types, `useTableMinWidth` for the party table, and an explicit `queryKey` on list queries (packet Q13).

## Where it lives
`books/` (package files import each other relatively):
- Routes (the p2-customers pattern, note Q17 and Q18):
  - `screens/vendors/_layout.tsx` → `/a/books/vendors`. Renders the Vendors list once inside `ListDetailLayout` (p2-customers), plus the child `Stack` for the vendor. The list keeps its query, scroll position and search text while vendors open and close.
  - `screens/vendors/index.tsx` → no vendor open. Draws nothing.
  - `screens/vendors/[id].tsx` → `/a/books/vendors/<id>`, edit (or view, for read-only users) that vendor. p3-vendor-pages grows this child later; there is no `/edit` sub-path (note Q17).
  - `screens/vendors/new.tsx` → `/a/books/vendors/new`, create.
- `lib/vendor-route.ts` (pure, unit-tested): `VENDORS_PATH` (`books/vendors`), `vendorPath(id)`, `newVendorPath()`, `openVendorFromPath(pathname)` (`{ kind: 'new' }`, `{ kind: 'id', id }` or `{ kind: 'none' }`), `VENDOR_DETAIL_SCREENS`. `navigationModeFor` is reused from `lib/customer-route.ts` after it moves to `lib/record-route.ts` (packet Q7).
- Shared parts this unit extracts from p2-customers (packet Q7; customers move onto them with no behavior change, guarded by the customer e2e specs unchanged): `components/RecordSurface.tsx`, `hooks/useRecordSave.ts`, `lib/record-refusals.ts`, `hooks/useRecordActions.ts`, `stores/record-form-store.ts`, `components/ListBanner.tsx`, `components/ListToolbar.tsx`, `lib/party-list.ts`, `lib/record-route.ts`, `hooks/useRecordNavigation.ts`, `forms/contact-fields.tsx`, Go `nameKey` in `server/names.go` and Go `isAddress` in `server/address.go`. See the packet's New shared parts list for each one's interface.
- Forms host: a second entry `books:vendor` in `tinycld/books/forms/hosts.ts`; its components in `tinycld/books/forms/vendor-fields.tsx`, added to the one `components` map in `tinycld/books/forms/ui.ts`. `EmailField`, `PhoneField` and `WebsiteField` from `forms/customer-fields.tsx` move to `forms/contact-fields.tsx` and serve both hosts.
- `components/vendors/` (VendorsList, VendorRow, VendorCard, VendorRowMenu, VendorChild, VendorNotFound, DeleteVendorDialog, VendorsEmptyState), `hooks/useVendorsQuery.ts`, `hooks/useVendorsList.ts`, `hooks/useVendorForm.ts`, `hooks/useVendorActions.ts` (a thin call of `useRecordActions`), `hooks/useVendorNavigation.ts` (a thin call of `useRecordNavigation`).
- `lib/vendor-list.ts` (pure: filter, search, sort, view state), `lib/vendor-display.ts` (title, footer), `lib/vendor-columns.ts` (zod column parse, empty fields), `lib/vendor-messages.ts` (refusal text copies, drift-tested), `lib/payment-terms.ts` (note Q5), `lib/expense-account-options.ts` (note Q14).
- `lib/shell-nav.ts`: a `vendors` entry in `LIST_ENTRIES` (label "Vendors", description "People and companies you buy from", href `books/vendors`); a `vendor` action in `NEW_ACTIONS` (column `vendors`, label "Vendor", href `books/vendors/new`); `hidesNewFab` also matches `/books/vendors/<segment>`.
- `lib/search-target.ts`: kind `vendor` → `books/vendors/[id]`.
- Server: `pb-migrations/2100000004_create_books_vendors.js` (note Q15), `server/vendors.go` (guards), registrations in `server/audit.go`, `server/oauth_scopes.go`, `server/search.go`.
- `lib/vendor-form-fixture.ts` (synthetic data, imported by `seed.ts`).
- `help/vendors.md` (help topic), linked from `help/navigating-books.md`.

## Behavior

List (note Q11: thin list)
- The screen shows a back link "All lists" (to `books/lists`), the title "Vendors", a toolbar (shown once at least one vendor exists), and the list. Writers see a "New vendor" button in the header. On phones the Books New FAB also shows on the list.
- Vendors are one flat list sorted by display name (case-insensitive, then id). There are no sub-vendors.
- Wide columns (packet Q4): Name (display name; company name below in muted text when it differs), Email, Phone, row menu. No balance column, no sortable columns, no filter chips, no batch actions. The table has a minimum width of 540 px and scrolls sideways in a narrower column; the Name and Email cells shrink with an ellipsis and never collapse to blank.
- Search filters by display name, company name, email or phone, case-insensitive. A "Show inactive" toggle (off by default) shows inactive vendors dimmed with an "Inactive" label.
- Tapping a row opens that vendor (see Navigation): edit for writers, read-only for read-only users. On the panel surface, the open vendor's row has `bg-accent`; the open vendor is read from the URL, never from a store. Tapping the open vendor's row again does nothing (the form, its scroll and its edits stay).
- The row menu (writers only) has: Edit, Make inactive or Make active, Delete. The menu button is a sibling of the row's open button, never inside it (the p2-customers structure).
- The list is windowed (`useRowWindow`).
- Empty state (no vendors): "No vendors yet", hint "Add the people and companies you buy from.", and a New vendor button for writers; read-only users see "Vendors appear here once a bookkeeper adds them." Search with no match: "No vendors match" with a Clear search button. Every vendor inactive, no search, Show inactive off: "No active vendors" with a Show inactive button.
- Loading: `LoadingState` until the vendors query is ready. A failed query shows the error banner "Could not load vendors" with Retry, which rebuilds only the failed query (`recoverLiveQueries` with `sources: []`).
- Phone (core `useBreakpoint() === 'mobile'`): each vendor is a card (display name, then company, email and phone on muted lines). The toolbar is a search field and the Show inactive toggle.

Surfaces (packet Q1, Q2, Q3; the built p2-customers rule)
- `useDetailSurface()` picks the surface from the window width: `panel` at 1360 px or more, `page` below.
- Panel: the child stack sits in a 480 px column at the right of the content area, with a left border; the list fills the rest and stays usable on web and native (search, scroll, row menu, open another row).
- Page: the child stack covers the content area; the shell rail and sidebar stay. A vendor screen is opaque.
- Child stack options, pointer events, tree shape and resize behavior are those of `ListDetailLayout` (p2-customers): the vendor screen never remounts when the surface flips, and the form keeps typed values, dirty state and errors.
- Surface chrome is `RecordSurface`: panel → a 52 px header with the title and a ✕ (label "Close"); page → a header with a "‹ Vendors" back button and the title, and the form in a centered column of at most 720 px. Both have the same scrolling body and sticky footer.
- Titles: "New vendor", "Edit vendor", or "Vendor" (read-only).
- Escape (web, and hardware keyboards on native) runs Cancel through the surface's `modal` shortcut scope; an open dialog or select menu takes Escape first.
- The Books New FAB is hidden on a vendor page (`hidesNewFab`).

Navigation (note Q17, Q19)
- `useVendorNavigation()` gives `open(id)`, `openNew()` and `leave()`.
- With no vendor open, `open` and `openNew` push. With a vendor open they replace it (`router.replace`), so one vendor is in the child stack at a time and Back returns to the list.
- Links from outside the list (the New menu, a search hit, a deep link) push.
- `leave()` runs `router.dismissTo(VENDORS_PATH)`, so ✕, the back button, Cancel and Escape return to the list even after a deep link.
- A reload of `/a/books/vendors/<id>` or `/new` shows the list with that vendor on the surface the window width picks.
- An unknown or deleted vendor: the child shows "This vendor doesn't exist or was removed" with a "Back to vendors" button. A vendor deleted elsewhere turns the open form into that message. Deleting the open vendor from its row menu: when its form is dirty, the Delete vendor dialog adds "Unsaved changes to this vendor will be lost."; after the delete succeeds the vendor closes with no second question.

Form
- The body is the core `FormRenderer` (layout `sections`, `summary="root"`) for host `books:vendor`, on the form the record names (edit) or the default form (create). Admin custom fields from Settings → Forms appear before Notes; their values never post to the ledger.
- Default layout (packet Q6): one page, with half-width pairs first name + last name, email + phone, mobile + website, payment terms + account number. Pairs show side by side at a container of 640 px or more (the page's 720 px column); the 480 px panel and phones show one column.
- Built-in fields, in default order: Display name (required), Company name, First name, Last name, Email, Phone, Mobile, Website, Address, Payment terms, Account number, Default expense account, Notes.
- Display name is a plain text field; nothing fills it in (note Q7).
- Email, Phone, Mobile and Website are the shared contact host components over `ContactInput` (native keyboards for email, phone and URL).
- Address is `AddressField` (p2-customers) in its plain variant: Street, Street line 2, City, State or region, Postal code, Country; an all-empty address is stored as null (note Q13).
- Payment terms is `PaymentTermsField`: a core `SelectInput` whose first option is "None" and then the list in `lib/payment-terms.ts`: Due on receipt, Net 10, Net 15, Net 30, Net 60 (note Q5; packet Q8).
- Account number is a text field with the help text "Your account number with this vendor." (packet Q9).
- Default expense account is `ExpenseAccountField`: a core `SelectInput` whose first option is "None", then the active accounts of the chart in chart order, indented by depth, labelled `number name`, without Accounts receivable and Accounts payable accounts (note Q14; packet Q10). A vendor whose stored account has since become inactive shows that account's name in the trigger; saving without touching the field keeps it.
- Notes is a multi-line text field.
- Validation is the zod schema the forms engine builds from the definition: Display name required. Lengths, email and URL format (note Q4), the address shape, the terms value, the account rule and duplicate names are server rules; field refusals land on their fields through the host's `onError`, and a refusal with no field shows in the renderer's root-only summary.

Save model (note Q3), the same on both surfaces
- Footer: Cancel, Save, and Save and new (create only).
- Create inserts into `books_vendors` with a new id, the form id and the custom-field JSON. Save resets the form to clean and leaves; Save and new resets it to empty and stays on `vendors/new`.
- Edit writes only the dirty keys, marks them saved and leaves. It stays when the user typed during the write.
- The save keeps every behavior of the p2-customers save (`useRecordSave`): one press at a time (a ref lock), leave paths disabled while saving, a refusal after the user left the form becomes a toast "The vendor was not saved.", an answer that arrives after the user opened another vendor does not move them, a throw before the write sets the root error "Books could not save this vendor.".
- Discard check: core `useLeaveGuard(isDirty && !isSaving && !isBeingDeleted)` in `VendorChild`, with the core `ConfirmDialog` "Discard changes?" (message "This vendor has changes that are not saved.", confirm "Discard", cancel "Keep editing"). It holds the ✕, the back button, Cancel, Escape, `router.replace` from another row, iOS swipe-back, Android hardware back and, on web, the browser Back button (core #378 settles the note's open check). Reload and tab close ask through `beforeunload`.
- Read-only users see the same surface with `readOnly`, a Close button and no footer actions.

Inactive and delete (note Q10)
- Make inactive and Make active run through `useMutation` with no dialog, always allowed. Inactive vendors are left out of the default list.
- Delete opens a confirm dialog (core `Dialog`, title "Delete vendor"): the vendor's display name, "This cannot be undone.", the unsaved-changes line when it applies, Cancel and Delete. Delete runs through `useMutation`; a refusal shows in the dialog, or in the list banner when no dialog is open. In this unit nothing references a vendor, so the server allows every delete; the bill, expense, vendor credit and 1099 units add their own refusals for a vendor that is in use ("delete only while unused").
- One write runs at a time: the row menu's write items are disabled while one is in flight. A write that gets no answer shows "Your change wasn't saved: the server could not be reached.".

Search, shell, help
- The federated search lists vendors (display name, company, email); a hit opens `books/vendors/<id>`. Title = display name, subtitle = company, or email when there is no company, meta "Vendor".
- The Lists hub shows a Vendors card; the New menu's Vendors column shows "Vendor", which opens `books/vendors/new`.
- Help topic `vendors` explains creating and editing a vendor, payment terms, the default expense account, inactive and delete, custom fields, and that the vendor opens beside the list on a very wide window and as its own page otherwise.

## Data
- New collection `books_vendors` (migration `2100000004_create_books_vendors.js`):
  - `display_name` text, required, max 200; `company` text max 200; `first_name`, `last_name` text max 100; `email` (PocketBase email field); `phone`, `mobile` text max 40; `website` (PocketBase url field).
  - `address` json (max 8 KB), null or the p2-customers address shape `{ line1, line2, city, region, postal_code, country }`, each part a string of at most 200 characters; unknown keys refused.
  - `terms` select, max 1, values `due_on_receipt`, `net_10`, `net_15`, `net_30`, `net_60`; empty means none.
  - `account_number` text max 100.
  - `expense_account` relation to `books_accounts`, max 1, no cascade delete (deleting the account clears it on the vendor).
  - `notes` text max 5000; `inactive` bool.
  - `form` relation to core `forms`, `fields` json (forms engine host columns).
  - `name_key` text, hidden, set only by the server guard: the p2-customers canonical caseless key of the trimmed display name (packet Q5). Index: unique on `name_key`.
  - `created`, `updated` autodate.
  - Rules: list and view `READ`, create, update and delete `WRITE` (the `books_access` expressions of `books_customers`).
- Go guards in `server/vendors.go`, every read-then-write inside `serialized`: display name trimmed and stored trimmed; unique among vendors through `name_key` ("A vendor named “X” already exists." on `display_name`); the address shape (the shared `isAddress`, message on `address`); `expense_account`, when set and changed: the account exists ("The expense account does not exist."), is active ("The expense account is inactive."), and is not Accounts receivable or Accounts payable ("A vendor's default expense account cannot be Accounts receivable or Accounts payable."), each on `expense_account`. Every message ends with a period. A vendor and a customer may share a name.
- Registrations: `audit.RegisterCollection` (label = display name), OAuth `books_vendors: rw`, a search source of kind `vendor` (hit id `vendor:<id>`).
- `collections.ts`: `books_vendors` (on-demand, `omitOnInsert: ['created', 'updated', 'name_key']`, indexed, the same options as `books_customers`). No relations.
- Queries: the list is one `useLiveQuery` over `books_vendors` (no `where`) in the layout. The child reads its vendor with `useRecord`. `ExpenseAccountField` reads `books_accounts` with one `useLiveQuery` and shapes options with `lib/expense-account-options.ts`. Row types derive from the query results.
- Forms host `books:vendor`: collection `books_vendors`, `formColumn: 'form'`, `fieldsColumn: 'fields'`, `columns` lists every column (including `id` and `name_key`), `insertCustomBefore: 'notes'`. Built-ins: `display_name` (text, required), `company`, `first_name`, `last_name` (text), `email` (custom `EmailField`), `phone` and `mobile` (custom `PhoneField`), `website` (custom `WebsiteField`), `address` (custom `VendorAddressField`), `terms` (custom `PaymentTermsField`), `account_number` (text), `expense_account` (custom `ExpenseAccountField`), `notes` (textarea); custom ones with chrome `cell`. Settings → Forms then lists "Vendor" under Books.
- `lib/payment-terms.ts`: `PAYMENT_TERMS` (`{ key, label, days }`: due_on_receipt 0, net_10 10, net_15 15, net_30 30, net_60 60), `paymentTermLabel(key)`; a drift test checks the keys against the migration. p2-invoice and p3-bill read `days` for due dates.
- Seed: `lib/vendor-form-fixture.ts` (about 20 vendors, 2 inactive, long names and addresses, every term, default accounts named by starter-chart number) wired into `seed.ts`, which maps account numbers to the seeded account ids.

## Cut
- Title, middle name, suffix, fax, other phone, name to print on checks, billing rate (note Q9).
- Business ID / SSN and Track payments for 1099: p3-vendor-1099 adds them as built-ins to this host (note Q9).
- Display-name suggestions from the name parts (note Q7).
- Opening balance with "as of": a vendor opening balance is a Bill dated on the start date, entered with p3-bill (note Q6).
- Link to a `contacts` contact (note Q8).
- Section icon bar and collapsible sections; several pages in the default form (packet Q6 keeps one page, as customers).
- Balance column, sortable columns, filter chips, batch actions (note Q11).
- Vendor record page with balance header and tabs: p3-vendor-pages, built on `vendors/[id]`.
- Client checks of email and website format (note Q4).
- A Books-drawn slide animation on web (platform item 1).

## Platform notes
- Native: the vendor page slides in with the platform push and goes back by swipe (iOS) or hardware back (Android); both ask "Discard changes?" when dirty.
- Web: the vendor page appears with no slide (expo-router's web stack switches screens by `display`) — platform item 1, signed off 2026-10-29. The browser Back button asks through the core guard (core #378).
- The panel at 1360 px or more behaves the same on web and native: the list stays usable (packet Q2). The 2026-10-25 platform sign-off "native at desktop width dims the list and a tap closes the panel" no longer applies.

## Sparks carried
- Side-by-side pairs on a wide form: core host `layout` widths (core #378, merged); no core change in this unit.
- Titled groups: dropped (packet Q6).

## Non-goals
Vendor balances and A/P, transactions on the vendor, 1099 tracking, opening balances, contacts link, merge, CSV import or export, vendor portal, autosave, the vendor record page, purchase orders, check printing.
