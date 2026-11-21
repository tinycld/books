# Reconcile an account — design

Status: approved at the design gate, 2026-11-21 (auto-helix unit p4-reconcile, feature `reconcile`). Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Reconciliation (computed hints, saved report, admin undo of the latest)"; "in-app help for every feature"), §Interface ("Accounting (Chart of Accounts, Journal Entries, Reconcile)") and §Ledger rules; `docs/plans/books-quickbooks-fixes.md` (computed hints: the divisible-by-9 check and statement totals beside selected totals; "when delete, void, or inactivate is blocked, the message says why: posted, reconciled, or closed period"). Builds on `books/docs/specs/account-register-design.md` (its Cut list sends the Reconcile button, "Reconciled through" and the cleared mark here), `books/docs/specs/for-review-design.md` and `books/docs/specs/bank-match-design.md` (both send the cleared and matched marks here; `books_bank_match_lines`), and `books/docs/specs/bank-categorize-design.md`. Built against books `main`@ff6a766, core @4adc15b.

The human picked direction A of the artboards at the design gate (a summary band over one full-width list; the start is a dialog on an accounts screen). The 21 open questions of the design packet took their recommended answers, with three changes by the human: the new migration takes the next free number at build time (§4 "Schema"); every detail type of a `bank` account, and `credit_card`, can be reconciled (§3 "Which accounts"); and the units p2-bank-deposit and p5-expenses-by-vendor merge first (§4 "Shared files and merge order").

## 1. Goal

A bookkeeper proves that the Books balance of a bank or credit card account agrees with the bank's statement: they give the statement's ending balance and date, mark each Books transaction that is on the statement as cleared until the difference is zero, and finish. Books tells them what a difference can come from.

## 2. Where it lives

- A new sidebar entry **Reconcile** in the Accounting group, after Journal Entries (`lib/shell-nav.ts`: id `reconcile`, href `books/reconcile`, Lucide `ListChecks`).
- `screens/reconcile/index.tsx` (route `books/reconcile`): the accounts that can be reconciled, each with where it stands, and the start dialog.
- `screens/reconcile/[id].tsx` (route `books/reconcile/<reconciliation id>`): one reconciliation. In progress it is the work screen; finished it is a read-only summary.
- Other entry points:
  - The account register's header (`RegisterHeader`) gains **Reconcile** (outline `ShortcutButton`, key R, test id `register-reconcile`) for a writer, on an account that can be reconciled (§3 "Which accounts") or that has a reconciliation in progress. It opens `books/reconcile?account=<id>`.
  - The Banking panel's More menu (`BankPanelMenu`) gains **Reconcile** (test id `bank-menu-reconcile`) after "View register", for a writer, with the same rule and the same target.
  - `books/reconcile?account=<id>` replaces itself with the work screen of the account's reconciliation in progress. With none, it shows the accounts screen with the start dialog open for that account. For an id that is not an account that can be reconciled, and for a reader, it shows the accounts screen with no dialog.
- The account register also gains "Reconciled through Sep 30, 2026" in its header and a Status column (§3 "The account register").

## 3. Behavior

### Words

- A **reconciliation** is one comparison of an account with one bank statement: an account, a statement ending date and a statement ending balance.
- A Books transaction here is one posted journal line on the account. It is **cleared** when the user has marked it as on the statement in a reconciliation that is in progress, and **reconciled** when that reconciliation is finished.
- **Beginning balance**: the statement ending balance of the account's last finished reconciliation; $0.00 when the account has none (the opening balance entry is then a transaction to clear).
- **Cleared balance**: the beginning balance plus the cleared transactions that raise the account's balance, less those that lower it.
- **Difference**: the statement ending balance less the cleared balance. A reconciliation can be finished only at a difference of $0.00.
- Each transaction is on one of two sides. The **credit side** is a **Payment** for a bank account (money out) and a **Charge** for a credit card account. The **debit side** is a **Deposit** for a bank account (money in) and a **Payment** for a credit card account. Where this spec says Payments, the screen of a credit card account says Charges; where it says Deposits, that screen says Payments (`sideWords`). This applies to the tabs, the column headers, the band, the statement totals and the result texts.
- Every balance is in the account's own sense. For a bank account it is the money in the account: a deposit raises it and a payment lowers it. For a credit card account it is the amount owed: a charge raises it and a payment lowers it. A statement that shows $864.20 owed is typed as 864.20.

### Which accounts

- Accounts of type `bank` with any detail type (Checking, Savings, Money market, Cash on hand, Trust account), and accounts of type `credit_card`. The detail type changes nothing on the screens. A bank connection is not necessary.
- A reconciliation starts only on an active account. An account that becomes inactive keeps its reconciliation in progress: the accounts screen does not list the account, and the register's Reconcile button still opens the reconciliation, which can be finished or discarded.
- An account has at most one reconciliation in progress.

### The accounts screen (`books/reconcile`)

- Title "Reconcile" and one line: "Compare an account with its bank statement."
- A table (Books `ListTable`), one row for each account that can be reconciled, ordered by account number, then name. Columns: Account ("1000 Business Checking", flex 2, minimum 200) · Type (minimum 110) · Reconciled through (minimum 150: "Sep 30, 2026" as a link to that reconciliation's finished summary, or "Never" in `text-muted-foreground`) · In Books (minimum 120, right aligned, `tabular-nums`, `balanceText`) · the action (minimum 150, right aligned). Below the table's own minimum width the rows are cards (`ListCards`: account and type on line one, "Reconciled through Sep 30, 2026" on line two, the balance and the action on the right).
- The action of a row, for a writer:
  - No reconciliation in progress: **Reconcile** (outline button, test id `reconcile-start-<accountId>`), which opens the start dialog.
  - One in progress: **Resume** (primary button, test id `reconcile-resume-<accountId>`), with "In progress · statement of Oct 31, 2026" under the account name; it opens the work screen.
- A press on a row does what its button does. A reader sees the table with no Reconcile button; a row with a reconciliation in progress shows **View** for a reader.
- Keys: ↓ / J and ↑ / K move the focused row; ↵ presses its action.
- Loading: core `LoadingState`. Error: "Books could not load the accounts." with Retry (`recoverLiveQueries` once over every failed query, `mergeRecoveries`). Empty: "No bank or credit card account yet. Add one in the Chart of Accounts." with a core Button "Open Chart of Accounts" for a writer.

### The start dialog

- Core `Dialog` (a sheet on a phone), title "Reconcile 1000 Business Checking", `useForm` with `zodResolver` (`reconcileStartSchema`).
- Content, top to bottom:
  - **Beginning balance** — read only, `formatMoney`; under it "From the statement of Sep 30, 2026" or, with no earlier reconciliation, "This account has not been reconciled. Its opening balance is a transaction to clear."
  - **Ending balance** — Books `MoneyTextField`, required, test id `reconcile-ending-balance`; it has the focus when the dialog opens (`useFocusOnOpen`). A negative amount is allowed (an overdrawn account).
  - **Ending date** — core `DateField` (`@tinycld/core/ui/forms/fields/DateField`), required, test id `reconcile-ending-date`, its calendar bounded to the field (lesson 2).
  - **Statement totals (optional)** — a heading with the hint "When you enter the statement's totals, Books shows which side is off.", then **Payments** and **Deposits** (two `MoneyTextField`s side by side, test ids `reconcile-statement-out`, `reconcile-statement-in`; "Charges" and "Payments" for a card). Each is 0 or above. Both are entered or both are empty ("Enter both totals, or neither.", a zod refinement).
- When the account has a bank connection whose latest statement file (OFX) is dated after the last reconciled statement, the dialog starts with that file's balance and date in the two fields (`useStatementBalance`), and says under them "From jan-2027.ofx. Check them against your statement." The user can change both.
- Rules (zod, inline): the ending balance is well-formed money and within `maxStoredAmount`; the date is a real day (`isIsoDay`), is after the last reconciled statement date ("The date must be after Sep 30, 2026, the last reconciled statement."), and is not after today ("The date cannot be after today."; the client's day, checked in the form only, because the server's day can differ from the user's).
- **Start reconciling** (`Dialog.ActionButton`, `DIALOG_SUBMIT_SHORTCUT`, test id `reconcile-start-submit`) creates the reconciliation and opens its work screen. While it is sent the button shows "Starting…" with core `ButtonSpinner`. The dialog stays open until the server has answered, so a refusal shows in the dialog (a synchronous store flag set before the mutation, memory p1-opening-balances). **Cancel** (Esc) closes it.
- A server refusal shows on its field or in `FormErrorSummary` (`handleMutationErrorsWithForm`).

### The work screen (`books/reconcile/<id>`, in progress)

The screen is a fixed column: the header, the summary band, the hint line and the toolbar stay put, and the list fills the rest of the height and scrolls by itself.

**Header**

- Back link "Reconcile" (to `books/reconcile`; pop when it is right below, replace otherwise).
- Title: the account ("1000 Business Checking"); under it "Statement ending Oct 31, 2026".
- Actions, for a writer: **Edit info** (outline `ShortcutButton`, key E, test id `reconcile-edit-info`), **Finish later** (outline `ShortcutButton`, key ⌘S, test id `reconcile-later`), **Finish** (primary `ShortcutButton`, key ⌘↵, test id `reconcile-finish`), and a More menu (test id `reconcile-more`) with **Discard reconciliation**.
- On a phone the header keeps the back link, the title and the More menu (Edit info, Finish later, Discard reconciliation); **Finish** is a full-width button in a bar at the bottom of the screen.

**Summary band** (test id `reconcile-summary`)

- First line, three figures with their operators between them: **Statement ending balance** − **Cleared balance** = **Difference**. Figures are `text-xl font-semibold tabular-nums`, labels `text-xs text-muted-foreground`.
- Second line, under the cleared balance and joined to it by a `border-border` rule: **Beginning balance** − **3 payments** $550.00 + **1 deposit** $175.00 (the count is in the label; `text-sm tabular-nums`). For a credit card account the line reads **Beginning balance** + **3 charges** $550.00 − **1 payment** $175.00, because a charge raises the amount owed.
- When the statement totals were entered, each side shows a second figure, "of $580.00 on the statement", and when the two differ "$30.00 under" or "$30.00 over" in `text-danger`.
- The difference is `text-2xl font-semibold tabular-nums` with a mark and a word beside it: Lucide `CircleCheck` in `useThemeColor('success')` and "Balanced" at $0.00; Lucide `CircleAlert` in `useThemeColor('warning')` and "Not balanced" otherwise. The mark is decoration; the word carries the state. The block is an `accessibilityLiveRegion="polite"` region.
- All figures are integer cents (`lib/reconcile.ts`), shown with `formatMoney`; a sum above `maxStoredAmount` shows `TOO_LARGE_TEXT`.
- On a phone the band is one compact bar: the difference with its mark and word, and "Cleared $4,625.00 of $4,625.00" under it. A press (44 pt, label "Show the balances") opens the full band in place; a second press closes it.

**Hint line** (test id `reconcile-hints`)

- One line under the band, shown while the difference is not $0.00 and Books has a hint. It shows the first hint by the order below; "2 more" at its end opens the others under it.
- Hints, in order (`lib/reconcile-hints.ts`, pure, over the loaded rows):
  1. **For review** — the account's bank connection has For review bank transactions dated on or before the statement date: "3 bank transactions up to Oct 31, 2026 are still in For review. Review them first." with the link "Open Banking" (`books/banking?account=<connectionId>&tab=review`).
  2. **One transaction** — a transaction that is not cleared has exactly the amount, on the side, that makes the difference zero: "Clearing Expense 12 ($250.00) makes the difference zero." with **Show**, which scrolls to the row and focuses it. With several such transactions: "3 transactions of $250.00 are not cleared. Clearing one makes the difference zero." with **Show**, which puts the amount in the search.
  3. **One cleared transaction** — un-clearing one cleared transaction makes the difference zero: "Without Deposit 1003 ($500.00) the difference is zero. Check that it is on the statement." with **Show**.
  4. **Wrong side** — a cleared transaction has half the difference as its amount, on the side that fits: "Expense 12 ($250.00) is half the difference. Check that money out was not entered as money in."
  5. **Swapped digits** — the difference in cents divides by 9: "The difference, $27.00, divides by 9. Two digits of an amount may be swapped, for example $54.00 entered as $45.00."
- At $0.00 the line reads "Balanced. Finish to record this reconciliation." in `text-success` with the same check mark.

**Toolbar**

- Books `ListTabs` (test id prefix `reconcile-side`): **All** · **Payments** · **Deposits**.
- Books `SearchField` (test id `reconcile-search`, placeholder "Search number, payee, memo or amount", `SEARCH_DELAY_MS`): every piece of the text is in the number, the payee or the memo; text that reads as an amount also matches that amount (`parseSearchAmount`).
- **Show** — core `PickMenu` (test id `reconcile-show`): "All transactions" (default), "Not cleared", "Cleared".
- **Clear matched (14)** (outline `ShortcutButton`, key M, test id `reconcile-clear-matched`, writers): shown when one or more transactions that are not cleared are matched to an imported bank transaction (p4-match, p4-categorize-split); it clears all of them, whatever the filters.
- "Clear filters" link when a side, a search or a Show choice is set.
- The side, the search and the Show choice are in a package store (`stores/reconcile-store.ts`, not persisted) and reset when the screen loses focus or shows another reconciliation.
- A result line under the toolbar (`accessibilityLiveRegion="polite"`) reads the last batch result or refusal until the next action.

**The list (wide)**

- Columns: the clear box (44) · Date (minimum 104) · Transaction (minimum 150) · Payee (flex 1, minimum 120) · Memo (flex 2, minimum 140) · Payment (minimum 110) · Deposit (minimum 110). Header cells are `ListHeaderCell` / `ListSortHeaderCell`; header and rows share exported cell style constants; amounts are right aligned, `tabular-nums`, without a sign in their column. The table's minimum width is the sum of its columns; below it the list is cards. The table never scrolls sideways.
- It lists every posted transaction on the account dated on or before the statement date that is not reconciled: its entry is posted, is not void and is not the reversal of a void.
- Row height 44, fixed, windowed (`useRowWindow` through `ListTable`). Date reads "Oct 12, 2026" (`formatDay`). Transaction is the type and number as a link ("Expense 12", `text-primary`, `entryHref`), and after it, for a transaction matched to a bank transaction, a Lucide `Landmark` icon (12, `muted-foreground`) with the label "Matched to a bank transaction". Payee is the line's customer or vendor. Memo is the line memo, else the entry memo, one line with an ellipsis.
- Order: by date, oldest first, then entry number, then id. The Date, Payment and Deposit headers sort (a second press reverses).
- A cleared row has its box checked and `bg-surface-secondary`.

**The list (phone and narrow)**

- Cards (`ListCards`), 64 high: the clear box · two lines ("Expense 12 · Robertson & Associates", one line; "Oct 12, 2026 · Retainer for October" in `text-xs text-muted-foreground`, one line) · the amount on the right, signed by its effect on the account's balance (a bank payment and a card payment "-$250.00"; a deposit and a charge "$250.00"), `tabular-nums`.
- Above the cards, a bar with the select-all box and "Clear all shown", and the order toggle "Oldest first" / "Newest first".

**Clearing**

- A press anywhere on a row or card but its link clears it, or unclears it (the whole row is the target; the Books `SelectBox` is the visible control, with the label "Clear Expense 12" / "Unclear Expense 12").
- Each press is saved at once: clearing inserts one `books_reconciliation_lines` row and unclearing deletes it (optimistic through pbtsdb). There is no Save button. The band and the hint line follow at once.
- The header box (wide) or "Clear all shown" (phone), labelled "Clear all shown transactions", clears every row the list shows under the current filters; when all shown rows are cleared it unclears them; it is mixed when some are. It runs 50 rows at a time in parallel (outcome `{ done, failed }`). While it runs the box shows core `ButtonSpinner`, and the rows, Finish and Clear matched are disabled. The result line reads "Cleared 42 transactions." / "Uncleared 42 transactions."
- A refused press returns the row to its state and the result line reads the server's message in `text-danger`; a partly refused batch reads the server's message when every failure has the same one, otherwise "3 of 42 transactions could not be cleared. Try again." A transport failure logs `log.warn('books.reconcile', …)` and reads "The change could not be sent. Check your connection and try again."
- While the server cannot take writes, the boxes, Clear matched, Edit info, Finish and Discard are disabled (core `useServerActionState`, with its hint).
- Another user's presses on the same reconciliation arrive by realtime.

**Edit info**

- Opens the start dialog's form as "Edit statement information" with the stored values; the account is fixed. **Save** (`DIALOG_SUBMIT_SHORTCUT`) updates the reconciliation.
- When the new date is earlier, the server unclears the cleared transactions dated after it, and the result line reads "2 cleared transactions after Oct 15, 2026 were uncleared."

**Finish later**

- Returns to `books/reconcile`. Nothing is sent: every press is already saved. The account's row there shows Resume.

**Finish**

- Enabled only at a difference of $0.00. While disabled it has the hint "The difference must be $0.00 to finish."
- It sets the reconciliation to finished. While it is sent the button shows "Finishing…" with core `ButtonSpinner` and the list is disabled. The server checks the difference again from the stored rows; a refusal ("The difference is $27.00. It must be $0.00 to finish.") shows in the result line and the screen stays.
- After the server has answered, the route shows the finished summary.

**Discard reconciliation**

- Core `ConfirmDialog`: "Discard this reconciliation? The 14 cleared marks of this statement are removed. No transaction changes." **Discard** deletes the reconciliation in progress (its cleared rows go with it) and returns to `books/reconcile`.

**Keys (web and iOS hardware keyboard)**

Registered with core `useRegisterShortcuts` in the screen's scope, each only while its action is offered; the buttons with a key are `ShortcutButton`s:

- ↓ / J and ↑ / K — move the focused row (core `rowFocusStyle`); the first press focuses the first row.
- Space or X — clear or unclear the focused row.
- ↵ or O — open the focused row's transaction.
- A — clear all shown rows, or unclear them when all are cleared.
- M — Clear matched.
- / — focus the search.
- 1 · 2 · 3 — All · Payments · Deposits.
- E — Edit info. ⌘↵ — Finish. ⌘S — Finish later. Esc — clear the search when it has text.
- The help topic lists every key with Mac glyphs.

**States**

- Loading: core `LoadingState` under the header; the back link stays.
- Error: "Books could not load this reconciliation." with Retry (`recoverLiveQueries`, `mergeRecoveries`).
- Not found (a bad id, or another user discarded it): "This reconciliation does not exist." with the back link.
- Empty, nothing filtered: "No transaction on 1000 Business Checking up to Oct 31, 2026 waits to be cleared." A reconciliation with no transaction can be finished when its statement balance equals the beginning balance.
- Empty under a filter: "No transactions match these filters." with a core Button "Clear filters".
- Read-only user: the header without its actions, the band, the hint line without Show, the toolbar's filters, and the list with a check mark in place of each box of a cleared row; no keys but the navigation and filter keys.

### The finished summary (`books/reconcile/<id>`, finished)

- Header: the back link, the account, "Statement ending Oct 31, 2026", and a `StatusBadge` "Reconciled".
- A summary block (test id `reconcile-finished`): Statement ending balance; Beginning balance; "3 payments" with their sum; "1 deposit" with its sum; Cleared balance; Difference $0.00; "Finished Nov 21, 2026 by Ana Ruiz".
- One line: "4 transactions of this statement are reconciled. They cannot be voided or changed."
- Buttons: **Reconcile another account** (primary, to `books/reconcile`) and **View register** (outline, to `books/accounts/<accountId>`).
- The list of the reconciled transactions, the history of an account's reconciliations, the report and the undo are the `p4-reconciliation-report` unit; this screen draws no control for them.

### When a cleared or reconciled transaction changes

- Voiding or editing a transaction (an edit voids the original and posts a correction) that is cleared in a reconciliation in progress removes its cleared mark in the same server transaction. The correction is then a transaction to clear.
- Voiding or editing a transaction that is reconciled is refused: "Expense 12 is reconciled on 1000 Business Checking (statement of Oct 31, 2026). It cannot be voided or changed." The same refusal serves every document screen, because each voids through the journal entry.
- A posted transaction dated on or before a finished statement date can still be posted later (a late entry). It is then a transaction to clear in the next reconciliation, and it does not change a finished one.

### The account register

- Header: "Reconciled through Oct 31, 2026" under the balance block (`text-xs text-muted-foreground`, test id `register-reconciled-through`) when the account has a finished reconciliation; the **Reconcile** button of §2.
- A **Status** column between Account and Debit (minimum 96, `text-xs`): "Reconciled" (`text-success`), "Cleared" (`text-foreground`), "Matched" (`text-muted-foreground`, a transaction matched to a bank transaction and not cleared), or empty. The phone card shows the same word after the Ref no.
- The entry drawer (`EntryDrawer`) shows the same word for this account's line, and for a reconciled line "Statement of Oct 31, 2026".

## 4. Data

### Schema (one new migration, `pb-migrations/<number>_create_books_reconciliations.js`)

The migration's number is the next free number in `pb-migrations/` at build time, read after `main` is merged into the step branch. This spec, the plan and the tests name no fixed number: other lanes add migrations before this unit merges (p2-bank-deposit of lane reports takes the number after 35). If `main` gains a migration with the same number before this unit merges, the unit renames its file to the next free number (the migration is not released).

- `books_reconciliations` — one row for each reconciliation.
  - `account` (relation to `books_accounts`, required, no cascade), `statement_date` (text day, required), `statement_balance` (integer minor units, signed, in the account's own balance sense, between −`MAX_AMOUNT` and `MAX_AMOUNT`), `has_statement_totals` (bool), `statement_out`, `statement_in` (integer, 0 and above; read only when `has_statement_totals` is true; `_out` is the credit side and `_in` the debit side of §3 "Words", here and in `cleared_out` / `cleared_in`), `status` (select: `in_progress`, `finished`, required), and server-stamped: `beginning_balance`, `cleared_out`, `cleared_in`, `cleared_out_count`, `cleared_in_count` (stamped at finish), `created_by`, `finished_by` (users), `finished_at` (date), `currency`, autodates.
  - Rules: list and view `READ`; create `WRITE && @request.body.status = "in_progress" && unset(<the server-stamped fields>)`; update `WRITE && status = "in_progress" && unset('account', <the server-stamped fields>)`; delete `WRITE && status = "in_progress"`.
  - Indexes: unique `(account) WHERE status = 'in_progress'`; `(account, statement_date)`.
- `books_reconciliation_lines` — one row for each cleared transaction.
  - `reconciliation` (relation, required, cascade delete), `line` (relation to `books_journal_lines`, required, unique index), and server-stamped: `account`, `entry` (indexed), `date`, `debit`, `credit`, `finished` (bool), autodates.
  - Rules: list and view `READ`; create `WRITE && unset('account', 'entry', 'date', 'debit', 'credit', 'finished')`; update none; delete `WRITE && finished = false`.
  - Indexes: unique `(line)`; `(reconciliation)`; `(entry)`.
- `books_reconcile_lines` — a view collection (rules `READ`): one row for each posted journal line on a bank or credit card account whose entry is posted and is not a void reversal. Columns: `id` (the line id), `line`, `account`, `entry`, `date`, `debit`, `credit`, `memo` (the line's, else the entry's), `number`, `doc_type`, `payee` (the display name of the line's customer or vendor), `reconciliation` (the id of the reconciliation that holds the line, else ''), `finished` (bool), `bank_matched` (bool: an `EXISTS` over `books_bank_match_lines`). One `SELECT` with joins and no `UNION ALL` (memory p5-change-signal). Registered with `changesignal.RegisterView` over `books_journal_lines`, `books_journal_entries`, `books_accounts`, `books_customers`, `books_vendors`, `books_reconciliation_lines`, `books_reconciliations`, `books_bank_match_lines`; the client keeps it live with core `liveViewOptions`.
- A view was chosen over a query of `books_journal_lines` with rows dropped in JS, because that query loads the account's whole history at every reconciliation; the view lets the server leave out the reconciled lines.

### Server (`server/reconcile.go`, registered from `Register`)

Every guard that reads other rows runs inside `serialized`.

- Create of `books_reconciliations`: stamp `created_by`, `currency` and `beginning_balance` (the `statement_balance` of the account's finished reconciliation with the latest `statement_date`, else 0). Refuse: an account whose type is not `bank` or `credit_card` ("Only a bank or credit card account can be reconciled."; the detail type is not read); an inactive account; a reconciliation in progress on the account ("1000 Business Checking has a reconciliation in progress. Resume it or discard it."); a `statement_date` on or before the last finished one (keyed on the field).
- Update of `books_reconciliations` (in progress): the same date rule; when `statement_date` moves earlier, delete the account's cleared rows of this reconciliation dated after it. When `status` moves to `finished`: sum the cleared rows, refuse a difference that is not 0, stamp `cleared_out`, `cleared_in`, the two counts, `finished_at` and `finished_by`, and set `finished = true` on its cleared rows (a model write).
- Create of `books_reconciliation_lines`: stamp `account`, `entry`, `date`, `debit`, `credit`. Refuse: a reconciliation that is not in progress ("This reconciliation is finished."); a line that is not posted on the reconciliation's account; a line whose entry is void or a void reversal ("Expense 12 is void."); a line dated after the statement date ("Expense 12 is dated after Oct 31, 2026."); a line that is cleared already (the unique index, with "Expense 12 is cleared in another reconciliation.").
- Delete of `books_reconciliation_lines`: refuse when its reconciliation is finished.
- `unreconcileEntry(tx, entryID)`, called from `transitionEntry`'s void branch beside `unmatchEntry` and `uncategorizeEntry`: refuse when a line of the entry is in a finished reconciliation (the text of §3); delete the entry's cleared rows of a reconciliation in progress. `isLineReconciled(tx, lineID)` (true for a line in a finished reconciliation) is exported beside it for the report unit and later guards.
- `server/accounts.go`: a delete of an account, and a change of its type away from `bank` and `credit_card`, are refused while a reconciliation names it ("1000 Business Checking has a reconciliation. Discard it first." for one in progress; "… has reconciled statements." for a finished one).
- Audit: `books_reconciliations` joins the audited collections (`server/audit.go`), label "<account number and name> <statement date>", so a start, a change of the statement information, a finish and a discard show in the audit log. Cleared rows are not audited (one row for each press).
- `server/oauth_scopes.go`: `books_reconciliations` and `books_reconciliation_lines` read-write, `books_reconcile_lines` read-only. `TestRegister_BindsEachPartOnce` gains the new part.

### Reads (`useLiveQuery` with `{ query, queryKey }`)

- **Accounts screen** (key `books.reconcile.accounts`): `books_accounts` where the type is `bank` or `credit_card` and `inactive = false`, with the balance of `lib/accounts-query.ts`, and `materialize()` of the account's reconciliation in progress (`findOne`) and of its latest finished one (ordered by `statement_date` descending, `findOne`) — one query.
- **Reconciliation** (key `books.reconcile.record`): the row by id (`findOne`, its own `useLiveQuery`, so a failed load has an error state) with `materialize()` of its account and of `finished_by`.
- **Lines** (key `books.reconcile.lines`): `books_reconcile_lines` where `account = <id>`, `date <= <statement date>` and (`reconciliation = ''` or `reconciliation = <id>`), ordered by `date`, `number`, `id`; `materialize()` of the row's `books_reconciliation_lines` row (`findOne` by `line`), which is what says "cleared" and follows an optimistic press at once. Not paged: the sums, the hints and "clear all shown" need every row; the list is windowed. This is the screen's one lines query.
- **Totals, hints and the shown rows**: computed from that query's rows in one pass each (`reconcileTotals`, `reconcileHints`, and `shownRows(rows, filters, sort)` for the side, the search, the Show choice and the column order). The filters send no request.
- **For review hint** (key `books.reconcile.review`): the account's `books_bank_connections` row and the count of its `books_bank_transactions` with `status = 'for_review'` and `date <= <statement date>`.
- **Start dialog**: the latest finished reconciliation of the account (from the accounts query) and `useStatementBalance`.
- **Register**: `lib/register-query.ts`' lines query gains `materialize()` of the line's `books_reconciliation_lines` row and of its `books_bank_match_lines` row; "Reconciled through" is the account's latest finished reconciliation.
- Row types derive from the query results; no hand-written row type.

### Writes

- Start: one pbtsdb `insert` into `books_reconciliations` (`{ id: newRecordId(), account, statement_date, statement_balance, has_statement_totals, statement_out, statement_in, status: 'in_progress' }`) through `useMutation`; the screen opens `books/reconcile/<id>` after the insert settles.
- Clear / unclear: one `insert` / `delete` of `books_reconciliation_lines` (`{ id: newRecordId(), reconciliation, line }`). Clear all shown and Clear matched: one insert (or delete) for each row, 50 in parallel per step, outcome `{ done, failed }`. No row is inserted and then updated in one transaction.
- Edit info: one `update` of the reconciliation. Finish: one `update` (`{ status: 'finished' }`); the screen holds the work view through the write with a synchronous store flag, and shows the summary when the server's row arrives.
- Discard: one `delete` of the reconciliation.

### Client modules

- `lib/reconcile.ts` (pure): `RECONCILE_ACCOUNT_TYPES`, `sideWords(accountType)`, `reconcileTotals(rows, reconciliation)` (beginning, the two sums and counts, cleared balance, difference, the two statement-side differences), `shownRows(rows, filters, sort)`, `reconcileStartSchema(lastDate, today)`, `lineStatusText(line)` ("Reconciled" / "Cleared" / "Matched"), the result texts.
- `lib/reconcile-hints.ts` (pure): `reconcileHints(rows, totals, reviewCount)` → ordered hints with their texts and targets.
- `lib/reconcile-shortcuts.ts` (the pure key map), `stores/reconcile-store.ts` (filters, sort, the open dialog, the finishing flag, the last result).
- `hooks/useReconcileAccounts.ts`, `useReconcileStart.ts`, `useReconcileScreen.ts`, `useReconcileLines.ts`, `useReconcileClear.ts` (single and batch), `useReconcileShortcuts.ts`.
- Components in `components/reconcile/`: `ReconcileAccountsView`, `ReconcileAccountRow`, `ReconcileStartDialog`, `ReconcileScreenView`, `ReconcileHeader`, `ReconcileSummary`, `ReconcileHintLine`, `ReconcileToolbar`, `ReconcileTable`, `ReconcileRow`, `ReconcileCards`, `ReconcileFinished`, `ReconcileStates`.

### Shared files and merge order

- The units p2-bank-deposit (lane reports) and p5-expenses-by-vendor (lane default) merge to `main` before this unit. This unit merges `main` into its step branch before its eval gate.
- In each file that those units also edit, the merge keeps both sides: `server/entries.go` (the void branch of `transitionEntry`: the other unit's call and `unreconcileEntry`), `server/accounts.go`, `server/register.go`, `server/registrations_test.go`, `server/audit.go`, `server/oauth_scopes.go`, `collections.ts`, `seed.ts`, `lib/shell-nav.ts`, `lib/register.ts`, `help/banking.md`, `help/bank-match.md` and `help/screenshots.ts`.
- After the merge, the unit reads the migration number again (§4 "Schema"), runs the generator, and runs the package check and its own e2e specs again.

### Fixture and seed

- `lib/reconcile-fixture.ts`: the scratch route's data, typed with `satisfies` against the generated record types once the migration exists, accounts by `seed.ts` numbers (1000 Business Checking, 1010 Business Savings, 2100 Company Card): one reconciliation in progress on 1000 with 26 transactions over one month (9 cleared, 6 matched to the bank, one 60-character memo and one long payee that must truncate, payments and deposits, a difference of $27.00 so the swapped-digits hint shows, statement totals entered); a balanced variant; an empty variant; a finished one; 2100 with a reconciliation never done.
- `seed.ts`: posts three entries of its own on 1010 Business Savings (unique memos, fixed past dates), then, as superuser through the same Go hooks, finishes one reconciliation that clears the first two and leaves one in progress with the third not cleared. It reconciles no line that another seed step or spec posts. Before it adds the entries, the plan greps the specs that read 1010's balance or register (lesson 1).

### Help

- New topic `help/reconcile.md` ("Reconcile an account", tags reconcile, banking, statement): what a reconciliation proves; starting (ending balance, date, the optional totals, the values from an OFX file); clearing (one, all shown, matched); reading the band; each hint and what to do; Edit info, Finish later, Discard; Finish and what it locks; the register's Status words; who can do what; the keys. `banking.md`, `account-register.md`, `bank-match.md` and `navigating-books.md` link to it. Images through `help/screenshots.ts` before the image lines are added.

### Tests the plan must carry

- Vitest: `reconcileTotals` (bank and card signs, empty, statement totals, a sum above `maxStoredAmount`), each hint and their order, `reconcileStartSchema` (each rule), `shownRows` (each side, the search pieces and amount, each Show choice, each order), `lineStatusText`, `sideWords`, the key map, the shell-nav entry (`tests/shell-nav.test.ts`), the help topic test.
- Go: the rules of both collections (writer, reader, a finished row, each pinned field); each refusal of the create, update, finish, clear and unclear hooks; the beginning balance of a second reconciliation; the earlier-date unclear; `unreconcileEntry` (in progress: removed; finished: refused, for a journal entry and for one document); the account delete and type-change refusals; the view's rows (void and void reversal left out, `bank_matched`, `finished`) and its query plan on the `(account, date)` index; `changesignal.CheckViews`; the audit and registration counts. A scale run of the lines query at 20,000 lines that are not cleared is the driver's (`NEEDS-RUN`).
- E2E, titles prefixed `reconcile:`; each test makes its own bank account in the Chart of Accounts (a unique name) and posts its own entries through the journal entry form, dated in a month no report spec's empty-state test reads and after mid-2026 (lessons 1, 33; memory p5-trial-balance):
  - The sidebar entry opens the accounts screen; start (refusals: an empty balance, a date on or before the last statement); the work screen's band figures.
  - Clear rows one by one: the band and the hint line follow; the one-transaction hint and Show; finish is disabled until $0.00; Finish; the finished summary; the accounts screen shows "Reconciled through".
  - Finish later and Resume keep the cleared rows; Edit info with an earlier date unclears later rows; Discard.
  - Clear all shown under the Payments side and a search; unclear all.
  - A second reconciliation starts with the first one's ending balance.
  - A credit card account and a bank account of a detail type other than Checking (Cash on hand) can be reconciled: the card's words (Charges, Payments), its band line and a balance typed as the amount owed.
  - A void of a reconciled journal entry is refused with the text; a void of a cleared one removes the mark.
  - A refusal (`route.fulfill({ status: 400 })` on the create of a cleared row) returns the row and shows the message; a load error shows Retry.
  - Read-only user: no boxes and no actions.
  - Keys: J/K, X, A, M, /, 1–3, E, ⌘S, ⌘↵.
  - Phone (390×844, navigate wide then resize): cards, the compact bar and its open state, Clear all shown, the bottom Finish bar, the start sheet.
  - Register: the Reconcile button, "Reconciled through" and the Status words; the existing `account-register-*` specs with the new column.
  - Clear matched: one bank file imported and matched through the UI on the test's own account.

## 5. Cut

- Finishing with a difference, and an adjustment entry that Books posts for it — a finished reconciliation always balances; the user posts the missing transaction (a fee, interest) and clears it.
- The list of reconciled transactions of a finished statement, the history of an account's reconciliations, the saved reconciliation report, print and PDF, and the admin undo of the latest reconciliation — unit `p4-reconciliation-report` (it depends on this unit).
- Print of the work list, the column chooser, and the guided tour.
- The "other account" column and a "cleared date" column — the Transaction link opens the entry; the bank date of a matched transaction is in Banking.
- Showing transactions after the statement date — Edit info changes the date.
- Editing or voiding a transaction inside the list — the link opens it on its own screen.
- Service charge and interest fields in the start dialog — they are transactions (categorize the bank line, or a journal entry).
- Clearing matched transactions without a press — the user presses Clear matched.
- Accounts of types other than `bank` and `credit_card` (loans, other assets) — the human limited this unit to bank accounts of every detail type and credit cards.
- Attaching the statement file to a reconciliation.
- Collapsing the band on wide screens — it is two lines.

## 6. Platform notes

- None single-platform. The dialog (a sheet on a phone), the lists, the cards, `SelectBox`, `PickMenu`, `DateField` and the mutations run on web and native.
- Keyboard shortcuts (web and iOS hardware keyboard; every action also has a visible control) and first-input focus (web) have standing approval for every Books form (human, 2026-11-11).

## 7. Sparks carried

- The arithmetic is on the screen: the band's two lines of figures with their operators, `tabular-nums`, `formatMoney`, labels in `text-xs text-muted-foreground`, a `border-border` rule.
- The difference tells its state: `text-2xl font-semibold`, Lucide `CircleCheck` / `CircleAlert` through `useThemeColor('success')` / `useThemeColor('warning')`, and the words "Balanced" / "Not balanced".
- The figures stay in view: the band is outside the list's scroller.
- No core extension.

## 8. Non-goals

- Nothing posts, and no journal entry, balance row or bank transaction changes. The close date does not apply to a reconciliation.
- No report-engine source and no shipped report (the report unit registers them).
- No undo of a finished reconciliation in this unit, by anyone.
- No change to Banking but the More menu item, and no change to the match or categorize rules.
- No new endpoint.
