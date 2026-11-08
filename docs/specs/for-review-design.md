# For review queue — design

Status: approved at the design gate, 2026-11-07 (auto-helix unit p4-for-review), direction A (tabs in the account panel, details in a drawer). Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Banking: CSV/OFX import, For review / Reviewed / Excluded tabs, match / categorize / split / exclude"; "in-app help for every feature") and §Interface ("Every list uses one pattern: search, filter chips, status chips, sortable columns, row menus, batch actions … cards on phones"). Builds on `books/docs/specs/bank-connection-design.md` (the account panel is where the review tabs go) and `books/docs/specs/bank-import-mapping-design.md` (the import writes `books_bank_transactions` with status `for_review`). Built against books main@ad6509d, core main@796d81c8.

### Decisions of the design gate

1. Exclude and Move to For review (status only, nothing posts) are built in this unit. p4-categorize-split keeps categorize and split and adds its actions to this unit's drawer and selection bar.
2. The upload area and the file list move unchanged into a fourth tab, Files. The default tab is For review; `U` switches to Files; the existing banking e2e specs open the Files tab.
3. The `books_bank_transactions` update rule is added by editing `2100000008_create_books_banking.js` in place (Books 0.1.0 is unreleased).
4. Every account card shows "12 to review" and the For review tab shows the count; this loads every for-review row of every connection.
5. All three tabs sort only by date (newest / oldest first).
6. The Reviewed tab lists rows (date, description, Spent, Received) and shows the drawer facts, with no "Added as" column and no Undo; p4-match / p4-categorize-split add them.
7. Batch Exclude / Move updates the chosen rows through pbtsdb, 50 at a time in parallel, with no cap on the choice; no new endpoint, no action collection.
8. Search, Dates and Type are one set for the three transaction tabs and all accounts, kept while the Banking page stays mounted and reset when it loses focus.
9. Pressing a row opens a drawer (register placement), not an inline expansion.

## 1. Goal

A bookkeeper sees the imported bank transactions of one bank or card account in three tabs — For review, Reviewed, Excluded — finds a transaction by date, direction or text, opens its details, and excludes transactions that do not belong in the books (or moves them back).

## 2. Where it lives

- The Banking page (`screens/banking/index.tsx`), inside the account panel of the selected connection (`BankAccountPanel`). No new route, no sidebar entry.
- The panel heading (account name, bank details, More menu) stays. Under it, a tab bar: **For review (12)** · **Reviewed** · **Excluded** · **Files**. The upload area and the file list of p4-bank-connection move into the Files tab unchanged (decision 2).
- The tab is in the URL: `books/banking?account=<connectionId>&tab=review|reviewed|excluded|files` (`router.setParams`). No `tab` param means For review.
- The page stops scrolling as one block: the header, the account strip, the panel heading and the tab bar stay put, and the tab's content fills the rest of the height (the transaction tabs scroll their own windowed list; the Files tab scrolls its own content). This is what lets a list of 10,000 rows window.
- Entry points from elsewhere:
  - The import result (`ImportResult`, p4-import-mapping) gains "Review transactions" (primary; "Back to Banking" becomes outline), which returns with `router.dismissTo(orgHref('books/banking?account=<connectionId>&tab=review'))`.
  - The account card (`BankAccountCard`) gains the line "12 to review" under "2 files waiting" (`text-sm text-foreground`; "Nothing to review" in `text-muted-foreground` at 0) (decision 4). Pressing the card selects it as now; the tab stays as it was.
- The account strip is one row at every width and never wraps (phase-3 reference: a wrapped strip, or the inline drawer narrowing the page, pushed the panel below the fold): wide, the full cards (280) in a horizontal `ScrollView`; on a phone, compact cards (240 wide: account label `text-sm font-semibold`, In Books balance `text-base font-semibold tabular-nums`, "12 to review" `text-xs`; no type, bank details, statement or files-waiting lines), as direction A's phone artboard drew them. The phone strip's auto-scroll to the selected card (`useStripScroll`) stays.

## 3. Behavior

### Words

- A **bank transaction** is one row of `books_bank_transactions`: what an import took from a bank file.
- **For review**: imported and not yet handled. **Reviewed**: handled by matching or categorizing (p4-match, p4-categorize-split set it). **Excluded**: kept out of the books on purpose; nothing posts.
- **Spent** is a negative amount (money out); **Received** a positive one (money in). On a credit card account the same words apply: a charge is Spent, a payment Received.

### The tab bar

- Core `SetupTabs` (`@tinycld/core/components/setup/wizard/SetupTabs`), test id `bank-tabs` (tabs `bank-tabs-review`, `-reviewed`, `-excluded`, `-files`).
- For review shows its count: "For review (12)"; "For review" at 0. Reviewed, Excluded and Files show no count. The count is every `for_review` transaction of the connection, not only the filtered ones.
- Pressing a tab sets `tab`; the chosen rows are cleared on every tab or account change, and the drawer closes.

### The toolbar (For review, Reviewed, Excluded)

- One row on wide, two rows on a phone (search on the first):
  - **Search** — the Books `ListToolbar` search field, placeholder "Search description, memo, check no. or amount", test id `bank-review-search`. A search runs after the user stops typing for 250 ms (`SEARCH_DELAY_MS`). It matches when every piece of the text (`searchPieces`) is in the description, the memo or the check number (case ignored); when the whole text reads as an amount ("86.47", "$86.47", "-86.47", "1,250"), a transaction of that amount spent or received also matches.
  - **Dates** — core `PickMenu` (test id `bank-review-dates`, purpose "Dates"): "All dates" (default), "This month", "Last month", "This quarter", "This fiscal year", "Last fiscal year" (`RANGE_PRESETS` and `rangeForPreset` with the Books fiscal start month).
  - **Type** — core `PickMenu` (test id `bank-review-type`, purpose "Type"): "All transactions" (default), "Money in", "Money out".
- The search text and both filters are one set for the three transaction tabs and every account; they stay while the user switches tabs and accounts and while the Banking page stays mounted (banking UI store, not persisted). They reset when the Banking screen loses focus (lesson 5).
- When any filter or search is set, a "Clear filters" link (`text-primary`, 44 high) ends the toolbar row.

### The list (wide)

- Columns: check box · Date · Description · Spent · Received. Header cells are `ListHeaderCell`; header and rows share the cell style constants (check 44 fixed, Date 112 fixed, Description flex 1 with minWidth 240, Spent and Received 128 fixed, right aligned, `tabular-nums`). Table minimum width 720 (`useTableMinWidth`); below it the table scrolls sideways.
- Row height 56, fixed (windowed by `useRowWindow` through `ListTable`). Description on line one (one line, ellipsis, `text-sm text-foreground`); on line two, when present, the memo and "Check 1043" joined by " · " (`text-xs text-muted-foreground`, one line, ellipsis).
- Dates read "Sep 30, 2026" (`formatDay`). Amounts are money without a sign in their column (`formatMoney`, `text-foreground`); the other column is empty.
- Order: by date, newest first, then by file line, then id. The Date header toggles newest/oldest first (arrow icon as in the register, accessibility label "Sort by date"). No other column sorts (Cut).
- Reviewed has no check box column (nothing to batch in this unit) and no extra column in this unit; p4-match and p4-categorize-split add an "Added as" column and Undo (decision 6).

### The list (phone)

- Cards (`ListCards`), 72 high: check box · a two-line block (description, one line; "Sep 30, 2026 · Check 1043" in `text-xs text-muted-foreground`) · the amount on the right, signed ("-$86.47" for Spent, "$4,250.00" for Received), `tabular-nums`.
- Above the cards, a bar with the select-all box and "Select all" (For review and Excluded, writers only), and the date order toggle "Newest first" / "Oldest first".

### Choosing rows (For review and Excluded, writers only)

- Each row has a Books `SelectBox` (44 pt hit area). The header box (wide) or "Select all" (phone), labelled "Select all shown transactions", chooses every row the list shows under the current search and filters, or none when all are chosen; it is mixed when some are.
- With one or more rows chosen, a selection bar replaces the toolbar: "3 selected · Spent $412.30 · Received $0.00" (sums in integer cents, `formatMoney`), then the tab's batch button and "Clear" (outline):
  - For review: "Exclude" (outline, test id `bank-review-exclude`).
  - Excluded: "Move to For review" (outline, test id `bank-review-restore`).
- A row of the choice that leaves the list (another user's change arriving by realtime, or a new search that hides it) leaves the choice too, so the count and sums are always of rows on screen.

### The detail drawer

- Pressing a row (anywhere but its check box) opens the transaction in a core `Drawer` with the register's placement (`EntryDrawer`): inline on the right on wide desktop, an overlay from the right on a tablet, a sheet from the bottom on a phone. The open row is highlighted (`bg-accent`, as the register's open row; the phase-3 reference showed `bg-muted` as a dark slate band that hid the row's second line) and has `accessibilityState={{ selected: true }}`. Pressing another row shows that one; the close button or Esc closes it.
- Content (test id `bank-txn-drawer`), top to bottom:
  - The amount, large (`text-2xl font-semibold tabular-nums`), with "Spent" or "Received" under it in `text-muted-foreground`, and the status chip "For review" / "Reviewed" / "Excluded".
  - Fields as label/value rows: Date; Description (full, wraps); Memo (when present); Check no. (when present); Account ("1000 Business Checking"); From file ("oct-2026.csv, line 7"); Imported ("Nov 3, 2026 by Ana Ruiz", from the import row's `created` and `created_by`).
  - Actions (writers only, at the bottom of the drawer): For review: "Exclude" (outline, test id `bank-txn-exclude`); Excluded: "Move to For review" (outline, test id `bank-txn-restore`); Reviewed: none in this unit.
- After Exclude or Move to For review from the drawer, the drawer closes (the row has left the tab).
- A slot under the fields (`children`) is where p4-match and p4-categorize-split put their forms.

### Exclude and Move to For review (decision 1)

- Exclude sets the chosen transactions' `status` to `excluded`; Move to For review sets it back to `for_review`. Nothing posts and no journal entry changes.
- Each is a `useMutation` that updates the rows through pbtsdb `update`, 50 rows at a time in parallel, with no cap on the choice (decision 7); the batch returns `{ done, failed }`. While it runs, the batch button shows "Excluding…" / "Moving…" with core `ButtonSpinner`, and the check boxes, the batch buttons, the drawer action and the keys are disabled.
- Success: the rows leave the tab at once (optimistic), the choice clears, and a line under the toolbar reads "Excluded 3 transactions." / "Moved 3 transactions to For review." (`text-sm text-muted-foreground`, `accessibilityLiveRegion="polite"`) until the next action or tab change.
- Partial or full refusal: the failed rows stay chosen and back in the list (pbtsdb rolls each back), and the line reads, in `text-danger`, the server's message when every failure has the same one, otherwise "2 of 3 transactions could not be excluded. Try again." A transport failure logs `log.warn('books.banking', …)` and shows "The change could not be sent. Check your connection and try again."
- While the server cannot take writes, the batch buttons and the drawer actions are disabled (core `useServerActionState`, with its accessibility hint).

### Empty, loading, error and read-only states

- Loading (a tab's first load): core `LoadingState` in the tab body; the tab bar and the toolbar stay.
- Error: "Books could not load these transactions." with Retry, which calls `recoverLiveQueries` once over every failed query of the page (`mergeRecoveries`, added to the page's existing `onRetry`).
- Empty, nothing filtered:
  - For review, the account has files waiting: "Nothing to review. 2 files are waiting to import." and a core Button "Go to files" (opens the Files tab).
  - For review, no files waiting: "Nothing to review. Upload a statement and import it to see its transactions here." and "Go to files".
  - "Go to files" shows for writers only, in both cases (uploading and importing are writer actions); readers get the sentence only and can still open the Files tab from the tab bar.
  - Reviewed: "No reviewed transactions yet. A transaction moves here when you match or categorize it."
  - Excluded: "No excluded transactions. Exclude a transaction in For review to keep it out of your books."
- Empty under a search or filter: "No transactions match these filters." and a core Button "Clear filters".
- Read-only user: the tabs, toolbar, lists and drawer facts; no check boxes, no select-all, no selection bar, no drawer actions, no batch keys.

### Keyboard (web)

Registered with core `useRegisterShortcuts` in the Banking page's `list` scope while a transaction tab shows; each key only while its action is offered (core's ⇧? list ignores `when`), traced from every element that can hold focus (lesson 25):

- ↓ / J and ↑ / K — move the focused row (core `rowFocusStyle`); the first press focuses the first row.
- Space or X — choose / unchoose the focused row (writers, For review and Excluded).
- ↵ or O — open the focused row in the drawer.
- A — choose all shown rows, or none when all are chosen (writers, For review and Excluded).
- E — Exclude the chosen rows, or the drawer's transaction when none is chosen (For review, writers).
- R — Move the chosen rows, or the drawer's transaction, to For review (Excluded, writers).
- / — focus the search field.
- 1 · 2 · 3 · 4 — the For review · Reviewed · Excluded · Files tab.
- Esc — close the drawer; with the drawer closed, clear the choice.
- The page keys stay: N Connect account, U Choose file (now also switches to the Files tab so the upload progress shows), I Import transactions.
- The help topic lists every key with Mac glyphs.

## 4. Data

### Schema change (decision 3)

- `pb-migrations/2100000008_create_books_banking.js`, edited in place (Books is 0.1.0 and unreleased; earlier units edited this migration the same way): `books_bank_transactions` gains an `updateRule`:
  `${WRITE} && ${unset('connection', 'file', 'bank_import', 'line', 'date', 'description', 'memo', 'amount', 'fitid', 'check_number', 'dedupe_hash')} && ((status = "for_review" && @request.body.status = "excluded") || (status = "excluded" && @request.body.status = "for_review"))`.
  A writer can only move a row between For review and Excluded; a Reviewed row cannot be changed by a client. The header comment says so.
- No new collection or field. No new endpoint.
- Go: `books_bank_transactions` is added to the audited collections (`server/audit.go`), label "<date> <description>" (so an exclude shows in the audit log); `server/bank_rules_test.go` gains the rule cases (writer for_review→excluded and back, reader refused, reviewed refused, any other field refused).

### Reads (`useLiveQuery` with `{ query, queryKey }`)

- **Review counts** (extends `bankConnectionsQuery`, key unchanged): `books_bank_transactions` where `status = 'for_review'`, grouped by `connection`, `count(id)`, left-joined on the connection → `reviewCount`. This loads every for-review row of every connection (a work queue, at most one import's 10,000 rows each) (decision 4).
- **For review list** (key `books.review.queue`): `books_bank_transactions` where `connection = id`, `status = 'for_review'`, and the search/date/type clauses, ordered by `date` (direction from the toggle), `line`, `id`. Not paged: the counts query already holds these rows.
- **Reviewed / Excluded lists** (keys `books.review.reviewed`, `books.review.excluded`): `useLiveInfiniteQuery`, pages of `LIST_PAGE_SIZE`, same `where` with the tab's status, ordered by `date` then `id` (lexical, so TanStack builds the page cursor); `ListTable` / `ListCards` call `onNearEnd`.
- **Drawer** (key `books.review.txn`): the transaction by id (`findOne`) with `materialize()` of its file (`name`) and its import (`created`), and the importer's name through `materialize()` of `users` — one query.
- Where clauses come from one pure helper, `reviewWhere(filters, range)` in `lib/bank-review.ts`: `ilike` per search piece over description, memo and check_number (`or`), the amount clause `or(eq(amount, c), eq(amount, -c))` when the text reads as money (`parseSearchAmount`), `gte/lte(date, …)` for the range, `gt/lt(amount, 0)` for the type.

### Writes

- `books_bank_transactions` `update({ status })` through `useMutation` (generator), 50 parallel per step; outcome `{ done, failed }` (memory p1-chart-of-accounts).

### Client modules

- `lib/bank-review.ts`: `REVIEW_TABS`, `reviewTabFromParam`, `reviewWhere`, `parseSearchAmount`, `reviewCountText` ("12 to review" / "Nothing to review"), `selectionSummary(rows, chosen)`, `batchResultText(kind, outcome)`, `txnSourceText(fileName, line)`, `txnSecondLine(memo, checkNumber)`.
- `stores/banking-ui-store.ts` gains `reviewFilters` (search, preset, type), `dateOrder`, `chosen` (Set of ids), `openTxnId`, with their setters; `closeAll` clears the drawer and the choice, and the screen's focus effect resets the filters.
- `hooks/useReviewTab.ts` (one per tab body: query, view state, choice, batch mutation), `hooks/useReviewShortcuts.ts`, `lib/review-shortcuts.ts` (pure key map, as `banking-shortcuts.ts`).
- Components in `components/banking/review/`: `BankingTabs`, `ReviewToolbar`, `ReviewSelectionBar`, `ReviewTable`, `ReviewCards`, `ReviewRow`, `ReviewEmptyState`, `BankTxnDrawer`. `BankAccountPanel` renders the tab bar and the chosen tab's body; `BankingScreenView` changes from one `ScrollView` to a fixed column.

### Fixture and seed

- `lib/for-review-fixture.ts` is the data of the phase-3 scratch route only (the seed below is the data of the e2e book and the help screenshots), typed with `satisfies` against `BooksBankTransactions`, accounts named by `seed.ts` ACCOUNTS numbers (lesson 12): 1000 Business Checking — 34 for review over Aug–Oct 2026 (uneven per month), one 70-character description that must truncate, 8 with a memo, 4 with a check number, money in and out; 6 reviewed; 4 excluded. 2100 Company Card — 0 for review, 3 reviewed. 1010 Business Savings — no transactions, one file waiting.
- `seed.ts`: uploads one more CSV file to 1000 Business Checking and imports it as superuser (a `books_bank_imports` row, through the same Go hook) so the e2e book and help screenshots show a For review list; then updates four of its rows to `excluded`. The seed makes no `reviewed` rows (only p4-match and p4-categorize-split set that status), so the seeded Reviewed tab shows its empty state. The seeded `checking-2026-09.csv` stays `uploaded` (p4-import-mapping's specs rely on it).
  - Phase 4 change: the seed file is OFX (`checking-2026-10.ofx`, `REVIEW_SEED_STATEMENT` in the fixture, 12 lines, 4 excluded), not CSV, and the e2e files are OFX, because only the OFX parser (`server/bank_ofx.go`) fills `memo` and `check_number`. Read-only and load-error e2e read the seeded rows and write nothing.

### Help

- New topic `help/bank-review.md` ("Review bank transactions", tags banking, review, exclude): the three tabs and what each means, finding a transaction (search incl. amount, dates, type), the detail drawer, excluding and moving back (nothing posts), choosing many rows, who can do what, keyboard keys. `banking.md` and `bank-import.md` link to it; `banking.md` adds the Files tab and keys 1–4; `bank-import.md` mentions "Review transactions". Images through `help/screenshots.ts` before the image lines are added (lesson 31). `tests/help-bank-review.test.ts` as the other help tests.

### Tests the plan must carry

- Vitest: `reviewWhere` (each clause; pieces cut at `%`/`_`/`\`), `parseSearchAmount` ("86.47", "$1,250", "-86.47", "abc" → null, "1.234" → null), `selectionSummary`, `batchResultText` (all done, partial, all failed with one message, mixed messages), `reviewTabFromParam`, `reviewCountText`, the review key map. Go: the update rule cases above; the audit registration count (`registrations_test.go`).
- E2E `tests/e2e/for-review.spec.ts`, titles prefixed `for-review:`; each test uploads and imports its own small CSV through the UI with a per-run unique memo and finds its rows with the search (lessons 2, 3, 15):
  - Import → "Review transactions" lands on For review with the rows; the tab count and card count include them.
  - Search by memo, by amount; Dates and Type filters; Clear filters; the filtered empty state.
  - Open a row: drawer facts (file and line, importer); Exclude from the drawer; the row is on Excluded; Move to For review from the drawer.
  - Choose two rows, the selection sums; Exclude; "Excluded 2 transactions."; select-all + Move to For review on Excluded.
  - A refusal (`route.fulfill({ status: 400 })` on the PATCH) keeps the rows chosen and shows the message.
  - Read-only user: no check boxes, no actions.
  - Files tab: the upload area and file list as before; `u` switches to it.
  - Keyboard: J/K, X, ↵, A, E, R, /, 1–4, Esc.
  - Phone (390×844, navigate wide then resize): cards, select all bar, drawer as a sheet, Exclude.
  - A load error (`route.fulfill({ status: 400 })` on the transactions list) shows Retry.
  - Existing banking specs (`banking-page`, `banking-upload`, `banking-keys`, `bank-import-mapping`) open the Files tab where they used the file list.

## 5. Cut

- Match, "1 match found" badges and suggested matches — p4-match.
- Categorize, split and a payee per transaction; the "Category or match" column — p4-categorize-split.
- An "Added as" column and Undo on Reviewed — p4-match / p4-categorize-split, which know what to undo (decision 6).
- Bank rules and suggested categories — v1.1 ("bank rules").
- A Payee column — bank transactions carry no payee; categorize assigns one.
- Deleting an excluded transaction — a deleted row would be imported again by the next file (dedupe is by stored rows), and transactions have no delete rule.
- Sorting by description or amount — Reviewed and Excluded page by a lexical date cursor; search by amount finds a transaction by amount.
- One queue across all accounts — every list is the selected account's, as the rest of the panel.
- An Undo toast after Exclude — the Excluded tab with Move to For review is the undo.
- Reconciliation and "cleared" marks — p4-reconcile.

## 6. Platform notes

- None single-platform. Tabs, lists, cards, the drawer (core `Drawer`), `PickMenu`, `SelectBox` and the mutations run on web and native. Keys and focus styling are web only by nature, as on every Books screen.

## 7. Sparks carried

- Money out and money in in two right-aligned columns: "Spent" and "Received", `text-right tabular-nums text-foreground`, header `ListHeaderCell`, cell styles shared by header and rows; phone cards keep one signed amount.
- The tab that needs work says how much: core `SetupTabs`, only "For review (12)" carries a count; the account card says "12 to review".
- No core extension.

## 8. Non-goals

- No posting, no journal entry, no register or report change.
- No change to the import page beyond the "Review transactions" button, and no change to the parser, the dedupe rules or the import hook.
- No new endpoint and no new collection.
- No per-transaction notes or attachments.
