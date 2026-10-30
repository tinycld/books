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
(none yet)

## Out-of-plan changes
(none yet)

## Phase notes
- phase 1: intake and the first design gate ran 2026-10-29 in lane reports (packet against books 3c32b22, core 12759a7): direction A, Q1-Q18 accepted as recommended, platform item 1 (no slide on web) signed off; the unit then waited for p3-vendors. Look-ahead packet regenerated 2026-10-30 against books/p3-vendors 2208ad9, core 5217753; kept by the discard rule at books 91ce648, core 1bda334.
- phase 3: design gate 2026-10-30 approved ("A - accept recommendations on questions as well"): direction A; open questions G1-G9 accepted as recommended (recorded in the spec's Design decisions): G1 `titleOf` + `{ id, inactive }` row menus; G2 widen `useRecordList` / `partyListViewState`; G3 extract `RecordListFrame` / `ListTable` / `ListCards`; G4 extract `SearchPicker`; G5 `forms/account-fields.tsx` with exported `HostSelect`, key `books.form.accounts`; G6 `validateExpenseAccount` takes its message; G7 no new seed accounts; G8 shrinking list title; G9 list not paged (p2-books-fts-search converts all three lists). Artboards: staging/p2-products-services/artboards.html (direction A boards).
- phase 3 pass 2 (2026-10-30): fixture `lib/products-services-fixture.ts` (24 products, 14 bundle rows, local `ProductRecord`/`BundleItemRecord` until the migration checkpoint); scratch route with 20 states; reference captured in `docs/plans/products-services-reference/` (19 shots, light + dark); no spark dropped. Driver decisions on the reference agent's open points: (1) the phone search placeholder truncates in the shared `ListToolbar` — keep the spec text, a design NOTE; (2) bundle Qty column width follows core `TableField` unless the plan finds a column-width option; (3) the error banner's `bg-danger-soft` is undefined — known core gap from p3-vendors, out of scope (core); (4) the plan fixes `PRODUCT_COLUMNS` (Name min 160, Type 120, money 112 each, menu 44; 560 px table) and `productCardHeight` (24 + 20 + 16 per extra line) as drawn in the reference. Capture spec additions: `hideLabels`, each shot loads at its first width.
- phase 4 (2026-10-30): plan written (11 checkpoints; plan-check --unattended exit 0). Driver decisions: Name column min 148 (sum 560 with padding); income account required is display only with no inline message; test 10 alone reads and writes the seeded laptop. The plan writer found that core validates a custom built-in as `z.unknown()` (core lib/forms/values.ts `anySchema`), so `MoneyField` cannot block Save on malformed text. Human chose (2026-10-30) "Core host schemas": checkpoint 0 in core adds an optional per-component zod schema on `FormHostUi` that `buildSchema` applies to custom built-ins; its PR merges before checkpoint 1; no `exclusive` (an added optional prop).
- phase 4 plan review (2026-10-30; findings in staging cp/plan-review.md): A 12, B 4, C 4, D 4, E 4, F 3. All fixed except F2 (rejected: splitting the chooser from the form page leaves `new.tsx` with no form branch, so test 1's one goal could not pass gate 1 on the first half; right-sizing rule). A8, A10, E4 accepted as the existing pattern. Checkpoint 0 (core host schemas) added; 12 e2e tests of 12 (cp9: 1, 2, 5, 10, 11; cp10: 3, 12, 4 phone; cp11: 6, 7, 8 wide, 9 phone). plan-check --unattended exit 0. Review mode C.
- review mode switches: none

## Final review
- eval:
- native: not executed in this run
