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
- **finding:** reviewers A and B, checkpoint 4: "`menuItem` and `chooseFromMenu` now take `item: string` … so tsc no longer catches a misspelled menu item in a customer test body."
  **rebutted because:** tsc never checked the specs: books `tsconfig.json` has `"include": ["tinycld/**/*.ts", "tinycld/**/*.tsx"]` and `"exclude": [… "tests/**/*.spec.ts"]`, so the deleted `MenuItem` union caught no misspelling before this change either. The gap is the tsconfig, raised as a retro check item.

## Design notes
- cp0 reviewer A NOTE: `lib/account-register-fixture.ts:39` and `lib/setup-wizard-fixture.ts:19` keep `'' as BooksSettings['ownership']`; the type now holds `''`, so the casts do nothing. Driver: remove both in checkpoint 1 (books branch), listed under Out-of-plan changes then.
- cp0 reviewer A NOTE: a select with no `Values` would generate `name:  | ''` (and `z.enum([])`, already invalid before this change); no migration has one.
- cp1 reviewer A NOTE: `lib/account-register-fixture.ts:38` `SETTINGS` uses `satisfies`, so with the cast gone `typeof SETTINGS` types `ownership` as `''`, not the union; `tests/register-realtime.test.ts:155` types its parameter from it. Tighter, not weaker; tsc passes.
- cp1 fix review NOTEs: `server/names.go` nameKey comment now has two colons in one sentence and an early line break; the new no-join alias comment in `searchParties` partly repeats the `withParent` branch comment.
- cp2 reviewer A NOTE: `lib/record-refusals.ts` and `lib/record-save.ts` import each other; the record-refusals → record-save import is type-only (`RefusalForm`, which the checkpoint puts in record-save), so it is safe at runtime.
- cp3 fix review NOTE: `DeleteCustomerDialog` `linesOf` now drops a line with an empty display name too (the old dialog showed the name with no condition); the server requires a display name, so no user reaches it.
- cp4 reviewer B: `CUSTOMER_ROW_HEIGHT` and `isShownLine` (customer-display re-exports) are read only by the git-excluded scratch route; when finish.mjs deletes it they have no importer.
- cp5 implementer: the git-excluded scratch route reads `FIXTURE_ACCOUNTS[].parent` as an `a<number>` id, but it is now an account key, so Design Tools loses its indent in the mockup only (the route is deleted before the PR).
- cp7 reviewer A NOTE: `useVendorsQuery` returns `query.data ?? []`, a new array each render before the query is ready, so the `useRecordList` memo reruns; customers do the same and the cost is small.
- cp7 reviewer B: the merged customer specs (`tests/e2e/customer-form-*.spec.ts`) have the same phone loops over steps whose code is the same at both sizes; the vendor spec was fixed, the customer specs were left unchanged as the extraction guard (for the human).
- cp8 critic NOTE: the Account number hint sits about 6 px closer to its input than the reference.
- cp8 reviewer A NOTE: `ExpenseAccountField` reads `data ?? []`, so while the accounts load or after a refused load the trigger of a stored account is blank and the menu offers only "None", with no message.
- cp7 critic NOTE: on phones the Books New FAB covers the right end of the vendor card rows under it (a reference decision).
- cp7 critic NOTE: the phone empty state shows three ways to add a vendor (header button, empty-state button, FAB) (reference and spec decision).
- cp5 fix review NOTE: `lib/vendor-messages.ts` line 1 says its strings mirror server refusals, but the file also holds client-only texts (`VENDOR_DISCARD_MESSAGE` and others).

## Out-of-plan changes
- cp1: `tinycld/books/lib/account-register-fixture.ts`, `tinycld/books/lib/setup-wizard-fixture.ts` — removed the `'' as BooksSettings['ownership']` casts and their now-false comments, since core #397 types the field with `''` (cp0 reviewer A NOTE).
- cp5: `pb-migrations/2100000002_create_books_ledger.js`, `pb-migrations/2100000003_create_books_customers.js` — comment only: the rule-constant source named the wrong migration (cp5 reviewer B); unreleased migrations, no schema change.
- cp8: `docs/plans/vendor-form-evidence/cp7/capture.json` — biome format only (`"widths": [1280]` on one line); the driver committed it unformatted in cp7, and it blocked the cp8 check.
- cp8: `tests/e2e/customer-form-actions.spec.ts` — step (8) "deleted in another tab" moved to desktop only (a phone run of the same code is a duplicate, CLAUDE.md); both desktop-only comments now give that reason. Made by the step 10 implementer (not a test writer), checked by the fix review.
- cp8: `tinycld/books/lib/account-options.ts` — options carry `indent` instead of leading spaces, so the journal entry form's account pickers also get a plain trigger and an indented menu (core #399).
- cp8a (core): `docs/overlays.md` — the Menu.Item prop list names the new `indent` (cp8a reviewer B).

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
- commit: 2399cfe
- human: n/a (review mode C)

## Checkpoint 4
- test writer: tests/party-list.test.ts (24 tests); red for the right reason: yes (`Cannot find module '../tinycld/books/lib/party-list'`; assertions proved once against a temporary shim over today's customer functions, then deleted); untestable: none
- implementer: party-list.ts, list-query.ts, useRecordList.ts, ListBanner/ListToolbar (renamed from the customer ones), ListEmptyState, components/party/{PartyRowParts,PartyRow,PartyCard,PartyList}, tests/e2e/record-form-helpers.ts; CustomerRow/CustomerCard/CustomersEmptyState deleted; customer-display, customer-tree, useCustomersList, useCustomersQuery, CustomersList, helix-mockup, customer-form-helpers and the five customer spec tops moved onto them; DONE
- test disputes: none
- self-declared differences: actions spec local MENU_ITEMS/MenuItem removed (shared menuItem/chooseFromMenu take `item: string`); openBooksPage `intercept` returns Promise<unknown> (a list spec passes page.route, which resolves to a Disposable; the old local copy had the same type error, unseen because tsc does not cover specs); PANEL_WIDTH moved into record-form-helpers.ts; NewCustomerValues a type alias from customers.create; parent-picker comment in useCustomersQuery; PARTY_ROW_CLASS in party-list.ts; PartyListCopy exported from PartyList.tsx; locals renamed search→input, open→openGate
- gate 1: tests unedited: yes · pass (driver: tinycld-pkg check; every customer spec change above its first test.describe; implementer's foreground guard 24 passed (1.7m))
- gate 2: n/a (nothing new renders)
- gate 3 A (correctness): no BLOCK; NOTEs: menuItem/chooseFromMenu take `item: string` (rebutted, see Rebuttals); lib/customer-display.ts type import from a component (accepted+fixed: PartyListCopy declared in lib/party-list.ts, re-exported from PartyList.tsx; plan line updated); useRecordList `rowsOf` must be stable (accepted+fixed: comment); ledger not in Files (driver's file)
- gate 3 B (conformance): no rule broken; the same two NOTEs (same triage); dead exports CustomerListRow, CustomerListViewState, customersEmptyHint are plan-named; customerCardHeight, CUSTOMER_COLUMNS, CUSTOMERS_TABLE_MIN_WIDTH, compareCustomerNames, customerMatches, customerListViewState kept for the unchanged-test guard; CUSTOMER_ROW_HEIGHT and isShownLine read only by the scratch route (Design notes)
- fix review: round 1: clean (gate 1 after fixes: tinycld-pkg check green; type-only move and a comment, so no e2e rerun)
- gate 3 A notes: none open
- reviewer-caught deferrals: none
- commit: adeb109
- human: n/a (review mode C)

## Checkpoint 5
- test writer: server/vendors_test.go, server/registrations_test.go (books_vendors in TestOAuth_LedgerIsReadWrite; new TestAudit_LabelsAVendorByDisplayName), tests/payment-terms.test.ts, tests/vendor-messages.test.ts, tests/vendor-fixture.test.ts, tests/collections.test.ts; red for the right reason: yes (Go build fails on the Produces names msgVendorDuplicateName, msgExpenseAccountMissing/Inactive/Ledger; with them stubbed in a temporary file every test fails on the missing books_vendors table; TS files fail on the missing modules; collections tests on the missing books_vendors entry); untestable: none. Plan defect fixed in the test: the plan reads length/format/`net_90` refusals with `apiErrorOf(...).Data`, but `app.Save` returns `validation.Errors` for a schema refusal (probed on books_customers), so the test uses a local `requireSchemaRefusal`
- implementer: migration 2100000004_create_books_vendors.js, server/vendors.go, lib/payment-terms.ts, vendor-messages.ts, seed-accounts.ts, fixture-columns.ts; ledger.go, audit.go, oauth_scopes.go, collections.ts, types.ts, customer-form-fixture.ts, vendor-form-fixture.ts, seed.ts changed; generated `BooksVendors.terms` includes `''`; DONE
- test disputes: none
- self-declared differences: oauth_scopes.go package comment also names the vendors; seedVendors account lookup in a variable with an `=== undefined` throw; inactive-account step filters SEED_ACCOUNTS and throws on a missing id; seedCustomers destructures id/parent, then seedValues(row); own comment wording in the migration header and registerVendorGuard; the git-excluded scratch route not updated (Design Tools loses its indent there)
- gate 1: tests unedited: yes · pass (implementer: packages:generate; driver: tinycld-pkg check, go test ./...; implementer's foreground seed boot `2 passed (31.9s)`, 22 books_vendors inserts then the 6900 inactive update)
- gate 2: n/a (nothing renders)
- gate 3 A (correctness): no BLOCK; NOTEs: oauth_scopes.go paragraph wrap (accepted+fixed); FIXTURE_ACCOUNTS[].parent is now an account key (already said in seed-accounts.ts:3; no later checkpoint resolves it); requireSchemaRefusal vs the plan's apiErrorOf (the recorded plan defect; not a deferral)
- gate 3 B (conformance): no rule broken; migration comment "repeat 2100000000's" wrong (accepted+fixed in 0002, 0003, 0004 by each file's constants; 0001 was right); vendor-messages.ts comment claimed screens check first (accepted+fixed: server-only; customer-messages.ts keeps its text, as PARENT_LOCKED_MESSAGE and the sub-customer dialog texts show before a save)
- fix review: round 1: clean · NOTE to Design notes: vendor-messages.ts line 1 says the strings mirror server refusals, but the file also holds client-only texts (VENDOR_DISCARD_MESSAGE and others); wording predates the fix. Gate 1 after fixes: gofmt, go vet, go test, tinycld-pkg check green
- gate 3 A notes: 1, listed under Design notes
- reviewer-caught deferrals: none
- commit: e1dd7dd
- human: n/a (review mode C)

## Checkpoint 6
- test writer: tests/search-target.test.ts (vendor case + `vendor:` with no id is null), server/search_test.go (TestSearch_FindsVendors, TestSearch_InterleavesAllFourKinds, TestSearch_NoAccessFindsNothing seeds a matching vendor; helpers mkSearchVendor, vendorRows); red for the right reason: yes (searchTarget returns null; no vendor rows; 6 of 8 interleaved rows), except TestSearch_NoAccessFindsNothing, which passes before the work by design (it guards that a vendor row never reaches a no-access user); untestable: none
- implementer: server/search.go (`vendorSource`, `searchVendors`, searchBooks interleaves four kinds; file comment names vendors), lib/search-target.ts (`vendor` → `books/vendors/[id]`); DONE
- test disputes: none
- self-declared differences: searchBooks sums the four totals in a local `total`
- gate 1: tests unedited: yes · pass (driver: tinycld-pkg check, go vet, go test -run TestSearch -count=1)
- gate 2: n/a (nothing renders)
- gate 3 A (correctness): no BLOCK; NOTEs: search.go:14 comment wrap (accepted+fixed); TestSearch_NoAccessFindsNothing passes before the work because the level check returns before any source (accepted: it still fails if the check moves below the sources)
- gate 3 B (conformance): no rule broken; the same comment wrap (accepted+fixed)
- fix review: round 1: clean (gofmt, go vet green after the fix)
- gate 3 A notes: none open
- reviewer-caught deferrals: none
- commit: b35c6b6
- human: n/a (review mode C)

## Checkpoint 7
- test writer: tests/vendor-route.test.ts, tests/vendor-display.test.ts, tests/shell-nav.test.ts (vendors case), tests/e2e/vendor-form-list.spec.ts (steps 0-11, desktop and phone); red for the right reason: yes (missing lib/vendor-route and lib/vendor-display; no vendors nav entry; e2e `books-list-card-vendors` not found, run with a temporary vendor-form-helpers.ts it then deleted); untestable: none; e2e runs: 1. Difference: `headerCellTexts` steps down through one-child wrappers (react-native-web may wrap a sticky header) instead of the bare `firstElementChild` row
- implementer: lib/vendor-route.ts, lib/vendor-display.ts, hooks/useVendorNavigation.ts, hooks/useVendorsQuery.ts, components/vendors/VendorsList.tsx, screens/vendors/_layout.tsx, screens/vendors/index.tsx, tests/e2e/vendor-form-helpers.ts; lib/shell-nav.ts (vendors after customers); DONE
- test disputes: none
- self-declared differences: Do step 7's capture left to the loop (gate 2); vendor-form-helpers.ts also exports `vendorHelpers` (named in Produces) and not `recordUrl` (not listed); short why-comments on the openNew wrapper, the list retry, noMenu/noop, NO_DETAIL_SCREENS, cityLineFits
- gate 1: tests unedited: yes · pass (driver: tinycld-pkg check; implementer e2e: vendor-form-list.spec.ts 2 passed (29.3s); customer-form guard first run failed in global-setup seeding with ClientResponseError 0 because it started while the previous run's 7200 server was still shutting down (its port check did not gate the run) → second run after a confirmed-free port check 24 passed (1.7m)); e2e runs so far: 3 vendor-budget (test writer 1, list spec 1, capture 1) + 2 customer guard
- gate 2 capture: evidence/cp7/capture.json at /a/books/vendors; the capture spec (git-excluded scratch) gained `fakeRecords: { collection, status?, items? }` for the error (400) and all-inactive (the two inactive fixture vendors) states; 18 shots, 5 passed; list-empty-read-only cannot be captured (no read-only member), critique reads vendorsEmptyHint/listWriteControls
- gate 2: invalid shots: none · blocking: none · notes: 2, listed under Design notes (critique: evidence/cp7/critique.md; 12 of 18 shots byte-identical to the reference, since the mockup rendered the same shared components with the same fakes; captured fresh 2026-10-30 13:15)
- gate 3 A (correctness): no BLOCK; NOTEs: row/New presses go to books/vendors/[id] and /new, which checkpoint 8 adds (planned, Do 7); windowing step assumed "Zenith Telecom" sits near the end of the shared list (accepted: a test-isolation bug per lesson 3; fresh test-writer fix); headerCellTexts one-child walk is needed for react-native-web's sticky-header wrapper (accepted; the plan text was wrong); useVendorsQuery `data ?? []` makes a new array per render before ready (Design notes; customers do the same)
- gate 3 B (conformance): the phone loop repeats steps (0), (1), (1b), (2), (5), (6), (10) whose code is the same at both sizes, against CLAUDE.md "a phone run of the same logic as the desktop run is a duplicate" (accepted although the plan sets the loop: the plan copied the customer spec, and CLAUDE.md overrides the plan; fresh test-writer fix); customer guard second run (cause found first; tooling gap raised in retro); unmatched vendor routes until checkpoint 8 (planned)
- fix review: n/a (both fixes were test-only, by a fresh test writer): the phone run now covers steps (3), (4), (7), (8) and (9)'s card check only (FAB, PartyCard, narrow ListToolbar); the desktop run keeps every step; (11) also desktop-only (ListsHub has no breakpoint code). Windowing asserts by mounted ids: a new row mounts on scroll, the first row drops, and the mounted count stays below the 20 seeded active vendors. Gate 1 after: vendor-form-list.spec.ts 2 passed (24.1s); e2e vendor-budget runs: 4
- gate 3 A notes: 1, listed under Design notes
- reviewer-caught deferrals: none
- commit: c7c4623
- human: n/a (review mode C)

## Checkpoint 8
- test writer: tests/vendor-host.test.ts, tests/expense-account-options.test.ts, tests/vendor-columns.test.ts, tests/host-value-schemas.test.ts (selectValueSchema), tests/shell-nav.test.ts (vendor action, Vendors column, /vendors/<id> and /new), tests/customer-host.test.ts (setup only), tests/e2e/vendor-form-page.spec.ts; red for the right reason: yes (no books:vendor host; missing lib/expense-account-options and lib/vendor-columns; selectValueSchema undefined; shell-nav cases; every e2e test fails on the missing vendor surface or New menu entry); untestable: none. The plan's single chained 15-step e2e test was split, on the driver's word, into 9 one-goal tests (11 runs, each 7-8 s red) per the mandate "one test is one user goal ... under ~10 s"; every step's assertions kept; phone only for the FAB New menu, hidden FAB and one-column form; no test creates or edits a seeded row. e2e vendor-budget runs: 6
- implementer: forms/hosts.ts (books:vendor), forms/ui.ts, forms/vendor-fields.tsx, components/forms/ContactInput.tsx (hint), lib/host-value-schemas.ts (selectValueSchema), lib/expense-account-options.ts, lib/vendor-columns.ts, lib/shell-nav.ts, lib/vendor-route.ts, stores/vendor-form-store.ts, hooks/useVendorForm.ts, components/vendors/VendorChild.tsx, screens/vendors/_layout.tsx, [id].tsx, new.tsx; DONE
- test disputes: none
- self-declared differences: the VendorColumns terms `satisfies` sits on EMPTY_VENDOR_COLUMNS (`satisfies Partial<BooksVendors>`), not a sample row; PaymentTermsField/ExpenseAccountField pass HostSelect props by name; useVendorForm returns `RecordChildState` (a type import from components/RecordChild); capture left to the loop; core SelectInput shows the option label in its trigger, so `  6210 Design Tools` keeps its two indent spaces there (needs core to fix; for gate 2)
- gate 1: tests unedited: yes · first check red on biome format of the driver's cp7 capture.json (driver mistake, see Out-of-plan) → scoped biome --write → green; driver re-ran tinycld-pkg check: green; implementer e2e (one run: vendor-form-page, vendor-form-list and customer-form-* specs) 37 passed (1.7m)
- gate 2 capture: evidence/cp8/capture.json (rows opened by search and a press, New from the header, not-found by URL on first load); 12 shots, 6 passed; read-only-* cannot be captured.
- e2e budget correction: the plan's budget and checkpoints.md count e2e TESTS per screen ("at most 12 e2e tests in all its checkpoints, desktop and phone runs counted"), not Playwright invocations as this ledger counted above. Count now: cp7 2 (one test, desktop + phone), cp8 11 (9 one-goal tests, 2 with a phone run) = 13 of 12 before checkpoints 9-10 (planned 8 more). The one-goal rule and the 12 cap conflict for this screen: human decision (stop below).
- gate 2: invalid shots: none · blocking: 1 — the Default expense account trigger shows the indented option label's two leading spaces (`  6210 Design Tools` sits 8 px right of the form's value inset on page-1100, phone-page-390, panel-1600; flush for a depth-1 account on panel-long). Basis: the reference keeps every value at one inset; the spec indents by depth in the option list. Cause: core SelectInput draws `option.label` verbatim in the trigger and SelectOption is `{ label, value }`; the journal entry line grid (useAccountOptions) has the same defect. Not fixable in Books without dropping the indent: STOPPED for the human (core change) · notes: 1 (Account number hint 6 px closer to its input than the reference), under Design notes. Critique: evidence/cp8/critique.md
- gate 3 A (correctness): BLOCK accepted (fix pending the stop): A/R and A/P accounts are filtered out before accountOptionList, so `names` lacks them and a stored account whose type later became A/P shows a blank trigger (the plan's Produces: triggerLabel names a stored account that is not offered) → build names from all accounts, add a unit case; NOTEs: ExpenseAccountField `data ?? []` drops loading/error (Design notes); ContactInput doc comment omits Account number (accepted, one-line fix pending); plan budget line out of date (see correction above)
- gate 3 B (conformance): no rule broken; cp7 capture.json out of plan (recorded); budget overrun (see above); `tests/expense-account-options.test.ts` casts `account.type as ExpenseOptionAccount['type']` because `SeedAccount.type` is `string` in lib/seed-accounts.ts:10 (accepted, fix pending: type it `BooksAccounts['type']`, drop the cast via a fresh test writer); the A/R trigger case (same as A's BLOCK)
- human (2026-10-30): decision 1 — core change: `SelectOption` gets an optional `indent` (plan: "Checkpoint 8, core part (8a)"; core branch books/p3-vendors recreated from main 8a2e182; lane holds `exclusive`); the Books side is checkpoint 8 Do step 10 after the core PR merges. Decision 2 — keep one-goal tests, prune the lower-priority ones to the 12-test cap: plan budget line and checkpoint 9 revised (cp8 keeps 4 tests; cp9 guard desktop only, the away test pruned); plan-check after the revision: 13 errors, all in done checkpoints 1-7 (removed names).

- step 10 test writer (fresh): vendor-form-page.spec.ts pruned to 4 desktop tests (removed the New menu, layout, Escape, reload and deep-link tests and their helpers; 5 helper re-exports dropped from vendor-form-helpers.ts); the seeded-vendor test asserts the trigger reads exactly `6210 Design Tools`; the fills test's `designToolsPlacement` now expects the plain child label at least 12 px right of its parent (the only browser check of the core indent); expense-account-options.test.ts and account-options.test.ts expect plain labels with `indent`, and the stored A/P and A/R cases name the account; the cast is gone. Red: unit 5 failed (spaced labels, blank A/P/A/R trigger), e2e 2 failed / 2 passed (the trigger text and the inset). Tests now: cp7 2 + cp8 4 = 6 of 12
- step 10 implementer: lib/account-options.ts (`{ value, label, indent: depth - 1 }`), lib/expense-account-options.ts (accountOptionList over all accounts, then the A/R and A/P ids dropped from the options, so names cover every account and a child keeps its depth), lib/seed-accounts.ts (`type: BooksAccounts['type']`), components/forms/ContactInput.tsx (comment); entry callers unchanged. Out of plan and unreviewed: tests/e2e/customer-form-actions.spec.ts step (8) "deleted in another tab" moved to desktop only (CLAUDE.md phone rule) after its phone run took ~33 s under host load. BLOCKED on gate 1: tinycld-pkg check green (2604 tests); e2e run 1 `1 failed, 120 passed (2.8m)` (customer-form-actions phone timeout); run 2 `2 failed, 119 passed (3.9m)`: journal-entries-actions.spec.ts:524 and journal-entries-row-menu.spec.ts:340 at Post (`entry-read-only` not shown in 5 s; the post PATCH did not return); both passed in run 1. Host load average 49-58 on 14 cores (Spotlight mds_stores/mdworker, WindowServer, another lane). Surfaced to the human.
- step 10 gate 1 after the human removed the cause (Spotlight off ~/tmp/tinycld; #399 merged and installed): tinycld-pkg check green; e2e (vendor page, vendor list, customer-form-*, journal-entries-*) `121 passed (2.4m)`. Re-capture: 6 shots, 6 passed; fresh critic on page, phone-page, panel, panel-long (critique-2.md). Fix review of step 10 (including the out-of-plan customer spec move) dispatched.
- gate 2 after fix: fresh critic (critique-2.md): invalid shots none; the trigger BLOCKING is fixed (`6210 Design Tools` at the form's value inset on page, phone and panel, light and dark); no new BLOCKING; 1 NOTE (the Account number hint, carried)
- fix review: round 1: clean · the customer-form-actions step (8) move is valid by the duplicate rule (DESKTOP 1280 px is below the panel breakpoint, so both sizes run the same RecordByIdScreen/RecordNotFound code; the phone run still drives cards, the menu sheet and the dialog sheets in steps 1-7; no other body change) · NOTE accepted+fixed: its comment gave the test timeout as the reason; both desktop-only comments in that spec now give the duplicate rule (the step 6b one predated this unit)
- gate 3 A notes: 1 open (ExpenseAccountField loading/error, Design notes)
- reviewer-caught deferrals: none
- human: decisions recorded above (core indent, prune to 12 tests); review mode C

## Checkpoint 8, core part (8a)
- test writer: n/a (no core e2e and no component unit test; the Books vendor page e2e drives it in checkpoint 8 step 10)
- implementer: core/ui/form/ButtonGroup.tsx (`SelectOption.indent?`), core/ui/menu/index.tsx (`MenuItemProps.indent`, `RowIndent` spacer in MenuRow), core/ui/form/SelectInput.tsx (passes `indent`); DONE
- self-declared differences: a `RowIndent` helper with INDENT_STEP 12; the row's flex gap added to the spacer
- gate 1: pass (core tinycld-pkg check, pkg:check, check:core-isolation; driver re-ran core check and isolation)
- gate 3 A (correctness): BLOCK accepted+fixed: the spacer took the row gap once, so levels sat at 0/20/32/44 px (popover) → a negative right margin equal to the row gap (8 popover, 12 sheet) makes each level exactly 12 px; NOTE accepted+fixed: NaN indent guard
- gate 3 B (conformance): no rule broken; docs/overlays.md's Menu.Item prop list must name `indent` (accepted+fixed; out of the Files block, see Out-of-plan); the same gap finding
- gate 1 after fixes: core tinycld-pkg check green
- fix review: round 1: clean (gap-2/gap-3 are 8/12 px under uniwind's 16 px rem; levels 0/12/24 px in both presentations)
- commit: tinycld 431bee9 (core PR https://github.com/tinycld/tinycld/pull/399)
- human: approved 2026-10-30; #399 merged as 7045966 (no main merge needed: MERGEABLE, CI green); `exclusive` released; core main checked out, pnpm install done. The human also took ~/tmp/tinycld out of Spotlight indexing (the cause of the cp8 step 10 load); load average then 7

## Final review
- eval:
- native: not executed in this run
