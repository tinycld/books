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
(none yet)

## Design notes
(none yet)

## Out-of-plan changes
(none yet)

## Phase notes
- phase 1-3 (design gate 2026-10-23): direction A picked (flat table, entry drawer); Q1-Q12 accepted as recommended; one change: date range defaults to This month. No platform-only items. No core extension.
- phase 4: plan review (fresh subagent) found narrowed/untested bullets, date-dependent e2e, name clashes, placeholders; all fixed in the plan (6 checkpoints). Spec reconciliation: Type cell shows "Reversal of <number>" (reversal) and "Void reversal of <number>" (void reversal). "This quarter" is the fiscal quarter (spec silent). Retry reloads every collection the screen reads (4, incl. an any-activity balance read). Seeded e2e rows are dated relative to today. Known gaps: no read-only-user e2e (seed has no read-only Books member; covered by newEntryVisible + account-menu-panel test).
- review mode switches: none

## Final review
- eval: (pending)
- native: not executed in this run
