# Books shell, sidebar, and Lists hub

## Goal
Give Books one navigable frame: a left sidebar that holds the user's shortcuts, the New actions, the Books reports and the fixed navigation, and a Lists hub.

## Where it lives
`books/tinycld/books/{sidebar.tsx, screens/_layout.tsx, screens/index.tsx, screens/lists.tsx}`. Route `/a/books/lists`. `/a/books` redirects to `/a/books/lists`.

## Behavior
- The sidebar, the New section and the Lists hub draw only registry entries whose `available` flag is true; the unit that builds an entry's screen sets its flag.
- Registry entries for phase 1 exist now with `available: false`, except Lists: Chart of Accounts, Journal Entries, the Accounts list, and the Journal entry action.
- A sidebar group with no available entries is not drawn.
- The Accounting group folds and unfolds; its state persists across sessions in a Zustand store.
- The active destination is highlighted with the `active-indicator` token.
- The New actions are the New section of the sidebar: three groups (Customers, Vendors, Other) under a heading that folds. On a phone the sidebar is the drawer, and a round New button (FAB) opens the drawer with the New section open.
- A New group with no available actions is not drawn, and the New section itself is not drawn when no action is available.
- Users below bookkeeper level see no New section and no round New button (`useBooksAccess`).
- The sidebar layout, the shortcuts and the decisions of 2026-11-23 are in "Sidebar layout" below.
- The Lists hub shows one card per available list entry.
- The Lists hub shows an empty state when no list entry is available.
- `/a/books` redirects to `/a/books/lists`.
- The sidebar, New section and Lists hub entries are one typed constant each in `lib/shell-nav.ts`; later units append entries.

## Sidebar layout
Recorded 2026-11-23 (unit p1-sidebar-shortcuts). The layout follows QuickBooks Desktop's left icon bar: "My Shortcuts" on top, the fixed list of centers under it. The same component is the desktop sidebar and the phone drawer; native gets the same.

From the top:
1. **Shortcuts.** The user's own list, with a pencil button, Customize shortcuts. A shortcut is `{ kind, ref }` with kind `screen` (a sidebar or Lists entry), `new` (a New action), `report` (a Books report: the shipped key of a shipped one, the row id of a saved one) or `register` (an account id). A user with no stored list gets the defaults: Customers, Vendors, Products and services, Profit and Loss, Balance Sheet. An empty stored list shows "No shortcuts", not the defaults. A shortcut whose target is gone or not readable draws no row. The list holds at most 30.
2. **New.** The New actions in their three groups. Folds; the state persists. Hidden for a reader.
3. **Reports.** The Books reports the user can read, the shipped ones first, then "All reports". Folds; closed at first, because Books ships more reports than fit above the navigation.
4. **Go to.** The fixed navigation: Dashboard, Banking, Sales, Expenses, Lists, the Accounting group (folds), Taxes, Settings. It has no Reports entry.

Customize shortcuts is a dialog (a sheet on a phone): Add shortcut (one searchable list of screens, forms, reports and registers; no form for a reader), Remove, Move up, Move down, drag, Reset to defaults. It edits a draft and writes one time on Save. A draft equal to the defaults deletes the stored row. The picker waits for the access level before it offers forms, so a reader never sees a form that flashes in and out; when the access read fails it shows one Retry.

Decisions:
- **The New popover is removed.** Its entries are the New section. The `NewFab` component stays, on phones only, and opens the drawer with the New section open: core's drawer has no visible control that opens it. It is hidden on forms, on record pages and on a report.
- **A sidebar row closes the phone drawer at once.** Core's `SidebarItem` closed it with a timer 500 ms after the press, and that timer also closed a drawer the round New button had opened again inside that time. The fix is in core (`closesDrawer` closes with no timer); Books rows use `closesDrawer` and have no code of their own for it.
- **Books reports open inside Books.** Route `/a/books/reports/<id>` draws core's `ReportScreen` with `basePath="books/reports"`, so drill links, Back and Save as stay on the Books route and the Books sidebar stays. Every Books link to a report (`shippedReportHref`) builds this route. The route never unmounts `ReportScreen` for a loading or failed read: Edit runs the builder on the same route and holds unsaved state. A report of another package opened on this route shows a note with a link to core's route. `/a/books/reports` is the Books reports screen (the same list as the Reports section, with "All reports" last): Back from a Books report with no history opens it, so Back never leaves Books.
- **Core's Reports hub stays; only its entry in core's main navigation is removed** (decision of the human, 2026-11-23). "All reports" in the Reports section opens it filtered to Books (`/a/reports?package=books`).
- **Books settings are also panels of core Settings** (decision of the human, 2026-11-23): the seven sections are in the manifest list `settings`, so an organization owner or admin finds them under Books in Settings. Both entry points draw `SectionPanel`; the Books sidebar keeps its Settings entry, which a Books admin who is not an organization admin needs. The settings panel owns the one read of the settings row and passes the row to every section it draws, so a section that is drawn again keeps its unsaved text through a later read. Core's panel screen (`PackagePanelScreen`) gives a fixed-height area with no scroller, so the core Settings panels draw `SectionPanelScreen`: a `SectionPanel` inside its own `ScrollView`.
- **The Reports entry left the fixed navigation.** `reports` is not in `SIDEBAR_ENTRIES`, so a stored `screen:reports` shortcut has no target: it draws no row, and the Customize shortcuts dialog shows it as "Not available".

## Data
`books_sidebar_shortcuts`: one row for each user (`user`, `items` as a JSON list), read with `useMyLiveQuery`; a user reads and writes only their own row. The Reports section and the report shortcuts read core's `reports` collection, filtered to sources that start with `books.`. Access level from `useBooksAccess`. Persisted fold states (Accounting, New, Reports) in a Zustand store (`books-ui-store`). Package files that Metro loads import each other relatively (`../lib/x`), never with `~/tinycld/books/...`.

## Cut
- Bookmarks, Payroll, Time, Projects, My accountant, Live bookkeeping, Banking services, Commerce, Apps, Menu settings: outside the v0 scope.
- Keyboard shortcut sheet: v1.1 per the spec.
- Gear menu (Your company / Lists / Tools / Profile): Settings is its own unit.
- Dead (disabled) entries for unbuilt screens: hidden until built.

## Platform notes
none

## Sparks carried
Grouping by counterparty: `Popover` columns / `ui/bottom-drawer`. Orientation: `SidebarItem` active state and `SidebarHeading`.

## Non-goals
Dashboard, search in the menu, reorder of the fixed navigation, shortcuts to records (one customer, one invoice), shortcuts shared between users.
