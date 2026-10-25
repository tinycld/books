# Opening balances

## Goal
Let a bookkeeper enter the balance of every balance-sheet account as of one starting date, see the effect on the Balance Sheet as they type, and post it to the ledger as one balanced journal entry.

## Design decisions (design gate)
Direction A picked: one grid with a live Balance Sheet preview rail (a collapsible section on phones). Questions Q1-Q7 accepted as recommended: (1) new `origin` value `opening_balance` with a one-at-a-time Go guard, edited in the unreleased ledger migration; (2) the first save creates Opening Balance Equity when absent; (3) balance-sheet accounts only; (4) the preview shows only this entry's effect; (5) entry point is a Chart of Accounts toolbar link; (6) the server refuses a replacement with a different origin, and Journal Entries hides Edit as a hand-off; (7) `MoneyInput` is built here as a standalone component, with no `waits_for`.

## Where it lives
`books/tinycld/books/`:
- `screens/opening-balances.tsx` (route `/a/books/opening-balances`; optional search param `edit=1` for a replacement of a posted entry).
- `components/opening-balances/` (OpeningBalancesScreenView, OpeningBalancesHeader, OpeningDateFields, OpeningAccountTable, OpeningAccountRow, OpeningAccountCard, OpeningSectionBand, OpeningPreview, OpeningTotals, OpeningActionBar, OpeningPostedView, DiscardDraftDialog, OpeningEmptyState), `components/MoneyInput.tsx`.
- `hooks/useOpeningBalancesScreen.ts` (queries, access, view state), `hooks/useOpeningBalancesForm.ts` (form, save, post, discard).
- `lib/opening-balances.ts` (pure: pick the accounts, build lines and the balancing line, preview sections, diff against saved lines), `lib/opening-balances-schema.ts` (zod), `lib/opening-balances-messages.ts`, `lib/opening-balances-fixture.ts`.
- Edit `components/accounts/AccountToolbar.tsx`: a secondary link "Opening balances" to `books/opening-balances` (writers and read-only users both see it; it opens the read-only view for read-only users).
- Edit `lib/register.ts`: `originLabels.opening_balance = 'Opening balances'` so the register Type column names the entry.
- Server `server/opening_balances.go` (guards) and edits in `server/entries.go`, `server/reversal.go`; migration edit in place in `pb-migrations/2100000002_create_books_ledger.js` (the ledger migration is unreleased).
- `help/opening-balances.md`, linked from `help/chart-of-accounts.md` and `help/navigating-books.md`.
- Package files import each other relatively, never `~/tinycld/books/...`.

## Behavior
Screen states (one derived value, computed during render from the queries and the `edit` param, never `useEffect` plus `setState`)
- Loading: `LoadingState` until accounts, settings and the opening-entry query are ready. The header shows meanwhile.
- Error: when a query reports an error, an alert "Could not load opening balances" with a Retry button that runs core `recoverLiveQueries` over the screen's queries and sources.
- No balance-sheet accounts (the chart has none): `EmptyState` "No accounts to enter balances for" with a link "Go to Chart of Accounts".
- New (no opening entry): the form is blank.
- Draft (an opening entry with status `draft`): the form is seeded from the draft's date, memo and lines. A draft whose `replaces` is set shows a notice "Posting this replaces JE-1046. The posted balances stay until you post."
- Posted (an opening entry with status `posted`, no draft): the read-only view (see below). A read-only user sees this view for a draft too.
- A draft always wins over a posted entry when both exist (a replacement is in progress).
- Not found cannot happen: the route has no id.

Header (outside the scroll area)
- Back link "Chart of Accounts" (to `books/accounts`), title "Opening balances", a one-line explanation "Enter what each account held at the end of your starting date. Books posts one journal entry and balances it with Opening Balance Equity."

Starting date block
- A preset select "Starting date" with options "End of last fiscal year" (default for a new entry), "End of last month", "Custom date". Choosing a preset sets the date through the select's `onValueChange` (no `watch` or effect); typing in the date field sets the select to "Custom date" in the same way.
- A date field "Balances at end of day" showing and taking `YYYY-MM-DD` text (an accounting date has no time zone). Under it, the helper text "Balances at end of day Dec 31, 2025" through `formatDay`. A new entry opens with the date of the "End of last fiscal year" preset from `rangeForPreset('last-fiscal-year', todayIso(), fiscalStartMonth(settings)).end`.
- A "Memo" text field, default "Opening balances as of Dec 31, 2025" (kept in step with the date until the person edits the memo: the default is computed during render when the memo field is untouched, and written to the form only on save).
- Validation: the date is a real calendar day and is after the close date. When `books_settings.close_date` is set and the date is on or before it, the field shows "Books are closed through Mar 31, 2025. Pick a later date." The server stays the authority and its refusal is shown if different.

Account grid (the amount entry)
- Lists active balance-sheet accounts (group asset, liability or equity) in three bands, Assets, Liabilities, Equity, each band sticky with its subtotal. Sub-accounts sit under their parent, indented by level, siblings in account-number order (blank last), then name (the chart's tree order from `lib/account-tree.ts`). The Opening Balance Equity account itself is not in the grid; its amount is computed. An inactive account is listed only when the saved draft or posted entry already has a line on it; it is dimmed with an "Inactive" label.
- Wide: a table with columns Account (number then name), Detail type, Amount. Amount is an input, right aligned, fixed width, non-shrinking; the header is inside the scroller and sticky; cell style constants are exported and shared by header and rows (Account 3 : Detail type 2 flex grow, Amount 168). Phone: a card per account with the number and name, the type label beneath, and the amount input full width under them.
- Amount input (`MoneyInput`): a text input that accepts "1,234.50", "$1,234.5" and "-250" through `parseMoney`, shows the formatted figure on blur, 44pt minimum height, numeric keyboard on native, `returnKeyType="next"` to the next amount. An empty amount or 0 means no line.
- Each band has a one-line caption: Assets "Enter what each account holds", Liabilities "Enter what you owe", Equity "Enter the owners' share". A negative amount means the opposite side of the band's normal side (for example accumulated depreciation under Assets).
- Accounts receivable and accounts payable rows show the helper text "No customer or vendor detail". Bank, credit card and loan rows need no helper.
- Search: none. The grid scrolls, and its rows render through `useRowWindow` like the register.
- Read-only users see the amounts as text, never an input.

Preview (the Balance Sheet effect)
- Titled "Balance Sheet", subtitle "As of Dec 31, 2025", with the label chip "Preview". It lists the same three sections with only accounts that have a non-zero amount, each section total, and, inside Equity, the row "Opening Balance Equity" with the balancing amount. A last row "Total liabilities and equity" equals "Total assets" by construction and carries the success tone.
- Wide: a sticky rail at the right of the grid. Phone: a collapsed section "Preview" below the grid (a core disclosure row) that opens in place; the totals strip below it always shows the three numbers.
- The preview reads the form values with `useWatch` and one pure function; it never stores its own copy.
- Empty preview (no amount typed): "Type a balance to see the preview." with the Opening Balance Equity row hidden.
- The preview shows only this entry's effect, not other posted activity (Q4).

Totals strip (outside the scroll area, above the action bar)
- "Assets", "Liabilities", "Equity (including Opening Balance Equity)", all as `formatMoney`. When a sum, or the balancing amount, passes `maxStoredAmount`, the strip shows "Too large" in the destructive tone and blocks Save draft and Post. All sums are integer cents through `lib/opening-balances.ts`; no screen does arithmetic on dollars.

Action bar (sticky, outside the scroll area; writers only)
- Wide: Cancel, Discard draft (only for a saved draft), Save draft, Post. Phone: Cancel, Save draft, Post, with Discard draft in a More menu.
- Cancel with unsaved changes asks to discard through `ConfirmDialog`; otherwise it goes back.
- Save draft writes the entry and lines (see Data) and keeps the screen on the draft. Post saves, then posts, then shows the posted view.
- Post is disabled until at least one account has a non-zero amount. The balancing line makes debits equal credits, so an unbalanced entry cannot be built; the server still checks.
- The button labels read "Saving..." and "Posting..." while a write runs; both buttons are disabled; a second press while a write runs is ignored (a ref guard, as in `useAccountForm`).
- Server refusals (closed period, amount too large, inactive account, a second opening entry, entry total over the stored maximum) go through `handleMutationErrorsWithForm` into `FormErrorSummary`; a refusal without a field is a root message. A failed post leaves the saved draft and shows the server message.

Posted view (read-only)
- Header title "Opening balances", a "Posted" badge, "JE-1046 · Dec 31, 2025 · posted by Ann Lee on Oct 24, 2025". The grid is replaced by the same three bands with amounts as text (only non-zero accounts) and the Opening Balance Equity row, with the same totals strip. The preview rail is not shown (the bands are the preview).
- Writers get "Edit balances" (to `?edit=1`). It opens the form seeded from the posted lines with the notice "Posting this replaces JE-1046 under the same number. The original is voided." Nothing is written until Save draft or Post. A "Back" action returns to the posted view.
- A link "View journal entry" opens `books/entries/<id>` when the Journal Entries screen is available (`SIDEBAR_ENTRIES` `entries.available`); otherwise the link is not shown.

Access
- Level none sees nothing from Books (shell). Read-only: the screen opens in the read-only layout (amounts as text, no action bar); with no opening entry the message is "No opening balances have been entered." Bookkeeper and admin: everything above. Close-date overrides are not offered here.

Platform
- The same screen works on web and native. Only core inputs are used; the date is typed text with the preset select; no drag, hover or file API.

## Data
Reads (all `useLiveQuery` through `useStore`, row types derived from the queries):
- `books_accounts`: id, name, number, type, detail_type, parent, inactive, currency. No `where` (accounts are few, same as the chart). A pure function in `lib/opening-balances.ts` keeps the active balance-sheet accounts, finds the Opening Balance Equity account (type `equity`, detail type `opening_balance_equity`, active) and builds the tree order by `lib/account-tree.ts`.
- `books_journal_entries`: where `origin = 'opening_balance'` and `status != 'void'`, ordered by created, limit 2 (at most one posted entry and one draft replacement exist, by the server guard below). Fields: id, date, memo, status, number, replaces, posted_at, and `posted_by` through `materialize()` of the user for the posted view.
- `books_journal_lines`: where `entry = <current entry id>`, ordered by `position`. The query is disabled until an entry id is known (blank ids match nothing useful; follow `useAccountUsage`).
- `books_settings`: the one row (close_date, fiscal_year_start_month, currency).
- No balance rows are read (Q4).

Writes (`useMutation` generators from `@tinycld/core/lib/mutations`; no custom endpoint):
- Opening Balance Equity account, only when absent: insert into `books_accounts` {name "Opening Balance Equity", type `equity`, detail_type `opening_balance_equity`, inactive false}. If another session created it first, the server's duplicate-name refusal triggers one re-read and the save continues with that account.
- Save draft, new: insert the entry {date, memo, status `draft`, origin `opening_balance`, `replaces` when the person is editing a posted one}, then insert one line per non-zero account {entry, account, debit, credit, memo "", position} plus the balancing line, yielded sequentially.
- Save draft, existing draft: update the entry's date and memo; lines are diffed by account (`diffLines` in the lib): update changed amounts, insert new accounts, delete removed ones; the balancing line is recomputed and updated or inserted or deleted.
- Post: update the entry `status` to `posted` after the save. The server posts it inside one transaction (balance check, close date, accounts, month balance rows, number).
- Discard draft: delete the draft entry (its lines cascade). A replacement draft's discard leaves the posted original untouched.
- Money: integer cents everywhere (PocketBase number fields are float64 and exact only up to 2^53-1). `lib/opening-balances.ts` takes amounts from `parseMoney` (which returns integer cents and refuses above `maxStoredAmount`), derives debit or credit from the account's `normal` side and the amount's sign, refuses a line above 10^15 cents (the server's `maxAmount`), and sums with an overflow guard. The balancing line is `|total debits - total credits|` on the side that equalizes. The entry is limited to 1000 lines by the server; the screen blocks Save and Post above 999 amounts (plus the balancing line) and says so.
- The line `currency` and the entry `currency` are stamped by the server.
- Entry save is not atomic across the entry and its lines; a partial save leaves a draft the person sees and re-saves. Posting is atomic on the server.

Server changes (this unit owns them; the ledger migration is unreleased, so it is edited in place):
- `books_journal_entries.origin` gains the value `opening_balance`; the create rule allows it as a draft origin (`@request.body.origin = "opening_balance"`); `checkNewEntry` treats it like `manual` (it may not name an entry it reverses).
- Guard `checkOpeningEntry` (new file `server/opening_balances.go`): on create, and again at post, an `opening_balance` entry is refused when another non-void opening entry exists other than the one it `replaces`: "Opening balances are already entered (JE-1046). Edit that entry." Both checks run inside `serialized` (the create hook is wrapped; the post path already runs inside it), so two sessions cannot both slip in.
- Guard in `voidReplaced` (`server/reversal.go`): a correction must have the same origin as the entry it replaces. This keeps a journal-entries "Edit" from turning an opening entry into a manual one; its refusal reads "An opening balance entry can be edited only on the Opening balances screen."
- Go tests (written first, from a different agent): posting an opening entry through the real path; second opening entry refused at create and post; replacement allowed and takes the number; origin mismatch refused; closed date refused; overflow refused; the guard under the race harness.

Help topic `opening-balances` in `books/help/`.

## Cut
- Income and expense accounts: opening balances apply to balance-sheet accounts only (Q3). Mid-year profit and loss history belongs to the QuickBooks full-history import.
- The "Starting date and opening balance" block inside New account / Edit account (the screenshots): the chart's account panel keeps no money field. One screen holds one entry, so replacing the posted entry on each account save would void an entry per save.
- A separate date per account: one entry has one date.
- Balances of other posted activity in the preview, and the "as of today" Balance Sheet (Q4): the reports unit owns the full report.
- Customer and vendor detail for accounts receivable and accounts payable, open invoices, open bills: phases 2 and 3.
- CSV or QuickBooks import of opening balances: `p6-qbo-cutover-import`, which will write an `opening_balance` entry through the same collections.
- Searching the grid and filter chips: the grid is a bounded list of balance-sheet accounts.
- A "More info on opening balances" link: replaced by the in-app help topic and a help icon in the header.
- Per-account register link from a row: the chart already opens the register.
- Opening Balance Equity clean-up (moving the balancing amount to Owner's equity): a journal entry, from the Journal Entries screen.

## Platform notes
None. Both platforms get every behavior. No single-platform item is requested.

## Sparks carried
Live Balance Sheet preview in the report's own shape (`bg-surface-secondary`, `border-border`, `formatMoney`, `text-success` on the reconciled total, `text-destructive` for negatives); the "Preview" label chip (`bg-accent text-accent-foreground`); the date stated in words beneath the field (`text-muted-foreground`, `formatDay`). No core extension.

## Non-goals
Income and expense balances; customer and vendor balances; per-account dates; multi-currency; import; editing the close date; clearing or moving the Opening Balance Equity amount; viewing the whole Balance Sheet; an audit view; deleting a posted opening entry (a posted entry is replaced or voided, never deleted).
