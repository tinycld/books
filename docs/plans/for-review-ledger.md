# for-review — helix run ledger

- mode: unattended
- unit: p4-for-review
- started: 2026-11-07
- package branch: books/p4-for-review   core checkout: main (796d81c8)
- branches: books: books/p4-for-review · tinycld: main @796d81c8
- spec: docs/specs/for-review-design.md
- checkpoints: docs/plans/for-review-checkpoints.md
- reference: docs/plans/for-review-reference/
- evidence: docs/plans/for-review-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/for-review-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - Money out and money in in two right-aligned columns, so direction reads from position → expressible ("Spent" / "Received" columns, `text-right tabular-nums text-foreground`, `ListHeaderCell`, shared cell style constants; phone cards keep one signed amount)
  - The tab that needs work says how much is left; the others stay quiet → expressible (core `SetupTabs`; only "For review (12)" has a count; card line "12 to review")
  - Green "1 match found" badge, green suggested category → dropped (belongs to p4-match / p4-categorize-split)

## Deferrals
(none yet)

## Rebuttals
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
- ~~cp 1 · error-390: `ReviewLoadError` — the error sentence is left-aligned while the empty sentences and the reference are centered (critic NOTE; `text-center` as `ReviewEmptyState`).~~ Done in fix round 1 (part of finding 2's centering).
- cp 1 · strip (review/reviewed/excluded/files/loading/error-1280): the full cards end at different heights (1000 y 85–295, 2100 y 85–357, its statement adds two lines); round 1 set `alignItems: 'flex-start'` to stop the stretch to the free height. Now that `STRIP_STYLE` stops the scroll view growing, removing `alignItems: 'flex-start'` would even them (critic round 2 NOTE, fix reviewer NOTE).
- cp 1 · error-1280/390: the error sentence is semibold `text-foreground`; the reference and the sibling empty sentences are regular `text-muted-foreground` (critic round 2 NOTE).
- cp 1 · tab body (review/reviewed/excluded/files, both widths): ~24–28 px between the tab bar rule and the first content; the reference has ~16. When checkpoint 2's toolbar lands, check the bar-to-toolbar gap is 16 (critic round 2 NOTE).
- cp 1 · files-1280: only the upload area is in view; the file list starts below the panel bottom (the taller 2100 card and the body padding), reachable by scrolling the tab body as spec §2 allows (critic round 2 NOTE).
- cp 1 · reviewer A: key U still runs `upload.pick()` on the For review tab, where the upload area and its refusal are not shown; checkpoint 5 plans "U also switches to the Files tab" (spec §3 Keyboard).
- cp 1 · reviewer A: the wide strip (horizontal `ScrollView`) does not scroll to the selected card; after a deep link (`account=<id>`) with more cards than fit, the chosen card can be off screen. The spec asks the auto-scroll only on the phone strip.
- cp 1 · reviewer A: `useReviewTab` takes `accountLabel` and `currency` and does not read them yet (the interface names them for later checkpoints); remove at the end if no checkpoint reads them.
- cp 1 · reviewer A: the two out-of-plan tests (see Out-of-plan changes) should have been named in the plan.

## Out-of-plan changes
- cp 1 · `tests/use-connect-account-form.test.tsx`, `tests/use-disconnect-connection.test.tsx`: each builds a hand-made `BankConnectionRow`; the planned `reviewCount` field made tsc refuse them (TS2741). `reviewCount: 0` added to each row, nothing else (implementer).

## Phase notes
- phase 1: unattended; intake in auto-helix staging (p4-for-review/intake.md).
- phase 3: design gate 2026-11-07 — direction A (tabs in the account panel, details in a drawer) picked over B (own review page + inline expansion) and C (one queue across accounts). Open questions 1–9 accepted as recommended:
  1. Exclude and Move to For review (status only, nothing posts) built in this unit; p4-categorize-split keeps categorize/split and adds its actions to this unit's drawer and selection bar.
  2. Uploads and the file list move unchanged into a fourth tab, Files; default tab For review; `U` switches to Files; existing banking e2e specs open the Files tab.
  3. The `books_bank_transactions` update rule is added by editing `2100000008_create_books_banking.js` in place (Books 0.1.0 unreleased).
  4. "12 to review" on every account card and the count on the For review tab; loads every for-review row of every connection.
  5. Sort only by date (newest / oldest) on all three tabs.
  6. Reviewed tab: list rows and drawer facts only; no "Added as" column and no Undo until p4-match / p4-categorize-split.
  7. Batch Exclude / Move through pbtsdb, 50 rows at a time in parallel, no cap on the choice; no new endpoint, no action collection.
  8. Search, Dates and Type are one set for the three transaction tabs and all accounts, kept while the Banking page stays mounted, reset when it loses focus.
  9. Pressing a row opens a drawer (register placement), not an inline expansion.
  No `[platform]` items. No core extension. Sparks: two expressible, one dropped (above).
  - Spec self-review after the gate: "Go to files" in the For review empty state is stated as writers-only in both cases; the fixture is stated as the scratch route's data only, and the seed makes no `reviewed` rows (the seeded Reviewed tab shows its empty state).
- phase 3 pass 2 (unattended): reference of direction A captured from the scratch route `/a/books/helix-mockup?state=<name>` with the fixture `tinycld/books/lib/for-review-fixture.ts` (typed with `satisfies` against the generated `BooksBankFiles` / `BooksBankTransactions`; imports a `Pick` of `BooksBankImports`; the account cards are a local view shape with `reviewCount`). 22 states × 390/1280 × light/dark in `docs/plans/for-review-reference/` (manifest `docs/plans/for-review-capture.json`): review, oldest, selected, busy, done, failed, drawer, drawer-long, filtered, filtered-empty, empty-waiting, empty-none, reviewed, reviewed-card, reviewed-empty, excluded, excluded-selected, excluded-empty, files, loading, error, read-only (reader, drawer open). No spark dropped (both expressible sparks are in the route). No human corrections (unattended).
  - Spec change from the reference: the account strip is one non-wrapping row at every width (wide: full cards in a horizontal scroll; phone: compact cards with label, balance and "12 to review", as direction A's phone artboard). The first capture showed the wrapped wide strip and the full phone cards pushing the panel and list below the fold, worse with the inline drawer. Spec §2 carries it.
  - Spec change from the reference: the open row is `bg-accent` (as the register), not `bg-muted` (a dark slate band in light mode that hid the second line). Spec §3 drawer carries it.
  - Known in the reference, kept per the spec: at 1280 the inline drawer (380) narrows the page so the table (min 720) scrolls sideways and Spent/Received go off screen, as the register does; at 1280×800 the list shows about 4 rows under the strip; on a phone the Books FAB covers the amount of the lowest visible card.
  - Route facts for the plan: the account card in the route is a copy of `BankAccountCard` with the "12 to review" line (the real card's `StatementLine` reads a collection); Books `ListToolbar` has no search-only form (its `SearchField` is private and it always draws the Show inactive chip), so the route draws the same field itself — the build exports `SearchField` or adds a chip-less variant; `BankFileItem` rows need the pbtsdb `$` virtual fields when built by hand.
- phase 4 (unattended): plan `docs/plans/for-review-checkpoints.md`, 5 checkpoints (1 tabs + lists + seed, 2 filters + order, 3 drawer + Exclude + rule/audit, 4 choosing + batch + read-only, 5 keys + help). Deviation: OFX seed and OFX e2e files (only OFX fills memo/check_number); noted in spec §4. plan-check exit 0. Plan review: 37 findings, 37 fixed, 0 rebutted (report: auto-helix staging p4-for-review/plan-review.md). Fixed:
  - tests added or sharpened: counts unfiltered under a search; drawer closes and choice clears on tab and account change; filters kept across accounts and reset on focus loss; Clear filters pressed; `check_number` clause proved by a row without the number in its text; `\` cut; select-all under a search; phone date toggle; `ArrowUp`; drawer load error + Retry; the date text of a row.
  - pure helpers `drawerAction(status, canWrite)` and `writeControlState(...)` with unit tests (Reviewed has no action; writes-unavailable wiring).
  - selection bar stays mounted during a run (`batch.pending` with the press-time summary), because the optimistic update removes the chosen rows.
  - source facts: core `SetupTabs` writes no `aria-selected` → e2e read the tab from the URL and the tab body; `useLiveInfiniteQuery` cannot be disabled → two read hooks in two components; `drawerPlacement` reused; `refuseAfterNow`; `TestAudit_LabelsBankRecords`; `TestRegister_BindsEachPartOnce` needs no edit; `TOPICS` in help-screenshots.spec; `dataSet` for `data-focused`; `topLayer()` for an open menu; row focus is the store's, not DOM focus; sticky-header scroll offset; nested `materialize` for the importer (no join); `formatMoney` currency arg.
  - names: `importReviewStatement(page, entriesOf)` only; `onOpen` row prop; `accountLabel` and `pageRecovery` inputs of `useReviewTab`; CP5 `isBatchPending`; `onTab` prop on `ReviewTabBody`; spec-name refinements listed in the plan notes; test-id prefix rule narrowed to the `^=` locators.
- review mode switches: none

## Checkpoint 1
- test writer: tests/bank-review.test.ts, tests/for-review-fixture.test.ts, tests/bank-connections-query.test.ts, tests/e2e/for-review.spec.ts, tests/e2e/for-review-helpers.ts, tests/e2e/banking-helpers.ts, tests/e2e/bank-import-helpers.ts, tests/e2e/banking-page.spec.ts, tests/e2e/banking-keys.spec.ts, tests/e2e/banking-upload.spec.ts, tests/e2e/bank-import-mapping.spec.ts; red for the right reason: yes (fixture id-uniqueness guard passes already, by design; banking-keys/-upload/bank-import-mapping red not run, expected at openFilesTab); untestable: none
- implementer: tabs in the URL, Files tab, three lists (table/cards) with loading/error/empty, review counts on cards and tab, fixed-column page, one-row strip with compact phone cards, "Review transactions", OFX seed import with four excluded; DONE
- test disputes: none
- self-declared differences: (1) `useBackToBanking(…, 'review')` called at the top of `ResultOrLoading` (gets `connectionId`), not in `BankImportView`'s body; (2) `BankingTabs` wraps `SetupTabs` in a horizontal `ScrollView` on mobile only (four tabs do not fit at 390); (3) panel `gap-3` instead of `gap-4` (SetupTabs adds `mb-4`); (4) "Go to files" is an outline Button, the empty sentence `text-sm text-muted-foreground` (as the `empty-waiting` reference); (5) seed OFX has `<BANKACCTFROM>` and `<CHECKNUM>` before `<NAME>`; (6) `seedReviewStatement` throws `seed:` also when contents rows lack `line` or the import lacks the four FITIDs
- gate 1: tests unedited: yes (the test writer's files; see Out-of-plan for two older tests) · check pass (one biome warning in the git-excluded scratch `tests/e2e/helix-capture.spec.ts`; the capture step fixes it) · e2e `for-review:` 2 passed · banking-page 3, banking-keys 3, banking-upload 2, bank-import-mapping 9 passed, each file alone
- gate 2: invalid shots: none (capture reached the built states from `/a/books/banking` with card/tab presses; the scratch capture spec gained general `fakeRecords` options and its complexity warning was fixed — staging cp/cp1-capture.md) · blocking: (1) the strip took the column's free height (cards stretched), tab body ~100 px → accepted, fix round 1; (2) the tab body not bounded by the panel (buttons drawn past the border, phone cards offset) → accepted, fix round 1 · notes: 1, listed under Design notes
- gate 3 A (correctness): 0 BLOCK · NOTE 3 (inline `minHeight` style objects in ReviewEmptyState) accepted+fixed in round 1 (one-line change in a checkpoint file) · other NOTEs to Design notes / Out-of-plan
- gate 3 B (conformance): script lines: 0 real, 2 false positive (`#2231` is a store number in a bank description string) · finding 1 (two out-of-plan tests) accepted as a plan omission, recorded under Out-of-plan changes, no change · finding 2 (comment reflow in bank-connections-query.ts) accepted+fixed in round 1
- gate 3 A notes: 4, listed under Design notes
- fix review: round 1: 4 findings (cp/cp1-fix.md in staging; causes appearance ×2, jsx-logic, other: comment reflow) fixed — strip and phone tab-bar `ScrollView`s no longer grow (`flexGrow: 0, flexShrink: 0` style; `grow-0` class did not apply on web), tab body `min-h-0 flex-1 overflow-hidden`, states centered in the body, `min-h-11`, comment reflowed; declared: `text-center` on the error sentence, `py-10`→`py-6` · gate 1 again: check pass (203 files / 4131), `for-review:` 2 passed, banking-page 3, banking-keys 3, banking-upload 2, bank-import-mapping 9 passed · shots re-captured (critic 1c: Reviewed draws rows once it has height, no second defect) · fix reviewer: 0 BLOCK, 2 NOTE (card heights → Design notes; the error-390 note done → struck) · fresh critic (evidence/cp1/critique-round2.md): 0 INVALID, 0 BLOCKING, 4 NOTE → Design notes · rounds: 1
- reviewer-caught deferrals: none
- commit: 329a419
- human: none (review mode C)

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
