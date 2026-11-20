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
(none yet — gate-2 NOTEs the loop did not act on, as
`cp N · <shot>: <where> — <what>`; shown to the human at each checkpoint
and again at the end)

## Out-of-plan changes
(none yet — every file touched that no checkpoint's Files block named, with why)

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

## Final review
- eval: (not run yet)
- human comments and what changed
- native: not executed in this run
