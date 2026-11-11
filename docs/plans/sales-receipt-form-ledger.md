# sales-receipt-form — helix run ledger

- mode: unattended
- unit: p2-sales-receipt
- started: 2026-11-11
- package branch: books/p2-sales-receipt (from books main@09a4593)   core checkout: main@5a97168c
- spec: docs/specs/sales-receipt-form-design.md
- checkpoints: docs/plans/sales-receipt-form-checkpoints.md
- reference: docs/plans/sales-receipt-form-reference/
- evidence: docs/plans/sales-receipt-form-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/sales-receipt-form-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - The amount received is the largest figure → expressible (the shared document header's big figure, `text-2xl font-semibold text-foreground tabular-nums`, label "Amount received")
  - How the customer paid and where the money went read as one group → expressible (a second row in the header band, `rounded-xl border border-border bg-surface-secondary p-4`, divided by `border-t border-border`; same cell chrome; Deposit to only with "Ask")

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
- phase 1: no corrections to the extractions (intake at staging/p2-sales-receipt/intake.md). Design gate 2026-11-11 (revise 1, then approval):
  - direction: A (invoice document page; second header-band row Payment method · Reference no. · Deposit to). B not chosen.
  - Q1 own collections `books_sales_receipts` / `_lines` / `_tax_lines` (migration 2100000011), shared code by kind config — accepted.
  - Q2 customer optional with "No customer" — accepted.
  - Q3 Deposit to — replaced by the human (D-Q3): Books setting "Sales deposited to" ("Ask" default, or one active bank / Undeposited funds account); the form shows Deposit to only with "Ask"; otherwise the setting decides. The person at the counter must not decide where funds go.
  - Q4 fixed optional payment-method list, Go mirror drift-tested — accepted.
  - Q5 Reference no. optional ≤ 40, printed, searchable, not copied — accepted.
  - Q6 own sequence `sales_receipt` (`booksseqsalesrc`, no prefix, next 1001), Numbering card, assigned at posting — accepted.
  - Q7 PDF view tab, kind `sales_receipt`; no Deposit to or Memo on the PDF — accepted.
  - Q8 generalize the invoice client and Go code into one sales-document layer in this unit; no file copied; invoice tests green — accepted.
  - Q9 big figure and last totals row "Amount received"; no Balance due — accepted.
  - Q10 customer fills = the invoice's minus Terms; clearing clears Bill to and Email, Tax to default rate, keeps taxable flags — accepted.
  - Q11 Edit = correction under the same number, Void = reversing entry — accepted.
  - Q12 delete guards for customer, product, tax rate, account (deposit account of any receipt); deactivating a draft's deposit account allowed, Post refuses — accepted.
  - Q13 + New → Customers → "Sales receipt"; entries, registers, drawer, search; no list — accepted.
  - Q14 seed: two posted receipts (Check to 1200 with customer; Cash to 1000 no customer) after mid-2026, one draft; e2e book gains 1200 Undeposited funds — accepted.
  - Q15 Copy: customer, lines, tax, payment method, deposit to, message; today; no reference, no memo — accepted.
  - Q16 hidden mode: row holds Payment method · Reference no.; third cell empty; no text names the account — accepted.
  - Q17 new Settings section "Sales" (between Accounting and Numbering), card "Sales receipts" with "Sales deposited to" — accepted.
  - Q18 `books_settings.sales_deposit_account` (relation, optional, empty = Ask) added in 2100000011; settings guard — accepted.
  - Q19 server stamps the set account on every create, update and post; `deposit_to` stays required; hidden via `hideBuiltins`, zod requires it only with "Ask" — accepted.
  - Q20 the set account cannot be made inactive, deleted or retyped while set — accepted.
  - Q21 form reads the setting live; set account stamped on drafts, corrections and copies; with "Ask" draft keeps stored, correction shows original's (editable), copy takes source's when active else default — accepted.
  - Q22 setting covers sales receipts only — accepted.
  - Q23 admins edit; others see read-only rows; audit log — accepted.
  - Q24 seed leaves "Ask" and an empty message; all setting-dependent e2e in `sales-receipt-form-settings.spec.ts` with `afterEach` restore through the UI; set account 1200; hidden mode once at 390 — accepted.
  - Q25 "Ask" mode: required, bank + Undeposited funds options in chart order, default first Undeposited funds else first bank, inline error with neither; `ensureUndepositedFunds` added for later units, posting never creates accounts — accepted.
  - D-MSG (human): Books setting for the default printed message, used by invoices and sales receipts (the invoice gains it in this unit); both forms use one label for the message field.
  - Q26 `books_settings.default_customer_message` (text ≤ 4000, 2100000001 edited in place), card "Invoices and sales receipts" in Settings → Sales — accepted.
  - Q27 shared labels "Message to customer (printed)" / "Internal memo (not printed)" from `DOCUMENT_NOTE_LABELS`; hints per kind; invoice tests and help change with it — accepted.
  - Q28 default fills only a new blank form (new, Post & new, `?customer=`); copy, correction, saved draft keep their text; server never fills — accepted.
  - Q29 one value for both kinds — accepted.
  - Q30 empty setting → empty message, no Notes block on the PDF — accepted.
  - Q31 message-setting e2e in `sales-receipt-form-settings.spec.ts` — accepted.
  - platform: keyboard shortcuts (web + iOS hardware keyboard) and Customer autofocus / type-to-open pickers (web only) — approved as the standing default for all Books forms.
  - core: no core change, no checkpoint 0.
- phase 3 (2026-11-11, unattended, pass 2): direction A captured. Fixture `tinycld/books/lib/sales-receipt-form-fixture.ts`: local `SalesReceiptRecord` / `SalesReceiptLineRecord` / `SalesReceiptTaxLineRecord` derived from the generated invoice types per spec §4.1 (the migration checkpoint 2100000011 must replace them with the generated `BooksSalesReceipts*` through `satisfies`) and a local `PaymentMethodKey` / `PAYMENT_METHOD_LABELS` (to be replaced by `lib/payment-methods.ts`); `DEPOSIT_ACCOUNTS` (1000, 1010, 1200 Undeposited funds, fixture ids `acctfix*`; the seed resolves by number), `SALES_SETTINGS_ASK` / `SALES_SETTINGS_SET`, `DEFAULT_CUSTOMER_MESSAGE`, `LONG_REFERENCE` (40 chars), `SALES_RECEIPT_SEED_IDS` (posted 1004 Check→1200 Harborview; walk-in 1005 Cash→1000 no customer) and `SALES_RECEIPT_SEED_DRAFT_ID`, `SALES_RECEIPT_REFUSALS`. Every amount and total checked equal to `documentTotals` (tsx script, all six receipts). Scratch route `tinycld/books/screens/helix-mockup.tsx`, states: new, filled, set-account, no-customer, exempt, no-deposit, errors, errors-hidden, draft, correction, pdf-unsaved, pdf-stale, posted, walk-in, void, reader, no-access, cannot-edit, not-found, loading, error, settings-ask, settings-set, settings-reader, settings-list. Manifest `docs/plans/sales-receipt-form-capture.json`; reference `docs/plans/sales-receipt-form-reference/`. Sparks: both kept (Amount received `text-2xl` top right / under the title on a phone; Payment row ruled `border-t` inside the band, third cell empty when an account is set). No spark dropped. No human corrections (unattended).
  - stand-ins (the build replaces, not copies): band and line grid drawn with core inputs, not FormRenderer + the shared document fields/cells (Qty/Rate left-aligned plain TextInputs, row menu an icon only); header, totals and load error are local copies of the invoice's with the receipt words (spec §3.1 generalizes them); PDF tab shows a framed text page, not `PdfCanvasViewer`; Settings rail and phone list drawn locally (`SectionId` has no `sales` yet), other sections' summaries invented; read lines reuse `InvoiceReadLines` (its header says "Price"); read actions reuse `InvoiceReadActions` with static items; More "Download PDF" shows `⌘P` text.
  - widths: measured on `/a/books/helix-mockup` inside the Books layout, the shipping layout for `books/sales-receipts/*` and `books/settings/sales`.
- phase 4 (2026-11-11, unattended): 5 checkpoints, plan-check exit 0 (176 warnings, all produced-not-consumed or defined-by-an-earlier-checkpoint). CP1 data + Go generalization (invoices.go → sales_documents.go, posting by kind) + seed; CP2 receipts across Books (guards, search, PDF, payment methods); CP3 client rename into the sales-document layer (invoice only, test ids unchanged); CP4 receipt form + read view (6 e2e runs); CP5 Settings → Sales, hidden Deposit to, default message, help (4 e2e runs). Decisions later phases must know:
  - per-kind data sources (`INVOICE_DATA`, `SALES_RECEIPT_DATA`) hold every `useStore` of a document collection (`useStore` is typed by literal names); everything else is shared, driven by `SalesDocumentKind` / `DocumentKind`.
  - both keyboard-only tests live in `sales-receipt-form-settings.spec.ts` (the Tab path depends on the setting); `books-settings.spec.ts` checks the Sales section's presence and order only.
  - `no-deposit` shot not captured at gate 2 (the e2e book always has deposit accounts); covered by unit and Go tests.
  - seeded receipts are numbered by posting (1001, 1002), not the fixture's 1004/1005; no test asserts a seeded number.
  - the deposit-accounts query is owned by the receipt screen (merged Retry); only the Settings card shows `depositLoadFailed`.
  - invoice spec files run one file per command at CP3 (four files), CP4 (`invoice-form-draft`), CP5 (`books-settings`, `invoice-form-post`); not counted in the 12-run budget.
  - plan review (staging/p2-sales-receipt/plan-review.md): 57 findings, all fixed in the plan. Main ones: `books-settings.spec.ts` asserted a setting-dependent summary outside the settings file; `DepositAccountRow` defined twice (now `lib/deposit-accounts.ts`, fixture re-exports, rows gain `parent`/`inactive`); `documentSchema` gained `deposit?: DepositRule`; `PAYMENT_METHOD_KEYS` and `paymentMethodOptions` added to CP2; no TS `compareChartOrder` (order from `filteredAccountOptions`); `helpTopic` added to the kind and the first `help/sales-receipts.md` moved to CP4; new texts `Choose where the money was deposited` and `Reference no. can be at most 40 characters`; unit tests added for screen states, read actions, kind config, search target, sales settings, OAuth, the void-reversal label; e2e steps added (Post & new focus, copy focus, clear customer, exempt hint on both kinds, Edit address with no customer, PDF unsaved/stale, entry drawer without Reverse, accounts load error, Replaced by, phone More items, afterEach reactivates 1200); the account type test uses `prepaid_expenses` / `other_asset`; hedged file choices made definite. Narrowed and recorded: the default message on the PDF is checked through the stored message (200 response + read view) plus the Go PDF test, because the canvas has no text layer.
- review mode switches: none

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
