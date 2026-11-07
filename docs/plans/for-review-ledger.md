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
(none yet — gate-2 NOTEs the loop did not act on, as
`cp N · <shot>: <where> — <what>`; shown to the human at each checkpoint
and again at the end)

## Out-of-plan changes
(none yet — every file touched that no checkpoint's Files block named, with why)

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

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
