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

## Out-of-plan changes
(none yet)

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

## Final review
- eval:
- native: not executed in this run
