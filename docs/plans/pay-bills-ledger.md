# pay-bills — helix run ledger

- mode: unattended
- unit: p3-pay-bills
- started: 2026-11-15
- package branch: books/p3-pay-bills   core checkout: books/p3-pay-bills (from main 9cc926c)
- spec: docs/specs/pay-bills-design.md
- checkpoints: docs/plans/pay-bills-checkpoints.md
- reference: docs/plans/pay-bills-reference/
- evidence: docs/plans/pay-bills-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/pay-bills-capture.json
- review mode: C — none (unattended)
- core extension: N1 — a `choice` param's chosen option as a report document-header line (accepted at the first design gate; small, no exclusive); tinycld PR to open at checkpoint 0 (branch books/p3-pay-bills)
- sparks:
  - Total payment is the largest figure → expressible (`DocumentHeader` big figure, label "Total payment")
  - The paying account's balance before and after in view → expressible (expense balance line under Paid from; receive-payment `TotalLine` for Current balance / Total payment / New balance)

## Deferrals
(none yet)

## Rebuttals
(none yet)

## Design notes
(none yet)

## Out-of-plan changes
(none yet)

## Phase notes
- phase 1: first design gate (2026-11-15): direction A; all recommended answers; N1 accepted; Q21 reuse receive-payment's allocation lib, outstanding table and Payments section; Q22 bills follow receive-payment rules (`balance`, edit as correction, payments move with a bill correction, void of a paid bill refused); Q23 migration number taken at build (next free).
- phase 3: second design gate (2026-11-15): direction A picked; Q1 edit a bill payment as `pay-bills?replaces=<id>` (vendor fixed, correction keeps the number, empty correction refused); Q2 invoices also deferred on the cash basis; Q3 Method param on Sales Tax Liability in this unit; Q4 Paid / Partly paid badge on bills from `document-lifecycle`. Platform items: standing Books default (2026-11-11), none new.
- phase 3 pass 2 (2026-11-15): reference captured for direction A at docs/plans/pay-bills-reference/ (14 states: populated, overdue, refused, card, edit, filtered, empty, loading, error, no-access, read, read-void, read-replaced, bill; 390 and 1280; light, and dark for the main ones). Fixture lib/pay-bills-fixture.ts types bills as local `PayBillsBill` (BooksBills + balance) and local `BillPaymentRecord` / `BillPaymentLineRecord`; checkpoint 1 (migration) must replace them with the generated types. No spark dropped. Reference corrections (made in the route, not by the human): (1) the bill grid at the receive-payment column widths plus a Vendor column (min 1052 px) scrolled sideways at 1280 and hid Payment; the bill grid needs its own widths (tick 44, Vendor flex min 130, Bill flex min 110, Due date 168, Bill total 120, Open balance 128, Payment 130; min 918 px), so `lib/payment-columns.ts` gets a bill-grid width set, the invoice widths unchanged; (2) Pay Bills shows no status badge in its header (no draft bill payment): the route used a chrome trick, the build must hide the badge in DocumentHeader its own way. Not in the reference: the report states (A4 P&L cash, A7 Sales Tax Liability cash) need core N1 and are core report view screens; checkpoint 0 / the cash-basis checkpoints capture them. The bill state shows only this unit's additions (badge, Balance due, Payments block, totals Payments line, Pay bill first and primary), not the existing bill line table.
- phase 4 (2026-11-15): STOPPED before the plan, on spec §9 "One batch for several payments … If it cannot, that is a STOP". Finding: Books writes go through pbtsdb `batch` (core `atomic`), which is one TanStack DB transaction; TanStack DB merges an insert and a later update of the same row into ONE insert (`node_modules/@tanstack/db/dist/esm/transactions.js` `mergePendingMutations`, "insert + update → insert"). So "per vendor a draft row, its lines, then its update to posted" in one batch is sent as a create with `status: 'posted'` before its lines exist; the §4.1 create rule (`status = "draft"`) refuses it, and posting at create would see no lines. `hooks/useDocumentSave.ts:331` records the same limit ("A new document's post cannot join its create … so it is the create batch, then one request"). Options for the human: (A, recommended) the client creates each payment with `status: 'posted'` and its lines in one batch; the create rule admits `posted` with server fields unset; the payment create's request hook owns the post and runs `postBillPayment` after `e.Next()` (the `bindSalesDocDeferral` pattern, server/sales_document_deferral.go), when its lines exist, inside the batch transaction; a REST create with status posted and no lines is refused ("Select at least one bill to pay."). All or nothing kept, no draft row ever stored; `?replaces` Save works the same. Changes spec §3.5 (write order) and §4.1 (create rule). (B) two requests: one batch of drafts + lines, then one batch of updates to posted; a refused post leaves drafts the client must delete (breaks "a refused batch writes nothing" and "no draft bill payment"). (C) a Books endpoint that posts the batch: banned by CLAUDE.md (no new endpoint to write data).
- phase 4 (2026-11-15), human decision: option A. The client creates each vendor's bill payment with `status: 'posted'` and its lines in one pbtsdb batch; the payment create's request hook posts it after `e.Next()`, when its lines exist (the `bindSalesDocDeferral` pattern, server/sales_document_deferral.go); no draft bill payment is ever stored; the save stays all-or-nothing. Spec §3.5, §3.7 (line writes), §4.1 (status select posted/void, create rule, line rule) and §9 (one batch) edited to say this. Plan decisions on it: each payment create's own request hook posts it after `e.Next()`; in a batch operation N+1 runs inside operation N's `e.Next()` (third_party/pocketbase/apis/batch.go `process`), so the last payment posts first, and the client writes the vendors in reverse display-name order so numbers follow display-name order; a post refusal is then reported at its own payment's batch index (`failedIndex`), never at another payment's; a create outside a batch transaction (`TxInfo() == nil`) or one whose batch adds no line is refused "Select at least one bill to pay." before anything is stored.
- phase 4 plan review (2026-11-15, report staging/p3-pay-bills/plan-review.md): confirmed the reverse batch order and the refusal index. Fixed in the plan: the request hook posts with `e.App.RunInTransaction` (not `serialized`, which calls `e.Next()` itself); the batch answer holds the pre-post rows (`number: ''`), so the save awaits the collection's `reload()` before `queryOnce` and the toast; e2e refusals use `refuseBatchOperation` / `batchOperations`; `isMovingLines` generalized with expenses.go and payments.go; `documentDocTypes` in sales_documents.go; seed rows by name and memo; `PaymentReadActions` takes collection, edit href, void body, confirm label and entry noun as props; `DocumentPayments` takes `routeBase` and `TRANSACTION_DOC_KINDS` is unchanged; the vendor filter lists inactive vendors with open bills; added states and tests (`totalFigureText`, `afterPayTarget`, empty / filtered-empty, `billPaymentReadState`, the bill Payments read through `documentRead`, help tests, Retained earnings on cash); `customerWithInvoices` gains `date` / `taxable`; Gate 1 regression lists use the spec files that exist.

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
