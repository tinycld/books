# journal-entries — helix run ledger

- mode: unattended
- unit: p1-journal-entries
- started: 2026-10-24
- package branch: books/p1-journal-entries   core checkout: main
- spec: docs/specs/journal-entries-design.md
- checkpoints: docs/plans/journal-entries-checkpoints.md
- reference: docs/plans/journal-entries-reference/
- evidence: docs/plans/journal-entries-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/journal-entries-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - debit/credit totals and out-of-balance amount always in view → expressible (totals strip outside scroll; text-success / text-destructive; formatMoney)
  - fixed right-aligned Debit and Credit columns → expressible (shared header/row cell style constants, non-shrinking)
  - primary action always in reach → expressible (sticky bg-surface border-t action bar)

## Deferrals
(none yet)

## Rebuttals
- **finding:** reviewer B, cp1, capture.json (out-of-plan): "unstage it"
  **rebutted because:** `tinycld-pkg check` fails biome format on docs/plans/journal-entries-capture.json; the formatted file is the only way the check is green. Content unchanged.
- **finding:** reviewer B, cp1, seed.ts:1066-1111 duplicates postEntry
  **rebutted because:** checkpoint Files block: "add `seedJournalEntries(pb, ctx, ids)` called after `seedRegisterEntries`" (a separate function); minor.
- **finding:** reviewer A, cp1, accounts-only line passes postSchema (server refuses "Line n has no amount")
  **rebutted because:** checkpoint Do 2: "adding at least two lines with a non-zero amount and `sumLines(...).isBalanced`"; the server message is mapped by parseLineRefusal.
- **finding:** reviewer A, cp1, an already-reversed posted entry still gets `void`
  **rebutted because:** spec "Void (posted)" and checkpoint test bullet "`isReversed: true` removes `reverse`" only; spec: "Refusals show in the dialog (closed period, already reversed by JE-n)".
- **finding:** reviewer A, cp1, DEFERRAL: seed has no test, not run
  **rebutted because:** checkpoint "Tests it must add" lists four files and no seed test. Implementer ran the full e2e stack and inspected seeded rows in pb_test_data (draft stays draft, posted JE 10, reversed 11 with reversal 12 and mirrored lines, voided 13, auto-reverse 14); gate 1 re-ran full e2e green.
- **finding:** fix-review A, cp1, `[A-Z]{1,3}\$` accepts any 1-3 letters before `$` ("ABC$5")
  **rebutted because:** the shape is that of real symbols ("CA$", "US$", "R$", "USD$"); parseAmountText has no currency argument (Interfaces: `parseAmountText(text: string)`), so the book currency cannot be checked; the amount is re-formatted on blur.
- **finding:** fix-review A, cp1, formatAmountOnBlur output not re-parseable for currencies whose format has an ISO-code prefix/suffix (CHF, KWD)
  **rebutted because:** checkpoint contract is `formatAmountOnBlur('1234.5','USD')` is `$1,234.50` (symbol kept); settings migration pins currency (default USD, `updateRule` unset). Symbol currencies (EUR, GBP, CAD, JPY) round-trip and are tested. Recorded under Design notes for the driver.


## Design notes
- phase 3: core TextInput/TextAreaInput cannot sit in a shared-width table or card cell on web: the input keeps its intrinsic width (inner flex row has no min-width 0) and overflows the cell, even with wrapperProps. The reference binds core PlainInput through useController for the Debit, Credit and line Memo cells (`min-width: 0`, `width: 100%`); the build should do the same, or extend core (needs a human decision, none taken).
- phase 3: reference leaves totals strip and action bar outside the scroll area; on phone the app's MobileTabBar sits under the action bar.
- phase 3: no docs/helix-lessons.md exists in the package yet, so no lessons were applied.

## Out-of-plan changes
- tinycld/books/lib/money.ts: formatMoney built from integer cents (exact near 2^53, always 2 decimals); parseMoney accepts one optional currency prefix. Found by tests: amountText(maxStoredAmount) lost a cent.
- tinycld/books/lib/register-range.ts: exported `nextMonthStart` (calendar arithmetic stays in this file; used by defaultReverseDate).
- docs/plans/journal-entries-capture.json: biome format only.
- tests/money.test.ts, tests/register-range.test.ts: tests for the above (test writer).

- cp1: planLineWrites also updates a saved line whose index changed (position = index in `next`); `saved` must be in (position,id) order with contiguous positions, so the cp5/6 caller must sort saved lines. Deleting the first line of N rewrites N-1 positions.
- cp1: formatAmountOnBlur round-trips for symbol currencies only (see Rebuttals); Hermes support for formatToParts is assumed, not run on device.

## Phase notes
- phase 1: none (unattended; intake in staging)
- phase 3: direction A picked at the design gate; no sparks dropped (all three expressible, none needed a one-off style). Reference captured 2026-10-24: 10 shots x 390/1280 x light/dark in docs/plans/journal-entries-reference/ (list, list-empty, list-no-match, new, new-unbalanced, new-lines, new-unbalanced-lines, posted, void, reverse). `new-lines*` scroll the form to the line grid, which the header fields push off a phone's first screen. No human corrections (unattended).
  - fixture: lib/journal-entries-fixture.ts, typed against generated BooksJournalEntries / BooksJournalLines; wire into seed.ts at checkpoint 1.
  - date field in the reference is core TextInput (YYYY-MM-DD); core DateField decision stays open for the build.
  - capture spec copy (scratch) waits for the ready element's box and opacity to hold still before a shot; without it a Dialog/Sheet re-mounting on the viewport change was photographed mid-animation or not yet shown.
- phase 4: plan written and checked (docs/plans/journal-entries-checkpoints.md); subagent review findings fixed; review mode C
- review mode switches: none

## Final review
- eval:
- native: not executed in this run

## Checkpoint 1
- test writer: tests/entry-lines.test.ts, entry-schema.test.ts, entry-actions.test.ts, entry-messages.test.ts; red for the right reason: yes (modules missing); untestable: none. Seed bullets have no test bullet (plan lists none).
- implementer: lib/entry-lines.ts, entry-schema.ts, entry-actions.ts, entry-messages.ts, fixture ENTRIES_SEED/JOURNAL_SEED/JournalSeedEntry, seed.ts seedJournalEntries; DONE
- test disputes: none
- self-declared differences: formatMoney precision fix (money.ts); nextMonthStart (register-range.ts); negative amounts rejected (matches server "amounts cannot be negative"); memo-only line needs account; difference is absolute; parseLineRefusal keeps whole text for "Line n has ..."; entryResolver type derived from useForm
- gate 1: tests unedited: yes (a biome format of the test writer's files, no content change) · pass (check exit 0, full e2e 61 passed 1 skipped); re-run after each fix round, pass
- gate 2: n/a (nothing renders)
- gate 3 A: accepted+fixed: reorder not written (planLineWrites); non-USD blur round trip (parseMoney prefix); negative credit path; money untested near max; entryResolver untested; postSchema "at least two lines" test not discriminating; fixture comment. Rebutted: see Rebuttals.
- gate 3 B: accepted+fixed: derive types in entry-actions/entry-messages; cast in money.ts removed; negative credit path; direct nextMonthStart test; misnamed test. Rebutted: capture.json, seed duplication.
- fix review: two reviewer-A passes over fix diffs; findings fixed: symbol list (Hermes-safe, no \p{Sc}), JPY two decimals, try/catch scope, planLineWrites precondition documented; rest rebutted.
- reviewer-caught deferrals: none kept (test gaps fixed by fresh test writer dispatches)
