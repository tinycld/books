# sales-tax-liability — helix run ledger

- mode: unattended
- unit: p5-sales-tax-liability
- started: 2026-11-14
- package branch: books/p5-sales-tax-liability (from books main 18a4e10)   core checkout: books/p5-sales-tax-liability (from core main 58bafaec); checkpoint 0 on core branch books/p5-sales-tax-liability
- spec: docs/specs/sales-tax-liability-design.md
- checkpoints: docs/plans/sales-tax-liability-checkpoints.md
- reference: docs/plans/sales-tax-liability-reference/
- evidence: docs/plans/sales-tax-liability-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/sales-tax-liability-capture.json
- review mode: C — none (unattended)
- core extension: U1 union source (`reports.Source.Parts`) and G2 `columns[].blankAbove` at spec version 4 (no bump; spec §4) — checkpoint 0, core PR on branch books/p5-sales-tax-liability, merges at the next design gate, before the package PR; the lane holds `exclusive` (Q6, design gate 2026-11-14). Depends on p5-drill-down's core `detail.open` (not merged at the gate; the human added p5-drill-down to this unit's manifest depends, Q3).
- sparks:
  - the tax owed to each agency is the figure the eye lands on (agency total shows the tax alone) → needs extension (accepted 2026-11-14): core G2 `blankAbove: "byRate"` on Gross total, Non-taxable, Taxable amount; core `ReportRow` subtotal style; no new token

## Deferrals
- **agreed:** design packet Q1: "Cash-basis tax follows payments … recommended: accrual only now; record a deferral (reason 1, upstream dependency verified missing) to p2-receive-payment, whose manifest description the human extends: \"add the Accrual / Cash method param to the Sales Tax Liability report\""
  **built:** accrual basis only: a document counts by its own date; title description and help say "accrual basis" (spec §3, §6)
  **reason:** missing dependency
  **blocker evidence:** p2-receive-payment (manifest unit, not merged). Verified 2026-11-14 on books branch books/p5-sales-tax-liability (from main 18a4e10): no payment collection in `books/pb-migrations/` (`2100000001`–`2100000016`; the only payment fields are `payment_terms` on customers, invoices and bills, and `payment_method` on sales receipts — no payment or payment-allocation collection)
  **impact:** a business that files sales tax on a cash basis cannot get its figures from this report; it shows tax by document date, not by when the customer paid
  **unblock:** p2-receive-payment merges a payment collection with allocations to invoices; that unit adds the Accrual / Cash method param to `books.sales_tax_liability` (the human extends its manifest description)
  **tracked in:** master-ledger unit p2-receive-payment
  **found by:** design gate (packet Q1, accepted by the human 2026-11-14)
  **checkpoint:** none (decided at the design gate, before checkpoints)

## Rebuttals
- **finding:** reviewer B, checkpoint 1, DEFERRAL: "Do step 5 (the ripple e2e run) was not done. … The other 19 specs … are still not run. … The driver must run them before the checkpoint is closed."
  **rebutted because:** the runner ran Do 5 as part of gate 1 before the reviewers were dispatched; the implementer's prompt gave Do 5 to the runner. All 20 specs of Do 5 ran once on ports 7220/7221 in three runs, all green: `customer-pages-balance`, `customer-pages-transactions`, `customer-form-page`, `customer-form-list`, `invoice-form-post`, `sales-receipt-form`, `tax-rates-page` (21 passed); `tax-rates-actions`, `tax-rates-dialogs`, `list-paging`, `account-register-drawer`, `account-register-navigation`, `account-register-states`, `account-register-table` (25 passed); `chart-of-accounts-balance`, `general-ledger`, `journal-report`, `profit-and-loss`, `trial-balance`, `balance-sheet` (55 passed) — staging `cp/cp1-e2e-{1,2,3}.log`. Reviewer A read the same logs ("Ripple e2e logs cp1-e2e-1/2/3: 21, 25, 55 passed, no failure").

## Design notes
- cp 0 · populated-390-*, rate-open-390-*, collapsed-390-*: bottom tab bar — a "Sales Stub" tab shows (the core e2e stub package is installed on the core branch's e2e stack); not in the shipped app.
- cp 0 · populated-390-*/1280-*: column header row — "TAX NAME" starts about 4 px left of the row labels' inset (x 12 against 16; 336 against 340); the reference has the same offset (core header inset).
- cp 0 · rate-open-390-*: document row "2026-10-06 · Invoice 1042 · Harborview Hospitali…" — the customer name is cut with an ellipsis on one line; the reference does the same.
- cp 0 · rate-open-390-*/1280-*: document rows — the date is ISO ("2026-10-06") while the heading writes the period in words; the reference does the same.
- cp 0 · collapsed-390-*: closed agency rows — "Old county agency" has its figure on the label line, the two longer names on a second line, so the rows have two heights; the reference does the same.
- cp 0 · reviewer A NOTE: `core/server/reports/rules.go` `unionSelect` stem `"u_" + key with "." → "_"`: keys `a_b.c` and `a.b_c` give the same stem; a statement reading both binds the same param name twice and `mergeParams` stops the run. No package makes such a pair today.
- cp 0 · reviewer A NOTE: a union row's id is its part record's id (ruling R1): two parts holding the same id join together and give two detail rows with one key. Random client ids cannot collide; fixed seed ids must stay unique across invoices and sales receipts (checkpoint 1's seed).
- cp 0 · reviewer A NOTE: stub `ReturnForm` (`tests/scripts/reports-stub/screens/index.tsx.txt`) has no `onError`; a failed insert makes `addReturn` time out on "Saved …" instead of naming the cause (test fixture only).
- cp 0 · reviewer A NOTE: ruling 11 (the phone view draws no cell for a blank amount) — accepted; the e2e pins it at 390.
- cp 1 · reviewer A NOTE: the server numbers the seeded documents, so a seeded row's number and sequence are not the fixture's `number` / `sequence` (1040, 1042, …), and `documentLabel(fixture)` does not match a seeded row's label. Checkpoints 2 and 3 must not assert seeded document labels or date-then-number order from the fixture's numbers: read them from the snapshot, or assert only the documents the e2e creates.
- cp 1 · reviewer A NOTE: `seed.ts` `seedSalesTaxLiability` sends `terms: 'due_on_receipt'` as a literal; the value is the one `seedInvoices` sends for the Due-on-receipt fixture invoice (`invoice-form-fixture.ts` 172/188/208), but no shared constant names it.
- cp 1 · reviewer A/B NOTE: the gate-3 script lists the Files block's glob paths (`docs/plans/sales-tax-liability-reference/populated-*` …) as out-of-plan; it does not match `*` patterns (helix script, not this feature).

## Out-of-plan changes
(core repo, checkpoint 0; files the checkpoint's Files block did not name)
- `core/server/reports/layout.go` — blank cell for a layout computed row that reads a blank-above section (ruling R6/R8 consequence, a whole-branch review finding); fixed again in the fix round (`blankReadLevel`).
- `core/server/reports/section_percent.go` — refuses `percentOfSection` over a blank-above column (whole-branch review finding).
- `core/server/reports/lookup.go`, `core/server/reports/run.go` — union lookups bounded per part, topics of every part (core plan R15).
- `core/reports/lib/__tests__/statements-docs.test.ts` — the brief's "Docs" test bullet (help and packages.md assertions).
- `tests/e2e/reports-helpers.ts` — `ACTIVITY_SOURCE`, `addReturn` for the union e2e.
- `tests/e2e/reports-period-pivot.spec.ts` — a step pinning the formula error now shown under the column (builder change from a whole-branch review finding).
- `tests/scripts/reports-stub/pb-migrations/2090000300_salesstub.js.txt`, `tests/scripts/reports-stub/screens/index.tsx.txt`, `tests/scripts/reports-stub/server/register.go.txt` — the salesstub templates that hold `salesstub_returns` and the union source (core plan R13); `screens/index.tsx.txt` and `scaffold-reports-stub.ts` also reformatted at gate 1 (biome refused the scaffolded files).

(books, checkpoint 1)
- `tinycld/books/lib/invoice-form-fixture.ts`, `tinycld/books/lib/sales-receipt-form-fixture.ts` — their `denverTaxLines` build the generated `BooksInvoiceTaxLines` / sales-receipt tax-line type, which now requires `gross_amount` and `currency`, so tsc refused them; each now reads its document from `INVOICES` / `SALES_RECEIPTS` by id and sets `gross_amount` = its `subtotal`, `currency` = its `currency` (throws on an unknown id). Found by reviewers A and B; accepted.

## Phase notes
- phase 1 (design gate 2026-11-14): no corrections to the intake extractions. Spark 1 (agency total shows the tax alone) accepted as a needs-extension spark → core G2.
- phase 2 (design gate 2026-11-14): open questions Q1–Q11 accepted as recommended in the packet:
  - Q1 accrual basis only; cash basis deferred to p2-receive-payment (see Deferrals).
  - Q2 default period Last month.
  - Q3 document rows open their document through p5-drill-down's core `detail.open`; p5-drill-down is not merged yet (lane default still building it); the human adds p5-drill-down to this unit's manifest `depends`.
  - Q4 sales with no tax rate are not in the report; help says so.
  - Q5 a "Liability report" button in the Sales tax page header, through a new Books hook `useShippedReportHref('books.sales_tax_liability')`.
  - Q6 the lane holds `exclusive` for checkpoint 0.
  - Q7 G2 at spec version 4, no bump.
  - Q8 core union source U1 (`Source.Parts`), not one merged Books tax-line collection.
  - Q9 snapshot `gross_amount` and `currency` on each tax line at posting (new migration).
  - Q10 the builder edits `blankAbove` (column Totals: "On every row" / "Up to <group>").
  - Q11 direction A.
  - Correction by the human: Q9's migration number `2100000014` is taken on books main (`2100000014`–`2100000016` exist). The migration takes the next free number in `books/pb-migrations/` at build time; the spec names no fixed number (`<N>_add_books_tax_line_gross.js`).
- phase 3: direction A picked (agency, then rate, a rate opening into its documents; agency total and Total show the tax alone). Not picked: B (flat rates with an Agency column, no agency total) and C (agency summary with the liability account's balance; wrong when agencies share an account). Spec self-review re-run after the answers were written in.
- phase 3 pass 2 (2026-11-14, unattended): reference of direction A captured from a static fixture, as the spec and packet describe. No reference corrections (unattended; the human's approval of the reference is the driver's).
  - fixture `tinycld/books/lib/sales-tax-liability-fixture.ts` (kept): 11 October 2026 documents (9 posted, 1 void, 1 draft) and their per-component tax lines, built from the seeded agencies, rates and customers; `salesTaxLiabilityResult()` adds them as the shipped spec does (posted only, by agency then rate, name order). Edges: a group rate over two agencies (Denver combined), a sales receipt with no customer, a 0% rate with taxable sales, a document with a rate and no taxable line, an inactive rate (Retired rate) and an inactive agency (Old county agency) with tax lines, the longest rate and customer names, a half-cent rounding (79.875 → 79.88). Totals pinned at load: Denver 158.07, Colorado 128.67, Old county 5.00, Total 291.74 (more documents than the artboards, so the artboards' 274.49 does not hold).
  - The tax-line type is a local `SalesTaxLineFixture` (generated tax-line columns plus `gross_amount`, `currency`): the migration checkpoint (`<N>_add_books_tax_line_gross.js`) must replace it with the generated types and wire the fixture into `seed.ts`.
  - scratch route `tinycld/books/screens/helix-mockup.tsx`: core `ReportView` over a static `ReportViewModel` (core's pure helpers), states `populated`, `rate-open` (Colorado state opened into its three documents), `collapsed` (agencies closed: tax alone on the agency rows), `filtered` (Agency = Colorado Department of Revenue), `empty` (September 2026), `loading`, `error`. Groups `[{subtotals, open}, {subtotals, closed}]`: an opened rate ends in "Total <rate>" with four figures.
  - Not in the reference, because the core parts do not exist yet (spark 1 is needs-extension, so not attempted in core): G2 `blankAbove` (the fixture's agency subtotal and Total rows just carry no sales cells, as G2 will send them), U1 (no effect on the look), p5-drill-down's `detail.open` (document rows are plain detail rows: no link look). The checkpoints that build G2 and `detail.open` re-capture `populated`, `rate-open` and `collapsed`. The Sales tax page's Liability report button (A3) is not in the reference: it is one button in an existing header, judged at its checkpoint's gate 2.
  - Phone arrangement (decision for the plan): the shipped spec needs a `display` (`SALES_TAX_LIABILITY_DISPLAY` in the fixture): `oneLine.minWidth: 600px`, `name` minWidth 12ch, and a `mobile` layout of 2 tracks: the label on line 1 (span 2), Gross total · Non-taxable on line 2, Taxable amount · Tax amount on line 3. Without it core's automatic lines cut a document label to "2026-10-06 · …" beside Gross total. Four figures on one line (spec §3 "label, then figures") do not fit: core's phone row is 374 px and fell back to automatic lines. Spec §3's phone wording should read "label, then the figures on two lines"; the plan carries the `display` into `salesTaxLiabilitySpec()`. On the phone a rate row is then three tap-height lines tall (core row height); gate 2 judges it.
  - Shipping route is core's `/a/reports/<id>` (no Books sidebar); the scratch route draws inside the Books sidebar, so no width figure here holds for the shipped report.
  - capture manifest `docs/plans/sales-tax-liability-capture.json`; reference `docs/plans/sales-tax-liability-reference/` (7 states × 390/1280 × light/dark).
- phase 4: review mode C (unattended). Plan `docs/plans/sales-tax-liability-checkpoints.md`, 6 checkpoints (0 core U1+G2; 1 gross snapshot + seed; 2 report by agency; 3 rate rows open, void, phone; 4 Liability report button + help; 5 `detail.open`, only after tinycld#475 merges). Decisions D1–D10 in the plan; the ones later phases must keep: D1 the seed shares October with other Denver posts, so exact figures only for the fixture's own rates; D2 the void e2e posts and voids its own invoice under its own agency and rate; D8 `newSalesTaxEnv`; D10 hidden `agencyKey` / `rateKey` group columns. Spec edits: §3 phone wording "label, then the figures on two lines"; §5 `display` block; §5 seed and e2e void through the test's own invoice. Plan review (`staging/p5-sales-tax-liability/plan-review.md`): all findings fixed. plan-check: 0 errors.
- review mode switches: none

## Checkpoint 0
- core plan (Do 1): `tinycld/docs/plans/2026-11-14-report-union-source-and-blank-above.md` (core repo, branch books/p5-sales-tax-liability, uncommitted), 8 tasks, written with writing-plans on core main 58bafaec (no newer core main commits; not on tinycld#475); plan review (sdd-reviewer): 2 blocking/major + 6 minor, all fixed in the plan. Verdict `exclusive` (Q6). Rulings: `core/reports/lib/types.ts` unchanged (R9), `join.go` unchanged (R15), task 8 also edits `tests/scripts/reports-stub/` templates (R13, out of the checkpoint's Files block), no renames of the Produces names. Open questions: none blocking.
- Do 2 (human review of the core plan): handed to the driver 2026-11-14; tasks not started. Driver decision: no human stop (U1 and G2 approved at the design gate; the core plan accepted as reviewed).
- Do 3: core plan run by one backend-runner (subagent-driven development, final whole-branch review): PLAN COMPLETE, 8 tasks, each task review clean; final whole-branch review clean after two fix waves. 24 task commits 58bafaec..195c6ecc squashed into one checkpoint commit (local branch `backup/cp0-sdd-195c6ecc` keeps them, not pushed). 15 rulings with costs: staging `rulings.md`. Beyond the plan (from review findings): bind refusals for `having` / `percentOfSection` reading a blank-above column (the builder mirrors both); blankAbove also blanks columns that read the blank-above column (rollups, layout computed rows); union part column types compared by class; the builder offers Totals only on aggregate or formula columns; builder formula errors shown under the column. Task 8's e2e red was argued, not observed (ruled).
- test writer / implementer: the core plan's tasks (sdd-implementer writes each test first, then the code; sdd-reviewer per task), not the helix roles; test files: `core/server/reports/{union_zoo,union_check,union_run,union_shape,blankabove,blankabove_bind}_test.go`, `core/reports/lib/builder/__tests__/draft.test.ts`, `core/reports/lib/__tests__/statements-docs.test.ts`, `tests/e2e/reports-union-blank-above.spec.ts`.
- gate 1: core `pnpm run checks` fail → biome format in the scaffolded `salesstub` (`screens/index.tsx` line width, `types.ts` Pick) → root cause: task 8's templates `tests/scripts/reports-stub/screens/index.tsx.txt` and `tests/scripts/scaffold-reports-stub.ts` emit unformatted code → fixed in the templates → pass. `go test ./reports/...` pass; core `tinycld-pkg test` pass. Core e2e one file at a time, all pass: reports-union-blank-above (1), reports-view (11), reports-groups-v2 (13), reports-group-pivot (5), reports-statements (3), reports-formula-layout (4), reports-create (4), reports-shipped (1), reports-period-pivot (5), reports-formulas-v2 (6), reports-formula-leaves (2), reports-source-params (11). Consumers (Do 4): Books `go test ./...` pass, `tinycld-pkg check` pass, e2e trial-balance (13), general-ledger (9), balance-sheet (10), journal-report (11), profit-and-loss (11), all pass.
- gate 2 capture: `docs/plans/sales-tax-liability-evidence/cp0/capture.json` (populated, rate-open, collapsed × 390/1280 × light/dark), scratch route on the core branch, 12 shots; copied over `sales-tax-liability-reference/{populated,rate-open,collapsed}-*` (Do 6; committed with checkpoint 1).
- gate 2: invalid shots: none · blocking: none · notes: 5, listed under Design notes (critique `docs/plans/sales-tax-liability-evidence/cp0/critique.md`). No sales figure and no `@currency` cell on an agency row or the Total.
- gate 3 A (correctness): BLOCK `layout.go` `readsBlankSection` read `blankLevel`, so a non-derived formula column reading a blank-above column sent 0 + `@currency` on a layout computed row → accepted (fix item 1: test-writer case red "row c:gap:[\"USD\"] (computed) carries plus = 0", then source fix `blankReadLevel`). DEFERRAL: a one-collection → union link with part columns named per part was not tested → not a blocker, fixed now (fix item 2: `addZooTreats` maps `animal → pet`; green on the engine as built).
- gate 3 B (conformance): script lines: 0 real, 2 false positive (the `skipWithoutReportsStub` guard; the salesstub migration is an e2e stub template) · 10 findings, all out-of-plan files → accepted, recorded under Out-of-plan changes.
- gate 3 A notes: 4 (union stem collision, shared part ids, stub ReturnForm onError, ruling 11 accepted), listed under Design notes; the re-capture note is done (Do 6 above).
- reviewer-caught deferrals: reviewer A — the one-collection → union link with per-part column names (the plan run did not declare it; its tests mapped the same column name in both parts); fixed now.
- fix round: findings `cp0-fix.md` (2): test writer wrote both tests first (item 1 red for the right reason, item 2 green), staged; implementer changed `layout.go` only (one line + comment). Gate 1 again: tests unedited: yes · core checks, `go test ./reports/...`, core vitest, e2e reports-union-blank-above (1), reports-formula-layout (4), reports-statements (3), Books `go test ./...` all pass. No shot changed (Go-only fix), no re-capture.
- fix review: round 1: clean · round count 1.
- test disputes: none. self-declared differences: none (the rulings R1–R15 are in staging `rulings.md`).
- commit: core 43cbaa8a (`feat(core): report union sources and blankAbove column totals`, branch books/p5-sales-tax-liability, not pushed; the core PR is the driver's). Produces names unchanged (`reports.SourcePart`, `Source.Parts`, `Column.BlankAbove` / `blankAbove`, `unknown_group` 422).
- Do 5 (core PR) and the push: the driver's (per the driver's instruction to this runner).
- left in the books tree for checkpoint 1's commit: the re-captured `sales-tax-liability-reference/{populated,rate-open,collapsed}-*` (Do 6).
- human: review mode C, no message.

## Checkpoint 1
- test writer: `server/sales_tax_env_test.go` (`newSalesTaxEnv`, `docTaxLinesOf`; both document kinds bind on one app, no refusal), `server/tax_snapshot_gross_test.go` (`TestTaxSnapshotGrossAndCurrency`, `TestTaxSnapshotGrossFollowsCorrection`, `TestTaxLineGrossSchema`); red for the right reason: yes (the subtests read `gross_amount` 0 and `currency` "", the schema test accepted 1.5 and "usd": no such fields); untestable: none.
- implementer: migration `pb-migrations/2100000017_add_books_tax_line_gross.js`; `writeTaxSnapshot` sets `gross_amount` (subtotal) and `currency`; fixture on the generated tax-line types with `SALES_TAX_LIABILITY_VOID_TARGET` and `salesTaxLiabilitySeedMemo`; `seed.ts` `seedSalesTax` all active, new `seedSalesTaxLiability` (private helper `createSalesTaxDocument`) and `retireSeededTax`, called after `seedSalesReceipts`, before `seedEstimates`. Seed ids: no other seed path sends an invoice or sales receipt id; the 11 fixture ids are distinct. DONE.
- test disputes: none.
- self-declared differences: (1) the seeded void sends `{ status: 'void', voided_by: ctx.user.id }`, not bare `{ status: 'void' }` — the seed runs as superuser and `stampActor` (`server/fields.go`) keeps the body value for a superuser, so a bare void leaves `voided_by` blank; no revision is sent (as the bills seed's void, `seed.ts`); accepted (reviewers A and B agree). (2) private helper `createSalesTaxDocument`. (3) the two fixture files under Out-of-plan changes. (4) a one-line comment above the two new calls in `seed()`.
- gate 1: tests unedited: yes · `packages:generate`, `tinycld-pkg check` (biome, tsc, vitest 272 files / 5327 tests incl. `tests/seed-node.test.ts`), `go test ./...` pass · Do 5 ripple e2e, all 20 specs once, pass (21 + 25 + 55 passed; staging `cp/cp1-e2e-{1,2,3}.log`); no spec changed.
- gate 2: n/a (nothing renders).
- gate 3 A (correctness): 0 BLOCK, 0 DEFERRAL, 5 NOTE — out-of-plan PNGs (false positive: the Files block names them), the two fixture files (recorded under Out-of-plan changes), the void's `voided_by` (declared difference 1, accepted), seeded numbers differ from the fixture's and the `terms` literal (Design notes).
- gate 3 B (conformance): script lines: 0 · finding 1 out-of-plan fixture files → accepted, recorded under Out-of-plan changes (no code change) · finding 2 void body departs from Do 4's letter → accepted as declared difference 1 (no code change) · DEFERRAL "Do 5 not run" → rebutted (see Rebuttals: the runner ran all 20 specs, green).
- fix review: n/a (no accepted finding asked for a code change; no fix round) · rounds: 0.
- gate 3 A notes: 3, listed under Design notes.
- reviewer-caught deferrals: none (reviewer B's DEFERRAL rebutted).
- commit: this commit (`feat(books): tax lines carry gross and currency; seed the sales tax liability documents`); it also holds checkpoint 0's re-captured `sales-tax-liability-reference/{populated,rate-open,collapsed}-*`.
- human: review mode C, no message.

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
