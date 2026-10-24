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
(none yet)

## Rebuttals
- **finding:** reviewer A and B, checkpoint 1: the "books_settings row carries the five new string fields" test bullet was removed from the plan (DEFERRAL)
  **rebutted because:** the test writer reported it UNTESTABLE as a red test: "Vitest does not type-check, and an untyped PocketBase client returns whatever fields it is given." The fields are asserted by server/company_settings_test.go (admin sets each, seeded row empty, length limits) and by `satisfies BooksSettings` in the fixture under tsc. Nothing the user sees is missing.
- **finding:** reviewer B, checkpoint 1: `OfflinePocketBase` hand-writes `send` and uses `as never` casts
  **rebutted because:** it fakes only the network layer of the real pbtsdb collections (the checkpoint says "with real pbtsdb collections"); no shared helper exists for an offline PocketBase (grep of tests/ finds none).

- **finding:** reviewer A, checkpoint 2: `levelPlan` takes `userId` and never uses it
  **rebutted because:** the checkpoint's Interfaces block gives the signature with `userId`; checkpoint 5 builds the writes with it.
- **finding:** reviewer A, checkpoint 2: `expiryFrom` silently falls back to 24h on an unknown `lasts`
  **rebutted because:** the `LastsFor` type blocks it at compile time and `overrideSchema` enforces it at runtime (reviewer: "Acceptable").

## Design notes
(none yet)

## Out-of-plan changes
- tests/collections-real.test.ts: the checkpoint's Files block names it as a Modify; the test writer added the cases (planned).
- docs/plans/books-settings-checkpoints.md: the untestable Tests bullet removed (see Rebuttals).
- tinycld/books/lib/books-settings-fixture.ts, tinycld/books/screens/helix-mockup.tsx (checkpoint 2 fix): redeclared types replaced by imports.
- tinycld/books/lib/account-register-fixture.ts, tinycld/books/lib/setup-wizard-fixture.ts: five empty fields added; they are typed BooksSettings and tsc fails without them.

## Phase notes
- phase 1: none
- phase 3: direction B (section list and detail) picked at the design gate; open questions 1-7 accepted with the recommended answers (see spec)
- phase 4: plan reviewed by a fresh subagent; missing/narrowed and name findings fixed; test gaps (non-admin views, access flow) moved to e2e with a collaborator user; override history classified by expires_at only; spec wording 'as needed' changed to 'when the change requires it' (plan-check tripped on the phrase); fixture not seeded (fake user ids, setup_completed would hide the setup card); review mode C
- review mode switches: none

## Final review
- eval: pending
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
