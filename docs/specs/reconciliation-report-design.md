# Reconciliation report and undo — design

Status: approved at the design gate 2026-11-22 — direction A; every open question of the packet took its recommended answer (Q1–Q18 as recorded in the packet, `docs/plans/reconciliation-report-ledger.md` Phase notes). The reconcile migration is now `2100000039_create_books_reconciliations.js` (main took 37 and 38); this unit's migration takes the next free number at build. (Auto-helix unit p4-reconciliation-report, feature `reconciliation-report`). Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Reconciliation (computed hints, saved report, admin undo of the latest)"; Reports: "reconciliation report"; "Every report, the statements included, is a published report of the core report engine"; "in-app help for every feature"); `docs/plans/books-quickbooks-fixes.md` ("An admin can undo the most recent reconciliation, with an audit trail."). Builds on `books/docs/specs/reconcile-design.md` (its Cut list sends the list of reconciled transactions, the history, the saved report, print and PDF, and the admin undo here). Built against books `books/p4-reconcile`@ebcaac5, core @76bedcb.

Direction A of the artboards (the history is a second tab of Reconcile).

## 1. Goal

A bookkeeper finds every finished reconciliation of the bank and credit card accounts, opens the saved report of one (what cleared, and how the beginning balance became the statement ending balance), gets it as a PDF, and a Books admin undoes the latest reconciliation of an account when it holds a mistake.

## 2. Where it lives

- `screens/reconcile/history.tsx` (route `books/reconcile/history`, optional `?account=<account id>`): the history. A static route beside `screens/reconcile/[id].tsx`.
- The accounts screen `books/reconcile` and the history show one tab row, **Accounts** · **History** (Books `ListTabs`, test id prefix `reconcile-tab`). A tab press replaces the route, so Back leaves Reconcile. The sidebar entry Reconcile stays selected on both.
- The finished summary `books/reconcile/<id>` (p4-reconcile) gains **View report**, a link to the account's history, and **Undo reconciliation**.
- The saved report is the shipped report **Reconciliation Report** of the core report engine (`books.reconciliation_report`). It opens in core's report view (`/a/reports/<report id>?p-statement=<reconciliation id>`), which has no Books sidebar, as every Books shipped report. It is also in the Reports hub of Books.
- `lib/shell-nav.ts`: the path `books/reconcile/history` is a list path, not a record path (the record pattern at line 226 must not match `history`).

## 3. Behavior

### Words

- A **finished** reconciliation, its **statement**, **cleared** and **reconciled** are the words of the reconcile spec §3.
- The **latest** reconciliation of an account is its finished reconciliation with the latest statement date.
- **Undo** returns the latest finished reconciliation of an account to In progress. Its transactions are again cleared, not reconciled.

### The history (`books/reconcile/history`)

- Title "Reconcile", the tab row with History selected, and one line: "Finished reconciliations, newest first."
- A toolbar with one filter: **Account** — core `PickMenu` (test id `reconcile-history-account`): "All accounts" (default), then each account that has a finished reconciliation, by account number ("1000 Business Checking"). `?account=<id>` sets it at the first mount. The choice is in `stores/reconcile-store.ts` (not persisted) and resets when the screen loses focus. A "Clear filter" link shows while an account is picked.
- A table (Books `ListTable`), one row for each finished reconciliation, ordered by statement date, newest first, then by account number. Columns: Statement ending ("Oct 31, 2026", minimum 130; its header sorts, a second press reverses) · Account ("1000 Business Checking", flex 2, minimum 180) · Ending balance (minimum 120, right aligned, `tabular-nums`, `formatMoney`, in the account's own sense) · Cleared ("4 transactions", minimum 120) · Reconciled ("Nov 21, 2026 · Ana Ruiz", flex 1, minimum 190, one line with an ellipsis) · the action (minimum 150, right aligned). Header and rows share exported cell style constants. The table's minimum width is the sum of its columns; below it the rows are cards. The table never scrolls sideways.
- The action cell holds the link **View report** (`text-primary`, test id `reconcile-history-report-<id>`) and, when the row has a menu item, a More menu (Books `RecordRowMenu`, test id `reconcile-history-more-<id>`) with **Undo reconciliation**. The menu item shows only for a Books admin, on the latest reconciliation of its account.
- A press on a row opens the finished summary `books/reconcile/<id>` (a push). The link opens the report.
- Below the table's minimum width, cards (`ListCards`), 76 high: line one "Oct 31, 2026" and, on the right, the ending balance; line two the account; line three "Reconciled Nov 21, 2026 by Ana Ruiz · 4 transactions" in `text-xs text-muted-foreground`, one line. On the right under the balance, a More menu (44 pt) with **View report** and, by the same rule as the table, **Undo reconciliation**. A press on the card opens the finished summary.
- Row height 44, fixed, windowed (`ListTable`). Not paged: an account has about 12 statements a year.
- Keys (web and iOS hardware keyboard, core `useRegisterShortcuts`, each only while its action is offered): ↓ / J and ↑ / K move the focused row (core `rowFocusStyle`); ↵ or O opens its summary; R opens its report.
- Loading: core `LoadingState` under the tab row. Error: "Books could not load the reconciliations." with Retry (`recoverLiveQueries` once over every failed query, `mergeRecoveries`). Empty: "No reconciliation is finished yet. A finished reconciliation shows here with its report." with a core Button "Go to Accounts". Empty under a filter (an account from `?account=` that has none): "1010 Business Savings has no finished reconciliation." with a core Button "Clear filter".
- Another user's finish or undo arrives by realtime.
- A read-only user and a bookkeeper see the history and the reports. Only an admin sees Undo.

### The accounts screen (`books/reconcile`)

- Gains the tab row, with Accounts selected. Nothing else changes: "Reconciled through Sep 30, 2026" still opens that finished summary.

### The finished summary (`books/reconcile/<id>`, finished)

- The summary block and its line "4 transactions of this statement are reconciled. They cannot be voided or changed." stay as p4-reconcile built them. "Finished Nov 21, 2026 by Ana Ruiz" reads the stamped name (§4), so it stays after that user is deleted.
- Buttons: **View report** (primary `ShortcutButton`, key R, test id `reconcile-view-report`; not drawn while the reader has no such report), **Reconcile another account** (now outline), **View register** (outline).
- Under the buttons, the link "All reconciliations of 1000 Business Checking" (test id `reconcile-history-link`) opens `books/reconcile/history?account=<account id>`.
- For a Books admin, when this is the latest reconciliation of its account, the header has a More menu (test id `reconcile-finished-more`) with **Undo reconciliation** (test id `reconcile-menu-undo`). On a phone the same menu is in the header.

### The Reconciliation Report (core report view)

- Opened by **View report**, with the Statement filter set to that reconciliation. The reader changes the statement in place with the filter; core's toolbar gives Export (Download PDF, Excel, CSV), Email and Link. "Download PDF" is the print path on web and native.
- Two filters:
  - **Account** — many of the bank and credit card accounts, by account number.
  - **Statement** — one finished reconciliation: its statement date, grouped by account.
  - With neither set, the report lists every finished reconciliation.
- One open section for each finished reconciliation, ordered by account number, then statement date, newest first. The section row reads "1000 Business Checking · reconciled by Ana Ruiz" and shows, in columns that only section rows fill, **Statement ending** (Oct 31, 2026) and **Reconciled on** (Nov 21, 2026, 3:04 PM, in the reader's time zone).
- Under the section row:
  - The opening row **Beginning balance** with the amount in the Balance column.
  - One row for each cleared transaction, by date, then posting order: Date · Transaction ("Expense 12") · Payee · Memo (the line's, else the entry's) · Debit · Credit · Balance (the beginning balance and every row down to this one, in the account's own sense: a debit raises a bank account's balance and lowers the amount owed on a credit card).
  - The section total: the Debit and Credit sums, and in Balance the statement ending balance.
- A row opens its transaction (`entryOpenPath()`, the Books detail surface of every report row).
- The report has no grand total in Balance (a sum of balances of several statements means nothing); Debit and Credit add.
- It lists only finished reconciliations. A reconciliation that is undone leaves the report; when it is finished again it is back, with the rows cleared then.
- It is a saved report by what it reads: the stamped rows of the finish and the journal lines, which cannot change while they are reconciled (reconcile spec §3 "When a cleared or reconciled transaction changes"). A payee's later rename shows the new name.
- Width: on one line where the row is wide enough for the nine columns; below it a tablet arrangement and a phone arrangement (`display.layouts`), measured at 390 and 375 on the report route in phase 3 pass 2 (lesson 21).
- Like every Books shipped report it is unpublished and shared with every Books reader (`server/report_shares.go`).
- Empty (no finished reconciliation, or none under the filters): core's empty report state.

### Undo

- **Undo reconciliation** opens a Books dialog on core `Dialog` (a sheet on a phone; `ReconcileUndoDialog`, test id `reconcile-undo-dialog`), title "Undo this reconciliation?":
  - Text: "1000 Business Checking, statement of Oct 31, 2026. Its 14 transactions are no longer reconciled, so they can be changed or voided again. They stay cleared: the reconciliation returns to In progress. Correct it and finish it again, or discard it."
  - **Undo reconciliation** (`Dialog.ActionButton`, destructive, `DIALOG_SUBMIT_SHORTCUT`, test id `reconcile-undo-submit`) and **Cancel** (Esc).
- When the account has a reconciliation in progress, the dialog reads instead: "1000 Business Checking has a reconciliation in progress (statement of Nov 30, 2026). Discard it before you undo this one." with the link button "Open it" (to its work screen) and **Close**; it has no Undo button.
- The undo is one update of the reconciliation (`status: 'in_progress'`). While it is sent the button shows "Undoing…" with core `ButtonSpinner`. The dialog stays open until the server has answered (a synchronous store flag set before the mutation, memory p1-opening-balances), so a refusal shows in the dialog (`text-danger`, the server's text). A transport failure logs `log.warn('books.reconcile', …)` and reads "The change could not be sent. Check your connection and try again."
- After the server has answered, the route shows the work screen `books/reconcile/<id>` (from the history: a push; on the summary: the same route now draws the work screen). Its result line reads "The reconciliation is in progress again. Its 14 transactions stay cleared."
- What follows with no more code: the history loses the row; the accounts screen shows Resume and the earlier "Reconciled through"; the register's Status reads "Cleared" for these lines; a void or an edit of one of them is allowed and removes its cleared mark; the report leaves it out.
- While the server cannot take writes, Undo is disabled (core `useServerActionState`, with its hint).
- Server refusals (also the last guard of a race):
  - Not a Books admin: "Only a Books admin can undo a reconciliation."
  - Not the latest: "Only the latest reconciliation of 1000 Business Checking can be undone. Undo the statement of Nov 30, 2026 first."
  - One in progress on the account: "1000 Business Checking has a reconciliation in progress. Resume it or discard it." (the existing text).
- Audit trail: `books_reconciliations` is an audited collection (p4-reconcile). The undo is a "Changed" row of the Audit Log with the admin, the time and Status "Finished → In progress"; the record's history (`books/history/books_reconciliations/<id>`) shows the finish, the undo and the second finish.

## 4. Data

### Schema (one new migration, `pb-migrations/<number>_books_reconciliation_report.js`)

The number is the next free number in `pb-migrations/` at build time, read after `main` is merged into the step branch (as reconcile spec §4 "Schema"). p4-reconcile's migration is not edited.

- `books_reconciliations` gains `finished_by_name` (text, max 200, server-stamped at the finish from the finishing user's name, cleared by an undo). It joins the fields the create and update rules pin.
- `books_reconciliations` update rule becomes: (`WRITE && status = "in_progress" && unset('account', <the server-stamped fields>)`) `||` (`ADMIN && status = "finished" && @request.body.status = "in_progress" && unset(<every other field>)`). `ADMIN` is the Books admin clause of `2100000001` (`@collection.books_access:me.is_admin ?= true`).
- `books_reconciled_lines` — a view collection (rules `READ`): one row for each cleared row of a finished reconciliation. Columns: `id` (the cleared row's id), `reconciliation`, `account`, `entry` (bare relation columns of `books_reconciliation_lines`), `date`, `debit`, `credit`, `position` (the journal line's), `currency` (the reconciliation's), `memo` (cast text: the line's, else the entry's), `payee` (cast text: the display name of the line's customer or vendor). One `SELECT` with joins (`books_reconciliation_lines` ⋈ `books_reconciliations` with `status = 'finished'` ⋈ `books_journal_lines` ⋈ `books_journal_entries`, left joins to customers and vendors), no `UNION ALL`. Registered with `changesignal.RegisterView` over those six collections.

### Server

- `server/reconcile.go`:
  - The finish stamps `finished_by_name` (the request hook reads `e.Auth`'s name beside `finished_by`; a superuser's value is kept, so the seed names its user). The field joins `reconcileFinishedFields`: it never changes on a finished row.
  - `checkReconcileUpdate`: a stored `finished` row whose next `status` is `in_progress` is an undo (`checkReconcileUndo`), inside `serializedThen` as every reconcile guard. It refuses a change of any other field, a finished reconciliation of the account with a later statement date, and a reconciliation in progress on the account. It then clears `cleared_out`, `cleared_in`, the two counts, `finished_at`, `finished_by` and `finished_by_name`; after the save, in the same transaction, it sets `finished = false` on the reconciliation's cleared rows (a model write, as the finish). The unique index `(account) WHERE status = 'in_progress'` is the last guard of two undos.
  - The update request hook refuses an undo by a user whose Books level is not admin (`levelFor`), so the text is the one above and not the rule's 404. A Go caller and a superuser pass (the seed).
- `server/report_sources.go`: two sources.
  - `books.reconciliations` on `books_reconciliations`: `statement_date` (`Date`, `TextDay`), `statement_balance`, `beginning_balance`, `cleared_out`, `cleared_in` (`Money`, `Currency: "currency"`), `cleared_out_count`, `cleared_in_count` (`Number`), `status` (`Select`: In progress, Finished), `finished_at` (`DateTime`), `finished_by_name` (`Text`), `currency`; link `account` → `books.accounts` (to one).
  - `books.reconciled_lines` on the view: `date` (`Date`, `TextDay`), `debit`, `credit` (`Money`, `SumAll`, `Currency: "currency"`), `memo`, `payee`, `position`, `currency`; links `reconciliation` → `books.reconciliations`, `account` → `books.accounts`, `entry` → `books.journal_entries` (to one).
- `server/report_reconciliation.go`: `reconciliationReportShipped()` (key `books.reconciliation_report`, title "Reconciliation Report", `Revision: 1`, `Unpublished: true`, `Live: true`) and its spec, registered from `Register` beside the other shipped reports. Engine parts, each already used by a Books report:
  - Source `books.reconciled_lines`. Params: `accounts` (`choice`, `multiple`, `optionsFrom` `books.accounts` with `where` type is bank or credit card) and `statement` (`choice`, single, `optionsFrom` `books.reconciliations` with `value` id, `label` `statement_date` (a typed day label), `group` `account.full_name`, `where` status is finished). Filter: `in(account, accounts)` and `eq(reconciliation, statement)`; an unset param matches every row.
  - One group `byStatement` on the hidden column `reconciliation` (a record group; `Open`, `Subtotals`). `Label`: `concat(min(account.full_name), " · reconciled by ", rec("byStatement", "finished_by_name"))` (an aggregate in a label, as `statementOpenItemsSpec` labels an item). `Opening`: label "Beginning balance", cell `balance` = `rec("byStatement", "beginning_balance")` (as `statementBalanceForwardSpec`). `Fill`: the finished reconciliations the two params admit, so a reconciliation that cleared no transaction (its statement balance equals its beginning balance) still has its section, with the opening row and the total.
  - Columns: `date` (the label column) · `transaction` (`statementActivity()`) · `payee` · `memo` · `debit` · `credit` (sums) · `balance` (formula: opening + `runningSum(net)`; `Rollup`: opening + `coalesce(sum(net), 0)`; `net` is `debit − credit`, or `credit − debit` when `account.type` is `credit_card`) · `statement` (`rec` statement_date, `detail: "blank"`) · `reconciled` (`rec` finished_at, `detail: "blank"`) · the hidden keys `reconciliation` and `accountNo` (`min(account.number)`).
  - `Sort`: `accountNo`, the statement date descending (`rec`), then `date`, `entry.posted_at`, `position` (keys that read a line order the lines inside a section). `Detail.Open`: `entryOpenPath()`. `Display`: one-line minimum width and the phone and tablet `layouts`.
  - Before the spec's code reads group keys or cells, one real run is dumped and the code is written against it (lesson 31). A part that the engine does not deliver is a core task (human, 2026-11-01), not a design around it.
- `server/oauth_scopes.go`: `books_reconciled_lines` read-only. `server/register.go`: the view's `RegisterView`, the shipped report. `TestRegister_BindsEachPartOnce` and the shipped-report share list follow.
- No new endpoint. Nothing posts; no journal entry, balance row or bank transaction changes.

### Reads (`useLiveQuery` with `{ query, queryKey }`)

- **History** (key `books.reconcile.history`): `books_reconciliations` where `status = 'finished'`, ordered by `statement_date` descending, with `materialize()` of the row's account (`findOne`). One query, and it has no account clause: the latest row of each account, the filter's account list, the rows under the filter and the shown order are computed from its rows (`lib/reconcile-history.ts`), so the filter sends no request.
- **In progress** (key `books.reconcile.history.open`): `books_reconciliations` where `status = 'in_progress'`. It tells the dialog which account has a reconciliation in progress (the blocked text). A failed load of either query shows the error state (lesson 10).
- **Finished summary**: `useReconcileScreen`'s record query (p4-reconcile) gains `materialize()` of the account's latest finished reconciliation (ordered by `statement_date` descending, `findOne`) and of its reconciliation in progress (`findOne`), and drops the `materialize()` of `finished_by` (the name is stamped).
- **Report link**: `useShippedReportHref('books.reconciliation_report', { statement: <id> })`: the hook gains an optional second argument and writes each value as `p-<param id>` (core `paramKey` of `@tinycld/core/reports/lib/view-url`). Null while it loads or when the reader has no such report: no link is drawn.
- Row types derive from the query results.

### Writes

- Undo: one pbtsdb `update` of `books_reconciliations` (`status = 'in_progress'`) through `useMutation`. The row leaves the finished queries optimistically; the dialog and the finished view are held through the write by a synchronous flag in `stores/reconcile-store.ts` (`undoingId`), and the route changes after the server's row arrives. A refusal rolls the row back.

### Client modules

- `lib/reconcile-history.ts` (pure): `latestFinishedIds(rows)`, `historyAccounts(rows)`, `shownHistory(rows, accountId, sort)`, `clearedCountText`, `reconciledByText`, `undoDialogTexts(reconciliation, account, openOne)`, the result and refusal texts, the key map.
- `hooks/useReconcileHistory.ts`, `hooks/useReconcileUndo.ts`; `hooks/useShippedReportHref.ts` (the optional params).
- `components/reconcile/`: `ReconcileTabs`, `ReconcileHistoryView`, `ReconcileHistoryRow` (the table row and the card), `ReconcileUndoDialog`; `ReconcileFinished`, `ReconcileHeader`, `ReconcileAccountsView` and `ReconcileStates` change.
- `lib/shipped-reports.ts`: `RECONCILIATION_REPORT_SHIPPED_KEY`.

### Fixture and seed

- `lib/reconciliation-report-fixture.ts`: the scratch route's data, typed with `satisfies` against the generated record types (the new field is typed by a local interface until the migration checkpoint): seven finished reconciliations over 1000 Business Checking, 1010 Business Savings and 2100 Company Card (one long account name and one long person name that must truncate), an empty variant, and one account with a reconciliation in progress (the blocked undo).
- `seed.ts`: after `seedReconcile`, posts entries of its own on 2100 Company Card (unique memos, fixed past dates) and finishes two reconciliations there (statements of Jul 31 and Aug 31, 2026), so the history has a latest and an earlier row of one account and the report has a credit card section. Before it adds the entries, the plan greps the specs and report fixtures that read 2100's balance or register (lesson 1).

### Shared files and merge order

- p4-reconcile merges to `main` before this unit. This unit's step branch starts from it and merges `main` before its eval gate; it then reads the migration number again and runs the generator, the package check and its own e2e specs.
- Files other units also edit, where a merge keeps both sides: `server/reconcile.go`, `server/report_sources.go`, `server/register.go`, `server/registrations_test.go`, `server/oauth_scopes.go`, `server/report_shares.go`, `seed.ts`, `lib/shell-nav.ts`, `lib/shipped-reports.ts`, `lib/audit-fields.ts`, `hooks/useShippedReportHref.ts`, `help/reconcile.md`, `help/reports.md`, `help/screenshots.ts`.

### Help

- `help/reconcile.md` gains "See past reconciliations", "Open the reconciliation report" (what it shows, the PDF, the filters) and "Undo a reconciliation" (who, which one, what it does to the transactions, the blocked case), and its "Who can do what" and "Keyboard shortcuts" parts follow. `help/reports.md` lists the report. Images through `help/screenshots.ts` before the image lines are added.

### Tests the plan must carry

- Vitest: each function of `lib/reconcile-history.ts`; the report href with params; the shell-nav path; the help topic test; the migration test (`tests/reconcile-migration.test.ts` pattern) for the new field, the rule and the view.
- Go: the update rule (an admin's undo passes; a bookkeeper's and a reader's are refused; an undo that also sends another field is refused); each undo refusal; the cleared stamps and `finished = false` on the rows; a void of a line after the undo passes and removes its mark; the second finish stamps again; two undos at once; `finished_by_name` at the finish and after the user's delete; the view's rows (only finished; payee, memo); `reports.CheckSources`, `reports.Load` and `reports.Validate` of the shipped spec; one run for a bank and one for a credit card statement (opening row, running balance, section total equal to the statement balance); the share with every Books reader; `changesignal.CheckViews`; the audit row of an undo; the registration counts.
- E2E, titles prefixed `reconciliation-report:`; each test makes its own bank account and entries and finishes its own reconciliations with the helpers of `tests/e2e/reconcile-helpers.ts`, dated as reconcile spec §4 says (lessons 1, 33):
  - The History tab lists a finished reconciliation; the account filter; the row opens the summary; the summary's link opens the history with the filter.
  - View report opens the report with the statement set: the beginning balance, the rows, the section total; a row opens its transaction.
  - An admin undoes the latest one: the dialog, the work screen with its result line, the history without the row, the register's Status "Cleared"; a void of one of its entries then passes.
  - An earlier reconciliation has no Undo; an account with one in progress shows the blocked dialog.
  - A refusal (`route.fulfill({ status: 400 })` on the update) shows in the dialog and the row stays; a load error shows Retry.
  - A read-only user (a faked `books_access`, lesson 32) and a bookkeeper see no Undo.
  - Keys: J/K, ↵, R.
  - Phone (390×844, navigate wide then resize): the cards, the card menu with View report and Undo, the undo sheet.

## 5. Cut

- A second list of the cleared transactions on the Books summary — the report is the one place that lists them.
- The report's "additional information": the register balance on the statement date and on the day it was reconciled, and the transactions cleared and not cleared after the statement date — the unit's description limits the report to the summary and the cleared details; the register's Status column shows what is not cleared.
- The "Changes" column — a reconciled transaction cannot change in Books (reconcile spec §3).
- The "Auto adjustment" column — Books posts no adjustment (reconcile spec §5).
- The attached statement mark — attaching a statement file is cut in the reconcile spec §5.
- The period filter and the year headings of the history — the list is newest first and each row shows its year; the account filter is enough at about 12 rows a year for each account.
- A Print command of its own — core's "Download PDF" is the print path on both platforms.
- An undo of a reconciliation that is not the latest, and an undo that also removes the cleared marks in one step — undo the later ones first; Discard removes the marks.
- A reason field on the undo — the audit log records who and when.
- The history's links to the chart of accounts and the register — the summary has View register.

## 6. Platform notes

- None single-platform. The tabs, the table and cards, the menus, the dialog (a sheet on a phone), core's report view and its PDF run on web and native.
- Keyboard shortcuts (web and iOS hardware keyboard; every action also has a visible control) have standing approval (human, 2026-11-11).

## 7. Sparks carried

- The report reads as a document: core's report view (document header, title, filter chips) and its PDF export.
- Arithmetic that ends in a ruled total: the report's "Beginning balance" opening row, running Balance column and section total; on the summary, p4-reconcile's block.
- A quiet link, with Undo in a menu: "View report" in `text-primary`; Undo in core `Menu` (`RecordRowMenu`) behind a core `Dialog`.
- No core extension.

## 8. Non-goals

- No change to the work screen, the start dialog, the hints or the register but what an undo causes through the existing code.
- No new endpoint, and no PDF template of Books: the PDF is core's report export.
- No undo for a bookkeeper, and no setting that changes who can undo.
- No record of an undone reconciliation as a history row: the Audit Log holds it.
- No link from the register's "Reconciled through" to the history.
