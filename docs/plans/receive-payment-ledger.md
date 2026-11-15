# receive-payment — helix run ledger

- mode: unattended
- unit: p2-receive-payment
- started: 2026-11-15
- package branch: books/p2-receive-payment   core checkout: main@9cc926c
- spec: docs/specs/receive-payment-design.md
- checkpoints: docs/plans/receive-payment-checkpoints.md
- reference: docs/plans/receive-payment-reference/
- evidence: docs/plans/receive-payment-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/receive-payment-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - The amount received is the largest figure on the screen → expressible (shared `DocumentHeader` big figure, label "Amount received")
  - Money columns line up so open balance and payment read as a pair → expressible (right-aligned `tabular-nums` cells, shared header/row width constants, totals with `border-t border-border font-semibold`)
  - Green split save button and dark footer → dropped (the Books action bar exists)
  - Card logos and "Accept payments online" → dropped (online payments are Later; no upsells)

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
- phase 1: design packet generated unattended (staging p2-receive-payment/packet.md); no human corrections.
- phase 3: design gate 2026-11-15 — human picked direction A (document form) and accepted the recommended answers to Q1–Q14 (see spec). No platform items new; no core extension.
- phase 3 pass 2 (2026-11-15, unattended): direction A built as the scratch route `screens/helix-mockup.tsx` (`?state=` populated, empty, over, credit, no-open, find-miss, loading, error, no-access, read, read-credit, read-void, invoice) over `tinycld/books/lib/receive-payment-fixture.ts`; reference captured to `docs/plans/receive-payment-reference/` (44 shots, 390 and 1280; error, no-access, loading and find-miss light only) from `docs/plans/receive-payment-capture.json`. Both sparks kept (big figure "Amount received"; money columns with shared width constants, Amount to apply / to credit under Payment). No spark dropped. No human corrections (unattended; approval skipped per mockups.md).
  - Fixture types: `PaymentRecord`, `PaymentApplicationRecord` and `OpenInvoiceRecord` (`BooksInvoices & { balance }`) are local mirrors of spec §4.1; the migration checkpoint must replace them with the generated `BooksPayments`, `BooksPaymentApplications` and `BooksInvoices` and wire the fixture into `seed.ts`.
  - Reference notes for the build: grid columns tick 44, Invoice flex (min 200), Due date 172 (fits "Oct 2, 2026 · Overdue" on one line), Original 128, Open balance 128, Payment 160; the phone/wide switch in the mockup is the workspace breakpoint, while the spec switches at form width 640 px; at 300 px Deposit to wraps "Undeposited funds (created when you post)" onto two lines; the invoice shot shows only the new invoice parts (badge Partly paid, Balance due figure, Payments total row, Payments block, Receive payment action), not the whole invoice read view.
- phase 4 (2026-11-15, unattended): plan `docs/plans/receive-payment-checkpoints.md`, 5 checkpoints (1 data/posting/invoice balances, 2 wide form + read view, 3 phone cards + Find invoice no., 4 void/correction/journal links, 5 invoice + customer views + help); 10 of 12 e2e runs; no core change. plan-check --unattended: 0 errors. Plan decisions: sum ≤ amount checked at posting on the server (each write on the client); `amountTyped` derived on reopen (amount ≠ applied sum); `paymentSchema(currency, depositOptions)`; Clear payments is a Books link with core `useButtonShortcut` (core `ShortcutButton` takes no ref); shared `DocumentChrome` context for header/action bar; invoice status order Paid → Partly paid → Overdue → Open.
  - plan review (general-purpose, report staging p2-receive-payment/plan-review.md): 50 findings, all fixed in the plan. Main ones: `amountTyped: true` on reopen contradicted the e2e (→ derived rule); cp 2 e2e tabbed past cp 3's Find field (→ cp 3 adds the Tab and lists the keyboard spec); Books `MoneyInput` is opening-balances only (→ `PaymentMoneyField`); `paymentMethodOptions({ allowNone })`; `depositAccountOptions` has no `''` option (→ `paymentDepositOptions` / `paymentDefaultDeposit`); `ShortcutButton` has no ref (→ `ClearPaymentsLink`); `VoidDialog` fixed body (→ `body` prop, cp 4); `DocumentHeader` badge override (cp 5); `postInvoice`/`fillInvoice`/`nonTaxableService` live in `customer-pages-transactions.spec.ts`; `server/numbering_test.go` pinned list; cp 3 gate runs the helper's importers; `DOCUMENT_READ_KEYS.receive_payment`; correction-draft create with the original's inactive customer; entry `Memo`; rebuild `fixed` count; missing e2e steps (Post & new, Discard/Delete draft, Esc layering, server refusal under a row, customer change re-spread, no open invoices, Pay all after a typed amount, ⌥A/⌥⌫/J, Overdue, last-row Enter, select-all, voided/replaced by, Name column); load/error paths for the picker, `queryOnce` reads, the correction's original and cp 5 queries; inactive stored customer/deposit and inactive Find match; four conditional-scope placeholders removed; §2 route bullets and §4.4 reads quoted in cp 2. Not given an e2e step: an inactive stored customer's trigger name (Do step only; making a customer inactive mid-flow costs a long UI detour).
- review mode switches: none

## Final review
- eval:
