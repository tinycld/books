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
- cp3 reviewer A NOTE: `useRecordSave` create `onError` calls `onPartialCreate` and resets the form even when the user already left; checkpoint 10's `onPartialCreate` must route only while the user is present (driver: passed to the cp10 implementer).
- cp3 reviewer A NOTE: a row refused after the user left an edit shows the closed toast "<not saved title>: <message>" with no row label, though the record update and earlier rows landed.
- cp3 reviewer A NOTE: an edit that changes a column and a row, where the row is refused: the record update landed but `markSaved` does not run, so the column stays dirty and the next Save writes it again (harmless).
- cp3 reviewer A NOTE: a refused row remove has no label, so a field error on it would map to form fields by key (no server rule refuses a delete with field data).
- cp3 reviewer A NOTE: nothing makes sure a dirty table's live rows are present before planning; an absent table plans every row as an insert (reachable only if the live query becomes not ready after an edit).
- cp3 reviewer A NOTE: the create path sets `progress.rowLabel` and never reads it.
- cp4 reviewer A NOTE: core audit binds request hooks only, so a bundle delete's cascaded rows get no audit row each (the bundle's own delete row is the record; journal lines behave the same).
- cp4 fix review NOTE: `TestBundleItem_QuantityRules` has no large three-decimal refuse case (e.g. 999999.999); the code refuses it.
- cp5 reviewer A NOTE: a product search hit routes to `books/products/[id]`, which exists only from checkpoint 9 (planned).
- cp5 reviewer A NOTE: `TestSearch_NoAccessFindsNothing`'s `productRows` check adds nothing beyond its length check; the level check in `searchBooks` is the real guard.
- cp5 reviewer A NOTE: no product case for exclude or `%`/`_` terms; products use the shared `likeWhere` / `escapeLike`, tested for the other kinds.

## Out-of-plan changes
- docs/plans/products-services-checkpoints.md (cp3): driver edit, e2e ports 7200/7201 → 7230/7231 (the lane moved; human, 2026-10-30)

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
- commit: 1199906
- review input: review-diff.mjs listed the 9 planned files as out-of-plan (its parser drops a path after `Create:`/`Modify:`); the driver checked them against the Files block (none out of plan) and corrected the input

## Checkpoint 2
- test writer: no new test (the checkpoint says so); confirmed the guard covers the moved parts: customer parent picker (customer-form-page.spec.ts 85-98, 337-355; customer-form-panel.spec.ts 250-257), vendor expense account trigger and options (vendor-form-page.spec.ts 147, 185, 189; vendor-form-save.spec.ts 129-171), unit tests vendor-host.test.ts, expense-account-options.test.ts; untestable: none
- implementer: `SearchPicker` / `useSearchPicker` / `SearchPickerOption`, `CustomerPicker` on it; `forms/account-fields.tsx` (`HostSelect` exported with `indent?`, `ExpenseAccountField` moved), `hooks/useFormAccounts.ts` (key `books.form.accounts`); DONE
- test disputes: none
- self-declared differences: `NoneItem` / `TriggerSuffix` small components that return null; the search field's accessibilityLabel is its placeholder (same text as before); comments moved; vendor-fields file comment no longer names `ExpenseAccountField`; old key `books.vendor-form.accounts` removed (G5); the git-excluded scratch route keeps its own copies
- gate 1: no test-writer files · pass (check 2986; guard customer-form:|vendor-form: 36 passed); all staged files in the Files block
- gate 2: n/a
- gate 3 A (correctness): no BLOCK; NOTE trigger suffix sits mid-row (`justify-between`), not "after the label" as Produces says → accepted+fixed with B1; NOTE `useFormAccounts` `isReady`/`FormAccount` unused until cp8 (asked for by Produces)
- gate 3 B (conformance): 1 suffix placement (= A NOTE) → accepted+fixed (label + suffix in one `min-w-0 flex-1 flex-row` view, chevron `shrink-0`); 2 lesson 8, items render while closed → accepted+fixed (options and the none item only while `picker.isOpen`); 3 ledger not in Files block (loop's own file)
- fix review: round 1: clean · gate 1 after the fix: check 2986, customer-form: 24 passed
- gate 3 A notes: 0 open
- reviewer-caught deferrals: none
- commit: e567837

## Checkpoint 3
- test writer: tests/table-writes.test.ts, tests/use-record-save-rows.test.tsx (cases a-j), added cases in record-save.test.ts and record-refusals.test.ts, harness `seedFormRecords` / `guardedStore`; red for the right reason: yes (missing module/exports; behavior proven against a scratch reference and against today's hook, then deleted); untestable: none. Rows written cells-first because core `markSaved` compared rows by JSON text (core fix in progress, human chose it 2026-10-30).
- implementer: `lib/table-writes.ts`, `refusalMessage`, `hasRecordChanges`, `rowRefusalHandler`, rows step in `useRecordSave`, `tables` + `ui?.schemas` in `useRecordForm`; DONE
- test disputes: none
- self-declared differences: `refused` handler built once above `useMutation`; short "why" comments on `createTablePlans`, `refusalMessage`, `hasRecordChanges`, `tableWriteSteps`
- gate 1: tests unedited: yes · pass (check 3014; guard 36 passed on 7230/7231 — the first run failed: another workspace's server held 7200/7201; the human moved this lane to 7230/7231)
- gate 2: n/a
- gate 3 A (correctness): no BLOCK; 6 NOTEs → Design notes
- gate 3 B (conformance): no BLOCK; ledger and plan port edit not in the Files block (loop bookkeeping)
- fix review: n/a
- gate 3 A notes: 6 (Design notes)
- reviewer-caught deferrals: none
- commit: 3b8a7ec

## Checkpoint 4
- test writer: server/products_test.go (new; product and bundle-item guards, messages, delete refusals, rules by level, hidden name_key), server/accounts_test.go (account delete refused while products use it), server/registrations_test.go (OAuth rw, audit labels), tests/product-types.test.ts, tests/product-messages.test.ts (drift against products.go / accounts.go), tests/products-fixture.test.ts, tests/collections.test.ts; red for the right reason: yes (Go: missing names and `validateExpenseAccount`'s extra argument; with a scratchpad stub overlay all 42 named tests fail on the missing collection or wrong values; TS: missing modules / collections); untestable: none. `runLevelCases` added because `runRulesByLevel` hard-codes `display_name`.
- implementer: migration 2100000005, server/products.go (guards, delete refusals, `productReferences`), `validateExpenseAccount` message argument, account-delete refusal, audit / OAuth registrations, collections + types, `product-types.ts`, `product-messages.ts`, fixture on generated types, `seedProducts`; DONE
- test disputes: none
- self-declared differences: `refuseField(..., "%s", msg)` / `refuse("%s", ...)` because go vet (Go 1.27) refuses a non-constant format; more read errors wrapped (bundle, item's product, bundle row count, delete count); helpers `bundleHasOwn`, `validateProductAccounts`; `productName` falls back to the id; seed helper `seededAccountId` throws before create on an unknown number; small naming differences
- gate 1: tests unedited: yes · pass (check 3043; go vet + go test; guard 36 passed on 7230/7231; seed 24 products, 14 bundle rows, no error)
- gate 2: n/a
- gate 3 A (correctness): BLOCK 1 bundle quantity tolerance 1e-9 refused valid quantities ≥ 131072 (e.g. 131072.02) → accepted+fixed (1e-6; a reviewer probe over every 2-decimal value found 0 false refusals); BLOCK 2 turning purchases on kept an unchecked A/P or inactive expense account → accepted+fixed (a stored record with purchases off counts as no stored account); a fresh test writer added the failing cases first; NOTE cascade-deleted bundle rows get no audit row each (same as journal lines) → Design notes
- gate 3 B (conformance): 1 = A's BLOCK 2 (fixed); 2 ledger not in Files block (loop's own file)
- fix review: round 1: clean · NOTE doc comment of `validateProductAccounts` still said "only when the write changes it" → corrected (comment only); NOTE no large three-decimal refuse case (999999.999) → Design notes
- gate 3 A notes: 2 (Design notes)
- reviewer-caught deferrals: none
- commit: 4e482aa

## Checkpoint 5
- test writer: server/search_test.go (`TestSearch_FindsProducts`, `TestSearch_InterleavesAllFiveKinds`, `TestSearch_NoAccessFindsNothing` extended with a product; helpers `mkSearchProduct`, `productRows`), tests/search-target.test.ts (product hit); red for the right reason: yes (no product source yet); the no-access case is a guard that passes before and after; untestable: none
- implementer: `productHit`, `searchProducts` (name, SKU, sales description), `searchBooks` interleaves five kinds; search target `product` → `books/products/[id]`; DONE
- test disputes: none
- self-declared differences: a "why" comment on `searchProducts` (sales description, not purchase description, is the text a person knows the item by)
- gate 1: tests unedited: yes · pass (go vet, go test, check 3044)
- gate 2: n/a
- gate 3 A (correctness): no BLOCK; NOTEs: the product route does not exist until checkpoint 9 (planned; the branch is not merged before then); the added `productRows` check in the no-access test is covered by the length check before it; no product case for exclude or wildcard terms (shared `likeWhere` path is tested for the other kinds) → Design notes
- gate 3 B (conformance): no BLOCK; NOTE the `searchSource` comment was not rewrapped → rewrapped (comment only)
- fix review: n/a (comment only)
- gate 3 A notes: 3 (Design notes)
- reviewer-caught deferrals: none

## Final review
- eval:
- native: not executed in this run
