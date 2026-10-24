# account-register — helix run ledger

- mode: unattended
- unit: p1-account-register
- started: 2026-10-23
- package branch: books/p1-account-register   core checkout: main
- spec: docs/specs/account-register-design.md
- checkpoints: docs/plans/account-register-checkpoints.md
- reference: docs/plans/account-register-reference/
- evidence: docs/plans/account-register-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/account-register-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - balance after each row readable, ending balance largest → expressible (text-2xl font-semibold, formatMoney)
  - fixed right-hand Debit and Credit columns → expressible (BALANCE_CELL_STYLE pattern)
  - column titles always visible → expressible (header outside scroll area)

## Deferrals
(none yet)

## Rebuttals
- cp2 reviewer B finding 4 (account via hand-rolled useLiveQuery instead of useRecord): rejected. Decisions block: "`isError` is true when any of the live queries the screen runs (account, lines, opening totals, sub-account, any-activity, settings) reports `isError`." `useRecord` exposes no `isError`, so the account query must be a direct useLiveQuery.

## Design notes
- cp2 spike: outcome (a), see Checkpoint 2.

## Out-of-plan changes
- cp2: tests/accounts-form-harness.ts (seedBooks `ledger` option; entries/settings stores; lineStore/balanceStore/settingsStore/entryStore accessors), tests/register-test-data.ts, tests/collections-real.test.ts — test support the plan's tests needed; no existing test weakened.

## Phase notes
- phase 1-3 (design gate 2026-10-23): direction A picked (flat table, entry drawer); Q1-Q12 accepted as recommended; one change: date range defaults to This month. No platform-only items. No core extension.
- phase 4: plan review (fresh subagent) found narrowed/untested bullets, date-dependent e2e, name clashes, placeholders; all fixed in the plan (6 checkpoints). Spec reconciliation: Type cell shows "Reversal of <number>" (reversal) and "Void reversal of <number>" (void reversal). "This quarter" is the fiscal quarter (spec silent). Retry reloads every collection the screen reads (4, incl. an any-activity balance read). Seeded e2e rows are dated relative to today. Known gaps: no read-only-user e2e (seed has no read-only Books member; covered by newEntryVisible + account-menu-panel test).
- review mode switches: none

## Checkpoint 1
- test writer: tests/register.test.ts, tests/register-range.test.ts; red for the right reason: yes (modules missing); untestable: none
- implementer: lib/register.ts, lib/register-range.ts; DONE. Self-declared: unknown origin falls back to "Journal entry"; unknown status returns raw string; lines after range.end skipped before the balance walk (same result); overflow before first row nulls opening/ending
- test disputes: none
- gate 1: tests unedited: yes · pass
- gate 3 A: numeric position compare (spec says string compare; numeric is correct, pinned by new test); prior-totals overflow not checked -> accepted+fixed; test-strength gaps (folded overflow, draft before range start, entryDetail fields/sort, position 2 vs 10, fiscalStartMonth 1.5, quarter boundary) -> accepted, tests added
- gate 3 B: unknown origin + number gives "Journal entry of X" -> accepted+fixed
- fix review: reviewer A pass over the fix diff: clean
- reviewer-caught deferrals: none

## Checkpoint 2
- test writer: tests/register-query.test.ts, register-realtime.test.ts, useFiscalYearStartMonth.test.ts, collections.test.ts (edited), collections-real.test.ts, register-test-data.ts, accounts-form-harness.ts (edited); red for the right reason: yes; untestable: none
- implementer: collections.ts, lib/register-query.ts, hooks/useRegisterQuery.ts, hooks/useFiscalYearStartMonth.ts; DONE. Spike outcome: (a) — `entry` relation added to the lines collection (Object.assign, because both typed forms fail tsc); proven against real pbtsdb in collections-real.test.ts. Self-declared: orderBy(id) before limit(1); account via direct useLiveQuery (useRecord has no isError); isError = any of 7 queries; isReady needs range; disabled queries return undefined from the query fn
- test disputes: register-query.test.ts reversalOriginsQuery toEqual vs `$` props -> test wrong (checkpoint selects {id, number}); test writer fixed run()
- gate 1: tests unedited: yes (except resolved dispute) · pass
- gate 3 A: Object.assign relation unproven against real pbtsdb -> accepted, real-pbtsdb test added; reversesNumber assertion racy -> waitFor; balance-row test weak -> strengthened; lines not referentially stable -> memoised; originsQuery.isError missing -> added (no test can fail the origins query alone with local collections; noted)
- gate 3 B: hand-declared LineRow, casts -> removed; test file renamed .tsx->.ts; harness widened (out-of-plan, below); account hand-rolled useLiveQuery vs useRecord -> rebutted; second query stitched by Map for reversesNumber -> accepted debt (plan mandates)
- fix review: reviewer A passes over both fix diffs: clean
- reviewer-caught deferrals: none. Retry has no test (no bullet; covered by e2e error test in cp3)

Spike outcome also noted under Design notes.

## Final review
- eval: (pending)
- native: not executed in this run
