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
- cp 1 · reviewer A: `pb-migrations/2100000011_create_books_sales_receipts.js` comment says `server/search_index.go` keeps `fts_books_sales_receipts` in step; the source is added in cp2 (its Files block names `search_index.go`), so the index is empty until then.
- cp 1 · reviewer A: `books_journal_entries` createRule refuses only `doc_type != "invoice"`; for `sales_receipt` the Go hook refuses (so its own text shows). A REST create with `doc_type: sales_receipt, origin: reversal, reverses: <manual entry>` saves a stray draft that can never post (reversal.go refuses the doc-type mismatch). Optional: `checkNewEntry` refuses `originReversal` for a document doc type whose target is not a document entry.
- cp 1 · reviewers A and B: `msgReceiptCustomerInactive` and `Msgs.CustomerOnDocs` unread in cp1 (cp4 drift test, cp2 customer delete hook); cp2/cp4 must use or remove them.
- cp 1 · reviewer A: the `books:sales_receipt` host names `PaymentMethodField` / `DepositAccountField`; core `HostMount` returns null for a missing component, so cp4 must add both to `forms/ui.ts`. The message label is a literal until cp3's `DOCUMENT_NOTE_LABELS`.
- cp 1 · reviewer A: until cp4's `lib/entry-route.ts` change, the two seeded receipt entries open as `books/entries/<id>` in the Journal Entries list, and Edit leads to a server refusal.
- cp 1 · fix reviewer: `server/sales_documents.go:112` comment names `lib/sales-document-kinds.ts`, which cp3/cp4 create; correct the comment if that file is named differently.
- cp 2 · reviewer A: `checkAccountChange` on the set deposit account runs the journal-lines / sub-account type checks (type change) and the active sub-accounts check (deactivation) before the set-account text; each refusal is correct, only which text shows first differs. Optional: call `checkSetDepositAccountChange` first in both branches, after the Banking checks.
- cp 2 · reviewers A and B: federated search returns `sales_receipt:<id>` rows, but `lib/search-target.ts` has no `sales_receipt` path until cp4 (its Files block names `['sales_receipt', 'books/sales-receipts/[id]']`); a receipt hit opens nothing until then. cp4 reviewers check it and the file's header comment.
- cp 2 · reviewer A: the PDF prints the label "Payment" before "Check · 43567" (spec §3.8 names no label; the read view uses "Payment"); the receipt PDF's big amount is "Amount received".
- cp 2 · reviewer A: `lib/payment-methods.ts` `LABELS` Map repeats `PAYMENT_METHOD_LABELS`; `paymentMethodLabel` could read the record through an own-key guard.
- cp 2 · reviewers A and B: the scratch route `helix-mockup.tsx` (git-excluded) lost a `.filter(([key]) => key !== '')` in cp2 (the re-exported `PAYMENT_METHOD_LABELS` has no `''` key; "None" comes from `paymentMethodOptions()`); cp3's import edits start from that state.

## Out-of-plan changes
- cp 1 · `tinycld/books/forms/hosts.ts` — `books:sales_receipt` host; the generic Go line guard (`lineRowError`) reads the host by `kind.HostKey`, so receipt lines are refused without it.
- cp 1 · `server/audit.go`, `server/oauth_scopes.go` — receipt collections (planned for cp2); `TestAudit_CoversEveryCollectionPeopleWrite` and `TestOAuth_CoversEveryBooksCollection` fail without them.
- cp 1 · `server/pdf_invoice.go`, `server/pdf_invoice_test.go` (helper `invoiceKind` → `invoicePDFKind`, name clash), `server/invoices_test.go`, `server/report_journal_test.go`, `server/registrations_test.go` (`serverOnly` gains the receipt tax lines), `server/entry_type_labels_test.go`, `server/numbering_test.go`, `server/report_general_ledger_test.go` golden (Type `case` gains the sales_receipt branch) — renamed calls and doc-type lists that pin every doc type.
- cp 1 · `tests/register.test.ts`, `tests/collections.test.ts` — pinned doc-type and collection lists gain the receipt.
- cp 1 · `BooksSettings` literals gain the two new settings fields (tsc): `lib/books-settings-fixture.ts`, `lib/account-register-fixture.ts`, `lib/setup-wizard-fixture.ts`, `tests/setup-step-hooks.test.tsx`, `tests/setup-parts.test.tsx`, `tests/useBooksSetup.test.tsx`, `tests/lists-hub.test.tsx`, `tests/useSettingsShell.test.tsx`.
- cp 1 · comment-only (code moved to `sales_documents.go`): `lib/document-lines.ts`, `lib/invoice-line-order.ts`, `lib/invoice-schema.ts`, `tests/invoice-line-order.test.ts`, `tests/e2e/invoice-form-draft.spec.ts`, `pb-migrations/2100000010_create_books_invoices.js`; `docs/plans/sales-receipt-form-capture.json` biome format only.
- cp 1 · `tinycld/books/types.ts` — re-exports the generated `BooksSalesReceipts`, `BooksSalesReceiptLines`, `BooksSalesReceiptTaxLines` (the fixture and the tests import them from there).
- cp 2 · `server/pdf_template.html` — one `{{if .Payment}}` line under the dates; `pdfDocument.Payment` cannot print without it (invoice PDFs unchanged: Payment empty).
- cp 2 · `server/search_index_test.go` — index count 6 → 7 (resolved test dispute: Do 5 registers `fts_books_sales_receipts`).
- cp 2 · `tinycld/books/screens/helix-mockup.tsx` (git-excluded scratch route) — one filter removed so tsc compiles after the fixture re-export.

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

## Checkpoint 1
- test writer: server/sales_receipts_test.go, server/sales_receipt_posting_test.go, server/sales_deposit_test.go, tests/sales-receipt-form-fixture.test.ts, tests/doc-types.test.ts (+1 `it`); 35 tests (28 Go, 7 TS); red for the right reason: yes (Go: build fails on the missing produced names; 5 fixture `it`s red through the file's typecheck, since the fixture predates the checkpoint and the generated types are missing); untestable: none. Notes it raised: `invoiceKind(t)` helper in pdf_invoice_test.go clashes with the Go var (rename it); the generic line guard reads the forms host by `kind.HostKey`, so `books:sales_receipt` must exist in `forms/hosts.ts` now (the plan's Files block has no hosts.ts change → loop decision: add the host in cp1, out of plan); the entries createRule must not hide the hook's refusal text; `types.ts` re-exports the new generated types.
- implementer: migration 2100000011 + edits to 2100000001/2100000002, Go generalized (`sales_documents.go`, `sales_document_posting.go` by `git mv`; new `invoices.go`, `sales_receipts.go`, `sales_deposit.go`), collections, doc-type labels, 1200 Undeposited funds, fixture typed by the generated types, seed posts two receipts and keeps one draft; DONE (2 disputes, 14 declared differences).
- test disputes:
  - `TestSalesReceiptPost_WritesTheEntry` / `TestSalesReceiptPost_CreatesNoAccount` count one account more after a post: the test env has no 3900 Retained earnings, so the ledger's `ensureRetainedEarnings` (server/posting.go) creates one. Settled: the checkpoint asks "posting never creates an account (the chart's account count is unchanged after a post)" on "a test app with the e2e chart", and the e2e chart (`lib/seed-accounts.ts`) has 3900 Retained earnings → the test env is wrong; fresh test writer adds 3900 to `receiptEnvOn`, the assertion unchanged.
  - `tests/sales-receipt-form-fixture.test.ts:164` fails biome format → fresh test writer formats it (no assertion change).
- self-declared differences: `forms/hosts.ts` gains `books:sales_receipt` (loop decision; lines built-in shared as `DOCUMENT_LINES_BUILTIN`; cp4 must add `PaymentMethodField` / `DepositAccountField` to `forms/ui.ts`; cp3 must move the message/memo labels to `DOCUMENT_NOTE_LABELS`) · audit labels and OAuth scopes for the receipt collections brought forward from cp2 (coverage tests fail without them) · `CustomerRequired` set per kind, not read · `checkReceiptDepositToPost` as `BeforePost` · `msgReceiptCustomerInactive` declared for cp4's drift test, the shared guard uses `msgCustomerInactive` (same words) · shared message constants renamed `msgDocument*` / `msgSalesDoc*` (same words) · `msgPercentTarget`, `msgCustomerInactive`, `invoiceHostKey` stay in `invoices.go` · `isInvoiceEntryOrigin` → `isDocumentEntryOrigin` with `documentEntryFromPostText(docType)` · FTS table created, read from cp2 · `seedSalesReceipts` takes `ctx` (posted_by) · `PaymentMethodKey` = the generated select type · receipt delete guards (tax rate, product, customer, account) are cp2's, as planned.
- gate 1: tests unedited: yes (after the two dispute fixes, staged) · `packages:generate` 0, `tinycld-pkg check` pass (228 files, 4613 tests), `go test ./...` pass · no sales-receipt-form e2e spec exists yet; seed check: `account-register-table.spec.ts` (reads 1000 Business Checking this month, runs the new `seedSalesReceipts`) 2 passed, seed log clean.
- gate 2: n/a (nothing renders)
- gate 3 A (correctness): 0 BLOCK, 9 NOTE · accepted+fixed: missing Go tests for the Spec bullets "Post refuses an inactive or wrong-type Deposit to" and "Post refuses an inactive customer" (weak-test, fresh test writer); `msgDocumentEntryNeedsLink` "names its invoice" → "names its document" (one-line text); `CustomerRequired` comment (with B 2) · to Design notes: search_index comment ahead of cp2, REST reversal create under `sales_receipt`, unread constants for cp2/cp4, host custom components for cp4, `entry-route.ts` receipt routes (cp4 Files names it) · seed first-run note answered by the gate-1 seed check · out-of-plan list matches the ledger.
- gate 3 B (conformance): script lines: 0 real, 3 false positive (migrations edited in place: Books unreleased, spec §4.2 and Do 1 ask it; 2100000010 comment only) · findings: 1 `types.ts` missing from Out-of-plan → accepted, added by the loop; 2 `CustomerRequired` read by nothing → accepted (comment, fix item 3); 3 unused constants for cp2/cp4 → no fix in cp1 (Design notes).
- fix round (cp1-fix.md, 3 items): 1 weak-test → fresh test writer added `TestSalesDeposit_PostRefusesAnAccountMadeInactive` and `TestSalesReceiptPost_RefusesInactiveCustomer` (+ a correction whose original's customer is inactive still posts); both pass and each fails with its post check removed (proved by `go test -overlay`) · 2 `msgDocumentEntryNeedsLink` → "A document's journal entry names its document." · 3 `CustomerRequired` comment · gate 1 again: `tinycld-pkg check` pass, `go test ./...` pass.
- fix review: round 1: clean (0 BLOCK) · 1 NOTE to Design notes.
- gate 3 A notes: 5 listed under Design notes
- reviewer-caught deferrals: none
- commit: 20cdd74
- human: none (review mode C)

## Checkpoint 2
- test writer: server/settings_test.go, accounts_test.go, customers_test.go, products_test.go, sales_tax_test.go, document_posting_test.go, search_test.go, registrations_test.go (edited), audit_test.go, oauth_scopes_test.go, pdf_sales_receipt_test.go (new), tests/payment-methods.test.ts (new); 25 tests; red for the right reason: 20 yes; 5 green before the code because cp1 or existing behavior already delivers them (audit labels and settings audit row, OAuth scopes — cp1 brought them forward; settings checked-only-on-change has no guard to refuse yet; the 4000-char message is the cp1 migration's limit); `TestTaxRateReferences_StartWithGroupComponents` count raised to 5 for the new references; untestable: none. "the lower `sort_key`" in the brief: accounts have no sort key; loop decision: chart order (number, unnumbered last, id), as `ensureReceivables`.
- implementer: settings and account guards for the set deposit account, deposit-of-receipts delete refusal, customer (`Msgs.CustomerOnDocs`, cp1 note answered) / product / tax-rate references, `ensureUndepositedFunds`, generic `searchSalesDocs` (LEFT JOIN) + `fts_books_sales_receipts` (cp1 note answered), PDF kind `sales_receipt` with shared `documentPDF*` builders and `pdfDocument.Payment`, `payment_methods.json` + Go/TS mirrors, fixture re-exports; DONE (1 dispute, 7 declared differences).
- test disputes: `server/search_index_test.go` `TestSearchIndex_TablesHoldTheConfiguredColumns` pinned 6 indexes. Settled by Do 5: "`search_index.go` registers `fts_books_sales_receipts`" → test wrong; fresh test writer set 7, staged.
- self-declared differences: one generic `searchSalesDocs` with `invoiceSearch` / `salesReceiptSearch` values instead of a copied `searchSalesReceipts` (invoice now LEFT JOIN + COALESCE, same rows) · `documentPDFLines` / `documentPDFTaxLines` take collection + parent field; also `invoiceTitle` → `documentPDFTitle`, `invoiceBillTo` → `documentPDFParty`, new `documentPDFCompany` · PDF payment line labelled "Payment"; receipt big amount "Amount received" · `PAYMENT_METHOD_KEYS` an `as const` tuple, `PAYMENT_METHODS` built from keys + labels · re-exported `PAYMENT_METHOD_LABELS` has no `''` key (scratch route filter removed) · delete-refusal order (changed in the fix round, see gate 3 A) · `lib/search-target.ts` gains no `sales_receipt` path until cp4's route (cp4 Files names it; Design notes).
- gate 1: tests unedited: yes (after the dispute fix, staged) · `tinycld-pkg check` pass (229 files, 4617 tests), `go test ./...` pass · no e2e in this checkpoint's Gates line.
- gate 2: n/a (nothing new renders)
- gate 3 A (correctness): 1 BLOCK, 6 NOTE · BLOCK 1 set deposit account with postings gets the journal-lines delete text, then "make inactive" is refused → accepted+fixed (fix items 1, 2) · NOTE 4 `documentPDFLines` copies `salesDocLines`' query → accepted with B F4 (fix item 3) · NOTEs 2, 3, 5, 6, 7 → Design notes.
- gate 3 B (conformance): script lines: 0 · F1 `pdf_template.html` out of plan → accepted, recorded under Out-of-plan · F2 `search_index_test.go` count change → accepted, the resolved dispute, recorded under Out-of-plan · F3 scratch route edit → recorded under Out-of-plan and Design notes · F4 copied lines query → accepted+fixed (fix item 3). The script's out-of-plan list also named pdf_document.go, pdf_invoice.go, pdf_kinds.go, pdf_sales_receipt.go, which the Files block names (script misparse; retro log).
- fix round (cp2-fix.md, 3 items): 1 spec-logic → set-account delete refusal moved before the journal-lines count, after the Banking check · 2 weak-test → fresh test writer added `TestAccount_SetDepositAccountRefusals/deleted_with_journal_lines` (posts a receipt to the set 1200, then deletes it; red with the journal-lines text before the fix) · 3 mirror → one lines query: `salesDocLines` and `documentPDFLines` share it · gate 1 again: `tinycld-pkg check` pass, `go test ./...` pass.
- fix review: round 1: clean (0 BLOCK, 0 NOTE).
- gate 3 A notes: 5 listed under Design notes (4 from A, 1 shared with B)
- reviewer-caught deferrals: none
- commit: 2d565b2
- human: none (review mode C)

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
