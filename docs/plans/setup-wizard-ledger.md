# setup-wizard — helix run ledger

- mode: unattended
- unit: p1-setup-wizard
- started: 2026-10-24
- package branch: books/p1-setup-wizard   core checkout: main
- spec: docs/specs/setup-wizard-design.md
- checkpoints: docs/plans/setup-wizard-checkpoints.md
- reference: docs/plans/setup-wizard-reference/
- evidence: docs/plans/setup-wizard-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/setup-wizard-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - one decision per screen with visible position → expressible (core StepHeading, SetupContinueButton, shell progress label)
  - choice cards with clear selected state → expressible (RadioInput or ButtonGroup; confirm at build)

## Deferrals
(none yet)

## Rebuttals
(none yet)

## Design notes
(none yet)

## Out-of-plan changes
(none yet)

## Phase notes
- phase 1: none
- phase 3: pass 2 done (fixture, scratch route, 11 reference shots); RadioInput has no card layout, so ownership cards are plain Views with a selected border. direction A picked at design gate; questions 1-6 accepted as recommended (core package step + /a/books/setup; ownership question; read-only preview; migration 2100000001 edited in place; client batch via useMutation; admin-only Lists card)
- phase 4: plan review findings fixed: retry needs number-to-id map; sequential inserts so a refusal stops the batch; precedence of populated vs error/done; settings-write refusal test; useIsStepDone/Visible and hub-card tests; e2e is one non-order-dependent test. Spec edits made after the gate (shown at the eval gate): label "Part n of 3" (core shell already prints "n of m"); Dividends paid dropped (no dividends detail type in account_types.json); "Back and Next under the form" (core shell footer is not pinned and has no Back). Known coverage limit: the e2e database has no empty book and no non-admin Books user, so the built fresh-chart, creating, error and non-admin screens cannot be captured or driven in e2e; hook tests cover their logic.
- review mode switches: none

## Final review
- eval: 
- native: not executed in this run
