# transfer — helix run ledger

- mode: unattended
- unit: p3-transfer
- started: 2026-11-04
- package branch: books/p3-transfer   core checkout: main (3eb7915e)
- spec: docs/specs/transfer-design.md
- checkpoints: docs/plans/transfer-checkpoints.md
- reference: docs/plans/transfer-reference/
- evidence: docs/plans/transfer-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/transfer-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - From → to read as one statement, each with its balance → expressible (two core `SelectInput`s with `indent`; balance line `text-sm text-muted-foreground tabular-nums`, `text-danger` below zero; lucide `ArrowRight` wide / `ArrowDown` phone, `useThemeColor('muted-foreground')`)
  - The amount is the largest figure → expressible (header figure `text-2xl font-semibold text-foreground`, as `EntryHeader`'s big total)
  - One band for what moves the money → expressible (`rounded-xl border border-border bg-surface-secondary p-4`, the Books `SectionCard` surface)

## Deferrals
(none yet)

## Rebuttals
- **finding:** plan reviewer, checkpoint 1: "This is a full existing spec file run outside the 12-run e2e budget. Fix: narrow it to one existing test (`-g "<one title>"`) and count it in the budget line, or get approval for it as an exception."
  **rebutted because:** the narrowing was taken (the boot now runs one existing test, `-g "read-only view \(desktop\) posted entry"`); counting it was not, because the budget rule reads "A screen adds at most 12 e2e tests in all its checkpoints, desktop and phone runs counted" (helix references/checkpoints.md) and the boot adds no test to this screen; it only starts the e2e server so the seed runs, as the vendor-1099 plan's checkpoints 1 and 2 did ("boot the e2e server once through `vendor-form-list.spec.ts`, not counted").

## Design notes
(none yet — gate-2 NOTEs the loop did not act on, as
`cp N · <shot>: <where> — <what>`; shown to the human at each checkpoint
and again at the end)

## Out-of-plan changes
(none yet — every file touched that no checkpoint's Files block named, with why)

## Phase notes
- phase 1: design packet ~/tmp/tinycld/auto-helix-books/staging/p3-transfer/packet.md (intake.md beside it); no corrections at the design gate.
- phase 3: design gate 2026-11-04 — the human picked direction A (full-page form like the journal entry form, own read view); open questions 1–14 accepted as recommended (spec written with them); no sparks dropped; no [platform] items; no core extension.
- phase 3 pass 2: direction A built as the scratch route (tinycld/books/screens/helix-mockup.tsx) over the fixture tinycld/books/lib/transfer-fixture.ts; reference captured to docs/plans/transfer-reference/ (17 states × 390/1280 × light/dark = 68 PNGs: new, filled, errors-blank, errors-same, refusal, refusal-line, draft, edit-posted, posted, void, reader, void-dialog, no-access, cannot-edit, not-found, loading, error) from docs/plans/transfer-capture.json; unattended, so no human reference corrections; no sparks dropped (all three built from core parts and existing tokens); route corrections before the final capture: "Too large" amount within the parser's range, line refusal shown without its "Line 2:" prefix (parseLineRefusal), void dialog captured after its fade-in, phone account fields no longer flex-1 in the stacked column. Fixture dependency: `TransferEntry` stands in for BooksJournalEntries until the migration checkpoint adds doc_type 'transfer' (2100000001/2100000002); 1010 Business Savings joins lib/seed-accounts.ts in that checkpoint.
- phase 4: plan docs/plans/transfer-checkpoints.md, 7 checkpoints (1 type/sequence/seed, 2 server rules and labels, 3 client helpers, 4 read view and links, 5 form/save/post, 6 refusals/edit/void/delete, 7 entry points and help); 12 of 12 e2e runs (phone: the void test, the register Post & new test). Spec deviation, verified: the sequence row id is `booksseqtransfr` (PocketBase ids are exactly 15 characters; `booksseqtransfer` has 16). Driver decisions recorded in the plan (back label via useBackToEntries, VoidDialog as-is, placeholder "Choose an account", draft More after Post on wide, error Retry only, read actions in EntryReadOnlyActions). Plan-review findings fixed (16 reported; 15 fixed, 1 partly rebutted, see Rebuttals): shell-nav "product after journal-entry" test changed in cp5; openEntriesList before searchEntries in cp4 test 3; useTransferDetail returns `amount`; `currency` props on TransferBand/TransferAccountField and its source in NewTransferScreen; Go `accountType` two-value call; TOO_LARGE_TEXT/formatAmountOnBlur path and settings `hasLoadError`; the inactive-account draft (trigger label + real `Line 2: account <name> is inactive.`) driven in cp6 test 1 with createAccount/makeAccountInactive; cannot-edit driven in cp6 test 2; `transferAccountBalance` unit test and an exact `Balance $0.00` e2e check; form labels and help icon asserted; revealRegisterItem for register rows; the overdraft test moves balance + $100, not $10M; DateField null → ''; three stale help passages rewritten in cp7 and tested; a transfer's void reversal (doc_type transfer, origin void_reversal) opens at books/entries/<id> (entryHref and transferViewState take origin; the spec does not name this row). Review mode: C (unattended).
- review mode switches: none

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
