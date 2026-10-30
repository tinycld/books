# vendor-form — helix run ledger

- mode: unattended
- unit: p3-vendors
- started: 2026-10-29
- package branch: books/p3-vendors (from main 3c32b22)   core checkout: main 12759a7
- spec: docs/specs/vendor-form-design.md
- checkpoints: docs/plans/vendor-form-checkpoints.md
- reference: docs/plans/vendor-form-reference/
- evidence: docs/plans/vendor-form-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/vendor-form-capture.json
- review mode: C — none (unattended)
- core extension: checkpoint 0 on core branch books/p3-vendors (from main 12759a7) — the schema generator types a non-required single `select` with `''` (TS `| ''`, zod `.or(z.literal(''))`), so `books_vendors.terms` can be cleared to None through pbtsdb; human chose it 2026-10-30
- sparks:
  - form reads as a few short titled groups → dropped (packet Q6: one page, as the Customer form; artboard C not picked)
  - related short fields side by side on a wide form → expressible (core host `layout.fields[key].width: 'half'`, core #378 merged: first + last name, email + phone, mobile + website, payment terms + account number)

## Deferrals
(none yet)

## Rebuttals
(none yet)

## Design notes
(none yet)

## Out-of-plan changes
(none yet)

## Phase notes
- phase 1: design packet staged 2026-10-26 (`~/tmp/tinycld/auto-helix-books/staging/p3-vendors/packet.md`), rechecked 2026-10-29 against books main 3c32b22 and core 12759a7 and kept.
- phase 3: design gate approved 2026-10-29: direction A (the built p2-customers pattern); open questions 1-13 accepted as recommended (1 panel at a 1360 px window via `useDetailSurface`; 2 list stays usable beside the panel on web and native; 3 native-stack push via `detailScreenOptions`; 4 shared party-list columns, 540 px minimum, cards on phones; 5 hidden `name_key` + unique index, shared Go `nameKey`; 6 one page with half-width pairs; 7 extract the twelve shared parts and move customers onto them unchanged; 8 payment terms Due on receipt / Net 10 / 15 / 30 / 60 as a `select`; 9 Account number text max 100; 10 expense account `SelectInput` without A/R and A/P, checked server-side only on change; 11 vendors do not use drawer-placement; 12 every vendor delete allowed in this unit; 13 build from main 3c32b22, carrying `ViewInstance`, `useTableMinWidth` and explicit `queryKey`). Platform item 1 (no slide on web) signed off explicitly.
- phase 3 pass 2 (2026-10-29): fixture `tinycld/books/lib/vendor-form-fixture.ts` (22 vendors, 2 inactive, every term + none, long values; local `VendorRecord` until the migration checkpoint), scratch route with 16 states, reference `docs/plans/vendor-form-reference/` (23 shots × light/dark) from `docs/plans/vendor-form-capture.json`; capture spec copied from p2-customers' improved copy plus a `hideLabel` action (the scratch URL shows the Books New FAB that `hidesNewFab` hides on a real vendor page). Driver decisions: (1) the seeded e2e book has seed.ts ACCOUNTS (1000, 1100, 1500 Equipment, 2100, 3000, 4000, 6100 Rent, 6200, 6210, 6900 inactive), not the starter chart, so the migration checkpoint re-keys the fixture's default expense accounts to seed.ts numbers (6900 gives the "stored account became inactive" edge, 1500 a non-expense account); (2) Account number's help text needs a Books host component `AccountNumberField` (core host built-ins carry no description); (3) core gap for the human, not fixed here: `bg-danger-soft` / `border-danger-soft-foreground` are not defined in tinycld/global.css, so core FormErrorSummary and the Books banners draw with no colour.
- phase 4 plan review 1 (2026-10-30): findings A1-A11, B1-B2, C1-C7, D1-D19, E1 and F1-F3 fixed in the plan. Driver decision D: every customer piece the vendor files would copy is extracted in checkpoints 1-4 (found by diffing the customer screens, hooks, libs, forms, Go guards and search, Go tests and e2e helpers and spec helpers against what the vendor files need), and Customers move onto it with the `customer-form:` specs as the guard. Human decision: checkpoint 0 in core (the schema generator types a non-required single select with `''`), so `terms` "None" writes `''` with no cast. E2E budget 12 of 12.
- phase 4 plan review 2 (2026-10-30): A1-A8, B1-B5, C1-C10, E1-E5 and F1-F4 fixed in the plan (A7 by naming core's canvas.test.tsx and use-form-edit.test.tsx; E5 takes the refusal rule into `useRecordRowMenus`, and the dialogs keep their no-record `null` as the visibility pattern). A9 rejected: closing the Delete dialog clears that record's refusal (CustomersList.tsx:318-321) and the dialog cannot close while the delete runs (DeleteCustomerDialog.tsx:107-109), so a delete refusal never reaches the banner. E2E budget still 12 of 12.
- review mode switches: none

## Final review
- eval:
- native: not executed in this run
