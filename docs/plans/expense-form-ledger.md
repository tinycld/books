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
(none yet — gate-2 NOTEs the loop did not act on, as
`cp N · <shot>: <where> — <what>`; shown to the human at each checkpoint
and again at the end)

## Out-of-plan changes
(none yet — every file touched that no checkpoint's Files block named, with why)

## Phase notes
- phase 1 / design gate (human, 2026-11-14): Direction A picked (the bill's form with a payment header band). Open questions 1–19 accepted as the packet recommended. Platform items: the standing 2026-11-11 approval holds (shortcuts web + iOS hardware keyboard; autofocus and type-to-open pickers web only).
- design gate corrections (driver): (a) migrations 2100000014, 15 and 16 are taken on books main (estimate_public, party_balances, party_contacts); the expense migration is `2100000017_create_books_expenses.js`, or the next free number at build. (b) unit p5-drill-down (another lane, not merged) adds `entryOpenPath()` and `books/server/entry_routes.json`; whichever of p3-expense / p5-drill-down merges second adds the `expense` row there (spec §3.11, merge-time item).
- phase 3 (2026-11-14, unattended): Direction A built as a static scratch route (`/a/books/helix-mockup?state=`) from real Books and core parts (FieldCell band, SearchPicker, HostSelect, DayField, LineDescriptionCell/LineQuantityCell, TableField grid and card classes over the real `BILL_ACCOUNT_COLUMNS` / `PURCHASE_ITEM_COLUMNS`, DocumentHeader, DocumentTotalsPanel with `tableSubtotals` and `lastTotal: null`, DocumentActionBar, PurchaseReadLines, DocumentReadActions, DeleteDraftDialog, ConflictNotice, SectionCard) under a mock `DocumentKind` (`{...BILL_DOCUMENT, doc: {...BILL_KIND, testId:'expense', noun:'Expense', figure:{label:'Amount paid'}, lastTotal:null, customerRequired:false, bandSplitAt:'payment_method'}}`). Fixture `tinycld/books/lib/expense-form-fixture.ts` (draft no-vendor cash; posted 1002 check 1042 with a credit line; posted 1003 credit card with both tables; void 1001; paid-from balances incl. overdrawn 1010; refusal texts; load-time checks). Manifest `docs/plans/expense-form-capture.json`, 24 shots (new, new-card, new-accounts, new-products, draft, correction, errors, no-lines, no-pay-accounts, conflict, phone-more, delete, posted, posted-card, void, replaced, reader, settings, settings-readonly, loading, error, not-found, no-access, cannot-edit), 66 PNGs in `docs/plans/expense-form-reference/`. Sparks: both kept (Amount paid big figure; Paid from balance line, `text-danger` when negative). None dropped. Notes for phase 4: (1) fixture row types are local (`ExpenseRecord`, `ExpenseLineRecord`); replace with generated `BooksExpenses` / `BooksExpenseLines` + `satisfies` once migration 2100000017 exists; (2) DocumentActionBar orders Cancel, Save draft, Post, Post & new — spec §3.6 lists Post & new before Post; the reference follows the shared bar; (3) read band puts Payment ("Check · 1042", `paymentText`) in a second row under a border like the sales receipt, not as a fourth column as artboard A3 drew it; (4) the back link reads "Journal entries" (EntryBackLink default) as on the bill; (5) a correction shows the Draft pill, as the bill's; (6) the Paid from inactive refusal is not shown in any shot (the errors shot uses Ref no. duplicate check, an inactive line account and the close date); no-pay-accounts shows the empty-list note.
- phase 4 (2026-11-14, unattended): (a) spec §3.6 aligned to the shared `DocumentActionBar` and the bill (wide: Cancel, Save draft, Post, Post & new, More); driver note, Q8 "the bill's lifecycle". (b) Migration 2100000017 confirmed the next free number (books main and every remote branch end at 16). (c) Plan: 4 checkpoints — 1 data/Go (migration, Go expense kind, Go purchase renames into `server/purchase_lines.go`, the `books:expense` host, audit + OAuth, seed), 2 client purchase layer (renames, optional vendor, `partyAddress`, `partyFills`, `RequiredPaymentMethodField`; no expense screen), 3 expense form + read view (6 e2e, one phone run), 4 across Books + Purchase lines words + help (4 e2e). E2E Paid from: 1000/2100 asserted by format only; the exact balance check uses a card account the test creates. Playwright gets two projects (`purchase-lines-setting` first, then `books`) so the shared Purchase lines setting never changes beside a form test. Spec §4 cites "lesson 34" for the setting restore; the plan uses it. (d) Plan review (fresh agent, report in staging/p3-expense/plan-review.md), all fixed: host and audit/OAuth moved to CP1 (Go guards bind the host; coverage tests fail once the collections exist); CP3 Files gain `lib/document-messages.ts` (vendor/paid_from/date/method/ref routing, totals texts) and `lib/document-schema.ts` (Ref no. rule keyed on messages); copy gets `activePaidFromIds` in the expense `DocumentStart`; `bill_batch_test.go` added; `PAID_FROM_TYPES` / `defaultMethodFor` in logger-free `lib/paid-from-method.ts` (seed graph); CP2 address clause corrected (address lives in the `mailing_address` / `bill_to` built-ins); `productReferences` uses `productOnExpensesMessage`; `checkAccountDelete` runs document references before the journal-lines count so a posted expense's Paid from gets the spec text; `NO_VENDOR_TEXT` and `EXPENSE_REF_HINT` in `lib/document-texts.ts`; conflict client text from `lib/revision.ts` ("Load the current expense, then …"), server text per spec; tests added for Enter in Rate, Tab order through the add buttons and Memo → bar, ⇧? group, bar order, read Payment date and no address, empty trailing line kept on refusal, date / method / product-line routing, subtotal absent, offline bar, over-limit schema, stays-shown table, settings note; revision conflict e2e placed in CP4 (needs search to reopen the draft in a second session); phone and edit drafts now pick an account. Accepted without e2e (recorded in the plan budget): Paid from empty-chart error, read-only Purchase lines row, inactive stored vendor on a correction.
- review mode switches: none

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
