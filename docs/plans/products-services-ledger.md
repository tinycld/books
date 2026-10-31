# products-services — helix run ledger

- mode: unattended
- unit: p2-products-services
- started: 2026-10-30
- package branch: books/p2-products-services (from main 91ce648)   core checkout: main 1bda334
- spec: docs/specs/products-services-design.md
- checkpoints: docs/plans/products-services-checkpoints.md
- reference: docs/plans/products-services-reference/
- evidence: docs/plans/products-services-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/products-services-capture.json
- review mode: C — none (unattended)
- core extension: checkpoint 0 on core branch books/p2-products-services (from main 1bda334) — per-component zod schema for custom built-ins on `FormHostUi`; human chose it 2026-10-30
- sparks:
  - each type explained in one sentence where you choose it → expressible (`ProductTypeChooser` rows: React Native `Pressable`, `text-foreground`, `text-muted-foreground`, `border-border`, pressed `bg-accent`, min height 64 px)
  - prices and costs right-aligned in their own columns → expressible (list cells `text-right` with `formatMoney`; `MoneyField` input `text-right`)

## Deferrals
(none yet)

## Rebuttals
(none yet)

## Design notes
- cp0 reviewer A NOTE: no test covers `schemas` on the first schema `useFormCreate` / `useFormEdit` build; `components/forms-builder/PreviewDialog.tsx` still builds its first schema without `schemas`. Harmless: `FormRenderer` replaces `schemaRef.current` on every render before any validation.
- cp0 reviewer B: `FormRenderer.tsx` keeps its own `NO_SCHEMAS` though `useFormState` already defaults `undefined` to one (the checkpoint asked for it).
- cp0 reviewer B: the fictional `gizmos:gadget` host is copied into 4 core test files; `core/lib/forms/__tests__/fixtures.ts` was not in the Files block.
- cp1 reviewer A NOTE: `ListTable`/`ListCards` now remount when the list leaves `ready` or the breakpoint flips, so the row window starts at row 0 again. Before, the window index survived while the ScrollView remounted at the top (a blank top after a no-match search was cleared on a scrolled list). No guard spec covers either.
- cp1 reviewer A NOTE: `useTableMinWidth`'s gutter remeasures on remount; under classic scrollbars at most one frame draws the table without the gutter.

## Out-of-plan changes
(none yet)

## Phase notes
- phase 1: intake and the first design gate ran 2026-10-29 in lane reports (packet against books 3c32b22, core 12759a7): direction A, Q1-Q18 accepted as recommended, platform item 1 (no slide on web) signed off; the unit then waited for p3-vendors. Look-ahead packet regenerated 2026-10-30 against books/p3-vendors 2208ad9, core 5217753; kept by the discard rule at books 91ce648, core 1bda334.
- phase 3: design gate 2026-10-30 approved ("A - accept recommendations on questions as well"): direction A; open questions G1-G9 accepted as recommended (recorded in the spec's Design decisions): G1 `titleOf` + `{ id, inactive }` row menus; G2 widen `useRecordList` / `partyListViewState`; G3 extract `RecordListFrame` / `ListTable` / `ListCards`; G4 extract `SearchPicker`; G5 `forms/account-fields.tsx` with exported `HostSelect`, key `books.form.accounts`; G6 `validateExpenseAccount` takes its message; G7 no new seed accounts; G8 shrinking list title; G9 list not paged (p2-books-fts-search converts all three lists). Artboards: staging/p2-products-services/artboards.html (direction A boards).
- phase 3 pass 2 (2026-10-30): fixture `lib/products-services-fixture.ts` (24 products, 14 bundle rows, local `ProductRecord`/`BundleItemRecord` until the migration checkpoint); scratch route with 20 states; reference captured in `docs/plans/products-services-reference/` (19 shots, light + dark); no spark dropped. Driver decisions on the reference agent's open points: (1) the phone search placeholder truncates in the shared `ListToolbar` — keep the spec text, a design NOTE; (2) bundle Qty column width follows core `TableField` unless the plan finds a column-width option; (3) the error banner's `bg-danger-soft` is undefined — known core gap from p3-vendors, out of scope (core); (4) the plan fixes `PRODUCT_COLUMNS` (Name min 160, Type 120, money 112 each, menu 44; 560 px table) and `productCardHeight` (24 + 20 + 16 per extra line) as drawn in the reference. Capture spec additions: `hideLabels`, each shot loads at its first width.
- phase 4 (2026-10-30): plan written (11 checkpoints; plan-check --unattended exit 0). Driver decisions: Name column min 148 (sum 560 with padding); income account required is display only with no inline message; test 10 alone reads and writes the seeded laptop. The plan writer found that core validates a custom built-in as `z.unknown()` (core lib/forms/values.ts `anySchema`), so `MoneyField` cannot block Save on malformed text. Human chose (2026-10-30) "Core host schemas": checkpoint 0 in core adds an optional per-component zod schema on `FormHostUi` that `buildSchema` applies to custom built-ins; its PR merges before checkpoint 1; no `exclusive` (an added optional prop).
- phase 4 plan review (2026-10-30; findings in staging cp/plan-review.md): A 12, B 4, C 4, D 4, E 4, F 3. All fixed except F2 (rejected: splitting the chooser from the form page leaves `new.tsx` with no form branch, so test 1's one goal could not pass gate 1 on the first half; right-sizing rule). A8, A10, E4 accepted as the existing pattern. Checkpoint 0 (core host schemas) added; 12 e2e tests of 12 (cp9: 1, 2, 5, 10, 11; cp10: 3, 12, 4 phone; cp11: 6, 7, 8 wide, 9 phone). plan-check --unattended exit 0. Review mode C.
- review mode switches: none

## Checkpoint 0
- test writer: core/lib/forms/__tests__/values.test.ts (5), core/ui/forms/__tests__/use-form-create.test.tsx (1), use-form-edit.test.tsx (1, its `useFormsOfHost` mock now picks the gadget form by hostKey), form-renderer.test.tsx (1); red for the right reason: yes (each fails only on the missing 4th/5th/6th argument); untestable: none. Hook tests read `getFieldState('amount').error?.message` (same errors as `formState.errors`, not a render snapshot).
- implementer: values.ts `HostSchemas` + `buildSchema` 4th arg, host-ui.ts `FormHostUi.schemas`, use-form-state / FormRenderer / use-form-create / use-form-edit pass it; DONE
- test disputes: none
- self-declared differences: `useFormState` defaults `schemas` to a module-level `NO_SCHEMAS` (a `{}` default would rebuild the memo every render); an if/else in place of the nested ternary; one doc sentence on `buildSchema`; the `EMPTY_DEFINITION` fallback branches also pass `schemas` (no effect with an empty definition)
- gate 1: tests unedited: yes · pass (core check 3050 tests; pkg:check all members; check:core-isolation 19 refs, all allowlisted)
- gate 2: n/a
- gate 3 A (correctness): BLOCK 1 a required custom built-in with a host schema shows zod's own "Invalid input: expected number, received undefined" and a schema that accepts '' makes required a no-op → accepted+fixed (core presence check with `<Label> is required` piped into the host schema; a fresh test writer added the message, accepts-'' and null assertions to values.test.ts, red first); NOTE 2 optional refuses null → accepted+fixed (`.nullable().optional()`, every core kind does so); NOTE 3 initial schema without `schemas` untested, harmless (FormRenderer rebuilds `schemaRef` each render) → Design notes; NOTE 4 `resolveKind` twice per field → accepted+fixed
- gate 3 B (conformance): 1 = A's BLOCK 1 / NOTE 2 (fixed); 2 = A's NOTE 4 (fixed); 3 FormRenderer's second `NO_SCHEMAS` → kept (checkpoint Do step 3 asks for it) → Design notes; 4 gadget host fixture copied into 4 test files (fixtures.ts not in the Files block) → Design notes; isolation pass
- fix review: round 1: reviewer A pass over the fix diff: clean (no BLOCK) · NOTE: the comment said an empty optional value passes, but `''` on an optional field reaches the host schema → comment corrected (one line, same file)
- gate 3 A notes: 1 (listed under Design notes)
- reviewer-caught deferrals: none
- commit: core 71cdf39 (branch books/p2-products-services); merged core main 107182e (clean, core check 3055 passed); core PR https://github.com/tinycld/tinycld/pull/407

## Checkpoint 1
- test writer: tests/party-list.test.ts (added `recordCardHeight` ×3, `partyCardHeight` = `recordCardHeight` over CUSTOMERS at scale 1 and 1.5, `partyTitle`, widened `partyListViewState` bound); red for the right reason: yes (missing exports; the bound case is red in tsc TS2739 only, by design); untestable: none. Frame, tables, cards and row menus are guarded by the unchanged customer-form:/vendor-form: e2e.
- implementer: `RecordListFrame`, `ListTable` (`ListHeaderRow`, `ListHeaderCell`), `ListCards`; `ListRecord` bound in party-list / useRecordList / useRecordRowMenus (`titleOf` required); PartyList on the frame; DONE
- test disputes: none
- self-declared differences: explicit type arguments in `CustomersList` (`useRecordRowMenus<CustomerRecord, CustomerMenuItem>`) and in `PartyList`'s `ListTable`/`ListCards` (inference picked the base row); `PartyListProps.list` typed `RecordListState<PartyListRow<T>>`; `ListHeaderCell` joins `text-right` for `align: 'right'`; `ListTable`/`ListCards` mount only while shown (row-window state resets when the list comes back); "why" comments moved onto `renderTable`; header test ids `customers-header` / `vendors-header`
- gate 1: tests unedited: yes · pass (check 2986 tests; guard `customer-form:|vendor-form:` 36 passed)
- gate 2: n/a
- gate 3 A (correctness): no BLOCK; NOTEs: row-window reset on remount fixes a latent blank-top-after-search bug (Design notes); `useTableMinWidth` gutter remeasures on remount, at most one frame (Design notes); ledger file not in Files block (the loop's own file)
- gate 3 B (conformance): pass; NOTE explicit generics in CustomersList follow VendorsList's pattern (accepted)
- fix review: n/a
- gate 3 A notes: 2 (Design notes)
- reviewer-caught deferrals: none
- review input: review-diff.mjs listed the 9 planned files as out-of-plan (its parser drops a path after `Create:`/`Modify:`); the driver checked them against the Files block (none out of plan) and corrected the input

## Final review
- eval:
- native: not executed in this run
