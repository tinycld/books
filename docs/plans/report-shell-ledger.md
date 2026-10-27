# report-shell — helix run ledger

- started: 2026-10-26
- mode: unattended
- unit: p5-report-shell
- package branch: books/p5-report-shell   core checkout: main@67b51fc3
- spec: docs/specs/report-shell-design.md
- checkpoints: docs/plans/report-shell-checkpoints.md
- reference: docs/plans/report-shell-reference/
- evidence: docs/plans/report-shell-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/report-shell-capture.json
- review mode: C — none (unattended)
- core extension: tinycld PR #380 (useRecord queryKey, merged eaf01844); tinycld PR #379 (branch books/p5-report-shell) — checkpoint 0, recoverLiveQueries fix (human decision 2026-10-26, option 1)
- sparks:
  - report reads like a finished document → expressible (ReportDocumentHeader strip: text-muted-foreground, text-lg font-semibold text-foreground, border-border; books_settings.business_name)
  - totals set apart by weight and rule lines, not color → expressible (font-semibold, border-t border-border subtotal, border-t-2 border-foreground total; red negatives text-danger)
  - every control shows its current value at rest → expressible (core PickMenu / Popover, core ButtonGroup, Books ReportFilterChip from Pressable + bg-secondary / border-border / text-secondary-foreground)

## Deferrals
(none yet)

## Rebuttals
- cp 1 · reviewers A7 and B1: "docs/plans/report-shell-ledger.md: the Files block does not name this file … every file outside the Files block is a finding" — rejected: review-diff.mjs adds the ledger to the planned list itself (`planned.push(`docs/plans/${feature}-ledger.md`, …)`); the ledger is the loop's own record, written at every checkpoint.

## Design notes
- cp 5 · hub loading and error states not captured at cp 5 → captured at cp 6 (hub-loading, hub-error).
- cp 6 · tb: business-name line not seen (seed writes no business_name; blank is omitted per spec).
- cp 10 · negative style and red never visible on the Trial Balance (no negative amounts).
- cp 9 · dark-mode filter-chip remove ✕ low contrast (matches the reference).
- cp 8 · phone money columns are 108pt (84pt of text): a seven-digit total would be cut; human to decide at the eval gate.
- cp 7 · method toggle not seen (Trial Balance has no basis); judge at the first hasBasis report.
- cp 6 · hub-loading, hub-error: sidebar "+ New" hidden while access loads (shell behavior).

## Out-of-plan changes
- cp 9 · stores/report-ui-store.ts closeSurfaceOf (plan updated); tests/setup-cleanup.ts + tests/route-params.ts (expo-router params mock for deep-link hook tests); tests/report-format.test.ts sweep cost cut (cp 3 file) after a timeout under load.
- cp 6 · tests/use-reports-hub.test.tsx: no-report input changed to HUB_ENTRIES_NONE because cp 6 makes trial-balance available (test-writer confirmed; assertion unchanged).
- after cp 0 merge · tests/accounts-form-harness.ts (failsOnceOnDemandCollection replaces failsOnceCollection: an on-demand source whose first loadSubset is refused with a 403, as pbtsdb fails), tests/silence-log.ts (refusedLoad; expectLiveQueryError matches on-demand failure lines by source id), tests/setup-parts.test.tsx (retry test also mounts useSetupCompleted and asserts it stays defined; proven by a temporary revert of the core fix). The books suite now prints no stderr.
- cp 1 · warning cleanup (user rule: fix every warning): hooks/useCloseOverrides.ts (onError on grant/revoke mutations — refusals are outcomes, not Sentry errors), explicit queryKey on 8 books live queries (hooks/useAccountsQuery.ts, useAccountUsage.ts, useBooksAccess.ts, useSetupCompleted.ts, useBooksSetup.ts, components/entries/EntryRow.tsx — TanStack hot-render-path warning), tests/accounts-form-harness.ts (index options on 4 builders; duplicate field), tests/silence-log.ts (expectLiveQueryError replaces silenceConsole), 11 test files using it, tests/setup-parts.test.tsx.
- cp 1 · lib/opening-balances.ts, lib/entry-schema.ts, lib/settings-schema.ts: their private real-day validators now use isIsoDay (gate-3 A5, one helper instead of four). Plus lib/opening-balances-schema.ts (the real isRealDay call site). isIsoDay now refuses every year before 1900 (deliberate bound, fix-review R3): stricter than before for opening balances, which accepted any year, and for entry/settings, which refused only 0000–0099.

## Phase notes
- phase 1: unattended; design packet /Users/nas/tmp/tinycld/auto-helix-books/staging/p5-report-shell/packet.md (intake.md beside it). No human corrections.
- phase 3: design gate approved 2026-10-26. Direction C picked (one chip row under the title: period chip, method toggle, filter chips, Add filter; each chip opens a Popover, a Sheet on phone; phone row scrolls sideways, never wraps; full-width table, compact document header strip; Customize holds Number format, Rows, Columns). Human accepted the recommended answer to all 13 open questions: Q1 minimum Trial Balance built in this unit as the first report (p5-trial-balance adds to it); Q2 options in route search params via router.setParams, defaults omitted, presets by name; Q3 Accrual default, no new books_settings field; Q4 method toggle only when hasBasis (TB false); Q5 fiscal-year presets as spec lists, no week presets; Q6 day-level ranges via monthSlices/asOfSlices; Q7 this unit owns the hub, sidebar entry, registry (all v0 reports listed available: false); Q8 one renderer with folding and Collapse/Expand all, visit-only Zustand state; Q9 filters as chips only; Q10 number format ÷1000, without cents, -100/(100), red negatives, round once at display half away from zero; Q11 phone fixed label column with sideways amount columns; Q12 seven hub sections, no search; Q13 currency symbol on subtotal and total rows only. No sparks dropped. No platform-only items. Core moved a5e0c8f → 67b51fc3 before the build (TextInput 2-line change only; packet kept). Pass 2 (unattended, 2026-10-26): reference captured in docs/plans/report-shell-reference/ from docs/plans/report-shell-capture.json (15 shots x 390/1280 x light/dark = 60 PNGs): hub (registry as later units fill it; Taxes not drawn), hub-v0 (only Trial Balance, as this unit ships), hub-empty, tb (Trial Balance populated, as of Sep 30 2026), pl-folded (Profit and Loss by quarter, nested Professional fees section, Cost of goods sold folded showing its subtotal), loading, error, empty ("Show this fiscal year"), empty-filtered ("Account: 3 accounts" chip, "Clear filters"), period (as-of popover / phone sheet), invalid-date (From after To inline error, preset switched to Custom, report keeps Jan 1 – Oct 25), add-filter (menu), filter-picker (account groups + accounts, Apply pinned under a scrolling list), customize (inline Drawer on desktop, bottom Sheet on phone; Without cents + (100) + red applied live behind it), unknown. Fixture lib/report-shell-fixture.ts: accounts and settings satisfy BooksAccounts / BooksSettings; the report contract and registry are local Fixture* interfaces that the checkpoint creating lib/report-definition.ts and lib/report-registry.ts must replace with imports. No spark dropped: all three built from core components and semantic tokens (document header strip on bg-card; subtotal border-t border-border, total border-t-2 border-foreground, red text-danger; chips from Pressable + bg-secondary/border-border). Reference decisions for phase 4: (1) phone label column at 55% left about 88pt per Debit/Credit column at 390 and truncated amounts, so with one or two amount columns the reference gives the amounts a fixed 108pt and the label the rest; three or more keep 168pt label + 128pt scrolling columns (spec Report table phone bullet needs this wording); (2) period popover shows presets as wrapping pills (as the direction-C artboard) above stacked date fields; (3) the account picker is a Popover with checkbox rows, not a Menu, so Apply stays in view; (4) empty states use a Books Button, not core EmptyState (its action text is text-accent, near invisible in light mode; core change request, not made); (5) empty state for an as-of report: "No activity for As of <date>" reads badly, so the reference shows the empty states on the range report; the plan must word the as-of case. Scratch capture spec copy waits for the ready element's box and opacity to hold still after each viewport change (phone sheets were captured mid-slide otherwise); the helix template still lacks this.
- phase 3 (driver, after pass 2): spec edited from the reference — phone tables with one or two amount columns use fixed 108pt amount columns and a label column that takes the rest (55% cut amounts off at 390); three or more keep 168pt label + 128pt sideways-scrolling columns, column-label row scrolls in step with the body (refines Q11; shown to the human at the eval gate). Empty wording for as-of reports: "No balances as of <date in words>". Empty actions use core Button, not core EmptyState (its text-accent action is too faint in light mode; core change request, not made).
- phase 4: plan written (10 checkpoints: 4 logic, 6 rendering; 10 e2e tests); plan-check --unattended exit 0. Fresh plan review: 14 narrowed findings, 4 untested, Consumes name gaps, e2e reach and definitions-map points; all applied (staging plan-review.md). One partial: finding 3 "no row has both cells blank" under Active contradicts the spec (postings that cancel to zero show blank cells under Active), so the check runs under Non-zero and Active is proven by the inactive never-posted 6900 Old Petty Cash row. Deviation accepted: definitions live in lib/reports/definitions.ts beside the registry, guarded by report-registry.test.ts. e2e coverage gaps (no sectioned / range / basis / choice-filter report exists yet) listed in the plan section "Not reachable by this unit's e2e"; recorded as a deferral of e2e coverage at the eval gate.
- review mode switches: none

## Checkpoint 0 — Retry keeps other readers working (core)
- origin: found at cp 1 (warning cleanup); human chose option 1 (core fix). Root cause investigated in TanStack DB 0.12.1 / pbtsdb 2.0.5: cleaning a source fatally errors its other readers; on-demand load failures fail only the query.
- test writer: core/lib/recover-live-queries.test.ts (4 new, 2 updated); red for the right reason: yes (current code cleans a ready source; sources required); expected TanStack stderr matched exactly per test; untestable: none
- implementer: core/lib/recover-live-queries.ts — clean only sources with status 'error'; sources optional; DONE
- gate 1: core tinycld-pkg check pass (3028); check:core-isolation 0 references; books check pass
- gate 3 A: nothing found (three mutants each fail >= 3 tests). Note: pbtsdb retries 5xx/network/401/408/429 forever, so such a query never shows Retry (outside cp 0).
- gate 3 B: fixed 20 ms sleep in tests → accepted, replaced by vi.waitFor on the real condition (5 consecutive green runs); misleading reader param type → fixed. Doc drift: none in core.
- commit: tinycld 2407c62a · PR https://github.com/tinycld/tinycld/pull/379 — human approved; CI green; merged 2026-10-26 (merge commit 254e3222); exclusive released

## Checkpoint 1 — Report contract, periods and registry
- test writer: tests/report-period.test.ts, tests/report-registry.test.ts; red for the right reason: yes (missing modules lib/report-period, lib/report-registry); untestable: none
- implementer: created lib/report-definition.ts, lib/report-period.ts, lib/report-registry.ts; exported 5 helpers from lib/register-range.ts; fixture uses real types; DONE. Self-declared differences: fixture header comment; extra fixture typing; resolvePreset across kinds; null-from as-of fallback; short chip date without year; mockup type renames; perl one-liner instead of Edit (process breach, logged).
- test disputes: none
- gate 1: tests unedited: yes · tinycld-pkg check pass (2345 tests)
- gate 2: n/a (logic)
- gate 3 A (correctness): A1 short date by string replace on formatDay → accepted+fixed (local month list); A2 no from>to guard in monthSlices/monthsSpanned → accepted+fixed; A3 periodWords/periodChipLabel as-of fallback for a range → accepted+fixed (RangePeriod | AsOfPeriod union, branch on kind); A4 resolvePreset accepts mismatched preset/kind → accepted+fixed (split preset types, overloads, runtime throw); A5 three real-day validators → accepted+fixed (isIsoDay single helper); A6 ACCOUNT_GROUP_CHOICES untyped → accepted+fixed (FilterChoiceOption); A7 ledger out-of-plan → rebutted (see Rebuttals). Test gaps (hubSections out of order, adjacent-month slices) → fresh test writer added T1–T5.
- gate 3 B (conformance): B1 ledger out-of-plan → rebutted; B2 = A1.
- fix tests: T1, T2, T5 green at once (existing behavior); T3, T4 red for the right reason, green after the fix.
- fix review (round 1 diff): A1 setup-parts retry test narrowed → accepted, mount restored (R1); A2 offline grant/revoke failures reach Sentry → accepted+fixed (R2); A3 isIsoDay accepted years 0000–0099 → accepted+fixed (year >= 1900 bound, R3); A4 period types broke later interfaces → accepted+fixed (kind discriminant on the period, R4; plan interfaces cp 1/2/6/7 updated, plan-check 0); A5 expectLiveQueryError too broad → accepted+fixed (named source ids, R5); A6 ledger out-of-plan incomplete → fixed; A7 isIsoDay location → accepted+fixed (lib/register-range.ts, isRealDay removed, R7).
- fix review (round 2 diff): offline branch untested → test added (useCloseOverrides offline failure; proven by a temporary break); ledger wording and queryKey count → fixed; opening-balances-schema.ts missing from plan/ledger → fixed; plan said report-period imports isIsoDay and named tests/register-range.test.ts → plan text corrected; opening-balances schema pre-1900 untested → test added. Test-only round, no non-test source changed → no further fix review.
- resolved by checkpoint 0 (core PR #379): shared-source recovery bug (core recoverLiveQueries cleans sources other live queries read; setup-parts retry test prints "manually cleaned up"); waiting on a human decision before checkpoint 6.
- gate 1 (final): tinycld-pkg check pass (2378 tests); warnings: only the open bug's two lines.
- commit: 972fa94 (amended with this ledger line; the line first carried the pre-amend sha)

## Checkpoint 2 — Options codec and filter helpers
- test writer: tests/report-options.test.ts (38), tests/report-filters.test.ts (7); red for the right reason: yes (missing modules lib/report-options, lib/report-filters; proven sound against a throwaway implementation, 45/45); untestable: none
- implementer: created lib/report-options.ts, lib/report-filters.ts; fixture re-exports ACCOUNT_GROUP_CHOICES; DONE. Self-declared differences: local PRESET_MESSAGE; preset via z.custom; serializer compares the preset by name (no PeriodContext); lists normalized on parse; rows/basis read only when offered; reportDefaults copies the number format.
- test disputes: none
- gate 1: tests unedited: yes · tinycld-pkg check pass (2423)
- gate 2: n/a (logic)
- gate 3 A: date rules applied to listed presets (bad typed To blocks a preset pick; maxMonths vs a long preset) → accepted+fixed (G1: checks only for preset custom); invalid group: value survives parse → fixed (G2); form filters not normalized like URL → fixed (G3, shared normalizeFilters); basis serialized without hasBasis → fixed (G4). Declared differences all accepted by A.
- gate 3 B: B1 = G2; B2 = G1; B3 number-format flags assume false defaults → fixed (G5, parseNumberFormat/serializeNumberFormat); B4 choice fallback "1 account" → fixed (G6, "1 selection").
- fix review 1: basis/rows/columnsBy from the form not limited to the spec → fixed (H1, shared normalizeChoices); preset pick must write resolved dates and the report reads last valid values → already in checkpoint 7's plan (onPreset setValue from/to; write only when valid); invalid-period fallback to the default period → only for callers that skip the schema, same plan note.
- fix review 2: serializer wrote rows/colsBy/cols the spec does not offer → fixed (J1); schema accepted unlisted columnsBy and cash basis on a no-basis spec → fixed (J2, plain messages); column-toggle normalization untested → tests added (J3).
- fix review 3: clean. Note (not a finding): serializeReportParams writes options.filters as given; every options source already normalizes them.
- gate 1 (final): tinycld-pkg check pass (2444 tests); warnings: only the open shared-source bug's two lines.
- commit: 8068e10

## Checkpoint 3 — Amount format, folding and UI store
- test writer: tests/report-format.test.ts (17), tests/report-rows.test.ts (10), tests/report-ui-store.test.ts (7); red for the right reason: yes (missing modules); untestable: none. Plan defect found: Do 1's roundHalfAwayFromZero (×(1+EPSILON)) moves 9007199254740991 to …992, so the exact-at-the-limit bullet fails; implementer told to skip rounding for an already-integer scaled value.
- implementer: created lib/report-format.ts, lib/report-rows.ts, stores/report-ui-store.ts; DONE. Self-declared differences: integer guard before rounding (plan defect at 2^53-1); shared displayUnits/unitsText; Without cents may exceed 2^53 as an exact multiple of 100; wrong-type cell value shows String(value); cycle guard in visibleReportRows; startVisit sets [].
- test disputes: none
- gate 1: tests unedited: yes · tinycld-pkg check pass (2478)
- gate 2: n/a (logic)
- gate 3 A: Without cents / Divide by 1000 showed wrong figures near the stored limit (float division lands on the wrong side of a half; 4000 + 400 wrong values in the top 200k cents) → accepted+fixed (K1: integer-exact quotient/remainder rounding; BigInt-reference sweep test); non-finite percent shows NaN% → accepted+fixed (K2: empty cell). Plan defect: Do 1 named roundHalfAwayFromZero for all rounding; spec Display/Data lines updated to integer-exact rounding.
- gate 3 B: nothing found.
- fix review 1: THOUSANDS_WITHOUT_CENTS had no integer-exact test → sweep and point tests added (proven by a temporary float-rounding break); roundFraction comment false → rewritten. fix review 2 (comment only): wording narrowed → reviewer's wording applied.
- gate 1 (final): tinycld-pkg check pass (2485 tests); warnings: only the open shared-source bug's two lines.

## Checkpoint 4 — Trial Balance figures
- test writer: tests/trial-balance.test.ts (21), tests/use-trial-balance.test.tsx (6), harness (ledger.accounts, balancesFailsOnce via failsOnceOnDemandCollection, cleanups()); red for the right reason: yes (missing modules; proven sound against a throwaway implementation, 27/27, and a rebuild-everything mutant fails the retry test); untestable: none. Out of plan: harness AccessMutation.type typed OperationType (existing type error). Found: typechecking tests/ shows 65 existing errors in 14 test files (retro item 3, awaiting human).
- implementer: lib/reports/trial-balance-rows.ts, hooks/useTrialBalance.ts, lib/reports/trial-balance.ts, lib/reports/definitions.ts; DONE (four live queries; superseded by L1 below).
- test disputes: none
- gate 1: tinycld-pkg check pass (2512); stderr none
- gate 2: n/a (logic)
- gate 3 A: no defects; accounting verified (prior-year netting, edge lines, debit/credit sides, Active). Untested: accounts/lines failure retry, synthetic row last with no equity account, synthetic zero under All, blank-number label → tests added (L2–L5).
- gate 3 B: four live queries stitched with JS Maps breaks CLAUDE.md pbtsdb ("one query with .join() + .select()") → accepted+fixed (L1: one query, accounts leftJoin through/prior/edge total subqueries, TrialBalanceSourceRow derived from the query, BalanceTotals removed). Plan defect: Do step 5 specified the four queries; plan updated (cp 4 Interfaces, Do, Tests), plan-check 0.
- fix review: no code defects; declared differences accepted (caseWhen(isUndefined) keeps a missing join row null; NO_EDGE constant; sources returned from useTrialBalanceRows). Gaps: missing totals row null through the query; realtime left join no-match → match → tests added (proven by temporary breaks).
- gate 1 (final): tinycld-pkg check pass (2520 tests); stderr none.

## Checkpoint 5 — Reports hub and sidebar entry
- test writer: tests/shell-nav.test.ts (5), tests/books-sidebar.test.tsx (3 changed); red for the right reason: yes (no reports entry) except hasAvailableReport (from cp 1); untestable: the BarChart3 icon (core lucide stub gives every icon one function) → plan Tests bullet fixed: the icon is appearance, judged at gate 2 of checkpoint 6 where the entry first shows.
- implementer: lib/shell-nav.ts reports entry, hooks/useReportsHub.ts, components/reports/ReportsHubView.tsx, screens/reports/index.tsx; DONE.
- gate 1: tinycld-pkg check pass (2525); no e2e in this checkpoint.
- gate 2 round 1 (Fable): BLOCKING — max-w-3xl cap put the empty message off center at 1280; the approved reference uses the full pane (the mockup gained the cap after approval) → fixed (N4, cap removed). Round 2: all four shots byte-identical to the reference; NOTE: hub loading and error states not captured → added to checkpoint 6 (hub-loading, hub-error shots; e2e access-error step).
- gate 3 A: plan defect — hub showed "No reports yet" while access loads and forever if it fails → accepted+fixed (N1: state loading/error/ready, onRetry rebuilds the access query with books_access as a source, safe since tinycld #379; spec gains two hub bullets); doubled border under the last row → fixed (N2); access gate untested → tests/use-reports-hub.test.tsx (N3).
- gate 3 B: nothing found.
- fix review: no defects; books_access as a source accepted (decisions updated; memory p1-opening-balances now stale → retrospective). Retry onError logging untested → test added; it first used markError on an eager source, which exposed a core order question → core 0b item 2 tried and REVERTED (app sources are on-demand and never error); test rewritten with accessFailsTwice (the retried load is refused again; log.error once; state back to error). Rebutted: multi-row divider seen only in code (checkpoint Tests do not ask for it).
- core 0b: tinycld PR #380, useRecord explicit queryKey (the hot-render-path warning in register-realtime.test.ts came from core useRecord) — human approved, CI green, merged 2026-10-26 (eaf01844); exclusive released.
- gate 1 (final): tinycld-pkg check pass; stderr none.

## Checkpoint 6 — Report screen frame and states
- test writer: tests/report-state.test.ts (new), tests/report-registry.test.ts (changed), tests/e2e/report-shell-helpers.ts, tests/e2e/report-shell-frame.spec.ts (3 e2e), scratch capture spec gains route hold/fail; red for the right reason: yes (missing lib/report-state; no available report; no reports/[report] route); untestable: none.
- implementer: lib/report-state.ts, hooks/useReportScreen.ts, hooks/useBackToReports.ts, components/reports/{ReportScreenView,ReportHeader,ReportDocumentHeader,ReportPeriodControl,ReportEmptyState,ReportNotFound}.tsx, screens/reports/[report].tsx, lib/report-registry.ts (trial-balance available), evidence/cp6/capture.json; DONE. Self-declared: detailRowCount (plan defect: the Trial Balance always has a Total row, so rows.length is never 0; plan Do 4 text corrected); shared ReportBackLink/REPORT_TAP_TARGET; prerequisites frame carries report-screen; EmptyBody isVisible wrapper; whitespace business name is blank.
- test disputes: the implementer wrote tests/report-detail-rows.test.ts and edited tests/use-reports-hub.test.tsx (implementers may not) → a fresh test writer took both over: detail-row cases moved into report-state.test.ts against the real buildTrialBalance (proven by a temporary break); the hub test input change to HUB_ENTRIES_NONE kept (registry flip made REPORT_ENTRIES no longer a no-report input).
- gate 1: staged test-writer files unedited; tinycld-pkg check pass (2559); e2e -g "report-shell:" 3 passed.
- gate 2 (Fable): 32 shots valid; no BLOCKING; NOTEs: business-name line not seen (seed has no business name; spec omits a blank name); sidebar "+ New" hidden while access loads (hub-loading, hub-error; shell behavior).
- gate 3 A: no defects; declared differences accepted. Untested prerequisites stage → tests/use-report-prerequisites.test.tsx (7 tests; three temporary breaks each caught).
- gate 3 B: no rule breaks; ledger records (out-of-plan test file, detailRowCount) → recorded here; staging decisions copy refreshed.
- gate 1 (final): tinycld-pkg check pass (2566); stderr none.

## Checkpoint 7 — Period control and live apply
- test writer: tests/e2e/report-shell-period.spec.ts (2 e2e; report-shell total 5), helpers choosePreset/setAsOfDate; red for the right reason: yes (no report-period-popover); untestable: none (method toggle and range presets stay in the Not-reachable register for p5-profit-and-loss).
- implementer: hooks/useReportOptionsForm.ts, components/reports/{ReportPeriodControl,ReportMethodToggle}.tsx, hooks/useReportScreen.ts, ReportScreenView.tsx, evidence/cp7/capture.json; self-declared: Custom writes at once when valid; ButtonGroup wrapper margin dropped; pill text weight; chip trigger helper; aria-checked + accessibilityState; optionsAfterEmptyAction removed; scripted edit (process breach, logged).
- test disputes: e2e release order — `unroute` then `continue()` throws in Playwright 1.60 (unroute continues routes in flight) → settled for the implementer; later reviewer B showed continue-then-unroute races, so the release is `unroute` alone (P4).
- gate 1: tinycld-pkg check pass; e2e report-shell 5 passed.
- gate 2 (Fable): 8 shots valid, no BLOCKING; NOTE: method toggle never visible on the Trial Balance (hasBasis false) → judged at the first hasBasis report.
- gate 3 A+B: plan gap — an invalid date left in the form after the popover closes blocks every later option change silently → accepted+fixed (P1 discard on close; new spec bullet); named-preset dates resolved only at pick time go stale on day rollover / fiscal-start change → fixed (P2: shown dates and Custom start from options.period); validate-before-custom ordering → fixed (P3); e2e assertions read the form after pick / copied link / hub reopen / discard → added (P5).
- fix review 1: discard of a valid pending edit before re-render → fixed (Q1 errors guard) + tests (Q2). Fix review 2: the errors guard read a render-time snapshot (stale both ways) → fixed (R1: schema.safeParse(form.getValues()); R2 comment) + same-tick tests (R3). Fix review 3: clean.
- hand-off to cp 9: when openSurface replaces the period surface with add-filter / filter-picker, call discardEdit on that switch.
- gate 1 (final): tinycld-pkg check pass (2572); e2e 5 passed; stderr none.

## Checkpoint 8 — Report table renderer
- test writer: tests/report-table-layout.test.ts, tests/e2e/report-shell-table.spec.ts (1 e2e; total 6); red for the right reason: yes (missing report-table-layout module; no report-table); untestable: none beyond the Not-reachable register. Risk noted: the sum and last-row checks read only windowed rows.
- implementer: components/reports/{report-table-layout.ts,ReportRow.tsx,ReportTable.tsx}, hooks/useReportScreen.ts, ReportScreenView.tsx, evidence/cp8 (tb shots); DONE; e2e Trial Balance has 8 detail rows. Self-declared: heading web:overflow-y-hidden for scrollbar-gutter alignment; heading scroller style matches body; pl-1 label heading; label column stripped before ReportRowAmounts; NO_ROWS fallback; TableBody null unless ready; no rule on section Pressable; scripted edit (logged).
- gate 1: tinycld-pkg check pass (2577); e2e report-shell 6 passed.
- gate 2 (Fable): 4 shots valid, no BLOCKING; NOTE: phone amount column 108pt leaves 84pt of text, so a seven-digit total ("$132,901.00") would be cut by numberOfLines={1} — raised to the human at the eval gate (the 108pt rule came from the driver's spec edit after pass 2).
- gate 3 A: heading alignment ignored column kind → fixed (S1 columnAlign shared by heading and cells); money-consistency checks read one snapshot of live shared data → polled (S2); only the label side of a section row was pressable → fixed (S3). Declared differences accepted. Window-size risk judged not flaky (Trial Balance shows only accounts with activity).
- gate 3 B: e2e sum/total depended on the row window → fixed (S2: tall viewport, assert the total row is mounted first, then poll).
- fix review 1: the S3 amounts-side press was a second accessible button with the same name, hiding folded subtotal figures from screen readers and doubling tab stops (the driver's brief asked for it) → fixed (amounts side: onPress only, accessible={false}, tabIndex={-1}); plan interfaces updated (onToggleSection, columnAlign, Not-reachable line). Rebutted: CellDisplay.align is now unread by the renderer — kept as checkpoint 3's tested contract (the cell rule is identical for every amount column). fix review 2: clean.
- gate 1 (final): tinycld-pkg check pass (2580); e2e 6 passed; stderr none.

## Checkpoint 9 — Filter chips and account picker
- test writer: tests/report-filters.test.ts (filterPickerSchema), tests/use-account-options.test.tsx (new), tests/e2e/report-shell-filters.spec.ts (2 e2e; total 8), helper openAccountPicker; red for the right reason: yes (missing export, missing isError/retry, no report-add-filter); untestable: none. Deviation accepted: after a fails-once retry cleanups() is [] (core #379 cleans only an errored source); the errored-source case asserts ['books_accounts'].
- implementer: hooks/useAccountOptions.ts (isError, retry, recovery, isReady, AccountChoice), hooks/useReportScreen.ts, lib/report-filters.ts (filterPickerSchema, pickerRows, shownAccountValues), components/reports/{ReportFilterChip,ReportFilterChips,ReportAccountFilterPicker}.tsx, ReportScreenView.tsx, stores/report-ui-store.ts (closeSurfaceOf — out of plan, core Menu.Item closes after onSelect; plan updated), evidence/cp9; T6 also touched lib/report-definition.ts (LiveRecovery, ReportResult.recovery), lib/report-state.ts (mergeRecoveries), hooks/useTrialBalance.ts, hooks/useBooksSettings.ts. Self-declared: chip inner targets marginVertical -1 (44pt chip); picker onOpenChange close-only; chip ref; scripted edits (logged).
- gate 1: tinycld-pkg check pass (2585); e2e report-shell 8 passed.
- gate 2 (Fable): 12 shots valid, no BLOCKING; NOTE: dark-mode remove ✕ (muted-foreground on bg-secondary) low contrast, as the reference.
- gate 3 A: picker draft lost across the 768 breakpoint → fixed (T1: draft owned above the Popover, reset on open); removing a filter left its picker open → fixed (T2); a selected value with no row could not be unchecked → fixed (T3 pickerRows); the period→filter switch discard was unreachable → removed, plan note (T4); screen-level accounts error untested → test (T5); two parallel recoveries on a shared source → one merged call (T6).
- gate 3 B: closeSurfaceOf out of plan → plan updated (B1); inner list ScrollView not scrollable on Android → nestedScrollEnabled (B2); hand-declared choice types → derived AccountChoice (B3).
- fix review 1: reset() left isValid stale (Apply enabled on an empty draft / disabled on applied values) → trigger() after reset (U1); draft cut account ids before names loaded → cut only when accounts known (U2); draft-side T3 tests (U3). Fix review 2: a nameless id kept during load could be applied after names loaded → Apply intersects with shown rows (V1). Fix review 3: rows built from the applied filter could drop a value made inactive mid-draft → rows from the values being kept (W1). Fix review 4: picker rows and Apply used different row sources → one source, model.accountPickerRows = rows for applied ∪ watched draft (X1). Fix review 5: rebutted "keep the row of an unchecked never-applied inactive account" (driver narrowed the intent: no checked value without a row); stale test helper → reads model.accountPickerRows (Y1); comment precision (Y2); rebutted a separate useWatch-freshness test (covered by e2e T1).
- test infrastructure: tests/setup-cleanup.ts mocks expo-router with settable route params (tests/route-params.ts) for deep-link hook tests; report-format sweep made boundary-only (43k calls, ~33 ms, still fails 800/800/8 under float rounding) after a 5 s timeout under machine load.
- gate 1 (final): tinycld-pkg check pass (2603); e2e 8 passed; stderr none.

## Checkpoint 10 — Customize panel and help topic
- test writer: tests/help-reports.test.ts (17), tests/e2e/report-shell-customize.spec.ts (2 e2e; total 10); red for the right reason: yes (no help/reports.md, no report-customize-open); untestable: none (Columns section and drawn negative style stay in the Not-reachable register). Changed from the plan: tall viewports so the row window holds every row; the write recorder matches only record writes (not auth-refresh).
- implementer: components/reports/ReportCustomizePanel.tsx, help/reports.md, help/navigating-books.md (link), hooks/useReportScreen.ts (customize state, sections, onReset), ReportScreenView.tsx, evidence/cp10; DONE. Self-declared: accessibilityState.expanded beside aria-expanded; pb-2 section wrapper; DrawerContent accessibilityLabel; fixed 44×44 close; columnsBy select only when columnsBy exists; inline onReset; scripted edits (logged).
- gate 1: tinycld-pkg check pass (2620); e2e report-shell 10 passed.
- gate 2 (Fable): 4 shots valid, no BLOCKING; NOTE: negative style and red not visible (the Trial Balance has no negative amounts) — covered by URL assertions and the Not-reachable register.
- gate 3 A: no code defects; help text said balances show "on the normal side" (wrong for contra/overdrawn balances) → fixed (A1); "copy the link from the address bar" is web-only → "In a web browser, …" (A2); Reset form state untested → assertions added (A3).
- gate 3 B: one-shot layout reads in the wide-scroll block → polled (B1). Recorded test changes: record-only write recorder; tall viewports for the row window.
- gate 1 (final): tinycld-pkg check pass (2620); e2e 10 passed; stderr none.

## Final review
- eval:
- native: not executed in this run
