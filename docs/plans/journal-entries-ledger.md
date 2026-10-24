# journal-entries — helix run ledger

- mode: unattended
- unit: p1-journal-entries
- started: 2026-10-24
- package branch: books/p1-journal-entries   core checkout: main
- spec: docs/specs/journal-entries-design.md
- checkpoints: docs/plans/journal-entries-checkpoints.md
- reference: docs/plans/journal-entries-reference/
- evidence: docs/plans/journal-entries-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/journal-entries-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - debit/credit totals and out-of-balance amount always in view → expressible (totals strip outside scroll; text-success / text-destructive; formatMoney)
  - fixed right-aligned Debit and Credit columns → expressible (shared header/row cell style constants, non-shrinking)
  - primary action always in reach → expressible (sticky bg-surface border-t action bar)

## Deferrals
(none yet)

## Rebuttals
(none yet)

## Design notes
- phase 3: core TextInput/TextAreaInput cannot sit in a shared-width table or card cell on web: the input keeps its intrinsic width (inner flex row has no min-width 0) and overflows the cell, even with wrapperProps. The reference binds core PlainInput through useController for the Debit, Credit and line Memo cells (`min-width: 0`, `width: 100%`); the build should do the same, or extend core (needs a human decision, none taken).
- phase 3: reference leaves totals strip and action bar outside the scroll area; on phone the app's MobileTabBar sits under the action bar.
- phase 3: no docs/helix-lessons.md exists in the package yet, so no lessons were applied.

## Out-of-plan changes
(none yet)

## Phase notes
- phase 1: none (unattended; intake in staging)
- phase 3: direction A picked at the design gate; no sparks dropped (all three expressible, none needed a one-off style). Reference captured 2026-10-24: 10 shots x 390/1280 x light/dark in docs/plans/journal-entries-reference/ (list, list-empty, list-no-match, new, new-unbalanced, new-lines, new-unbalanced-lines, posted, void, reverse). `new-lines*` scroll the form to the line grid, which the header fields push off a phone's first screen. No human corrections (unattended).
  - fixture: lib/journal-entries-fixture.ts, typed against generated BooksJournalEntries / BooksJournalLines; wire into seed.ts at checkpoint 1.
  - date field in the reference is core TextInput (YYYY-MM-DD); core DateField decision stays open for the build.
  - capture spec copy (scratch) waits for the ready element's box and opacity to hold still before a shot; without it a Dialog/Sheet re-mounting on the viewport change was photographed mid-animation or not yet shown.
- phase 4: plan written and checked (docs/plans/journal-entries-checkpoints.md); subagent review findings fixed; review mode C
- review mode switches: none

## Final review
- eval:
- native: not executed in this run
