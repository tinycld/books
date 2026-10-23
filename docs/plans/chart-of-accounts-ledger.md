# chart-of-accounts — helix run ledger

- mode: unattended
- unit: p1-chart-of-accounts
- started: 2026-10-22
- package branch: books/p1-chart-of-accounts   core checkout: main
- spec: docs/specs/chart-of-accounts-design.md
- checkpoints: docs/plans/chart-of-accounts-checkpoints.md
- reference: docs/plans/chart-of-accounts-reference/
- evidence: docs/plans/chart-of-accounts-evidence/cp<N>/
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/chart-of-accounts-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - right side panel for New account → expressible (core Drawer)
  - group chip beside type → expressible (semantic-token chip)
  - three-step import progress → expressible (core components)

## Deferrals
(none yet)

## Rebuttals
(none yet)

## Design notes
(none yet)

## Out-of-plan changes
(none yet)

## Phase notes
- phase 1: intake in staging/p1-chart-of-accounts/intake.md; screenshots viewed once.
- phase 3: human picked direction A (outline table with side panel). Q1–Q10 accepted as recommended. Platform item (drag-and-drop CSV, web only) approved; CSV upload via Choose file/document picker required on native. Type column stays visible while a group filter is active (human reversed the earlier hide-on-filter idea). Description stays in the panel, not a column. Detail type not sortable.
- phase 3 pass 2: direction A captured in docs/plans/chart-of-accounts-reference/ (8 states x 390/1280 x light/dark: populated, empty, filtered, panel-open, no-match, import-upload, import-map, import-preview). Fixture lib/chart-of-accounts-fixture.ts (typed with satisfies against BooksAccounts/BooksAccountBalances). Filtered state keeps the Type column and group chip. No spark dropped (side panel = core Drawer inline/overlay, group chip = semantic-token chip, step indicator = core components). Mockup stand-ins: the Type/Detail/Parent selects are static bordered fields, row menu is an icon only. Panel-open at 1280 scrolls the table horizontally (min width 960).
- phase 4: plan-check exit 0. Fresh-subagent plan review found ~20 gaps (refusal display, server help strings, import precedence/cycles/blank cells, depth convention, writers-only import links, phone selection, toggle clears parent, panel reset on target change, roll-up with inactive, missing component/aggregation tests, undefined prop plumbing, hedges); all fixed in the plan, split into 7 checkpoints. Review mode C (unattended). Known limit: seed has no read-only member, so read-only paths are unit-tested only.
- review mode switches: none

## Final review
- eval: pending
- native: not executed in this run
