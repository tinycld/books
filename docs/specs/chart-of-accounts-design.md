# Chart of Accounts

## Goal
Show the organization's accounts as a collapsible hierarchy with name, type, detail type and balance, let a bookkeeper add, edit, deactivate and delete accounts, and import accounts from a CSV file.

## Design decisions (design gate, 2026-10-22)
Direction A (outline table with side panel). Q1-Q10 accepted as recommended. Description is not a list column; it shows in the panel only. Type column stays visible while a group filter is active. Drag and drop CSV on web approved.

## Where it lives
`books/tinycld/books/`:
- `screens/accounts/index.tsx` (route `/a/books/accounts`) and `screens/accounts/import.tsx` (route `/a/books/accounts/import`).
- `components/accounts/` (AccountTree, AccountRow, AccountCard, AccountToolbar, AccountPanel, AccountImport steps), `hooks/useAccountTree.ts`, `hooks/useAccountForm.ts`, `hooks/useAccountImport.ts`.
- `lib/account-tree.ts` (build and flatten the tree, roll-up), `lib/money.ts` (shared money helper), `lib/csv.ts` (CSV parser), `lib/account-import.ts` (map and validate rows).
- `lib/shell-nav.ts`: set `available: true` on the `accounts` entry in `SIDEBAR_ENTRIES` and in `LIST_ENTRIES`.
- `help/chart-of-accounts.md` (help topic), and a link to it from `help/navigating-books.md`.
- Package files import each other relatively (`../lib/x`), never with `~/tinycld/books/...`.

## Behavior
List
- The screen shows a back link "All lists" (to `books/lists`), the title "Chart of Accounts", a toolbar, and the tree.
- Every account appears under its parent. Top-level accounts have no parent. Nesting is at most 5 levels (server limit).
- Siblings sort by account number (blank numbers last), then name. A column header (Name, Type, Balance) re-sorts siblings; the tree stays intact. A second press reverses the order.
- Columns on wide screens: Name (number, then name, indented by level), Type, Detail type, Balance (right aligned), row menu. A group chip (Asset, Liability, Equity, Income, Expense) sits beside the type. The Type column stays visible while a group filter is active. Detail type is not sortable.
- A parent row has a caret that expands or collapses its sub-accounts. All parents start expanded. A toolbar action expands or collapses all. Expanded state is local to the screen and resets on reload.
- Balance of an account is its own balance: the sum of `debit_total` minus the sum of `credit_total` over all of its `books_account_balances` rows (every period that has a row, including future-dated postings; no as-of date in this unit, Q2) for a debit-normal type, and credits minus debits for a credit-normal type (`normal` from `lib/account-types.ts`). A negative result shows with a minus sign. A parent row that is collapsed shows the roll-up (own balance plus all descendants of the same type) with the label "incl. sub-accounts". An expanded parent shows its own balance. (Q1)
- Money shows through the shared `lib/money.ts` helper using the account's `currency` field. No screen does arithmetic on dollars.
- Search filters by name or number, case insensitive. A matching account keeps its ancestors visible and expanded. Filter chips: Assets, Liabilities, Equity, Income, Expenses (one active at a time, or none for all) and a "Show inactive" toggle (off by default). Inactive accounts show dimmed with an "Inactive" label when shown.
- Tapping a row opens the account panel (edit for writers, read-only view for read-only users). (Q8)
- The row menu has: Edit, Add sub-account, Make inactive or Make active, Delete. A read-only user has no menu and no New account button. Writers are bookkeeper and admin (`useBooksAccess().canWrite`).
- Batch: a checkbox column selects rows. "Batch actions" has one action, "Make inactive". It is disabled when no row is selected. Selecting a parent does not select its children.
- Empty state (no accounts): message "No accounts yet" with a New account button for writers and an Import from CSV link. When a search or filter matches nothing: "No accounts match" with a Clear filters button.
- Loading: `LoadingState` until the accounts query is ready.
- Phone: each account is a card (name and number, balance, type and detail type below), indented by level, with the same caret, tap and menu. The toolbar collapses to a search field and a filter button. New account is a button in the header, not a FAB (the shell owns the FAB).

New and edit panel
- Opens in a core `Drawer` from the right (a bottom-anchored overlay on phones, an inline panel beside the list on wide screens, an overlay on tablets). (Q9)
- Fields: Account name (required), Account number (optional), Account type (select), Detail type (select, disabled until a type is chosen, options from the type), "Make this a sub-account" toggle that reveals a Parent account select, Description.
- The parent select lists only accounts of the chosen type that would not exceed depth 5, excluding the account being edited and its descendants. Changing the type clears the parent and the detail type.
- Sticky bar: Cancel, Save, Save and new (create only).
- Validation is one zod schema through `useForm` and `zodResolver` (`@tinycld/core/ui/form`): name required and at most 200 characters, number at most 20 characters matching `^[0-9A-Za-z.-]*$`, type and detail type required and a valid pair, description at most 1000 characters. Server refusals (duplicate number, duplicate name under the same parent, depth, type mismatch, inactive rules) go through `handleMutationErrorsWithForm`. (Q4)
- Edit rules shown before the server refuses: type is disabled when the account has journal lines or sub-accounts, with the server's reason as help text. Currency is never shown as editable.
- Make inactive is refused by the server while active sub-accounts exist; the message names the count.

Delete
- Delete opens a confirm dialog. The dialog reads one journal line for the account (`useLiveQuery`, limit 1) and its sub-accounts. If either exists, the dialog explains why delete is blocked ("This account is used on journal lines" or "This account has sub-accounts") and offers Make inactive instead. Otherwise Delete runs through `useMutation`. The server stays the authority and its refusal message is shown if it differs. (Q6)

CSV import
- Entry points: "Import" in the toolbar and the empty state. Route `/a/books/accounts/import`. Writers only; a read-only user sees a "You need bookkeeper access" message.
- Step 1 Upload: pick a CSV file (document picker on native, file input on web; drag and drop onto the area on web, see Platform notes). Rules shown: one file, header row required, UTF-8. An inline example table with a Copy example button replaces "download a sample file". Maximum 2000 rows and 1 MB.
- Step 2 Map columns: each of Number, Name, Type, Detail type, Parent, Description, Inactive maps to a file column by a select. Columns are auto-matched by header text (case and punctuation insensitive). Name and Type must be mapped. Type and Detail type cells match an account type or detail type by label or key, case insensitive. Parent matches an existing or imported account by full "Parent:Child" path, or by bare name when exactly one account has that name; a bare name that matches several accounts is an error ("ambiguous parent"). Inactive accepts yes/no/true/false/1/0.
- Step 3 Import: a preview table shows every row with a status (Ready, Skipped: already exists, Error: reason). Errors are computed before any write: unknown type, detail type not valid for the type, parent not found, parent type differs, depth over 5, duplicate number in the file or against existing accounts, duplicate name under one parent, blank name. The Import button is enabled when at least one row is Ready; error rows are never imported.
- Writing: Ready rows are inserted parents first through `useMutation` (one `Transaction` per row, yielded sequentially). A row whose (parent, name) already exists is skipped, so re-running an interrupted import is safe. On the first server refusal the import stops and shows "N of M imported" with the refused row and the server message. (Q5)
- On success: a summary (created, skipped) and a button back to the Chart of Accounts.
- Imported balances are not supported; opening balances are the `p1-opening-balances` unit.

Access and registry
- A user with level none sees nothing from Books already (shell). A read-only user sees the list and the read-only panel.
- `accounts` sidebar entry and Lists card become available.

## Data
- Reads: `books_accounts` (name, number, type, detail_type, description, inactive, currency, parent) and `books_account_balances` (account, period, debit_total, credit_total, currency). Both are on-demand collections; the screen's query has no `where`, so it loads and subscribes to the whole of each (accounts are few; balance rows are accounts x months). One `useLiveQuery`: accounts with an aggregated balance subquery (`groupBy` account, `sum` of debit and credit) joined to each account; the join is permitted because the balance side is aggregated and the accounts query drives it. Tree shape, roll-up and sort are computed from the flat result by pure functions in `lib/account-tree.ts`. If the aggregate join cannot be expressed in TanStack DB at the pinned version, fall back to `materialize()` of the account's balance rows inside the accounts query and sum in `lib/account-tree.ts`. (Q7)
- Writes: `useMutation` with the generator form against `books_accounts` insert, update, delete. No custom endpoint. `currency` is stamped by the server (omitted on insert already).
- Row types derive from the query result; no hand-written row interface.
- Money: integer minor units (cents) in storage and in memory. `lib/money.ts` exports formatting and parsing with one explicit rounding mode (half away from zero) and the stored maximum 2^53-1. This unit has no money input; the helper is created here because balances need formatting and later units reuse it. (Q3)
- Help topic `chart-of-accounts` in `books/help/`.

## Cut
- Register view and "View register" action: `p1-account-register`.
- Opening balances import: `p1-opening-balances`. Starter chart: `p1-setup-wizard`.
- Run report, Bank balance column, Feedback, paging, Google Sheet source, plan-limit banner.
- Drag to reorder accounts or drag to re-parent. Re-parenting is done in the panel.
- Merge accounts. Merge is not in the v0 spec.
- Account numbering rules or required numbers. Number stays optional.
- Custom fields on accounts (Account is a form host in the spec; the forms engine is not a dependency of this unit, see Q4).
- Export of the chart to CSV.
- Per-account currency choice.

## Platform notes
- Everything above works on web and native. File choice uses the document picker on native and a file input on web. File reading uses `File.text()` on web and `expo-file-system` on native, both already core dependencies.
- Drag and drop of a file onto the upload step is a web-only convenience (core `DropZone` does nothing on native). The picker button stays on both. Human approved at the design gate (2026-10-22). CSV upload itself is required on native: the Choose file button opens the document picker there, and the whole import flow works with it. Listed as a `[platform]` item in the packet.
- Hover-only controls are not used; the row menu button is always visible.

## Sparks carried
All-lists back link; filter by name or number; group chip beside the type; Batch actions menu; right side panel (core `Drawer`); sub-account toggle with parent picker; detail type enabled by type; Save and Save and new; three-step import; sample as an inline example.

## Non-goals
Reports, register, opening balances, account merge, reordering by drag, export, multi-currency choice, plan limits, any network import source.
