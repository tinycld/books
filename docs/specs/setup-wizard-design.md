# Books setup wizard

## Goal
Take an admin from an empty Books install to a usable ledger: name the business, pick the fiscal year start, and create the starter US small-business chart of accounts.

## Where it lives
One component, `SetupAccountingStep`, rendered in two places:
- core's first-run setup wizard, as a package step (`manifest.setupSteps`: `{ id: 'accounting', label: 'Accounting', module: 'setup/accounting', order }`), route `/a/setup/books.accounting`.
- inside Books, route `/a/books/setup`, for a Books install added after the org wizard finished.
Books opens `/a/books/setup` from a card at the top of the Lists hub while setup is not done. Only Books admins see the card and the route's form. Everyone else sees "A Books admin must finish setting up Books."

## Behavior
- The step shows a progress label ("Part n of 3") and three parts, one per screen: Business, Ownership, Starter chart.
- Business: Legal business name (required, max 200) and Fiscal year starts in (month select, default January). The currency line reads "US dollars (USD)" and is not editable.
- Ownership: "How is the business owned?" with two cards: "One owner or partners" (equity accounts Owner's equity, Owner's contributions, Owner's draws) and "Corporation" (Common stock, Paid-in capital, Retained earnings). The choice only decides those equity accounts.
- Starter chart: shows the accounts to be created, grouped Assets, Liabilities, Equity, Income, Expenses, with a count per group. The list is read-only. Back returns to Ownership.
- Create runs one batch: the settings row first (business name and fiscal year), then parent accounts, then sub-accounts, then the settings row again to mark setup done. Progress shows "Creating accounts n of N", where N is the whole chart and accounts that already exist count as done.
- A failure stops the batch, names the account that was refused with the server's message, and offers Try again. Try again skips accounts that already exist (matched by number) and continues.
- Done screen: "Your books are ready" with the account count, and two actions: Open Chart of Accounts, Enter opening balances (shown only when that screen is available).
- Skip: "Start with an empty chart" on the Starter chart screen sets only the settings row, so the admin can build or import a chart. Skip is not offered on a batch left half done.
- A chart that already has accounts when the step opens: the Starter chart screen is replaced by "This book already has N accounts. We will not add the starter chart." Create saves only the settings. A book whose settings hold a business name but are not marked done is a batch left half done: it shows the Starter chart screen, and Create resumes it, skipping accounts that already exist, and the Ownership choice is read back from the equity accounts already created.
- The step is done when `books_settings.setup_completed` is true (`useIsStepDone`). It is visible only to Books admins (`useIsStepVisible`).
- Empty, loading, error: loading shows a skeleton card; a settings load failure shows a Retry through `recoverLiveQueries`.
- Phone: one column, Back and Next under the form. Wide: a centered card, 640 wide.

## Data
Reads `books_settings` (the one row), `books_accounts` (count only), `useBooksAccess`. Writes through `useMutation` generators: `books_accounts` inserts (`newRecordId()` ids so a sub-account names its parent), then a `books_settings` update. New settings fields: `business_name` (text, max 200) and `setup_completed` (bool). Edited into migration `2100000001_create_books_settings.js` in place (Books is unreleased). The starter chart is a typed constant, `lib/starter-chart.ts`, whose type and detail keys are checked against `ACCOUNT_TYPES` in a unit test. No new endpoint.

## Cut
- Per-account ticks in the preview: the chart can be edited after creation.
- Industry search and industry-specific charts: "Later" in the spec.
- "Is it an LLC", tax filing status, and other entity questions: nothing in v0 reads them.
- Setup checklist after the wizard: v1.1.
- Logo and brand color: core organization settings own them.
- Opening balances entry: its own unit, linked from Done when available.

## Platform notes
none

## Sparks carried
- One decision per screen with a visible position: core's `StepHeading`, `SetupContinueButton`, and the wizard shell's progress label (expressible).
- Choice cards with a clear selected state: `RadioInput` card variant if it exists, else `ButtonGroup` (expressible; confirm at build).

## Non-goals
Editing setup later (Settings unit), re-running the starter chart on a populated book, multiple currencies, importing the chart from a file here (Chart of Accounts has Import).

## Design gate answers
Direction A. Questions 1-6 accepted as recommended.
