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
- **finding:** reviewer B, checkpoint 3: "`tinycld/books/lib/customer-actions.ts:8`: the `CustomerMenuItem` export is now used only inside its own file."
  **rebutted because:** it is the key type of two exported constants in that file (`export const CUSTOMER_MENU_LABELS: Record<CustomerMenuItem, string>` and `export const CUSTOMER_MENU_TEST_IDS: Record<CustomerMenuItem, string>`), and the checkpoint's Produces names it; a caller that reads those maps names their key type.
- **finding:** reviewer B, checkpoint 3: "`tinycld/books/hooks/useRecordRowMenus.ts:9`: `RecordRowMenusConfig` is exported, but only its own file uses it … Fix: make it file-local."
  **rebutted because:** it is the parameter type of the exported hook (`config: RecordRowMenusConfig<R, I>`, useRecordRowMenus.ts:35), which the vendors list calls in a later checkpoint; an exported function's parameter type stays nameable by its callers.

## Design notes
- cp0 reviewer A NOTE: `lib/account-register-fixture.ts:39` and `lib/setup-wizard-fixture.ts:19` keep `'' as BooksSettings['ownership']`; the type now holds `''`, so the casts do nothing. Driver: remove both in checkpoint 1 (books branch), listed under Out-of-plan changes then.
- cp0 reviewer A NOTE: a select with no `Values` would generate `name:  | ''` (and `z.enum([])`, already invalid before this change); no migration has one.
- cp1 reviewer A NOTE: `lib/account-register-fixture.ts:38` `SETTINGS` uses `satisfies`, so with the cast gone `typeof SETTINGS` types `ownership` as `''`, not the union; `tests/register-realtime.test.ts:155` types its parameter from it. Tighter, not weaker; tsc passes.
- cp1 fix review NOTEs: `server/names.go` nameKey comment now has two colons in one sentence and an early line break; the new no-join alias comment in `searchParties` partly repeats the `withParent` branch comment.
- cp2 reviewer A NOTE: `lib/record-refusals.ts` and `lib/record-save.ts` import each other; the record-refusals → record-save import is type-only (`RefusalForm`, which the checkpoint puts in record-save), so it is safe at runtime.
- cp3 fix review NOTE: `DeleteCustomerDialog` `linesOf` now drops a line with an empty display name too (the old dialog showed the name with no condition); the server requires a display name, so no user reaches it.

## Out-of-plan changes
- cp1: `tinycld/books/lib/account-register-fixture.ts`, `tinycld/books/lib/setup-wizard-fixture.ts` — removed the `'' as BooksSettings['ownership']` casts and their now-false comments, since core #397 types the field with `''` (cp0 reviewer A NOTE).

## Phase notes
- phase 1: design packet staged 2026-10-26 (`~/tmp/tinycld/auto-helix-books/staging/p3-vendors/packet.md`), rechecked 2026-10-29 against books main 3c32b22 and core 12759a7 and kept.
- phase 3: design gate approved 2026-10-29: direction A (the built p2-customers pattern); open questions 1-13 accepted as recommended (1 panel at a 1360 px window via `useDetailSurface`; 2 list stays usable beside the panel on web and native; 3 native-stack push via `detailScreenOptions`; 4 shared party-list columns, 540 px minimum, cards on phones; 5 hidden `name_key` + unique index, shared Go `nameKey`; 6 one page with half-width pairs; 7 extract the twelve shared parts and move customers onto them unchanged; 8 payment terms Due on receipt / Net 10 / 15 / 30 / 60 as a `select`; 9 Account number text max 100; 10 expense account `SelectInput` without A/R and A/P, checked server-side only on change; 11 vendors do not use drawer-placement; 12 every vendor delete allowed in this unit; 13 build from main 3c32b22, carrying `ViewInstance`, `useTableMinWidth` and explicit `queryKey`). Platform item 1 (no slide on web) signed off explicitly.
- phase 3 pass 2 (2026-10-29): fixture `tinycld/books/lib/vendor-form-fixture.ts` (22 vendors, 2 inactive, every term + none, long values; local `VendorRecord` until the migration checkpoint), scratch route with 16 states, reference `docs/plans/vendor-form-reference/` (23 shots × light/dark) from `docs/plans/vendor-form-capture.json`; capture spec copied from p2-customers' improved copy plus a `hideLabel` action (the scratch URL shows the Books New FAB that `hidesNewFab` hides on a real vendor page). Driver decisions: (1) the seeded e2e book has seed.ts ACCOUNTS (1000, 1100, 1500 Equipment, 2100, 3000, 4000, 6100 Rent, 6200, 6210, 6900 inactive), not the starter chart, so the migration checkpoint re-keys the fixture's default expense accounts to seed.ts numbers (6900 gives the "stored account became inactive" edge, 1500 a non-expense account); (2) Account number's help text needs a Books host component `AccountNumberField` (core host built-ins carry no description); (3) core gap for the human, not fixed here: `bg-danger-soft` / `border-danger-soft-foreground` are not defined in tinycld/global.css, so core FormErrorSummary and the Books banners draw with no colour.
- phase 4 plan review 1 (2026-10-30): findings A1-A11, B1-B2, C1-C7, D1-D19, E1 and F1-F3 fixed in the plan. Driver decision D: every customer piece the vendor files would copy is extracted in checkpoints 1-4 (found by diffing the customer screens, hooks, libs, forms, Go guards and search, Go tests and e2e helpers and spec helpers against what the vendor files need), and Customers move onto it with the `customer-form:` specs as the guard. Human decision: checkpoint 0 in core (the schema generator types a non-required single select with `''`), so `terms` "None" writes `''` with no cast. E2E budget 12 of 12.
- phase 4 plan review 2 (2026-10-30): A1-A8, B1-B5, C1-C10, E1-E5 and F1-F4 fixed in the plan (A7 by naming core's canvas.test.tsx and use-form-edit.test.tsx; E5 takes the refusal rule into `useRecordRowMenus`, and the dialogs keep their no-record `null` as the visibility pattern). A9 rejected: closing the Delete dialog clears that record's refusal (CustomersList.tsx:318-321) and the dialog cannot close while the delete runs (DeleteCustomerDialog.tsx:107-109), so a delete refusal never reaches the banner. E2E budget still 12 of 12.
- review mode switches: none

## Checkpoint 0
- test writer: core/server/coreserver/schema_gen_test.go (TestSchemaGenSelectFieldTypes, TestSchemaGenZodOptionalSelectLines); red for the right reason: yes (size/kind TS lack `| ''`, zod lacks `.or(z.literal(''))`; shade/tags/labels pass as pinned unchanged behavior); untestable: none
- implementer: schema_gen.go single-select branches of tsFieldType and zodFieldType; DONE. No member tsc fix needed (pkg:check green over all 10 members). It re-ran core's tests/scripts/scaffold-search-stubs.ts to refresh the local search-alpha/search-beta stubs (TS5101 `baseUrl`; the stubs predate the script's patchTsconfig); no repo file changed.
- test disputes: none
- self-declared differences: none
- gate 1: tests unedited: yes · pass (driver re-ran: core tinycld-pkg check, go test TestSchemaGen*, pkg:check, check:core-isolation; pbSchema.ts:474 `ownership: 'owners' | 'corporation' | ''`)
- gate 2: n/a (nothing renders)
- gate 3 A (correctness): no BLOCK; 2 NOTEs (see Design notes)
- gate 3 B (conformance): nothing found (check:core-isolation pass, gofmt clean, docs say nothing about select typing)
- fix review: n/a (no fix touched source)
- gate 3 A notes: 2, listed under Design notes
- reviewer-caught deferrals: none
- commit: tinycld e786fe5 (core PR https://github.com/tinycld/tinycld/pull/397)
- human: approved 2026-10-30; core PR #397 merged (8a2e182) after a main merge (0db2009); workspace synced and reinstalled

## Checkpoint 1
- test writer: tests/record-route.test.ts; red for the right reason: yes (`Cannot find module '../tinycld/books/lib/record-route'`); untestable: none (no new Go test by the checkpoint)
- implementer: names.go, address.go, guards.go, party_helpers_test.go, record-route.ts, useRecordNavigation.ts created; customers.go/_test.go, search.go, errors.go, customer-route.ts, useCustomerNavigation.ts, customers/_layout.tsx, address.ts, host-value-schemas.ts moved onto them; DONE
- test disputes: none
- self-declared differences: unused `tests` import removed from customers_test.go; shared comments reworded generically (partyHitTitle, partySource, new server files, runRulesByLevel, requireNameKeyHidden, lib/address.ts); msgAddressShape comment line (gofmt re-aligned msgDeleteHasSubs); useOpenRecord one-line comment; useIsShowingCustomer an arrow const per Do 8
- gate 1: tests unedited: yes · pass (driver: tinycld-pkg check, go test ./...; implementer's customer-form e2e guard 24 passed)
- gate 2: n/a (nothing new renders)
- gate 3 A (correctness): no BLOCK; NOTEs: ledger Out-of-plan list (already filled); names.go nameKey comment wording (accepted+fixed, one-line comment); searchParties c. alias comment for the no-join branch (accepted+fixed, one-line comment); account-register-fixture `satisfies` narrows typeof SETTINGS.ownership to '' (Design notes)
- gate 3 B (conformance): out-of-plan fixture files (accepted: the cp0 driver item, listed under Out-of-plan changes); search.go partyHitTitle comment named customerLabel in shared code (accepted+fixed)
- fix review: round 1: clean (no BLOCK) · NOTEs to Design notes: nameKey comment has two colons and an early line break; the new no-join alias comment partly repeats the withParent one
- gate 3 A notes: 1, listed under Design notes
- reviewer-caught deferrals: none
- commit: 7357429
- human: n/a (review mode C)

## Checkpoint 2
- test writer: tests/record-save.test.ts, tests/record-refusals.test.ts, tests/record-display.test.ts; red for the right reason: yes (each `Cannot find module` of its new lib); untestable: none (moved components/hooks guarded by customer e2e, per the checkpoint)
- implementer: 12 shared parts created (RecordSurface, RecordNotFound, RecordByIdScreen, RecordChild, useRecordForm, useRecordSave, record-save, record-refusals, record-display, record-columns, record-form-store, contact-fields); CustomerSurface renamed to RecordSurface, CustomerNotFound deleted; customer files moved onto them; DONE
- test disputes: none
- self-declared differences: useRecordForm return type inferred; useEscapeToLeave takes testIdPrefix (shortcut id + description); customer-only refusal comment stays above customerRefusalHandler; RecordChild doc says the caller holds the form; RecordByIdScreen tests `record !== undefined` (generic R); renderCustomer takes BooksCustomers; CUSTOMER_SAVE_FAILED replaces local CLIENT_SAVE_FAILED; biome --write on 6 own files
- gate 1: tests unedited: yes · pass (driver: tinycld-pkg check; implementer's customer-form guard 24 passed)
- gate 2: n/a (nothing new renders)
- gate 3 A (correctness): no BLOCK; NOTEs: screens/customers/[id].tsx repeats RecordByIdScreen's delete-snapshot doc comment (accepted+fixed: cut to its first line); record-refusals.ts ↔ record-save.ts import each other, the record-refusals side type-only (Design notes)
- gate 3 B (conformance): no rule broken; NOTE the same repeated doc comment (accepted+fixed)
- fix review: round 1: clean
- gate 3 A notes: 1, listed under Design notes
- reviewer-caught deferrals: none
- commit: aa92e91
- human: n/a (review mode C)

## Checkpoint 3
- test writer: tests/record-menu.test.ts; red for the right reason: yes (`Cannot find module '../tinycld/books/lib/record-menu'`); untestable: none (moved hooks/components guarded by tests/customer-actions.test.ts and the customer e2e specs, per the checkpoint)
- implementer: record-menu.ts, RecordRowMenu.tsx (renamed from CustomerRowMenu.tsx), useRecordActions.ts, useRecordRowMenus.ts, DeleteRecordDialog.tsx; customer-actions.ts, useCustomerActions.ts, DeleteCustomerDialog.tsx, CustomersList.tsx moved onto them; DONE (stopped by the driver afterwards, see gate 1)
- test disputes: none
- self-declared differences: useRecordRowMenus.ts builds the menu with createElement (plan names a .ts file); reportUnexpected takes logContext; shared test-id comment moved to recordMenuTestIds, RECORD_MENU_WRITES one-line comment; DeleteCustomerDialog local linesOf drops an invisible or null line; DeleteRecordDialog keys lines by `tone:text` (biome no-index-key); useIsShowingCustomer export unused but kept
- gate 1: tests unedited: yes · fail → the implementer reported "24 passed (2.2m)" but its log read "3 failed, 21 passed": its log-pattern wait ended early and it stopped the 7200/7201 servers while Playwright still ran (tests 23-24 ERR_CONNECTION_REFUSED, 22 a toHaveURL miss in the same window) → driver stopped the agent and ran the guard to process exit → 24 passed (1.6m); tinycld-pkg check green
- gate 2: n/a (nothing new renders)
- gate 3 A (correctness): no BLOCK; NOTEs accepted+fixed: linesOf dropped only null text (old ErrorLine dropped falsy) → drops falsy; DeleteRecordDialog `tone:text` key could repeat (a name equal to the unsaved warning) → `key` field on DeleteDialogLine naming the line's role; duplicate `Confirm` type → exported `DeleteDialogConfirm`; dead useIsShowingCustomer → deleted
- gate 3 B (conformance): no rule broken; dead exports: useIsShowingCustomer (deleted), SERVER_UNREACHED/CustomerRefusal re-exports in useCustomerActions (deleted); CustomerMenuItem and RecordRowMenusConfig rebutted (see Rebuttals)
- fix review: round 1: clean · NOTE to Design notes: linesOf now also drops an empty display name (the server requires one). Gate 1 after fixes: tinycld-pkg check green, customer-form guard 24 passed (1.7m). Plan revised for checkpoint 10: DeleteDialogLine gains `key`, DeleteDialogConfirm exported; vendorDeleteLines keys name/explanation/unsaved/refusal and drops an empty refusal. plan-check: 8 errors, all in done checkpoints 1-2 (names those checkpoints removed); none in 3-10.
- gate 3 A notes: 1, listed under Design notes
- reviewer-caught deferrals: none
- human: n/a (review mode C)

## Final review
- eval:
- native: not executed in this run
