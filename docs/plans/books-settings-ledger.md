# books-settings — helix run ledger

- mode: unattended
- unit: p1-settings
- started: 2026-10-24
- package branch: books/p1-settings   core checkout: tinycld on main
- spec: docs/specs/books-settings-design.md
- checkpoints: docs/plans/books-settings-checkpoints.md
- reference: docs/plans/books-settings-reference/
- evidence: docs/plans/books-settings-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/books-settings-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - Current values readable at a glance → expressible (SectionCard, label/value rows)
  - Close the books as one block → expressible (core Toggle + DateField, isVisible group)
  - Role choice carries a description → expressible (SelectInput + description line)

## Deferrals
(none open) Resolved: checkpoint 7's non-admin override line was captured at checkpoint 8 (evidence/cp8/non-admin-accounting-override-*), granted through the UI; unit tests cover it and checkpoint 10's e2e test 6 asserts it. Original entry:
- **agreed:** checkpoint 7 Delivers: "the read-only view with the caller's own override line"; spec: "Under Accounting a line states the caller's own override"
  **built:** the line is built (`ownOverrideLine` in lib/overrides.ts, `books-settings-own-override` in the read-only Accounting view, driven by `useMyCloseOverride`) and unit-tested, but the non-admin gate-2 screenshot shows no line
  **reason:** missing dependency
  **blocker evidence:** an override can only be created through the UI by the overrides panel (checkpoint 8, `GrantOverrideDialog`); `grep -r GrantOverrideDialog books/tinycld` finds nothing at this checkpoint; raw PocketBase writes are banned by CLAUDE.md
  **impact:** the capture does not show the line; behavior is covered by useMyCloseOverride.test.tsx and ownOverrideLine tests, not yet by a screenshot or e2e
  **unblock:** checkpoint 8 lands the grant panel; the checkpoint 8 capture re-takes non-admin-accounting with a granted override, and checkpoint 10's e2e test 6 asserts the line
  **tracked in:** checkpoint 8 (capture) and checkpoint 10 (e2e test 6)
  **found by:** design critic
  **checkpoint:** 7

## Rebuttals
- **finding:** reviewer A and B, checkpoint 1: the "books_settings row carries the five new string fields" test bullet was removed from the plan (DEFERRAL)
  **rebutted because:** the test writer reported it UNTESTABLE as a red test: "Vitest does not type-check, and an untyped PocketBase client returns whatever fields it is given." The fields are asserted by server/company_settings_test.go (admin sets each, seeded row empty, length limits) and by `satisfies BooksSettings` in the fixture under tsc. Nothing the user sees is missing.
- **finding:** reviewer B, checkpoint 1: `OfflinePocketBase` hand-writes `send` and uses `as never` casts
  **rebutted because:** it fakes only the network layer of the real pbtsdb collections (the checkpoint says "with real pbtsdb collections"); no shared helper exists for an offline PocketBase (grep of tests/ finds none).

- **finding:** reviewer A, checkpoint 2: `levelPlan` takes `userId` and never uses it
  **rebutted because:** the checkpoint's Interfaces block gives the signature with `userId`; checkpoint 5 builds the writes with it.
- **finding:** reviewer A, checkpoint 2: `expiryFrom` silently falls back to 24h on an unknown `lasts`
  **rebutted because:** the `LastsFor` type blocks it at compile time and `overrideSchema` enforces it at runtime (reviewer: "Acceptable").
- **finding:** reviewer A and fix review, checkpoint 3: `reset(parsed)` on success drops anything typed while the save is pending
  **rebutted because:** the spec's save rule is "Save success: a toast "Saved." and the form resets to the saved values."; Save is the only submit path and the form is not edited during the short write.
- **finding:** reviewer B, checkpoint 3: each form/card opens its own `useBooksSettings` live query
  **rebutted because:** all share the queryKey `['books','settings']`, so one request serves them (reviewer: "acceptable because of the shared queryKey").
- **finding:** reviewer fix pass, checkpoint 4: the grantable list may omit org owners and admins
  **rebutted because:** pb-migrations/2100000000_create_books_access.js: "books_access computes the level per user in SQL with the same resolution as" the server, so owners and admins have a row at level admin.
- **finding:** fix review, checkpoint 4: revoke time is the client's clock, so a client clock behind the server leaves a revoked row active on the server for the skew
  **rebutted because:** the spec says "on confirm sets `expires_at` to now" and Data lists `.update` (`expires_at` to now); a server-stamped revoke is a different design. Shown under Design notes.
- **finding:** reviewer, checkpoint 4: the diff adds no tests for the guards, ended-row refusal and tick
  **rebutted because:** tests/useCloseOverrides.test.tsx and useMyCloseOverride.test.tsx hold them (per-operation guards, ended-row refusal, expiry while mounted, stale clock).
- **finding:** reviewer B, checkpoint 5: `mutationFn` is an async function wrapping `performMutations`, not a generator
  **rebutted because:** CLAUDE.md: "Use `performMutations` from the same module to await Transactions inside a plain async function." The reload after a part-way failure needs an awaited step the generator form cannot give.
- **finding:** reviewer A and B, checkpoint 5: a user with no materialized `users` row gets orgRole 'guest' and an empty name
  **rebutted because:** the level comes from the books_access view (owners and admins resolve to admin there); a missing users row means a deleted user, and the spec requires only that the row still appears.
- **finding:** reviewer B, checkpoint 5: two live queries per row
  **rebutted because:** the checkpoint's Do step 2 specifies "two small `useLiveQuery` reads for this person"; the user list is 1 to 50 staff (spec).
- **finding:** reviewer A, checkpoint 5: per-person Set guard keyed by person id
  **rebutted because:** harmless and tested ("two people don't block each other").
- **finding:** fix review, checkpoint 5: after a reload-only failure, if person.level moves away and returns to `from`, the stale error and chosen level show again (ABA)
  **rebutted because:** needs a failed reload plus two changes by another admin before the next reload; the error clears on the next change.
- **finding:** reviewers and critic, checkpoint 6: the section list shows only Company (Accounting, Numbering, Access missing), critic BLOCKING in round 1
  **rebutted because:** the checkpoint's Delivers line: "the Company section in its read-only and edit forms", and Interfaces: "`SectionBody({ section, isAdmin })` (a `Record<SectionId, ComponentType>` lookup; later checkpoints add their entry)"; checkpoint 2 holds `SETTINGS_SECTIONS` at `company` only "as specified". Checkpoints 7 to 10 add the other rows. Round 2 critic dropped the finding.
- **finding:** reviewer A, checkpoint 6: `openSection` uses router.replace on wide, not push as the plan's Do step says
  **rebutted because:** a wide rail click that pushes puts each section in the history and a browser Back from the list loops; replace is the review's fix. Recorded as a deviation from the plan text.
- **finding:** reviewer A, checkpoint 6: whitespace-only typing makes the form dirty and Save writes an identical trimmed value
  **rebutted because:** harmless (the saved row does not change); trimming is done by the schema as the review asked.
- **finding:** reviewer B, checkpoint 7: local MonthSelect (useController + Menu) re-implements core SelectInput; ReopenDialog uses core Dialog instead of ConfirmDialog
  **rebutted because:** `fiscalYearSchema` (checkpoint 2, tested) takes a numeric month and SelectInput compares string values; ConfirmDialog has no testID on its buttons and the checkpoint requires `books-settings-reopen-confirm` and `-cancel`; the fix would be a core PR (not made). Why-comments are in both files.
- **finding:** reviewer A, checkpoint 7: `oldDate` in the reopen dialog is captured at submit time and can go stale if another admin changes the close date
  **rebutted because:** low risk; the server re-validates the write.
- **finding:** reviewer A and B, checkpoint 7: the fiscal-year form uses a local numeric MonthSelect; the typing-during-save reset keeps Save disabled
  **rebutted because:** a save is a single round trip; the next keystroke re-dirties the form.
- **finding:** reviewer B, checkpoint 8: tests/useOverridesPanel.test.tsx is not in the Files block
  **rebutted because:** the form and revoke state are a tricky hook (grant form with optimistic refusal, cancel during submit, load states); CLAUDE.md allows a unit test for such a hook; panel rendering stays e2e (checkpoint 10).
- **finding:** reviewer B, checkpoint 8: GrantOverrideDialog and OverridesPanel type the form via `ReturnType<typeof useOverridesPanel>`
  **rebutted because:** the checkpoint's interface names `UseFormReturn<OverrideValues>`, but core's `@tinycld/core/ui/form` exports no `UseFormReturn`; a derived type is the codebase rule ("Derive row types from the query").
- **finding:** reviewer A, checkpoint 8: a failed revoke gives only a 5 s toast; no in-flight indicator on the row
  **rebutted because:** the spec defines no failure state for Revoke; the optimistic update rolls the row back (tested).
- **finding:** reviewer B, checkpoint 9: tests/settings-sections-numbering.test.ts and the hooks/useSequenceForm.ts change are outside the Files block
  **rebutted because:** the hook change fixes the same isSubmitted reset found in checkpoint 7 (FormErrorSummary is gated on isSubmitted) and is now covered by tests/useSequenceForm.test.tsx; the registry test pins the new section entry. Both recorded under Out-of-plan.
- **finding:** reviewer A, checkpoint 9: Prefix lacks autoCapitalize/autoCorrect props
  **rebutted because:** not in the spec's Numbering bullets; a native nicety that core's TextInput may not forward.
- **finding:** reviewer A, checkpoint 10: `useAccessMutation` same-tick duplicate `setLevel` returns silently instead of the in-flight promise
  **rebutted because:** the select is disabled while a change is pending (and until the reads are ready), so the UI cannot issue a duplicate; setLevel returns void by the checkpoint's interface.
- **finding:** reviewer B and A, checkpoint 10: help/navigating-books.md and tests/help-settings.test.ts / books-settings.spec.ts extra tests are outside the Files block
  **rebutted because:** the Settings sidebar entry needs a mention in the navigation help (CLAUDE.md in-app help rule); the extra e2e tests cover gaps earlier reviews found (validation messages on screen, dirty form across the breakpoint, history entries, sidebar entry, wizard not resuming after a Settings save).
- **finding:** reviewer A, checkpoint 10: AccessRow `ReadError` also shows on locked rows
  **rebutted because:** a failed read is still true for that row; harmless.

## Design notes
- cp 10 · Access chip: outlined pill in light, filled in dark (weight differs slightly); avatar colors differ between capture runs; the search field focus ring is blue, not teal; chip and select repeat the same word; the control column is not aligned between locked and editable rows.
- cp 10 · coverage gap: the Books-admin-who-is-not-an-org-owner/admin view (disabled select, 'Ask an organization owner or admin to change this.') needs a third user to reach through the UI; covered by the accessRowControl unit tests (checkpoint 2) only. Also the failed-write revert and the row error have no e2e (a server refusal cannot be forced through the UI).
- cp 9 · numbering-invalid: the preview joins the rejected prefix ('A_12001'), so it can read as valid; the Prefix error lacks a trailing period unlike the server refusal (the text is asserted in the schema tests).
- cp 9 · errors add their own bottom margin: the gap from error text to the preview is larger than from inputs to the preview.
- cp 9 · the empty Numbering state cannot be produced through the UI, so it has no screenshot.
- cp 8 · grant dialog: the Reason textarea shows a browser resize grip (also in the phone sheet); the dialog title sits directly above the Person label with no gap.
- cp 8 · revoke-confirm (dark): the destructive Revoke button is a muted rose, so it reads as disabled next to a full-strength primary elsewhere.
- cp 8 · no-close-date: the 'Set a close date to grant overrides.' message is body size with a paragraph gap; the reference sets it as small muted helper text.
- cp 8 · mobile tab bar: only 'More' is drawn for the collaborator at 390 in the non-admin shots ('Books' tab absent).
- cp 7 · Close block: "Save close date" sits inside the bordered block; the reference draws it below the block in the same column as the fiscal Save.
- cp 7 · Reopen dialog: the date breaks across lines in the body text; a non-breaking space would keep it together. At 390 the sheet shows both an X and a Cancel.
- cp 7 · Accounting: the gap above the fiscal Save equals the gap below it, so Save reads less like part of the fiscal group.
- cp 7 · core request: `ConfirmDialog` takes no `testID` for its buttons; core `SelectInput` compares string option values (numeric options never show as selected); `TextAreaInput` does not grow.
- cp 6 · list-company-1280: the Settings sidebar entry sits directly under Chart of Accounts with no gap or divider, so it reads as part of Accounting.
- cp 6 · company-long-390: the Business address textarea shows four lines and slices the fifth; fixing it needs core's TextAreaInput to grow with content (a core change, not made here).
- cp 6 · non-admin-list-390: a long company name clamps to two lines in the list row (the reference keeps summaries on one line).
- cp 6 · Currency: the line and its note read as a sentence plus a muted note, not as a right-aligned row like the other read-only rows.
- cp 4 · migration 2100000001: `books_close_overrides` listRule/viewRule are READ, so any user who can read Books can list every override and its reason through the API; the spec reads only the caller's own rows on the client. Tightening the rule is a design decision for the human.
- cp 5 · hooks: `useAccessList` reads the viewer's own role from its own scoped users query, not `useCurrentRole()`, so `retryLoad` can restart it.
- cp 4 · revoke: expiry is stamped from the client clock (spec); a client clock behind the server delays the effect of a revoke.
(none yet)

## Out-of-plan changes
- cp 9 · hooks/useSequenceForm.ts (keepIsSubmitted), tests/settings-sections-numbering.test.ts, SectionCard title weight (affects all settings cards).
- tests/collections-real.test.ts: the checkpoint's Files block names it as a Modify; the test writer added the cases (planned).
- docs/plans/books-settings-checkpoints.md: the untestable Tests bullet removed (see Rebuttals).
- tinycld/books/lib/books-settings-fixture.ts, tinycld/books/screens/helix-mockup.tsx (checkpoint 2 fix): redeclared types replaced by imports.
- tinycld/books/lib/account-register-fixture.ts, tinycld/books/lib/setup-wizard-fixture.ts: five empty fields added; they are typed BooksSettings and tsc fails without them.

## Phase notes
- phase 1: none
- phase 3: direction B (section list and detail) picked at the design gate; open questions 1-7 accepted with the recommended answers (see spec)
- phase 4: plan reviewed by a fresh subagent; missing/narrowed and name findings fixed; test gaps (non-admin views, access flow) moved to e2e with a collaborator user; override history classified by expires_at only; spec wording 'as needed' changed to 'when the change requires it' (plan-check tripped on the phrase); fixture not seeded (fake user ids, setup_completed would hide the setup card); review mode C
- review mode switches: none
- STOP at checkpoint 10 gate 1 (full e2e): tests/e2e/setup-wizard.spec.ts:9 fails ('Part 3 of 3', expected 'Part 1 of 3'). Cause: hooks/useBooksSetup.ts:67 `isResuming = !!settings && !settings.setup_completed && settings.business_name !== ''` (spec setup-wizard-design.md: "A book whose settings hold a business name but are not marked done is a batch left half done"); the Company form added here can save a business name before the wizard has run, and the schema forbids restoring a blank name; the e2e DB is shared by 2 workers. This is a product conflict between two units, not only a test problem: a real user who edits Company details in Settings before finishing setup makes the wizard resume at Part 3. Options: (A) setup-wizard.spec starts at Part 3 and uses Back to reach Part 1 (changes the wizard spec, leaves the product conflict); (B) a dedicated 'setup started' marker field on books_settings (unreleased migration edited in place) set by the wizard and used by isResuming, so the Company form cannot trigger a resume (needs migration + hook + wizard tests; recommended); (C) detect resume from `ownership !== ''` (written by the wizard's Ownership step only; no migration; changes the half-finished semantics when only the Business step was saved); (D) run the wizard spec first: an ordering hack, rejected. Also fixed: account-register-entry.spec.ts phone test now reads offsetHeight (the button was measured mid drawer slide-in, 43.99993).
- RESOLVED by the human's decision B: books_settings.setup_started (bool, unreleased migration edited in place), written true by the wizard on every settings write, used by isResuming = settings && !setup_completed && setup_started; the Company form never writes it; docs/specs/setup-wizard-design.md reworded. All e2e tests that write the business name or complete setup now live in one spec file (tests/e2e/books-settings.spec.ts, last describes; setup-wizard.spec.ts removed) because Playwright parallelizes by file across 2 workers sharing one books_settings row.
- (old) cp 10 state at the stop: Access section, help/settings.md, navigating-books.md edit, hardening of the settings e2e are in the tree uncommitted; design critic round 1 had two BLOCKING (row layout) fixed; round 2 critic, fix review, and the cp10 ledger entry are pending the decision.

## Checkpoint 3
- test writer: tests/useSettingsForm.test.tsx, useSequenceForm.test.tsx, harness tests/accounts-form-harness.ts (additive options); red (missing modules); untestable: none
- implementer: DONE; hooks useBooksSettings, useSettingsForm, useDocSequences, useSequenceForm, lib/refusal.ts (messageOnlyRefusal moved), useAccountForm import
- test disputes: 2 (fiscal-year/close-date tests compared the store row including $ metadata with toEqual); the checkpoint's "only that field changes" is unaffected, test wrong; fresh test writer added a $-key-stripping helper
- self-declared differences: schema typed z.ZodType<V,V>; toast variant success/3000ms; sequences ordered by doc_type
- gate 1: tests unedited: yes (after dispute) · pass (1212 tests)
- gate 3 A: optimistic rollback wipes typed values/errors (real bug): accepted, fixed with resetOptions + re-dirty; same-tick double submit: accepted, fixed with inFlight ref; useDocSequences ordering/error/retry untested and independent block saves: accepted, tests added; sequence hook missed the re-dirty and inFlight release on a throwing onError: accepted, fixed
- gate 3 B: direct react-hook-form/zod type imports: accepted, fixed
- fix review: reviewer A over the fix diffs: two passes; remaining low items rebutted
- harness change (tests/accounts-form-harness.ts) is test infrastructure named by the checkpoint

## Checkpoint 4
- test writer: tests/useCloseOverrides.test.tsx, useMyCloseOverride.test.tsx, harness extended; red (missing modules); untestable: none; three later review rounds added 17 tests
- implementer: DONE; hooks useCloseOverrides, useMyCloseOverride, useClockTick; lib/overrides.ts (toPocketBaseTime, parseExpiry exported)
- test disputes: none
- self-declared differences: names flattened in a memo (tsc blocks materialize() reads in .select()); error messages via messageOnlyRefusal/errorToString
- gate 1: pass (1251 tests)
- gate 3 A: shared inFlight, expiry computed late, no live expiry, stale revoke, queryKey, unstable identity: accepted, fixed; later rounds: early ok:true on duplicate, stale tick clock: accepted, fixed; grant key missing `lasts`: accepted, fixed
- gate 3 B: flatten outside .select() rebutted/explained; shared formatter accepted, fixed; migration list rule: Design notes
- fix review: three reviewer-A passes; clean at the end

## Checkpoint 5
- test writer: tests/useAccessList.test.tsx, useAccessMutation.test.tsx, harness extended; red (missing modules); untestable: none; four later review rounds added tests
- implementer: DONE; hooks useAccessList, useAccessMutation
- test disputes: none
- self-declared differences: async mutationFn with performMutations; viewerOrgRole from a scoped users query
- gate 1: pass (1294 tests)
- gate 3 A: readiness guard missing (duplicate core/admin rows): accepted, fixed; reload after partial failure (orchestrator decision): fixed; refusal reporting, reload failure message, no-op same level, non-refusal logging, chosen-level sticking, stale same-level guard: accepted, fixed
- gate 3 B: same readiness finding; default onError noise: accepted, fixed; generator form, user-less rows, per-row queries: rebutted
- fix review: four reviewer-A passes; last one clean apart from the ABA note (rebutted)

## Checkpoint 6
- test writer: tests/shell-nav.test.ts, books-sidebar.test.tsx (sidebar entry, 22 tests); e2e for the screens is checkpoint 10 per the plan; later rounds added tests/useSettingsShell.test.tsx (real hooks via the harness), books-sidebar-render.test.tsx, settings-schema trimming tests
- implementer: DONE; routes screens/settings/index.tsx and [section].tsx, components/settings/{SettingsShell,SectionList,SectionBody,SectionCard,CompanySection}.tsx, hooks/useSettingsShell.ts, lib/shell-nav.ts, hooks/useBooksSidebar.ts, sidebar.tsx
- test disputes: 1 (the already-open test rendered a section that does not exist yet); test fixed
- self-declared differences: sectionFromParam export; SectionList component; part=error when the settings row is missing
- gate 1: pass (1313 tests; full package e2e 62 passed, 1 skipped, the capture spec)
- gate 2: round 1 had one INVALID shot (company-long, no long values: capture spec could not type) fixed at the source with UI-driven actions; round 1 BLOCKING (only Company in the list) rebutted; round 2: no BLOCKING, NOTEs under Design notes
- gate 3 A: dirty form remounts across breakpoints, push history loop, route index vs [section] remount, sequences error blocking: accepted, fixed; B: label-string ternary, non-admin form built, trimming, Currency block: accepted, fixed
- core edit by the implementer (TextAreaInput) reverted: a core change needs its own PR and sign-off
- fix review: reviewer A over the fix diff; one finding accepted (open-section no-op), rest rebutted

## Checkpoint 7
- test writer: tests/useCloseBooks.test.tsx (15 tests), later additions for isSubmitted in useSettingsForm/useCloseBooks tests; red (missing module); untestable: none; one import dispute (test used three harness helpers it did not import)
- implementer: DONE; hooks/useCloseBooks.ts, components/settings/{AccountingSection,FiscalYearForm,CloseBooksBlock,ReopenDialog}.tsx, lib/root-errors.ts; sections registry and SectionBody
- self-declared differences: ReopenDialog on core Dialog; local MonthSelect; own-override line only with a close date
- gate 1: pass (1341 tests; full e2e 62 passed, 1 skipped)
- gate 2: no INVALID after the capture fixes; BLOCKING: duplicate error + raw key (fixed), missing override line (deferral, see Deferrals); NOTEs under Design notes
- gate 3 A: BLOCKING FormErrorSummary never rendered (isEnabled default false): fixed in Company, fiscal and close forms; then isSubmitted reset by the optimistic update hid refusals: fixed with keepIsSubmitted; B: MonthSelect/ReopenDialog rebutted; month field error render: fixed
- fix review: four reviewer-A passes

## Checkpoint 8
- test writer: tests/useOverridesPanel.test.tsx (hook-level; the checkpoint lists only the checkpoint 10 e2e); red (missing module); untestable: none
- implementer: DONE; hooks/useOverridesPanel.ts, components/settings/{OverridesPanel,OverrideRow,GrantOverrideDialog}.tsx, AccountingSection.tsx
- self-declared differences: RevokeDialog and GrantOverrideDialog on core Dialog (sheet on phone from Dialog itself); extra test ids; toast on revoke failure
- gate 1: pass (1368 tests; full e2e 62 passed, 1 skipped)
- gate 2: no INVALID, no BLOCKING; NOTEs under Design notes; the checkpoint 7 deferral is resolved by the non-admin-accounting-override shot
- gate 3 A: loading/error states missing, grant form not reset on close, dead props, settings load state missing from part, cancel during submit leaving a stale refusal: accepted, fixed; B: dead isSheet, inline label ternary: accepted, fixed; the extra unit-test file, derived form type, custom dialog: rebutted
- fix review: three reviewer-A passes

## Checkpoint 9
- test writer: tests/settings-sections-numbering.test.ts (registry entry); components are checkpoint 10 e2e; later tests/useSequenceForm.test.tsx isSubmitted cases
- implementer: DONE; components/settings/{NumberingSection,SequenceCard}.tsx, registry, SectionBody
- gate 1: pass (1374 tests; full e2e 62 passed, 1 skipped)
- gate 2: round 1 BLOCKING: card title hierarchy and wide side-by-side layout, fixed; round 2: no BLOCKING
- gate 3 A/B: dead loading branch, JSX ternary, dead summary: fixed; isSubmitted tests added; rest rebutted
- fix review: one reviewer-A pass, clean

## Checkpoint 10
- test writer: tests/e2e/books-settings.spec.ts (the plan's tests plus gaps found in checkpoints 6 to 9) and tests/help-settings.test.ts; 7 of 10 e2e were green on built behavior, the Access ones red; later hardening (no bumped timeouts, saved-level waits, independent restores, split per viewport)
- implementer: DONE; hooks/useAccessSection.ts, components/settings/{AccessSection,AccessRow}.tsx, lib registry, help/settings.md, help/navigating-books.md
- test disputes: none
- self-declared differences: Access row built on useForm per row; search via useForm+useWatch; disabled select lists all levels; extra test ids
- gate 1: pass (1387 tests; Go ok; full e2e 81 passed, 1 skipped)
- gate 2: round 1 BLOCKING (two-column row, lock text placement) fixed; round 2 BLOCKING (chip invisible in light) fixed; round 3: no BLOCKING
- gate 3 A/B: select out of sync, empty text, JSX map, search state twice, cast, read-error silence, e2e flakiness: accepted, fixed; the cross-unit wizard conflict stopped the run (see Phase notes) and was fixed by option B; per-row queries and same-tick duplicate rebutted
- fix review: seven reviewer-A passes

## Final review
- eval: approved (human: approve, with retro memory M1 dropped; lessons, memories M2 and M3, and process items applied)
- native: not executed in this run

## Checkpoint 1
- test writer: server/company_settings_test.go, tests/collections-real.test.ts; red for the right reason: yes; untestable: the bullet "a books_settings row carries the five new string fields" (vitest does not type-check; an untyped client returns any field) — resolution: removed from the Tests bullet; the Go tests cover the fields (admin sets each, seeded row empty, limits) and the fixture `satisfies BooksSettings` is the tsc-level cover
- implementer: DONE; migration fields, collections relations, fixture satisfies, seed comment; account-register-fixture.ts and setup-wizard-fixture.ts gained the five empty fields (tsc required)
- test disputes: none
- self-declared differences: none beyond the two fixture files
- gate 1: tests unedited: yes · pass (tinycld-pkg check 1135 tests, go test ./... ok)
- gate 2: n/a
- gate 3 A: 5 findings. Plan-file edit and removed bullet: rebutted (see Rebuttals); two extra fixtures: recorded under Out-of-plan; `as never` casts and offline send ignoring non-id filters: rebutted; mockup untouched: tsc passes, no CompanyDetails import
- gate 3 B: seed.ts comment length and migration header wrap: accepted, fixed; OfflinePocketBase: rebutted
- fix review: comment-only edits to seed.ts and the migration header; no logic change, so no reviewer-A pass is needed

## Checkpoint 2
- test writer: tests/settings-schema.test.ts, doc-types.test.ts, access-levels.test.ts, overrides.test.ts, settings-sections.test.ts; red (missing modules); untestable: none; a fresh test writer later added 3 tests after review
- implementer: DONE; five lib files created
- test disputes: none
- self-declared differences: preview of an invalid number returns the label only; formatExpiry swaps U+202F for a space; fiscalYearSchema takes a number
- gate 1: tests unedited: yes · pass (1181 tests)
- gate 2: n/a
- gate 3 A: ownOverrideLine used the UTC day while formatExpiry used the viewer zone: accepted, fixed; nextNumberPreview printed 1e+24 for long numbers: accepted, fixed; TZ leak in overrides test: accepted, fixed by a fresh test writer; levelPlan unused userId: rebutted; expiryFrom default: rebutted
- gate 3 B: same date finding; invisible U+202F literal: accepted, fixed; fixture redeclared OrgRole and BooksLevel: accepted, fixed (fixture and helix-mockup.tsx edited)
- fix review: reviewer A over the fix diff: clean
