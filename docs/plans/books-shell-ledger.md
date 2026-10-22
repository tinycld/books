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
- **finding:** critic, cp2, "hub-1280-light.png: Lists row — no active highlight … BLOCKING (spec: The active destination is highlighted with the `active-indicator` token.)"
  **rebutted because:** the built URL the plan names, `/a/books/lists`, is created by checkpoint 4 ("Create: `tinycld/books/screens/lists.tsx`"); at `/a/books`, the only route that exists, no entry matches by the spec'd `isActivePath` rule. The wiring is unit-tested (`isActive` true for `/a/books/lists`). Checkpoint 4's gate 2 must show it.
- **finding:** fix review (reviewer A), cp2, "hitSlop={8} plus a 44px box is redundant."
  **rebutted because:** no spec, plan, or codebase rule bans `hitSlop`; it is harmless and the reviewer called it minor.
- **finding:** reviewer A, cp1, "tinycld/books/stores/books-ui-store.ts:11, no hydration handling. asyncStorage hydrates asynchronously, so a user who folded Accounting sees it open for a frame, then it snaps shut."
  **rebutted because:** the spec says "its state persists across sessions in a Zustand store" and the checkpoint says "persisted under the name `tinycld_books_ui`"; both are met. No bullet asks for a hydration gate, and every other persisted store in core (`workspace-store.ts`) has the same one-frame behavior.
- **finding:** reviewer A, cp1, "fixture uses `as const satisfies readonly NewAction[]`; the checkpoint said plain `satisfies`."
  **rebutted because:** the implementer declared it; consumers take `readonly NewAction[]` (checkpoint 1 Interfaces: `newMenuColumns(actions: readonly NewAction[])`), so nothing needs a mutable array.

## Design notes
(none yet)

## Out-of-plan changes
- `tinycld/books/hooks/useBooksAccess.ts`: import changed from `~/tinycld/books/lib/access` to `../lib/access` (Metro cannot resolve `~/tinycld/books/...` for package files; found when the capture route first built).
- `tinycld/books/stores/books-ui-store.ts` (checkpoint 1 file, edited in checkpoint 2): `toggleAccounting` now has a block body so it returns void; the expression body returned persist's thenable and React's `act` took the async path.
- `docs/plans/books-shell-evidence/cp2/capture.json`: biome formatting only.

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

## Checkpoint 2
- test writer: tests/books-sidebar.test.tsx; red for the right reason: yes (hook module missing); untestable: none
- implementer: hooks/useBooksSidebar.ts, sidebar.tsx; DONE
- test disputes: none
- self-declared differences: path read with `useUrl` (core) not `usePathname` (biome bans it outside use-url.ts); plan text amended
- gate 1: tests unedited: yes (only biome format on the test, then a fresh test writer added tests) · pass (50 tests; full e2e green)
- gate 2: invalid shots: none · blocking: 1 rebutted (active highlight not shown: `/a/books/lists` does not exist until checkpoint 4; evidence captured at `/a/books`; checkpoint 4 must capture it with Lists active) · notes: 1 (no phone drawer shot; carried to checkpoint 4, which adds a drawer-open capture if the capture spec supports it)
- gate 3 A (correctness): active test only covered inactive (accepted: fresh test writer added a matching-path test with `useUrl` mocked, a core dependency); fold logic lived in the component with no test (accepted: `visibleAccounting`/`hasAccounting` moved into the hook and tested); plan said usePathname (plan amended)
- gate 3 B (conformance): out-of-plan store fix recorded; AccountingHeading extracted with `isVisible`; chevron touch target 44px (accepted, fixed); gate-2 gap carried to checkpoint 4
- fix review: reviewer A pass over the fix diff: redundant `hitSlop` (rebutted), group header may grow to 44px (checked in screenshots at checkpoint 4), plan Interfaces amended for the two extra hook fields
- reviewer-caught deferrals: none

## Final review
- eval: (pending)
- native: not executed in this run
