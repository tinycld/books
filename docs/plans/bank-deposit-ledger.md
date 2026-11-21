# bank-deposit — helix run ledger

- mode: unattended
- unit: p2-bank-deposit
- started: 2026-11-21
- package branch: books/p2-bank-deposit (from main fd63b677)   core checkout: main (6c30cb1a)
- spec: docs/specs/bank-deposit-design.md
- checkpoints: docs/plans/bank-deposit-checkpoints.md
- reference: docs/plans/bank-deposit-reference/
- evidence: docs/plans/bank-deposit-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/bank-deposit-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - Deposit total is the largest figure and follows the selection → expressible (`DocumentHeader` big figure, label "Deposit total")
  - Selection is the main act; the selected total stays in view → expressible (`SelectBox` per row and header, the row a press target, `TotalLine`s under the Amount column)

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
- phase 1: design packet generated unattended 2026-11-21 (staging /Users/nas/tmp/tinycld/auto-helix-books/staging/p2-bank-deposit/packet.md, intake.md, artboards.html); no corrections.
- phase 3: design gate 2026-11-21 — the human picked direction A (one document form like Receive payment / Pay bills) and accepted the recommended answer of every open question Q1–Q10 as the spec states them. No sparks dropped. Overlaps: p5-expenses-by-vendor (lane default: `server/register.go`, `registrations_test.go`, `seed.ts`, additions — keep both sides); p5-report-engine-scale (lane purchases: in-place `pb-migrations/2100000002_create_books_ledger.js`, `report_sources.go`, `oauth_scopes.go`, `registrations_test.go`) merges first; take the migration number at build.
- phase 3 pass 2: reference captured unattended 2026-11-21 (direction A; 13 states, 36 screenshots in docs/plans/bank-deposit-reference/; fixture tinycld/books/lib/bank-deposit-fixture.ts). No human corrections; no spark dropped. Unsure points for the human: money out shows as "−$20.00" in `text-danger`; ticked rows and cards have the `bg-accent` tint; the read view's actions are in the shared bottom bar, not under the header as on artboard A3; a new deposit shows the "Draft" badge as the payment form does; the Other funds sum shows in its section and again in the totals; the back link is the journal's `EntryBackLink` in the mockup.
- phase 4: plan written unattended 2026-11-21, five checkpoints (1 data, posting, guards, seed · 2 screen and read view · 3 form with undeposited items · 4 other funds, correction, void · 5 "In Deposit" notices and help); 12 e2e tests. plan-check `--unattended`: 0 errors. Review mode C. Plan review (one subagent; report in the lane's staging folder, `plan-review.md`): 9 blockers and 65 minor findings, fixed in the plan: the stale-item text under a draft's row had no read and no test (a second query and `staleItemText` added); `items.<n>` is now the rank in position order on both sides; e2e no longer asserts tick-all / clear-all of the shared list; cards are chosen with core `useContainerWidth`, not `useTableMinWidth`; Void and Delete draft do not widen the list kinds (`useVoidDialogState`, the deposit's own delete); the e2e fee line uses a new active seeded account 6300 (6900 is inactive); the bank register is opened with `openRegister`; the reader test sits in a "(collaborator level)" describe; read-bar ids are `deposit-read-*`; `?replaces` uses `DocumentBar`; one case table `server/testdata/deposit_cases.json` for the rules both sides hold; view columns are cast and the generated type is checked; gates name the existing specs each shared change touches. Decisions: new migration 2100000036; the audit view moves to 2100000037 with the item and line rows; `postingLine` gains a per-line memo and party; `MoneyTextField` gains the sign control for native keyboards; seed rows are dated the run day (the trial balance spec pins "end of last month"); seeded accounts 4900 and 6300 are new. For the human: Remove on an other funds line is a plain icon button and ⌘⌥⌫ is a registered key (one key cannot belong to every line's button); a line whose account later becomes the Deposit to is refused by the server at save, not by the client schema (the spec gives no client text); the help topic has no screenshot (`help/screenshots.ts` unchanged; follow-up); not-found, cannot-edit and no-access are covered by unit tests and the reference, not by e2e (no in-app link reaches them).
- review mode switches: none

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
