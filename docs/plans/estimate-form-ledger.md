# estimate-form — helix run ledger

- mode: unattended
- unit: p2-estimate
- started: 2026-11-12
- package branch: books/p2-estimate (from books main@d809243)   core checkout: main@865049eb
- spec: docs/specs/estimate-form-design.md
- checkpoints: docs/plans/estimate-form-checkpoints.md
- reference: docs/plans/estimate-form-reference/
- evidence: docs/plans/estimate-form-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/estimate-form-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - The status of an estimate reads at a glance from color and word → expressible (`StatusBadge`, generalized from `EntryStatusBadge`, rounded-full outline; Pending info, Accepted success, Rejected destructive, Closed muted, Expired warning)
  - The total is the largest figure → expressible (`DocumentHeader` big figure, `text-2xl font-semibold text-foreground tabular-nums`, label "Total")

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
- phase 1: none (unattended; intake in auto-helix staging intake.md)
- phase 3: design gate 1 (2026-11-12): direction A picked; Q1–Q21 accepted as recommended. Q3 confirmed after the human asked for a Numbering section with a seed per document type: that section exists (Settings → Numbering, admin-only prefix + forward-only next number); the human chose to add an "Estimates" card to it. No sales-order unit exists in the manifest, so no sales-order card. No new platform items (shortcuts, autofocus/type-to-open are the standing default of 2026-11-11). No core extension.
- phase 3 (2026-11-12, unattended, pass 2): direction A captured. Fixture `tinycld/books/lib/estimate-form-fixture.ts`: LOCAL `EstimateRecord` / `EstimateLineRecord` / `ConvertedInvoiceRecord` mirroring spec §4 (the migration checkpoint 2100000012 must replace them with the generated `BooksEstimates` / `BooksEstimateLines` / `BooksInvoices` through `satisfies`); `ESTIMATE_TODAY` 2026-11-12; five estimates 1001 Pending (Harborview, every line kind, expires 2027-01-15), 1002 Pending expired 2026-10-31 (Northwind, no taxable line), 1003 Accepted (Alvarez, long Accepted by, no tax), 1004 Rejected (Aspen Ridge), 1005 Closed (St. Jude, keeps Accepted by / date) converted to the draft invoice `CONVERTED_INVOICE` (+ `CONVERTED_INVOICE_LINES`); `ESTIMATE_SEED_IDS` (create order 1001→1005, then save the converted invoice, which closes 1005), `ESTIMATE_STATUS_LABELS`, `DEFAULT_ESTIMATE_MESSAGE`, `ESTIMATE_REFUSALS`. Lines and totals reuse the invoice / sales-receipt fixture lines, whose numbers are already checked against `documentTotals`. Scratch route `tinycld/books/screens/helix-mockup.tsx`, states: new, filled, accepted, expired, rejected, errors, delete, delete-refused, pdf, closed, closed-draft, reader, invoice-from-estimate, invoice-posted, settings, loading, error, not-found, no-access (phone-more = filled + a click on More). Manifest `docs/plans/estimate-form-capture.json`; reference `docs/plans/estimate-form-reference/`. Sparks: both kept (StatusBadge outline tones; Total `text-2xl` top right / under the title on a phone). No spark dropped. No human corrections (unattended).
  - decisions the plan must carry (the spec is silent or self-contradicting):
    - acceptance fields: the server clears Accepted by / Accepted date on Pending and Rejected only, NOT on Closed (spec §3.3 "any status other than accepted" contradicts §3.7 "reopens to Accepted when it has an accepted date" and §3.8 "Accepted by / Accepted date when set" on a closed estimate). The fixture's closed 1005 keeps them.
    - a closed estimate whose invoice is still a draft has no invoice number: the read view says "Converted to a draft invoice" (state closed-draft); with a posted invoice "Converted to invoice 1006". The same applies to the delete refusal and "already on invoice" texts (name the draft without a number).
    - memo hint on the estimate: "Only your team sees this." (the invoice's hint names the journal entry, which an estimate has none of).
    - action bar wide order: Cancel · Delete estimate · Convert to invoice · Save · Save & close (primary) · Save & new · More (Download PDF); phone: Cancel · Save · Save & close (primary) · More (Save & new, Convert to invoice, Delete estimate, Download PDF).
    - read view action order: Open invoice (primary, closed only) · Copy (writers) · Download PDF; a reader's pending estimate shows Download PDF only.
    - PDF tab on an unsaved estimate: "Save the estimate to see its PDF" with Save (no draft wording).
    - converted invoice band: Customer shown as read-only text with the "From estimate 1003" link under it; the posted invoice's read view puts "From estimate 1005" under the Posted-by stamp.
    - Settings: the Numbering card "Estimates" preview reads "Next estimate: 1001" (`DOC_TYPES.estimate = { label: 'Estimates', noun: 'estimate' }`); its helper text says "estimates saved from now on" (the shared HELPER says "entries posted").
    - the title badges show the SAVED status (and Expired from the saved expiration date), not unsaved edits of Status.
  - widths: measured on `/a/books/helix-mockup` inside the Books layout, the shipping layout for `books/estimates/*` and `books/invoices/*`.
  - known reference flaw (not a target): at 390 the Save bar (Cancel · Save · Save & close · More) wraps More onto a second row (accepted-phone, filled-phone). The build must keep the phone bar on one row (for example Save into More, or a compact bar) and gate 2 checks it.
- phase 4 (2026-11-12, unattended): plan `docs/plans/estimate-form-checkpoints.md`, 4 checkpoints, no checkpoint 0, no core change; e2e budget 9 of 12. Plan review (staging review-plan.md): 47 findings, all fixed, none rebutted; details in the plan's Phase notes. Decisions a later phase must know: phone Save bar is Cancel · Save & close · More (Save, Save & new, Convert, Delete, Download PDF) so it stays on one row; the forms host and estimate fields ship in checkpoint 1 (the Go line guard needs the host); delete reuses `useDocumentDelete` + a kind-driven `DeleteDraftDialog`; the band's second row keeps the layer id `estimate-payment`; new server text `%s is inactive. Make the customer active to convert this estimate.`; Convert is `Alt+i`. plan-check --unattended exits 0 (warnings only).
- review mode switches: none

## Final review
- eval:
