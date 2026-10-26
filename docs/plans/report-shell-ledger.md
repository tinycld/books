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
- core extension: tinycld PR #379 (branch books/p5-report-shell) — checkpoint 0, recoverLiveQueries fix (human decision 2026-10-26, option 1)
- sparks:
  - report reads like a finished document → expressible (ReportDocumentHeader strip: text-muted-foreground, text-lg font-semibold text-foreground, border-border; books_settings.business_name)
  - totals set apart by weight and rule lines, not color → expressible (font-semibold, border-t border-border subtotal, border-t-2 border-foreground total; red negatives text-danger)
  - every control shows its current value at rest → expressible (core PickMenu / Popover, core ButtonGroup, Books ReportFilterChip from Pressable + bg-secondary / border-border / text-secondary-foreground)

## Deferrals
(none yet)

## Rebuttals
- cp 1 · reviewers A7 and B1: "docs/plans/report-shell-ledger.md: the Files block does not name this file … every file outside the Files block is a finding" — rejected: review-diff.mjs adds the ledger to the planned list itself (`planned.push(`docs/plans/${feature}-ledger.md`, …)`); the ledger is the loop's own record, written at every checkpoint.

## Design notes
(none yet)

## Out-of-plan changes
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

## Final review
- eval:
- native: not executed in this run
