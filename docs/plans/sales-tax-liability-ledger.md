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
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
(none yet — gate-2 NOTEs the loop did not act on, as
`cp N · <shot>: <where> — <what>`; shown to the human at each checkpoint
and again at the end)

## Out-of-plan changes
(none yet — every file touched that no checkpoint's Files block named, with why)

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

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
