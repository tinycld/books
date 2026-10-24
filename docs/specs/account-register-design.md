# Account register

## Goal
Show every posted transaction line of one account, in date order, with the running balance after each line, from the Chart of Accounts.

## Design decisions (design gate)
Approved at the design gate 2026-10-23: direction A (flat table, entry detail in a side drawer). Q1-Q12 accepted at their recommended answers, with one change: the date range defaults to This month (not This fiscal year).

## Where it lives
`books/tinycld/books/`:
- `screens/accounts/[id].tsx` (route `/a/books/accounts/[id]`, `id` = the account id). A static sibling `import.tsx` wins over the dynamic segment.
- `components/register/` (RegisterScreenView, RegisterHeader, RegisterRangeSelect, RegisterTable, RegisterRow, RegisterCard, EntryDrawer, RegisterEmptyState), `hooks/useRegisterScreen.ts`, `hooks/useRegisterQuery.ts`, `stores/register-store.ts` (selected entry id).
- `lib/register.ts` (pure: build rows, opening balance, running balance, ordering), `lib/register-range.ts` (range presets from the fiscal year start month), `lib/register-query.ts` (query builders).
- `components/accounts/AccountRowMenu.tsx` gains "View register"; `components/accounts/AccountPanel.tsx` gains a "View register" button (both roles); `hooks/useAccountsScreen.ts` `AccountMenuHandlers` gains `onViewRegister(id)`.
- `help/account-register.md` (help topic) and a link from `help/chart-of-accounts.md`.
- Package files import each other relatively (`../lib/x`), never `~/tinycld/books/...`.

## Behavior
Header (always visible, never inside the scroll area)
- Back link "Chart of Accounts" (to `books/accounts`), then the title: account number (when set) and name, a type label and detail type beside it (from `accountDisplay`), and an "Inactive" label when the account is inactive.
- A balance block: "Opening balance" (before the first row of the range) and "Ending balance" (after the last row), in `formatMoney` with the account's `currency`. Ending balance is the largest figure on the screen. The block is labelled "through <range end date>" so it can differ from the Chart of Accounts figure, which counts every period including future-dated postings.
- Range select with presets, default This month: This month, Last month, This quarter, This fiscal year, Last fiscal year. Fiscal year start comes from `books_settings.fiscal_year_start_month`. Custom dates are cut (Q4).
- "New journal entry" button for writers, shown only when the registry action `journal-entry` has `available: true` (today false; `p1-journal-entries` sets it). A read-only user never sees it.

Table (wide)
- Columns: Date, Ref no. (the entry number; blank for none), Type (entry kind: "Journal entry", "Reversal", "Void reversal", "Auto reversal"), Memo (line memo, else entry memo; one line, truncated), Account (the other account of the entry, by name; "-Split-" when the entry has more than two lines), Debit, Credit, Balance. Memo gets free space first, then Account (Name-first column priority lesson); Debit, Credit and Balance never shrink and are right aligned.
- Debit and Credit headings stay the same for every account type (Q3). The running balance is signed by the account's normal side: debit-normal types add debits and subtract credits; credit-normal types the reverse (`ownBalance` from `lib/account-tree.ts`). A negative balance shows a minus sign.
- Order: a Date header press sorts newest first or oldest first (default newest first, Q5). Equal dates order by the entry's `posted_at`, then line `position`, then line id, so the running balance is deterministic. The running balance is always computed oldest to newest and only displayed in the chosen order.
- First chronological row of the range is preceded by an "Opening balance" row (balance column only) when the opening balance is not zero or the range has rows.
- Only posted lines appear (`posted = true`). Draft entries' lines never appear. A voided original stays with a "Void" label beside its type, and its reversal stays with "Reversal of <number>" in the Type cell; both count in the running balance, so they cancel (Q6).
- Rows are not pressable links to a screen. A press (click, Enter, Space) on a row opens the entry drawer (Q7). Rows are 44pt tall and use the row window (`useRowWindow`); header and totals are outside it.
- Entry drawer (core `Drawer`; inline panel beside the table on wide, overlay on tablet, bottom-anchored on phone): date, number, type, status, memo, and the entry's lines (account, debit, credit, line memo), with the line for this account highlighted. Read only. Close button. The route link to the full entry is added by `p1-journal-entries` (hand-off in the packet).

Phone
- Each line is a card: date and Ref no. on top, memo below, the other account, debit or credit amount, and the running balance on the right under the amount. Same press target (the whole card, 44pt), same drawer (bottom-anchored). The header stacks: back link, title, balance block, range select.

States
- Loading: `LoadingState` until the account, the opening-balance query and the lines query are ready; the header (back link and title when the account is known) shows meanwhile.
- Error: an alert region "Could not load this register" with a Retry button that reloads the three collections (`reloadCollections`).
- Account not found (bad id, or the account was deleted): "This account does not exist" with the back link; no table.
- Empty, account has no posted lines at all: "No transactions yet" with a "New journal entry" button for writers when available, otherwise a one-line explanation. Empty, range has no lines: "No transactions in this range" with a "Show this fiscal year" button when another preset is selected; the opening and ending balances still show (equal).
- A parent account shows its own lines only. The header says "Own transactions only" under the balance block when the account has sub-accounts (Q8).
- Access: a user with level none sees nothing from Books already (shell). A read-only user sees everything above except the New button.

## Data
- Reads (all on-demand, filtered by `where`, so only this account's rows load and subscribe):
  1. the account: `useRecord(books_accounts, id)`, giving name, number, type, detail_type, currency, inactive, parent (parent id only; "has sub-accounts" comes from a second `useLiveQuery` on accounts with `eq(parent, id)` and `limit 1`).
  2. opening balance: `books_account_balances` filtered by `account = id` and `period < <first period of the loaded range>`, aggregated with `groupBy` account and `sum` of `debit_total` and `credit_total` (the pattern of `lib/accounts-query.ts`; no rows sums to 0).
  3. lines: `books_journal_lines` where `account = id`, `posted = true`, `date >= <first day of the month of the range start>`, `date <= <range end>`. Each line materializes its entry (`date`, `status`, `origin`, `number`, `memo`, `posted_at`, `reverses`) and the entry's other lines (`account`, `debit`, `credit`) for the Account column and the drawer. The range start loads from the first of its month because balance rows are monthly: opening = balance rows before that month plus the lines of that month before the start date, computed in `lib/register.ts`; rows before the start date are then dropped from the display.
  4. `books_settings` for `fiscal_year_start_month` (read rule is the Books read level, so read-only users can read it).
- The offset account name for each row comes from the account collection by id (`useRecord` in the cell, or one accounts query held by the screen). No hand-written row types: types derive from the query result.
- Writes: none. No custom endpoint, no new collection, no migration.
- Missing relation (client side, `collections.ts`, a books-owned file): `books_journal_lines` declares `relations: { account }` only, because `books_journal_entries` is registered after it (the entries collection's back-relation `books_journal_lines_via_entry` needs the lines). The register needs the lines to reach their entry. Checkpoint 1 is a spike: (a) add an `entry` relation to the lines collection if pbtsdb accepts the cycle (the generated schema already carries both directions); else (b) a `leftJoin` from lines to entries on `eq(line.entry, entry.id)` after verifying the join drives from the filtered lines side (see the project rule on which side drives a join); if neither holds the unit stops and asks. A custom endpoint is not an option.
- Missing server data: none for the v0 columns. Not available and therefore cut: payee (no customers or vendors yet), cleared state (no reconciliation yet), document type beyond `journal` (only journal entries exist).
- Money: integer cents; display through `lib/money.ts`; running balance sums are integer additions with a guard that a result above 2^53-1 shows an error cell instead of a wrong figure (`maxStoredAmount`); no screen arithmetic on dollars.
- Realtime: a post updates its lines (`posted`, `date` are stamped at posting) and the month balance row. The register must show a newly posted line without reload; an e2e step posts through the UI of `p1-journal-entries` later; this unit tests with the harness (live collection stand-ins) that a line entering the filter appears and a changed balance row updates the opening balance.

## Cut
- Inline entry rows and the "Add <type>" dropdown (Check, Deposit, Expense, ...): transaction forms are their own units; this unit is read-only. The "New journal entry" button replaces the entry point.
- Payee column: needs customers and vendors (phase 2).
- Cleared check column, Reconcile button, "Reconciled through": reconciliation unit (phase 4).
- Bank balance line, Bank transactions button: banking unit.
- Paging control and "1-44 of 44": the row window and a bounded range replace paging.
- Filter funnel menu ("All" and per-type filters): one type of entry exists; add with the entry types of phase 2.
- Print, export, column-settings icons: reports unit owns print and export; columns are fixed.
- Account switcher in the header: the Chart of Accounts is one tap away; a switcher is a second tree picker to build.
- Custom date range: needs a date input outside the forms engine plus zod; presets cover v0 (Q4).
- Two-line row layout: needs a taller fixed row and halves rows per screen; the one-line row plus the drawer holds the same information.
- Search inside a register, edit or void from the register, drag to reorder.
- Including sub-account lines in a parent's register.

## Platform notes
none. The table scrolls vertically and (when narrower than its column minimums) sideways on both platforms; the drawer, range select and rows are core components with 44pt targets; no hover-only control; row press has keyboard activation on web (Enter, Space) and is a tap on native.

## Sparks carried
Balance after each row readable at a glance and the ending balance is the largest figure (header `text-2xl font-semibold`, `formatMoney`); two fixed right-hand Debit and Credit columns (`BALANCE_CELL_STYLE` pattern); column titles always visible (header outside the scroll area). All three are expressible with existing tokens and core components; no core extension.

## Non-goals
Editing or voiding from the register; creating any transaction; reconciliation; printing or exporting; multi-currency display; opening-balance entry (`p1-opening-balances`); the entry screen itself (`p1-journal-entries`); a payee column; filters beyond the date range; a roll-up register for parent accounts.
