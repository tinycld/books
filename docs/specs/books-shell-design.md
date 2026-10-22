# Books shell, sidebar, and Lists hub

## Goal
Give Books one navigable frame: a left sidebar, a global + New menu, and a Lists hub.

## Where it lives
`books/tinycld/books/{sidebar.tsx, screens/_layout.tsx, screens/index.tsx, screens/lists.tsx}`. Route `/a/books/lists`. `/a/books` redirects to `/a/books/lists`.

## Behavior
- The sidebar, the + New menu and the Lists hub draw only registry entries whose `available` flag is true; the unit that builds an entry's screen sets its flag.
- Registry entries for phase 1 exist now with `available: false`, except Lists: Chart of Accounts, Journal Entries, the Accounts list, and the Journal entry action.
- A sidebar group with no available entries is not drawn.
- The Accounting group folds and unfolds; its state persists across sessions in a Zustand store.
- The active destination is highlighted with the `active-indicator` token.
- + New sits at the top of the sidebar on web and tablet, and as a FAB on phones.
- + New opens three columns (Customers, Vendors, Other) on web and tablet, and a bottom sheet with the same groups stacked on phones.
- A + New column with no available actions is not drawn, and + New itself is not drawn when no action is available.
- Users below bookkeeper level see no + New (`useBooksAccess`).
- The Lists hub shows one card per available list entry.
- The Lists hub shows an empty state when no list entry is available.
- `/a/books` redirects to `/a/books/lists`.
- The sidebar, + New menu and Lists hub entries are one typed constant each in `lib/shell-nav.ts`; later units append entries.

## Data
No collections read. Access level from `useBooksAccess`. Persisted fold state in a Zustand store (`books-ui-store`). Package files that Metro loads import each other relatively (`../lib/x`), never with `~/tinycld/books/...`.

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
Dashboard, search in the menu, drag-reorder of the sidebar, per-user menu customization.
