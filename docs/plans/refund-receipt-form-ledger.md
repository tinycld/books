# refund-receipt-form — helix run ledger

- mode: unattended
- unit: p2-refund-receipt
- started: 2026-11-18
- package branch: books/p2-refund-receipt   core checkout: main (470a6f7b)
- spec: docs/specs/refund-receipt-form-design.md
- checkpoints: docs/plans/refund-receipt-form-checkpoints.md
- reference: docs/plans/refund-receipt-form-reference/
- evidence: docs/plans/refund-receipt-form-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/refund-receipt-form-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - The amount of money that goes back is the largest figure on the screen → expressible (shared `DocumentHeader` big figure, label "Amount refunded")
  - The balance of the account that pays sits beside the account pick → expressible (Books `PaidFromBalance` under Refund from)
  - How the money moved (method, reference, account) reads as one group under the customer → expressible (header band second row, `bandSplitAt: 'payment_method'`)
  - grey page wash, green add button, heavy grid rules → dropped (not the Books look)

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
- phase 1: design gate 2026-11-18 — no corrections to the inventory.
- phase 3: direction A picked (every refund, a credit memo payout included, is one more kind of the shared sales document form). Open questions Q1, Q3–Q14 accepted as recommended (Q12: refund of an unapplied customer payment is not in this unit; p2-apply-credit owns it). Q15 (human): no migration collision with p5-ar-aging — refund receipts take `2100000025`, the audit view moves to `2100000027`, `2100000026` stays free for p5-ar-aging. Q16 (human): no waits_for; files shared with p3-vendor-pages and p5-ar-aging merge keeping both sides.
- phase 3 pass 2: reference captured 2026-11-18 for direction A (36 shots, 104 PNGs, widths 390 and 1280, light and dark) in `docs/plans/refund-receipt-form-reference/`. Fixture `tinycld/books/lib/refund-receipt-form-fixture.ts`, scratch route `tinycld/books/screens/helix-mockup.tsx` (`/a/books/helix-mockup?state=…`), manifest `docs/plans/refund-receipt-form-capture.json`. No spark dropped: the three sparks are drawn by `DocumentHeader` (figure "Amount refunded"), `PaidFromBalance` under Refund from, and the ruled Payment row of the band. No human correction (unattended).
  - How the reference is drawn: the real shared document parts (`DocumentHeader`, `DocumentTabs`, `DocumentTotalsPanel`, `DocumentActionBar`, `DocumentReadActions`, `DocumentReadLines`, `DocumentSourceLink`, `DocumentNotice`, `DocumentLoading`, `DocumentLoadError`) and the core `FormRenderer` on the sales receipt host with a scratch kind (`{ ...SALES_RECEIPT_KIND, … }`). The scratch kind keeps the sales receipt's `key`, `hostKey` and `helpTopic`. Static copies: the Customer, Tax and Product pickers, the Refund from field, the link row (copy of `CreditMemoLinkRow`), the read band, the read footer and the linked-documents section (copy of the `InvoiceCreditMemos` layout).
  - Decisions the plan must carry:
    - Fixture record types are local. Replace them with the generated types at the migration checkpoint (`2100000025_create_books_refund_receipts.js`).
    - Band: the refund receipt needs a link row and a ruled Payment row (`bandSplitAt: 'payment_method'`) together. `DocumentBand`/`FormBandRow` does not do this today (it splits before the date and removes the rule of the second row). The reference puts the link row after Refund date and Tax, before the Payment row (as artboards A1/A2). Spec §3.4 puts the link before Refund date in the Tab order. The plan decides the order and names the band change.
    - Payout notice: no shared inline notice part exists (`DocumentNotice` is a full-screen notice). The reference draws a bordered box (`rounded-lg border border-border bg-background px-3 py-2`) in the link row. The plan names the part.
    - Payout Customer: drawn as a disabled picker.
    - Credit memo totals: `DocumentTotalsPanel` draws the `after` rows (Refunded, Unapplied credit) between Total and the last row "Credit amount". Spec §3.12 puts them after "Credit amount". The plan decides (model: the order of the vendor credit's `readTotals`).
    - Read view: the source link is in the band above the ruled Payment row. The payment line "Check · 20417 · refunded from 1000 Business Checking" is built in the route; `PaymentVerb` has no "refunded from" value yet.
    - Read action "Refund" (sales receipt) and "Refund credit" (credit memo): the reference borrows the read action `record_refund` (key `r`) with id `read-refund`. The build adds its own read action.
    - Error states: Refund from shows the Balance line and the field error together; the summary holds only the root refusal; the lines error draws under the table.
  - Wrong in the reference, right in the spec: the hint under "Message to customer" reads "Shown on the sales receipt and its PDF." (it comes from the sales receipt host layout). The build shows "Shown on the refund receipt and its PDF." The lines' column header reads "Price" (shared table). The back link reads "Journal entries" (scratch route). The More menu shows raw key names (`$mod+p`, `r`), as the shared menu draws them today.
  - Not in the reference (built-only shots are necessary): the Sales lists tab "Refund receipts" and the customer Transactions chip "Refunds" (spec §3.13), the PDF itself (the shots show the empty page frame), `VoidDialog`, autofocus, the Customer inactive error, the "Line n" refusal, the replaced sales-receipt customer refusal.
  - Not checked: the fixture's stored totals against `documentTotals` for each record. The live totals of the from-sales-receipt form (1,304.70 / 42.07 / 1,346.77) agree with the stored ones.
  - Widths: 390 and 1280, measured on `/a/books/helix-mockup` inside the Books layout, which is the shipping layout of `books/refund-receipts/*`, `books/sales-receipts/*` and `books/credit-memos/*`. At 1280 the credit memo read bar holds More and 6 buttons with no wrap.
- phase 4: plan written 2026-11-18, 5 checkpoints with a Sizing line (1 data and posting, 2 reports/search/PDF/source guards, 3 form and read view, 4 refunds from receipts and credits, 5 lists/customer page/help); e2e budget 12 of 12 (5 + 4 + 3; the one phone run is in checkpoint 4). plan-check `--unattended`: 0 errors. Plan review (staging `plan-review.md`): 6 blockers, 8 minor, all fixed in the plan (see its Phase notes); not checked by the reviewer: core file citations for shortcut scopes, focus and the leave guard, core `relationCheck` against the checkpoint 2 report-source parts, the props of `DocumentTotalsPanel` and `DocumentSourceLink`.
  - Plan decisions: `salesDocKind` gains two optional hooks, `PostingLines` (spec) and `AfterPost` (plan: the memo's cash rows read the refund's posted entry); `books_refund_receipt_credits` has a `position` column (always 0) so `document_balance.go` functions do not change; the form's link row sits before Refund date (spec Tab order), not after Tax (reference); the credit memo's Refunded and Unapplied credit rows sit after "Credit amount" (spec), through a new `afterLast` list; read actions `refund` and `refund_credit`, both key R; the credit memo's invoice link becomes one kind-driven source link (`sourceLink`, `linkSource`, `fromSource`, state `cannot-start`) in checkpoint 4; `takesCustomer`, the Sales tab, its key 7 and the list index arrive in checkpoint 5 (checkpoint 3's `index.tsx` redirects to `books/sales`); `refund_from` is checked on create, on change and at Post; the seed adds a new credit memo for Aspen Ridge Dental and a payout of part of it (checkpoint 1 confirms the customer by grep before the seed edit).
- review mode switches: none

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
