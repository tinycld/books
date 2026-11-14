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
- phase 4: <plan-review findings fixed; review mode answer>
- review mode switches: none

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
