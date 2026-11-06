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

- **finding:** reviewer A, checkpoint 1, #7 (part): "The `muted` tone maps to `text-foreground` (declared difference 7), so the name does not match the class. … Fix: rename the tone (`'default'`)"
  **rebutted because:** the checkpoint's Produces fixes the name for later checkpoints: "`BankImportMessage({ testID, text, tone, children }: { testID: string; text: string; tone?: 'muted' | 'danger'; children?: ReactNode })`". The name stays; a why-comment says `muted` is the calm message tone. The `alert` role part of #7 was accepted and fixed.

## Design notes
- cp 1 · choose-ofx (390, 1280): the list box — the bordered list keeps its full 480 px view height with 4 rows, so ~230–270 px of blank space sits inside the border; a `maxHeight` 480 that shrinks to the rows would keep the windowing. (The plan fixes `viewHeight: 480`.)
- cp 1 · importing (light): primary button "Importing…" — white on pale teal is low contrast while the write runs; core `ServerActionButton`'s disabled style, same in the reference; a change belongs to core.
- cp 1 · reviewer A #2: on each box press `choiceRows` formats every row (`formatDay`, `formatMoney`) and ~6 more passes run over all rows; the row `memo` does nothing because every row object and `onToggle` are new each render. A 10,000-row file pays O(n) Intl formatting per press. The brief prescribes this shape (`choiceRows` takes `chosen`); a fix memoes the formatted rows by `[preview, already, currency]` and applies `isChosen` in a cheap pass, with a stable `onToggle`.
- cp 1 · importing (after fix 6): header back link "Banking" — disabled while the import runs, but only slightly paler than enabled (`text-muted-foreground` both ways, a small opacity step), while Cancel shows a clear disabled tint; the same opacity as Cancel would make the two read alike.
- cp 1 · fix review NOTE: if another tab imports every chosen row while the Choose step is open, submit sends an empty `lines` list (fix 3 filters to ready rows) and the server's refusal shows, not the client's "Choose at least one transaction to import."
- cp 1 · fix review NOTE: the back link re-mounts when the page goes from loading to ready (it now renders inside the ready flow to read `isBusy`), so web focus on it is lost at that moment.
- phase 4: e2e uses fresh number-less Bank accounts (`createBankTestAccount` + `connectAccount`), not 1000 Business Checking as spec §4 Tests says: `banking-page.spec.ts` asserts "1 file waiting" on 1000 and `banking-keys.spec.ts` reads its files, and the shared DB runs two workers. An imported connection cannot be disconnected, so those test connections stay.
- phase 4: date-format guess reads only the date column's cells that parse in at least one format ("Pending", "13/45/2026" are left out). The spec's literal "every non-blank cell" would give the fixture checking CSV no format, while the reference `map` state shows MM/DD/YYYY.
- phase 4: header guess ties are broken by exact match before contained match, leftmost first, a column taken by an earlier field skipped (so "Transaction Date, Description" gives Date 1, Description 2).
- phase 4: `columnOptions` takes no header flag: header or not, the label reads `rows[0]` (the header text or the first body cell), which is the spec's rule.
- phase 4: the file's account is read with its own live query, not `useRecord`, because `useRecord` has no error state.
- phase 4: the seeded card statement `card-2026-10.ofx` (2100) changes the 2100 card's file list; checkpoint 1 updates `banking-page.spec.ts` and `banking-keys.spec.ts`, and adds `:not([data-testid^="bank-file-import-"])` to the three banking specs' file-row locators.

## Out-of-plan changes
- cp 1 (fix 4): `tinycld/books/hooks/useRemoveBankFile.ts`, `tinycld/books/components/banking/RemoveBankFileDialog.tsx`, `tinycld/books/components/banking/BankingDialogs.tsx` — the Remove of a file runs in the dialog and its hook, not in `BankAccountPanel` (which only opens the dialog); a successful Remove now clears that connection's `done` upload state when its `fileId` is the removed file, so "Import transactions" never points at a removed file.

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

## Checkpoint 1
- test writer: tests/bank-import-view.test.ts, tests/bank-import-form.test.ts, tests/bank-import-mapping-fixture.test.ts, tests/bank-connections.test.ts, tests/e2e/bank-import-helpers.ts, tests/e2e/bank-import-mapping.spec.ts, tests/e2e/banking-page.spec.ts, tests/e2e/banking-keys.spec.ts, tests/e2e/banking-upload.spec.ts; red for the right reason: yes (missing modules, missing `BANK_IMPORT_SEED_STATEMENT`, old status label, no `bank-upload-import`, no seeded card file); one fixture-data test passed at once (it checks data the fixture already had); untestable: none
- plan conflict (settled by the runner before the implementer): Interfaces "every row `already` → allImported" vs e2e test 1, which expects `bank-import-all-imported` for a file whose only remaining row is an error row ("PENDING"). Rule taken from the e2e: no row → empty; no ready row and at least one already row → allImported; else null. Unit case `[already, error] → 'allImported'` added by the test writer.
- implementer: built the route, reads, states, Choose step, import and result, Banking entry points, status label, seeded card OFX; DONE
- test disputes: e2e test 4 "shows the load problems with a way out", step (c) re-opened the same file ~2 s after step (a); pbtsdb parks a released subset for `subsetGcTime` (5 s) and reuses it with no request, so the faked 400 was never requested. Settled against the test, by the checkpoint's own text: "an earlier load would serve it from the store inside the release grace window". Fresh test writer: step (a) now uses the seeded `checking-2026-09.csv` (1000), step (c) the seeded `card-2026-10.ofx` (2100); every assertion kept; no wait or timeout.
- self-declared differences: 7 (cp1-impl.md): `useBankImport` also returns `header` (the unreadable state shows the file lines); waits for the materialized connection before deciding not-found; preview memo keyed on the nine watched strings (biome exhaustive-deps); contents rows parsed in a `useMemo`; OFX default `lines` computed at form creation; "Import transactions" disabled while writes are blocked; `bank-import-map` on the CP1 Map button row, `bank-import-band` on the band container, `BankImportMessage` muted tone draws `text-foreground`.
- gate 1: tests unedited: yes · pass (check 4036 tests; `-g "bank-import-mapping:"` 4/4; banking-page 3/3, banking-keys 3/3, banking-upload 2/2)
- gate 2: invalid shots: none (14 shots × 390/1280 × light/dark = 56; capture run 1 let a held create through to the fresh e2e DB when the scratch spec un-routed it — scratch spec now aborts held writes before un-routing, adds `'abort'` / `{ ok }` write answers and id `lookups`; run 2 had no write on `books_bank_imports`) · blocking: none · notes: 2, listed under Design notes
- gate 3 A (correctness): #1 BLOCK OFX default lines re-map the file every render → accepted (fix 1); NOTEs #3 stale "Import transactions" after Remove, #4 unfiltered `lines` at submit, #5 loading forever with no connection, #6 back link live during the import, #7 `alert` role on calm messages, #8 role cast → promoted to fixes 2–7 (real defects in files the checkpoint touches; #7 keeps the Produces tone names, see Rebuttals); #2 → Design notes
- gate 3 B (conformance): script lines: 0 real, 1 false positive (4 live queries in `useBankImport.ts`: the brief's four named reads, none stitched) · #1 same as A #1 → accepted; #2 `'listitem' as AccessibilityRole` cast → accepted (fix 2)
- fix round 1 (`cp1-fix.md`, 7 items: causes spec-logic ×2, conformance, write-guard, record-state, load-state, other: a11y role): all fixed; one declared difference (fix 4 lives in the Remove dialog and hook, see Out-of-plan); `capture.json` formatted with biome. Gate 1 again: check 4036 tests, `-g "bank-import-mapping:"` 4/4, banking-page 3/3, banking-keys 3/3, banking-upload 2/2. All 14 shots captured again (no write reached the DB).
- fix review: round 1: clean — 0 BLOCK; 2 NOTEs to Design notes (fix 5 checked: a live query is ready only when its `materialize` demands settle, so no not-found flash) · fresh critic on `error-*` / `importing-*`: 0 blocking, 1 NOTE to Design notes
- gate 3 A notes: 1 (#2) under Design notes
- reviewer-caught deferrals: none

## Final review
- eval:
