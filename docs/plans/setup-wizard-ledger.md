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
- **finding:** cp4 reviewer B — `await month.click()` clicks the middle of a radiogroup and should be deleted
  **rebutted because:** `tinycld/core/ui/form/SelectInput.tsx` renders a `Pressable` trigger that opens a popover Menu; the `books-setup-month-<n>` items exist only while it is open. Removing the click made the test fail at the `books-setup-month-7` click.
- **finding:** cp4 reviewer B — assert selection with `aria-checked`
  **rebutted because:** react-native-web does not emit `aria-checked` for `ChoiceCard`; the first draft failed on it.
- **finding:** cp4 reviewer A — nothing tests that the help text matches the screen strings
  **rebutted because:** the checkpoint's help test list reads: "the topic `setup-wizard` has `title` and `summary` frontmatter and every `help://books:<id>` link in its body ... names an existing file `help/<id>.md`". Help prose is reviewed with the feature by the reviewers.
- **finding:** cp3 reviewer B — `useSetupParts` has a second `useState` (`failure`) and a second form schema next to `setupSchema`
  **rebutted because:** `failure` holds the outcome `create` returned, which `useBooksSetup` does not expose; the checkpoint Do step 1 says "hold the current part in `useState` (local UI state that no other component reads)". `setupFormSchema` exists only because a SelectInput hands back a string while `setupSchema.fiscal_year_start_month` is a number; it carries a comment and `tests/setup-parts.test.tsx` covers the conversion.
- **finding:** cp3 reviewer A/B — `tests/accounts-form-harness.ts` uses the private `collection._lifecycle.markError`
  **rebutted because:** no public TanStack DB API puts a collection into the error state; the helper is test-only and `tests/setup-parts.test.tsx` fails loudly if the internal changes.
- **finding:** cp3 reviewer B — `hooks/useSetupCompleted.ts` duplicates a settings live query
  **rebutted because:** it keeps `useListsHub` from loading `useBooksSetup`'s accounts query on every Lists hub render; recorded under Out-of-plan changes.
- **finding:** cp3 fix review — `next?.()` can throw inside the submit handler
  **rebutted because:** `next` is core's wizard continuation, whose contract (`tinycld/docs/packages.md`, "Module contract") is to be called after the step saves; a throw there is core's to report.
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
- cp3 · ownership: lead-to-cards gap (~50-60px) larger than other gaps (`gap-6` stacked on the heading margin) — NOTE
- cp3 · ownership, populated 1280: lead text wraps early and orphans its last word ("same.", "chart.") — NOTE
- cp3 · ownership, populated: Back sits in the body, Next in the footer, so they read as two rows — NOTE
- cp3 · populated: empty band between lead and Back where a preview would sit — NOTE
- cp3 · all non-done shots: core shell header "1 of 1" (and "ORGANIZATION SETUP" on /a/books/setup) beside the body's "Part n of 3" — two counters; critic suggested hiding the shell header on the Books route — NOTE
- cp3 · business-long-name: the focus ring is the browser default blue (core TextInput), not the teal accent — NOTE
- cp3 · ownership 390: card detail wraps leaving "draws" alone on the last line — NOTE

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

## Checkpoint 3
- test writer: tests/manifest.test.ts, tests/setup-parts.test.tsx, tests/setup-step-hooks.test.tsx, tests/lists-hub.test.tsx (+ harness options `settingsNeverReady`, `settingsFailsOnce`, `accessNeverReady`); red for the right reason: yes (verified against throwaway stubs); untestable: none
- implementer: setup step, parts, hooks, route, hub card, manifest/exports; DONE after three fix rounds
- test disputes: none
- self-declared differences: Next/Create/Finish use core's `setup-continue` testID; month held as string and converted at submit (`toSetupValues`); `hooks/useSetupCompleted.ts` and `hooks/useSetupCard.ts` added; "Part n of 3" label; error heading shows the account name only; `canSkip`, `canGoBack`, `inferOwnership`, `accountCountLabel`, `chartCountNote` added by review rounds
- gate 1: tests unedited: yes (all test changes by fresh writers) · pass (57 files, 1124 tests, tsc, biome; full e2e 61 passed)
- gate 2: invalid shots: none · blocking: none · notes: 7 listed under Design notes. Coverage limit: only business, business-long-name, ownership, populated and done could be driven in e2e (the seeded book has accounts and no non-admin Books user); the fresh chart, creating, error, non-admin and Lists-hub card states have reference shots only
- gate 3 A (correctness): double press moved part off creating; error without failure; ownership lost on remount; skip offered while resuming; dead end on a resumed book with no accounts; misleading non-admin message on a completed book; plural copy -> all accepted and fixed; stale snapshot, remount-during-run, mixed ownership after remount -> rebutted/limits (see Rebuttals)
- gate 3 B (conformance): nested ScrollView in chart preview -> fixed; isVisible always true -> fixed; second schema/two useState -> rebutted; navigation in component -> fixed; fixed sleeps in tests -> replaced; skip label -> fixed; harness `_lifecycle.markError` -> rebutted
- fix review: pass after each of three rounds; round 3: nothing found
- reviewer-caught deferrals: none
- commit: see git log

## Checkpoint 4
- test writer: tests/e2e/setup-wizard.spec.ts (one test), tests/help-setup-wizard.test.ts; e2e passed on first run (no new UI), proven able to fail; help test red (no file); untestable: none
- implementer: help/setup-wizard.md (written by the driver after the test writer; no UI code in this checkpoint)
- test disputes: none
- self-declared differences: e2e returns to 1280 wide and opens Chart of Accounts to reach the Lists hub (phone layout has no Lists nav item); selected card asserted by the `border-primary` class (react-native-web does not emit aria-checked for it); phone layout asserted by card geometry through `expect.poll`
- gate 1: pass (57 files unit, full e2e 62 passed)
- gate 2: n/a
- gate 3 A (correctness): help text broader than the built behavior (Back/Skip when resuming, settings failure, populated notice only when not half done, opening balances, non-admin wording) -> accepted, fixed; phone layout unasserted, weak last assertion, geometry race -> accepted, fixed by fresh test writers
- gate 3 B (conformance): month.click flake claim -> rebutted (see Rebuttals); aria-checked suggestion -> rebutted; help drift test -> not added (see Rebuttals)
- fix review: pass 1 over help and e2e edits found 4 help inaccuracies and the geometry race, all fixed; the last help-text edits use the reviewer's own wording and were not re-reviewed
- reviewer-caught deferrals: none
- commit: see git log

## Final review
- eval: 
- native: not executed in this run
