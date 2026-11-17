# sales-reports — helix run ledger

- mode: unattended
- unit: p5-sales-reports
- started: 2026-11-17
- package branch: books/p5-sales-reports   core checkout: main (87ed80f9)
- spec: docs/specs/sales-reports-design.md
- checkpoints: docs/plans/sales-reports-checkpoints.md
- reference: docs/plans/sales-reports-reference/
- evidence: docs/plans/sales-reports-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/sales-reports-capture.json
- review mode: C — none (unattended)
- core extension: checkpoint 0 (human 2026-11-17): core report view prints a percent column at its `scale` (today `formatReportPercent` always prints 1 place); tinycld PR on branch books/p5-sales-reports, small change, no `exclusive`
- sparks:
  - A figure that would mislead is blank on the Total (Quantity, Avg price) → expressible (core `columns[].blankAbove`)
  - Each row's share of all sales beside its amount, both reports → expressible (core `percentOfTotal`, scale 2, `columns[].detail: "blank"`)
  - Only a family of customers gets a header and a total → expressible (core `groups[].inline`, `hideEmpty`, `muted`)

## Deferrals
(none yet)

## Rebuttals
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
(none yet — gate-2 NOTEs the loop did not act on, as
`cp N · <shot>: <where> — <what>`; shown to the human at each checkpoint
and again at the end)

## Out-of-plan changes
(none yet — every file touched that no checkpoint's Files block named, with why)

## Phase notes
- phase 1: design gate 2026-11-17 (first packet): direction A; Q1–Q14 and Q16 as recommended; Q15 changed (Sales by Customer has a % of sales column, blank on sale-line rows, 100% on the Total; phone row: name on line 1, Sales and % of sales on line 2); Q17: p2-credit-memo owns the kind-aware document open/label, reused unchanged.
- phase 3: packet regenerated against books main 70207674 / core 87ed80f9 after p2-credit-memo merged; the human approved it 2026-11-17 ("A, ok"): direction A, 0 open questions. Credit memo lines join `books.sales_lines` with `sign: -1`; `salesDocumentOpen` rename dropped (`stlDetailOpen()` / `byDocumentKind` reused). Artboards: /Users/nas/tmp/tinycld/auto-helix-books/staging/p5-sales-reports/artboards.html.
- phase 3 pass 2 (2026-11-17, unattended): direction A captured. No spark dropped. No reference corrections (unattended; the human's approval of the reference is the driver's).
  - Fixture `tinycld/books/lib/sales-reports-fixture.ts`: one list of documents (invoices, sales receipts, credit memos over the seeded customers and products, typed against the generated records) and both reports' static `RunResult`s built from the same sale lines; params, columns, groups, display blocks, the Customer and Product pickers' option pages. It checks at load that both Totals are 17,896.25 = Subtotals 18,135.25 less credit memos 239.00, and that December 2025 totals zero.
  - Scratch route `/a/books/helix-mockup?report=customer|product&state=` populated, opened, by-sales, filtered, picker, zero, empty, loading, error (`&gate=<px>` overrides the one-line gate): core `ReportView` over a hand-built `ReportViewModel`. It has no Export item and its rows are not links (no `drill`, no export model).
  - Reference: `docs/plans/sales-reports-reference/` (64 files, 14 shots; 390 and 1280, light and dark; populated and opened of both reports also at 375). Manifest `docs/plans/sales-reports-capture.json`. The capture spec copy has two run-only parts: `fakeOptions` (answers `POST /api/reports/param-options` from the fixture) and a `helix measure` block (`HELIX_MEASURE=<folder>`).
  - Shipping route: core `/a/reports/<id>` (no package sidebar). Row width measured there on the seeded Customer Balance (`report-table` `data-fit-width`): window 375 → 375, 390 → 390, 480 → 480, 600 → 600, 767 → 767, 768 → 704, 900 → 836, 1024 → 960, 1280 → 1216 (a 64 px rail from 768). The scratch route gives the same row on a phone (375, 390) and a narrower one with the Books sidebar (768 → 529, 1024 → 700, 1280 → 956), so the gates below are row widths, not window widths.
  - Sales by Customer display: `oneLine.minWidth: "520px"`; `name` `whiteSpace: "normal"`, `lineClamp: 3`; `sales`, `pct` `minWidth: "max-content"`; `mobile` layout, 2 tracks (`name` line 1 span 2; `sales`, `pct` line 2). Measure with the gate at 0 (opened state, 30 rows): the three columns fit one line from 375, but the clamp cuts 10 labels at 375, 9 at 390, 3 at 430, 1 at 480 and none from 520. At 375 and 390 with the gate the layout source is `mobile`, no label and no figure is cut, labels take at most 3 lines.
  - Sales by Product/Service display: `oneLine.minWidth: "720px"`; `name` wraps to 3 lines; the four figures `max-content`; `mobile` layout, 2 tracks (`name` line 1 span 2; `quantity`, `amount` line 2; `pct`, `avg` line 3). Measure with the gate at 0: the five columns do not fit one line below 600 (source `mobile` at 375–560); on one line the clamp cuts 4 labels at 600, 2 at 640, 1 at 680 (and at 661) and none at 700, 720 and wider. At 375 and 390 the source is `mobile`, nothing is cut. With the gate at 720 a 768 window on the shipping route (704 px row) draws the phone arrangement; from a 784 window it is one line.
  - For phase 4 (needs a ruling): the spec says % of sales shows 2 places ("100.00%" on the Total, also in the e2e text). Core's view prints every percent cell with 1 place (`formatReportPercent`, `core/reports/lib/format.ts`; the reference shows "12.8%", "100.0%"). The engine's `scale: 2` only rounds the value. Either a core task (the view prints a percent column at its scale) or the spec's display text changes to 1 place; do not work around it in Books.
  - For phase 4: a family header row shows no figures while it is open (core draws them on its "Total <parent>" row only; a folded family shows them on the header).
  - Human ruling 2026-11-17 on the % places question: core change (option 1). The spec's 2 places ("100.00%") stand; checkpoint 0 makes core print a percent column at its scale.
- phase 4: plan `docs/plans/sales-reports-checkpoints.md`, 4 checkpoints (0 core, 1–3 Books), 12 Books e2e + 1 core e2e; plan-check exit 0. Spec edited: §4 (R1, the core percent places), §8, §5 (Quantity and Avg price blank by `if(eq(sum, 0), lit(nil), …)`).
  - Probe (core 87ed80f9, core's two-level inlined test report plus `percentOfTotal` scale 2): a customer inside a family gets its share of the report Total, the family header and total the family's share, an opened row no cell. No core task (plan D2).
  - Checkpoint 0 decision (D1): the places go on the run result's column (`scale`, only for a percent-part formula root); default 1 place with no column scale, so other reports print as before. One known change: a builder-made percent part has scale 2, so `tests/e2e/reports-period-pivot.spec.ts` lines 266 and 269 become "100.00%" and "60.00%".
  - Family header figures (D3): the engine's header and total rows both carry the cells; core's view prints them on the total row while the family is open. No Books change.
  - Seed (D4): only a sale of an inactive product was missing; `seedSalesReports` adds one posted sales receipt (Old Mill Bakery, "Fax line setup").
  - Plan review (`/Users/nas/tmp/tinycld/auto-helix-books/staging/p5-sales-reports/plan-review.md`): 1 BLOCKER, 8 SHOULD-FIX, 20 NOTE; the BLOCKER, the SHOULD-FIX items and the NOTEs that named a wrong path, name or missing test are fixed in the plan. BLOCKER: the engine's sum of no rows and division by zero are 0, so Quantity and Avg price would print 0 where the spec says blank → D13 (the Balance Sheet's `lit(nil)` precedent; a product whose quantities net to 0 shows a blank Quantity). SHOULD-FIX: product halves of the shared bullets had no test (added `TestSalesByProductSharedBehavior`, the seeded inactive product in e2e); the pivot-spec change stated as fact; `sectionpercent_test.go` name; core's shared `format-cases.json` fixture added to checkpoint 0; `headerAction` must be `undefined` with no report; real spec file names in checkpoint 3 Do 4; own filter helper `filterSalesTo` (D16).
- review mode switches: none

## Final review
- eval:
