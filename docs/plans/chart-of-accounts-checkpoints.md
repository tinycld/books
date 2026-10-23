# Chart of Accounts — checkpoint plan

Package: `books` (dir `books/`). Feature: `chart-of-accounts`. Spec: `docs/specs/chart-of-accounts-design.md`. Paths below are relative to the package root. Source lives in `tinycld/books/`. Package files import each other relatively (`../lib/x`), never with `~/tinycld/books/...`. Every screen works on web and native. No raw hex: semantic Tailwind tokens or `useThemeColor`. No `console.*`. Data goes through pbtsdb (`useStore`, `useLiveQuery`, `useMutation` from `@tinycld/core/lib/mutations`). Forms use zod through `useForm` + `zodResolver` from `@tinycld/core/ui/form`. No `useState` + `useEffect` sync. Row types derive from the query result.

Reference screenshots live in `docs/plans/chart-of-accounts-reference/` as `<state>-<width>-<scheme>.png` (widths 390 and 1280) and `lib/chart-of-accounts-fixture.ts` holds the data they show. The scratch route `tinycld/books/screens/helix-mockup.tsx` exists locally as a structure aid only; it is git-excluded and deleted at the end, so no checkpoint depends on it. Build from the screenshots and the fixture.

Review mode: C (unattended).

## Decisions that apply to every checkpoint

- **Depth convention (one place):** depth is 1-based. A top-level account has depth 1; the maximum is 5 (`maxAccountDepth`, matching `server/accounts.go`). `TreeNode.depth` carries it. Row indentation is `(depth - 1)` steps. No code or test uses a 0-based level.
- Amounts are integer cents in memory and storage. Screens never do dollar arithmetic; they call `lib/money.ts`.
- **Read path (decided):** `lib/accounts-query.ts` exports `accountsWithBalances(accounts, balances)`, a TanStack DB query builder: `books_accounts` left-joined (`leftJoin`) to a subquery over `books_account_balances` that is `groupBy`-ed on `account` and selects `sum(debit_total)` and `sum(credit_total)`. `@tanstack/db` 0.12.1 exports `groupBy`, `sum` and `leftJoin`. The query has no `where`. An account with no balance rows gets 0 and 0. The checkpoint 2 test `tests/accounts-query.test.ts` runs this exact query over real local-only collections. Only if that test shows the aggregate join cannot return the sums, replace the body of `accountsWithBalances` with the written fallback: `materialize()` each account's balance rows and sum them in `lib/account-tree.ts`; the test stays the same. The implementer records which one shipped in the ledger Design notes.
- **Test harness:** pure logic is tested directly. Hooks that read or write collections take their collections from `useStore` but keep their logic in functions that accept collections as arguments; tests pass real TanStack DB local-only collections (`createCollection(localOnlyCollectionOptions(...))`) seeded from `ACCOUNTS` and `BALANCES`. Screens and components are split into a props-driven view and a thin wrapper that calls the hooks; render tests use `@testing-library/react` on the view, with `isWide` passed as a prop. Nothing of ours is mocked.
- **Row type:** `AccountRow`, exported from `hooks/useAccountsQuery.ts`, derived from the query result. No hand-written row interface.
- **Server messages:** the server's refusal strings (`server/accounts.go`) are the source of truth. `lib/account-messages.ts` holds the exact strings the client shows in advance, and `tests/account-messages.test.ts` reads `server/accounts.go` and fails if either string drifts.
- Unit tests live in `tests/`; e2e in `tests/e2e/`.

### Checkpoint 1 — Money helper and tree logic

**Delivers:** pure functions that format money, build, sort, roll up and filter the account tree, pick valid parents, and word the server's type-lock reasons; plus one inactive seed account.

**Files:**
- Create: `tinycld/books/lib/money.ts`
- Create: `tinycld/books/lib/account-tree.ts`
- Create: `tinycld/books/lib/account-messages.ts`
- Modify: `tinycld/books/seed.ts` (add one inactive top-level expense account `Old Petty Cash`, number `6900`, type `expense`, detail type `other_misc_expense`, created active then updated to `inactive: true`; the existing seed already creates the pair `Software Subscriptions` > `Design Tools` and `Business Checking`, which has journal lines)
- Test: `tests/money.test.ts` · `tests/account-tree.test.ts` · `tests/account-messages.test.ts`

**Interfaces:**
- Consumes: `ACCOUNT_TYPES`, `accountTypeDef(key: string)`, `AccountGroup` from `lib/account-types.ts` (exist)
- Produces (`lib/money.ts`): `maxStoredAmount: number` (2^53-1), `roundHalfAwayFromZero(value: number): number`, `dollarsToCents(dollars: number): number`, `formatMoney(cents: number, currency: string): string` (negative shows a leading minus), `parseMoney(text: string): number | null` (cents; null when not a number or above `maxStoredAmount`)
- Produces (`lib/account-tree.ts`):
  - `maxAccountDepth: 5`
  - `type TreeAccount = { id: string; name: string; number: string; type: string; parent: string; inactive: boolean; debit_total: number; credit_total: number }`
  - `type SortKey = 'name' | 'type' | 'balance'`; `type SortState = { key: SortKey | null; direction: 'asc' | 'desc' }`; `defaultSort: SortState`; `nextSort(current: SortState, key: SortKey): SortState` (first press ascending, second press descending)
  - `type TreeNode<T extends TreeAccount> = { account: T; children: TreeNode<T>[]; depth: number; ownBalance: number; rollupBalance: number }`
  - `ownBalance(type: string, debitTotal: number, creditTotal: number): number`
  - `buildAccountTree<T extends TreeAccount>(accounts: readonly T[], sort: SortState): TreeNode<T>[]`
  - `type TreeFilters = { collapsed: ReadonlySet<string>; query: string; group: AccountGroup | ''; showInactive: boolean }`
  - `type VisibleRow<T extends TreeAccount> = { node: TreeNode<T>; hasChildren: boolean; isCollapsed: boolean; balance: number; showsRollup: boolean }`
  - `flattenAccountTree<T extends TreeAccount>(nodes: TreeNode<T>[], filters: TreeFilters): VisibleRow<T>[]`
  - `parentIds<T extends TreeAccount>(nodes: TreeNode<T>[]): string[]`
  - `parentChoices<T extends TreeAccount>(accounts: readonly T[], opts: { type: string; editingId: string }): T[]`
  - `activeChildCount(accounts: readonly TreeAccount[], id: string): number`
  - `accountPath(account: TreeAccount, byId: ReadonlyMap<string, TreeAccount>): string` (names joined with `:`)
- Produces (`lib/account-messages.ts`): `typeLockMessage(usage: { lines: number; children: number }): string | null`, `inactiveRefusalMessage(activeChildren: number): string`

**Gates:** 1 · 3 (nothing renders)

**Spec:**
- "Every account appears under its parent. Top-level accounts have no parent. Nesting is at most 5 levels (server limit)."
- "Siblings sort by account number (blank numbers last), then name. A column header (Name, Type, Balance) re-sorts siblings; the tree stays intact. A second press reverses the order."
- "Balance of an account is its own balance: the sum of `debit_total` minus the sum of `credit_total` over all of its `books_account_balances` rows (every period that has a row, including future-dated postings; no as-of date in this unit, Q2) for a debit-normal type, and credits minus debits for a credit-normal type (`normal` from `lib/account-types.ts`). A negative result shows with a minus sign. A parent row that is collapsed shows the roll-up (own balance plus all descendants of the same type) with the label "incl. sub-accounts". An expanded parent shows its own balance. (Q1)"
- "Money shows through the shared `lib/money.ts` helper using the account's `currency` field. No screen does arithmetic on dollars."
- "Search filters by name or number, case insensitive. A matching account keeps its ancestors visible and expanded. Filter chips: Assets, Liabilities, Equity, Income, Expenses (one active at a time, or none for all) and a "Show inactive" toggle (off by default). Inactive accounts show dimmed with an "Inactive" label when shown."
- "A parent row has a caret that expands or collapses its sub-accounts. All parents start expanded. A toolbar action expands or collapses all. Expanded state is local to the screen and resets on reload."
- "The parent select lists only accounts of the chosen type that would not exceed depth 5, excluding the account being edited and its descendants. Changing the type clears the parent and the detail type."
- "Edit rules shown before the server refuses: type is disabled when the account has journal lines or sub-accounts, with the server's reason as help text. Currency is never shown as editable."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/money.test.ts` — `formatMoney(123456, 'USD')` is `$1,234.56`; `formatMoney(-5, 'USD')` starts with a minus; `roundHalfAwayFromZero(2.5)` is 3 and `roundHalfAwayFromZero(-2.5)` is -3; `dollarsToCents(10.005)` is 1001 and `dollarsToCents(0.1 + 0.2)` is 30; `parseMoney('1,234.50')` is 123450; `parseMoney('abc')` is null; `parseMoney` of a value above `maxStoredAmount` cents is null; `maxStoredAmount` equals `Number.MAX_SAFE_INTEGER`.
- `tests/account-tree.test.ts` (uses `ACCOUNTS` and `BALANCES` from the fixture for realistic input) —
  - `ownBalance('bank', 500, 200)` is 300; `ownBalance('credit_card', 200, 500)` is 300; a negative result stays negative.
  - `buildAccountTree`: a child sits under its parent with `depth` 2; a top-level account has `parent: ''` and `depth` 1; an account whose parent id is missing is top level.
  - Sort: siblings sort by number with blank numbers last, then name; `nextSort` toggles asc then desc on the same key and resets to asc on a new key; sorting by `balance` reorders siblings but keeps every child under its parent.
  - Roll-up: `rollupBalance` equals own balance plus ALL descendants of the same type, including inactive ones, regardless of `showInactive`.
  - `flattenAccountTree`: hides the children of a collapsed node; a collapsed parent has `showsRollup: true` and the roll-up as `balance`; an expanded parent shows its own balance; a query matches name or number case-insensitively and keeps ancestors visible and expanded even when they are in `collapsed`; `group` keeps only accounts of that group; `showInactive: false` drops inactive accounts AND the whole subtree under an inactive parent; `showInactive: true` keeps them.
  - `parentChoices`: excludes the editing account and its descendants, excludes other types, and applies the depth rule: a candidate is offered only if `candidate.depth + 1 + height(editing subtree) <= 5` (height of a leaf is 0). A depth-5 candidate is never offered; a depth-4 candidate is offered only for an account with no children.
  - `activeChildCount` ignores inactive children; `accountPath` of Leaf under Mid under Top is `Top:Mid:Leaf`.
- `tests/account-messages.test.ts` — `typeLockMessage({ lines: 3, children: 0 })` equals "This account is used on 3 journal lines, so its type cannot change. Create a new account and move the activity with a journal entry."; `typeLockMessage({ lines: 0, children: 2 })` equals "Sub-accounts share their parent's type. Change or move the 2 sub-accounts first."; lines win when both are non-zero; both zero gives null; `inactiveRefusalMessage(2)` equals "Make the 2 active sub-accounts inactive first."; the test reads `server/accounts.go` with `node:fs` and asserts each format string (with `%d` in place of the count) appears in it.

**Do:**
1. `lib/money.ts`: implement the five exports. `roundHalfAwayFromZero(v)` is `Math.sign(v) * Math.round(Math.abs(v) * (1 + Number.EPSILON))`. `formatMoney` uses `Intl.NumberFormat` with `style: 'currency'`, dividing cents by 100 only at the formatting boundary. `parseMoney` strips `$`, commas and spaces, rejects anything that is not `-?\d+(\.\d{1,2})?` after stripping, converts through `dollarsToCents`, and returns null above `maxStoredAmount`.
2. `lib/account-tree.ts`: `ownBalance` looks up `accountTypeDef(type)?.normal` and returns debit minus credit for `'debit'`, credit minus debit for `'credit'`. `buildAccountTree` indexes by id, attaches children, sorts every sibling list with one comparator (number with blank last, then name, case-insensitive) unless `sort.key` is set, in which case it sorts by that key (`type` by type label, `balance` by `ownBalance`) with name as tie-break, reversing for `desc`. Set `depth` while walking down and compute `rollupBalance` from all descendants of the same type.
3. `flattenAccountTree`: depth-first walk. An inactive node with `showInactive: false` is skipped with its whole subtree. When `query` is non-empty a node is kept if it or a descendant matches; ancestors of a match are treated as expanded regardless of `collapsed`. A row's `balance` is `rollupBalance` when `isCollapsed && hasChildren`, else `ownBalance`; `showsRollup` is the same condition.
4. `parentChoices` per the depth rule above, same `type` as `opts.type` only.
5. `lib/account-messages.ts`: the two exact strings with the counts interpolated.
6. `seed.ts`: after the account loop, create `Old Petty Cash` and then `pb.collection('books_accounts').update(id, { inactive: true })`. Do not touch the entries.
7. Run `pnpm exec tinycld-pkg check` from the package.

### Checkpoint 2 — Account list read path and table

**Delivers:** the `/a/books/accounts` route shows the title, back link, a loading state, and the live tree as a sortable table (wide) or cards (phone) with caret, balance and roll-up label.

**Files:**
- Create: `tinycld/books/lib/accounts-query.ts`
- Create: `tinycld/books/hooks/useAccountsQuery.ts`
- Create: `tinycld/books/hooks/useAccountTree.ts`
- Create: `tinycld/books/stores/accounts-panel-store.ts`
- Create: `tinycld/books/screens/accounts/index.tsx` (thin wrapper)
- Create: `tinycld/books/components/accounts/AccountsScreenView.tsx`
- Create: `tinycld/books/components/accounts/AccountTree.tsx` (sortable header + rows)
- Create: `tinycld/books/components/accounts/AccountRow.tsx`
- Create: `tinycld/books/components/accounts/AccountCard.tsx`
- Create: `tinycld/books/components/accounts/GroupChip.tsx`
- Test: `tests/accounts-query.test.ts` · `tests/useAccountTree.test.ts` · `tests/account-tree-view.test.tsx` · `tests/accounts-screen.test.tsx`

**Interfaces:**
- Consumes: from checkpoint 1: `buildAccountTree`, `flattenAccountTree`, `parentIds`, `nextSort`, `defaultSort`, `SortState`, `SortKey`, `TreeFilters`, `VisibleRow`, `TreeAccount`; `formatMoney`; `useBooksAccess()` from `hooks/useBooksAccess.ts`
- Produces:
  - `accountsWithBalances(accounts, balances)` (query builder, see Decisions) in `lib/accounts-query.ts`
  - `useAccountsQuery(): { data: AccountRow[] | undefined; isReady: boolean }`; `type AccountRow`
  - `useAccountTree(accounts: AccountRow[]): { rows: VisibleRow<AccountRow>[]; isEmpty: boolean; hasFilters: boolean; query: string; setQuery(value: string): void; group: AccountGroup | ''; setGroup(group: AccountGroup | ''): void; showInactive: boolean; setShowInactive(value: boolean): void; sort: SortState; onSort(key: SortKey): void; toggleCollapsed(id: string): void; areAllCollapsed: boolean; toggleAllCollapsed(): void; clearFilters(): void }`
  - `useAccountsPanelStore` (Zustand): `target: PanelTarget | null`, `openNew(): void`, `openSubAccount(parentId: string): void`, `openEdit(id: string): void`, `close(): void`; `type PanelTarget = { mode: 'new'; parentId: string } | { mode: 'edit'; id: string }` (a new top-level account has `parentId: ''`)
  - `AccountsScreenView({ isReady: boolean; isWide: boolean; canWrite: boolean; tree: ReturnType<typeof useAccountTree>; onOpen(id: string): void; onNew(): void })`
  - `AccountTree({ rows, sort, onSort, onToggle, onOpen })`, `AccountCard({ row, onToggle, onOpen })`, `GroupChip({ group: AccountGroup })`
  - Test ids: `account-row-<id>`, `account-caret-<id>`, `account-card-<id>`, `account-new-header`.

**Gates:** 1 · 2 (reference: `populated-*`; built URL: `/a/books/accounts`) · 3

**Spec:**
- "The screen shows a back link "All lists" (to `books/lists`), the title "Chart of Accounts", a toolbar, and the tree."
- "Siblings sort by account number (blank numbers last), then name. A column header (Name, Type, Balance) re-sorts siblings; the tree stays intact. A second press reverses the order."
- "Columns on wide screens: Name (number, then name, indented by level), Type, Detail type, Balance (right aligned), row menu. A group chip (Asset, Liability, Equity, Income, Expense) sits beside the type. The Type column stays visible while a group filter is active. Detail type is not sortable."
- "A parent row has a caret that expands or collapses its sub-accounts. All parents start expanded. A toolbar action expands or collapses all. Expanded state is local to the screen and resets on reload."
- "Balance of an account is its own balance: the sum of `debit_total` minus the sum of `credit_total` over all of its `books_account_balances` rows (every period that has a row, including future-dated postings; no as-of date in this unit, Q2) for a debit-normal type, and credits minus debits for a credit-normal type (`normal` from `lib/account-types.ts`). A negative result shows with a minus sign. A parent row that is collapsed shows the roll-up (own balance plus all descendants of the same type) with the label "incl. sub-accounts". An expanded parent shows its own balance. (Q1)"
- "Money shows through the shared `lib/money.ts` helper using the account's `currency` field. No screen does arithmetic on dollars."
- "Loading: `LoadingState` until the accounts query is ready."
- "Phone: each account is a card (name and number, balance, type and detail type below), indented by level, with the same caret, tap and menu. The toolbar collapses to a search field and a filter button. New account is a button in the header, not a FAB (the shell owns the FAB)."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/accounts-query.test.ts` — builds `accountsWithBalances` over real local-only collections seeded from the fixture plus extra rows: an account with balance rows in three periods yields the sum of all three; a future-dated period row is included; an account with no balance rows yields `debit_total` 0 and `credit_total` 0; the result has one row per account (no duplication from the join).
- `tests/useAccountTree.test.ts` — `renderHook(() => useAccountTree(rows))` with fixture-derived rows: all parents start expanded; `toggleCollapsed` hides that parent's children and swaps its balance to the roll-up; `toggleAllCollapsed` collapses every parent and a second call expands them; `onSort('name')` twice reverses sibling order; `setQuery('rent')` keeps ancestors of matches; `setGroup('expense')` leaves only expense rows; `showInactive` false hides inactive rows; `clearFilters` resets query, group and the inactive toggle; `isEmpty` is true for no accounts; `hasFilters` is true when any filter is set.
- `tests/account-tree-view.test.tsx` — `AccountTree` shows the headers Name, Type, Detail type, Balance; the Type column and the group chip are present while the rows come from a group filter; a collapsed parent shows "incl. sub-accounts" next to the roll-up and an expanded parent does not; an inactive row has the text "Inactive" and the dimmed style class; a negative balance has a minus sign; the balance cell is right aligned (class); a depth-3 row is indented by two steps more than a depth-1 row; pressing a header calls `onSort` with `name`, `type`, `balance` and the Detail type header has no press handler; pressing the caret calls `onToggle` and not `onOpen`; pressing the row calls `onOpen` with the id. `AccountCard` renders name and number, balance, type and detail type, the same indent, the same caret and tap behavior, and the "incl. sub-accounts" label when collapsed.
- `tests/accounts-screen.test.tsx` — `AccountsScreenView` with `isReady: false` renders `LoadingState` and no table; ready and `isWide` renders the table and not cards; ready and not wide renders cards and not the table; the back link reads "All lists" and points to `books/lists`; the title reads "Chart of Accounts"; on phone a writer sees a "New account" button in the header (`account-new-header`) and no FAB is rendered by the view; a read-only user sees no New account button.

**Do:**
1. `lib/accounts-query.ts` and `hooks/useAccountsQuery.ts`: `useLiveQuery` over `useStore('books_accounts', 'books_account_balances')` running `accountsWithBalances`. Select the `TreeAccount` fields plus `description`, `detail_type`, `currency`. `AccountRow` is the query's element type.
2. `useAccountTree`: local `useState` for `query`, `group`, `showInactive`, `sort` and a `collapsed` `Set` (genuinely local, synchronous UI state that resets on reload). Derive `buildAccountTree(accounts, sort)` and `flattenAccountTree(tree, filters)` during render.
3. `stores/accounts-panel-store.ts` with `create` from `@tinycld/core/lib/store`; no persistence.
4. `AccountTree`/`AccountRow`: a sortable header and rows built from the `populated` reference. Column widths must flex so the table never needs a fixed minimum width (see checkpoint 4): Name `flex-1` with a minimum, Type fixed, Detail type flexible with truncation, Balance fixed and right aligned, plus fixed leading and trailing cells that checkpoint 5 fills. Pressing the row calls `onOpen`; the caret calls `onToggle` only.
5. `AccountCard`: mirror the `populated-390-*` reference.
6. `AccountsScreenView` and `screens/accounts/index.tsx`: back link "All lists" to `books/lists`, title "Chart of Accounts", header New account button on phone (writers only), `LoadingState` until ready, then table (wide, via `useBreakpoint`) or cards. The wrapper passes `onNew={openNew}` and `onOpen={openEdit}`; the panel arrives in checkpoint 4, so in this checkpoint those calls only set the store.
7. Money is shown only via `formatMoney(balance, account.currency)`.
8. Run `cd ~/code/tinycld/tinycld && pnpm run packages:generate` so the route exists, then `pnpm exec tinycld-pkg check` from the package, then capture `/a/books/accounts`. The gate-2 capture does not click the New account button or the Import links; the Import route arrives in checkpoint 7.

### Checkpoint 3 — Toolbar, filters, empty states

**Delivers:** the toolbar with search, group chips, Show inactive, expand and collapse all, and the Import and New account actions; plus the empty and no-match states.

**Files:**
- Create: `tinycld/books/components/accounts/AccountToolbar.tsx`
- Create: `tinycld/books/components/accounts/AccountsEmptyState.tsx`
- Modify: `tinycld/books/components/accounts/AccountsScreenView.tsx` (mount the toolbar and empty states)
- Test: `tests/account-toolbar.test.tsx` · `tests/accounts-empty-state.test.tsx`

**Interfaces:**
- Consumes: `useAccountTree` return type, `AccountsScreenView`, `GroupChip` from checkpoint 2; `useBooksAccess`
- Produces:
  - `AccountToolbar({ tree: ReturnType<typeof useAccountTree>; canWrite: boolean; isWide: boolean; onNew(): void })`
  - `AccountsEmptyState({ hasFilters: boolean; canWrite: boolean; onNew(): void; onClear(): void })`
  - Test ids: `account-search`, `account-filter-<group>`, `account-filter-button` (phone), `account-show-inactive`, `account-toggle-all`, `account-import-link`, `account-new-toolbar`, `account-empty-import`.

**Gates:** 1 · 2 (reference: `filtered-*`, `empty-*`, `no-match-*`; built URL: `/a/books/accounts`) · 3

**Spec:**
- "The screen shows a back link "All lists" (to `books/lists`), the title "Chart of Accounts", a toolbar, and the tree."
- "A parent row has a caret that expands or collapses its sub-accounts. All parents start expanded. A toolbar action expands or collapses all. Expanded state is local to the screen and resets on reload."
- "Search filters by name or number, case insensitive. A matching account keeps its ancestors visible and expanded. Filter chips: Assets, Liabilities, Equity, Income, Expenses (one active at a time, or none for all) and a "Show inactive" toggle (off by default). Inactive accounts show dimmed with an "Inactive" label when shown."
- "Empty state (no accounts): message "No accounts yet" with a New account button for writers and an Import from CSV link. When a search or filter matches nothing: "No accounts match" with a Clear filters button."
- "Phone: each account is a card (name and number, balance, type and detail type below), indented by level, with the same caret, tap and menu. The toolbar collapses to a search field and a filter button. New account is a button in the header, not a FAB (the shell owns the FAB)."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/account-toolbar.test.tsx` — typing in the search field calls `setQuery`; pressing a group chip calls `setGroup` with that group and pressing the active chip calls `setGroup('')`; the chips are Assets, Liabilities, Equity, Income, Expenses; the Show inactive toggle calls `setShowInactive`; the expand/collapse-all button calls `toggleAllCollapsed` and its label flips with `areAllCollapsed`; a writer sees New account and Import (link to `books/accounts/import`); a read-only user sees neither; on phone (`isWide: false`) the toolbar shows the search field and a filter button (`account-filter-button`) instead of the inline chips, and pressing it reveals the chips.
- `tests/accounts-empty-state.test.tsx` — no filters: "No accounts yet", a New account button and an "Import from CSV" link (`books/accounts/import`) for a writer; a read-only user sees the message with neither button nor link; `hasFilters`: "No accounts match" with a Clear filters button that calls `onClear`; the New account button calls `onNew`. A view test in the same file: `AccountsScreenView` with zero accounts shows the empty state and with a query that matches nothing shows the no-match state, both without the table.

**Do:**
1. `AccountToolbar`: search field, filter chips (one active at a time), "Show inactive" toggle (off by default), expand/collapse-all, then Import and New account for writers. On phone, the search field and a filter button; the chips open from the button in a core sheet or popover; New account stays in the header (checkpoint 2) and is not duplicated in the toolbar.
2. `AccountsEmptyState`: the two messages and their actions as in the tests.
3. Mount both in `AccountsScreenView`. The Import links point at the checkpoint 7 route and the gate-2 capture does not click them.
4. Run `pnpm exec tinycld-pkg check`, then capture the filtered, empty and no-match states.

### Checkpoint 4 — New and edit account panel

**Delivers:** tapping a row, New account, or Add sub-account opens the side panel (inline on wide, overlay on tablet, bottom overlay on phone) with the validated form, parent and detail-type rules, create, update, and Save and new.

**Files:**
- Create: `tinycld/books/lib/account-schema.ts`
- Create: `tinycld/books/hooks/useAccountUsage.ts`
- Create: `tinycld/books/hooks/useAccountForm.ts`
- Create: `tinycld/books/components/accounts/AccountPanel.tsx`
- Create: `tinycld/books/components/accounts/AccountPanelFields.tsx`
- Modify: `tinycld/books/components/accounts/AccountsScreenView.tsx` (render `AccountPanel` beside the list on wide)
- Modify: `tinycld/books/components/accounts/AccountTree.tsx` (table width follows the space left beside an inline panel; see gate 2 note)
- Test: `tests/account-schema.test.ts` · `tests/useAccountForm.test.tsx` · `tests/account-panel.test.tsx`

**Interfaces:**
- Consumes: `useAccountsPanelStore`, `PanelTarget`, `AccountRow` from checkpoint 2; `parentChoices`, `activeChildCount`, `typeLockMessage` from checkpoint 1; `ACCOUNT_TYPES`, `accountTypeDef`; `useBooksAccess`
- Produces:
  - `accountFormSchema` (zod) and `type AccountFormValues = z.infer<typeof accountFormSchema>` in `lib/account-schema.ts`; fields `name`, `number`, `type`, `detail_type`, `isSubAccount`, `parent`, `description`
  - `useAccountUsage(accountId: string | null, accounts: AccountRow[]): { lines: number; children: number; isReady: boolean }` (journal-line count by a grouped count query on `books_journal_lines` for this account; child count from `accounts`)
  - `useAccountForm(target: PanelTarget, accounts: AccountRow[]): { form: UseFormReturn<AccountFormValues>; isReadOnly: boolean; isEditing: boolean; typeLockReason: string | null; parentOptions: AccountRow[]; detailTypeOptions: { key: string; label: string }[]; save(): Promise<void>; saveAndNew(): Promise<void>; isSaving: boolean }`
  - `AccountPanel({ isWide: boolean; isTablet: boolean })` reads the panel store itself; the form inside is keyed by the target (`new:<parentId>` or `edit:<id>`) so it resets when the target changes

**Gates:** 1 · 2 (reference: `panel-open-*`; built URL: `/a/books/accounts`; gate-2 note below) · 3

**Gate 2 note:** the reference `panel-open-1280-*` has a known flaw: with the panel open the Balance column scrolls off screen because the mockup table has a fixed 960 minimum width. The built wide layout must NOT copy that. With the inline `Drawer` open at 1280 wide, Name, Type, Balance and the row-menu cell must all be visible without horizontal scrolling; Detail type shrinks and truncates first. The critique compares the built screen to the reference everywhere except this.

**Spec:**
- "Tapping a row opens the account panel (edit for writers, read-only view for read-only users). (Q8)"
- "Opens in a core `Drawer` from the right (a bottom-anchored overlay on phones, an inline panel beside the list on wide screens, an overlay on tablets). (Q9)"
- "Fields: Account name (required), Account number (optional), Account type (select), Detail type (select, disabled until a type is chosen, options from the type), "Make this a sub-account" toggle that reveals a Parent account select, Description."
- "The parent select lists only accounts of the chosen type that would not exceed depth 5, excluding the account being edited and its descendants. Changing the type clears the parent and the detail type."
- "Sticky bar: Cancel, Save, Save and new (create only)."
- "Validation is one zod schema through `useForm` and `zodResolver` (`@tinycld/core/ui/form`): name required and at most 200 characters, number at most 20 characters matching `^[0-9A-Za-z.-]*$`, type and detail type required and a valid pair, description at most 1000 characters. Server refusals (duplicate number, duplicate name under the same parent, depth, type mismatch, inactive rules) go through `handleMutationErrorsWithForm`. (Q4)"
- "Edit rules shown before the server refuses: type is disabled when the account has journal lines or sub-accounts, with the server's reason as help text. Currency is never shown as editable."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/account-schema.test.ts` — name is required and fails above 200 characters; number accepts `1000`, `1000.10`, `A-1` and fails on `10 00`, on `#1` and above 20 characters; type is required; detail type is required (blank gives an error on `detail_type`); a detail type that does not belong to the chosen type fails with an error on `detail_type`; description fails above 1000 characters; `isSubAccount: true` with an empty `parent` fails with an error on `parent`.
- `tests/useAccountForm.test.tsx` (real local-only collections) — a `new` target gives blank defaults and `isEditing` false; a `new` target with `parentId` pre-fills `isSubAccount` true, `parent` and `type` from that parent; changing `type` clears `parent` and `detail_type`; turning `isSubAccount` off clears `parent`; `detailTypeOptions` is empty until a type is chosen and then equals that type's detail types; `parentOptions` equals `parentChoices` for the chosen type and excludes the edited account and its descendants; an `edit` target of an account with sub-accounts gives `typeLockReason` equal to `typeLockMessage({ lines: 0, children: n })`; an account with journal lines gives the line message with the count; a read-only user has `isReadOnly` true and `save` writes nothing; `save` on a valid new account inserts exactly one `books_accounts` row with no `currency` field; `save` on an edit target calls update with only the form fields; re-rendering with a different edit target (row A then row B) resets the form to row B's values; a server duplicate-number refusal sets an error on `number` rather than throwing.
- `tests/account-panel.test.tsx` — `AccountPanel` renders inline on wide, overlay on tablet and a bottom-anchored overlay on phone; it renders nothing when the store target is null; the Detail type select is disabled until a type is chosen; the Type select is disabled with the `typeLockReason` text as help text; choosing the sub-account toggle reveals the Parent account select; currency is never rendered (no text "Currency", no input named `currency`); Cancel closes the panel; Save on a valid form closes it; Save and new on a valid form saves, clears the fields and keeps the panel open, and exists only for `new` targets; for a read-only user the fields are disabled and only a Close button is shown; validation errors render through `FormErrorSummary`.

**Do:**
1. `lib/account-schema.ts`: one zod object. `.superRefine` checks that `detail_type` belongs to `accountTypeDef(type)?.detailTypes`. `.refine` requires `parent` when `isSubAccount`. Number regex is `^[0-9A-Za-z.-]*$`.
2. `useAccountUsage`: `useLiveQuery` on `books_journal_lines` filtered to the account, `groupBy` the account, selecting `count`. `children` counts every account whose `parent` is this account, active or not.
3. `useAccountForm`: `useForm({ resolver: zodResolver(accountFormSchema), defaultValues })` from `@tinycld/core/ui/form`. For `edit`, defaults come from the row; for `new` with `parentId`, as the test states. `useMutation` generators: `yield accountsCollection.insert({ id: newRecordId(), ... })` for create (no `currency`), `yield accountsCollection.update(id, ...)` for edit. `onError: handleMutationErrorsWithForm({ setError, getValues })`. The type and sub-account handlers clear dependent fields inside their own `onChange` handlers (event handlers, not effects).
4. `AccountPanelFields`: Account name, Account number, Account type select, Detail type select, "Make this a sub-account" toggle revealing the Parent account select, Description. Currency is never rendered. The type select shows `typeLockReason` as help text when locked.
5. `AccountPanel`: core `Drawer` from the right with `presentation="inline"` on wide and `"overlay"` on tablet; bottom-anchored overlay on phone. Sticky bar: Cancel, Save, Save and new (create only). Returns `null` when the target is null.
6. Screen wiring: the wide layout is a row of list (`flex-1`, `min-w-0`) and inline drawer (fixed 380 px). Make the table cells flex so Balance stays visible with the drawer open.
7. Run `pnpm exec tinycld-pkg check`; capture `/a/books/accounts` with a row opened.

### Checkpoint 5 — Row menu, delete, batch inactive

**Delivers:** the row menu and checkboxes on table and cards, the delete confirm dialog with block explanations, and Batch actions with Make inactive and a visible refusal message.

**Files:**
- Create: `tinycld/books/hooks/useAccountActions.ts`
- Create: `tinycld/books/hooks/useAccountSelection.ts`
- Create: `tinycld/books/hooks/useAccountsScreen.ts`
- Create: `tinycld/books/components/accounts/AccountRowMenu.tsx`
- Create: `tinycld/books/components/accounts/DeleteAccountDialog.tsx`
- Create: `tinycld/books/components/accounts/BatchActions.tsx`
- Create: `tinycld/books/components/accounts/AccountsErrorBanner.tsx`
- Modify: `tinycld/books/components/accounts/AccountTree.tsx` — new props `AccountTree({ rows, sort, onSort, onToggle, onOpen, canWrite, isSelected, onSelect, menu })`
- Modify: `tinycld/books/components/accounts/AccountRow.tsx` — same added props per row (checkbox cell and trailing menu cell)
- Modify: `tinycld/books/components/accounts/AccountCard.tsx` — `AccountCard({ row, onToggle, onOpen, canWrite, isSelected, onSelect, menu })`: a checkbox and the same menu as the table
- Modify: `tinycld/books/components/accounts/AccountToolbar.tsx` — new props `selectedCount: number; onMakeInactive(): void`; mounts `BatchActions` (on phone it is an icon button beside the filter button)
- Modify: `tinycld/books/components/accounts/AccountsScreenView.tsx` — takes the result of `useAccountsScreen` and mounts `DeleteAccountDialog` and `AccountsErrorBanner`
- Modify: `tinycld/books/screens/accounts/index.tsx` — wrapper calls `useAccountsScreen()`
- Test: `tests/useAccountActions.test.tsx` · `tests/account-menu.test.tsx` · `tests/delete-account-dialog.test.tsx` · `tests/account-selection.test.tsx`

**Interfaces:**
- Consumes: `useAccountsPanelStore` (`openEdit`, `openSubAccount`), `AccountRow`, `useAccountTree`, `useAccountsQuery`, `useAccountUsage`; `useBooksAccess` (the server refusal text is shown as received)
- Produces:
  - `type AccountMenuHandlers = { onEdit(id: string): void; onAddSub(id: string): void; onToggleInactive(row: AccountRow): void; onDelete(id: string): void }`
  - `useAccountActions(): { setInactive(ids: string[], inactive: boolean): Promise<void>; deleteAccount(id: string): Promise<void>; isWorking: boolean; actionError: string | null; clearActionError(): void }` — `actionError` is the one shared error path. A single refusal sets it to the server message. A batch stops at the first refusal and sets it to `N of M made inactive. <server message>`.
  - `useAccountSelection(): { selectedIds: ReadonlySet<string>; isSelected(id: string): boolean; toggle(id: string): void; clear(): void }`
  - `useAccountsScreen(): { tree: ReturnType<typeof useAccountTree>; isReady: boolean; canWrite: boolean; selection: ReturnType<typeof useAccountSelection>; menu: AccountMenuHandlers; makeSelectedInactive(): Promise<void>; deleteTargetId: string | null; cancelDelete(): void; actionError: string | null; clearActionError(): void; onNew(): void; onOpen(id: string): void }` — the owning hook of selection state, menu callbacks and the delete-dialog target (`deleteTargetId` is local `useState`).
  - `AccountRowMenu({ row: AccountRow; menu: AccountMenuHandlers })`, `DeleteAccountDialog({ account: AccountRow | null; accounts: AccountRow[]; onClose(): void })`, `BatchActions({ selectedCount: number; onMakeInactive(): void })`, `AccountsErrorBanner({ message: string | null; onDismiss(): void })`
  - Add sub-account (`menu.onAddSub`) is where the checkpoint 4 `parentId` prefill becomes reachable.

**Gates:** 1 · 2 (reference: `populated-*` for the checked row and menu cell, `panel-open-*`; built URL: `/a/books/accounts`) · 3

**Spec:**
- "The row menu has: Edit, Add sub-account, Make inactive or Make active, Delete. A read-only user has no menu and no New account button. Writers are bookkeeper and admin (`useBooksAccess().canWrite`)."
- "Batch: a checkbox column selects rows. "Batch actions" has one action, "Make inactive". It is disabled when no row is selected. Selecting a parent does not select its children."
- "Phone: each account is a card (name and number, balance, type and detail type below), indented by level, with the same caret, tap and menu. The toolbar collapses to a search field and a filter button. New account is a button in the header, not a FAB (the shell owns the FAB)."
- "Make inactive is refused by the server while active sub-accounts exist; the message names the count."
- "Delete opens a confirm dialog. The dialog reads one journal line for the account (`useLiveQuery`, limit 1) and its sub-accounts. If either exists, the dialog explains why delete is blocked ("This account is used on journal lines" or "This account has sub-accounts") and offers Make inactive instead. Otherwise Delete runs through `useMutation`. The server stays the authority and its refusal message is shown if it differs. (Q6)"

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/useAccountActions.test.tsx` (real local-only collections) — `setInactive(['a'], true)` updates one row's `inactive`; with three ids the updates run sequentially; when the second update is refused by the server with "Make the 2 active sub-accounts inactive first." the third is never attempted and `actionError` equals "1 of 3 made inactive. Make the 2 active sub-accounts inactive first."; a single refusal sets `actionError` to the server text; `clearActionError` clears it; `deleteAccount` removes the row when allowed and sets `actionError` to the server message when refused.
- `tests/account-menu.test.tsx` — a writer's `AccountRowMenu` lists Edit, Add sub-account, Make inactive, Delete; pressing Edit calls `menu.onEdit(id)`, Add sub-account calls `menu.onAddSub(id)`, Make inactive calls `menu.onToggleInactive(row)`, Delete calls `menu.onDelete(id)`; an inactive row shows Make active instead; a read-only user's `AccountTree` and `AccountCard` render no menu and no checkbox; on `AccountCard` a writer sees the same checkbox and menu as the table row and pressing the checkbox calls `onSelect`; `AccountsErrorBanner` renders the message and dismisses; `BatchActions` Make inactive is disabled at `selectedCount` 0 and enabled at 1; `AccountToolbar` shows Batch actions for a writer only.
- `tests/delete-account-dialog.test.tsx` — an account with journal lines shows "This account is used on journal lines" and a Make inactive button and no Delete button; an account with sub-accounts shows "This account has sub-accounts" and a Make inactive button; a free account shows a Delete button; while `useAccountUsage` is not ready no Delete button is shown; pressing Make inactive in a blocked dialog calls `setInactive([id], true)`; when `actionError` is set the dialog renders it.
- `tests/account-selection.test.tsx` — `toggle` adds and removes an id; `clear` empties; toggling a parent id does not add its children; `makeSelectedInactive` from `useAccountsScreen` calls `setInactive` with exactly the selected ids and clears the selection on full success but keeps it when a refusal sets `actionError`.

**Do:**
1. `useAccountActions`: `useMutation` generators against `books_accounts`: `update` for inactive and `delete` for removal, one Transaction per id yielded in order; `onError` stores the server `error.message` in `actionError`; no `console.*`. Keep the logic in plain functions that take the collection so tests pass a local-only collection.
2. `AccountRowMenu`: core `menu` component, always-visible icon button. Returns `null` when `!canWrite`.
3. `DeleteAccountDialog`: core `ConfirmDialog` (`isDestructive`). Uses `useAccountUsage`; when blocked, shows the reason and a Make inactive action; otherwise Delete runs `deleteAccount`. Renders `actionError` in the body. Returns `null` when `account` is null.
4. `AccountsErrorBanner`: a dismissible banner at the top of the list showing `actionError`; used for row-menu Make inactive and for Batch.
5. `useAccountsScreen` composes `useAccountsQuery`, `useAccountTree`, `useAccountSelection`, `useAccountActions`, the panel store and `useBooksAccess`, and builds `menu`. Update the table, row, card, toolbar and view prop signatures as listed under Modify.
6. Run `pnpm exec tinycld-pkg check`.

### Checkpoint 6 — CSV parsing and import validation

**Delivers:** pure functions that parse a CSV, auto-match its columns, and compute each row's Ready, Skipped or Error status before any write.

**Files:**
- Create: `tinycld/books/lib/csv.ts`
- Create: `tinycld/books/lib/account-import.ts`
- Test: `tests/csv.test.ts` · `tests/account-import.test.ts`

**Interfaces:**
- Consumes: `ACCOUNT_TYPES`, `accountTypeDef` from `lib/account-types.ts`; `accountPath`, `maxAccountDepth`, `TreeAccount` from `lib/account-tree.ts` (checkpoint 1)
- Produces:
  - `csvLimits: { maxRows: 2000; maxBytes: 1048576 }`, `parseCsv(text: string): { header: string[]; rows: string[][] }`, `checkCsvLimits(sizeBytes: number | undefined, rowCount: number): string | null` (an error message or null; an undefined size skips the byte check)
  - `type ImportField = 'number' | 'name' | 'type' | 'detail_type' | 'parent' | 'description' | 'inactive'`; `IMPORT_FIELDS: { field: ImportField; label: string; required: boolean }[]` (Name and Type required); `type ColumnMap = Record<ImportField, number | null>`
  - `autoMatchColumns(header: string[]): ColumnMap`
  - `type ExistingAccount = { id: string; name: string; number: string; type: string; parent: string }`
  - `type ImportRow = { line: number; status: 'ready' | 'skipped' | 'error'; reason: string | null; name: string; number: string; type: string; detail_type: string; parentPath: string; description: string; inactive: boolean }`
  - `buildImportPreview(input: { rows: string[][]; columnMap: ColumnMap; existing: readonly ExistingAccount[] }): ImportRow[]`
  - `orderForInsert(rows: ImportRow[]): ImportRow[]` (ready rows only, parents before children)
  - `importExampleCsv: string`

**Gates:** 1 · 3 (nothing renders)

**Spec:**
- "Step 2 Map columns: each of Number, Name, Type, Detail type, Parent, Description, Inactive maps to a file column by a select. Columns are auto-matched by header text (case and punctuation insensitive). Name and Type must be mapped. Type and Detail type cells match an account type or detail type by label or key, case insensitive. Parent matches an existing or imported account by full "Parent:Child" path, or by bare name when exactly one account has that name; a bare name that matches several accounts is an error ("ambiguous parent"). Inactive accepts yes/no/true/false/1/0."
- "Step 3 Import: a preview table shows every row with a status (Ready, Skipped: already exists, Error: reason). Errors are computed before any write: unknown type, detail type not valid for the type, parent not found, parent type differs, depth over 5, duplicate number in the file or against existing accounts, duplicate name under one parent, blank name. The Import button is enabled when at least one row is Ready; error rows are never imported."
- "Imported balances are not supported; opening balances are the `p1-opening-balances` unit."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/csv.test.ts` — quoted fields containing commas and doubled quotes, CRLF and LF line ends, a leading BOM, a quoted field with an embedded newline, blank trailing lines dropped; `parseCsv('')` has an empty header; `checkCsvLimits(1048577, 1)` and `checkCsvLimits(10, 2001)` return a message, `checkCsvLimits(1048576, 2000)` returns null, `checkCsvLimits(undefined, 5)` returns null.
- `tests/account-import.test.ts` — one test per rule below, each asserting `status` and `reason`:
  - `autoMatchColumns(['Account #', 'Account Name', 'TYPE', 'Detail Type', 'Parent', 'Notes'])` maps number, name, type, detail_type, parent (case and punctuation insensitive) and leaves description and inactive null.
  - Type and Detail type match by label or key, case insensitive. Blank Type is Error "type required". Blank or unmapped Detail type is Error "detail type required". Unknown type, and detail type not valid for the type, are Errors. Blank or unmapped Inactive is false; yes/no/true/false/1/0 are accepted; any other value is an Error.
  - Blank name is an Error.
  - Parent resolution: matches an existing account by full `Parent:Child` path, an imported account by path, a bare name that matches exactly one account; a bare name matching two gives Error "ambiguous parent"; no match gives Error "parent not found"; a parent of a different type is an Error; a result deeper than 5 (1-based, top-level = 1) is an Error.
  - A child whose imported parent row is an Error is an Error "parent row has an error". A child whose imported parent row is Skipped resolves to the existing account (it can be Ready and its `parentPath` is the existing account's path). Rows that name each other (or themselves) as parent are all Errors "parent cycle".
  - Precedence for a valid row: a row whose (parent, name) already exists is Skipped "already exists" even when its number also duplicates an existing account's number. A row whose (parent, name) repeats an earlier row in the file is an Error on the later row. Duplicate number within the file is an Error on the later row; duplicate number against an existing account (with a different name) is an Error.
  - `orderForInsert` excludes Error and Skipped rows and puts a parent before its child even when the file lists the child first.
  - `importExampleCsv` parses with `parseCsv`, auto-matches every column, and every row is Ready against an empty chart.

**Do:**
1. `lib/csv.ts`: a single-pass state-machine parser (no regex split). Strip a leading BOM. The header is the first non-empty record.
2. `autoMatchColumns` normalizes with `toLowerCase().replace(/[^a-z0-9]/g, '')` and matches synonyms per field (`number`: `number`, `no`, `accountnumber`, `accountno`, `acct`; `name`: `name`, `accountname`; `type`: `type`, `accounttype`; `detail_type`: `detailtype`, `subtype`; `parent`: `parent`, `parentaccount`; `description`: `description`, `notes`; `inactive`: `inactive`, `isinactive`).
3. `buildImportPreview` evaluates each row in this order and stops at the first failure: name, type, detail type, inactive; parent resolution (ambiguous, not found, parent row error, cycle, type mismatch, depth); then (parent, name) exists in `existing` gives Skipped; then repeated (parent, name) in the file; then duplicate number in the file; then duplicate number against `existing`. Resolve a parent that is a Skipped file row to the existing account. Detect cycles by following parent paths among file rows. `line` is the 1-based data row number.
4. `orderForInsert`: stable order by parent depth.
5. Run `pnpm exec tinycld-pkg check`.

### Checkpoint 7 — Import screens, e2e, help, nav

**Delivers:** the three-step import at `/a/books/accounts/import`, the sidebar entry and Lists card turned on, an e2e that drives the feature, and the in-app help topic.

**Files:**
- Create: `tinycld/books/screens/accounts/import.tsx` (thin wrapper)
- Create: `tinycld/books/hooks/useAccountImport.ts`
- Create: `tinycld/books/components/accounts/import/ImportView.tsx`
- Create: `tinycld/books/components/accounts/import/ImportSteps.tsx`
- Create: `tinycld/books/components/accounts/import/UploadStep.tsx`
- Create: `tinycld/books/components/accounts/import/MapStep.tsx`
- Create: `tinycld/books/components/accounts/import/PreviewStep.tsx`
- Create: `tinycld/books/components/accounts/import/ImportSummary.tsx`
- Create: `help/chart-of-accounts.md`
- Modify: `help/navigating-books.md` (link to `[Chart of Accounts](help://books:chart-of-accounts)`)
- Modify: `tinycld/books/lib/shell-nav.ts` (`available: true` on the `accounts` entry in `SIDEBAR_ENTRIES` and `LIST_ENTRIES`)
- Modify: `tests/shell-nav.test.ts` (the two registry assertions now expect `true`)
- Modify: `tests/e2e/books-shell.spec.ts` (the Lists hub is no longer empty: replace the `No lists yet` assertion with the Accounts card `books-list-card-accounts`)
- Test: `tests/useAccountImport.test.tsx` · `tests/account-import-view.test.tsx` · `tests/e2e/chart-of-accounts.spec.ts`

**Interfaces:**
- Consumes: `parseCsv`, `checkCsvLimits`, `autoMatchColumns`, `buildImportPreview`, `orderForInsert`, `importExampleCsv`, `ColumnMap`, `ImportRow`, `ImportField`, `ExistingAccount`, `IMPORT_FIELDS` from checkpoint 6; `useBooksAccess`; `useAccountsQuery` from checkpoint 2
- Produces:
  - `useAccountImport(existing: ExistingAccount[]): { step: 1 | 2 | 3 | 4; fileError: string | null; header: string[]; columnMap: ColumnMap; setColumn(field: ImportField, index: number | null): void; canContinueFromMap: boolean; preview: ImportRow[]; readyCount: number; chooseFile(file: File | { uri: string; name: string; size?: number }): Promise<void>; goToMap(): void; goToPreview(): void; runImport(): Promise<void>; progress: { done: number; total: number } | null; failure: { line: number; name: string; message: string } | null; result: { created: number; skipped: number } | null; reset(): void }`
  - `ImportView({ canWrite: boolean; isReady: boolean; flow: ReturnType<typeof useAccountImport> })`
  - Test ids: `account-import-file`, `account-import-drop`, `account-import-copy-example`, `account-import-next`, `account-import-run`, `account-import-done`.

**Gates:** 1 · 2 (reference: `import-upload-*`, `import-map-*`, `import-preview-*`; built URL: `/a/books/accounts/import`) · 3

**Spec:**
- "Entry points: "Import" in the toolbar and the empty state. Route `/a/books/accounts/import`. Writers only; a read-only user sees a "You need bookkeeper access" message."
- "Step 1 Upload: pick a CSV file (document picker on native, file input on web; drag and drop onto the area on web, see Platform notes). Rules shown: one file, header row required, UTF-8. An inline example table with a Copy example button replaces "download a sample file". Maximum 2000 rows and 1 MB."
- "Step 2 Map columns: each of Number, Name, Type, Detail type, Parent, Description, Inactive maps to a file column by a select. Columns are auto-matched by header text (case and punctuation insensitive). Name and Type must be mapped. Type and Detail type cells match an account type or detail type by label or key, case insensitive. Parent matches an existing or imported account by full "Parent:Child" path, or by bare name when exactly one account has that name; a bare name that matches several accounts is an error ("ambiguous parent"). Inactive accepts yes/no/true/false/1/0."
- "Step 3 Import: a preview table shows every row with a status (Ready, Skipped: already exists, Error: reason). Errors are computed before any write: unknown type, detail type not valid for the type, parent not found, parent type differs, depth over 5, duplicate number in the file or against existing accounts, duplicate name under one parent, blank name. The Import button is enabled when at least one row is Ready; error rows are never imported."
- "Writing: Ready rows are inserted parents first through `useMutation` (one `Transaction` per row, yielded sequentially). A row whose (parent, name) already exists is skipped, so re-running an interrupted import is safe. On the first server refusal the import stops and shows "N of M imported" with the refused row and the server message. (Q5)"
- "On success: a summary (created, skipped) and a button back to the Chart of Accounts."
- "Imported balances are not supported; opening balances are the `p1-opening-balances` unit."
- "A user with level none sees nothing from Books already (shell). A read-only user sees the list and the read-only panel."
- "`accounts` sidebar entry and Lists card become available."
- "Every account appears under its parent. Top-level accounts have no parent. Nesting is at most 5 levels (server limit)."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/useAccountImport.test.tsx` (real local-only collections) — `chooseFile` with a valid CSV moves to step 2 with `columnMap` auto-matched; a file over 1 MB sets `fileError` and stays on step 1; a header-only file sets `fileError`; with Type unmapped `canContinueFromMap` is false and `goToPreview` does nothing; same for Name; `readyCount` counts only Ready rows; `runImport` inserts parents before children, one `books_accounts` insert per Ready row yielded sequentially, never inserts Error or Skipped rows, and ends with `result.created` equal to the ready count and `step` 4; a child of an imported parent gets the parent's new id as `parent`; when the second insert is refused, the run stops, `progress` reads `{ done: 1, total: n }` and `failure` carries the refused line, name and the server message; running again after that partial import returns the already-created rows as Skipped "already exists" (this relies on Skipped winning over duplicate-number) and imports only the rest.
- `tests/account-import-view.test.tsx` — `UploadStep` shows the rules (one file, header row required, UTF-8, 2000 rows and 1 MB), the example table, the note "Imported balances are not supported", and a Copy example button that writes `importExampleCsv` to the clipboard; `MapStep` shows seven selects with Name and Type marked required, and the Next button (`account-import-next`) is disabled while Type is unmapped; `PreviewStep` renders a status per row ("Ready", "Skipped: already exists", "Error: …") and disables Import when there are zero Ready rows; while running it shows "N of M imported"; on failure it shows "N of M imported" with the refused row and the server message; `ImportSummary` shows created and skipped counts and a button back to the Chart of Accounts (`books/accounts`); for `canWrite: false` the view shows "You need bookkeeper access" and none of the steps.
- `tests/e2e/chart-of-accounts.spec.ts` — `test.describe('chart-of-accounts: list, edit and import', …)`. After `login(page)` and `navigateToPackage(page, 'books')`, click the Chart of Accounts sidebar item (`books-nav-accounts`) and assert the back link "All lists" and the title; assert the seeded `Software Subscriptions` row with `Design Tools` beneath it; collapse the parent with its caret and assert the child is hidden and "incl. sub-accounts" is shown; search `rent` and assert only matching rows; clear filters; toggle Show inactive and assert `Old Petty Cash` appears with the text "Inactive"; click a row and assert the side panel opens with that account's name, then Cancel; open New account, fill name, type and detail type, Save, and assert the new row; open that row's menu, Make inactive, and assert it disappears; open the menu on `Business Checking`, choose Delete and assert the blocked message and no Delete button; create an account then delete it through the dialog; open Import from the toolbar, upload a three-row CSV (one parent, one child, one row that duplicates an existing account) with `setInputFiles` on `account-import-file`, check the map, check the preview shows two Ready and one Skipped, run the import, assert the summary reads 2 created and 1 skipped, go back and assert the new rows in the tree. Every data change goes through the UI; no raw PocketBase writes, no `page.goto` after login. The seed has no read-only Books member, so the read-only paths (no New button, no menu, no checkboxes, read-only panel, access message) are covered by the unit tests of checkpoints 2 to 5 and this checkpoint, not by e2e.

**Do:**
1. `shell-nav.ts`: set `available: true` for the `accounts` entries; update `tests/shell-nav.test.ts` and `tests/e2e/books-shell.spec.ts` as listed so no unrelated test fails.
2. `useAccountImport`: step state in `useState` (local, synchronous). `chooseFile` reads the text with `file.text()` on web and, on native, `new File(uri).text()` using `File` from `expo-file-system` (57.0.7: `File` implements `Blob`, `text(): Promise<string>`); apply `checkCsvLimits` (size may be undefined on native) before parsing. `preview` is derived during render from `parseCsv` output, `columnMap` and `existing` — no effect. `runImport`: `orderForInsert(preview)`, then a `useMutation` generator that, for each row, resolves `parent` to the id of an existing or already-created account (keep a path-to-id map as rows are created), `yield accountsCollection.insert({ id: newRecordId(), ... })` one at a time, and on a thrown server error records `failure` and stops. Keep the insert loop in a plain function that takes the collection so tests pass a local-only collection.
3. `UploadStep`: Choose file button opens `expo-document-picker` on native and a hidden `<input type="file" accept=".csv,text/csv">` on web; wrap in core `DropZone` (`isEnabled` on web; it is a no-op on native). Show the rules, the inline example table from `importExampleCsv` with a Copy example button (`expo-clipboard`), and the note that imported balances are not supported.
4. `MapStep`: seven selects driven by `IMPORT_FIELDS`, auto-matched, Name and Type required before Next.
5. `PreviewStep`: table of every row with its status; Import `account-import-run` enabled when `readyCount > 0`; progress and failure displays as in the tests.
6. `ImportSummary`: created and skipped counts and a button back to `books/accounts`.
7. `ImportView` and `screens/accounts/import.tsx`: a step indicator following the `import-*` references; gate on `canWrite`, showing "You need bookkeeper access" otherwise; `LoadingState` until access is ready.
8. `help/chart-of-accounts.md` with frontmatter `title`, `summary`, `order`; task-oriented prose covering reading the tree, adding and editing, making inactive, deleting, and importing from CSV. Link it from `help/navigating-books.md`. Run `cd ~/code/tinycld/tinycld && pnpm run packages:generate`.
9. Run `pnpm exec tinycld-pkg check` and `pnpm exec tinycld-pkg test:e2e -- -g "chart-of-accounts:"`.
