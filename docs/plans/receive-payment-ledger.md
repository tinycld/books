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
- **finding:** reviewer B, cp 1, #3: "server/payments.go:2281 (`msgPaymentApplicationStays`, "An invoice row stays on its payment.") — a server text that is not in the exact message list (brief: "Messages (exact)"). For a person, the migration's update rule already pins `payment` (`unset('payment')`), so only Go or a superuser can reach this text. Fix: add it to the plan's server message list, or return the existing `msgPaymentInvoicesNotDraft`/`refuseServerFields` text."
  **rebutted because:** the reviewer's own quote shows no person can reach it: the update rule pins `payment` (`unset('payment')`). The guard is a defensive Go check for a superuser or Go write, and neither existing text fits (`Only the invoices of a draft payment can change.` would be false for a draft payment; `refuseServerFields` names server fields, and `payment` is not one). The plan's list is the set of texts a user sees; a text no user sees does not belong in it.
- **finding:** reviewer B, cp 1, #4: "server/payments.go:2319-2324 (`invoiceRef`) — the user-facing text "Invoice (draft) is not a posted invoice of this customer." The spec and plan texts never use "(draft)". Fix: for an invoice with no number, use the spec's wording with the invoice's id, or a plan-approved text."
  **rebutted because:** the plan text is `Invoice %s is not a posted invoice of this customer.` and a draft invoice has no number to fill `%s`. The form never offers a draft invoice (spec §4.4: "Outstanding invoices: one query over `books_invoices` (`customer = id`, `status = 'posted'`, `balance > 0`)"; Find invoice no.: "`status = 'posted'`"), so the text is reached only by a REST client, for which "(draft)" names the cause; an internal record id would not help a reader.

## Design notes
- cp 1 · reviewer A #6: `server/invoices.go` `moveInvoicePayments` — an invoice correction moves draft payments' applications too, but the customer-change refusal counts only posted payments. Sequence: a draft payment of customer A applies to invoice 1004; the user corrects 1004 and changes its customer to B; the correction posts; the draft payment now names B's invoice and its Post is refused "Invoice 1004 is not a posted invoice of this customer." Data stays consistent. Option: on a customer change, leave draft payments' applications on the void original or remove them.
- cp 1 · reviewer A #7: the server does not hold a payment correction to its original's customer; a correction draft can name another active customer and post (release and apply stay consistent). Spec §3.6's "a correction keeps its original's customer" sits in the inactive-customer bullet. Option: refuse it on the server, or lock Customer on `?replaces` in cp 2.
- cp 1 · reviewer A #8: `rebuildInvoiceBalances` fails the whole rebuild (500, no report) when a drift's recomputed balance is negative (applications above total); only raw SQL reaches that state. Option: report it as an unfixable drift.
- cp 1 · reviewer A #9: the rebuild route counts fixed invoice balances in `fixed` but lists only line drifts, not which invoices drifted. Option: return the invoice drifts as it does `lineDrifts`.

## Out-of-plan changes
- cp 1 · `docs/plans/receive-payment-capture.json`: biome format only (failed `tinycld-pkg check` formatting); content unchanged
- cp 1 · `server/report_general_ledger_test.go`: the golden General Ledger spec gains the Payment doc-type clause, because `entry_type_labels.json` now holds `payment`
- cp 1 · `tests/e2e/trial-balance.spec.ts`: `SEEDED_DEFAULT_ROWS` gains Undeposited funds (the seeded October payment debits 1200); named by Do step 10's greps, not by path
- cp 1 · `tinycld/books/lib/entry-route.ts`: comment names payment among the document kinds
- cp 1 · `tinycld/books/types.ts`: re-exports `BooksPayments`, `BooksPaymentApplications` (the fixture imports types through `../types`)

## Phase notes
- phase 1: design packet generated unattended (staging p2-receive-payment/packet.md); no human corrections.
- phase 3: design gate 2026-11-15 — human picked direction A (document form) and accepted the recommended answers to Q1–Q14 (see spec). No platform items new; no core extension.
- phase 3 pass 2 (2026-11-15, unattended): direction A built as the scratch route `screens/helix-mockup.tsx` (`?state=` populated, empty, over, credit, no-open, find-miss, loading, error, no-access, read, read-credit, read-void, invoice) over `tinycld/books/lib/receive-payment-fixture.ts`; reference captured to `docs/plans/receive-payment-reference/` (44 shots, 390 and 1280; error, no-access, loading and find-miss light only) from `docs/plans/receive-payment-capture.json`. Both sparks kept (big figure "Amount received"; money columns with shared width constants, Amount to apply / to credit under Payment). No spark dropped. No human corrections (unattended; approval skipped per mockups.md).
  - Fixture types: `PaymentRecord`, `PaymentApplicationRecord` and `OpenInvoiceRecord` (`BooksInvoices & { balance }`) are local mirrors of spec §4.1; the migration checkpoint must replace them with the generated `BooksPayments`, `BooksPaymentApplications` and `BooksInvoices` and wire the fixture into `seed.ts`.
  - Reference notes for the build: grid columns tick 44, Invoice flex (min 200), Due date 172 (fits "Oct 2, 2026 · Overdue" on one line), Original 128, Open balance 128, Payment 160; the phone/wide switch in the mockup is the workspace breakpoint, while the spec switches at form width 640 px; at 300 px Deposit to wraps "Undeposited funds (created when you post)" onto two lines; the invoice shot shows only the new invoice parts (badge Partly paid, Balance due figure, Payments total row, Payments block, Receive payment action), not the whole invoice read view.
- phase 4 (2026-11-15, unattended): plan `docs/plans/receive-payment-checkpoints.md`, 5 checkpoints (1 data/posting/invoice balances, 2 wide form + read view, 3 phone cards + Find invoice no., 4 void/correction/journal links, 5 invoice + customer views + help); 10 of 12 e2e runs; no core change. plan-check --unattended: 0 errors. Plan decisions: sum ≤ amount checked at posting on the server (each write on the client); `amountTyped` derived on reopen (amount ≠ applied sum); `paymentSchema(currency, depositOptions)`; Clear payments is a Books link with core `useButtonShortcut` (core `ShortcutButton` takes no ref); shared `DocumentChrome` context for header/action bar; invoice status order Paid → Partly paid → Overdue → Open.
  - plan review (general-purpose, report staging p2-receive-payment/plan-review.md): 50 findings, all fixed in the plan. Main ones: `amountTyped: true` on reopen contradicted the e2e (→ derived rule); cp 2 e2e tabbed past cp 3's Find field (→ cp 3 adds the Tab and lists the keyboard spec); Books `MoneyInput` is opening-balances only (→ `PaymentMoneyField`); `paymentMethodOptions({ allowNone })`; `depositAccountOptions` has no `''` option (→ `paymentDepositOptions` / `paymentDefaultDeposit`); `ShortcutButton` has no ref (→ `ClearPaymentsLink`); `VoidDialog` fixed body (→ `body` prop, cp 4); `DocumentHeader` badge override (cp 5); `postInvoice`/`fillInvoice`/`nonTaxableService` live in `customer-pages-transactions.spec.ts`; `server/numbering_test.go` pinned list; cp 3 gate runs the helper's importers; `DOCUMENT_READ_KEYS.receive_payment`; correction-draft create with the original's inactive customer; entry `Memo`; rebuild `fixed` count; missing e2e steps (Post & new, Discard/Delete draft, Esc layering, server refusal under a row, customer change re-spread, no open invoices, Pay all after a typed amount, ⌥A/⌥⌫/J, Overdue, last-row Enter, select-all, voided/replaced by, Name column); load/error paths for the picker, `queryOnce` reads, the correction's original and cp 5 queries; inactive stored customer/deposit and inactive Find match; four conditional-scope placeholders removed; §2 route bullets and §4.4 reads quoted in cp 2. Not given an e2e step: an inactive stored customer's trigger name (Do step only; making a customer inactive mid-flow costs a long UI detour).
- review mode switches: none

## Checkpoint 1
- test writer: server/payments_test.go, payment_posting_test.go, invoice_balance_test.go, invoice_payments_test.go, tests/receive-payment-fixture.test.ts (new); numbering, entry_type_labels, report_sources, oauth_scopes, audit, customers, accounts, balances, registrations, report_transaction_detail Go tests and collections/accounts-form-harness/register/doc-types/entry-route TS tests (pinned lists); 61 tests; red for the right reason: yes (Go build fails only on the missing production symbols; vitest 11 fail; fixture value tests red only in tsc: generated types and `PAYMENT_SEED` missing); untestable: none (`paymentLabel` has no signature in Interfaces: checked through the audit labels written and `paymentName`; "a correction with no applications still posts" is the unchanged `invoice_posting_test.go`)
- implementer: three dispatches by layer (>15 files): (1) migration 2100000019 + in-place 2100000001/2100000002, collections.ts, register/doc-types, entry JSON files, fixtures with `PAYMENT_SEED` (dates 2026-10-17 full, 2026-10-25 partial); (2) all Go (payments.go, payment_posting.go, invoice_balance.go, invoice kind void/correction rules, balance on post, rebuild/verify, labels, audit, OAuth, delete guards); (3) `seedPayments` in seed.ts, Do step 10 greps, trial-balance.spec.ts list; DONE ×3 (reports cp1-impl-1/2/3.md in the staging cp folder)
- test disputes: none
- self-declared differences: customer-page and sales-tax-liability fixtures unchanged (their rows are `Pick<BooksInvoices,…>` without balance) · invoice-form fixture sets balance in its `invoice()` builder · migration extras (payment indexes; invoice create/update rules pin `balance`; schema bounds amount ≥ 1, applied/credited ≥ 0) · void invoice and replaced original get balance 0 · invoice correction moves draft payments' applications too (only posted count for the refusals) · new text "An invoice row stays on its payment." for moving an application to another payment · invoice with no number shows "(draft)" in refusals · customer-on-payments delete check runs after invoice/receipt/estimate checks · posting re-checks deposit_to and each invoice's status/customer/balance · payment FTS sync left to cp 2's search step · `rebuildInvoiceBalances` also zeroes drifted draft balances · seed resolves the payment's customer from the fixture invoice · seed logs no per-row line (posts confirmed from the server log)
- gate 1: tests unedited: yes · pass (packages:generate, tinycld-pkg check, go test ./..., gofmt, go vet; e2e trial-balance.spec.ts 16 passed; implementer also ran customer-pages-balance 6 and customer-pages-transactions 5 passed)
- gate 2: n/a (logic checkpoint)
- gate 3 A (correctness): 0 BLOCK, 9 NOTE (#1–#4 out-of-plan files, recorded under Out-of-plan changes; #5 false harness comment → accepted+fixed by a test-writer dispatch, the same as B #6; #6–#9 to Design notes)
- gate 3 B (conformance): script lines: 0 real, 2 false positive (2100000001 / 2100000002 in-place edits: Books unreleased, spec §4.2 orders them) · #1 balance writes outside `invoice_balance.go` → accepted+fixed (`setPostedInvoiceBalance`, `clearInvoiceBalance`) · #2 out-of-plan files → recorded · #3 "An invoice row stays on its payment." → rebutted (see Rebuttals) · #4 "Invoice (draft) …" → rebutted (see Rebuttals) · #5 applications createRule lacks the draft clause → accepted+fixed (`@request.body.payment.status = "draft"`, proven red with the old rule by a throwaway test) · #6 false harness comment → accepted+fixed (test writer) · DEFERRAL customer-page and sales-tax-liability fixtures without `balance` → accepted+fixed (both builders set it)
- fix review: round 1: clean (findings file cp1-fix.md, 4 items; gate 1 again green incl. trial-balance.spec.ts 16 passed)
- gate 3 A notes: 4, listed under Design notes
- reviewer-caught deferrals: 1 (reviewer B: customer-page-fixture.ts and sales-tax-liability-fixture.ts left without `balance`; the implementer declared it as a difference, not a deferral, reading their `Pick` rows as not `BooksInvoices`-typed) — fixed in the fix round
- commit: (this commit)
- human: none (review mode C)

## Final review
- eval:
