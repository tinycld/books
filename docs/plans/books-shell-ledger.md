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
- **finding:** reviewer A, cp4, "The 'redirect' bullet is checked only by the final URL … satisfied whether navigateToPackage lands on /books/lists directly or via the Redirect."
  **rebutted because:** before the redirect existed, the same e2e failed with `Received string: "http://localhost:7200/a/books"`, so `navigateToPackage` lands on `/a/books` and only the `Redirect` in `screens/index.tsx` can produce `/books/lists`.
- **finding:** reviewer A, cp4, "The e2e test depends on LIST_ENTRIES and SIDEBAR_ENTRIES having no available entry besides Lists; the next unit has to rewrite the assertions."
  **rebutted because:** the checkpoint's e2e bullet specifies exactly this state ("the 'No lists yet' text visible … no 'New' button (no action is available yet)"); each later unit that flips an `available` flag updates it.
- **finding:** reviewer B, cp4, "`style={{ minHeight: 44 }}` could be a NativeWind class such as min-h-11."
  **rebutted because:** no spec, plan, or codebase rule requires a class form; the committed sidebar and NewMenu use the same inline `minHeight: 44`.
- **finding:** fix review (reviewer A), cp3, "NewFab.tsx has no test … reverting to a single component with useState would still pass."
  **rebutted because:** rendering `NewFab` requires `useNewMenu`, our own hook, which the test mandate forbids mocking ("never mock our own components, hooks, or actions"); the behavior is a mount/unmount structure, covered by the structure itself.
- **finding:** reviewer A and fix review, cp3, "phone layout (isSheet stacking, sheetSide=bottom) is never rendered or asserted in a unit test."
  **rebutted because:** the checkpoint's Gates line is `1 · 2 · 3` and its Tests list names no phone assertion; gate 2's `menu-390-*` screenshots show the stacked bottom sheet, and happy-dom is never the mobile breakpoint.
- **finding:** fix review, cp3, "NewMenu.tsx has no overflow handling; a small phone with many actions will clip the sheet."
  **rebutted because:** the spec's Behavior bullet is "a bottom sheet with the same groups stacked on phones"; core's `Sheet` scrolls its content, and phase 1 has at most one action. No spec text asks for more.
- **finding:** reviewer A, cp3, "placement=bottom-start repeats the Popover default; popover has no arrow-key roving."
  **rebutted because:** the spec names no keyboard behavior for + New, and `Popover` is core.
- **finding:** critic, cp2, "hub-1280-light.png: Lists row — no active highlight … BLOCKING (spec: The active destination is highlighted with the `active-indicator` token.)"
  **rebutted because:** the built URL the plan names, `/a/books/lists`, is created by checkpoint 4 ("Create: `tinycld/books/screens/lists.tsx`"); at `/a/books`, the only route that exists, no entry matches by the spec'd `isActivePath` rule. The wiring is unit-tested (`isActive` true for `/a/books/lists`). Checkpoint 4's gate 2 must show it.
- **finding:** fix review (reviewer A), cp2, "hitSlop={8} plus a 44px box is redundant."
  **rebutted because:** no spec, plan, or codebase rule bans `hitSlop`; it is harmless and the reviewer called it minor.
- **finding:** reviewer A, cp1, "tinycld/books/stores/books-ui-store.ts:11, no hydration handling. asyncStorage hydrates asynchronously, so a user who folded Accounting sees it open for a frame, then it snaps shut."
  **rebutted because:** the spec says "its state persists across sessions in a Zustand store" and the checkpoint says "persisted under the name `tinycld_books_ui`"; both are met. No bullet asks for a hydration gate, and every other persisted store in core (`workspace-store.ts`) has the same one-frame behavior.
- **finding:** reviewer A, cp1, "fixture uses `as const satisfies readonly NewAction[]`; the checkpoint said plain `satisfies`."
  **rebutted because:** the implementer declared it; consumers take `readonly NewAction[]` (checkpoint 1 Interfaces: `newMenuColumns(actions: readonly NewAction[])`), so nothing needs a mutable array.

## Design notes
- cp 4 · hub-1280/390 (empty state): the empty state hugs the top of the page (`ListsHub` wraps core `EmptyState`, whose `flex-1` centering has no effect inside a ScrollView child); title-to-message gap is ~80px because the empty card container still renders; message and subtext are two components with a loose rhythm; the help topic does not describe the empty hub.
- cp 2 · hub-390: no phone shot shows the drawer, the fold, or an active item — carried to cp 4.
- cp 3 · menu-1280: popover rows are 48px apart (reference ~25px); the Other column leaves empty width; dark popover surface equals the page background.
- cp 3 · menu-390: sheet title sits 12px left of the group headings; the tab bar stays undimmed under the sheet (core Sheet).

## Out-of-plan changes
- `tests/e2e/books-smoke.spec.ts` deleted: `/a/books` now redirects to Lists, the spec's "Books" text assertion is unreachable, and `tests/e2e/books-shell.spec.ts` covers opening Books (URL, empty state, sidebar item, no New button).
- `tests/setup-cleanup.ts` (new) and `vitest.config.ts` (`setupFiles`): runs Testing Library `cleanup` after each test; vitest globals are off so the automatic cleanup never registered.
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

## Checkpoint 3
- test writer: tests/new-menu.test.tsx; red for the right reason: yes (NewMenu module missing); untestable: none (rendering an open Popover works in happy-dom inside the real OverlayProvider)
- implementer: hooks/useNewMenu.ts, components/NewMenu.tsx, components/NewFab.tsx, sidebar.tsx, screens/_layout.tsx; DONE
- test disputes: none
- self-declared differences: placement `bottom-start`, 44px rows; `tests/setup-cleanup.ts` + `vitest.config.ts` setupFiles (vitest globals are off, so Testing Library cleanup never ran and `getByText` saw earlier renders)
- gate 1: tests unedited: yes · pass (55 tests; full e2e green)
- gate 2: invalid shots: menu-390-light (sheet still sliding in; fixed by waiting for the ready element's box to stop moving, dark scheme first) · blocking: none · notes: 6 (row pitch 48px vs reference ~25px; popover wider than content; popover dark surface equals page; title/heading indent step in sheet; tab bar not dimmed under the sheet, core Sheet behavior). A real finding the shot exposed, fixed: the sheet opened from the top when the trigger was in the top half; `sheetSide="bottom"` now pins it (spec: bottom sheet on phones).
- gate 3 A (correctness): NewFab kept open state across hide (accepted, fixed: NewFabContent owns the state, mounted only when visible); close-on-select not asserted (accepted: fresh test writer asserts onOpenChange(false)); duplicate useNewMenu (accepted, fixed); placement/roving nit (rebutted)
- gate 3 B (conformance): out-of-plan setup-cleanup + vitest.config recorded; capture.json in Files-block gap only; nothing else
- fix review: reviewer A pass over the fix diff: no new test for NewFab hide (rebutted), phone layout untested in unit (rebutted), sheet overflow (rebutted)
- reviewer-caught deferrals: none

## Checkpoint 4
- test writer: tests/lists-hub.test.tsx, tests/e2e/books-shell.spec.ts; red for the right reason: yes (module missing; URL stayed `/a/books`); untestable: none
- implementer: hooks/useListsHub.ts, components/ListsHub.tsx, screens/lists.tsx, screens/index.tsx (Redirect), manifest help, help/navigating-books.md; DONE
- test disputes: none
- self-declared differences: `useListsHub` also returns `open(entry)`; card testIDs; Do step 5 (a built-capture copy of the manifest) not needed, the cp4 evidence capture.json carries the `/a/books/lists` shot
- gate 1: tests unedited: yes · pass (60 tests). A red e2e was root-caused: the old `books-smoke.spec.ts` asserted the text "Books", which `/a/books` no longer shows after the redirect; the spec was removed because `books-shell.spec.ts` covers opening Books with stronger assertions.
- gate 2: invalid shots: none · blocking: none · notes: 4 (empty state hugs the top of the page, `ListsHub` defeats core EmptyState's centering; title-to-message gap ~80px because the empty card container still renders; message and subtext split across two components; help topic says nothing about the empty hub). The cp2 rebuttal is closed: the active highlight shows for Lists.
- gate 3 A (correctness): card navigation untested (accepted: fresh test writer added a press test asserting `router.push('/a/books/accounts')`); redirect proven only by URL (rebutted); e2e coupled to registry state (rebutted)
- gate 3 B (conformance): out-of-plan deletion of the smoke spec and cp4 evidence recorded; `open` interface addition recorded; `minHeight: 44` as inline style (rebutted)
- fix review: n/a (only test files changed)
- reviewer-caught deferrals: none

## Final review
- eval: (pending)
- native: not executed in this run
