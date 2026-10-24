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
- cp3 reviewer B finding 1 (useState `attempt` counter in useRegisterQuery): accepted after the gate. Retry now uses core's `recoverLiveQueries` (clean up queries, then sources, then preload; TanStack/db#923) and the counter is gone. A reviewer A finding 5 (text-danger on negative balances): rejected. Spec says only "A negative balance shows a minus sign"; the approved reference mockup renders them in text-danger and the colour does not replace the minus sign.
- cp2 reviewer B finding 4 (account via hand-rolled useLiveQuery instead of useRecord): rejected. Decisions block: "`isError` is true when any of the live queries the screen runs (account, lines, opening totals, sub-account, any-activity, settings) reports `isError`." `useRecord` exposes no `isError`, so the account query must be a direct useLiveQuery.

## Design notes
- cp4 critique NOTE: Opening/Ending balance labels are top-aligned in the header; reference bottom-aligns them.
- cp4: OtherAccountName uses useRecord per windowed row (plan-mandated); ~30 live queries mounted; remounts after scroll may re-request an account not held in the store (not measured).
- cp2 spike: outcome (a), see Checkpoint 2.
- cp6 critique NOTEs: card pitch 96pt vs reference ~73pt; drawer close X sits ~19px inside the content right edge (reference aligns); four drawer fields overflow the lines table edge by ~5px (Number field duplicates the title).
- cp5 critique NOTEs: card line order 'account · type' vs reference 'type · account'; drawer title + Number field duplicate the number; opening card and long-memo card not in a capture; phone sheet is size md (checkpoint said lg).
- cp3 critique NOTEs: empty-range state has only a heading + button (reference had "Pick a longer range to see earlier lines."); not-found has a single sentence (reference had a secondary line).

## Out-of-plan changes
- cp2: tests/accounts-form-harness.ts (seedBooks `ledger` option; entries/settings stores; lineStore/balanceStore/settingsStore/entryStore accessors), tests/register-test-data.ts, tests/collections-real.test.ts — test support the plan's tests needed; no existing test weakened.
- cp5: lib/money.ts, lib/register.ts, seed.ts, RegisterRow.tsx (useAccountName), RegisterTable.tsx (exports), evidence/cp5/*.
- cp4: seed.ts account rename; components/register/RegisterHeader.tsx (back link muted).
- cp3: hooks/useRegisterQuery.ts (cp2 code, Retry rebuild + settings query), hooks/useBackToChart.ts, deletion of hooks/useFiscalYearStartMonth.ts + tests/useFiscalYearStartMonth.test.ts, tests/e2e/account-register-helpers.ts + account-register-navigation.spec.ts, docs/plans/account-register-evidence/cp3/*.

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

## Checkpoint 3
- test writer: tests/register-state.test.ts, register-store.test.ts, e2e/account-register-states.spec.ts, e2e/account-register-navigation.spec.ts, e2e/account-register-helpers.ts, edits to shell-nav/account-menu/account-menu-panel/accounts-view-props tests; red for the right reason: yes
- implementer: route screens/accounts/[id].tsx, hooks/useRegisterScreen.ts, lib/register-state.ts, stores/register-store.ts, components/register/*, entry points (row menu + panel), seed.ts entries, hooks/useBackToChart.ts; DONE. Self-declared: hooks/useRegisterQuery.ts (cp2 code) got a useState `attempt` counter in every queryKey so Retry rebuilds a failed live query (e2e Retry fails without it); header shows balances/range/New only in ready/empty/empty-range; testIDs on View wrappers for loading/error; useRegisterQuery owns the single settings query and hook useFiscalYearStartMonth was deleted (dead) with its test (fiscal month asserted in register-realtime.test.ts)
- test disputes: (1) error e2e used route.abort(); pbtsdb retries network failures forever ("Reconnecting…") and only 4xx errors -> test now fulfills 400 (checkpoint text says only that the error state shows on a failed load); (2) openChart helper raced; fixed
- gate 1: tests unedited: yes (except resolved disputes) · pass (1004 unit, 27 e2e)
- gate 2: invalid shots: none · blocking: F1 'through <date>' under Opening instead of Ending balance -> fixed, e2e added, re-captured, fresh critic: 0 blocking · notes: 1 theme (empty-range has no explanation line; not-found has no secondary line), listed under Design notes
- gate 3 A: ownBalance('') false warn while account missing -> fixed; Retry could not clear failed settings query -> fixed; back-link history handling + empty account number -> fixed (useBackToChart, e2e back x2 + number-less account e2e); isOtherPresetSelected inline -> extracted + unit test; text-danger on negative figures -> rebutted
- gate 3 B: complex JSX expr in AccountPanel -> fixed; onViewRegister in Placement -> moved; useState attempt counter -> rebutted (see Rebuttals)
- fix review: reviewer A pass over the fix diff: findings (back link untested, dead hook) fixed
- reviewer-caught deferrals: none

## Checkpoint 4
- test writer: tests/e2e/account-register-table.spec.ts (9 tests, desktop); red for the right reason: yes (register-table missing). UNTESTABLE (seed limits): blank Ref no., negative running balance, zero-opening-no-rows (covered by unit tests in cp1)
- implementer: components/register/RegisterTable.tsx, RegisterRow.tsx, RegisterScreenView.tsx (table in ready state), seed.ts (account renamed 'Accounts Receivable' -> 'Accounts receivable' to match the spec/type label). Self-declared: opening row is a plain View; single-line entries show an empty Account cell; table items = rows + opening item windowed together
- gate 1: pass (1004 unit, 37 e2e)
- gate 2: BLOCKING at 1280 Balance column clipped (content-sized horizontal scroller) -> fixed (stateless contentContainerStyle width 100% + minWidth 900), e2e added (fits at 1280, headings align with cells incl. forced classic scrollbars at 1280x520); re-captured; fresh critic: 0 blocking. NOTE: Opening/Ending balance labels top-aligned vs reference bottom-aligned
- gate 3 A: heading/cell gutter misalignment on classic scrollbars -> fixed (web-only scrollbar-gutter) + e2e; oldest-order running balance unchecked -> e2e added
- gate 3 B: `window` shadowing -> rowWindow; .map in JSX -> WindowedRows; as ViewStyle casts -> web: classNames; back-link muted (+ icon colour)
- fix review: reviewer A over fixes, 3 rounds: clean
- reviewer-caught deferrals: none

## Checkpoint 5
- test writer: tests/e2e/account-register-drawer.spec.ts (17 tests: phone cards, bottom drawer, desktop inline, tablet overlay, keyboard, not-links, stale selection, range change, a11y names, long-memo truncation); tests/register.test.ts additions (entryNumberLabel, balanceTone); red for the right reason: yes. Untestable: tapping a card behind an open phone drawer (modal backdrop + focus trap) -> replacement tested on desktop inline only
- implementer: RegisterCard.tsx, EntryDrawer.tsx, RegisterScreenView.tsx (flex-row, card list, OpeningCard, drawer slot), useRegisterScreen.ts (selectedEntry, onCloseEntry, clearing), RegisterRow.tsx (useAccountName), RegisterTable.tsx (tableItems export), lib/register.ts (entryNumberLabel, balanceTone), lib/money.ts (amountText), seed.ts (long-memo entry). DONE
- test disputes: (1) drawer geometry read mid-slide (200ms) -> test wrong, expect.poll; (2) register-card-ref-* id collided with card selector -> test selector fixed, then id renamed register-ref-*; (3) inline drawer role: test expected dialog -> ruled in favour of semantics: inline = complementary, overlays = dialog
- intermittent failure root-caused: phone drawer is modal (focus trap swallowed Enter); test changed, 6 clean runs
- gate 1: pass (1006 unit, 54 e2e)
- gate 2: BLOCKING "Draft" drawer title when a posted entry has no number -> entryNumberLabel ('—'); re-captured; fresh critic: 0 blocking. NOTES: card line order "account · type" vs reference "type · account"; Number field duplicates the title; opening-balance card and long-memo card are below the fold in the captures (not evidenced); phone sheet size 'md' (checkpoint text says 'lg': blank space fix)
- gate 3 A: stale selection after leaving/returning (fixed: store cleared on unmount/onPreset/back), variable card heights (fixed height + truncation), a11y name, card separator typo; gate 3 B: shadowing/casts in test, duplicated amountText, text-danger for null balance, as const placement returns
- Known limitations (not fixed): selection is not cleared if a selected line vanishes while the screen stays mounted (realtime void/delete); a screen kept mounted under a pushed stack screen is not cleared (no useFocusEffect); native not executed
- fix review: reviewer A over each round: clean
- reviewer-caught deferrals: none

## Checkpoint 6
- test writer: tests/help-account-register.test.ts, tests/e2e/account-register-entry.spec.ts (menu flow, panel flow, back, parent note, phone drawer; desktop + phone); red for the right reason: help unit test (file missing); the e2e flows passed from the start because cp3-5 built them (regression guard). UNTESTABLE: read-only user (no read-only Books member in the seed; unit tests cover newEntryVisible)
- implementer: help/account-register.md, help link in help/chart-of-accounts.md. DONE. Self-declared: dropped 'Show/Hide inactive' and detailed retry text
- gate 1: pass (1020 unit, 61 e2e)
- gate 2: fresh critic over the finished screen: 0 blocking; NOTEs: card pitch 96pt vs reference ~73 (5 cards above the fold vs 7), drawer close button ~19px inside the content edge, four drawer fields push 'Posted' ~5px past the lines table edge, plus carried cp5 notes
- gate 3 A: help text false for default view (Opening balance row position), wrong reason for Ending balance difference, Show this fiscal year unconditional, empty-state New button omitted -> accepted+fixed, tests tightened; weak e2e panel-absent assertion -> moved after register-back; gate 3 B: nothing blocking (spec header wording fixed, cp6 evidence staged)
- reviewer-caught deferrals: none

## Final review
- eval: (pending)
- native: not executed in this run

- Out of plan (eval gate, human-directed): core `lib/recover-live-queries.ts` (+ unit test) on core branch `books/p1-account-register`; `useRegisterQuery` retry uses it. Core PR must merge before the books PR. Test written by the implementer, not a separate agent; the cp3 Retry e2e is the independent proof.
