# apply-credit — helix run ledger

- mode: unattended
- unit: p2-apply-credit
- started: 2026-11-19
- package branch: books/p2-apply-credit (at main bec05d82 when the ledger was made)   core checkout: main (4690f72e)
- spec: docs/specs/apply-credit-design.md
- checkpoints: docs/plans/apply-credit-checkpoints.md
- reference: docs/plans/apply-credit-reference/
- evidence: docs/plans/apply-credit-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/apply-credit-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - The amount that the action moves is the figure the eye finds first → expressible (the write-off dialog's figure: label `text-xs text-muted-foreground`, value `text-2xl font-semibold text-foreground tabular-nums`; "Unapplied credit" / "Open balance" at the top of the apply dialog; the vendor credit's dialog takes it too)
  - The running totals stand right under the amount column → dropped (the shared dialog's one summary line under the list says it; a second style would make the two apply dialogs differ)

## Deferrals
(none yet)

## Rebuttals
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
- cp 1 · reviewer A NOTE 5: no rule stops an apply date before the invoice's date; spec §3.4 / Q13 names none, and the vendor credit kind has none either. Human decides whether to add one.
- cp 1 · fix review NOTE 1: `tests/e2e/audit-log.spec.ts:185` asserts every row of the "Deleted" filter reads "Deleted"; a removed credit memo application matches that filter and reads "Credit removed" (`server/report_audit_log.go:76`). No checkpoint-1 path deletes an application, so it passes today; once checkpoint 3's Remove e2e runs before it in one database, it fails by spec order. Checkpoint 3 must fix that assertion (accept "Credit removed", or check only its own record type's rows).
- cp 1 · fix review NOTE 2: `server/document_balance.go` `saveApplied` writes `doc.Set("applied", …)` by name, not `kind.AppliedField`; correct today (only the credit memo kind reaches it).

## Out-of-plan changes
- cp 1 · `server/sales_document_posting.go`: fix-r1 item 6 — callers of `clearDocumentBalance` pass the kind, so only the kind's stored applied field is cleared.
- cp 1 · `server/report_audit_log.go`: fix-r1 item 7 — the Audit Log report's Event column reads `event_shown` (spec §3.8 "Credit applied" / "Credit removed").
- cp 1 · `tinycld/books/lib/audit-log-fixture.ts`: fix-r1 item 7 — the view's new `event_shown` column is in the generated row type (`satisfies AuditLogRow` failed tsc), and the fixture's Event column mirrors the Go column.

## Phase notes
- phase 1: no corrections to the extractions at the design gate (human, 2026-11-19). No "needs extension" spark; no core PR.
- phase 2: the human accepted every recommended answer of the packet's Q1–Q17, with two updates and two new answers:
  - Q2 credit memos only (a payment amount that is not applied is named with a link); Q3 an application is a record, no + New entry, page or tab; Q4 no invoice row-menu item; Q5 no journal entry; Q6 Remove deletes, no edit; Q7 stored `applied` on `books_credit_memos`, status and chip "Applied"; Q8 the invoice reads Paid / Partly paid; Q9 the same customer only; Q10 no transaction kind on the customer page; Q11 cash basis as the vendor credit's; Q12 a notice with links on Receive payment; Q13 the apply date rules; Q14 the void and correction rules; Q17 the seed.
  - Q15 (updated): the migration number is the next free number when the plan is written (p5-ar-aging's PR #77 takes 2100000028 for `books_receivable_items`; p4-match also plans a migration); the audit-log view stays the last migration. The spec names no number.
  - Q16 (updated): the unit builds on p5-ar-aging (books PR #77, `origin/books/p5-ar-aging`). Every write of an application (create, Remove, a correction that moves applications) refreshes `books_receivable_items` in the same transaction and its Go tests call `requireNoDrift`; the aging counts an application against its invoice's item and the credit memo's unapplied rest as a credit.
  - Q18 (new): p4-match merges first (shares `collections.ts`, `types.ts`, `seed.ts`, `register.go`, `audit.go`, `registrations_test.go`).
  - Q19 (new): p5-ar-aging merges first (shares `register.go`, `registrations_test.go`, `seed.ts`, `help/reports.md`).
  - Spec self-review after the answers (2026-11-19), fixed in the spec, no decision changed:
    - Q16 contract, read from `origin/books/p5-ar-aging` (`server/receivable_refresh.go`, `server/receivable_items.go`, `server/write_offs.go`, `server/env_test.go`): `refreshReceivableEntry` stores only the Accounts receivable lines of one entry, and an application has no entry. The spec (§4.3) therefore names a third row query (`receivableCreditApplicationsSQL`: two rows for each application, a credit on the invoice's item and a debit on the credit memo's item, both at the apply date), `refreshReceivableCreditMemo` (the shape of `refreshReceivablePayment`), a new part in `refreshReceivableInvoice`, and `verifyReceivables` / `rebuildReceivables` over the three queries. Two rows at the apply date, and not a lower credit on the memo's line, because the aging spec requires that the totals equal the Balance Sheet on every As of day.
    - A credit memo refund keeps the item p5-ar-aging gives it; the spec makes no claim about it.
    - §3.3: the Apply date default from an invoice is set once, at open, from the rows the dialog ticks (it was open to two readings).
    - §3.8 gained the A/R Aging bullet; §8's "No A/R aging" non-goal became "no change to the report's columns, levels, parameters"; §4.7 Build order is new; §9 became the decisions list.
- phase 3: direction A (a dialog on each document) picked by the human, 2026-11-19. B (one page, two lists) and C (one page, invoices only) not built. Sparks: one carried, one dropped (above). Reference corrections: see pass 2.
- phase 3 pass 2 (2026-11-19, unattended, no human approval asked): fixture `tinycld/books/lib/apply-credit-fixture.ts`, scratch route `tinycld/books/screens/helix-mockup.tsx` (30 states, `?state=`), manifest `docs/plans/apply-credit-capture.json`, reference `docs/plans/apply-credit-reference/` (80 PNGs: 30 shots at 390 and 1280, light; 10 of them also dark). Typecheck clean, biome clean. Sparks: the figure is carried (in the route); none dropped in this pass.
  - Reference corrections:
    - The apply dialog's invoice grid: with `CREDIT_APPLY_COLUMNS` (95 px least width for each column) the xl dialog (598 px of content) cut "Oct 14, 2026 · Overdue" before the mark. The reference gives Due date a least width of 154 px and Credit to apply 114 px (Invoice and Open balance stay at 95 px, each column `flex: 1`). The invoice label "Invoice 1009 · Sep 14, 2026" ellipsizes in its date (spec §3.2: long text ellipsizes). This differs from spec §4.4 ("reuses `CREDIT_APPLY_COLUMNS`"): the plan adds a column set of its own for `MEMO_INVOICES_OUTSTANDING` and computes its `gridMinWidth` from it (566 px, below 598 px, so the dialog keeps the grid). The credit memos grid under an invoice keeps `CREDIT_APPLY_COLUMNS`.
    - Read-view shots with a block (`memo-partly`, `memo-refunded`, `invoice-credited`, `invoice-mixed`) are captured 1100 px high, so the phone shot shows the block under the totals.
  - Drawn by hand in the route, because the shared part has vendor words or lacks the case; the plan makes each one real:
    - The descriptors: `MEMO_INVOICES_OUTSTANDING` (noun Invoice, opens an invoice) and `INVOICE_CREDITS_OUTSTANDING` (noun "Credit memo", "Credit date", "Unapplied credit", no overdue mark). `OutstandingDocument['noun']` has no 'Credit memo' (the route casts it).
    - `ApplyCreditDialog`: the figure at the top (label and value as the write-off dialog's, with the `HelpIcon`), the payments line with a link under the summary (from an invoice), the two empty states (from a credit memo: text + New invoice + Refund credit; from an invoice: text alone), titles "Apply credit memo 1001" / "Apply credit to invoice 1009".
    - `DocumentApplications` / `ApplicationRow`: targets `invoice` and `credit_memo` ("Invoice 1009 · Nov 16, 2026 · $150.00", "Credit memo 1001 · …") with Remove; on a phone Remove wraps under the link.
    - `DocumentPayments` on the invoice: payments and credit rows in one list by date; a credit row has Remove.
    - `RemoveApplicationDialog`: its body says "Bill"; the text must take the document's noun.
    - `ApplyCreditNotice` (credit memo: "<customer> has N open invoices. Apply this credit to lower what they owe." + Apply to invoices; invoice: "<customer> has $X of unapplied credit on N credit memos." + Apply credit, with the payments line in the same box) and `PayBillsCreditsNotice` (Receive payment: "Credit memo 1001 · $100.00 unapplied" links).
    - Totals rows: credit memo `credit-memo-total-applied`, `credit-memo-total-refunded`, `credit-memo-total-unapplied`; invoice `invoice-total-credits-applied` (between Payments and Written off).
    - The read bar: `phoneButtonOf` keeps every `apply_credit` action in the phone bar; the invoice's Apply credit must go to More on a phone (spec §3.1), so the rule depends on the kind. The label of `apply_credit` depends on the kind too ("Apply to invoices" / "Apply credit"; today 'Apply to bills').
    - `HelpIcon` topic: the route uses `books:credit-memos`; the build uses the feature's own topic.
  - Seen in the reference, for the plan and the critic: at 1280 with the nine actions of an open invoice, the read bar wraps to two rows (the shared bar's `flex-wrap`).
  - Not in the reference (unchanged parts or parts that need the new records): the lines tables of both read views, the Sales lists chip and status, the customer page rows, the A/R Aging rows.
  - Local types the migration checkpoint replaces: `CreditMemoApplicationRecord` → `BooksCreditMemoApplications`; `ApplyCreditMemoRecord` (`BooksCreditMemos & { applied }`) → `BooksCreditMemos`.
  - Capture logs: staging `ref-capture-1.log` … `ref-capture-4.log` (4 runs, each 43 passed, about 3 minutes).
- phase 4: plan written, `docs/plans/apply-credit-checkpoints.md`, 5 checkpoints (`**Sizing:**` line gives the reason for two data checkpoints). `plan-check.mjs --unattended`: 0 errors.
  - Checkpoints: 1 Application data, guards and seed (logic) · 2 Receivable rows and aging (logic) · 3 Apply from a credit memo (renders) · 4 Apply credit on an invoice (renders) · 5 Lists, Receive payment and help (renders). E2E budget: 12 tests (5 + 4 + 3).
  - Migration: the new collection is 2100000029, the audit-log view is renamed to 2100000030. p4-match is still open; if it merges first it renumbers on its side, or the driver renumbers these two files at the merge.
  - Plan decisions the checkpoints rely on (plan notes 1–16): one shared kind (`CreditApplicationKind`, `from`); `ReadFrame` gains `section`; the phone bar rule by kind (`phonePrimaryAction`); `MEMO_APPLY_COLUMNS` differs from the spec's 95 px (the reference correction); audit words by `eventWords(event, collection)`; the memo-side receivable row id is `UPPER(<application id>)`; the seed pick (Fox Hollow Vineyards, 2026-09-14 / 2026-11-12 / 2026-11-16) is checked against the tree.
  - Plan review (report: staging `plan-review.md`; the first run stopped on an API limit with no report, the second run finished): 1 BLOCKER, 20 SHOULD, 17 NIT. Fixed in the plan: the BLOCKER (files that `books_credit_memos.applied` breaks: `forms/hosts.ts`, `tests/credit-memo-host.test.ts`, the two fixtures, `omitOnInsert`); the inverted `applied` formula; the audit words (mechanism, `lib/audit-log.ts`, tests); the seed check done in the plan; `goField` / `tsField` in the shared case table; the applications refresh bound after the serialized guard; the `creditMemoStatus` row sources; tests for the notices, the list order, the sub-customer refusal, the load error with Retry and the refused Remove (checkpoint 3 test 5), the payments line text, the date set once, the reader state; the core files cited (plan note 16); the open choices decided.
  - Plan review findings not taken: an all-digit application id (plan note 13: the write fails, no wrong figure); a count of the create requests for the atomic batch (the hook's one `atomic` batch is read at gate 3); a key for Remove (a confirm dialog, tested by click); the re-run of an open A/R Aging report after Apply (Go test of the refresh only); the Receive payment notice's load error and the invoice blocks' load errors have no e2e test (gate 2 and gate 3). The reviewer did not check every e2e step against the controls of its checkpoint (spot checks only).
- review mode switches: none

## Checkpoint 1
- test writer: server/credit_applications_test.go, server/credit_memo_applications_test.go, server/credit_memo_application_cash_basis_test.go, server/testdata/credit_application_cases.json, tests/apply-credit-fixture.test.ts (new); server/audit_test.go, credit_memos_test.go, document_balance_test.go, registrations_test.go, oauth_scopes_test.go, audit_log_test.go, report_audit_log_test.go, testdata/audit_log_spec.json, tests/collections.test.ts, audit-fields.test.ts, audit-record-route.test.ts, migration-prefixes.test.ts, seed-node.test.ts, credit-memo-host.test.ts (edited); red for the right reason: yes (Go: compile failure at the new symbols; TS: 16 vitest failures and tsc errors at the new types and `eventWords` arity; 3 tests pin existing behavior and stay green on purpose); untestable: none. The fixture text check also reads `server/credit_applications.go`.
- implementer: two dispatches by layer. Part 1 (migrations, server/): the new collection 2100000029, audit view renamed to 2100000030, `applied` on credit memos, shared `applicationKind` guards in `server/credit_applications.go`, the memo kind, the two payers, verify/rebuild of `applied`, void and correction rules, audit and OAuth registrations; DONE. Part 2 (TS client, fixtures, seed): collection, types, audit fields/words/route, `applied` reads, `seedApplyCredit`; DONE.
- test disputes:
  - `TestCreditMemo_ServerFieldsRefused` update subtests wanted 400 for a PATCH of `applied`. Settled for the implementer by the brief: "the create and update rules list it among the fields a client may not set, as they list `balance`" — a rule refusal, which PocketBase answers with 404 (core `third_party/pocketbase/apis/record_crud.go:471-473`; `server/config_rules_test.go:64-78` asserts 404). A fresh test writer changed the want to 404; the stored-value check stays.
  - `TestCreditMemoApplicationCashBasis_BothDocumentsBringBackTheirShare` tax-row figures (10370 / -1975). Settled for the implementer by the brief: "by the share rule of the other payers (amount ÷ total, cumulative, largest remainder)" — that rule is `paymentTaxShares` (`server/cash_basis_tax.go:123-159`, per figure, pinned by `cash_basis_tax_test.go:246-255`), giving 10369 / -1976. A fresh test writer recomputed the figures from the rule.
- self-declared differences: part 1 — `refuseInvoiceVoidCredited` in `server/invoices.go`; `msgApplicationNotChanged` moved to `credit_applications.go` (`msgApplyBeforeCreditDate` stays in the vendor file, which a TS test reads); `checkBillOpenFor` became `checkDocumentOpenFor(kind, …)`; new helpers `invoicePaidAndCredited`, `memoApplicationPayer`, `refuseMemoDatedAfterApplication`; `clearDocumentBalance` also zeroes `applied`; collection id `pbc_books_memo_apps`; the apply-date check of a memo correction comes before the refund-date check; invoice ids read before `movePostedLines`. Part 2 — `books_credit_memos.applied` has an audit field `money('Applied')` (the audit-fields test needs every schema field); `lineEventTitle` passes `record_type` to `eventWords`; `audit-record-route.ts` uses one `PARENT_DOCUMENTS` table for attachments and applications; the seed creates the memo with its fixture id and adds `untaxedSeedLine`, which `seedWriteOffs` now uses (same writes).
- gate 1: tests unedited: yes · `tinycld-pkg check` pass, `go test ./...` pass · e2e of the Gates line: handed to the driver (NEEDS-RUN), run by the driver at the tree: 91 passed, exit 0 (staging `cp1-gate1-e2e.log`; it also proves `seedApplyCredit` on a fresh server) · pass.
- gate 2: n/a (logic checkpoint)
- gate 3 A (correctness): 0 BLOCK, 5 NOTE, 2 DEFERRAL (cp1-review-A.md). DEFERRAL 1 (`requireNoDrift` missing in `TestCreditApplication_CreateRunsEveryCase` and `TestAudit_LabelsACreditMemoApplication`) accepted, fix-r1 items 1–2 (tests). DEFERRAL 2 (fixture-text test skips `removeRefused`) accepted, items 3 (test) and 5 (fixture text now the server's `msgClosedThrough`; `APPLY_CREDIT_CLOSE_DATE` 2026-09-30 → 2026-11-30). NOTE 1 (spec §3.8: the Audit Log report must read "Credit applied" / "Credit removed") is a spec breach → accepted, item 7. NOTE 2 → item 5. NOTE 3 (`goSource` catch) accepted, item 4. NOTE 4 → item 6. NOTE 5 (no "apply date not before the invoice date" rule) → Design notes.
- gate 3 B (conformance): script lines: 0 real, 2 false positive (unreleased migrations, brief orders the edits) · findings 1–2 = A DEFERRAL 1 (items 1–2); finding 3 = A NOTE 4 (item 6, `AppliedField` on `balanceKind`).
- test disputes (fix round 1): item 7 — fix implementer: existing tests pin the view columns, source fields and Event formula. Settled by the runner: design `event_shown` view column + source field + Event column formula, filter on `event`; a fresh test writer updated the pins (cp1-fix-tests-2.md), each still an exact list.
- reviewer-caught deferrals: requireNoDrift (plan note 2) and the `removeRefused` text check — not self-declared by the implementer or the test writer.
- fix round 1: 7 items (cp1-fix-r1.md). Tests of items 1–4 and 7 by fresh test writers (cp1-fix-tests.md, cp1-fix-tests-2.md), red first; source of items 5, 6 (cp1-fix-impl.md) and 7 (cp1-fix-impl-2.md: view column `event_shown` in 2100000030, `auditShownEvents()`, source field `event_shown`, Event column `fld("event_shown")`, filter on `event` unchanged; client `AUDIT_SHOWN_EVENT_OPTIONS`) — FIXED. Declared differences: source field label "Event shown" (unpinned); the client mirror and fixture change.
- gate 1 after fix round 1: tests unedited: yes · packages:generate, `tinycld-pkg check` exit 0 (8123 tests), `go test ./...` ok (runner) · e2e of the Gates line (rerun because the audit view migration, the audit report and the fixture close date changed): handed to the driver (NEEDS-RUN), run by the driver at the tree: 91 passed, exit 0 (staging `cp1-gate1-e2e-2.log`) · pass.
- fix review: round 1 (cp1-fix-review.md): items 1–7 FIXED; conformance: 1 false positive (2100000030, unreleased); 0 BLOCK; 2 NOTE → Design notes. Rounds: 1.
- gate 3 A notes: 1 (NOTE 5) under Design notes.
- human: n/a (mode C)
- commit: see the commit that adds this line (`feat(books): apply-credit data, guards and seed`)

## Final review
- eval: (not run yet)
- human comments and what changed
- native: not executed in this run
