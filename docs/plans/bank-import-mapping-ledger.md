# bank-import-mapping — helix run ledger

- mode: unattended
- unit: p4-import-mapping
- started: 2026-11-06
- package branch: books/p4-import-mapping   core checkout: main (aa16a677)
- spec: docs/specs/bank-import-mapping-design.md
- checkpoints: docs/plans/bank-import-mapping-checkpoints.md
- reference: docs/plans/bank-import-mapping-reference/
- evidence: docs/plans/bank-import-mapping-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/bank-import-mapping-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - One plain question per control → expressible (core `SelectInput` with the question as `label`; `text-base font-semibold text-foreground` section headings; `gap-4`)
  - Calm checklist with aligned amounts → expressible (Books `SelectBox` from `AccountSelectBox`, fixed-height rows `border-b border-border` in `useRowWindow`, `text-right tabular-nums` amounts, `ListHeaderCell`)
  - Step rail with green check circles → dropped (Books already has `ImportSteps`; a second step style would be a one-off)

## Deferrals
(none yet)

## Rebuttals
- phase 4 plan review #13 (statement file order, `text-danger` below zero untested): kept as not driven by e2e — the seed has one statement per connection and a card statement reads positive; `statementBalance` is unit-tested and gate 2 `banking` shows the line. Listed in the plan's "Not driven" list.
- phase 4 plan review #21, Retry part (statement line not wired to the Banking page's Retry): a per-card recovery in the page model for an optional line; the error is logged instead.
- phase 4 plan review #23 (prefill load error untested): same code path as the other reads' Retry, which CP1 test 4 drives.
- phase 4 plan review #30 (10,000-row windowing untested): `useRowWindow` is shared and tested where it was built; the list uses it with a fixed row height.
- phase 4 plan review #33 (help test for the date-format guess wording): optional; the help test checks "date format".
- phase 4 plan review #20, signature part (spec §4 helper signatures differ): the plan's helpers take the computed `ChoiceRow[]`; same behavior. Only the case-only clash was fixed (`bankImportStepLabels`).

## Design notes
- phase 4: e2e uses fresh number-less Bank accounts (`createBankTestAccount` + `connectAccount`), not 1000 Business Checking as spec §4 Tests says: `banking-page.spec.ts` asserts "1 file waiting" on 1000 and `banking-keys.spec.ts` reads its files, and the shared DB runs two workers. An imported connection cannot be disconnected, so those test connections stay.
- phase 4: date-format guess reads only the date column's cells that parse in at least one format ("Pending", "13/45/2026" are left out). The spec's literal "every non-blank cell" would give the fixture checking CSV no format, while the reference `map` state shows MM/DD/YYYY.
- phase 4: header guess ties are broken by exact match before contained match, leftmost first, a column taken by an earlier field skipped (so "Transaction Date, Description" gives Date 1, Description 2).
- phase 4: `columnOptions` takes no header flag: header or not, the label reads `rows[0]` (the header text or the first body cell), which is the spec's rule.
- phase 4: the file's account is read with its own live query, not `useRecord`, because `useRecord` has no error state.
- phase 4: the seeded card statement `card-2026-10.ofx` (2100) changes the 2100 card's file list; checkpoint 1 updates `banking-page.spec.ts` and `banking-keys.spec.ts`, and adds `:not([data-testid^="bank-file-import-"])` to the three banking specs' file-row locators.

## Out-of-plan changes
(none yet)

## Phase notes
- phase 1: unattended; intake in auto-helix staging (p4-import-mapping/intake.md).
- phase 3: design gate 2026-11-06 — direction A (stepped page) picked; open questions 1–12 accepted as recommended (no auto-open after upload; account fixed to the file's connection; mapping remembered from the newest fitting CSV import; every ready row chosen at first; Import offered on every file; card statement balance negated; result shows counts + Back to Banking; status "Imported: N transactions"; keys ⌘↵/Esc/a/i + wide-web autofocus; Memo/Check number mapping cut; seed OFX file with a balance on 2100 Company Card). No `[platform]` items. No core extension.
- phase 3 pass 2 (2026-11-06, unattended): reference captured for direction A. Fixture `tinycld/books/lib/bank-import-mapping-fixture.ts` (typed with `satisfies` against the generated `BooksBankFileContents` / `BooksBankFiles` / `BooksBankImports`; no seed wiring yet), scratch route `tinycld/books/screens/helix-mockup.tsx` (`/a/books/helix-mockup?state=…`), manifest `docs/plans/bank-import-mapping-capture.json`, reference `docs/plans/bank-import-mapping-reference/` — 20 states × 390/1280 × light/dark = 80 shots: map, map-one (no header, one amount column, remembered intro, card account), map-errors, map-preview-errors (DD/MM/YYYY reads Oct 1 as Jan 10), choose, choose-ofx, choose-none, importing, refusal, transport, result, result-none, empty, all-imported, loading, error, not-found, unreadable, read-only, banking (card statement line, "Import transactions" after upload, Import/Remove per file, "Imported: N transactions"). No spark dropped here (the step rail was dropped at the design gate). Human corrections: none (unattended).
  - Spec change: the "First rows" preview shows a muted prompt while the mapping is incomplete; without it the parser quotes an empty format ("… in the  format."). Added to spec §Map columns.
  - The import screen scrolls in its own ScrollView, so `fullPage` does not lengthen a capture; long shots set `height` in the manifest. Gate-2 manifests must do the same.
  - Fixture facts: the checking CSV has 40 body rows (lines 2–41); errors on lines 14 ("13/45/2026"), 19 (money in and money out) and 27 ("Pending") — 3 errors, not 2; lines 2–7 already imported; line 24 left unchosen in the reference (30 chosen). The wide map layout puts the sample table (480 wide, scrolls sideways) to the right of the questions; on a phone it comes first. The run copy of helix-capture.spec.ts has the per-shot capture loop moved into `captureOne` (biome noExcessiveCognitiveComplexity 47 > 45 in the template).
- phase 4 (2026-11-06, unattended): plan `docs/plans/bank-import-mapping-checkpoints.md`, 3 checkpoints — 1 import page + OFX import + Banking entry points + seeded card OFX (4 e2e); 2 CSV Map columns step, guesses, prefill, Back/Change mapping, empty file (3 e2e); 3 statement line, keys `i`/⌘↵/Esc/`a`, focus, help topic `books:bank-import` (2 e2e + 1 help-screenshot entry). E2E budget 11 of 12. plan-check `--unattended`: 0 errors (warnings only: Produces names not repeated later). Review mode C.
  - Plan review (general-purpose; report in staging `p4-import-mapping/plan-review.md`): 33 items. Fixed 21: #1 CSV reopen path in test 5; #2 prefill proven by a changed sign; #3 Cancel id on the OFX Choose step; #4 Cancel driven on Map and Choose; #5 load-problem steps reordered so no contents row is in the store before a faked read; #6 preview memo keyed on the nine mapping strings; #7 bank details asserted; #8 OFX memo asserted; #9 "Importing…" and disabled controls through a held route; #10 field-keyed refusal; #11 empty CSV file + Change mapping in test 6; #12 phone select; #14 `i` opens the newest of two files; #15 Esc on an open select menu; #16 account query declared a deviation; #17 near-placeholder fragments; #18 `isCsv` in the key signatures; #19 `BankImportMessage` / `BankImportToBanking` in Produces; #20 `importSteps` → `bankImportStepLabels`; #21 statement load error logged; #22 result step shows `LoadingState` until its row is in the store. Rebutted 6 (see Rebuttals). The rest: nothing found.
- review mode switches: none

## Final review
- eval:
