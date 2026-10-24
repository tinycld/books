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
(none yet)

## Out-of-plan changes
(none yet)

## Phase notes
- phase 1-3 (design gate): direction A picked (grid + preview rail); Q1-Q7 accepted as recommended.
- phase 4: plan review (fresh subagent) found a false CP0 claim (create hook not in `serialized`), a parseMoney contradiction in a test, e2e ordering, and missing Do steps and tests; all fixed, plan is 8 checkpoints (0-7). Review mode C. Deviations from the spec/helix rules, shown at the eval gate: seed.ts is NOT wired to the fixture (a seeded opening entry would hide the first-save and Opening Balance Equity paths; the seed question stays at phase end); core has no disclosure primitive, so books adds `OpeningPreviewDisclosure` (spec said core disclosure row); the read-only e2e fulfills the real books_access response as read_only (client layout only); OBE duplicate-name recovery has no e2e (needs two sessions).
- review mode switches: none

## Final review
- eval:
- native: not executed in this run
