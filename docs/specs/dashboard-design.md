# Dashboard — design

Unit p5-dashboard, package `books`. Built against books main@be085578, core main@72b8c6f9 (both contain books#88 and core #515). Source: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Dashboard (Invoices, Expenses, Bank accounts, P&L, Sales; toggle, reorder, hide-amounts)") and §Interface (the sidebar starts with Dashboard). Design gate 2026-11-22: the human picked artboard direction A, accepted the recommended answer to all 15 open questions, and declined the line/ring chart core extension.

## 1. Goal

One page that tells a Books user how the business stands now (money owed, money in the bank, profit, sales, spending), which each user arranges for themself.

## 2. Where it lives

- Route `/a/books/dashboard`, screen `books/tinycld/books/screens/dashboard.tsx`.
- Sidebar: a new first entry `dashboard` ("Dashboard", lucide `LayoutDashboard`) in the top group of `SIDEBAR_ENTRIES`, above Banking. Shown to every Books reader.
- The bare `/a/books` lands on the dashboard: `screens/index.tsx` calls `useLandOnRoute('dashboard')` in place of `useLandOnRoute('lists')`. The Lists hub stays at `/a/books/lists` and in the sidebar.
- No + New item and no Lists hub card. The phone New button (FAB) shows on the dashboard, as on a list.

## 3. Behavior

### The page

- The page shows the heading "Dashboard", a "Hide amounts" switch, a "Customize" button, and the shown widgets in the user's order.
- The widgets lay out in a grid: three columns at 1100 px of page width and wider, two columns from 700 px, one column below. A widget is a card with the same width as its column; a row's cards share the height of the tallest. The page scrolls down; nothing scrolls sideways.
- The five widgets are Invoices, Expenses, Bank accounts, Profit and loss, Sales. That is the default order, and all five show by default.
- Every amount is in the book's currency (`books_settings.currency`) and drawn with `amountText` (`lib/money.ts`). A zero amount draws as the currency's zero ("$0.00"), never as blank.
- Every figure is live: a post, a void or a payment anywhere in Books changes an open dashboard with no reload.
- "Today" is the device's day (`todayIso()`), as on the customer page.

### Customize (toggle and reorder)

- "Customize" puts the page in edit mode. In edit mode the grid is replaced by one list with a row per widget, in the user's order, hidden widgets included: a drag handle, the widget name, "Move up" and "Move down" buttons, and a "Show" switch. The header's Customize button becomes "Done".
- Dragging a row by its handle changes the order (core `SortableList`); "Move up" and "Move down" do the same by one place and are disabled at the ends.
- Each change (a switch, a drop, a move) is saved at once. "Done" leaves edit mode; there is no Cancel.
- "Reset to default" in edit mode restores the default order and shows all five widgets. It does not change Hide amounts or a widget's period.
- When every widget is hidden, the page outside edit mode shows "All widgets are hidden." with a "Customize" button.
- Edit mode is not kept: leaving the screen or reloading returns to the normal page.

### Hide amounts

- With "Hide amounts" on, every money figure on the dashboard draws as "•••••" (a fixed five dots, whatever the amount) and every percent as "••%". Counts ("3 overdue invoices", "12 to review") and account names stay.
- Bars and columns stay drawn; a column's value label and a bar's amount are masked.
- The switch is saved for the user and applies on every device.

### What is saved

- One preference per user: the order, the hidden widgets, hide-amounts, and the chosen period of Profit and loss, Expenses and Sales. It follows the user to any device.
- A stored value that does not parse falls back to the defaults. A widget id the stored order does not hold (a widget added later) goes to the end, shown; an unknown id is dropped.
- A change made before the preference has loaded is not offered: the switch, the Customize button and the period pickers are disabled until it loads.
- A failed save shows the toast "The dashboard change was not saved." and the control returns to the saved value.

### Invoices widget

- "Unpaid": the total open balance of posted invoices, with one bar split into Overdue (due date before today) and Not due yet, and both amounts under the bar.
- When any invoice is overdue, a line "N overdue invoices" in the danger tone shows above the bar.
- "Paid, last 30 days": the total of posted received payments dated in the last 30 days (today and the 29 days before it).
- "Waiting to deposit": the current balance of the Undeposited funds accounts. The line shows only when that balance is not zero; with write access it is a link to a new bank deposit (`books/deposits/new`).
- "View invoices" opens the Sales list on its Invoices tab (`books/invoices`). "A/R aging" opens the shipped A/R Aging report when the user can open it; when not, the link is absent.
- Empty (no posted invoice has an open balance and no payment in the last 30 days): "No unpaid invoices." With write access, a "Create invoice" button (`books/invoices/new`).

### Expenses widget

- A period picker: This month, Last month, This quarter, This fiscal year (default), Last fiscal year.
- "Total expenses": the net debit of all accounts of type Cost of goods sold, Expense and Other expense in the period.
- Below it, the four largest top-level accounts by amount, each a row with the account name, a bar whose length is its share of the largest, and its amount; a sub-account counts toward its top-level parent. When more than four have an amount, a fifth row "Everything else" sums the rest. An account with a net credit in the period is listed in "Everything else".
- "Expenses by vendor" opens that shipped report when the user can open it.
- Empty (no expense-side balance in the period): "No expenses in <period label>." With write access, a "Record expense" button (`books/expenses/new`).

### Bank accounts widget

- One row per active account of type Bank or Credit card, in chart order: the account's number and name, and its balance in the books. A row opens the account's register (`books/accounts/<id>`).
- A row of a connected account with transactions for review shows "N to review" under the name; that text opens Banking on that account (`books/banking?account=<connection id>`).
- The widget shows at most six rows. With more accounts, a last row "N more accounts" opens the Chart of Accounts.
- "Go to Banking" opens `books/banking`.
- The widget does not show a bank's own balance: Books has none.
- Empty (no active Bank or Credit card account): "No bank accounts." With write access, a "Chart of Accounts" button.

### Profit and loss widget

- A period picker with the same five periods as Expenses; default This fiscal year.
- "Net profit": income minus expenses for the period, on the accrual basis. A loss draws with the minus sign and the danger tone.
- A comparison line: "Up N% from the year before" or "Down N% from the year before", against the same period one year earlier. With no figure in the earlier period the line is absent.
- Two bars, "Income" (accounts of type Income and Other income, net credit) and "Expenses" (the same total as the Expenses widget for the same period), each with its amount; the longer bar is full width and the other is in proportion.
- "Profit and Loss report" opens the shipped Profit and Loss report with the widget's period set, when the user can open it.
- Empty (no income and no expense in the period): "Nothing posted in <period label>."

### Sales widget

- A period picker: Last 6 months (default), Last 12 months, This fiscal year.
- "Total sales": the net credit of all accounts of type Income in the period (accrual). Other income is not sales.
- One column per calendar month of the period, the column's height in proportion to the month's sales against the largest month; the month's short name under each column. A month with zero or negative sales draws a baseline mark only. Pressing or focusing a column shows that month's amount in a line above the columns ("Sep 2026: $4,200.00"); with none picked the line shows the latest month.
- "Sales by customer" opens that shipped report when the user can open it.
- Empty (no income in the period): "No sales in <period label>." With write access, a "Create invoice" button.

### States

- Loading: each widget shows its title and a skeleton block of its own height until its own reads are ready; widgets load independently.
- Error: a widget whose read failed shows "This widget could not load." and a "Retry" button that restarts its failed reads (`recoverLiveQueries` over `mergeRecoveries`). The other widgets are not affected.
- A failed preference read shows the default arrangement with a banner "Your dashboard settings could not load." and "Retry"; the Customize and Hide amounts controls stay disabled until it loads.
- Access: every user with Books access sees the dashboard and saves their own arrangement, read-only users included. Buttons that create a record show only with write access (`useBooksAccess().canWrite`).
- Phone (below the mobile breakpoint): one column; the header keeps the "Hide amounts" switch and puts Customize beside it as an icon button with the label "Customize"; edit-mode rows keep the handle, the Move buttons and the switch.

## 4. Data

### Collections read (all through pbtsdb live queries; no new endpoint)

- `books_account_balances` joined to `books_accounts` (`type`, `detail_type`, `parent`, `number`, `name`, `inactive`): one live query for the Profit and loss, Expenses and Sales widgets, filtered to `month_start >=` the earliest month any of the three needs (the start of the comparison period). At most accounts × 36 months of rows. The widgets sum `debit_total` and `credit_total` in pure helpers, in integer cents.
- `books_account_balances` for the Bank accounts widget and the Undeposited funds line: the existing `accountsWithBalances` (`lib/accounts-query.ts`) over active Bank, Credit card and Undeposited funds accounts (all periods of those accounts only).
- `books_bank_connections` with the for-review count: the existing `useBankConnections` (`bankConnectionsQuery`, `reviewCount`).
- `books_invoice_due_totals` (new view): one row per due date of the posted invoices with an open balance.
- `books_payment_day_totals` (new view): one row per date of the posted received payments.
- `books_settings` (`currency`, fiscal start month) through `useBooksSettings`; `books_access` through `useBooksAccess`.
- `reports` (core) through `useShippedReportHref` for the four report links.
- `user_preferences` (core) through `useUserPreference('books', 'dashboard', DEFAULT_DASHBOARD_PREFS)`. Its rules admit each signed-in user's own rows, so read-only users and bookkeepers can save.

### New views — migration `books/pb-migrations/2100000041_create_books_dashboard_views.js`

Both are grouped SELECTs with no UNION, list and view rule READ (as `books_party_balances`).

- `books_invoice_due_totals`: `id` = the due date, `due_date` (text day), `balance` (integer cents, the sum of `books_invoices.balance`), `count` (integer). Rows: posted invoices with `balance > 0`, grouped by `due_date`.
- `books_payment_day_totals`: `id` = the date, `date` (text day), `amount` (integer cents, the sum of `books_payments.amount`), `count` (integer). Rows: posted payments, grouped by `date`. The client filters `date >=` today minus 29 days.

Server (`books/server/dashboard.go`): `changesignal.RegisterView("books_invoice_due_totals", "books_invoices")` and `changesignal.RegisterView("books_payment_day_totals", "books_payments")`, bound from `Register`; both views get read access in `oauth_scopes.go` for `books:read`; `TestRegister_BindsEachPartOnce` gains the part. Client collections declare `liveTopics: ['collection/<view>']`. No audit, quota or search registration: a view holds no record of its own.

### Preference shape

`{ order: WidgetId[]; hidden: WidgetId[]; hideAmounts: boolean; periods: { profitAndLoss: PeriodId; expenses: PeriodId; sales: SalesPeriodId } }`, parsed by a zod schema (`lib/dashboard-prefs.ts`) with the fallbacks of §3 "What is saved". One row per user (`app = 'books'`, `key = 'dashboard'`); each change writes the whole value through the setter of `useUserPreference` (one insert, later updates).

### Writes

Only the preference row. Nothing on the dashboard writes to the ledger.

### Periods

Whole calendar months only, so the monthly balance rows answer every period. Fiscal-year periods use the book's fiscal start month (`fiscalStartMonth`, `lib/register-range.ts`). "This quarter" is the fiscal quarter that holds today. A period's label is its preset name; the empty text uses it in lower case.

### Seed and fixture

`seed.ts` already posts invoices, payments, expenses and connects bank accounts; the fixture `lib/dashboard-fixture.ts` (phase 3 pass 2) holds the widget models for the populated, empty, loading, error, hidden-amounts and edit-mode states.

### Help

`books/help/dashboard.md` (topic `books:dashboard`): what each widget counts (accrual, which account types), how to show, hide and reorder widgets, and Hide amounts.

### Tests

- Unit (vitest, pure): period ranges, the balance sums per widget (signs, sub-account roll-up, "Everything else", comparison percent, zero and negative months), preference parsing and its fallbacks.
- Go: the two views (rows, grouping, a void and a payment change them, change signal topics), `TestRegister_BindsEachPartOnce`.
- E2E `tests/e2e/dashboard.spec.ts`: `/a/books` lands on the dashboard; a posted invoice moves Unpaid live; hide and show a widget, Move up, and Hide amounts survive a reload; the preference is restored in `afterEach`; one run at 390 x 844 (one column, phone header, edit mode).

## 5. Cut

- The bank's own balance beside the books balance — Books has no bank-reported balance (live feeds are "Later").
- "Connect accounts" and "Bring in transactions automatically" — live bank feeds are "Later"; "Go to Banking" covers file import.
- The Shortcuts widget — the + New menu already holds every create action.
- The Cash flow trend widget and the Cash flow and Planner tabs — not in the Books spec's widget list.
- Resizing a widget — the Books spec lists toggle, reorder and hide-amounts only.
- The refresh mark and "Data updated a few seconds ago" — every figure is live.
- The line chart and the ring chart — spark 3 declined; month columns and ranked bars replace them.
- "Paid" split into Deposited and Not deposited by payment — replaced by the "Waiting to deposit" balance line.
- A cash-basis switch on the dashboard — widgets are accrual; the linked report has the Method choice.
- Custom date ranges and day-level periods ("Last 30 days") in the Profit and loss, Expenses and Sales widgets — the widgets read monthly balance rows.

## 6. Platform notes

None. Drag reorder works on web and native (core `SortableList`); Move up and Move down give the keyboard and screen-reader path on both. The dashboard registers no keyboard shortcut.

## 7. Sparks carried

1. One large figure leads each widget — `text-3xl font-semibold text-foreground tabular-nums` under a `text-xs uppercase text-muted-foreground` title, in a card `rounded-xl border border-border bg-surface p-4`.
2. A split is one proportional bar — `View`s with `flex` weights, `h-3 rounded-full`, on a `bg-surface-secondary` track; fills `bg-danger` (overdue), `bg-primary` (not due yet, expense rows, sales columns), `bg-success` (income), `bg-info` (expenses in Profit and loss). `bg-info` is in no scanned Books file yet, so the scratch route cannot use it before a shipped file does (lesson 14).
3. Line and ring charts — dropped (no core extension).

## 8. Non-goals

- No new API route and no report-engine run from a widget: every figure is a live query.
- No per-book or admin-set default arrangement; no shared dashboards.
- No drag of a card inside the grid: order changes only in edit mode.
- No drill from a bar or column to a transaction list; the links named in §3 are the only navigation.
- No change to the Lists hub, the + New menu or any report.
- No dashboard for users without Books access (core's package gate already stops them).

## 9. Engine reach (self-review item 5)

- Reorder: core `SortableList` + `SortableDragHandle` (`@tinycld/core/components/SortableList`), as `NavigationSection` uses them in-page (not inside an overlay).
- Switches: core `Switch` (`@tinycld/core/ui/switch`). Period picker: core `Menu` (`@tinycld/core/ui/menu`).
- Preference: `useUserPreference` (`@tinycld/core/lib/use-user-preference`); one row, whole-value write; its setter is a no-op until the row has loaded, which is why the controls stay disabled until then.
- Live views: `changesignal.RegisterView` (core Go) + pbtsdb `liveTopics`.
- Error recovery: `recoverLiveQueries` (`@tinycld/core/lib/recover-live-queries`) with Books `mergeRecoveries`.
- Report links: Books `useShippedReportHref` + `reportParamQuery`; the period value is written with core `encodeParamValue` (`@tinycld/core/reports/lib/view-url`).
