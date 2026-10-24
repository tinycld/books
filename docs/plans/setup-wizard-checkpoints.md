# setup-wizard — checkpoint plan

Spec: `docs/specs/setup-wizard-design.md`. Ledger: `docs/plans/setup-wizard-ledger.md`. All paths are relative to the `books` package root. Package files that Metro loads import each other relatively (`../lib/x`), never with `~/tinycld/books/...`. The fixture `tinycld/books/lib/setup-wizard-fixture.ts` feeds the scratch route and the tests. Reference screenshots: `docs/plans/setup-wizard-reference/<shot>-<390|1280>-<light|dark>.png`. Core's step shell is `SetupWizardShell` with `StepHeading` and `SetupContinueButton` (`@tinycld/core/components/setup/wizard/*`); a package step module default-exports a component taking `{ next }` and may export `useIsStepDone` and `useIsStepVisible` (`tinycld/docs/packages.md`, "Setup wizard steps"). The step label reads "Part n of 3" inside the body because core's shell already prints its own "n of m" for the whole organization wizard. Corporation equity accounts are Common stock, Paid-in capital and Retained earnings, because `account_types.json` has no dividends detail type.

### Checkpoint 1 — Settings fields and starter chart

**Delivers:** the two new `books_settings` fields, the typed starter chart for both ownership choices, and the form schema, all checked against the account types.

**Files:**
- Modify: `pb-migrations/2100000001_create_books_settings.js` (add `business_name` text max 200 and `setup_completed` bool to books_settings, edited in place because Books is unreleased)
- Create: `tinycld/books/lib/starter-chart.ts`
- Create: `tinycld/books/lib/setup-schema.ts` (holds `FISCAL_MONTHS`, `setupSchema`, `SetupValues`)
- Modify: `tinycld/books/lib/setup-wizard-fixture.ts` (delete `SetupSettings`, type settings with the generated `BooksSettings`, build `STARTER_CHART` from `starterChart`, drop Dividends paid)
- Modify: `tinycld/books/screens/helix-mockup.tsx` (scratch route: follow the renamed fixture exports)
- Test: `tests/starter-chart.test.ts` · `tests/setup-schema.test.ts` · `server/setup_settings_test.go`

**Interfaces:**
- Consumes: `ACCOUNT_TYPES` from `tinycld/books/lib/account-types.ts`; `BooksSettings` from `tinycld/books/types.ts`; `z`, `zodResolver` from `@tinycld/core/ui/form`
- Produces:
  - `Ownership = 'owners' | 'corporation'`
  - `StarterAccount { key: string; number: string; name: string; type: string; detail_type: string; parent?: string }` (`parent` is the `key` of another starter account)
  - `starterChart(ownership: Ownership): StarterAccount[]`
  - `STARTER_GROUPS: { key: 'assets' | 'liabilities' | 'equity' | 'income' | 'expenses'; label: string }[]`
  - `groupStarterChart(accounts: readonly StarterAccount[]): { key: string; label: string; accounts: StarterAccount[]; count: number }[]` (in `STARTER_GROUPS` order, using `ACCOUNT_TYPES[].group`)
  - `OWNERSHIP_CHOICES: { value: Ownership; title: string; summary: string }[]` (in `starter-chart.ts`; `summary` names the three equity accounts of that choice)
  - `FISCAL_MONTHS: string[]` (January to December, in `setup-schema.ts`)
  - `setupSchema` (zod object: `business_name` trimmed string 1 to 200, `fiscal_year_start_month` integer 1 to 12, `ownership` enum) and `type SetupValues = z.infer<typeof setupSchema>`
  - `books_settings.business_name: string`, `books_settings.setup_completed: boolean` in the generated types

**Gates:** 1 · 3 (nothing renders)

**Spec:**
- "Business: Legal business name (required, max 200) and Fiscal year starts in (month select, default January). The currency line reads "US dollars (USD)" and is not editable."
- "Ownership: "How is the business owned?" with two cards: "One owner or partners" (equity accounts Owner's equity, Owner's contributions, Owner's draws) and "Corporation" (Common stock, Paid-in capital, Retained earnings). The choice only decides those equity accounts."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/starter-chart.test.ts` — for each ownership value, every account's `type` is in `ACCOUNT_TYPES` and its `detail_type` is a detail type of that type; numbers are unique and non-empty; every `parent` names a `key` in the same list, has the same `type`, and nests at most 2 levels; `owners` contains Owner's equity, Owner's contributions and Owner's draws and no Common stock; `corporation` contains Common stock, Paid-in capital and Retained earnings and no Owner's draws; both contain an `accounts_receivable`, an `accounts_payable` and an `income` account.
- `tests/starter-chart.test.ts` — `groupStarterChart(starterChart('owners'))` returns the five groups in Assets, Liabilities, Equity, Income, Expenses order, each `count` equals its `accounts.length`, and the counts add up to the chart length.
- `tests/starter-chart.test.ts` — each `OWNERSHIP_CHOICES` summary contains the three equity account names of its `starterChart`; `FISCAL_MONTHS` starts with January and ends with December and has 12 entries.
- `tests/setup-schema.test.ts` — `setupSchema` rejects a blank or whitespace-only `business_name`, rejects 201 characters and accepts 200; rejects month 0 and 13 and 1.5; accepts month 1 and 12; rejects a missing or unknown `ownership` with a message; trims the name.
- `server/setup_settings_test.go` — the books_settings update rule: an admin can set `business_name` and `setup_completed`; a bookkeeper and a read-only user get refused, using the helpers in `server/config_rules_test.go`.

**Do:**
1. In the migration, add the two fields next to `fiscal_year_start_month`: `{ name: 'business_name', type: 'text', max: 200 }` and `{ name: 'setup_completed', type: 'bool' }`. The seeded row keeps `business_name` empty and `setup_completed` false. Run `pnpm run packages:generate` in `tinycld/` so the generated types carry them.
2. Create `lib/starter-chart.ts`. Move the account rows out of the fixture: exactly 34 accounts for each ownership value (9 assets, 6 liabilities, 3 equity, 4 income, 12 expenses), with 4-digit numbers (1000s assets, 2000s liabilities, 3000s equity, 4000s income, 5000 to 6999 expenses), two sub-accounts (`1010 Business checking` and `1020 Business savings`) that name `1000 Cash and bank` by `key`, and the equity accounts decided by `ownership`. Export the names above. Group by `ACCOUNT_TYPES` group.
3. Create `lib/setup-schema.ts` with `setupSchema`, `SetupValues`, `FISCAL_MONTHS` and a message per rule. Money, currency and the account number pattern stay in the existing helpers.
4. Update the fixture to import `starterChart`, `OWNERSHIP_CHOICES`, `FISCAL_MONTHS` and to use `BooksSettings`; keep `LONG_BUSINESS_NAME`, `FRESH_SETTINGS`, `DONE_SETTINGS`, `REFUSED_ACCOUNT`, `POPULATED_ACCOUNT_COUNT`, `CHART_GROUPS` and `GROUP_OF_TYPE`, and re-export nothing else. Update the scratch route to read `title`/`summary` from `OWNERSHIP_CHOICES` and `FISCAL_MONTHS` from `setup-schema.ts`.
5. Wire `seed.ts`: no change to the accounts; the settings row stays `setup_completed: false` so the seeded book shows the wizard path for a book that already has accounts. Add one comment line in `seed.ts` saying so.

### Checkpoint 2 — Starter chart create batch

**Delivers:** the hook that reads setup state and creates the starter chart and settings in order, stops on a refusal, and resumes without duplicates.

**Files:**
- Create: `tinycld/books/lib/setup-plan.ts`
- Create: `tinycld/books/hooks/useBooksSetup.ts`
- Modify: `tests/accounts-form-harness.ts` (the test writer adds a `refuseSettings` option that refuses `books_settings` writes, the same way `refuseAfter` refuses account inserts; it goes under Out-of-plan changes)
- Test: `tests/setup-plan.test.ts` · `tests/useBooksSetup.test.tsx`

**Interfaces:**
- Consumes: `starterChart`, `StarterAccount`, `Ownership`, `SetupValues` from checkpoint 1; `useStore` from `@tinycld/core/lib/pocketbase`; `useMutation`, `performMutations` from `@tinycld/core/lib/mutations`; `newRecordId` from `pbtsdb/core`; `recoverLiveQueries` from `@tinycld/core/lib/recover-live-queries`; `useBooksAccess` from `tinycld/books/hooks/useBooksAccess.ts`
- Produces:
  - `planChart(ownership: Ownership, existing: ReadonlyMap<string, string>): StarterAccount[][]` (`existing` maps an account number to its record id; levels: accounts with no parent first, then their children; an account whose number is in `existing` is left out; a child whose parent exists is kept and the hook gives it the existing parent's id)
  - `useBooksSetup(): { settings: BooksSettings | undefined; isReady: boolean; hasLoadError: boolean; retryLoad: () => void; accountCount: number | undefined; isAdmin: boolean; isResuming: boolean; create: (values: SetupValues) => Promise<SetupOutcome>; skipChart: (values: SetupValues) => Promise<SetupOutcome>; progress: { done: number; total: number } | null }`
  - `SetupOutcome = { ok: true; created: number } | { ok: false; failedAccount: string; message: string } | { ok: false; busy: true }` (`failedAccount` is the refused account's name, or `Business settings` when a settings write is refused or the settings row is missing; `busy` is returned, with nothing written, when a call arrives while another runs or before the settings and account queries are ready)

**Gates:** 1 · 3 (nothing renders)

**Spec:**
- "Create runs one batch: the settings row first (business name and fiscal year), then parent accounts, then sub-accounts, then the settings row again to mark setup done. Progress shows "Creating accounts n of N", where N is the whole chart and accounts that already exist count as done."
- "A failure stops the batch, names the account that was refused with the server's message, and offers Try again. Try again skips accounts that already exist (matched by number) and continues."
- "Skip: "Start with an empty chart" on the Starter chart screen sets only the settings row, so the admin can build or import a chart. Skip is not offered on a batch left half done."
- "A chart that already has accounts when the step opens: the Starter chart screen is replaced by "This book already has N accounts. We will not add the starter chart." Create saves only the settings. A book whose settings hold a business name but are not marked done is a batch left half done: it shows the Starter chart screen, and Create resumes it, skipping accounts that already exist, and the Ownership choice is read back from the equity accounts already created."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/setup-plan.test.ts` — `planChart` returns parents before children across levels; leaves out an account whose number is a key of `existing`; with every number existing returns `[]`; children of an existing parent are still planned.
- `tests/useBooksSetup.test.tsx` — with the real local-only collections from `tests/accounts-form-harness.ts` (`seedBooks`, `refuseAfter`, `liftRefusal`, `messageRefusal`): `create` inserts every account of the plan and then sets `business_name`, `fiscal_year_start_month` and `setup_completed: true` on the settings row; the settings row is written last, and each account is inserted only after the insert before it succeeded, parents before children (assert the insert order from the collection's write log).
- `tests/useBooksSetup.test.tsx` — a refusal on one account makes `create` return `{ ok: false, failedAccount: <its name>, message: <the server message> }` and leaves `setup_completed` false; after `liftRefusal`, `create` again inserts only the accounts not yet present (no duplicate numbers) and finishes with `{ ok: true }`. Include the case where the refusal lands on a child after its parent was inserted: the retry inserts the child with the existing parent's id.
- `tests/useBooksSetup.test.tsx` — `skipChart` writes only the settings row and inserts no account; with seeded accounts present, `create` inserts no account and writes the settings row.
- `tests/useBooksSetup.test.tsx` — a refused settings write (with `refuseSettings`) returns `{ ok: false, failedAccount: 'Business settings', message }` and leaves `setup_completed` false; `create` and `skipChart` seed the settings row through the harness `ledger` option, since `seedBooks` seeds none by default.
- `tests/useBooksSetup.test.tsx` — after a refusal part-way (`isResuming` true from the live settings row), unmounting and rendering the hook afresh keeps `isResuming` true, and `create` then inserts only the missing accounts (no duplicate number), the settings row ends with `setup_completed` true, and a book that has accounts and `isResuming` false gets only the settings write.
- `tests/useBooksSetup.test.tsx` — a second `create` call while the first is held returns `{ ok: false, busy: true }` and adds no write; `create` before the queries are ready returns `{ ok: false, busy: true }` and writes nothing; a missing settings row returns `Business settings` and inserts no account.
- `tests/useBooksSetup.test.tsx` — the insert-order test gates every write in turn (or asserts the maximum number of writes in flight is 1), not only the first; the refusal position is set relative to the writes after seeding, not by an offset that counts the harness's own deletes.
- `tests/useBooksSetup.test.tsx` — `progress` reports `done` rising to `total` (the whole chart size, starting at the number of accounts that already exist on a retry) during `create` and is `null` before and after.

**Do:**
1. Create `lib/setup-plan.ts` with `planChart`.
2. Create `hooks/useBooksSetup.ts`: one `useLiveQuery` for the settings row and one for the accounts (`.select()` the id and number only); `accountCount` and the number-to-id map come from the second. `isResuming` is `!settings.setup_completed && settings.business_name !== ''`, read from the live settings row, so it survives a remount. `create` returns `{ ok: false, busy: true }` and writes nothing while a call is running (an in-flight flag) or before `isReady`; it returns `Business settings` before any insert when the settings row is missing. Otherwise it runs a `useMutation` whose async `mutationFn` awaits one write at a time through `performMutations` (a generator cannot attach the refused account's name without a mutable ref), with an empty `onError` because `create` reports the failure itself: when the plan is non-empty, the settings update `{ business_name, fiscal_year_start_month }` first; then one insert per planned account in the order of the levels from `planChart` (ids from `newRecordId()`; a child's `parent` is its parent's id, and a missing parent id throws); then the settings update `{ setup_completed: true }`. When the book has accounts and `isResuming` is false, `create` writes one settings update with all three fields and no account. When `isResuming` is true, the plan skips accounts whose number exists. Each insert is wrapped so a failure carries the account's name; a failure returns `{ ok: false, failedAccount, message }` through `errorToString` and goes to `log.error('books.setup', error)`. `progress` is `{ done, total }` with `total` the whole chart size and `done` starting at the number of accounts that already exist. `retryLoad` calls `recoverLiveQueries`.
3. `isAdmin` comes from `useBooksAccess`. The hook has no `useEffect`.

### Checkpoint 3 — Setup screens and entry points

**Delivers:** the three-part setup step, its Done, error, populated and non-admin states, the `/a/books/setup` route, the core wizard step registration, and the setup card on the Lists hub.

**Files:**
- Create: `tinycld/books/setup/accounting.tsx`
- Create: `tinycld/books/components/setup/SetupParts.tsx`
- Create: `tinycld/books/components/SetupCard.tsx`
- Create: `tinycld/books/screens/setup.tsx`
- Create: `tinycld/books/hooks/useSetupParts.ts`
- Modify: `tinycld/books/components/ListsHub.tsx` (draw `SetupCard` above the cards)
- Modify: `tinycld/books/hooks/useListsHub.ts` (expose `showSetupCard`)
- Modify: `manifest.ts` (add `setupSteps`)
- Modify: `package.json` (`exports`: `"./setup/*": "./tinycld/books/setup/*.tsx"`)
- Modify: `tests/lists-hub.test.tsx` (the test writer adds the setup-card cases; it goes under Out-of-plan changes)
- Test: `tests/manifest.test.ts` · `tests/setup-parts.test.tsx` · `tests/setup-step-hooks.test.tsx` · `tests/lists-hub.test.tsx`

**Interfaces:**
- Consumes: `useBooksSetup`, `SetupOutcome` from checkpoint 2; `setupSchema`, `SetupValues`, `FISCAL_MONTHS`, `OWNERSHIP_CHOICES`, `groupStarterChart`, `starterChart` from checkpoint 1; `StepHeading`, `SetupContinueButton`, `SetupWizardShell` from `@tinycld/core/components/setup/wizard/*`; `useForm`, `zodResolver`, `TextInput`, `SelectInput`, `FormErrorSummary` from `@tinycld/core/ui/form`
- Produces:
  - `default function SetupAccountingStep({ next }: { next?: () => void })`, `useIsStepDone(): boolean | undefined`, `useIsStepVisible(): boolean | undefined` from `setup/accounting`
  - `useSetupParts(next?: () => void)`: `{ part: 'business' | 'ownership' | 'chart' | 'creating' | 'done' | 'error' | 'populated' | 'non-admin' | 'loading'; ...handlers }`
  - route `/a/books/setup`; `manifest.setupSteps: [{ id: 'accounting', label: 'Accounting', module: 'setup/accounting', order: 'a1V' }]`
  - `SetupCard({ isVisible }: { isVisible: boolean })`; `useListsHub().showSetupCard: boolean`

**Gates:** 1 · 2 (reference: `business-*`, `ownership-*`, `chart-*`, `creating-*`, `done-*`, `error-*`, `populated-*`, `non-admin-*` screenshots; built URL: `/a/books/setup`) · 3

**Spec:**
- "The step shows a progress label ("Part n of 3") and three parts, one per screen: Business, Ownership, Starter chart."
- "Business: Legal business name (required, max 200) and Fiscal year starts in (month select, default January). The currency line reads "US dollars (USD)" and is not editable."
- "Ownership: "How is the business owned?" with two cards: "One owner or partners" (equity accounts Owner's equity, Owner's contributions, Owner's draws) and "Corporation" (Common stock, Paid-in capital, Retained earnings). The choice only decides those equity accounts."
- "Starter chart: shows the accounts to be created, grouped Assets, Liabilities, Equity, Income, Expenses, with a count per group. The list is read-only. Back returns to Ownership."
- "Done screen: "Your books are ready" with the account count, and two actions: Open Chart of Accounts, Enter opening balances (shown only when that screen is available)."
- "A chart that already has accounts when the step opens: the Starter chart screen is replaced by "This book already has N accounts. We will not add the starter chart." Create saves only the settings. A book whose settings hold a business name but are not marked done is a batch left half done: it shows the Starter chart screen, and Create resumes it, skipping accounts that already exist, and the Ownership choice is read back from the equity accounts already created."
- "The step is done when `books_settings.setup_completed` is true (`useIsStepDone`). It is visible only to Books admins (`useIsStepVisible`)."
- "Empty, loading, error: loading shows a skeleton card; a settings load failure shows a Retry through `recoverLiveQueries`."
- "Phone: one column, Back and Next under the form. Wide: a centered card, 640 wide."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/manifest.test.ts` — the manifest has a `setupSteps` entry with id `accounting`, label `Accounting`, module `setup/accounting`, and the module resolves through `package.json` `exports` to a file that exists and default-exports a function.
- `tests/setup-parts.test.tsx` — `useSetupParts` moves business to ownership to chart on Next, returns to the previous part on Back and keeps the typed values, and blocks Next on a blank business name with the schema message, through the real form (no mocked hooks); with the harness collections, a create that fails after inserting one parent shows part `error` while the account count is above 0, and a create that succeeds shows part `done`; a seeded book with accounts and no create attempt shows `populated` instead of `chart`; a non-admin shows `non-admin`; a settings row not yet loaded shows `loading`; a settings load failure sets `hasLoadError` and `retryLoad` recovers.
- `tests/setup-step-hooks.test.tsx` — `useIsStepDone` is `undefined` while the settings row loads, `false` with `setup_completed` false and `true` with it true; `useIsStepVisible` is `undefined` while access loads, `true` for an admin and `false` for a bookkeeper and a read-only user.
- `tests/lists-hub.test.tsx` — `useListsHub().showSetupCard` is true for an admin with setup not done, and false for a non-admin, and false when `setup_completed` is true; `SetupCard` with `isVisible` false renders nothing.

**Do:**
0. Fix-round additions: the chart preview is unclamped (every group's accounts inside the shell's own scroll, no nested ScrollView); `lib/starter-chart.ts` gains `inferOwnership(existingNumbers: ReadonlySet<string>): Ownership` (corporation when an existing number belongs to a corporation-only equity account, else owners) used to preset the Ownership choice on a half-done book; Skip is hidden while `isResuming`; a press while a create runs is ignored without changing the part or clearing the failure; `error` is never drawn without a failure; the skip label is exactly "Start with an empty chart"; the non-admin view is one component with an `isVisible` prop; the Lists-hub card navigation lives in a hook; the error heading for a settings failure reads "Your settings could not be saved" and the lead "Keep this page open until it finishes." is not shown in the error part.
0b. Second fix round: `planChart` puts the equity accounts first in its first level, the ownership-specific one (Owner's equity for owners, Common stock for corporation) before any other account, so the first successful insert reveals the ownership for `inferOwnership` after a remount; Back from the chart part is not offered while `isResuming` (the inferred ownership is authoritative); a press that fails form validation on any part other than Business returns to the Business part where the errors show; `done` outranks `non-admin` in the part precedence; counts read "1 account" and "n accounts" in the create button, the populated lead, the Done lead and the error text.
0. Part precedence, one rule: `creating`, then `done`, then `error`, then `non-admin`, then `loading` win over everything; `populated` replaces only the `chart` part, and only while `isResuming` is false (so a partial failure that left accounts behind shows `error` in this session and the Starter chart screen after a remount, never `populated`, and a finished create shows `done`). Core's shell has no Back, so Back sits in the body above the shell's footer, as in the reference.
1. Create `hooks/useSetupParts.ts`: a `useForm` with `zodResolver(setupSchema)`, hold the current part in `useState` (local UI state that no other component reads); derive `non-admin`, `loading`, `populated` (account count above 0), `error` from `useBooksSetup`. Handlers: `goNext`, `goBack`, `create`, `skipChart`, `retry`, `openChart`, `openOpeningBalances`; the opening-balances action is drawn only when a `SIDEBAR_ENTRIES` or `LIST_ENTRIES` entry with id `opening-balances` exists and is `available` (`availableOnly` from `lib/shell-nav.ts`), which is not the case in this unit.
2. Create the part components in `components/setup/SetupParts.tsx` from the reference: business (TextInput and SelectInput with default January and the read-only currency line), ownership cards (plain Views with a selected border; the radio semantics are `accessibilityRole="radio"`), chart (group counts, read-only account list, "Start with an empty chart", "Create n accounts"), creating ("Creating accounts n of N"), error (account name, server message, Try again), populated ("This book already has N accounts. We will not add the starter chart."), non-admin ("A Books admin must finish setting up Books."), loading skeleton.
3. `setup/accounting.tsx` renders the parts inside `StepHeading` (title and `lead`), shows "Part n of 3", and exports `useIsStepDone` (settings `setup_completed`, `undefined` while loading) and `useIsStepVisible` (`isAdmin`, `undefined` while loading). `screens/setup.tsx` renders the same step inside `SetupWizardShell` with `phase: 'setup'`, a one-step `WizardSummary` for `books:accounting`, `currentStepId: 'books:accounting'` and `onSkip: null`. The step calls `next()` once, after a successful create or skip, when it is given one; the in-Books route passes none and shows the Done part.
4. Add `setupSteps` to the manifest and the `./setup/*` export; run `pnpm run packages:generate`.
5. Create `SetupCard` and draw it from `ListsHub` when `showSetupCard` is true (admin and setup not done); its press opens `/a/books/setup` through `useOrgHref`.

### Checkpoint 4 — Setup e2e and help topic

**Delivers:** end-to-end coverage of the setup flow at desktop and phone sizes, and the in-app help topic.

**Files:**
- Create: `tests/e2e/setup-wizard.spec.ts`
- Create: `help/setup-wizard.md`
- Test: `tests/help-setup-wizard.test.ts`

**Interfaces:**
- Consumes: `/a/books/setup` and `SetupCard` from checkpoint 3; `login`, `navigateToPackage` from `@tinycld/core/e2e-helpers`
- Produces: help topic `books:setup-wizard`

**Gates:** 1 · 3 (nothing renders)

**Spec:**
- "The step is done when `books_settings.setup_completed` is true (`useIsStepDone`). It is visible only to Books admins (`useIsStepVisible`)."
- "Phone: one column, Back and Next under the form. Wide: a centered card, 640 wide."

**Tests it must add:** (written by the test writer before the implementer starts; the implementer may not edit them)
- `tests/e2e/setup-wizard.spec.ts` — `test.describe('setup-wizard: …')`, one test (the e2e database is shared, and finishing completes setup, so the flow mutates it once and nothing depends on test order): signs in, `navigateToPackage` to Books at the default viewport, clicks the setup card on the Lists hub, sees "Part 1 of 3", a blank business name keeps the flow on the Business part and shows the form message, enters a name, picks July, presses Next to Ownership, picks Corporation, presses Back and finds the typed values kept, goes forward to the populated-book notice (the seeded book already has accounts; the e2e database seeds no non-admin Books user and no empty book, so the fresh-chart, creating, error and non-admin parts are covered by the hook tests of checkpoints 2 and 3), then calls `page.setViewportSize({ width: 390, height: 844 })` and repeats Back and Next once on the phone layout, finishes, sees the Done screen with "Your books are ready", and sees no setup card on the Lists hub afterward.

**Do:**
1. Write the spec with the helpers; no raw PocketBase reads or writes.
2. Write `help/setup-wizard.md`: start with "To set up Books, …", cover the three parts, the already-has-accounts case and "Start with an empty chart"; link `help://books:chart-of-accounts`. Run `pnpm run packages:generate` in `tinycld/`.
