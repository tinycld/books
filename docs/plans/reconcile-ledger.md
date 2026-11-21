# reconcile — helix run ledger

- started: 2026-11-21
- mode: unattended
- unit: p4-reconcile
- package branch: books/p4-reconcile (books @ff6a766, from main)   core checkout: main (tinycld @4adc15b)
- spec: docs/specs/reconcile-design.md
- checkpoints: docs/plans/reconcile-checkpoints.md
- reference: docs/plans/reconcile-reference/
- evidence: docs/plans/reconcile-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/reconcile-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - The arithmetic is on the screen: the user reads how the difference is made → expressible (figures with `tabular-nums` and `formatMoney`, labels `text-xs text-muted-foreground`, operators as text, a `border-border` rule; the pattern of the register's balance block)
  - The difference tells its state at a glance and is the first figure the eye meets → expressible (`text-2xl font-semibold tabular-nums`; Lucide `CircleCheck` / `CircleAlert` through `useThemeColor('success')` / `useThemeColor('warning')`; the words "Balanced" / "Not balanced")
  - The figures stay in view while the list moves → expressible (the band is outside the list's scroller, the fixed column of `BankingScreenView`)

## Deferrals
- The account register's table scrolls sideways below its minimum width, also beside the inline entry drawer (`components/register/RegisterTable.tsx`, before this unit). The project rule is that a table never scrolls sideways. This unit adds the Status column and raises the minimum from 900 to 980; it does not change table-or-cards. Reason: the fix makes the register cards beside the open drawer at 1280 and at tablet width, which `tests/e2e/account-register-drawer.spec.ts` asserts as a table; that is a design decision only the human can make (plan review finding 2).

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
- phase 1: unattended; no corrections. Intake: staging `p4-reconcile/intake.md` (23 inventory items, 3 sparks, all expressible, no `[platform]` item). Step branch `books/p4-reconcile` was made by the driver from main @ff6a766; the two exclude lines were added to `.git/info/exclude` on 2026-11-21.
- phase 2 / design gate (human, 2026-11-21): direction A picked (a summary band over one full-width list; the start is a dialog on an accounts screen). Directions B (statement rail) and C (two lists) were not picked. All 21 open questions of the packet take their recommended answers, with these changes:
  - Q18: the new migration takes the next free number at build time, not 2100000036 (p2-bank-deposit of lane reports takes 36). The spec names no fixed number; the unit reads the number after it merges main.
  - Q3: every detail type of a `bank` account (checking, savings, money market, cash on hand, trust account) and `credit_card` can be reconciled.
  - Q20: p2-bank-deposit (lane reports) and p5-expenses-by-vendor (lane default) merge first. This unit merges main in before its eval gate and keeps both sides in the shared files: `server/entries.go` (`transitionEntry` void branch), `server/accounts.go`, `server/register.go`, `server/registrations_test.go`, `server/audit.go`, `server/oauth_scopes.go`, `collections.ts`, `seed.ts`, `lib/shell-nav.ts`, `lib/register.ts`, `help/banking.md`, `help/bank-match.md`, `help/screenshots.ts`.
  - The answers as approved: Q1 the report, history, print/PDF and admin undo stay in p4-reconciliation-report; after Finish this unit shows a read-only summary. Q2 a void or edit of a reconciled transaction is refused with the reason; a void of a cleared one removes the mark. Q4 no finish with a difference, no adjustment entry. Q5 the first beginning balance is $0.00; later ones are the last finished statement's ending balance. Q6 each press is saved; one reconciliation in progress for each account; Discard removes it. Q7 five hints in the packet's order. Q8 two optional statement totals. Q9 matched transactions do not start cleared; "Clear matched" clears them. Q10 the dialog starts with the balance and date of the latest OFX statement file. Q11 a row press clears; the link opens the transaction. Q12 the register gains the Status column, "Reconciled through" and Reconcile. Q13 three entry points (sidebar, register, Banking More menu). Q14 "Charges" and "Payments" for a card; balances are the amount owed. Q15 Date, Payment and Deposit sort. Q16 no paging; windowed rows; a scale run at 20,000 lines is the driver's. Q17 the key map of the packet. Q19 the cuts of spec §5. Q21 the seed on 1010 Business Savings.
  - No `[platform]` item. Keyboard shortcuts and first-input focus have standing approval (human, 2026-11-11).
- spec self-review after the gate (fixed in the spec):
  - The credit card band line was wrong under plain word substitution. The spec now defines the credit side and the debit side, says that a card's band reads "Beginning balance + charges − payments", and gives the sign of a phone card's amount by its effect on the balance. `statement_out` / `cleared_out` are the credit side; `_in` the debit side.
  - `books/reconcile?account=<id>` had no stated result for a reader or an id that cannot be reconciled: it shows the accounts screen with no dialog. With a reconciliation in progress the route replaces itself with the work screen.
  - The Banking More menu item "Reconcile" is for a writer, as the register button is.
  - An account that becomes inactive keeps its reconciliation in progress; the accounts screen does not list it and the register's Reconcile button still opens it.
  - Added e2e: a credit card account and a bank account of detail type Cash on hand.
- phase 3 (unattended, 2026-11-21; no human approval of the reference): direction A built as the scratch route. No spark dropped: all three are built from core and Books components. Reference: `docs/plans/reconcile-reference/` (110 files: 28 shots, widths 390 and 1280, light and dark; `band-open` at 390 only). Shots: accounts, accounts-empty, accounts-reader, start, start-first, start-errors, start-sending, work, band-open, balanced, hints, hints-open, filtered, no-match, empty, batch-busy, batch-done, refused, card, read-only, finishing, loading, error, not-found, edit-info, discard, finished, register. Fixture: `tinycld/books/lib/reconcile-fixture.ts`.
  - Reference corrections after the first capture: the band's operators are on the line of the figures' values, and each sign stays with its figure when the parts wrap; the hint's mark is on the first text line; on a phone the hint's actions wrap under its text; every shot hides the shell's floating New button (`hideLabels: ["New"]`).
  - Deviations from the spec to keep in the build: the Transaction column flexes (flex 1, min 150) so "Sales receipt 1009" and the bank mark fit; at 1280 with the sidebar open the band's parts wrap to two lines; the phone's Finish is a bar at the bottom with the reason it is disabled; the start dialog puts Ending balance and Ending date side by side on wide. The `register` shot is an excerpt drawn with the register's exported cell styles, not the register route.
  - For the plan: the fixture declares `ReconciliationRecord` and `ReconcileLineRecord` locally; the migration checkpoint replaces them with the generated types. The view `books_reconcile_lines` of spec §4 has no `origin` and no `document`, which `entryTypeLabel` and `entryHref` need: add them to the view, or read the entry with `materialize()`. The mockup's own helpers (`totalsOf`, `matchesFilters`, the word tables, `statusOf`) move to `lib/reconcile.ts`.
- phase 4 (unattended, 2026-11-21): plan `docs/plans/reconcile-checkpoints.md`, 5 checkpoints, no checkpoint 0; plan-check exit 0 (0 errors; the warnings are produced names that no later checkpoint reads and names an earlier checkpoint defines). Review mode C (unattended; not asked). Plan review (report in staging `p4-reconcile/plan-review.md`): 2 must-fix, 11 should-fix, 8 notes; all fixed in the plan:
  - `tests/migration-prefixes.test.ts` pins the migrations after 2100000034: now in checkpoint 1's Files, the new file found by its suffix.
  - The register's change to `useFitsTable` broke three tests of `account-register-drawer.spec.ts` (cards beside the inline drawer): withdrawn. The register keeps its layout rule; see Deferrals.
  - `bank_matched` is the one `EXISTS` of spec §4: the categorize hook already writes a match line, so the second `EXISTS` was dead code.
  - The view's query-plan test pins a `SEARCH` by `account` and no `SCAN`, not an index name.
  - Load-error e2e runs on a new page with the route installed first. The seed has a fourth entry and one cleared row in progress, so a reader's check mark (`reconcile-cleared-mark-<lineId>`) has an assertion. `ofxStatement` gains a `ledger` argument. The accounts query gives the connection id for `useStatementBalance`. Realtime, the Show menu, a sort header and "1 more" of the hint line have e2e assertions. `accountParamTarget` is a pure helper with unit cases. Core files are cited for the scoped `/` key and `scopeOwner`. The batch uses `chunksOf` in steps of 50. `releaseDomFocus` moves to `lib/dom-focus.ts`. Behaviors with a unit or Go test only are listed in each Tests block with the reason.
  - Decisions the build must know: the view has `origin` and `document`; the register reads the status from the view row; `reconcileTotals` takes the account type; `hidesNewFab` covers `books/reconcile/<id>`; 20 e2e tests in five spec files `tests/e2e/reconcile-*.spec.ts`; the scale run and the seed-reader specs of checkpoint 1 are `NEEDS-RUN` for the driver.
- review mode switches: none

## Final review
- eval: (unattended only) approved | revised → <notes, fix sha> | stopped
- human comments and what changed
- native: not executed in this run
