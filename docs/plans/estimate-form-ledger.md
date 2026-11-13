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
- **finding:** reviewer A, checkpoint 1, DEFERRAL: "`server/estimates.go` | The checkpoint (Do 4) asks for "`estimateKind`, the message constants of the Decisions". The Decisions name Go constants in `server/estimates.go` and `server/estimate_conversion.go` … `estimates.go` now has only the texts this checkpoint uses. These are absent: `hasInvoice`, `hasDraftInvoice`, `alreadyOnInvoice`, `alreadyOnDraftInvoice`, `estimateCustomer`, the convert `estimateCustomerInactive`, "Estimate %s is rejected. Set it to Pending or Accepted to convert it." and "An invoice keeps the estimate it was made from." … Fix: either add the client-shown conversion texts to `estimates.go` now (checkpoint 3 then uses them), or have the driver state that checkpoint 2's drift test covers only the texts that exist."
  **rebutted because:** the plan splits the constants across two files by checkpoint. Brief, Messages: "Go constants in `server/estimates.go` and `server/estimate_conversion.go`"; Go names: "`server/estimate_conversion.go` (checkpoint 3): `checkInvoiceEstimate(…)`, `closeEstimateFor(…)`, `reopenEstimate(…)`, `moveEstimateTo(…)`". The conversion texts are the refusals of those checkpoint-3 guards, so they belong in that checkpoint-3 file; nothing of checkpoint 1 refuses with them. Checkpoint 2's drift test (`tests/document-messages.test.ts`) must therefore compare only the Go files that exist at checkpoint 2 and extend to `estimate_conversion.go` in checkpoint 3 — recorded under Design notes for the checkpoint 2 and 3 runners.

## Design notes
- cp 1 · reviewer A note 8: `server/sales_documents.go` `salesDocUnlinks` does not hold the new circular relations `books_estimates.invoice` / `books_invoices.estimate`; when PocketBase unsets one on a closed estimate or posted invoice, the guard refuses with the frozen text. Unreachable in cp1 (nothing sets either field). Checkpoint 3 must reopen/move the estimate before an invoice delete or add both fields to the unlink handling, with a test.
- cp 1 · reviewer A note 9: `books_invoices.estimate` is writable through REST and no guard reads it until checkpoint 3's `checkInvoiceEstimate`. Checkpoint 3's tests must include a REST update body that sets `estimate` ("An invoice keeps the estimate it was made from.").
- cp 1 · reviewer A note 10: Books search now returns `estimate:<id>` rows, and `lib/search-target.ts` has no `estimate` path until checkpoint 2 (the plan gives the client target to checkpoint 2). Intermediate state inside the unit's PR.
- cp 1 · reviewer A note 4 / B 4: `hooks/invoice-data.ts` inserts `estimate: ''` with the comment "No invoice screen makes an invoice from an estimate yet."; checkpoint 3 replaces the literal with the `?estimate` value and removes the comment.
- cp 1 · rebuttal above: checkpoint 2's message drift test covers `server/estimates.go` only; checkpoint 3 adds `server/estimate_conversion.go` and the conversion texts and extends the test.

## Out-of-plan changes
- cp 1 · `server/pdf_invoice.go`: `documentPDFTaxLines` used the tax snapshot for every non-draft status, so a pending estimate would query collection ""; it now uses today's rates when the kind has no snapshot collection. Invoice and receipt unchanged.
- cp 1 · `server/search_index_test.go`: the pinned index count goes 7 → 8 for the new `fts_books_estimates` (still exact; not weaker).
- cp 1 · `tinycld/books/forms/document-fields.tsx`: `DayField` exported so the estimate day fields reuse it instead of copying it.
- cp 1 · `tinycld/books/hooks/invoice-data.ts`: the invoice insert sends `estimate: ''` (the generated insert type now requires the column).
- cp 1 · `tinycld/books/lib/invoice-form-fixture.ts`: `estimate: ''` for the generated `BooksInvoices`.
- cp 1 · `tinycld/books/types.ts`: re-exports `BooksEstimates`, `BooksEstimateLines` for the fixture and the tests.

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

## Checkpoint 1
- test writer: server/estimates_test.go, server/pdf_estimate_test.go, tests/estimate-form-fixture.test.ts, tests/estimate-host.test.ts, tests/estimate-status.test.ts (new); server/forms_host_test.go, numbering_test.go, customers_test.go, products_test.go, sales_tax_test.go, search_test.go, audit_test.go, oauth_scopes_test.go, registrations_test.go, tests/collections.test.ts, tests/doc-types.test.ts (changed); 49 tests; red for the right reason: yes (Go: missing symbols, then missing host/rows in a throwaway stub copy; TS: missing modules/exports); estimate-form-fixture.test.ts red only in tsc (the design-phase fixture data already met the data checks); untestable: none. PDF Title "Estimate" + Number separate (spec §3.9 "title "Estimate", number"; the brief's Do 6 "Estimate <number>" would print the number twice). `TestTaxRateReferences_StartWithGroupComponents` 5 → 6 entries (stronger, not weaker).
- implementer: two dispatches by layer. Part 1 (migration 2100000012 + 2100000001 edit, collections, host + three fields, estimate-status, DOC_TYPES.estimate, fixture on generated types): DONE. Part 2 (Go lifecycle on `salesDocKind`, `estimateKind`, `createQuote` / `transitionQuote`, registries, search, audit, OAuth, PDF kind, seed `seedEstimates` 1001–1004): DONE.
- test disputes: none
- self-declared differences: part 1 — line createRule checks `@request.body.estimate.status != "closed"` (stricter than the invoice's); optional-day pattern `^(\d{4}-\d{2}-\d{2})?$` on expiration_date / accepted_date; indexes on books_estimates.invoice and books_invoices.estimate; layout hints literal until ESTIMATE_KIND exists (cp2); field wrapper test ids literal; accepted_by / accepted_date not host-required (hidden by status; schema and server require the date); fixture `ESTIMATE_REFUSALS.acceptedDateRequired` text ('Accepted date is required') differs from the Messages decision, scratch-route only. Part 2 — `seedEstimates(pb, customerIds)` without ctx (unused); seed sends the fixture memos; `createQuote` also clears acceptance on a pending/rejected create; a closed estimate takes a forms-unlink-only update (as a posted invoice); under `markConverting` both closed refusals are skipped; PDF Title/Number separate, big figure Total, date label "Date"; `documentPDFTaxLines` uses today's rates when the kind has no tax snapshot collection; `checkEstimateHeader` also refuses a malformed accepted_date with the shared day text; conversion texts left for cp3's estimate_conversion.go.
- gate 1: tests unedited: yes · packages:generate, `tinycld-pkg check` (241 files, 4793 tests), `go test ./...`: pass. No estimate e2e spec exists yet; `books-settings.spec.ts` run once on the new seed (17 passed) to prove `seedEstimates` seeds through the guards.
- gate 2: n/a (logic checkpoint)
- gate 3 A (correctness): 0 BLOCK, 11 NOTE, 1 DEFERRAL. Note 7 (`msgEstimateCustomerInactive` unused, name collides with cp3's convert text): accepted+fixed (deleted). Note 11 (fixture acceptedDateRequired text): accepted+fixed with B 7. Notes 1–6: out-of-plan files, recorded under Out-of-plan changes. Notes 8, 9, 10 and 4: to Design notes (checkpoint 2/3 work). DEFERRAL (conversion message constants absent from estimates.go): rebutted (see Rebuttals).
- gate 3 B (conformance): script lines: 0 real, 1 false positive (2100000001 edited in place: Books unreleased, plan Do 1 and spec §4). Findings 1–6 (out-of-plan files): recorded under Out-of-plan changes, no code change. Finding 7 (`ESTIMATE_REFUSALS.acceptedDateRequired` 'Accepted date is required' vs the Messages decision): accepted+fixed → 'Enter the accepted date.'
- fix review: round 1: clean (fix diff: estimates.go dead constant removed, fixture text). Gate 1 rerun green (check, go vet, go test). Biome on the package clean.
- gate 3 A notes: 4 to Design notes (8, 9, 10, 4)
- reviewer-caught deferrals: none accepted (reviewer A's one DEFERRAL rebutted; the implementer had self-declared it as difference 10)
- commit: see git (feat(books): estimate data, server guards, PDF)
- human: review mode C, no message

## Final review
- eval:
