# dashboard — helix run ledger

- mode: unattended
- unit: p5-dashboard
- started: 2026-11-22
- package branch: books/p5-dashboard   core checkout: main@72b8c6f9
- spec: docs/specs/dashboard-design.md
- checkpoints: docs/plans/dashboard-checkpoints.md
- reference: docs/plans/dashboard-reference/
- evidence: docs/plans/dashboard-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/dashboard-capture.json
- review mode: C — none (unattended)
- core extension: none (line/ring chart extension declined at the design gate)
- sparks:
  - One large figure leads each widget → expressible (`text-3xl font-semibold text-foreground tabular-nums` under a `text-xs uppercase text-muted-foreground` title; card `rounded-xl border border-border bg-surface p-4`)
  - A split is one proportional bar → expressible (`View`s with `flex` weights, `h-3 rounded-full`, track `bg-surface-secondary`; fills `bg-danger`, `bg-primary`, `bg-success`, `bg-info`)
  - A trend is a line and a share is a ring → needs extension (rejected) → dropped (month columns and ranked bars show the same facts)

## Deferrals
(none yet)

## Rebuttals
(none yet)

## Design notes
- cp 1 · reviewer A NOTE: server/dashboard_test.go:162-165 — the test declares its own view-name constants beside `invoiceDueTotalsView` / `paymentDayTotalsView` of server/dashboard.go; the literal names also catch a renamed constant. No change.
- cp 1 · reviewer A NOTE: server/dashboard_test.go `TestDashboardViews_AreLive` — proves the registry entries and `CheckViews`, not that a `books_invoices` write signals `collection/books_invoice_due_totals`; that proof is core's changesignal tests and the client e2e of checkpoints 2 and 3. No change.
- cp 1 · reviewer A NOTE: tests/dashboard-fixture.test.ts — the typed `DUE` / `PAID` assignments repeat the fixture's `satisfies` check. No change.

## Out-of-plan changes
(none yet)

## Phase notes
- phase 1: unattended; design packet at ~/tmp/tinycld/auto-helix-books/staging/p5-dashboard/packet.md (intake.md beside it).
- phase 3: design gate 2026-11-22 — the human picked direction A (card grid 3/2/1 columns, Customize in place as one SortableList), accepted the recommended answer to all 15 open questions, and declined the chart core extension. No platform-only items.
- phase 3 (2026-11-22, unattended, pass 2): direction A captured. No human corrections (unattended).
  - fixture `tinycld/books/lib/dashboard-fixture.ts`: the widget models of each state (`DASHBOARD_STATES`: populated, hidden-amounts, edit, reordered, all-hidden, empty, empty-read-only, read-only, loading, error, prefs-error, long) and the rows of the two new views (`INVOICE_DUE_TOTALS`, `PAYMENT_DAY_TOTALS`; the populated Invoices model is their sum against `DASHBOARD_TODAY` 2026-11-22). The view-row interfaces and the model types (`WidgetId`, `DashboardPrefs`, `PeriodId`, `InvoicesModel` …) are local: the migration checkpoint replaces the row interfaces with the generated types, and the checkpoint that adds `lib/dashboard-prefs.ts` / `lib/dashboard-figures.ts` moves the model types there. Account names are the seeded book's (`lib/seed-accounts.ts`), except in `long`. The fixture is not wired into `seed.ts`: the models are computed figures, not records (seed.ts already posts the documents).
  - scratch route `tinycld/books/screens/helix-mockup.tsx` (`?state=` one key of `DASHBOARD_STATES`); it reads only the fixture. Core parts: `SortableList` + `SortableDragHandle`, `Switch`, `Menu` (period picker: popover on wide, sheet with title "<Widget> period" on a phone), `Button`, `useBreakpoint`, `useContainerWidth` (`@tinycld/core/ui/forms/use-container-width`, the page width for the column count); Books `ListBanner` (preference error), `useFabClearanceStyle`, `formatMoney`.
  - reference `docs/plans/dashboard-reference/` (19 shots, 54 images, light and dark; manifest `docs/plans/dashboard-capture.json`): populated at 900 / 1280 / 1600 and 390; hidden-amounts, loading, error at 1280 and 390; long at 1280 / 1600 and 375 / 390; edit, all-hidden, empty, prefs-error at 390 and 1280; reordered, read-only, empty-read-only, period-menu at 1280; period-menu-phone at 390.
  - measured: the page beside the Books sidebar is about 955 px wide in a 1280 window and about 1275 px in a 1600 window, and about 660 px in a 900 window. With the spec's breakpoints (3 columns from 1100 px of page width, 2 from 700) a 1280 window shows TWO columns, a 1600 window three and a 900 window one. The artboard drew three columns at 1280; the spec's numbers stand.
  - sparks: none dropped. Spark 2 changes: the bar track is `bg-border`, not `bg-surface-secondary` (in the dark theme surface-secondary is 18 24 40 on a 15 22 41 card: the track, and with it a short bar's proportion, cannot be seen; `bg-border` is what core `Switch` uses for its off track). `bg-success` and `bg-info` are in no scanned Books or core/ui file, so the route draws those two fills with `useThemeColor('success' | 'info')`; the build uses the classes in a shipped file. Classes the build must not assume exist (in no scanned file): `mt-auto`, `w-40`, `rounded-t`, `items-stretch`, `pl-1`; the route uses style props for them.
  - reference choices the build should keep: each grid cell is a plain `View` with `flex: 1, minWidth: 0` and the padded card fills it (a `flex-1` on the card itself made a short last row's card wider than its column); a short last row is padded with empty cells. The links row sits at the card's bottom (`marginTop: 'auto'`). The widget title row has a fixed least height so the figures of a row line up with and without a period picker. The Sales columns: the picked (latest) column at full `bg-primary`, the others at 0.55 opacity; a zero or negative month is a 2 px `bg-muted` mark; with more than six months in a one-column page the month label is its first letter (twelve columns are about 24 px wide at 375). "Everything else" has a `bg-muted` fill. A negative bank balance draws in the danger tone. Edit rows on a phone drop the visible word "Show" (the switch keeps the accessible name "Show <widget>"), or "Bank accounts" and "Profit and loss" are cut at 390. Move buttons are 44 px icon buttons named "Move up: <widget>" / "Move down: <widget>". The skeleton is `bg-border` blocks.
  - open points for phase 4 (not decided here): (1) spec §3 says every amount is drawn with `amountText`, which returns '' for zero; the reference uses `formatMoney`, so a zero Overdue reads "$0.00" (shot long). (2) "No sales in last 6 months." is the spec's rule (the label in lower case); it reads without an article. (3) Hide amounts turns the leading figure into "•••••" at `text-3xl` (shot hidden-amounts).
- phase 4 (2026-11-22, unattended): plan `docs/plans/dashboard-checkpoints.md`, 4 checkpoints (1 views and collections — logic; 2 landing with Invoices widget; 3 Bank, Expenses, Profit, Sales widgets; 4 Customize, phone header and help). plan-check `--unattended`: 0 errors.
  - open points of phase 3, decided: (1) a zero amount draws "$0.00" (`dashboardAmount`: `amountText`, else `formatMoney(0, currency)`); spec §3 "The page", fourth bullet, gained one sentence that says so. (2) The empty text follows the spec's rule ("No sales in last 6 months."). (3) The mask replaces the text in the same element, at the figure's size. (4) Columns follow the page's own width: 1600 window three, 1280 two, 900 one.
  - plan decisions a later phase must know: D2 — `useDashboardPrefs` is a Books hook over the same `user_preferences` row (`useMyLiveQuery` + `useMutation`), not core `useUserPreference`, because the core hook exposes no load state, no load error and no save failure (spec §4 names the core hook; no §3 bullet changes). D6 — on a phone the Lists hub is reached from the drawer; e2e helpers use `showListsHub`. D7 — `DASHBOARD_WIDGETS` is partial in checkpoint 2; the Customize button comes in checkpoint 4. D9 — Sales "This fiscal year" draws future months; the default shown month is the latest not after today. D10 — the comparison line is absent when the earlier net profit is zero. D12 — checkpoint 2 hands back `NEEDS-RUN: full Books e2e suite` (it changes the screen every Books spec starts on).
  - all dashboard e2e are in one file (`tests/e2e/dashboard.spec.ts`, 12 tests: 6 + 3 + 3), because the preference is one row of the shared test user.
  - plan review (one fresh agent; 26 findings: 2 blockers, 16 should-fix, 8 notes; all fixed in the plan):
    - blockers: checkpoint 1 did not name `tests/migration-prefixes.test.ts` (it pins the migrations after the audit view); checkpoint 2 did not name `tests/books-sidebar-render.test.tsx` (it pins the first sidebar ids).
    - narrowed or untested behavior: the live Unpaid test could pass with no change signal (now the dashboard stays open and a second page posts); no live test, no Hide amounts test, no link-target test and no error + Retry test for the checkpoint 3 widgets (added to existing tests; the 12-test budget stands, D18); "disabled until it loads" and the failed save of a period, a Show switch and a move had no assertion (added to tests 5 and 6); "Edit mode is not kept" did not hold on leaving the screen, because the stack keeps the screen mounted (now reset with `useFocusEffect`, with an e2e step); row height and bar weights had no assertion (`barShares`, a height compare).
    - wrong names: core `Switch` takes `value` / `onValueChange` / `isDisabled`; `PROFIT_AND_LOSS_SHIPPED_KEY` exists already in `lib/profit-and-loss-fixture.ts`; `ParamDef` is in `core/reports/lib/spec`; `dashboardAmount` had no rule for a `null` balance (`TOO_LARGE_TEXT`).
    - new decisions from the review: D13 (the first-run `SetupCard` also shows on the dashboard: the spec did not name it, and the landing change would hide it from a new book's admin), D14 (the accounts read is the chart's `useAccountsQuery`), D15 (the balances read starts at the earliest month any period can need, so a period change starts no read), D16 (links are expo-router `Link`s), D17 (locators name the visible screen).
    - also fixed: the help topic's picture (embed, two image files, the `help:screenshots` step); the e2e files that return to the hub or reach it through `openOtherBooksPage` are named and in checkpoint 2's gate run.
- review mode switches: none

## Checkpoint 1 — Dashboard views and collections
- test writer: server/dashboard_test.go (7 tests), server/registrations_test.go, server/oauth_scopes_test.go (`TestOAuth_DashboardViewsAreReadOnly`), tests/migration-prefixes.test.ts, tests/collections.test.ts, tests/dashboard-fixture.test.ts; red for the right reason: yes (Go: the views do not exist, proven with `go test -overlay` because registrations_test.go does not compile without `registerDashboardViews`; TS: the missing names, `DASHBOARD` length 0, and TS2305 on the typed fixture import); untestable: none
- implementer: the views migration 2100000041, `server/dashboard.go` `registerDashboardViews`, Register call, OAuth `ro` entries, audit comment, client collections with `liveViewOptions`, type re-exports, fixture typed with the generated types; generated `BooksInvoiceDueTotals` / `BooksPaymentDayTotals` have number and string fields as asked; DONE
- test disputes: none
- self-declared differences: Do step 4 says `pnpm install` at the workspace root; the implementer ran `pnpm run packages:generate` (tinycld), which regenerates the same pbSchema.ts / pbZodSchema.ts from the migrations
- gate 1: tests unedited: yes · pass (`go test ./...` in server: ok 496s, no file changed after that run; `packages:generate` then `tinycld-pkg check`: biome 2137 files clean, tsc clean, vitest 436 files / 9411 tests; no e2e in this checkpoint)
- gate 2: n/a (logic checkpoint)
- gate 3 A (correctness): 0 BLOCK, 0 DEFERRAL; targeted Go run of the 10 named tests passed
- gate 3 B (conformance): script lines: 0 · findings: none · out-of-plan files: none
- fix review: n/a (no accepted finding, no fix round)
- gate 3 A notes: 3, listed under Design notes
- reviewer-caught deferrals: none
- commit: see git log, `feat(books): dashboard views and collections`

## Final review
- eval:
