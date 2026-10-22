# books-shell — checkpoint plan

Spec: `docs/specs/books-shell-design.md`. Ledger: `docs/plans/books-shell-ledger.md`. All paths are relative to the `books` package root. Package files that Metro loads import each other relatively (`../lib/x`), never with `~/tinycld/books/...`. The fixture `tinycld/books/lib/books-shell-fixture.ts` feeds the scratch route and the tests; it reads no collection, so it has no seed wiring.

### Checkpoint 1 — Shell registries and fold store

**Delivers:** the typed registries, the pure filters over them, and the persisted fold store that every shell surface reads.

**Files:**
- Create: `tinycld/books/lib/shell-nav.ts`
- Create: `tinycld/books/stores/books-ui-store.ts`
- Modify: `tinycld/books/lib/books-shell-fixture.ts` (type the fixture with `satisfies` against the registry types)
- Test: `tests/shell-nav.test.ts` · `tests/books-ui-store.test.ts`

**Interfaces:**
- Consumes: `BooksAccessState` from `tinycld/books/lib/access.ts`; `create`, `persist`, `asyncStorage` from `@tinycld/core/lib/store`
- Produces:
  - `SidebarEntry { id: string; label: string; icon: LucideIcon; href: string; group?: 'accounting'; available: boolean }`
  - `NewAction { id: string; label: string; href: string; column: 'customers' | 'vendors' | 'other'; available: boolean }`
  - `ListEntry { id: string; label: string; description: string; href: string; available: boolean }`
  - `SIDEBAR_ENTRIES: SidebarEntry[]`, `NEW_ACTIONS: NewAction[]`, `LIST_ENTRIES: ListEntry[]`
  - `availableOnly<T extends { available: boolean }>(entries: readonly T[]): T[]`
  - `NewMenuColumn { heading: string; actions: NewAction[] }`
  - `newMenuColumns(actions: readonly NewAction[]): NewMenuColumn[]`
  - `newMenuForAccess(access: BooksAccessState, actions?: readonly NewAction[]): NewMenuColumn[]`
  - `sidebarSections(entries: readonly SidebarEntry[]): { top: SidebarEntry[]; accounting: SidebarEntry[] }`
  - `useBooksUIStore` with `isAccountingOpen: boolean` and `toggleAccounting(): void`, persisted under the name `tinycld_books_ui`

**Gates:** 1 · 3 (nothing renders)

**Spec:**
- "The sidebar, the + New menu and the Lists hub draw only registry entries whose `available` flag is true; the unit that builds an entry's screen sets its flag."
- "Registry entries for phase 1 exist now with `available: false`, except Lists: Chart of Accounts, Journal Entries, the Accounts list, and the Journal entry action."
- "A sidebar group with no available entries is not drawn."
- "The Accounting group folds and unfolds; its state persists across sessions in a Zustand store."
- "A + New column with no available actions is not drawn, and + New itself is not drawn when no action is available."
- "Users below bookkeeper level see no + New (`useBooksAccess`)."
- "The sidebar, + New menu and Lists hub entries are one typed constant each in `lib/shell-nav.ts`; later units append entries."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/shell-nav.test.ts` — `availableOnly` drops entries with `available: false` and keeps order; `SIDEBAR_ENTRIES` has `lists` available and Chart of Accounts and Journal Entries unavailable; `NEW_ACTIONS` contains a Journal entry action in the `other` column with `available: false`; `LIST_ENTRIES` contains Accounts with `available: false`.
- `tests/shell-nav.test.ts` — `newMenuColumns` returns columns in the order Customers, Vendors, Other and drops a column whose actions are all unavailable; given no available action it returns `[]`.
- `tests/shell-nav.test.ts` — `newMenuForAccess` returns `[]` for levels `none` and `read_only` even when actions are available, and returns the columns for `bookkeeper` and `admin` (built with `accessFromRow`).
- `tests/shell-nav.test.ts` — `sidebarSections` puts `group: 'accounting'` entries under `accounting` and the rest under `top`, and returns an empty `accounting` list when none is available.
- `tests/books-ui-store.test.ts` — `isAccountingOpen` starts true; `toggleAccounting` flips it; the persisted partial contains `isAccountingOpen`.

**Do:**
1. Create `lib/shell-nav.ts` with the types above and the three constants: `SIDEBAR_ENTRIES` = Lists (`href: 'lists'`, available true), Chart of Accounts (`accounts`, group accounting, false), Journal Entries (`entries`, group accounting, false); `NEW_ACTIONS` = Journal entry (`entries/new`, column other, false); `LIST_ENTRIES` = Accounts (`accounts`, description "Chart of accounts", false). Icons come from `lucide-react-native`.
2. Implement the five functions. Column headings are Customers, Vendors, Other; `newMenuForAccess` defaults `actions` to `NEW_ACTIONS` and returns `[]` unless `access.canWrite`.
3. Create the store with `create<State>()(persist(..., { name: 'tinycld_books_ui', storage: asyncStorage, partialize: s => ({ isAccountingOpen: s.isAccountingOpen }) }))`, `isAccountingOpen` true by default.
4. Modify the fixture so its actions and lists are typed `satisfies readonly NewAction[]` / `readonly ListEntry[]` (all `available: true`, with `id`, `href`, `column`, `description` filled), and export `NEW_ACTIONS_FIXTURE` and `LIST_ENTRIES_FIXTURE`; keep the old exports only if a later step still uses them, otherwise remove them and update `screens/helix-mockup.tsx`.

### Checkpoint 2 — Sidebar with active state

**Delivers:** the Books sidebar showing available entries, an Accounting group that folds, and the active destination highlighted.

**Files:**
- Modify: `tinycld/books/sidebar.tsx`
- Create: `tinycld/books/hooks/useBooksSidebar.ts`
- Test: `tests/books-sidebar.test.tsx`

**Interfaces:**
- Consumes: `SIDEBAR_ENTRIES`, `availableOnly`, `sidebarSections`, `SidebarEntry`, `useBooksUIStore`, `isAccountingOpen`, `toggleAccounting` from checkpoint 1; `SidebarItem`, `SidebarHeading`, `SidebarNav` from `@tinycld/core/components/sidebar-primitives`
- Produces: `useBooksSidebar(entries?: readonly SidebarEntry[]): { top: SidebarEntry[]; accounting: SidebarEntry[]; isAccountingOpen: boolean; toggleAccounting: () => void; isActive: (entry: SidebarEntry) => boolean }`

**Gates:** 1 · 2 (reference: `hub-*` screenshots; built URL: `/a/books/lists`) · 3

**Spec:**
- "A sidebar group with no available entries is not drawn."
- "The Accounting group folds and unfolds; its state persists across sessions in a Zustand store."
- "The active destination is highlighted with the `active-indicator` token."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/books-sidebar.test.tsx` — `useBooksSidebar` (rendered with `renderHook` from `@testing-library/react`) given a fixture entry list returns only available entries split into `top` and `accounting`; with no available accounting entry `accounting` is `[]`.
- `tests/books-sidebar.test.tsx` — calling `toggleAccounting` through the hook flips `isAccountingOpen`.
- `tests/books-sidebar.test.tsx` — `isActive(entry)` is true when the current pathname ends with the entry's `href` and false otherwise (the pathname comes from the shared `expo-router` stub in `setupFiles`).

**Do:**
1. Create `hooks/useBooksSidebar.ts`: read the pathname with `usePathname` from `expo-router`, take the store fields with selectors, and split `availableOnly(entries)` with `sidebarSections`.
2. Rewrite `sidebar.tsx`: `SidebarNav` containing a `SidebarItem` per `top` entry; when `accounting` is non-empty, a `SidebarHeading` "Accounting" whose `action` is a chevron `Pressable` calling `toggleAccounting`, followed by its items when `isAccountingOpen`. Navigate with the same router helper `drive/tinycld/drive/sidebar.tsx` uses for an in-package route, `closesDrawer` true. Each item gets `isActive` and a `testID` of `books-nav-<id>`. No raw hex; icons colored with `useThemeColor`.
3. Keep JSX minimal: all derivation stays in the hook.

### Checkpoint 3 — New menu and phone button

**Delivers:** the + New control: a three-column popover on web and tablet, a bottom sheet on phones, opened from a sidebar button or a FAB, hidden below bookkeeper level or when no action is available.

**Files:**
- Create: `tinycld/books/components/NewMenu.tsx`
- Create: `tinycld/books/components/NewFab.tsx`
- Create: `tinycld/books/hooks/useNewMenu.ts`
- Modify: `tinycld/books/sidebar.tsx` (+ New button above the entries)
- Modify: `tinycld/books/screens/_layout.tsx` (mount `NewFab`)
- Modify: `tinycld/books/screens/helix-mockup.tsx` (scratch route: render `NewMenu` open with the fixture, `?state=new-menu`)
- Test: `tests/new-menu.test.tsx`

**Interfaces:**
- Consumes: `newMenuForAccess`, `NewMenuColumn`, `NewAction`, `NEW_ACTIONS` from checkpoint 1; `useBooksAccess` from `tinycld/books/hooks/useBooksAccess.ts`; `Popover` from `@tinycld/core/ui/popover`; `SidebarActionButton`; `FAB` from `@tinycld/core/components/FAB`
- Produces:
  - `useNewMenu(actions?: readonly NewAction[]): { isVisible: boolean; columns: NewMenuColumn[]; open: (action: NewAction) => void }`
  - `NewMenu({ columns, trigger, onSelect }: { columns: NewMenuColumn[]; trigger: ReactElement; onSelect: (action: NewAction) => void })`
  - `NewFab()` which returns `null` unless the breakpoint is mobile and `useNewMenu().isVisible`

**Gates:** 1 · 2 (reference: `menu-*` screenshots; built URL: `/a/books/helix-mockup?state=new-menu`) · 3

**Spec:**
- "+ New sits at the top of the sidebar on web and tablet, and as a FAB on phones."
- "+ New opens three columns (Customers, Vendors, Other) on web and tablet, and a bottom sheet with the same groups stacked on phones."
- "A + New column with no available actions is not drawn, and + New itself is not drawn when no action is available."
- "Users below bookkeeper level see no + New (`useBooksAccess`)."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/new-menu.test.tsx` — `useNewMenu` returns `isVisible: false` and `columns: []` when `useBooksAccess` reports `read_only`, and when no action is available at `bookkeeper`; it returns `isVisible: true` with the Other column for a fixture action at `bookkeeper`. The access level reaches the hook through `accessFromRow` rows served by the shared live-query test setup, not a mock of our own hook.
- `tests/new-menu.test.tsx` — rendering `NewMenu` with the fixture columns (open) shows the headings Customers, Vendors, Other and each action label, and pressing an action calls `onSelect` with that action.
- `tests/new-menu.test.tsx` — rendering `NewMenu` with a single non-empty column draws only that heading.

**Do:**
1. `hooks/useNewMenu.ts`: read the level with `useBooksAccess()`, compute `columns = newMenuForAccess(access, actions)`, `isVisible = columns.length > 0`, and `open` navigates to the action's `href` with the same router helper as the sidebar.
2. `components/NewMenu.tsx`: a `Popover` (presentation `auto`, `title` "New") whose body is a row of columns, each a heading `Text` plus one `Pressable` row per action; on a phone the body stacks the columns (read `usePopoverContext().isSheet`). Pressing an action calls `onSelect` and closes the popover.
3. `components/NewFab.tsx`: `useBreakpoint() === 'mobile'` and `isVisible` gate a `FAB` with the `Plus` icon, wrapped in a `NewMenu` trigger.
4. `sidebar.tsx`: when `useNewMenu().isVisible` and the breakpoint is not mobile, render `NewMenu` with a `SidebarActionButton` (label "New", `Plus` icon) as the trigger above the entries.
5. `screens/_layout.tsx`: wrap the `Stack` in a `View` with `flex-1` and mount `NewFab` after it.
6. Update the scratch route so `?state=new-menu` renders `NewMenu` initially open with `NEW_ACTIONS_FIXTURE` columns; add that shot to the capture manifest for gate 2.

### Checkpoint 4 — Lists hub and redirect

**Delivers:** the Lists hub screen with its empty state, the `/a/books` redirect, the end-to-end test, and the in-app help topic.

**Files:**
- Create: `tinycld/books/screens/lists.tsx`
- Create: `tinycld/books/components/ListsHub.tsx`
- Create: `tinycld/books/hooks/useListsHub.ts`
- Modify: `tinycld/books/screens/index.tsx` (redirect)
- Modify: `manifest.ts` (`help: { directory: 'help' }`)
- Create: `help/navigating-books.md`
- Test: `tests/lists-hub.test.tsx` · `tests/e2e/books-shell.spec.ts`

**Interfaces:**
- Consumes: `LIST_ENTRIES`, `availableOnly`, `ListEntry` from checkpoint 1
- Produces: `useListsHub(entries?: readonly ListEntry[]): { cards: ListEntry[]; isEmpty: boolean }`; `ListsHub({ entries }: { entries?: readonly ListEntry[] })`

**Gates:** 1 · 2 (reference: `hub-*` screenshots; built URL: `/a/books/lists`) · 3

**Spec:**
- "The Lists hub shows one card per available list entry."
- "The Lists hub shows an empty state when no list entry is available."
- "`/a/books` redirects to `/a/books/lists`."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/lists-hub.test.tsx` — `useListsHub` given two available and one unavailable entry returns two `cards` and `isEmpty: false`; given none available returns `cards: []` and `isEmpty: true`.
- `tests/lists-hub.test.tsx` — rendering `ListsHub` with two fixture entries shows each label and description; rendering it with no available entry shows the text "No lists yet".
- `tests/e2e/books-shell.spec.ts` — a `test.describe('books-shell: navigation', …)` block: `login`, `navigateToPackage(page, 'books')`, then expects the URL to end in `/books/lists`, the "No lists yet" text visible, the `books-nav-lists` sidebar item visible, and no "New" button (no action is available yet). Uses helpers from `@tinycld/core/e2e-helpers`; no raw PocketBase writes, no `page.goto` after login.

**Do:**
1. `hooks/useListsHub.ts` returns `availableOnly(entries)` as `cards` and `isEmpty`.
2. `components/ListsHub.tsx`: a `ScrollView` with a page heading "Lists"; a wrapped row of card `Pressable`s (label, description) navigating to the entry's `href`; when `isEmpty`, an `EmptyState` from `@tinycld/core/components/EmptyState` titled "No lists yet" with the line "Lists appear here as Books features are added."
3. `screens/lists.tsx` renders `ListsHub`; `screens/index.tsx` returns a `Redirect` from `expo-router` to the package's `lists` route, built the way `drive` builds its package-relative hrefs.
4. Write `help/navigating-books.md` (frontmatter `title`, `summary`; task-oriented prose: how to move around Books and open the + New menu, with `⌘` glyph conventions if a shortcut is mentioned) and set `help: { directory: 'help' }` in the manifest; run `cd ~/tmp/tinycld/books/tinycld && pnpm run packages:generate`.
5. Add the gate-2 built shot for `hub` to the capture manifest.
