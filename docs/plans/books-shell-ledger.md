# books-shell — helix run ledger

- mode: unattended
- unit: p1-shell
- started: 2026-10-22
- package branch: books/p1-shell   core checkout: main
- spec: docs/specs/books-shell-design.md
- checkpoints: docs/plans/books-shell-checkpoints.md
- reference: docs/plans/books-shell-reference/
- evidence: docs/plans/books-shell-evidence/cp<N>/
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/books-shell-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - actions grouped by counterparty → expressible (Popover columns, Sheet on phone)
  - sidebar shows where you are, folds groups → expressible (SidebarItem, SidebarHeading, persisted store)

## Deferrals
(none yet)

## Rebuttals
- **finding:** reviewer A, cp1, "tinycld/books/stores/books-ui-store.ts:11, no hydration handling. asyncStorage hydrates asynchronously, so a user who folded Accounting sees it open for a frame, then it snaps shut."
  **rebutted because:** the spec says "its state persists across sessions in a Zustand store" and the checkpoint says "persisted under the name `tinycld_books_ui`"; both are met. No bullet asks for a hydration gate, and every other persisted store in core (`workspace-store.ts`) has the same one-frame behavior.
- **finding:** reviewer A, cp1, "fixture uses `as const satisfies readonly NewAction[]`; the checkpoint said plain `satisfies`."
  **rebutted because:** the implementer declared it; consumers take `readonly NewAction[]` (checkpoint 1 Interfaces: `newMenuColumns(actions: readonly NewAction[])`), so nothing needs a mutable array.

## Design notes
(none yet)

## Out-of-plan changes
(none yet)

## Phase notes
- design gate: direction A (columns menu, card hub) picked. Open questions 1-5 taken at the recommended answers (hide unbuilt destinations; FAB on phones; /a/books redirects to Lists; read-only users see no + New; cards).
- spec edit after the gate: registry entries carry an `available` flag (hide-until-built, Q1), so the hub needs an empty state and + New hides when no action is available; the earlier draft said the empty state cannot occur, which was wrong because Accounts arrives in a later unit.
- phase 3: direction A; reference captured (menu, hub x 390/1280 x light/dark)
- phase 4: plan review fixed: org-href helper named (useOrgHref), EmptyState message prop, controlled NewMenu for the FAB, pure isActivePath tested, useNewMenu tested via newMenuForAccess (no own-hook mock), help body written, capture manifest file named. Gaps accepted: no unit render of sidebar or NewFab (covered by gate 2 and e2e), no asyncStorage rehydrate test, no unit test of the sheet stacking branch, no menu-select e2e (no action is available until a later unit).
- review mode: C

## Checkpoint 1
- test writer: tests/shell-nav.test.ts, tests/books-ui-store.test.ts; red for the right reason: yes (modules missing); untestable: none
- implementer: lib/shell-nav.ts, stores/books-ui-store.ts, fixture retyped; DONE (as const satisfies instead of satisfies; icons and ids chosen by implementer)
- test disputes: none
- self-declared differences: `as const satisfies` (keeps literal column types); icons List/BookOpen/FileText
- gate 1: tests unedited: yes · pass (41 tests)
- gate 2: n/a
- gate 3 A (correctness): 8 findings. Accepted+fixed by a fresh test writer: store partialize assertion strengthened, store reset beforeEach, icon cast removed, isActivePath edge cases, registry uniqueness test, mixed available/unavailable column. Finding 3 (sidebarSections does not filter) accepted as CP2 requirement: the sidebar hook composes availableOnly first and tests it. Rebutted: 6 (hydration flash), 7 (as const).
- gate 3 B (conformance): nothing found
- fix review: n/a (only test files changed)
- reviewer-caught deferrals: none

## Final review
- eval: (pending)
- native: not executed in this run
