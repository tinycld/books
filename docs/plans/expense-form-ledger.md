# expense-form — helix run ledger

- started: 2026-11-14
- mode: unattended
- unit: p3-expense
- package branch: books/p3-expense   core checkout: tinycld main
- spec: docs/specs/expense-form-design.md
- checkpoints: docs/plans/expense-form-checkpoints.md
- reference: docs/plans/expense-form-reference/
- evidence: docs/plans/expense-form-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/expense-form-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - Amount paid is the largest figure → expressible (`DocumentHeader` big figure, `text-2xl font-semibold text-foreground tabular-nums`, label "Amount paid")
  - Balance of the paid-from account in view while choosing it → expressible (the transfer form's balance line under Paid from: `accountsWithBalances` + `transferAccountBalance`, `text-sm text-muted-foreground tabular-nums`, `text-danger` when negative)

## Deferrals
(none yet)

## Rebuttals
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
- cp 1 · reviewer A: `salesDocKind.PartyCheckedOnPost` (new shared field, only `expenseKind` sets it) — an expense draft may name an inactive vendor and Post refuses it, while the bill refuses an inactive vendor on the write that picks it. Follows the checkpoint's test bullet ("the vendor check is a Post check") and spec §3.7; a bill-like draft refusal would be a human decision.
- cp 1 · reviewer A: `TestExpense_CreateAsPostedIsRefused` gets `A draft expense is posted from the expense form.` from a Go create with status posted; a REST PATCH `{status: posted}` is the real post path and a REST create with status posted stops at the create rule first. The brief's "REST update" wording was loose; the test follows the shared path as the brief's parenthetical allows.
- cp 1 · reviewer A: `server/purchase_lines.go` comment on `purchaseAccountTypes` still names the client `BILL_ACCOUNT_TYPES`; checkpoint 2 renames it to `PURCHASE_ACCOUNT_TYPES` and must update the comment.
- cp 1 · reviewer A: interim state until checkpoints 3–4 — seeded expense entries open as `books/entries/<id>` (`lib/entry-route.ts` gains `expense` in cp 4); the vendor, product and account delete guards and the `fts_books_expenses` search source are cp 4. One PR, so not deferrals.
- cp 1 · reviewer A: `expenseBeforePost` and `expensePaidFrom` both run `checkExpensePaidFrom(tx, doc, true)` in one post (Paid from read twice), as Do step 4 asks.
- cp 1 · reviewer A: `TestExpensePost_CreatesNoAccount` makes 3900 Retained earnings first (dispute resolution); a book with no retained-earnings account is covered by the shared ledger rule, not by this test.

## Out-of-plan changes
- cp 1 · `server/report_general_ledger_test.go`: the General Ledger golden spec gains the `expense` branch of the Type case, a required follow-on of `entryDocTypeOptions` += `expense` (a Files-block change). Lines added, none removed (reviewers A and B).
- cp 1 · `tinycld/books/types.ts`: re-exports the generated `BooksExpenses` / `BooksExpenseLines`, which the fixture (Do step 6) and `tests/expense-form-fixture.test.ts` import from `../types` (reviewers A and B).

## Phase notes
- phase 1 / design gate (human, 2026-11-14): Direction A picked (the bill's form with a payment header band). Open questions 1–19 accepted as the packet recommended. Platform items: the standing 2026-11-11 approval holds (shortcuts web + iOS hardware keyboard; autofocus and type-to-open pickers web only).
- design gate corrections (driver): (a) migrations 2100000014, 15 and 16 are taken on books main (estimate_public, party_balances, party_contacts); the expense migration is `2100000017_create_books_expenses.js`, or the next free number at build. (b) unit p5-drill-down (another lane, not merged) adds `entryOpenPath()` and `books/server/entry_routes.json`; whichever of p3-expense / p5-drill-down merges second adds the `expense` row there (spec §3.11, merge-time item).
- phase 3 (2026-11-14, unattended): Direction A built as a static scratch route (`/a/books/helix-mockup?state=`) from real Books and core parts (FieldCell band, SearchPicker, HostSelect, DayField, LineDescriptionCell/LineQuantityCell, TableField grid and card classes over the real `BILL_ACCOUNT_COLUMNS` / `PURCHASE_ITEM_COLUMNS`, DocumentHeader, DocumentTotalsPanel with `tableSubtotals` and `lastTotal: null`, DocumentActionBar, PurchaseReadLines, DocumentReadActions, DeleteDraftDialog, ConflictNotice, SectionCard) under a mock `DocumentKind` (`{...BILL_DOCUMENT, doc: {...BILL_KIND, testId:'expense', noun:'Expense', figure:{label:'Amount paid'}, lastTotal:null, customerRequired:false, bandSplitAt:'payment_method'}}`). Fixture `tinycld/books/lib/expense-form-fixture.ts` (draft no-vendor cash; posted 1002 check 1042 with a credit line; posted 1003 credit card with both tables; void 1001; paid-from balances incl. overdrawn 1010; refusal texts; load-time checks). Manifest `docs/plans/expense-form-capture.json`, 24 shots (new, new-card, new-accounts, new-products, draft, correction, errors, no-lines, no-pay-accounts, conflict, phone-more, delete, posted, posted-card, void, replaced, reader, settings, settings-readonly, loading, error, not-found, no-access, cannot-edit), 66 PNGs in `docs/plans/expense-form-reference/`. Sparks: both kept (Amount paid big figure; Paid from balance line, `text-danger` when negative). None dropped. Notes for phase 4: (1) fixture row types are local (`ExpenseRecord`, `ExpenseLineRecord`); replace with generated `BooksExpenses` / `BooksExpenseLines` + `satisfies` once migration 2100000017 exists; (2) DocumentActionBar orders Cancel, Save draft, Post, Post & new — spec §3.6 lists Post & new before Post; the reference follows the shared bar; (3) read band puts Payment ("Check · 1042", `paymentText`) in a second row under a border like the sales receipt, not as a fourth column as artboard A3 drew it; (4) the back link reads "Journal entries" (EntryBackLink default) as on the bill; (5) a correction shows the Draft pill, as the bill's; (6) the Paid from inactive refusal is not shown in any shot (the errors shot uses Ref no. duplicate check, an inactive line account and the close date); no-pay-accounts shows the empty-list note.
- phase 4 (2026-11-14, unattended): (a) spec §3.6 aligned to the shared `DocumentActionBar` and the bill (wide: Cancel, Save draft, Post, Post & new, More); driver note, Q8 "the bill's lifecycle". (b) Migration 2100000017 confirmed the next free number (books main and every remote branch end at 16). (c) Plan: 4 checkpoints — 1 data/Go (migration, Go expense kind, Go purchase renames into `server/purchase_lines.go`, the `books:expense` host, audit + OAuth, seed), 2 client purchase layer (renames, optional vendor, `partyAddress`, `partyFills`, `RequiredPaymentMethodField`; no expense screen), 3 expense form + read view (6 e2e, one phone run), 4 across Books + Purchase lines words + help (4 e2e). E2E Paid from: 1000/2100 asserted by format only; the exact balance check uses a card account the test creates. Playwright gets two projects (`purchase-lines-setting` first, then `books`) so the shared Purchase lines setting never changes beside a form test. Spec §4 cites "lesson 34" for the setting restore; the plan uses it. (d) Plan review (fresh agent, report in staging/p3-expense/plan-review.md), all fixed: host and audit/OAuth moved to CP1 (Go guards bind the host; coverage tests fail once the collections exist); CP3 Files gain `lib/document-messages.ts` (vendor/paid_from/date/method/ref routing, totals texts) and `lib/document-schema.ts` (Ref no. rule keyed on messages); copy gets `activePaidFromIds` in the expense `DocumentStart`; `bill_batch_test.go` added; `PAID_FROM_TYPES` / `defaultMethodFor` in logger-free `lib/paid-from-method.ts` (seed graph); CP2 address clause corrected (address lives in the `mailing_address` / `bill_to` built-ins); `productReferences` uses `productOnExpensesMessage`; `checkAccountDelete` runs document references before the journal-lines count so a posted expense's Paid from gets the spec text; `NO_VENDOR_TEXT` and `EXPENSE_REF_HINT` in `lib/document-texts.ts`; conflict client text from `lib/revision.ts` ("Load the current expense, then …"), server text per spec; tests added for Enter in Rate, Tab order through the add buttons and Memo → bar, ⇧? group, bar order, read Payment date and no address, empty trailing line kept on refusal, date / method / product-line routing, subtotal absent, offline bar, over-limit schema, stays-shown table, settings note; revision conflict e2e placed in CP4 (needs search to reopen the draft in a second session); phone and edit drafts now pick an account. Accepted without e2e (recorded in the plan budget): Paid from empty-chart error, read-only Purchase lines row, inactive stored vendor on a correction.
- review mode switches: none

## Checkpoint 1
- test writer: server/expenses_test.go, server/expense_posting_test.go, server/purchase_lines_test.go (new); server/audit_test.go, server/oauth_scopes_test.go, tests/doc-types.test.ts (added cases); tests/expense-host.test.ts, tests/expense-form-fixture.test.ts (new); red for the right reason: yes (Go build fails on the missing produced names; host/doc-types on missing entries; fixture red is tsc on the missing generated types); untestable: none. The "existing specs the seed breaks" bullet is Do step 9 (implementer).
- implementer: two dispatches split by layer. Part 1 (migrations, Go kind and guards, purchase renames, host, audit/OAuth, labels, fixture types): DONE. Part 2 (seedExpenses, step 9 greps): DONE — every grep hit checked; no e2e spec breaks (the October seeded posts move no figure a spec pins), so no spec file changed.
- test disputes: TestExpensePost_CreatesNoAccount failed because the shared ledger rule makes 3900 Retained earnings on a book's first P&L post. Settled against the test: the spec line "Posting creates no account." is the expense's own path (checkpoint bullet "posting creates no account (the account count is the same before and after)", in contrast with the bill's Accounts payable). A fresh test writer added `mkRetainedEarnings(t, ee.app, "3900")` before the count; the assertion is unchanged.
- self-declared differences: part 1 — 14 (cp1-impl.md): `refuseDocumentDay` for the date; `reference_no` stored trimmed; `BeforePost` set in `init()` (Go init cycle); hosts.ts `PURCHASE_LINE_BUILTINS` shared by bill and expense hosts (bill output unchanged); expense host columns include `revision`; `AddressField != ""` guard (one reader); `refuseField` for the type text (no `%s`), empty paid_from left to the schema refusal; index on (paid_from, payment_method, reference_no); LineTables literals (fixed in the fix round); fixture types alias the generated ones; purchase_lines.go comment names BILL_ACCOUNT_TYPES until cp 2; new `salesDocKind.PartyCheckedOnPost` (expense only); the two out-of-plan files. Part 2 — 2: seed sends no fixture ids (server-assigned, as seedBills); step 9 changed no spec.
- gate 1: tests unedited: yes · `packages:generate`, `tinycld-pkg check` (274 files / 5351 tests), `go test ./...`, `bill-form.spec.ts` (14 passed) → pass. Step 9 changed no spec file, so no other spec ran; the e2e seed ran clean with the seeded expenses.
- gate 2: n/a (logic checkpoint)
- gate 3 A (correctness): 0 BLOCK, 8 NOTE (2 out-of-plan files → Out-of-plan changes; 6 → Design notes)
- gate 3 B (conformance): script lines: 0 real, 2 false positive (in-place edits of migrations 2100000001 / 2100000002: Books unreleased, brief orders it) · findings: (1) out-of-plan report_general_ledger_test.go — accepted, recorded; (2) out-of-plan types.ts — accepted, recorded; (3) expenseKind LineTables literals duplicate the bill's key constants — accepted+fixed: `purchaseAccountLinesKey` / `purchaseItemLinesKey` in server/purchase_lines.go, used by both kinds (added to the Go rename list); (4) dead `_ = checkPurchaseAccountLine` in purchase_lines_test.go — accepted+fixed by a test writer.
- fix review: round 1: clean. Gate 1 rerun after fixes: check, go test, bill-form.spec.ts (14 passed) green.
- gate 3 A notes: 6, listed under Design notes
- reviewer-caught deferrals: none
- commit: (this commit)
- human: n/a (review mode C)

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
