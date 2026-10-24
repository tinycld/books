# Account register — checkpoint plan

Package: `books` (dir `books/`). Feature: `account-register`. Spec: `docs/specs/account-register-design.md`. Paths below are relative to the package root. Source lives in `tinycld/books/`. Package files import each other relatively (`../lib/x`), never with `~/tinycld/books/...`. Every screen works on web and native. No raw hex: semantic Tailwind tokens or `useThemeColor` (a test checks every colour utility against `global.css`, so no undefined tokens). No `console.*`. Data goes through pbtsdb (`useStore`, `useLiveQuery`, `useRecord`). This unit has no writes, no migration, no new collection and no custom endpoint. Row types derive from the query result; no hand-declared row interface. No `useState` + `useEffect` sync.

Reference screenshots live in `docs/plans/account-register-reference/` as `<shot>-<width>-<scheme>.png` (shots `populated`, `populated-drawer`, `empty`, `empty-range`, `error`, `not-found`; widths 390 and 1280; schemes light and dark). `lib/account-register-fixture.ts` holds the data they show. The scratch route `tinycld/books/screens/helix-mockup.tsx` is a structure aid only; it is git-excluded and deleted at the end, so no checkpoint imports from it. Build from the screenshots and the fixture.

Review mode: C (unattended).

## Decisions that apply to every checkpoint

- **Dates are ISO strings** (`YYYY-MM-DD`; a period is `YYYY-MM`). No `Date` arithmetic outside `lib/register-range.ts`. Tests pass `today` in; no test reads the clock.
- **Fiscal quarters.** "This quarter" is the fiscal quarter: quarters count from `fiscal_year_start_month`. With a start month of 1 they equal calendar quarters.
- **Range end.** A range that contains today ends today (This month, This quarter, This fiscal year). A past range ends on its last day (Last month, Last fiscal year). The header label "through <range end date>" shows `range.end`.
- **Month-aligned load.** Balance rows are monthly, so the lines query starts at the first day of the month of `range.start`. `lib/register.ts` folds the lines of that month that sit before `range.start` into the opening balance and drops them from the display.
- **Own lines only.** A parent account's register shows its own lines; sub-account lines never load.
- **Money** is integer cents. Display goes only through `formatMoney(cents, currency)` from `lib/money.ts`. Running sums are integer additions; a result above `maxStoredAmount` makes that row's balance `null`, which the UI shows as an error cell ("Too large").
- **Signed balance.** `ownBalance(type, debitTotal, creditTotal)` from `lib/account-tree.ts` signs every figure by the account's normal side.
- **Test harness.** Pure logic is tested directly. Query and realtime tests use real TanStack DB local-only collections and `tests/accounts-form-harness.ts` (`seedBooks`, `useStoreStub`); nothing of ours is mocked. Front-end behaviour is covered by the e2e in checkpoint 5 (desktop and a 390x844 phone viewport), not by component vitest tests.
- **Tap targets** are 44pt: rows, cards, the range select, the sort header, drawer close, Retry and every button.
- **Core reuse.** `Drawer` family from `@tinycld/core/ui/drawer`, `PickMenu` from `@tinycld/core/ui/pick-menu`, `Menu` from `@tinycld/core/ui/menu`, `Button`/`ButtonText` from `@tinycld/core/ui/button`, `LoadingState` from `@tinycld/core/components/LoadingState`, `useBreakpoint`/`useWindowHeight` from `@tinycld/core/components/workspace/useBreakpoint`. All props are required unless the existing component already makes them optional; no defaulted props invented to ease tests.
- **Header outside the scroll area.** The title block, balance block and range select never sit inside a `ScrollView`; the column headings of the wide table sit above the scroller, not inside it.
- **Type labels (reconciles two spec lines).** The spec lists the Type kinds "Journal entry", "Reversal", "Void reversal", "Auto reversal" and also says a reversal shows "Reversal of <number>". Both hold: the Type cell is the kind label, followed by " of <number>" when the entry reverses another one. So a reversal reads "Reversal of JE-1046", a void reversal reads "Void reversal of JE-1046", an auto reversal reads "Auto reversal of <number>", a plain entry reads "Journal entry".
- **Retry** (checkpoint 2 `retry`) is passed to the view as `onRetry` (checkpoint 3). It reloads every collection the screen reads: accounts, journal lines, journal entries, account balances (4). Settings are not reloaded.
- **`isError`** is true when any of the live queries the screen runs (account, lines, opening totals, sub-account, any-activity, settings) reports `isError`.
- **`isOtherPresetSelected`** is `preset !== 'this-fiscal-year'`; the empty-range button then reads "Show this fiscal year" and selects that preset.
- **Local state.** `preset` and `order` are local `useState` in `useRegisterScreen` (reset on reload, needed by no other component). The only Zustand store is `register-store` (the selected entry).
- **Highlight and widths (tokens).** The selected row, and the entry-drawer line for this account, use `bg-accent` (defined in `global.css`; `AccountRow` already uses it). Borders use `border-border`, secondary text `text-muted-foreground`, errors `text-danger`, the page `bg-background`.
- **Seed.** `seed.ts` posts entries through the same update the app makes (superuser `pb`: create a draft entry, create its lines, update the entry to `status: 'posted'` with `posted_by`). Checkpoint 5 adds entries to it so the register has rows whatever today's date is. The e2e asserts nothing that depends on the calendar date.
- Unit tests live in `tests/`; e2e in `tests/e2e/`.

### Checkpoint 1 — Register math and range presets

**Delivers:** pure functions that turn lines and balance totals into register rows with opening, running and ending balances, order them, describe one entry for the drawer, and compute the five date-range presets.

**Files:**
- Create: `tinycld/books/lib/register.ts`
- Create: `tinycld/books/lib/register-range.ts`
- Test: `tests/register.test.ts` · `tests/register-range.test.ts`

**Interfaces:**
- Consumes: `ownBalance(type: string, debitTotal: number, creditTotal: number): number` from `lib/account-tree.ts`; `maxStoredAmount: number` from `lib/money.ts`; the fixture exports `LINES`, `ENTRIES`, `BALANCES`, `REGISTER_ACCOUNT_ID`, `REGISTER_TODAY`, `SETTINGS`
- Produces (`lib/register-range.ts`):
  - `type RangePreset = 'this-month' | 'last-month' | 'this-quarter' | 'this-fiscal-year' | 'last-fiscal-year'`
  - `RANGE_PRESETS: readonly { id: RangePreset; label: string }[]` (labels exactly "This month", "Last month", "This quarter", "This fiscal year", "Last fiscal year", in that order)
  - `defaultRangePreset: RangePreset` (`'this-month'`)
  - `type RegisterRange = { start: string; end: string }`
  - `rangeForPreset(preset: RangePreset, today: string, fiscalYearStartMonth: number): RegisterRange`
  - `monthStartOf(day: string): string` (`2026-10-17` gives `2026-10-01`), `periodOf(day: string): string` (`2026-10`)
  - `formatDay(day: string): string` (`Oct 23, 2026`, UTC, no timezone shift)
  - `fiscalStartMonth(row: Pick<BooksSettings, 'fiscal_year_start_month'> | undefined): number` (the row's value when it is an integer 1 to 12, else 1)
  - `todayIso(): string` (local calendar date; the only function that reads the clock)
- Produces (`lib/register.ts`):
  - `type RegisterEntry = Pick<BooksJournalEntries, 'id' | 'number' | 'memo' | 'status' | 'origin' | 'posted_at' | 'reverses' | 'date'>` (generated type from `../types`)
  - `type RegisterEntryLine = Pick<BooksJournalLines, 'id' | 'account' | 'debit' | 'credit' | 'memo' | 'position'>`
  - `type RegisterSourceLine = Pick<BooksJournalLines, 'id' | 'entry' | 'account' | 'debit' | 'credit' | 'memo' | 'position' | 'date' | 'posted'> & { entryRecord: RegisterEntry | undefined; entryLines: readonly RegisterEntryLine[]; reversesNumber: string }` (a minimal structural input, built only from generated types; the query result of checkpoint 2 is assigned to it, so tsc proves they agree)
  - `type RegisterOrder = 'newest' | 'oldest'`; `defaultOrder: RegisterOrder` (`'newest'`); `toggleOrder(order: RegisterOrder): RegisterOrder`
  - `entryTypeLabel(origin: string, reversesNumber: string): string` (origin `manual` gives "Journal entry"; `reversal`, `void_reversal`, `auto_reversal` give "Reversal", "Void reversal", "Auto reversal", each followed by " of <number>" when `reversesNumber` is not empty)
  - `buildRegister<L extends RegisterSourceLine>(input: { accountType: string; lines: readonly L[]; priorTotals: { debit: number; credit: number }; range: RegisterRange; order: RegisterOrder }): Register<L>`
  - `type Register<L extends RegisterSourceLine = RegisterSourceLine> = { rows: RegisterLine<L>[]; openingBalance: number | null; endingBalance: number | null; showOpeningRow: boolean }`
  - `type RegisterLine<L extends RegisterSourceLine = RegisterSourceLine> = { id: string; entryId: string; date: string; number: string; typeLabel: string; isVoid: boolean; memo: string; otherAccountId: string | null; isSplit: boolean; debit: number; credit: number; balance: number | null; source: L }` (named `RegisterLine` everywhere; `RegisterRow` is only the checkpoint 3 component)
  - `type EntryDetail = { date: string; number: string; typeLabel: string; statusLabel: string; memo: string; lines: { id: string; accountId: string; debit: number; credit: number; memo: string; isThisAccount: boolean }[] }`
  - `entryDetail(line: RegisterSourceLine, accountId: string): EntryDetail | null` (null when `line.entryRecord` is undefined)

**Gates:** 1 · 3 (nothing renders)

**Spec:**
- "Range select with presets, default This month: This month, Last month, This quarter, This fiscal year, Last fiscal year. Fiscal year start comes from `books_settings.fiscal_year_start_month`. Custom dates are cut (Q4)."
- "Debit and Credit headings stay the same for every account type (Q3). The running balance is signed by the account's normal side: debit-normal types add debits and subtract credits; credit-normal types the reverse (`ownBalance` from `lib/account-tree.ts`). A negative balance shows a minus sign."
- "Order: a Date header press sorts newest first or oldest first (default newest first, Q5). Equal dates order by the entry's `posted_at`, then line `position`, then line id, so the running balance is deterministic. The running balance is always computed oldest to newest and only displayed in the chosen order."
- "First chronological row of the range is preceded by an "Opening balance" row (balance column only) when the opening balance is not zero or the range has rows."
- "Only posted lines appear (`posted = true`). Draft entries' lines never appear. A voided original stays with a "Void" label beside its type, and its reversal stays with "Reversal of <number>" in the Type cell; both count in the running balance, so they cancel (Q6)."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/register-range.test.ts` — with `today` `2026-10-23` and start month 1: `this-month` is `2026-10-01` to `2026-10-23`; `last-month` is `2026-09-01` to `2026-09-30`; `this-quarter` is `2026-10-01` to `2026-10-23`; `this-fiscal-year` is `2026-01-01` to `2026-10-23`; `last-fiscal-year` is `2025-01-01` to `2025-12-31`. With start month 9 and the same `today`: `this-fiscal-year` is `2026-09-01` to `2026-10-23`; `last-fiscal-year` is `2025-09-01` to `2026-08-31`; `this-quarter` is `2026-09-01` to `2026-10-23`. With start month 9 and `today` `2026-03-10`: `this-fiscal-year` starts `2025-09-01`; `this-quarter` starts `2026-03-01`. `last-month` on `2026-01-15` is `2025-12-01` to `2025-12-31`; on `2026-03-31` it is `2026-02-01` to `2026-02-28`; on `2028-03-05` it ends `2028-02-29`. `RANGE_PRESETS` labels and order match the spec; `defaultRangePreset` is `'this-month'`. `fiscalStartMonth(undefined)` is 1, `fiscalStartMonth({ fiscal_year_start_month: 9 })` is 9, and a value of 0 or 13 gives 1. `monthStartOf`, `periodOf` and `formatDay('2026-10-23')` return `2026-10-01`, `2026-10`, `Oct 23, 2026`.
- `tests/register.test.ts` (built from the fixture: `LINES` and `ENTRIES` joined into `RegisterSourceLine`s by a local test helper, account `REGISTER_ACCOUNT_ID` of type `bank`, `priorTotals` from the August and September `BALANCES` rows) —
  - Opening balance for `this-month` on `2026-10-23` is 1_426_250 and `endingBalance` is 1_594_031; there are 17 rows; `showOpeningRow` is true.
  - Running balance is computed oldest to newest: the row for JE-1040 (first of October) has balance 1_426_250 - 1_200_000 = 226_250; each later row differs from the previous by its signed amount. `order: 'newest'` returns the same balances in reverse row order; `order: 'oldest'` the original; the balance values do not change with the order.
  - Credit-normal account (`accountType: 'income'`): a credit increases the balance and a debit decreases it.
  - A running balance that goes below zero keeps a negative number (not clamped).
  - Equal dates order by `entryRecord.posted_at`, then `position`, then line `id`: three lines on one date built with posted_at and positions swapped against their ids come out in posted_at order; with equal posted_at, in position order; with equal both, in id order. The result is identical for any input order (shuffle test).
  - The void pair cancels: the JE-1046 original has `isVoid` true and typeLabel "Journal entry"; its reversal has typeLabel "Void reversal of JE-1046"; the balance after both equals the balance before the original.
  - A line with `posted: false` never produces a row and never changes a balance (the fixture draft line is also dated after `range.end`; build a second case dated inside the range).
  - Mid-month range start: with `range` `2026-10-10` to `2026-10-23`, rows dated before `2026-10-10` are absent, `openingBalance` equals 1_426_250 plus the signed total of the October lines before the 10th, and the final `endingBalance` is the same 1_594_031.
  - `showOpeningRow` is true with a non-zero opening and no rows, true with a zero opening and rows, false with a zero opening and no rows.
  - An empty range with a non-zero opening has `endingBalance` equal to `openingBalance`.
  - Split: the payroll line (entry JE-1050, three lines) has `isSplit` true and `otherAccountId` null; a two-line entry has `isSplit` false and `otherAccountId` set to the other line's account.
  - Memo is the line memo, else the entry memo, else an empty string.
  - Overflow: lines whose running sum passes `maxStoredAmount` give `balance: null` on that row and every later row (the figure is never wrong), and `endingBalance` is null.
  - `entryDetail` for the payroll line returns its three lines, with only the line whose `accountId` is the register account marked `isThisAccount`; `statusLabel` is "Posted" for a posted entry and "Void" for a void one; returns null when `entryRecord` is undefined.
  - `entryTypeLabel('manual', '')` is "Journal entry"; `entryTypeLabel('reversal', 'JE-7')` is "Reversal of JE-7"; `entryTypeLabel('void_reversal', 'JE-7')` is "Void reversal of JE-7"; `entryTypeLabel('auto_reversal', 'JE-7')` is "Auto reversal of JE-7"; with `reversesNumber` empty the three reversal origins give "Reversal", "Void reversal", "Auto reversal".
  - `toggleOrder('newest')` is `'oldest'` and back; `defaultOrder` is `'newest'`.

**Do:**
1. `lib/register-range.ts`: parse `YYYY-MM-DD` into numbers with `split('-').map(Number)`; do month arithmetic on a `year * 12 + (month - 1)` index and format back with zero padding, so there is no timezone or `Date` rollover. Fiscal year start for `today` is `startMonth` of the year when `today`'s month is `>= startMonth`, else of the previous year. `this-fiscal-year` is that start to `today`; `last-fiscal-year` is the year before it, ending on the day before the current fiscal start. The fiscal quarter start is the latest fiscal-year-start plus a multiple of 3 months that is `<= today`. `last-month` ends on the last day of the previous month (leap years included, computed from the month index). `formatDay` uses `new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })`. `todayIso` formats the local `new Date()` fields.
2. `lib/register.ts`: `buildRegister` in this order. (a) Keep only lines with `posted` true. (b) Sort oldest first with one comparator: `date`, then `entryRecord?.posted_at ?? ''`, then `position`, then `id`, each by string compare. (c) Start at `ownBalance(accountType, priorTotals.debit, priorTotals.credit)`. (d) Walk the sorted lines: add `ownBalance(accountType, line.debit, line.credit)` to the running balance with integer addition; when the absolute running value exceeds `maxStoredAmount`, or the previous balance was already `null`, the row's `balance` is `null`. (e) A line dated before `range.start` is folded into the opening balance and produces no row; a line dated after `range.end` is dropped. (f) `openingBalance` is the running value at the first row of the range (or the final running value when there are no rows); `endingBalance` is the last row's balance, else `openingBalance`; both are `null` once the overflow has happened. (g) `showOpeningRow` is `openingBalance !== 0 || rows.length > 0`. (h) Reverse the rows for `order: 'newest'`. Per row: `typeLabel = entryTypeLabel(entryRecord?.origin ?? 'manual', line.reversesNumber)`; `isVoid = entryRecord?.status === 'void'`; `number = entryRecord?.number ?? ''`; `memo = line.memo || entryRecord?.memo || ''`; `isSplit = line.entryLines.length > 2`; `otherAccountId` is the account of the one other entry line when there are exactly two lines, else null. Origin keys: `manual`, `reversal`, `void_reversal`, `auto_reversal`.
3. `entryDetail` maps `entryLines` (sorted by `position`) to the drawer lines; `isThisAccount` is `accountId === line.account`; `statusLabel` is "Posted", "Void" or "Draft" from the entry status.
4. Run `pnpm exec tinycld-pkg check` from the package.

### Checkpoint 2 — Entry relation and register query

**Delivers:** live queries that load, for one account, only its lines (each with its entry and the entry's other lines), its prior balance totals, its sub-account flag, and the fiscal-year setting; plus a passing relation spike that records how lines reach their entry.

**Files:**
- Modify: `tinycld/books/collections.ts` (spike outcome (a) only: `entry` added to the lines collection's `relations`)
- Create: `tinycld/books/lib/register-query.ts`
- Create: `tinycld/books/hooks/useRegisterQuery.ts`
- Create: `tinycld/books/hooks/useFiscalYearStartMonth.ts`
- Test: `tests/register-query.test.ts` · `tests/register-realtime.test.ts` · `tests/useFiscalYearStartMonth.test.ts` · `tests/collections.test.ts` (extended by the test writer)

**Interfaces:**
- Consumes: `RegisterRange`, `monthStartOf`, `periodOf` from checkpoint 1; `RegisterSourceLine`, `RegisterEntry` from checkpoint 1; `reloadCollections(collections, onError)` from `lib/accounts-query.ts`; `useRecord` from `@tinycld/core/lib/use-record`; the fixture exports
- Produces (`lib/register-query.ts`), each a query builder like `accountsWithBalances` (generic over the collections' insert types):
  - `registerLinesQuery(lines, entries, accountId: string, range: RegisterRange)`: lines with `account = accountId`, `posted = true`, `date >= monthStartOf(range.start)`, `date <= range.end`; each row is the line plus `entryRecord` and `entryLines`
  - `openingTotalsQuery(balances, accountId: string, range: RegisterRange)`: `books_account_balances` rows with `account = accountId` and `period < periodOf(range.start)`, grouped by account, `sum(debit_total)` and `sum(credit_total)`
  - `reversalOriginsQuery(entries, ids: readonly string[])`: `{ id, number }` of the entries whose id is in `ids`
  - `subAccountQuery(accounts, accountId: string)`: accounts with `parent = accountId`, limit 1
  - `anyActivityQuery(balances, accountId: string)`: one `books_account_balances` row with `account = accountId`, limit 1 (tells an account with no lines at all from a range with none)
- Produces (`hooks/useFiscalYearStartMonth.ts`): `useFiscalYearStartMonth(): { month: number; isReady: boolean }` (1 when no settings row exists)
- Produces (`hooks/useRegisterQuery.ts`): `useRegisterQuery(accountId: string, range: RegisterRange | null)` returning `{ account: BooksAccounts | undefined; lines; priorTotals: { debit: number; credit: number }; hasSubAccounts: boolean; hasAnyActivity: boolean; isReady: boolean; isError: boolean; retry(): void }`. `BooksAccounts` comes from `../types`; `lines` is the data of the `registerLinesQuery` live query, typed by inference and assignable to `RegisterSourceLine[]` (tsc proves it); `isError` is true when every live query it runs (account, lines, opening totals, sub-account, any-activity, settings) reports an error; `retry` reloads the four collections. `type RegisterAccount = BooksAccounts`. While `range` is null every query is disabled and `isReady` is false.

**Gates:** 1 · 3 (nothing renders)

**Spec:**
- "Only posted lines appear (`posted = true`). Draft entries' lines never appear. A voided original stays with a "Void" label beside its type, and its reversal stays with "Reversal of <number>" in the Type cell; both count in the running balance, so they cancel (Q6)."
- "A parent account shows its own lines only. The header says "Own transactions only" under the balance block when the account has sub-accounts (Q8)."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/register-query.test.ts` — over real local-only collections seeded from the fixture (all entries and lines for several accounts, plus the balance rows):
  - `registerLinesQuery` for `REGISTER_ACCOUNT_ID` with range `2026-10-01` to `2026-10-23` returns 17 rows: none for another account, none with `posted` false (add a draft-entry line inside the range to the seed), none dated after `range.end`.
  - A range starting `2026-10-10` still returns the October lines before the 10th (the month-aligned load).
  - Every row's `entryRecord.number` equals its entry's number; the payroll row's `entryLines` has three lines; `reversalOriginsQuery(entries, ['je_1046'])` returns `{ id: 'je_1046', number: 'JE-1046' }`.
  - The result is correct when the entries collection holds many more rows than the lines collection and again when it holds fewer (the driving side of a join must not change the result): seed 60 extra entries on other accounts for one case, and delete entries down to the ones the account uses for the other.
  - `openingTotalsQuery` for the same range sums August and September (debit 10_715_500, credit 9_289_250); for `range.start` `2026-08-10` it returns no August row (period `2026-08` is not before `2026-08`); an account with no balance rows yields no row (the hook turns that into 0 and 0).
  - `subAccountQuery` returns one row for a parent account and none for a leaf; `anyActivityQuery` returns one row for the register account and none for an account without balance rows.
- `tests/register-realtime.test.ts` — with the harness (the hook test also asserts that a void reversal line gets `reversesNumber` `JE-1046` and a normal line gets an empty string): a posted line for the register account inserted into the lines collection after the first render appears in `useRegisterQuery(...).lines` without a reload; a line for another account does not; a line with `posted` false does not; updating that line to `posted: true` (the way posting stamps it) makes it appear; updating the October balance row does not change `priorTotals`; updating the August balance row changes `priorTotals` to the new sums.
- `tests/useFiscalYearStartMonth.test.ts` — with the harness: no settings row gives `{ month: 1 }`; a settings row with `fiscal_year_start_month` 9 gives `{ month: 9, isReady: true }`; updating the row to 4 re-renders with 4.
- `tests/collections.test.ts` — the lines collection is registered with `relations` containing `account` and (spike outcome (a)) `entry`; if outcome (b) shipped, the test asserts `relations` still contains only `account`.

**Do:**
1. **Spike, in this order.** Record the outcome under Design notes in `docs/plans/account-register-ledger.md`.
   - **(a)** In `collections.ts` the lines collection is created before the entries (the entries' back-relation `books_journal_lines_via_entry` needs it). Declare the lines' relations as a named object and complete it once the entries collection exists:
     ```ts
     const lineRelations: Record<string, typeof books_accounts> = { account: books_accounts }
     const books_journal_lines = newCollection('books_journal_lines', {
         omitOnInsert: ['created', 'updated', 'posted', 'date', 'currency'] as const,
         ...onDemand,
         relations: lineRelations,
         collectionOptions: indexed,
     })
     // ... books_journal_entries is created here, with books_journal_lines_via_entry: books_journal_lines ...
     lineRelations.entry = books_journal_entries
     ```
     If tsc rejects the widened type, type `lineRelations` as `{ account: typeof books_accounts; entry?: typeof books_journal_entries }`. Keep (a) only if `pnpm exec tinycld-pkg typecheck` and the extended `tests/collections.test.ts` pass (the lines `relations` contain `account` and `entry`), and `tests/register-query.test.ts` passes with `entryRecord` taken from a `materialize` of the entries collection by `eq(e.id, line.entry)`.
   - **(b)** If pbtsdb reads `relations` once at registration (so `entry` is never seen) or refuses the cycle, revert `collections.ts` to its current text and read the entry with a `leftJoin` driven from the filtered lines (see step 2, join form). `tests/register-query.test.ts` (60 extra entries and fewer entries than lines) proves the lines side drives the join.
   - If neither passes, stop and ask. A custom endpoint is not an option.
2. `lib/register-query.ts`: same generic shape as `accountsWithBalances` (collections typed with their insert types as extra generics because pbtsdb omits server-stamped fields on insert). `registerLinesQuery` for outcome (a):
   ```ts
   query.from({ line: lines })
       .where(({ line }) => and(eq(line.account, accountId), eq(line.posted, true),
           gte(line.date, monthStartOf(range.start)), lte(line.date, range.end)))
       .select(({ line }) => ({
           ...line,
           entryRecord: materialize(query.from({ e: entries }).where(({ e }) => eq(e.id, line.entry)).findOne()),
           entryLines: materialize(query.from({ l: lines }).where(({ l }) => eq(l.entry, line.entry))),
       }))
   ```
   For outcome (b) the same function reads `.leftJoin({ entry: entries }, ({ line, entry }) => eq(line.entry, entry.id)).select(({ line, entry }) => ({ ...line, entryRecord: entry, entryLines: materialize(...) }))` with the same `where`. `reversalOriginsQuery(entries, ids)` is `query.from({ e: entries }).where(({ e }) => inArray(e.id, ids)).select(({ e }) => ({ id: e.id, number: e.number }))`; it is disabled when `ids` is empty. The query rows have no `reversesNumber`; the hook adds it (step 5).
3. `openingTotalsQuery` follows the groupBy and `sum` pattern of `accountsWithBalances` in `lib/accounts-query.ts`, with `where` on `account` and `lt(balance.period, periodOf(range.start))`.
4. `useFiscalYearStartMonth`: `useStore('books_settings')`, `useLiveQuery` over it, then `fiscalStartMonth(data?.[0])` from checkpoint 1 for `month`.
5. `useRegisterQuery`: `useStore('books_accounts', 'books_journal_lines', 'books_journal_entries', 'books_account_balances')`; `useRecord` for the account; one `useLiveQuery` each for lines, opening totals, sub-account, any-activity and (with the distinct non-empty `entryRecord.reverses` ids of the loaded lines) `reversalOriginsQuery`, each returning `undefined` while `range` is null so it is disabled. `lines` is the lines data mapped during render to add `reversesNumber` (`originNumbers.get(line.entryRecord?.reverses ?? '') ?? ''`, from a `Map` built from the origins query). `priorTotals` is the first opening row or `{ debit: 0, credit: 0 }`. `isReady` is true when the account, lines and opening queries are ready. `retry` calls `reloadCollections` on the four collections and sends failures to `log.error('books.register', err)` from `@tinycld/core/lib/logger`.
6. Run `pnpm exec tinycld-pkg check` from the package.

### Checkpoint 3 — Register route, header and states

**Delivers:** the route `/a/books/accounts/<id>` with the header (back link, title, balances, range select, New journal entry gating), every non-table state (loading, error, not found, empty account, empty range), the "View register" entry points in the Chart of Accounts, and seeded register data for the app and the e2e.

**Files:**
- Create: `tinycld/books/screens/accounts/[id].tsx` (thin wrapper, keyed by the route id)
- Create: `tinycld/books/hooks/useRegisterScreen.ts`
- Create: `tinycld/books/lib/register-state.ts`
- Create: `tinycld/books/stores/register-store.ts`
- Create: `tinycld/books/components/register/RegisterScreenView.tsx`
- Create: `tinycld/books/components/register/RegisterHeader.tsx`
- Create: `tinycld/books/components/register/RegisterRangeSelect.tsx`
- Create: `tinycld/books/components/register/RegisterEmptyState.tsx`
- Modify: `tinycld/books/lib/shell-nav.ts` (export `isNewActionAvailable`)
- Modify: `tinycld/books/hooks/useAccountsScreen.ts` (builds `menu: AccountMenuHandlers`; add `onViewRegister`)
- Modify: `tinycld/books/components/accounts/AccountRowMenu.tsx` ("View register" item)
- Modify: `tinycld/books/components/accounts/AccountPanel.tsx` ("View register" button, new required `onViewRegister` placement prop)
- Modify: `tinycld/books/components/accounts/AccountsScreenView.tsx` (passes `menu.onViewRegister` to the panel)
- Modify: `tinycld/books/seed.ts` (register data, see Do 2)
- Test: `tests/register-state.test.ts` · `tests/register-store.test.ts` · `tests/shell-nav.test.ts` · `tests/accounts-view-props.ts` · `tests/account-menu.test.tsx` · `tests/account-menu-panel.test.tsx` · `tests/e2e/account-register-helpers.ts` · `tests/e2e/account-register-states.spec.ts`

**Interfaces:**
- Consumes: from checkpoint 1: `buildRegister`, `Register`, `RegisterLine`, `RegisterOrder`, `defaultOrder`, `RANGE_PRESETS`, `RangePreset`, `defaultRangePreset`, `rangeForPreset`, `RegisterRange`, `formatDay`, `todayIso`; from checkpoint 2: `useRegisterQuery` (its `retry` becomes the model's `onRetry`), `useFiscalYearStartMonth`, `RegisterAccount`; `formatMoney` from `lib/money.ts`; `accountDisplay(type, detailType)` from `components/accounts/account-display.ts`; `useBooksAccess()` from `hooks/useBooksAccess.ts`; `NEW_ACTIONS` from `lib/shell-nav.ts`; `useOrgHref` from `@tinycld/core/lib/org-routes`; `AccountMenuHandlers` from `hooks/useAccountsScreen.ts`
- Produces:
  - `lib/shell-nav.ts`: `isNewActionAvailable(id: string, actions?: readonly NewAction[]): boolean` (false for an unknown id; default `NEW_ACTIONS`)
  - `lib/register-state.ts`: `type RegisterViewState = 'loading' | 'error' | 'not-found' | 'empty' | 'empty-range' | 'ready'`; `registerViewState(input: { isReady: boolean; isError: boolean; hasAccount: boolean; hasRows: boolean; hasAnyActivity: boolean }): RegisterViewState`; `newEntryVisible(input: { canWrite: boolean; isAvailable: boolean }): boolean`
  - `stores/register-store.ts`: `useRegisterStore` (Zustand, no persistence): `selected: { accountId: string; entryId: string } | null`, `openEntry(accountId: string, entryId: string): void`, `close(): void`
  - `hooks/useRegisterScreen.ts`: `useRegisterScreen(accountId: string)` returning `{ state: RegisterViewState; account: RegisterAccount | undefined; accountId: string; currency: string; register: Register; preset: RangePreset; range: RegisterRange; onPreset(preset: RangePreset): void; order: RegisterOrder; onToggleOrder(): void; hasSubAccounts: boolean; isNewEntryVisible: boolean; newEntryHref: string; onNewEntry(): void; onRetry(): void; onBack(): void; selectedEntryId: string | null; onOpenEntry(entryId: string): void; isWide: boolean; isTablet: boolean }`; `type RegisterScreenModel = ReturnType<typeof useRegisterScreen>`. `selectedEntryId` is `selected.entryId` when `selected.accountId === accountId`, else null. `onRetry` is `useRegisterQuery`'s `retry`.
  - `AccountMenuHandlers.onViewRegister(id: string): void`; `AccountPanel` placement prop `onViewRegister(id: string): void`; menu item label "View register"; test ids `account-panel-view-register`
  - `RegisterScreenView(model: RegisterScreenModel)`; `RegisterHeader({ model: RegisterScreenModel })`; `RegisterRangeSelect({ preset: RangePreset, onPreset(preset: RangePreset): void })`; `RegisterEmptyState({ kind: 'empty' | 'empty-range'; canCreate: boolean; onNewEntry(): void; onShowFiscalYear(): void; isOtherPresetSelected: boolean })`
  - Test ids: `register-back`, `register-title`, `register-opening-balance`, `register-ending-balance`, `register-balance-through`, `register-parent-note`, `register-inactive`, `register-range`, `register-new-entry`, `register-empty`, `register-empty-range`, `register-show-fiscal-year`, `register-error`, `register-retry`, `register-not-found`, `register-loading`
  - e2e helpers in `tests/e2e/account-register-helpers.ts`: `openRegister(page: Page, accountName: string): Promise<void>` (opens the Chart of Accounts from the Books sidebar as `chart-of-accounts.spec.ts` does, opens that account's row or card menu, chooses "View register"); `accountItem(page: Page, name: string): Locator` (row on wide, card on phone); `REGISTER_SEED` (the memos of the seeded register entries, from Do 2)

**Gates:** 1 · 2 (reference: `empty-1280-light.png`, `empty-range-1280-light.png`, `error-1280-light.png`, `not-found-1280-light.png`, `empty-390-light.png`, `error-390-light.png`, `not-found-390-light.png`, `populated-1280-light.png` for the header only; built URL: `/a/books/accounts/<id>`, `<id>` the seeded Business Checking account (header) or Design Tools account (empty)) · 3

**Spec:**
- "Back link "Chart of Accounts" (to `books/accounts`), then the title: account number (when set) and name, a type label and detail type beside it (from `accountDisplay`), and an "Inactive" label when the account is inactive."
- "A balance block: "Opening balance" (before the first row of the range) and "Ending balance" (after the last row), in `formatMoney` with the account's `currency`. Ending balance is the largest figure on the screen. The block is labelled "through <range end date>" so it can differ from the Chart of Accounts figure, which counts every period including future-dated postings."
- "Range select with presets, default This month: This month, Last month, This quarter, This fiscal year, Last fiscal year. Fiscal year start comes from `books_settings.fiscal_year_start_month`. Custom dates are cut (Q4)."
- ""New journal entry" button for writers, shown only when the registry action `journal-entry` has `available: true` (today false; `p1-journal-entries` sets it). A read-only user never sees it."
- "Loading: `LoadingState` until the account, the opening-balance query and the lines query are ready; the header (back link and title when the account is known) shows meanwhile."
- "Error: an alert region "Could not load this register" with a Retry button that reloads the three collections (`reloadCollections`)."
- "Account not found (bad id, or the account was deleted): "This account does not exist" with the back link; no table."
- "Empty, account has no posted lines at all: "No transactions yet" with a "New journal entry" button for writers when available, otherwise a one-line explanation. Empty, range has no lines: "No transactions in this range" with a "Show this fiscal year" button when another preset is selected; the opening and ending balances still show (equal)."
- "A parent account shows its own lines only. The header says "Own transactions only" under the balance block when the account has sub-accounts (Q8)."
- "Access: a user with level none sees nothing from Books already (shell). A read-only user sees everything above except the New button."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/register-state.test.ts` — `registerViewState`: not ready and no error is `'loading'`; `isError` wins over everything and gives `'error'`; ready with `hasAccount` false is `'not-found'` (also when rows exist); ready with an account, no rows and `hasAnyActivity` false is `'empty'`; ready with no rows and `hasAnyActivity` true is `'empty-range'`; ready with rows is `'ready'` even when `hasAnyActivity` is false. `newEntryVisible`: true only when `canWrite` and `isAvailable` are both true (all four combinations: a read-only user never sees it, a writer does not see it while the action is unavailable).
- `tests/register-store.test.ts` — `openEntry('a1', 'e1')` sets `selected` to `{ accountId: 'a1', entryId: 'e1' }`; opening a second entry replaces the first; `close()` sets it to null; the initial value is null.
- `tests/shell-nav.test.ts` — `isNewActionAvailable('journal-entry')` is false with the real `NEW_ACTIONS` today; true for a passed list where that action has `available: true`; false for an unknown id.
- `tests/accounts-view-props.ts`, `tests/account-menu.test.tsx`, `tests/account-menu-panel.test.tsx` — `menuHandlers()` returns `onViewRegister: vi.fn()` too; `account-menu.test.tsx` adds the item `{ label: 'View register', handler: 'onViewRegister' }` to its handler table (pressing it calls `menu.onViewRegister` with the row id and does not open the Edit panel); `account-menu-panel.test.tsx` asserts the panel's "View register" button (`account-panel-view-register`) calls `onViewRegister` with the account id for a writer and for a read-only user.
- `tests/e2e/account-register-states.spec.ts` — `test.describe('account-register: header and states', …)`. Its header comment (also at the top of the helpers file) says: journal entry creation has no UI until `p1-journal-entries`, so the register has nothing it can create through the UI; the entries it reads are posted by `seed.ts` through the server's posting hook (dated relative to today so the spec never depends on the calendar), the spec writes nothing except the one account it creates and deletes through the UI in the not-found test, and it does not cover a live post appearing in an open register (covered by `tests/register-realtime.test.ts`) or a read-only user (the seed has no read-only Books member; the New button gating is covered by `newEntryVisible` in `tests/register-state.test.ts` and the panel button by `account-menu-panel.test.tsx`). Each test runs at desktop and at phone size (`login` and `navigateToPackage(page, 'books')` first, then `page.setViewportSize({ width: 390, height: 844 })` where the test is the phone run). All data is read through the UI; no raw PocketBase call, no `page.goto` after `login`. Tests:
  1. Header: `openRegister(page, 'Business Checking')`; `register-title` shows "1000" and "Business Checking" and the type label "Bank" (or the label `accountDisplay` gives for `bank`) and the detail label; `register-range` reads "This month"; `register-balance-through` matches `/through [A-Z][a-z]{2} \d{1,2}, \d{4}/` (no particular date); `register-opening-balance` and `register-ending-balance` each match a money pattern `/\$[\d,]+\.\d{2}/` and the ending figure's font size is larger than the opening figure's (read `getComputedStyle`); `register-back` is visible and has a box at least 44pt high; `register-new-entry` has count 0; `register-parent-note` has count 0; `register-inactive` has count 0. Header outside the scroll area: no ancestor of `register-title` has computed `overflow-y` of `auto` or `scroll`.
  2. Parent and inactive: the Software Subscriptions register shows `register-parent-note` with "Own transactions only"; the Old Petty Cash register shows `register-inactive` ("Inactive").
  3. Range select: choose each of the five presets from `register-range` (the menu items have the exact labels); after each, `register-range` shows the chosen label and `register-balance-through` is visible; choose "Last fiscal year": `register-empty-range` shows "No transactions in this range" and the opening and ending figures are equal text; `register-show-fiscal-year` is visible; press it and `register-range` reads "This fiscal year" and `register-empty-range` is gone.
  4. Empty account: the Design Tools register (its only entry is an unposted draft) shows `register-empty` with "No transactions yet" and an explanation line (a New journal entry button is absent because the action is unavailable).
  5. Loading: before `openRegister`, `page.route` the journal-lines list request (`**/api/collections/books_journal_lines/records*`) to wait on a promise the test resolves; while it is held `register-loading` is visible and `register-title` already shows "Business Checking"; resolve the promise and `register-loading` disappears.
  6. Error and retry: `page.route` the same URL to `route.abort()`; open the register; an element with role `alert` shows "Could not load this register" and `register-retry` is at least 44pt high; `page.unroute`, press `register-retry`; the alert disappears and the header balances show. (No data is written; only the requests are blocked.)
  7. Not found: create a throwaway account through the Chart of Accounts UI in the first page (as `createAccount` does in `chart-of-accounts.spec.ts`), `openRegister` on it, open a second page in the same browser context, delete the account there through the UI (row menu, Delete, confirm); in the first page `register-not-found` shows "This account does not exist", `register-back` is visible, and no `register-row-*` or `register-card-*` exists. Press `register-back` and the Chart of Accounts is shown.
  8. Phone (390x844): tests 1, 4 and 6 repeated; the header stacks: `register-back`, `register-title`, `register-ending-balance`, `register-range` have strictly increasing top coordinates and the page has no horizontal scroll (`document.documentElement.scrollWidth <= clientWidth`).

**Do:**
1. `lib/shell-nav.ts`: `export const isNewActionAvailable = (id: string, actions: readonly NewAction[] = NEW_ACTIONS) => actions.find(action => action.id === id)?.available ?? false`. `lib/register-state.ts`: early returns in the order error, not ready, no account, rows, activity. `stores/register-store.ts` with `create` from `@tinycld/core/lib/store`.
2. `seed.ts`: add the register data after the existing entry loop. Reuse the loop's way of posting: create a `draft` entry with `date`, `memo`, `doc_type: 'journal'`, `origin: 'manual'`, `created_by: ctx.user.id`; create its lines; then update the entry to `{ status: 'posted', posted_by: ctx.user.id }`. Dates come from a local helper `isoDay(date: Date)` that formats local year, month and day with zero padding. `today = isoDay(new Date())`. The fiscal start comes from the settings row: `const settings = (await pb.collection('books_settings').getFullList({ perPage: 1 }))[0]` and `startMonth = settings?.fiscal_year_start_month ?? 1`; `fiscalStart` is the first day of the latest month `<= today` whose month number is `startMonth`. Post on the Business Checking account (key `checking`), with the memos that `REGISTER_SEED` exports from the helpers file: (a) `Register sale` dated `today`, checking debit 125000, receivable credit 125000; (b) `Register split payment` dated `today`, checking credit 30000, rent debit 20000, software debit 10000 (three lines, so the register shows "-Split-"); (c) `Register fiscal year start` dated `fiscalStart`, checking debit 50000, equity credit 50000; (d) `Register void original` dated `today`, checking debit 40000, receivable credit 40000, posted, then a draft `Register corrected` dated `today` with `replaces` set to (d)'s id, checking debit 45000, receivable credit 45000, posted: the server's posting hook voids (d) and writes the void reversal (see `voidReplaced` in `server/reversal.go`). Do not touch the existing entries. This gives This month and This fiscal year at least four rows on any date.
3. `useAccountsScreen`: add `onViewRegister: (id: string) => router.push(orgHref(`books/accounts/${id}`))` to `menu` (`useOrgHref` from `@tinycld/core/lib/org-routes`, `router` from `expo-router`); extend `AccountMenuHandlers`. `AccountRowMenu`: `<Menu.Item label="View register" onSelect={() => menu.onViewRegister(row.id)} />` after "Edit", inside the existing `PressBoundary`. `AccountPanel`: add the required `onViewRegister(id: string): void` to `Placement`; in edit mode, when the account exists, render a `Button variant="outline"` "View register" (`account-panel-view-register`, 44pt) in the drawer body above the fields, for writers and read-only users alike, calling `onViewRegister(account.id)`. `AccountsScreenView` passes `menu.onViewRegister`. `AccountRow`, `AccountCard` and `AccountTree` only pass `menu` through and need no change.
4. `useRegisterScreen`: `useFiscalYearStartMonth()`; local `useState` for `preset` (starts at `defaultRangePreset`) and `order` (starts at `defaultOrder`). `range = rangeForPreset(preset, todayIso(), month)` derived during render, passed as `isReady ? range : null` to `useRegisterQuery`. `register = buildRegister({ accountType: account.type, lines, priorTotals, range, order })` when the account exists, else an empty register. Access from `useBooksAccess()`; `isNewEntryVisible = newEntryVisible({ canWrite: access.canWrite, isAvailable: isNewActionAvailable('journal-entry') })`; `newEntryHref = orgHref(action.href)`. `onBack` follows `hooks/useBackToAccounts.ts` (pop to the Chart of Accounts if it is in the stack, else replace). `isWide = breakpoint !== 'mobile'`, `isTablet = breakpoint === 'tablet'`. `currency` is `account?.currency ?? 'USD'`.
5. Route `screens/accounts/[id].tsx`: `useLocalSearchParams<{ id: string }>()`, a component keyed by `id` that renders `<RegisterScreenView {...useRegisterScreen(id)} />`. The static `import.tsx` already wins over the dynamic segment. Run `cd ~/code/tinycld/tinycld && pnpm run packages:generate`. The manifest already points `routes.directory` at `screens`; do not edit it.
6. `RegisterHeader` (never inside a `ScrollView`): back link "Chart of Accounts" (`register-back`, `ArrowLeft` colored with `useThemeColor('foreground')`, `minHeight: 44`); title row (`register-title`): account number when set, the name, `accountDisplay(type, detail_type)` type label and detail label in `text-muted-foreground`, and an "Inactive" label (`register-inactive`) when `inactive`; balance block: "Opening balance" figure (`text-base`) and "Ending balance" figure (`text-2xl font-semibold`) through `formatMoney(value, currency)` (a `null` figure shows "Too large"), the line "through <formatDay(range.end)>" (`register-balance-through`), and "Own transactions only" (`register-parent-note`) when `hasSubAccounts`; then `RegisterRangeSelect`; then the "New journal entry" `Button` (`register-new-entry`) as a small component that returns null unless `isNewEntryVisible`. Until the account is known only the back link shows; for `not-found` the header is the back link only.
7. `RegisterRangeSelect`: core `PickMenu` (`@tinycld/core/ui/pick-menu`) with `testID="register-range"`, `purpose="Date range"`, `size="touch"`, `label` the selected preset's label, one item per `RANGE_PRESETS` entry with `{ id, label, isSelected, onSelect }`.
8. `RegisterEmptyState`: `empty` shows "No transactions yet" and either the "New journal entry" `Button` (`canCreate`) or the line "Transactions appear here once journal entries are posted."; `empty-range` shows "No transactions in this range" and, when `isOtherPresetSelected`, the `Button` "Show this fiscal year" (`register-show-fiscal-year`).
9. `RegisterScreenView`: `registerViewState` decides the body. `loading`: header plus `LoadingState` (`register-loading`). `error`: header plus a `View` with `accessibilityRole="alert"` (`register-error`) "Could not load this register" and a Retry `Button` (`register-retry`, `minHeight: 44`, calls `onRetry`). `not-found`: the text "This account does not exist" (`register-not-found`) under the back link and nothing else. `empty` and `empty-range`: header plus `RegisterEmptyState` (`isOtherPresetSelected = preset !== 'this-fiscal-year'`, `onShowFiscalYear` calls `onPreset('this-fiscal-year')`, `canCreate = isNewEntryVisible`). `ready`: header only in this checkpoint (the table arrives in checkpoint 4).
10. Compare the built page to the references. Run `pnpm exec tinycld-pkg check` and `pnpm exec tinycld-pkg test:e2e -g "account-register:"`.

### Checkpoint 4 — Wide table and sorting

**Delivers:** the wide register table with its fixed amount columns, sortable Date heading, opening-balance row, and the row content (type labels, Void, split, other account).

**Files:**
- Create: `tinycld/books/components/register/RegisterTable.tsx`
- Create: `tinycld/books/components/register/RegisterRow.tsx`
- Modify: `tinycld/books/components/register/RegisterScreenView.tsx` (render the table in the `ready` state)
- Test: `tests/e2e/account-register-table.spec.ts`

**Interfaces:**
- Consumes: from checkpoint 1: `RegisterLine`, `Register`, `RegisterOrder`; from checkpoint 3: `RegisterScreenModel` (`register`, `order`, `onToggleOrder`, `onOpenEntry`, `selectedEntryId`, `currency`, `isWide`), `RegisterScreenView`, `openRegister`, `REGISTER_SEED`; `formatMoney`; `useRowWindow` from `hooks/useRowWindow.ts`; `useWindowHeight` from `@tinycld/core/components/workspace/useBreakpoint`
- Produces: `RegisterTable({ rows: RegisterLine[]; showOpeningRow: boolean; openingBalance: number | null; currency: string; order: RegisterOrder; onToggleOrder(): void; onOpenEntry(entryId: string): void; selectedEntryId: string | null })`; `RegisterRow({ row: RegisterLine; currency: string; onOpenEntry(entryId: string): void; isSelected: boolean })`; test ids `register-sort-date`, `register-table`, `register-row-<lineId>`, `register-opening-row`, `register-cell-<column>-<lineId>` with column one of `date`, `ref`, `type`, `memo`, `account`, `debit`, `credit`, `balance`

**Gates:** 1 · 2 (reference: `populated-1280-light.png`, `populated-1280-dark.png`; built URL: `/a/books/accounts/<id>`, `<id>` the seeded Business Checking account, range This fiscal year) · 3

**Spec:**
- "Columns: Date, Ref no. (the entry number; blank for none), Type (entry kind: "Journal entry", "Reversal", "Void reversal", "Auto reversal"), Memo (line memo, else entry memo; one line, truncated), Account (the other account of the entry, by name; "-Split-" when the entry has more than two lines), Debit, Credit, Balance. Memo gets free space first, then Account (Name-first column priority lesson); Debit, Credit and Balance never shrink and are right aligned."
- "Debit and Credit headings stay the same for every account type (Q3). The running balance is signed by the account's normal side: debit-normal types add debits and subtract credits; credit-normal types the reverse (`ownBalance` from `lib/account-tree.ts`). A negative balance shows a minus sign."
- "Order: a Date header press sorts newest first or oldest first (default newest first, Q5). Equal dates order by the entry's `posted_at`, then line `position`, then line id, so the running balance is deterministic. The running balance is always computed oldest to newest and only displayed in the chosen order."
- "First chronological row of the range is preceded by an "Opening balance" row (balance column only) when the opening balance is not zero or the range has rows."
- "Only posted lines appear (`posted = true`). Draft entries' lines never appear. A voided original stays with a "Void" label beside its type, and its reversal stays with "Reversal of <number>" in the Type cell; both count in the running balance, so they cancel (Q6)."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/e2e/account-register-table.spec.ts` — `test.describe('account-register: wide table', …)`, same header comment as checkpoint 3, desktop viewport (the phone layout is checkpoint 5). It makes no assertion that depends on the calendar date: order checks compare against the rows read from the DOM.
  1. Columns: `openRegister(page, 'Business Checking')`, choose "This month"; the column headings read Date, Ref no., Type, Memo, Account, Debit, Credit, Balance in that order; the seeded rows `REGISTER_SEED.sale`, `.split`, `.void` and `.corrected` are present (`register-row-*` filtered by memo); the sale row has Ref no. text matching `/^JE-\d+/` or the server's number format (non-empty), Type "Journal entry", Account "Accounts receivable", Debit a money text and Credit empty.
  2. Split and void: the split row's Account cell is "-Split-" and its Credit cell holds the money text; the void original's Type cell contains "Void"; a row whose Type reads `/^Void reversal of /` exists; the corrected row's Type is "Journal entry".
  3. Order: read the dates of all `register-row-*` rows in the DOM; the first row's date is not before the last row's (newest first by default); press `register-sort-date`; the row order is the exact reverse of the previous DOM order; press it again and it is restored. The `register-opening-row` is below every `register-row-*` (greater `y`) in the default order and above every one after the first press. The balance cell of the row nearest the opening row differs from the opening balance by exactly that row's signed amount (read all three from the DOM and parse the money text).
  4. Running balance: for adjacent rows in the displayed order, the balance of the newer row minus the balance of the older row equals the newer row's debit minus its credit (Business Checking is a bank account, debit-normal), parsed from the cells; the first-displayed row's balance equals `register-ending-balance`.
  5. Layout by bounding boxes: all `register-cell-debit-*`, `register-cell-credit-*` and `register-cell-balance-*` cells have the same width and the same right edge across rows; each row is at least 44pt high; the column headings row has a box above the first row; no `a` element exists inside `register-table`; `register-title` and the headings row have no scrollable ancestor (computed `overflow-y` not `auto`/`scroll`) while the rows container is scrollable.
  6. Narrow desktop: `page.setViewportSize({ width: 1024, height: 800 })` (below the inline-drawer width); Debit, Credit and Balance cells keep the widths measured at 1280; Memo and Account cells are non-empty and their widths are at least their minimums (100 and 90).
  7. Chart tie-out: the ending balance with "This fiscal year" is shown; the text of `register-ending-balance` is a money value and the Chart of Accounts figure for Business Checking is also a money value (no equality is asserted: the Chart counts every period, including postings dated after today).

**Do:**
1. Share one set of cell style constants between the heading row and `RegisterRow`: Date `{ width: 100, flexShrink: 0 }`, Ref no. `{ width: 80, flexShrink: 0 }`, Type `{ width: 150, flexShrink: 1, minWidth: 90 }`, Memo `{ flexGrow: 3, flexShrink: 1, flexBasis: 0, minWidth: 100 }`, Account `{ flexGrow: 2, flexShrink: 1, flexBasis: 0, minWidth: 90 }`, Debit and Credit `{ width: 104, flexShrink: 0 }`, Balance `{ width: 116, flexShrink: 0 }`; Debit, Credit and Balance cells are right aligned. Memo and Account use `numberOfLines={1}` (ellipsis). The table has `minWidth: 900` inside a horizontal `ScrollView`, so a narrower window scrolls sideways and no column collapses to blank.
2. `RegisterTable`: the heading row sits above the vertical scroller as a fixed row. The Date heading is a `Pressable` (`register-sort-date`, `accessibilityRole="button"`, `accessibilityLabel="Sort by date"`, `minHeight: 44`) calling `onToggleOrder`, with an `ArrowDown` (newest) or `ArrowUp` (oldest) lucide icon colored with `useThemeColor('foreground')`. The rows sit in a vertical `ScrollView` with `onScroll={window.onScroll}` and `scrollEventThrottle={16}`, windowed by `const window = useRowWindow({ total, rowHeight: 44, viewHeight: useWindowHeight() })`, rendering `rows.slice(window.first, window.last)` between two spacer `View`s of heights `window.topSpace` and `window.bottomSpace`. When `showOpeningRow`, the "Opening balance" row (`register-opening-row`, 44pt, balance cell only, `openingBalance` through `formatMoney`, `null` shown as "Too large") is the chronologically first row: after the last data row for `newest`, before the first for `oldest`; it counts in `total`.
3. `RegisterRow`: one `Pressable` (`accessibilityRole="button"`, `testID={`register-row-${row.id}`}`, `minHeight: 44`, `className` adds `bg-accent` when `isSelected`, else `bg-background`) calling `onOpenEntry(row.entryId)`; it is not a link. Cells: date through `formatDay`; `number`; Type: `typeLabel` plus a "Void" label (`text-muted-foreground`, small) when `isVoid`; memo; Account: "-Split-" when `isSplit`, otherwise the name read by a small `OtherAccountName({ accountId })` component with `useRecord('books_accounts', accountId)`; debit and credit through `formatMoney` only when non-zero, else empty; balance through `formatMoney(balance, currency)` (a negative value keeps its minus sign) or "Too large" when `null`. Each cell has `testID` `register-cell-<column>-<lineId>`.
4. `RegisterScreenView` renders `RegisterTable` in the `ready` state, wrapped in `View className="min-w-0 flex-1"`.
5. Compare the built page to the references. Run `pnpm exec tinycld-pkg check` and `pnpm exec tinycld-pkg test:e2e -g "account-register: wide table"`.

### Checkpoint 5 — Phone cards and entry drawer

**Delivers:** the phone card list and the read-only entry drawer: inline beside the table on desktop, an overlay on tablet, bottom-anchored on phone.

**Files:**
- Create: `tinycld/books/components/register/RegisterCard.tsx`
- Create: `tinycld/books/components/register/EntryDrawer.tsx`
- Modify: `tinycld/books/components/register/RegisterScreenView.tsx` (card list on phone, drawer slot)
- Modify: `tinycld/books/hooks/useRegisterScreen.ts` (add `selectedEntry` and `onCloseEntry`)
- Test: `tests/e2e/account-register-drawer.spec.ts`

**Interfaces:**
- Consumes: from checkpoint 1: `entryDetail`, `EntryDetail`, `RegisterLine`; from checkpoint 3: `useRegisterStore`, `RegisterScreenModel` (including `selectedEntryId`), `RegisterHeader`, `openRegister`, `REGISTER_SEED`; from checkpoint 4: `RegisterTable`, `RegisterRow`; `formatMoney`; `useRowWindow`
- Produces:
  - `useRegisterScreen` result gains `selectedEntry: EntryDetail | null` (`entryDetail(line.source, accountId)` of the first line whose `entryId` equals `selectedEntryId`, else null) and `onCloseEntry(): void` (the store's `close`)
  - `RegisterCard({ row: RegisterLine; currency: string; onOpenEntry(entryId: string): void; isSelected: boolean })`
  - `EntryDrawer({ detail: EntryDetail | null; currency: string; isWide: boolean; isTablet: boolean; onClose(): void })`
  - Test ids: `register-card-<lineId>`, `register-opening-card`, `register-entry-drawer`, `register-drawer-close`, `register-drawer-backdrop`, `register-drawer-line-<lineId>`, `register-drawer-field-<date|number|type|status|memo>`

**Gates:** 1 · 2 (reference: `populated-390-light.png`, `populated-390-dark.png`, `populated-drawer-1280-light.png`, `populated-drawer-1280-dark.png`, `populated-drawer-390-light.png`, `populated-drawer-390-dark.png`, `empty-range-390-light.png`; built URL: `/a/books/accounts/<id>`, `<id>` the seeded Business Checking account, at 1280 and 390 wide) · 3

**Spec:**
- "Rows are not pressable links to a screen. A press (click, Enter, Space) on a row opens the entry drawer (Q7). Rows are 44pt tall and use the row window (`useRowWindow`); header and totals are outside it."
- "Entry drawer (core `Drawer`; inline panel beside the table on wide, overlay on tablet, bottom-anchored on phone): date, number, type, status, memo, and the entry's lines (account, debit, credit, line memo), with the line for this account highlighted. Read only. Close button. The route link to the full entry is added by `p1-journal-entries` (hand-off in the packet)."
- "Each line is a card: date and Ref no. on top, memo below, the other account, debit or credit amount, and the running balance on the right under the amount. Same press target (the whole card, 44pt), same drawer (bottom-anchored). The header stacks: back link, title, balance block, range select."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/e2e/account-register-drawer.spec.ts` — `test.describe('account-register: cards and drawer', …)`, same header comment as checkpoint 3, no calendar-dependent assertion.
  1. Phone (390x844), range This fiscal year: no `register-row-*` exists and `register-card-*` cards do; every card is at least 44pt high and fits inside the viewport width; the card for `REGISTER_SEED.sale` shows its date, a non-empty Ref no., the memo, "Accounts receivable", the debit amount, and the running balance text under the amount (the balance box is below the amount box and both right-aligned); the split card shows "-Split-"; the void original card shows "Void"; a card shows "Void reversal of"; `register-opening-card` exists with a balance and no amount; the page has no horizontal scroll.
  2. Phone drawer: tap the split card; `register-entry-drawer` is visible and anchored to the bottom (its box bottom is within 1px of the viewport bottom and its top is below the header); `register-drawer-field-date`, `-number`, `-type` ("Journal entry"), `-status` ("Posted") and `-memo` ("Register split payment") show their values; three `register-drawer-line-*` lines are listed with account names, debit and credit; exactly the line for Business Checking has the `bg-accent` class and the other two do not; `register-drawer-close` is at least 44pt square; tapping it hides the drawer; tapping the void original card shows status "Void"; tapping a card while another drawer is open replaces its content.
  3. Desktop (1280x900): press the sale row; the drawer is visible beside the table (the table's box does not overlap the drawer's box, and the table is narrower than before opening); the selected row has `bg-accent`; close with `register-drawer-close`; the table width is restored; focus a row with `focus()` and press Enter: the drawer opens; close; focus another row and press Space: it opens with that entry's memo. Escape is not a closing path in this unit and is not tested.
  4. Tablet (900x1000): the drawer is an overlay: the table's width is unchanged when it opens, `register-drawer-backdrop` is visible, and the drawer box overlaps the table box.
  5. Rows and cards are not links: no `a` element in the table, the cards or the drawer; pressing a row does not change the page URL.
  6. Navigate to another account's register through the Chart of Accounts after leaving the drawer open on Business Checking: the new register shows no drawer (the store's `selected.accountId` differs).

**Do:**
1. `RegisterCard`: one `Pressable` (`register-card-<lineId>`, `accessibilityRole="button"`, `minHeight: 96`, `bg-accent` when `isSelected`). Top row: `formatDay(date)` and `number`; below it the memo (`numberOfLines={2}`) and a muted line with the other account name (`OtherAccountName` from checkpoint 4, or "-Split-") and the type label with "Void" when `isVoid`; on the right a column with the non-zero amount (`formatMoney`, labelled "Debit" or "Credit" in small muted text) and, under it, the running balance (`null` shows "Too large"). All text right-aligned in the right column.
2. `EntryDrawer` uses the same core pieces as `AccountPanel`: `Drawer`, `DrawerBackdrop`, `DrawerContent`, `DrawerHeader`, `DrawerBody`, `DrawerCloseButton` from `@tinycld/core/ui/drawer`, and `X` from `lucide-react-native` colored with `useThemeColor('foreground')`. `<Drawer isOpen={detail !== null} onClose={onClose} {...placementProps}>` where `placementProps` is `{ presentation: 'inline', anchor: 'right', size: 'md' }` when `isWide && !isTablet`, `{ presentation: 'overlay', anchor: 'right', size: 'md' }` when `isTablet`, `{ presentation: 'overlay', anchor: 'bottom', size: 'lg' }` on phone. `DrawerContent` gets `testID="register-entry-drawer"` and `className="w-[380px]"` only in the inline case. `DrawerHeader className="border-b border-border"` holds the title (`Text className="text-lg font-semibold text-foreground"`: the entry number, or "Draft" when it has none) and `<DrawerCloseButton accessibilityLabel="Close" testID="register-drawer-close" style={{ minWidth: 44, minHeight: 44 }}>`. `DrawerBody style={{ flexShrink: 1 }}` holds the fields (labelled date, number, type, status, memo) and the lines list: account name (`useRecord`), debit and credit through `formatMoney`, line memo; lines with `isThisAccount` have `bg-accent`. No footer, no actions; read only. Close is by the close button (and the backdrop where there is one); no Escape handling is added.
3. `useRegisterScreen`: derive `selectedEntry` during render from `selectedEntryId` and `register.rows`; `onCloseEntry` is `useRegisterStore.getState().close`.
4. `RegisterScreenView`: `isWide` renders `RegisterTable` (checkpoint 4), otherwise a vertical list of `RegisterCard`s windowed by `useRowWindow({ total, rowHeight: 96, viewHeight })` with the opening-balance card (`register-opening-card`, balance only) in the same chronological position as the table's opening row; the stacked phone header comes from `RegisterHeader` (back link, title, balance block, range select, New button, `gap-2`); `EntryDrawer` renders in both layouts, as the right-hand sibling of the table in the wide row layout.
5. Compare the built page to the references. Run `pnpm exec tinycld-pkg check` and `pnpm exec tinycld-pkg test:e2e -g "account-register: cards and drawer"`.

### Checkpoint 6 — Help topic and entry-point e2e

**Delivers:** the in-app help topic with its link from the Chart of Accounts topic, and the end-to-end flow from the Chart of Accounts to a register at desktop and phone size.

**Files:**
- Create: `help/account-register.md`
- Modify: `help/chart-of-accounts.md` (link to the new topic)
- Test: `tests/help-account-register.test.ts` · `tests/e2e/account-register-entry.spec.ts`

**Interfaces:**
- Consumes: `openRegister`, `accountItem`, `REGISTER_SEED` from `tests/e2e/account-register-helpers.ts` (checkpoint 3); the Chart of Accounts test ids `account-row-<id>`, `account-card-<id>`, `account-menu-<id>`, `account-panel`; `account-panel-view-register` from checkpoint 3; `login`, `navigateToPackage` from `@tinycld/core/e2e-helpers`
- Produces: help topic id `books:account-register`

**Gates:** 1 · 2 (reference: `populated-1280-light.png`, `populated-390-light.png`, `populated-drawer-1280-light.png`; built URL: `/a/books/accounts/<id>` reached from the Chart of Accounts row menu) · 3

**Spec:**
- "Back link "Chart of Accounts" (to `books/accounts`), then the title: account number (when set) and name, a type label and detail type beside it (from `accountDisplay`), and an "Inactive" label when the account is inactive."
- ""New journal entry" button for writers, shown only when the registry action `journal-entry` has `available: true` (today false; `p1-journal-entries` sets it). A read-only user never sees it."
- "Access: a user with level none sees nothing from Books already (shell). A read-only user sees everything above except the New button."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/help-account-register.test.ts` — reads `help/account-register.md`: frontmatter has `title` and `summary`; the body contains "View register", "Opening balance", "Ending balance", "This month", "Own transactions only" and "New journal entry"; and `help/chart-of-accounts.md` contains `help://books:account-register`.
- `tests/e2e/account-register-entry.spec.ts` — `test.describe('account-register: entry points', …)`, same header comment as checkpoint 3.
  1. Desktop: in the Chart of Accounts open the Business Checking row menu, choose "View register": the URL path ends with `/accounts/<id>` (id read from the row's `account-row-<id>` test id), `register-title` shows "Business Checking", `register-row-*` rows appear for "This fiscal year" and `register-new-entry` is absent. Press `register-back`: the Chart of Accounts is shown with its Business Checking row. Choosing "View register" does not also open the account panel (`account-panel` has count 0).
  2. Desktop: press the Business Checking row to open the panel; `account-panel-view-register` is visible and at least 44pt high; press it; the register opens (`register-title`). Back returns to the Chart of Accounts.
  3. Phone (390x844; navigate with `navigateToPackage` first, then `setViewportSize`): the same two flows through the card menu and the panel; the register shows cards, and the card press opens the bottom drawer, `register-drawer-close` closes it.
  4. Both sizes: a parent account (Software Subscriptions) reached through the menu shows "Own transactions only".
  All data is read through the UI; no raw PocketBase call, no `page.goto` after `login`.

**Do:**
1. `help/account-register.md` with frontmatter `title: Account register`, `summary` (one sentence), `tags: [register, transactions, ledger]`, `order: 25`. Task-oriented prose: to open a register, choose View register in an account's menu or panel; the columns; the date-range presets and the default This month; Opening balance, Ending balance and the "through" date, and why it can differ from the Chart of Accounts figure; to sort, press the Date heading; to see an entry, press its row; a parent account shows Own transactions only; the New journal entry button appears for bookkeepers when journal entries are available. No deployment hostname. Link `[Chart of Accounts](help://books:chart-of-accounts)`.
2. In `help/chart-of-accounts.md`, under "Read the tree", add: "To see the transactions of one account, open its menu and choose View register. See [Account register](help://books:account-register)." Then run `cd ~/code/tinycld/tinycld && pnpm run packages:generate`. The manifest already declares `help: { directory: 'help' }`.
3. Write the e2e as above, reusing `openRegister` and `accountItem`.
4. Run `pnpm exec tinycld-pkg check`, then `pnpm exec tinycld-pkg test:e2e -g "account-register:"` (all four spec files).
