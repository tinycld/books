# setup-wizard — helix run ledger

- mode: unattended
- unit: p1-setup-wizard
- started: 2026-10-24
- package branch: books/p1-setup-wizard   core checkout: main
- spec: docs/specs/setup-wizard-design.md
- checkpoints: docs/plans/setup-wizard-checkpoints.md
- reference: docs/plans/setup-wizard-reference/
- evidence: docs/plans/setup-wizard-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/setup-wizard-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - one decision per screen with visible position → expressible (core StepHeading, SetupContinueButton, shell progress label)
  - choice cards with clear selected state → expressible (RadioInput or ButtonGroup; confirm at build)

## Deferrals
(none yet)

## Rebuttals
- **finding:** cp2 fix review 2 — remount during a run lets a second batch start
  **rebutted because:** `pb-migrations/2100000002_create_books_ledger.js` has `CREATE UNIQUE INDEX idx_books_accounts_number ON books_accounts (number) WHERE number != ''`, so a second batch's insert of a number the first batch also inserts is refused, not duplicated; the cost is a spurious error, which Try again resumes.
- **finding:** cp2 fix review 2 — non-step errors are labelled `Business settings`
  **rebutted because:** the only code that can throw there is the pure `planChart`/`starterChart`, which are unit-tested; a programmer error, not a user-reachable path.
- **finding:** cp2 fix review 2 — stale snapshot on an immediate retry
  **rebutted because:** `execute` calls `setProgress(null)` in `finally`, which re-renders before the error part can offer Try again.
- **finding:** cp2 fix review 2 — resume can add starter accounts to a custom chart / ownership change between attempts mixes equity sets
  **rebutted because:** the spec bullet reads "A book whose settings hold a business name but are not marked done is a batch left half done: it shows the Starter chart screen, and Create resumes it, skipping accounts that already exist." Recorded as a known limit: ownership is not persisted, and the error part has no Back, so it can only change after a remount.
- **finding:** cp1 reviewer B 4 / reviewer A 4 — `type: item.type as BooksAccounts['type']` cast in the fixture; `StarterAccount.type` is a plain `string`
  **rebutted because:** the checkpoint's Interfaces block says `StarterAccount { key: string; number: string; name: string; type: string; detail_type: string; parent?: string }`, and `tests/starter-chart.test.ts` fails if a type or detail key is not in `ACCOUNT_TYPES`.
- **finding:** cp1 reviewer B 5 — `CHART_GROUPS`/`GROUP_OF_TYPE` in the fixture duplicate `STARTER_GROUPS`
  **rebutted because:** the checkpoint Do step 4 says "keep ... `CHART_GROUPS` and `GROUP_OF_TYPE`".

## Design notes
(none yet)

## Out-of-plan changes
- cp1: `docs/plans/setup-wizard-capture.json` (biome format only, needed for a green check); `tinycld/books/lib/account-register-fixture.ts` (`SETTINGS` gained `business_name`/`setup_completed`, forced by the new generated type); `tinycld/books/seed.ts` (comment line the plan's Do step 5 asked for; Files block omitted it)

## Phase notes
- phase 1: none
- phase 3: pass 2 done (fixture, scratch route, 11 reference shots); RadioInput has no card layout, so ownership cards are plain Views with a selected border. direction A picked at design gate; questions 1-6 accepted as recommended (core package step + /a/books/setup; ownership question; read-only preview; migration 2100000001 edited in place; client batch via useMutation; admin-only Lists card)
- phase 4: plan review findings fixed: retry needs number-to-id map; sequential inserts so a refusal stops the batch; precedence of populated vs error/done; settings-write refusal test; useIsStepDone/Visible and hub-card tests; e2e is one non-order-dependent test. Spec edits made after the gate (shown at the eval gate): label "Part n of 3" (core shell already prints "n of m"); Dividends paid dropped (no dividends detail type in account_types.json); "Back and Next under the form" (core shell footer is not pinned and has no Back). Known coverage limit: the e2e database has no empty book and no non-admin Books user, so the built fresh-chart, creating, error and non-admin screens cannot be captured or driven in e2e; hook tests cover their logic.
- review mode switches: none

## Checkpoint 1
- test writer: tests/starter-chart.test.ts, tests/setup-schema.test.ts, server/setup_settings_test.go; red for the right reason: yes (missing modules, missing fields); untestable: none
- implementer: starter chart, schema, migration fields, fixture/seed updates; DONE; depreciation numbered 6950 (checkpoint range 5000-6999)
- test disputes: none
- self-declared differences: Depreciation 7000 -> 6950; fixture keeps `STARTER_CHART`/`ChartAccount` for the scratch route
- gate 1: tests unedited: yes (biome format/import-order fix only on 2 test files) · pass (52 files, 1037 tests; go suite)
- gate 2: n/a
- gate 3 A (correctness): tests weak (depth cycle guard, shape/counts) accepted, fixed by fresh test writer; z.number vs select string noted for cp3
- gate 3 B (conformance): out-of-plan files recorded; two rebuttals (see Rebuttals)
- fix review: n/a (test-only fixes)
- reviewer-caught deferrals: none
- commit: see git log

## Checkpoint 2
- test writer: tests/setup-plan.test.ts, tests/useBooksSetup.test.tsx, harness additions (`refuseSettings`, `refuseAfterNow`, `stepWrites`, `resetWriteCounts`, `refuseSettingsAfterNow`, `writeLog`); red for the right reason: yes; untestable: none
- implementer: planChart + useBooksSetup; DONE after one fix round
- test disputes: 1 — retry's first-settings-write assertion; upheld (an unchanged draft is a no-op in TanStack DB), fresh writer fixed the test
- self-declared differences: async mutationFn with performMutations instead of a generator (plan text updated); StarterAccount.type narrowed to BooksAccounts['type']
- gate 1: tests unedited: yes (all test changes by fresh writers) · pass (1065 tests, tsc, biome)
- gate 2: n/a
- gate 3 A (correctness): remount lost resume flag (also found by B) -> accepted; fixed by marker-first settings write and `isResuming` from the live settings row (spec bullets "Create runs one batch" and "A chart that already has accounts" and plan updated); not-ready/missing-settings/double-press -> accepted, fixed (`busy`); weak ordering/offset tests -> accepted, fresh writer
- gate 3 B (conformance): same findings; `parentOf` rebuilt, silent root parent fallback, cast -> accepted, fixed
- fix review: pass 1 found duplicate error reporting (core default onError) -> accepted, fixed with an empty onError + notify.emit tests; pass 2 over that fix: nothing found
- reviewer-caught deferrals: none
- commit: see git log

## Final review
- eval: 
- native: not executed in this run
