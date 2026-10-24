# opening-balances — helix run ledger

- mode: unattended
- unit: p1-opening-balances
- started: 2026-10-24
- package branch: books/p1-opening-balances   core checkout: main
- spec: docs/specs/opening-balances-design.md
- checkpoints: docs/plans/opening-balances-checkpoints.md
- reference: docs/plans/opening-balances-reference/
- evidence: docs/plans/opening-balances-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/opening-balances-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - live Balance Sheet preview in the report's own shape → expressible (bg-surface-secondary, border-border, formatMoney, text-success, text-destructive)
  - "Preview" label chip → expressible (bg-accent text-accent-foreground)
  - date stated in words under the field → expressible (text-muted-foreground, formatDay)

## Deferrals
(none yet)

## Rebuttals
(none yet)

## Design notes
cp 0 · server/reversal.go: the same-origin rule also refuses editing a posted reversal or auto_reversal entry (a correction can only be manual or opening). The spec requires 'a correction must have the same origin as the entry it replaces'; the Journal Entries unit (p1-journal-entries) must not offer Edit on those.

cp 2 · core EmptyState link and outline Retry button are low contrast (light and dark; core components, same in the reference)
cp 2 · error banner is a square full-bleed band, the reference is a rounded card; its top border doubles the header divider
cp 2 · memo field is a custom input (core TextInput cannot show a derived default); a core `displayValue` prop needs core sign-off
cp 2 · help icon (16px + hitSlop) and the toolbar link (32px) are under 44pt on phone
cp 2 · the help icon points at books:opening-balances, which checkpoint 7 adds
cp 2 · loading and read-only states have no screenshots
cp 3+ · carry-over: `OpeningBalancesHeader` lost its `backTo` prop (checkpoint 6 adds only `subtitleLine`); a late query error unmounts the form, checkpoint 5 must keep a mounted form alive over it

cp 3 · the amount input shows `14,500.00` with no `$`, the reference mockup shows `$48,250.00`; kept: the plan's tests and interfaces (`centsToText`) specify the no-symbol form
cp 3 · every amount input has a muted `±` glyph (the sign toggle); not in the reference
cp 3 · the sticky band bar duplicates the first band header at scroll 0
cp 3 · on wide the in-flow amount error sits in the Account cell, far from its input
cp 3 · the in-flow error replaces the Inactive label on wide while it shows
cp 3 · the windowing logic is covered by unit tests only, the seed chart fits one screen and no e2e scrolls
cp 3 · KNOWN BUG, NOT OURS: when a `books_accounts` read answers 400, the app re-requests it in a tight loop (160-350 requests in about 1.4s) instead of staying in the error state. It happens on the existing Chart of Accounts screen too, so the cause is in the shared load path (pbtsdb or @tanstack/db: a failed initial subset load is re-issued). Needs a separate look in pbtsdb/core; not changed here.

## Out-of-plan changes
cp 3 · tests/e2e/account-register-entry.spec.ts (earlier unit): box read replaced by offsetHeight; hooks/useRowWindow.ts additive options; opening-grid-style.ts new.
cp 2 · tinycld/books/hooks/useBooksAccess.ts: additive `isError` and `collection` fields so a failing access read shows the error state instead of loading forever.

## Phase notes
- phase 1-3 (design gate): direction A picked (grid + preview rail); Q1-Q7 accepted as recommended.
- phase 4: plan review (fresh subagent) found a false CP0 claim (create hook not in `serialized`), a parseMoney contradiction in a test, e2e ordering, and missing Do steps and tests; all fixed, plan is 8 checkpoints (0-7). Review mode C. Deviations from the spec/helix rules, shown at the eval gate: seed.ts is NOT wired to the fixture (a seeded opening entry would hide the first-save and Opening Balance Equity paths; the seed question stays at phase end); core has no disclosure primitive, so books adds `OpeningPreviewDisclosure` (spec said core disclosure row); the read-only e2e fulfills the real books_access response as read_only (client layout only); OBE duplicate-name recovery has no e2e (needs two sessions).
- review mode switches: none

## Checkpoint 0
- test writer: server/opening_balances_test.go, server/ledger_rules_test.go; red for the right reason: yes (origin value missing; 5c, 10 and the rules case with their own messages); untestable: none
- implementer: migration origin value + create rule, server/opening_balances.go, entries.go hook wrapped in serialized, posting.go, reversal.go origin rule, fixture typed from generated types; DONE
- test disputes: test (7) saved a line over maxAmount and expected a post-time refusal; the line field max (1e15) refuses at save. Checkpoint text: "a line above `maxAmount` is refused" (no place named). Ruling: test wrong about where; a fresh test writer changed it to assert the save is refused and nothing posts.
- self-declared differences: none material (checkNewEntry runs inside serialized; postEntry is the post path)
- gate 1: tests unedited: yes · pass (go test, tinycld-pkg check). Red on the way: stale generated pbSchema (fixed by packages:generate)
- gate 2: n/a
- gate 3 A (correctness): 6 findings. 1 accepted+fixed (refusal label for an unnumbered draft: "a saved draft"); 2 accepted+fixed (full-string assertions in tests 2, 3, 9); 3 accepted as defensive (comment; branch unreachable by a real client); 4 kept, intended by spec (see Design notes); 5 accepted+fixed (test 7 no longer matches PocketBase wording); 6 accepted+fixed (rules case checks the stored row and a client-set number is refused)
- gate 3 B (conformance): 1 style finding (long migration comment line), fixed
- fix review: clean
- reviewer-caught deferrals: none
- commit: see git log

## Checkpoint 1
- test writer: tests/opening-balances.test.ts, tests/opening-balances-schema.test.ts, tests/opening-balances-messages.test.ts; red for the right reason: yes (missing modules of this checkpoint); untestable: none
- implementer: lib/opening-balances.ts, lib/opening-balances-schema.ts, lib/opening-balances-messages.ts; DONE
- test disputes: none
- self-declared differences: tooManyAmountsMessage wording; previewFor fallback id for the balancing row; lines in band tree order; equity+balancing overflow flag; amountsFromLines skips net-zero lines; diffLines keeps the first of duplicate lines; screen state ignores other statuses; equity preview total uses equityWithBalancing
- gate 1: tests unedited: yes · pass after fixes
- gate 2: n/a
- gate 3 A (correctness): accepted+fixed: amountError "too large" only for well-formed text (isWellFormedMoney in money.ts); balancing amount above 10^15 is too-large; cap is above 999 amounts, balancing line not counted; amountsFromLines takes the first line per account like diffLines; test gaps (isRealDay century, state order, void entry); rebutted: multiple drafts/posted (server guard allows one live opening entry plus one draft replacement), void original shows `new` (the screen queries non-void rows only), memo length by UTF-16 units (never looser than the server's rune count)
- gate 3 B (conformance): accepted+fixed: types derived from the schema (z.infer, const array), presetDate parameter derived, test magic index removed, nested ternary removed
- fix review: two doc lines in the plan named maxOpeningLines; fixed
- reviewer-caught deferrals: none
- commit: see git log

## Checkpoint 2
- test writer: tests/e2e/opening-balances.spec.ts, tests/e2e/opening-balances-helpers.ts; red for the right reason: yes (all 14 failed at the missing Chart of Accounts link; tests 1-6 assertions not reached until the link existed, noted); untestable: none
- implementer: screen route, useOpeningBalancesScreen/Form hooks, five opening-balances components, AccountToolbar link, capture manifest and evidence; BLOCKED on two test disputes (below), otherwise DONE
- test disputes: (1) empty-chart test clicked through to the chart while the empty-list route was still active, so the chart rendered its own empty state without the search box; the checkpoint says only that the link opens the Chart of Accounts; test wrong, fixed by a fresh test writer (asserts `accounts-empty` and `opening-empty` hidden). (2) read-only test raced its own route handler at test end (`route.fetch: Target page closed`, ~20%); fixed at the test with `page.unrouteAll({ behavior: 'ignoreErrors' })` on tests 3-6 (Playwright's documented teardown), no timeout change
- self-declared differences: hook takes `isEditing`; `not(eq(status,'void'))` because @tanstack/db has no `ne`; isReady also waits for access.isReady; memo is a custom useController input (core TextInput cannot show a derived default; a core `displayValue` prop would need core sign-off); helper rendered with its own testID; useWatch for helper/memo; form hook also returns onPresetChange/onDateChange
- gate 1: tests unedited: yes · pass (check 1112 tests; full e2e 77 passed, 1 skipped)
- gate 2: invalid shots: none (loading and read-only have no shots; the reference set has none either) · blocking: none · notes: 6, listed under Design notes
- gate 3 A (correctness): accepted+fixed: books_access error now surfaced (useBooksAccess returns isError, collection) and added to retry queries; ready query with no settings row is the `error` state (migration 2100000001 inserts the row, delete rule null); memo error line role=alert/testID; onPresetChange has no fallback; shouldDirty on date change; added a read-only link-visible assertion; users source in retry was accepted then removed by the fix review (shared collections must stay out of recoverLiveQueries sources). rebutted: whitespace-only memo snaps back to the default (spec: empty memo means untouched; cp1 `effectiveMemo` and the e2e pin it); close-date change live re-validation (no screen changes it); read-only checks of `opening-save`/`opening-post` are vacuous until checkpoint 5 (commented in the test, re-asserted there)
- gate 3 B (conformance): accepted+fixed: stale/removed `backTo` and redundant useBackToChart parameter reverted; `text-muted` token check (same value, switched to text-muted-foreground). rebutted/noted: hand-written annotations are cp1 types derived from generated types; help icon and toolbar link touch targets under 44 (core HelpIcon has no hitSlop; link copies ImportLink); help icon points at a topic checkpoint 7 adds
- fix review: reviewer A over the fix diff found the shared-sources problem (fixed); the last edit (two sources removed) is the reviewer's own recommendation, verified by check and the full e2e
- out-of-plan changes: hooks/useBooksAccess.ts (additive isError, collection); useBackToChart.ts was changed and reverted
- reviewer-caught deferrals: none
- commit: see git log

## Checkpoint 3
- test writer: appended the `opening-balances: account grid and amounts` describe to tests/e2e/opening-balances.spec.ts and helpers; red for the right reason: yes (15 of 16 runs red at the missing grid; bullet 6 passes vacuously until checkpoint 5, as planned); untestable: none
- implementer: MoneyInput, OpeningAccountTable/Row/Card/SectionBand, opening-grid-style.ts, lib/opening-window.ts, useRowWindow `heights`/`onLeadingLayout`, form hook (cents, build, items, focusNext); BLOCKED once on a test dispute (below), then DONE through three fix rounds
- test disputes: two desktop tests used `getByText('Detail type')` page-wide; the Chart of Accounts stays mounted behind Opening balances and also shows it. Checkpoint says nothing about unmounting the chart; test wrong; fixed by a fresh test writer (locators scoped to `opening-balances-screen`, other locators audited)
- self-declared differences: sticky band bar uses firstVisible (first item below the bar) and shows title+subtotal only; overscan 6; `useController` defaultValue ''; sign toggle no-op on blank/unparsable; item heights band 48 / row 56 (wide) and band 48 / card 124 (phone) instead of one uniform height (the uniform height made phone band headers a 125px slab); amount error renders in flow (name cell on wide, helper slot on phone) instead of floating; the error replaces the helper/Inactive label on wide while it shows
- gate 1: tests unedited: yes · pass (check 1129 tests; full e2e 96 passed, 1 skipped)
- gate 2: invalid shots: none · blocking: found and fixed (phone band slab; floating error covering the Liabilities subtotal; typed rows below the fold in the 390 capture) · notes: listed under Design notes
- gate 3 A (correctness): accepted+fixed: offset ignored the block above the rows (now measured by the leading block's height; first fix measured y, which web onLayout does not update on position-only changes: found by the fix review); error hidden behind the next row (error moved in flow); sticky band hidden at scroll 0 (always visible); memoized cents/build/items and stable ref callbacks; submit-time zod errors shown; sign toggle guard; weak tests (vacuous sticky and error assertions, `ids[...]` undefined checks, window math pinned by unit tests). noted, not changed: windowing is exercised only by unit tests (the seed chart fits one screen); Inactive label hidden on wide while an error shows; error must stay within two lines in the 140pt Account cell (both current messages do)
- gate 3 B (conformance): accepted+fixed: a11y labels per account, duplicate INDENT and breakpoint calls, sticky mechanism comment. noted: custom MoneyInput over core TextInput (blur formatting, sign toggle, ref registry)
- fix review: three passes; each found and fixed a real problem (stale offset, error placement); last pass clean
- out-of-plan changes: opening-grid-style.ts (avoids a Table/Row import cycle; re-exported from the table); hooks/useRowWindow.ts (additive `heights`, `onLeadingLayout`, `firstVisible`); tests/e2e/account-register-entry.spec.ts (an earlier unit's test read a button box mid-animation, 43.99994 vs 44: now measures `offsetHeight`, the layout height an animation transform does not change)
- reviewer-caught deferrals: none
- commit: see git log

## Final review
- eval:
- native: not executed in this run
