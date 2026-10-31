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
- **finding:** reviewer B, checkpoint 8: "`ProductPicker.tsx:21-37`. Rule broken: CLAUDE.md 'Prefer inline queries in the screen component' … The query is wrapped in a local `usePickerProducts` hook."
  **rebutted because:** the hook is file-local, not a shared hook, and CLAUDE.md also says "Move all state, event handling, and data processing into custom hooks (`useFeatureName`) or helpers above the JSX"; the existing `CustomerPicker.tsx` keeps its picker query in a local hook the same way, and `ProductPicker` is a component, not a screen.

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
- cp6 · list-390: the search placeholder clips "Search products and services" to "…service" at 390 (shared `ListToolbar`; the reference shows the same; a fix is a shorter phone placeholder or a wider field).
- cp6 · list-error-1280-dark: the Retry outline button's border is faint on the dark error banner (the reference has the same edge).
- cp6 reviewer A NOTE: product rows, New and a product search hit reach "Page not found" until checkpoint 9 adds the product routes (planned).
- cp6 reviewer A NOTE: the shared `ListHeaderCell` money headers are right-aligned but not `tabular-nums` (the labels are words).
- cp7 reviewer A NOTE: `MONEY_VALUE_SCHEMA` has no currency, so a very long other-currency text (e.g. `€99999999999999999999` in a USD book) says "Too large" and a shorter one says "Enter an amount such as 1,250.00"; the save is blocked either way.
- cp7 reviewer A NOTE: the product-form case "never hides type or name" passes without the host-required guard (no hidden list names them); form-definition.test.ts covers the guard.
- cp8 reviewer A NOTE: core `BuiltinFieldProps` has no `onBlur`, so in edit mode (`mode: 'onBlur'`) a malformed amount shows its message only at Save, not on blur (a core prop would fix it).
- cp8 reviewer A NOTE: `IncomeAccountField` draws an empty trigger when the value is '' (a book with no active Income account); a placeholder such as "Choose an income account" would help.
- cp8 reviewer A NOTE: `HostMoneyInput`'s typed text is not cleared on an outer reset; on native, Save without a blur can keep "1250" in place of "1,250.00" (cosmetic).
- cp9 reviewer A NOTE: Save and new resets to the type in the URL, not the type the form holds: choose Service, change Type to Non-inventory, Save and new → the next form is "New service". The spec ("resets to the starting values of the same type and stays on `products/new?type=<type>`") reads either way; a human decision at the eval gate.
- cp9 reviewer A NOTE: if the accounts query fails, `new?type=` shows its loading body for ever (`useFormAccounts` drops `isError`); needs a 4xx on the accounts read.
- cp9 reviewer A NOTE: the e2e helpers export `selectItems` and `purchasesSwitch`, which Produces did not list (harmless).
- cp9 fix review NOTE: without a currency, a NaN or ±Infinity amount now shows blank (formatMoney showed '—' with a warning); only a corrupt optimistic row reaches it.
- cp9 fix review NOTE: no unit case covers the blank branch for a no-currency, non-whole-cent amount.
- cp10 · bundle-1100: core `TableField` row actions sit top-aligned against 44 px inputs; the Qty "+" button sits ~8 px from the ↑ arrow; the column heads are inset 3-4 px and use a plain asterisk (the approved reference shows the same; a core follow-up if wanted).
- cp10 reviewer A NOTE: stored positions that are not dense are not renumbered (core `TableRowMapper` asks a host to); after a save that fails between a remove and the updates, "Save again" writes nothing and a later added row can share a position, so rows may show in the wrong order. Fix: an update for each kept row whose stored position is not its index.
- cp10 reviewer A NOTE: `useIsShowingNewRecord` matches any `products/new` URL; a user who opens New again during an in-flight bundle create can be moved to the bundle (and lose what they typed) when a row is refused.
- cp10 reviewer A NOTE: a partial create that fails on the network reads "The bundle was saved, but an item was not: Your change wasn't saved: the server could not be reached." (the plan's text).
- cp10 reviewer A NOTE: an edit row refused after the user left shows "The product was not saved." with no item number, though the record and earlier rows landed (cp3 code).
- cp10 reviewer A NOTE: a Service or Non-inventory product's edit runs a bundle-items query and subscription that always returns 0 rows.
- cp10 reviewer A NOTE: after a refused row, "Save again" sends the dirty record columns again (a harmless duplicate PATCH).
- cp10 reviewer A NOTE: no test drives "the user left the new form before a row was refused, so they are not moved" (declared in the spec header and the carry note).
- cp10 reviewer B NOTE: e2e test 4 has no comment saying why it runs at phone size (core `TableField` cards and the one-column form below 640 px).
- cp11 · delete-refused-phone-390: the Delete button is captured in its hover tint (the pointer stays on it after the click in a bottom sheet); a capture artefact.
- cp11 · delete-refused-phone-390-dark: core `Button` dark destructive resting vs hover is a large step (resting reads as the danger colour at about two-thirds opacity); shared by every delete dialog.
- cp11 · list-390: the phone FAB covers the row menu of the card under it; confirm the card list has a bottom inset of the FAB's height so the last card's menu is reachable (the reference shows the same).
- cp11 reviewer A NOTE: tests/help-products-services.test.ts checks editing only with `/\bedit\b/i`, which a heading alone passes.
- cp8 reviewer B NOTE: the money input's border does not turn red on a refusal (core `TextInput` does); core `BuiltinFieldProps` has no `error` prop, so a fix needs a core change. The message under the input still shows.

## Out-of-plan changes
- docs/plans/products-services-checkpoints.md (cp3): driver edit, e2e ports 7200/7201 → 7230/7231 (the lane moved; human, 2026-10-30)
- docs/plans/products-services-evidence/cp6/capture.json (cp7): biome format, whitespace only (cp6 committed it unformatted)
- tinycld/books/lib/expense-account-options.ts, tinycld/books/lib/account-options.ts (cp7): `filteredAccountOptions` extracted so income and expense options share one body (reviewer B, lesson 13)
- tinycld/books/lib/product-list.ts, tests/product-list.test.ts (cp9): money text for a row with no `currency` (carried from cp6 reviewer A)
- docs/plans/products-services-checkpoints.md (cp10): driver plan edit — test 4's inactive step and "(inactive)" check moved to checkpoint 11 test 7 (the row menu is built there); a stale fixture type name in checkpoint 4 text reworded so plan-check passes

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
- commit: 485548e

## Checkpoint 6
- test writer: tests/product-route.test.ts, tests/product-list.test.ts, tests/product-display.test.ts (new), tests/shell-nav.test.ts (products list entry right after vendors); red for the right reason: yes (missing modules; shell-nav entry undefined); the Retry bullet has no new test (the shared vendor list spec drives `retryListQuery`, plan review A8); untestable: none
- implementer: `product-route`, `product-list`, `product-display`, `useProductNavigation`, `useProductsQuery`, `ProductsList` / `ProductRow` / `ProductCard`, `screens/products/_layout` + `index`, `RecordListFrame` title `min-w-0 shrink` (G8), shell-nav `products` entry; DONE
- test disputes: none
- self-declared differences: `SkuText` / `MoneyCell` local helpers; row height `PRODUCT_ROW_HEIGHT` without PartyRow's `minHeight: 44`; narrow `Pick` parameter types; two "why" comments
- gate 1: tests unedited: yes · pass (check 3084; guard customer-form:|vendor-form: 36 passed)
- gate 2: invalid shots: none (16 shots; the capture spec gained `fakeRecords` for the empty / all-inactive / error states, aborting realtime on that page) · blocking: none · notes: 2 (Design notes); money right-aligned within 1 px of its header; the 560 px sideways scroll is not observable at 1280 (falls to cp9's panel capture)
- gate 3 A (correctness): no BLOCK; NOTEs: product row / New targets show "Page not found" until cp9 adds the routes (planned); optimistic insert has no `currency` so the money helpers would print "undefined" → carried to cp9 as a requirement (staging cp/carry-notes.md); money header cells lack `tabular-nums` (labels are words) → Design notes
- gate 3 B (conformance): no findings
- fix review: n/a
- gate 3 A notes: 3 (Design notes / carried)
- reviewer-caught deferrals: none
- commit: b5003a7

## Checkpoint 7
- test writer: tests/form-definition.test.ts, product-form.test.ts, product-columns.test.ts, product-defaults.test.ts, income-account-options.test.ts, bundle-items.test.ts, money-input.test.ts (new); guard opening-balances.test.ts unchanged and green; red for the right reason: yes (missing modules); fixtures checked against real core `hostDefSchema` / `definitionSchema` / `tableRowsOf`; untestable: none
- implementer: `form-definition` (`hideBuiltins`, `requireBuiltins`), `product-form`, `product-columns`, `product-defaults`, `income-account-options`, `bundle-items`, `money-input` (`MONEY_VALUE_SCHEMA`, `moneyFieldValue`, …), `centsToText` moved to `money.ts` (re-exported by opening-balances), `moneyTextSchema`; DONE
- test disputes: none
- self-declared differences: `MONEY_VALUE_SCHEMA` says "Too large" only for well-formed text the Books currency cannot parse (other-currency text such as `€5` gets the malformed message; accepted, the agreed contract said `isWellFormedMoney` alone); whitespace-only input → 0 (as `amountCents`); a bundle with malformed money text sends no price key; `host` argument on `hideBuiltins` / `productDefinitionFor` (Decisions, not the spec's Libs line); a comment on the re-export
- gate 1: tests unedited: yes · pass (check 3146)
- gate 2: n/a
- gate 3 A (correctness): no BLOCK; NOTEs: very long other-currency text still says "Too large" (save blocked, nothing wrong written); the product-form "never hides type or name" case cannot fail on its own (form-definition.test.ts covers the guard); cp6 capture.json reformat → Design notes / Out-of-plan
- gate 3 B (conformance): 1 cp6 capture.json reformat → recorded under Out-of-plan changes; 2 money schema contract deviation → accepted (declared difference above); 3 `Intl.supportedValuesOf` unguarded on a new native save path → accepted+fixed (falls back to `legacyPattern`; a fresh test writer added the failing test first); 4 income options copied expense options (lesson 13) → accepted+fixed (`filteredAccountOptions` in account-options.ts; expense-account-options.ts changed, Out-of-plan); 5 comment restated the name → says why
- fix review: round 1: clean · NOTE comment named the wrong pattern → corrected (comment only) · gate 1 after: check 3147, vendor-form: 12 passed
- gate 3 A notes: 2 (Design notes)
- reviewer-caught deferrals: none
- commit: d3ea96c

## Checkpoint 8
- test writer: tests/product-host.test.ts (new: host parse, columns, built-ins in order, rows table, chrome, layout and purchase rule, components, `ui.schemas.MoneyField`, the engine refusing malformed price text through `buildSchema`), tests/product-list.test.ts (picker limit, search, missing SKU); red for the right reason: yes (no `books:product` host, missing picker exports); the customer/vendor host guard passes; untestable: none
- implementer: `books:product` host (`PRODUCT_HOST_KEY`, layout, purchase rule), `ProductTypeField`, `BundleProductCell`, `MoneyField` + `HostMoneyInput`, `IncomeAccountField`, `ProductPicker` on `SearchPicker`, `productPickerOptions`, `ui.schemas.MoneyField = MONEY_VALUE_SCHEMA`; DONE
- test disputes: none
- self-declared differences: `HostMoneyInput` takes the core input look and `iosInputCenteringStyle(16)` with input props; the picker query in a local `usePickerProducts` hook (as CustomerPicker); `ProductTypeField` uses isVisible wrappers; the picker search term is trimmed
- gate 1: tests unedited: yes · pass (check 3163; guard customer-form:|vendor-form: 36 passed; `server/form_hosts.json` has `books:product`)
- gate 2: n/a (nothing renders a product form until cp9)
- gate 3 A (correctness): no BLOCK; NOTE 1 placeholder flash while a chosen product loads → accepted+fixed; NOTEs 2-4 → Design notes
- gate 3 B (conformance): 1 local query hook vs "Prefer inline queries" → rebutted (see Rebuttals); 2 `useStore` twice → accepted+fixed; 3 limit + 1 with no row left out → accepted+fixed (`limit(PRODUCT_PICKER_LIMIT)`); NOTE money input border not red on a refusal (core `BuiltinFieldProps` has no `error`) → Design notes
- fix review: round 1: clean · gate 1 after: check 3163
- gate 3 A notes: 3 (Design notes)
- reviewer-caught deferrals: none
- commit: dffa5af

## Checkpoint 9
- test writer: tests/product-display.test.ts (`productTitle`), tests/shell-nav.test.ts (`product` New action, Other column order, `hidesNewFab` for product pages), tests/product-list.test.ts (driver addition, carried from cp6 reviewer A: a row with no `currency` never renders "undefined"), tests/e2e/products-services-helpers.ts (new), tests/e2e/products-services-form.spec.ts (tests 1, 2, 5), tests/e2e/products-services-page.spec.ts (tests 10, 11); red for the right reason: yes (missing export / entries; e2e: no product page or not-found screen yet; "189.00 undefined"); untestable: none
- implementer: `product-form-store`, `useProductForm`, `ProductChild`, `ProductTypeChooser`, `screens/products/new.tsx` + `[id].tsx`, `PRODUCT_DETAIL_SCREENS` in the layout, `productTitle`, `product` New action and `hidesNewFab` for products; carried cp9 fix: a row with no `currency` formats its money without a code (`centsToText`); DONE
- test disputes: none
- self-declared differences: missing-currency money uses `centsToText` (helpers are pure; the staged case calls them without a currency); `new.tsx` picks its branches above one return with a local `NewProductLoading` (it needs `onLeave` / `backLabel`); a `fallback` const in `useProductForm`; chooser rows built from `PRODUCT_TYPES`
- gate 1: tests unedited: yes · pass (check 3176; e2e products-services: 5 + guard 36 = 41 passed)
- gate 2: invalid shots: none (12 shots; the capture spec gained `clickLabel` and `navigateInApp`) · blocking: none · every pair pixel-identical to its reference outside the cp11 row-menu cell; read-only references matched in code · notes: 1 (the 560 px sideways scroll needs a 1360 px capture → carried to cp11)
- gate 3 A (correctness): no BLOCK; NOTE test 2's income check could not fail on the seed → accepted (fresh test writer: picks 6200 expense before the type change and asserts it stays; shown to fail with defaults re-applied); NOTE test 10's error-summary check always true → accepted (removed; the list after save and the PATCH keys are the proof); NOTE missing-currency non-integer warning → fixed with B2; NOTEs Save and new resets to the URL type, accounts-query error leaves `new?type=` loading for ever, extra helper exports → Design notes
- gate 3 B (conformance): 1 product-list.ts + test out of the Files block → recorded (driver carry from cp6); 2 `formatMoney(cents, '')` sends an "invalid currency code" warning for a row that only lacks a currency → accepted+fixed (blank for a non-whole-cent amount without a currency)
- fix review: round 1: clean · NOTEs: NaN/Infinity without a currency now blank (was '—'); no unit case for the blank branch → Design notes · gate 1 after: check 3176, products-services: 5 passed
- gate 3 A notes: 4 (Design notes)
- reviewer-caught deferrals: none
- commit: 63aa64c

## Checkpoint 10
- test writer: tests/bundle-item-writes.test.ts (new), tests/e2e/products-services-bundle.spec.ts (tests 3 reorder, 4 phone, 12 partial create; local helpers); red for the right reason: tests 3 and 12 yes (no row writes, no partial-create toast), the unit file yes (missing module); test 4: plan defect — it made the item inactive through the product row menu, which checkpoint 11 builds, so checkpoint 10 could not make it green. Driver fix (2026-10-30, plan edited in both cp10 and cp11): test 4 keeps the phone cards / one column / clean Cancel; the "(inactive)" row label check moves into checkpoint 11's test 7 (its bundle now holds the item it makes inactive). A fresh test writer rewrites test 4. Not covered (carry note cp10): leaving the new form before a row is refused (e2e cap 12 of 12; no unit case named).
- implementer: `useBundleItems`, `lib/bundle-item-writes.ts`, `useProductForm` (tables + rows config; `onPartialCreate` shows the toast and routes only while `useIsShowingNewProduct()`), `useIsShowingNewRecord`, `useIsShowingNewProduct`; DONE
- test disputes: none
- self-declared differences: one `useStore` call for both collections; `refusalMessage` kept in a local; `navigation.leave`; `useBundleItems('')` returns rows [] / not ready with a null query; no unit test for `useIsShowingNewRecord` (none named)
- gate 1: tests unedited: yes (test 4 rewritten by a fresh test writer after the plan fix, before the implementer) · pass (check 3179; e2e products-services: 8 + guard 36 = 44 passed)
- gate 2: invalid shots: none (4 shots) · blocking: none · 1100 shots byte-identical to the reference, phone shots differ by sub-pixel anti-aliasing · notes: 3, all core `TableField` (Design notes)
- gate 3 A (correctness): no BLOCK; 7 NOTEs → Design notes
- gate 3 B (conformance): no findings; NOTE test 4 has no comment saying why it runs at phone size (a test file; Design notes)
- fix review: n/a
- gate 3 A notes: 7 (Design notes)
- reviewer-caught deferrals: none
- commit: 1e90aa0

## Checkpoint 11
- test writer: tests/product-display.test.ts (`productDeleteLines`), tests/help-products-services.test.ts (new), tests/e2e/products-services-actions.spec.ts (tests 6, 7 — 7 now checks the bundle row's "(inactive)"), tests/e2e/products-services-list.spec.ts (tests 8 wide, 9 phone); screen total 12 e2e tests; red for the right reason: yes for the unit cases, the help topic and tests 6-8 (no row menu, no help file); test 9 passes already — its cards, FAB and `hidesNewFab` shipped in cp6/cp9, the bullet adds nothing cp11 builds, so it stays as a regression guard (accepted); untestable: none
- implementer: `useProductActions`, `DeleteProductDialog`, `productDeleteLines`, the row menu on rows and cards in `ProductsList` (banner refusals, delete dialog), help/products-services.md, the navigating-books link; DONE
- test disputes: none
- self-declared differences: extra help sentences, each true of the build (read-only users, an item cannot become a bundle, Discard changes?, the income account is required, a bundle's delete removes its item list, the dialog counts the bundles, remove a row to take an item out); inactive items were already left out of the bundle picker and shown "(inactive)" since checkpoints 8-10
- gate 1: tests unedited: yes · pass (check 3205; e2e products-services: 12 + guard 36 = 48 passed)
- gate 2: invalid shots: none (14 shots, including `panel-narrow-1360`, carried from cp9) · blocking: none · every reference pair pixel-identical except the phone delete sheet's hover tint (a capture artefact) · all Decisions layout points pass, the 556 px column included · notes: 3 (Design notes)
- gate 3 A (correctness): no BLOCK; NOTE 1 custom-field help sentence lacked the per-form qualifier → fixed (help text); NOTE 2 navigating-books named only Customers and Chart of Accounts for All lists → fixed ("at the top of a list"); NOTE 3 the help test's edit check is weak → Design notes
- gate 3 B (conformance): no rule breaks; 1-2 copied e2e helpers (`escapeRegExp`, `exactText`, `accentOf`) → accepted+fixed by a fresh test writer (shared in record-form-helpers.ts; 11 affected e2e passed); 3 `openBooksAtDefaultViewport` copy → kept (it omits the resize on purpose); 4 untracked scratch route → finish.mjs deletes it
- fix review: round 1: BLOCK — the driver's navigating-books fix "All lists at the top of a list" is false for Journal entries (no link) → fixed (names the Chart of Accounts, Customers, Vendors and Products and services lists); the custom-field sentence clean · round 2: clean · gate 1 after: check 3205, e2e 48 passed, help tests 132 passed
- gate 3 A notes: 1 (Design notes)
- reviewer-caught deferrals: none
- commit: bc36cc7

## Eval-gate integration (2026-10-31)
- members pulled (core main b4b061e: server, docs, `@playwright/test` ~1.60 → ~1.64.1 with a newer Chromium), `pnpm install`, books origin/main fbe70d2 (#22, server and CI only) merged into the step branch (clean); check 3205, Go tests green
- feature e2e after the merge: bundle test 3 failed — root cause (probe, trace): a race in the shared e2e helper `openList` (record-form-helpers.ts): after Cancel → `router.dismissTo`, React removes the record screen 20-50 ms before expo-router's async `go(-1)` updates the URL; the helper read the URL once in that window and waited for a back control that a closed screen never shows. A user does not see it (the URL is right 20-50 ms later). Fixed by a fresh test writer: `openList` polls "a way-out control is visible, or the URL no longer names a record" (default timeout, no timeout change); the bundle spec asserts Cancel returns the URL to the list. The run then showed a second test race: customer and vendor search specs typed before core SearchPalette focused its input (one animation frame after the dialog shows); both now wait for focus. products-services: + customer-form: + vendor-form: 48 passed.
- full suite at caa708b: 227 passed, 1 failed, 1 skipped (the git-excluded capture spec). Failure: products-services-form test 2 — after Save, "list visible" passed at once (the desktop list stays mounted under the record page), so `openList` clicked `product-back` while the in-flight save had disabled it; the save left, the button detached, and the click waited to the 30 s test timeout. Test race, not a product defect. Fixed by a fresh test writer: `expectSavedToList` (URL leaves the record, then the list) after every save → navigate; `openList` never clicks a disabled leave control (waits until hidden or enabled). Reviewer-A fix pass: clean (NOTE: an in-flight save longer than the expect timeout now fails with a clear error). Targeted run: 48 passed.

## Revise 1 (eval gate, 2026-10-31)
- human decisions: Save and new keeps the saved type; a failed accounts read on `new?type=` shows an error with Retry (spec Defaults (Q7) and Save model Footer bullets updated). No local e2e (human); CI on PR #24 verifies.
- test writer: products-services-form.spec.ts — Save and new after Service → Non-inventory (POST type, URL `type=non_inventory`, title, Type, empty Name); accounts read 400 + reload → alert banner, `product-retry`, Retry mounts the form; red for the right reason: by trace (new.tsx reset-only path; endless `product-loading`); no hook test (e2e covers both)
- implementer: `useRecordSave` optional `onSavedAndNew(columns)` (after the reset, only while present); `useProductNavigation.switchNewType` (`router.setParams`); `useProductForm` switches when the saved type differs; `useFormAccounts` `isError` + `retry` (`recoverLiveQueries`); new.tsx error banner (`ListBanner`, prefix `product`); `PRODUCT_ACCOUNTS_LOAD_ERROR`; help updated
- review: 1 FIX accepted+fixed (failed `books.access` read also loaded forever → banner + `useBooksAccess.retry`, `PRODUCT_ACCESS_LOAD_ERROR`, union error props); NOTEs accepted+fixed: wrong `unrouteAll` comment → `page.unroute`, chooser uses `switchNewType`, docstring reflow
- fix review: 1 FIX accepted+fixed (no e2e for the access-error branch → access read 400 test added); otherwise clean
- check: 3205 vitest passed, biome + tsc clean

## Final review
- eval: revise (2026-10-31, "i accept all items"): approved, with both open decisions answered yes — (1) "Save and new" opens the next form with the type just saved, not the URL's type; (2) when the accounts query fails, the new-product page shows an error with Retry, not endless loading. Retro items 1-7 approved. Human: skip local e2e, CI verifies (PR #24).
- native: not executed in this run
