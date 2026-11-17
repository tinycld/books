# credit-memo-form — helix run ledger

- mode: unattended
- unit: p2-credit-memo
- started: 2026-11-16
- package branch: books/p2-credit-memo   core checkout: main (b95c7a8)
- spec: docs/specs/credit-memo-form-design.md
- checkpoints: docs/plans/credit-memo-form-checkpoints.md
- reference: docs/plans/credit-memo-form-reference/
- evidence: docs/plans/credit-memo-form-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/credit-memo-form-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - The credit amount is the largest figure on the screen → expressible (shared `DocumentHeader` big figure, label "Credit amount")
  - The totals stand in one column under the line amounts → expressible (shared `DocumentTotalsPanel`)
  - green split save button, dark footer, grey header wash → dropped (not this app's look)

## Deferrals
(none yet)

## Rebuttals
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
- cp 1 · reviewer A NOTE 1: `tests/e2e/audit-log.spec.ts:104-112` now polls the heading against the business name; a heading wrong at first draw and right later passes. The source of the race is `books-settings.spec.ts` changing the shared business name while report specs read it.
- cp 1 · reviewer A NOTE 5: `TestCreditMemo_ServerFieldsRefused` cannot tell the create rule from the Go guard (`checkNewSalesDoc` refuses the same fields with the same 400), so dropping `balance` from the migration's server fields would stay green; the behavior (refused) is pinned.
- cp 1 · reviewer A NOTE 7: until checkpoint 2, a customer whose only document is a credit memo is refused on delete with PocketBase's generic relation error, not "<name> is on credit memos."; the FTS table stays empty and the seeded memo counts on the Cash method. No UI reaches this before checkpoint 3.

## Out-of-plan changes
- cp 1 · `server/sales_documents.go` (shared Books-field lists, `booksFieldsOf`) and `server/estimates.go` (call shape of `checkSalesDocBooksFieldsKept`): `invoice` was a Books-only field for every kind, so the shared guard refused every linked credit memo.
- cp 1 · `server/oauth_scopes.go`: memos and lines rw, tax lines ro (spec §4.3 Registrations); `TestOAuth_CoversEveryBooksCollection` fails without it.
- cp 1 · `server/report_general_ledger_test.go` (golden Type formula gains `credit_memo`), `tests/register.test.ts` and `tinycld/books/lib/register.ts` (`DOC_TYPE_LABELS.credit_memo`, mirrored against `entry_type_labels.json`; `tests/doc-types.test.ts` reads it): list additions for the new doc type.
- cp 1 · `tinycld/books/lib/audit-log.ts`, `tinycld/books/lib/audit-fields.ts`: TS mirrors of the audit record type options and field maps (`tests/audit-log-fixture.test.ts`, `tests/audit-fields.test.ts`).
- cp 1 · `tinycld/books/lib/entry-route.ts`: comment only.
- cp 1 · `tests/e2e/audit-log.spec.ts`: gate-1 regression fix (a cross-spec race on the business name), see Checkpoint 1 gate 1.

## Phase notes
- phase 1: first design gate (2026-11-15, lane purchases): direction A; Q1–Q16 as recommended (credit stays on the customer; Create credit memo key M on a posted invoice with a stored invoice link; label "Credit amount"; credit A/R, debit income and tax; negative tax lines; own sequence `booksseqcreditm`; PDF in; empty default message; statement message cut; server-written balance; customer Transactions chip; edit/void as the invoice; all line kinds, total ≥ 0; delete guards; seed one posted + one draft; Copy without memo and link); waits_for p3-pay-bills.
- phase 3: second design gate (2026-11-16, lane default): direction A; Q17–Q20 as recommended — Q17 on the Cash method a credit memo is deferred like the invoice, counted only when applied or refunded (no cash-basis figure changes in this unit), on Accrual on its date; Q18 an invoice correction moves the link, and is refused when it changes the customer while a draft or posted credit memo names the invoice; a void keeps the link ("For invoice 1004 (void)"); Q19 credit memos join `books.sales_documents` with kind "Credit memo" and positive totals; Q20 Create credit memo starts with the invoice's customer, Bill to, Email, Tax and a copy of all its lines, today's date, empty message and memo; the credit is not limited by the invoice's total or balance. No platform-only items new. Core at b95c7a8 (p3-pay-bills core #483 merged), books at eb14d812 (#59 merged).
- phase 3 (2026-11-16, unattended, pass 2): direction A captured. Fixture `tinycld/books/lib/credit-memo-form-fixture.ts`; scratch route `tinycld/books/screens/helix-mockup.tsx` (`/a/books/helix-mockup?state=…`); manifest `docs/plans/credit-memo-form-capture.json`; reference `docs/plans/credit-memo-form-reference/` (30 shots, 86 PNGs, widths 390 and 1280, light and dark). No spark dropped: both sparks are drawn by the shared `DocumentHeader` figure and `DocumentTotalsPanel`. No human correction (unattended).
  - how the reference is drawn: the real shared parts (`DocumentHeader`, `DocumentTabs`, `DocumentTotalsPanel`, `DocumentReadLines`, `DocumentReadActions`, `DocumentActionBar`, `DocumentSourceLink`, `DocumentNotice`, `DocumentLoading`, `DocumentLoadError`) and the core `FormRenderer` over a scratch host (the invoice host without `terms` and `due_date`, date label "Credit memo date"). Static copies replace the three host components that read collections (Customer, Tax, the line's Product picker). The read band, read footer, stamps, form footer and PDF tab texts are copies of the unexported layout of `DocumentReadView.tsx`, `DocumentForm.tsx` and `DocumentPdfView.tsx`. The PDF tab shows an empty page frame (no server PDF). The customer Transactions scene draws only the chips and the rows (copies of `CustomerTransactionsTab.tsx`), not the customer page header.
  - decisions the plan must carry:
    - the scratch kind keeps the invoice's `key`, `hostKey` and `helpTopic` (`books:invoices`), because `credit_memo`, `books:credit_memo` and `books:credit-memos` do not exist yet. The build uses the spec's values (§3.1) and adds the help topic.
    - band of the form: Customer, Bill to, Email full width; then Credit memo date and Tax, each half width (Tax `narrowWidth: 'full'`). The invoice's quarter widths leave half the row empty without Terms and Due date.
    - invoice link, form: a row at the bottom of the band, under its fields: `DocumentSourceLink` "For invoice 1004", then an outline `Button` "Remove link"; the server's refusal (`errors.invoice`) is `text-xs text-destructive` under the row. The gap above the row in the reference (the renderer's own bottom space plus `mt-4`) is larger than needed: the build closes it.
    - invoice link, read view: the same link at the bottom of the band, under the details (artboard A2), not under the notes where the invoice puts "From estimate". The build uses a band slot for it (`ReadBandRow` is the existing one), not `ReadStampRow`.
    - invoice read view: "Create credit memo" (M) comes after Copy. With Receive payment the wide bar has 7 buttons and More, and it wraps to a second row at 1280 (shot `invoice-read-1280`). On a phone the bar keeps Edit and More; the More row shows the key.
    - "Credit memos" section of the invoice: between the notes and the stamps (after the Payments block); a heading, then a grid of No. (link), Date, Amount (right), Status, each column `flex 1 1 0` with `minWidth: 95` and a 16 px gap; cards when the section is narrower than 428 px (4 × 95 + 3 × 16), measured with `useContainerWidth`. A draft memo has no number: its link reads "Draft".
    - customer Transactions: a credit memo's Due date cell is "—", its total has "−" in front, and a draft has an empty No. cell.
    - errors shot: the summary holds only the root refusal; Customer, the lines ("Add at least one product or service line") and the link draw their own text.
  - not in the reference: the Void status of the customer Transactions tab (the fixture's only void memo is a replaced original, which the list does not show) and the Applied status (p2-apply-credit). The More menu rows show raw key names (`$mod+p`) as the shared `DocumentMoreMenu` draws them today.
  - not checked: the fixture's totals against `documentTotals` for the memos' own lines (the from-invoice form's live totals, 2 069.70 / 42.07 / 2 111.77, do match the invoice's stored ones). The seed checkpoint checks them when it posts through the form.
  - widths: measured on `/a/books/helix-mockup` inside the Books layout, the shipping layout for `books/credit-memos/*` and `books/invoices/*`. The customer Transactions tab ships on the customer page, which has the same Books layout but its own header and tabs above the list.
- phase 4 (2026-11-16, unattended): plan `docs/plans/credit-memo-form-checkpoints.md`, 5 checkpoints, no checkpoint 0: (1) Credit memo data and posting, gates 1 · 3; (2) Reports, search, PDF, delete guards, gates 1 · 3; (3) Credit memo form and read view, gates 1 · 2 · 3, 5 e2e with the keyboard-only create and edit; (4) Credit memos from an invoice, gates 1 · 2 · 3, 4 e2e; (5) Customer page, tax report, help, gates 1 · 2 · 3, 3 e2e. E2E budget 12 of 12. plan-check `--unattended`: 0 errors. **Review mode C** (no human review; one fresh plan-review agent).
  - plan decisions that differ from the reference or add to the spec (for the human at the end):
    - the form's link row ("For invoice 1004", "Remove link") is drawn between the band's first row and the date row, not at the bottom of the band as the reference shows: spec §3.3 puts both Tab stops before Credit memo date, and Tab order is DOM order. Gate 2 judges the row's look, not its place.
    - the server's link guard lets a correction keep its original's `invoice` without the check, so a memo whose invoice was voided later can be edited (spec §3.7, Q18).
    - the linked invoice's number and status are read with `materialize()` in the record query and by the `invoiceSource` read, not `useRecord` (spec §4.5), so a failed read is part of the screen's error and Retry.
    - seed: posted memo for Harborview Hospitality Group, linked to the seeded invoice 1004, "Denver combined", 2026-11-10; draft for St. Jude. Checkpoint 1's gate 1 runs nine report and list spec files as a regression run.
    - the customer Transactions total of a credit memo: the row stores the negated total, and `transactionTotalText` puts U+2212 in front (`formatMoney` prints a hyphen).
    - the "Credit memos" section of the invoice has no loading row (absent until its read is ready).
    - `entry_routes.json` gains the route in checkpoint 1; the screen comes in checkpoint 3 (no test opens the path between them).
    - old documents (`audit-log-design.md`, `pay-bills-design.md`, `pay-bills-ledger.md`) keep the audit migration's old number 2100000022.
  - reference gaps and their built-screen evidence: Void and Applied rows of the Transactions tab → checkpoint 5 built-only shot `customer-transactions-statuses` (faked rows) + e2e with real Draft, Unapplied, Void rows + `creditMemoStatus` unit test; PDF tab content → checkpoint 3 built-only shot `pdf-posted` + `server/pdf_credit_memo_test.go` (checkpoint 2); fixture totals → `tests/credit-memo-form-fixture.test.ts` (checkpoint 1).
  - plan review findings (report `/Users/nas/tmp/tinycld/auto-helix-books/staging/p2-credit-memo/plan-review.md`; high 0, medium 4, low 19; all fixed in the plan unless noted):
    - medium, cp 2: the test "a void memo has no cash rows left" was against the shared cash code → now "rows net to zero per account".
    - medium, cp 4: no test failed without the "not a replaced original" filter of the invoice's section → the void e2e counts the rows after a correction; the rule is in the query's `where`.
    - medium, cp 5: the `creditMemoRow` test named fields `PartyTransactionRow` does not have → real fields, `transactionTotalText`, a definite tab edit.
    - medium, cp 5: `isListedTransaction` after the query's limit → the rule is in the `where`, before `.limit(n)`.
    - low, tests added: Delete draft from the form (⌘⌫); Post & new with `?customer`; `credit-memo-pdf-unsaved` and `-pdf-stale`; the form link row's "(void)" text and Enter; a copy of a linked memo drops the link; the Numbering card id; an inactive customer on the `?invoice` start.
    - low, text: the Accrual bullet's test place named; four conditional Files entries settled (three removed, `seedInvoices` change made definite, `postSeedDocument` union); `storedInvoiceOf` removed; fixture helper names explained; seed customer's name corrected; `server/credit_memos.go` added to checkpoint 4 Files; `NO_INVOICE_SOURCE` named; the section's loading decision stated.
    - low, not changed: three old documents keep the old migration number (decision above).
- review mode switches: none

## Checkpoint 1
- test writer: new `server/credit_memos_test.go`, `server/credit_memo_posting_test.go`, `tests/credit-memo-host.test.ts`, `tests/credit-memo-form-fixture.test.ts`; edited `server/forms_host_test.go` (`bindCreditMemoHost`), `server/numbering_test.go`, `server/entry_type_labels_test.go`, `server/report_transaction_detail_test.go`, `server/audit_test.go`, `server/audit_log_test.go`, `server/report_audit_log_test.go`, `tests/doc-types.test.ts`, `tests/entry-route.test.ts`, `tests/collections.test.ts`; 52 tests, red for the right reason: yes (the fixture test and the entry-route actions test are red in tsc only: generated types and the `credit_memo` doc type missing); untestable: none
- implementer: two dispatches split by layer. Part 1: migrations (new 2100000022, audit log renamed 2100000023 with its LINES row, 2100000001/2100000002 in place), collections, types, label and route tables, `books:credit_memo` host, fixture aliases. Part 2: `creditMemoKind`, `Credit` mirror posting and negated tax snapshot, balance kind, link guard, audit labels and registration, OAuth scopes, seed (`seedInvoices` returns its map, `seedCreditMemos`). DONE
- test disputes: none
- self-declared differences: (1) `invoice` left the shared Books-only field lists (`salesDocNewBooksFields`/`salesDocKeptBooksFields`) for `quoteBooksFields` through `booksFieldsOf(kind, …)`, and `checkSalesDocBooksFieldsKept` takes the kind — else the shared guard refuses every linked credit memo; (2) `CREDIT_MEMO_LAYOUT.fields.message.description` is a literal until checkpoint 3's `CREDIT_MEMO_KIND.noteHints`; `CREDIT_MEMO_LAYOUT` exported; (3) audit field labels "Credit memo date", "Unapplied credit", "Invoice" (the spec names none); audit record type options after the estimate's; (4) migration ids `pbc_books_creditmemos`, `pbc_books_creditmemo_lines`, `pbc_books_creditmemo_tax`, plain indexes as the invoice's plus `invoice`; (5) the seed memos' `memo` is the fixture's text
- gate 1: tests unedited: yes · `packages:generate`, `tinycld-pkg check` (321 files / 6203 tests), `go test ./...`: pass · regression e2e (9 files): fail, 88 passed, 1 failed → `audit-log.spec.ts:104` compared a one-shot report snapshot with a later read of the business name, and `books-settings.spec.ts` (same run, shared DB) sets that name between the two reads → a fresh test writer made it one `expect.poll` that reads both in one probe, the pattern of `balance-sheet.spec.ts:348-354` (no other spec had the one-shot shape) → `audit-log.spec.ts` + `books-settings.spec.ts`: 20 passed
- gate 2: n/a (logic checkpoint)
- gate 3 A (correctness): 0 BLOCK, 7 NOTE (NOTEs 1-4 out-of-plan files → Out-of-plan changes; NOTE 6 comments ahead of code → accepted, fix item 2; NOTEs 1, 5 and 7 → Design notes)
- gate 3 B (conformance): script lines: 0 real, 3 false positive (in-place edits of unreleased migrations 2100000001, 2100000002 and the 2100000022→2100000023 rename, all named by the Files block and spec §4.2) · findings 1-9 out-of-plan files → Out-of-plan changes, no code change; 10 shared Books-field helper change → accepted as is (declared difference 1; the estimate keeps its check, no other posting kind has an `invoice` column); 11 migration comments ahead of code → accepted, fix item 2
- shadow reviewer B (sonnet): its finding 4 (credit memo tax line range max 0 refuses the negated figure of a negative tax component; the invoice tax lines' range is −MAX..MAX and spec §4.1 says "as well") is real → fix item 1
- fix round: items 1 (cause spec-logic: tax line range −MAX..MAX; test `TestCreditMemoPost_ANegativeTaxableSumStoresPositiveSnapshotFigures` by a fresh test writer, red on the schema refusal) and 2 (cause other: comment ahead of code) fixed; gate 1 again: check, `go test ./...`, regression e2e 89 passed
- fix review: round 1: clean (shadow fix reviewer also clean) · rounds: 1
- gate 3 A notes: 3 (NOTEs 1, 5, 7), listed under Design notes
- reviewer-caught deferrals: none
- commit: see git log (`feat(books): credit memo data and posting`)
- human: none (review mode C)

## Final review
- eval:
