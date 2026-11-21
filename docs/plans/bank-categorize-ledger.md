# bank-categorize — helix run ledger

- started: 2026-11-20
- mode: unattended
- unit: p4-categorize-split
- package branch: books/p4-categorize-split   core checkout: main (654110f8)
- spec: docs/specs/bank-categorize-design.md
- checkpoints: docs/plans/bank-categorize-checkpoints.md
- reference: docs/plans/bank-categorize-reference/
- evidence: docs/plans/bank-categorize-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/bank-categorize-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - The ways to handle a transaction are one line of choices directly above the form → expressible (core `SetupTabs` with three values over one mounted section)
  - The bank's own full text stays in view while the user decides → expressible (the drawer's fact rows stay above the form; Memo starts as the bank description)
  - The row tells the category Books proposes before the user opens it → dropped (needs bank rules or a learned category: v1.1 in the Books scope)

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
- phase 1: unattended; intake and questions answered at the design gate (packet: run-root staging p4-categorize-split/packet.md)
- phase 3: design gate 2026-11-20 — human picked direction A (the ways are tabs in the drawer) and accepted every recommended answer, questions 1–18 (Q10: the drawer goes to the next For review row after Categorize, Transfer, Match and Exclude, changing merged p4-for-review / p4-match behavior and their e2e; Q15: migration 2100000035, verified free on every origin branch and lane). Overlap: p5-vendor-balance (lane default) also edits `server/register.go`, `server/registrations_test.go`, `seed.ts` — additions only, keep both sides at merge. Approved retro todo from p2-statements #3: replace the 13 books copies of e2e `tabTo` (and `isFocused`) with one shared helper that waits until focus is off the page body before its first key press; the core copy in `tinycld/tests/e2e/reports-drill.spec.ts` is reported, not edited.
- phase 3 pass 2: reference captured 2026-11-20, direction A, no approval asked (unattended). 30 shots × 390/1280 × light/dark = 120 images in docs/plans/bank-categorize-reference/ (manifest docs/plans/bank-categorize-capture.json; `split`, `split-short`, `sending`, `refused` use height 2400, the other drawer shots 1300). Fixture: tinycld/books/lib/bank-categorize-fixture.ts. No spark dropped in this pass. Facts for the plan: (1) under the way switch, the Match way is drawn without MatchSection's own "Match" title and second top border (the switch is the heading); the plan must say how MatchSection changes. (2) The fixture's `BankCategorizationRecord` is a local interface; the checkpoint of migration 2100000035 replaces it with the generated `BooksBankCategorizations` and `satisfies`. (3) The fixture has one fixture-only account, 6300 with a long name. (4) The split amount input is the input part of MoneyInput with no currency prefix, width 112; a line card is Account, then Amount + Memo + remove on one row. (5) The reference draws the Reviewed row and card as local copies with "Added · <entry>" in the In Books place; the selection bar order is Match, Categorize, Exclude, Clear. (6) A fixture row that stands in for a live-query row needs TanStack DB's virtual props (`publishedRow`, as in tests/live-rows.ts).
- phase 4: plan written 2026-11-20, unattended, review mode C, no human approval asked. 5 checkpoints: 1 Categorization data and server rules (logic), 2 One shared e2e Tab helper (logic; the approved retro task), 3 Way switch, Categorize and Transfer (renders), 4 Split lines (renders), 5 Chosen rows, Reviewed, Undo, help (renders). 11 e2e tests (6 + 2 + 3). `plan-check.mjs --unattended`: 0 errors. Plan review (one subagent, report `phase4-plan-review.md` in the run's staging folder): 1 blocker, 12 should-fix, 6 notes, all fixed in the plan. Blocker: a void from the entry's own screen would void twice, because `transitionEntry` runs before the entry row is written; fix: `uncategorizeEntry` sets a "by void" mark and the delete hook does no void for a marked row, with a Go test. Should-fix, fixed: refusal texts number the form's lines (the Go check refuses inactive, missing and wrong transfer accounts itself); `tests/migration-prefixes.test.ts` joins checkpoint 1; four report specs join the checkpoint 1 gate (the seed line DROPBOX BUSINESS, 2026-10-20, $24.00, account 6200); one shared Go/TypeScript case table `server/testdata/bank_categorize_cases.json`; core `SetupTabs` has no disabled prop (wrapper with no pointer events); `resetReviewSelection` resets the new store state and restore keeps `closeTxn`; the old p4-for-review and p4-match specs that the Account autofocus and the next-row rule change are listed by line in checkpoint 3; `tabTo` call fixed; missing-test states named (vitest of pure helpers and gate 2). Decisions a later phase must know: (a) Escape leaves a form field only in the inline drawer; core closes an overlay drawer and the phone sheet on every Escape (`tinycld/core/ui/drawer/index.tsx`), a difference from spec §3 Keyboard with no core change. (b) The account field takes the focus on a writer's open, on C and T, and on the next row after Categorize or Record transfer; not on the next row after Exclude or Match. (c) `openNextTxn(nextId, takeFocus)` takes an id read at the press, not the rows. (d) Undo runs through the page's batch with the kind `uncategorize`. (e) The split e2e posts three split lines (four entry lines). (f) The keyboard Undo stands in for the keyboard-only edit test: the spec has no edit. (g) Checkpoint 2's gate runs 24 spec files and checkpoint 1's gate 8: both are driver runs (`NEEDS-RUN`). (h) Core copy of `tabTo` in `tinycld/tests/e2e/reports-drill.spec.ts` line 72: reported, no edit planned; the local `tabUntil` helpers of four Books specs stay.
- review mode switches: none

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
