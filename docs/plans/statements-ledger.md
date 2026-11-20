# statements — helix run ledger

- mode: unattended
- unit: p2-statements
- started: 2026-11-20
- package branch: books/p2-statements (from books main@328bf8bb)   core checkout: main@3981e9b4
- spec: docs/specs/statements-design.md
- checkpoints: docs/plans/statements-checkpoints.md
- reference: docs/plans/statements-reference/
- evidence: docs/plans/statements-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/statements-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - The amount that the run bills is the largest thing on the screen, and it follows the ticks → expressible (the big-amount pattern of the Books bands `PayBillsBand` / `PaymentBand`: a muted caption over a large semibold figure in semantic tokens; right-aligned on wide, first on a phone)
  - Each recipient is one calm line whose address can be corrected in place → expressible (flex columns with minimums and shared style constants as `PayBillsOpenBills`, Books `SelectBox`, core `TextInput`; cards below the table's own minimum width)

## Deferrals
(none yet)

## Rebuttals
- **finding:** reviewer B, cp 1, #3: "`help/settings.md:41` — help body is now wrong for a drawn card. … Spec line 154 requires that `help/settings.md` name the Statements card and say that a statement takes its number when it is saved. Fix: add the Statements card to that sentence now, or confirm that checkpoint 5's Files block names `help/settings.md`."
  **rebutted because:** checkpoint 5's Files block names it: "Modify (help and glossary): `help/customer-pages.md`, `help/customers.md`, `help/reports.md` (append), `help/settings.md`, …", and its Spec line: "`help/settings.md` (Numbering) names the Statements card and says that a statement takes its number when it is saved." (`docs/plans/statements-checkpoints.md:369`, `:396`).
- **finding:** reviewer B, cp 1, #4: "`help/reports.md` — user-facing change with no help. The Reports hub now lists "Statement: Balance Forward" and "Statement: Open Items", and the topic does not name either one. … Fix: append a short section … or confirm that checkpoint 5 owns it."
  **rebutted because:** checkpoint 5 owns it: "`help/reports.md` names the two statement reports" and Do step 8 "append to `help/reports.md` and `tests/help-reports.test.ts` only (plan note 4)" (`docs/plans/statements-checkpoints.md:396`, `:418`).
- **finding:** reviewer B, cp 1, DEFERRAL 2: "`seedStatements(pb)` (Do step 9) became `seedStatements(pb, customerIds)`. … This is not a loss of function, only a different signature."
  **rebutted because:** nothing agreed is missing; the seed creates both `STATEMENT_SEED` rows (`tests/seed-node.test.ts` pins it). The signature was settled at the test-writer step (ledger, Checkpoint 1: "customers get server ids; Do step 9's `seedStatements(pb)` cannot map the fixture id — accepted").

## Design notes
- cp 1 · Statement: Open Items report, phone (375/390): each row takes 4 lines, the age cells sit one line lower than on the A/R Aging (line 3 Current, 1 - 30; line 4 31 - 60, 61 - 90, 91 and over). The plan put Date and Due on line 2, where `arDisplay()` puts Current and 1 - 30, and core `placeCells` holds three cells in three tracks; measured with 0 cut cells (implementer part 1 #5; reviewer B DEFERRAL 1, reviewer A NOTE).
- cp 1 · Statement reports: the column labels ("Date", "Activity", "Amount", "Balance"; "Customer", "Date", "Due date", the aging labels) and the two hub descriptions were chosen by the implementer; the plan named none (implementer part 1 #7).

## Out-of-plan changes
- `tests/e2e/books-settings.spec.ts` (cp 1): not in the Files block, but named in checkpoint 1's "Tests it must add" and Gates line; one block added to the Numbering test (the Statements card). Reviewers A and B: in scope.
- `docs/plans/statements-ledger.md` (cp 1): the loop's ledger, committed with each checkpoint.

## Phase notes
- phase 1: unattended; no corrections by the human before the design gate. Intake, triage and the `[?]` list: the design packet (staging `packet.md`, `intake.md`). No needs-extension spark. The source's green, header bar and split button are not carried.
- design gate (human, 2026-11-20): direction **A** (one screen: options, recipients and the total on one pushed screen with one sticky action bar). Directions B (two steps) and C (a Statements list in Sales with a create panel) are not built.
- design gate answers (human, 2026-11-20). Q1–Q20: the packet's recommended answer, except Q5; Q11 changes as a consequence of Q5; Q21 and Q22 are new.
  - Q1 build: each type is a shipped report (`books.statement_balance_forward`, `books.statement_open_items`), and the statement PDF is the Books document template filled from a run of that report as the reader.
  - Q2 types: Balance forward and Open items. "Transaction statement" is cut.
  - Q3 Save: a new collection `books_statements`, one row for each customer; a statement posts nothing.
  - Q4 sender: this unit sends with the server's own sender (core `mailer`); From shows the business name, Reply-To is the user who sends. No dependency on the `mail` package or on p2-email-share.
  - Q5 email text — CHANGED by the human: "subject and message should be interpolated with the statement details, the subject should list the statement number and body should contain balance details that the customer will find most important". The user still does not edit the subject or the message. Subject: "Statement <number> from <business name>". Body (spec §3.5): statement date and amount due for both types; Open items adds the past-due amount with the oldest due date and the count of open items; Balance forward adds the period, the balance forward, new charges, payments and credits; both end with how to reply (and the business phone when set).
  - Q6 a changed address: applies to this run's statement only; the customer is not changed.
  - Q7 Customer balance: Open (default), Overdue, All; a credit balance is listed only under All.
  - Q8 sub-customers: each customer row gets its own statement; a parent's statement holds its own lines only.
  - Q9 dates: Balance forward takes Statement date, Start date and End date (Start ≤ End ≤ Statement date); Open items takes Statement date only.
  - Q10 Balance column: today's open balance (`books_party_balances`); the statement's own amount due is stored when it is made.
  - Q11 entry points — CHANGED in one part: New menu → "Statement", the customer page's New transaction menu, and the Statements tab's "Create statement" button; no Sales tab (stands). "No statement number" is overturned by the Q5 answer: a statement gets a number from Books' existing sequence machinery (`books_doc_sequences`, `allocateNumber`) with its own sequence, shown on the PDF, the statement screen and the customer's Statements tab (spec §3.1, §4.2, §4.8).
  - Q12 tab place: second in the strip (Transactions, Statements, Contacts, Details, Notes), key ⌥5.
  - Q13 a saved statement opens as a pushed screen `books/statements/<id>`, not in the detail panel.
  - Q14 delete: a sent statement can be deleted by any Books writer after a confirm; the audit log keeps the create, the send and the delete.
  - Q15 limits: at most 200 customers in one run; at most 500 statement emails by one user in an hour.
  - Q16 Preview needs no save: one PDF of the ticked customers, nothing stored.
  - Q17 migration number: superseded by Q21.
  - Q18 after Save / Save and send: return with a toast; on a part failure stay, name each failed customer, untick the rows that succeeded.
  - Q19 forms engine: a statement is not a forms-engine host; plain `useForm` + zod.
  - Q20 seed: two saved, unsent statements of one seeded customer with an open invoice.
  - Q21 (new, overlap with p5-ap-aging): p5-ap-aging owns migration 2100000032. This unit's migration is `2100000033_create_books_statements.js`, and `2100000032_create_books_audit_log.js` is renamed to `2100000034_create_books_audit_log.js` so it stays last. The main merge before the PR checks the numbers again.
  - Q22 (new): p5-ap-aging also edits `lib/shipped-reports.ts`, `server/register.go`, `server/registrations_test.go`, `server/oauth_scopes.go` (+ test), `seed.ts`, `help/reports.md`, `tests/help-reports.test.ts`, `server/report_spec_helpers.go`. Edits there are append-only; p5-ap-aging merges first and this unit keeps both sides.
- decisions made by the agent on approval, not by the human (the spec holds each; shown at the eval gate):
  - the statement sequence starts as prefix "ST-", next number 1001 (seeded row `booksseqstatemt` in the unreleased migration 2100000001, edited in place); an admin can change both in Settings → Numbering.
  - the sequence guard reads a statement's highest number from `books_statements` (`highestSequence` reads journal entries only).
  - the statement create guard runs inside `serialized` (needed by `allocateNumber`); numbers within one run follow the server's store order, not the list order.
  - the email is plain text; "how to pay" is "reply to this email" plus the business phone when set (Books has no payment-instructions setting); an amount due of zero or a credit says "No payment is due."
  - the attachment's name is `statement-<number>-<customer name>.pdf`; a preview prints no number.
  - the Statements tab gains a "No." column after Date; Books search does not find a statement by its number.
- finding outside this unit (not changed): `highestSequence` reads `books_journal_entries` only, so the sequence guard does not stop an admin from moving the Estimates next number back over stored estimate numbers (`server/sequences.go`; an estimate has no journal entry).
- phase 3: direction **A** built as the real-component reference. Fixture `tinycld/books/lib/statements-fixture.ts`; scratch route `screens/helix-mockup.tsx` (`?state=`); manifest `docs/plans/statements-capture.json` (31 shots, 71 PNGs in `docs/plans/statements-reference/`, 390 and 1280; dark for populated, send-error, preview, tab, statement, statement-send). No spark dropped: both are in the reference (the total as a muted caption over a `text-3xl` figure that follows the ticks; one line for each recipient with the address in a core `TextInput`, cards below 616 px).
  - shots: create screen `populated`, `open-items`, `one-customer`, `overdue`, `send-error`, `failed`, `no-email`, `none`, `empty`, `loading`, `error`, `no-write`, `saving`, `preview`, `more-menu` (phone); Statements tab `tab`, `tab-empty`, `tab-reader`, `tab-reader-empty`, `tab-menu` (phone), `tab-menu-wide`; statement screen `statement`, `statement-unsent`, `statement-reader`, `statement-no-email`, `statement-pdf-error`, `statement-missing`, `statement-more`, `statement-send`, `statement-send-refused`, `statement-delete`.
  - reference corrections: (1) the option widths went from 200/170/170 to 190/152/150 so the five options hold one line at 1280; (2) the drawn page's right block shrinks and its table columns changed so the dates are whole on a phone; (3) the wide row-menu shot is its own shot `tab-menu-wide` with `stable`: in a two-width shot the menu was closed at the 1280 capture.
  - the fixture's `StatementRecord` is a local mirror of spec §4.2: the checkpoint that adds migration `2100000033_create_books_statements.js` replaces it with the generated row type. `STATEMENT_SEED` holds the two seeded statements of Q20; the seed checkpoint wires it into `seed.ts`.
  - the printed page in `statement*` and `preview` is a drawn stand-in (a letter-page frame with the §3.6 parts). The build shows the server's PDF in the page viewer; gate 2 compares the frame and the screen around it, not the page's inner layout. On a phone the stand-in's "Open amount" head and due dates are cut; the PDF scales and does not cut.
  - parts the reference draws that Books and core do not have (the plan must name each): a statement action bar with a disabled state for each button and a "Email sending is not set up" line (the Books `DocumentBarAction` has no per-button disabled); a run notice (`border-danger-soft-foreground bg-danger-soft`) above the list; a "Select all" `SelectBox` row over the phone cards; the second sentence and the "Create statement" button under core `EmptyState` (it holds one message).
  - decisions the spec did not settle, made in the reference (shown at the eval gate): invalid address text "Enter a valid email address."; missing address text "Enter an email address or clear the tick."; delete confirm title "Delete statement <number>?" with message "The customer's balance does not change."; not-found text "This statement does not exist, or you cannot open it."; a phone bar of "Save and send" + "More" (Preview, Save, Cancel); the statement screen's line "The amount due was <amount> when this statement was made." for an amount that differs now; the tab's cards below 860 px. Not drawn: where the "at most 200 customers" refusal shows (the plan decides: the form's error summary above the bar).
  - core `DateField` shows the day as `2026-11-20`; the reference keeps core's format.
  - no `db:reset` was needed: the route is static. The working tree holds no statement row in migration 2100000001 yet, so the checkpoint that adds the sequence row runs `db:reset`.
- phase 4: plan written (`docs/plans/statements-checkpoints.md`), 5 checkpoints, no checkpoint 0: (1) Statement data, numbering and reports — logic; (2) Statement PDF, preview and email — logic; (3) Create statements: list and Save — renders; (4) Preview, send and failed runs — renders; (5) Statements tab, statement screen, help — renders. E2E budget 12 tests. `plan-check.mjs --unattended`: 0 errors.
  - plan decisions (shown at the eval gate): the server-set fields are refused in the model create hook (the pattern of `checkNewSalesDoc`); the statement PDF kind gets the reader through a new `documentKind.BuildAs`; the send saves through the update-request hook trigger so core's audit hook writes the `changes` (when that cannot work the agent stops for a core checkpoint 0; no fallback to `audit.Log`); the PDF route answers the header `X-Books-Statement-Amount-Due` for the "amount due was" line; Books has its own `fileStem` (core's is not exported) with one case file for Go and TypeScript; the date rule and the address rule each have one case file for Go and TypeScript; `SALES_NEW_ITEMS` filters to sales kinds so the All sales New menu gains no Statement row; with email not set up the row menu has no Send… (the statement screen shows the disabled button and the note); the "at most 200 customers" refusal shows in the form's error summary.
  - plan review (report: staging `plan-review.md`): 1 blocker, 11 major, 23 minor. Fixed in the plan: the blocker (`lib/sales-lists.ts` threw at module load with a `takesCustomer` action that is no sales kind); the audit row of a send (`audit.Log` cannot write `changes`); checkpoint 5 steps that edited files outside its Files block (moved to checkpoints 2 and 4, branches decided); the Gates lines (five more PDF specs, three more vendor specs); `isZeroValue` (did not exist); the shared PDF code (`hooks/useDocumentPdf.ts`, now in Files); the shared case files for the address rule and `fileStem`; tests added for the read-only New menu, the row menu's Send… and Download PDF, the "amount due was" line, not found, delete of a sent statement, the tab order, a delete that frees no number, a typed End date, the scroll to `?customer`, Space on a tick box, the Download file name, a Preview refusal, the Numbering card; the names `refuseAfterNow` and `guardedStore`; the labels moved to `lib/statement-texts.ts`.
  - plan review findings not changed, with the reason: (c) the pinned-list test files of checkpoint 1 keep "run each test first and edit only a pinned list" (the reviewer did not check those lists, and the failing test names the pinned value); the conditional entries for `lib/audit-log-fixture.ts` and `server/search_index_test.go` stay for the same reason; a live change of the open list has no e2e test (budget; the plan names the unit test that pins the merge); the no-write notice of `books/statements/new` has no e2e test (a read-only user has no control that opens the route; a unit test and the gate-2 shot pin it).
  - the reviewer did not check: the seed order pins of `tests/seed-node.test.ts`, the pinned lists of `tests/collections.test.ts`, the OAuth test and `server/testdata/audit_log_spec.json`, `components/NewMenu.tsx`, and the scratch route's test ids against the plan's.
- review mode switches: none

## Checkpoint 1
- test writer: server/statements_test.go, server/report_statements_test.go, server/testdata/statement_date_cases.json, tests/statements-fixture.test.ts, tests/seed-node.test.ts, tests/doc-types.test.ts, tests/migration-prefixes.test.ts, tests/e2e/books-settings.spec.ts (staged); red for the right reason: 25 of 27 (2 fixture-data checks green when written: they pin data that exists); untestable: none. The seed test calls `seedStatements(pb, customerIds)` (customers get server ids; Do step 9's `seedStatements(pb)` cannot map the fixture id) — accepted.
- implementer: two dispatches. Part 1 (data + Go, Do 1-6): DONE, 0 disputes, 7 declared differences (staging cp/cp1-impl.md). Part 2 (TypeScript, seed, display measure, Numbering card, Do 7-9): its report file says DONE, 0 disputes, 4 declared differences (staging cp/cp1-impl-2.md); its hand-back had not arrived when this runner handed off.
- test disputes: none
- self-declared differences (triaged by the second runner):
  - part 1 #1 `oauth_scopes_test.go` has no shared read-write list → new test `TestOAuth_StatementsAreReadWrite` appended: accepted (the Files block's list does not exist; the test pins the same fact).
  - part 1 #2 extra refusals (empty `statement_date` "Enter a date"; Open items with an `end_date` "An open items statement has no period" on `end_date`; a year before 1900 "Enter a valid date"): accepted (the same rule as the case table's `start_date` case; the client never sends them; the field is required in the schema).
  - part 1 #3 date texts as Go constants without the final period; send-route constants left to checkpoint 2: accepted (PocketBase `Sentenize` adds the period; the routes are checkpoint 2's Files).
  - part 1 #4 opening wrapped in `coalesce(lookup, 0)`: accepted (the shape of `generalLedgerOpening`).
  - part 1 #5 Open items phone layout: the age cells sit one line lower than `arDisplay()` (line 3 current, d30; line 4 d60, d90, d91), because core `placeCells` cannot put four cells in three tracks: accepted, and listed under Design notes for the human.
  - part 1 #6 displays not measured: closed by part 2 (375/390/1280, 0 cut cells, 0 sideways scroll).
  - part 1 #7 column labels and shipped descriptions chosen by the implementer: accepted, listed under Design notes.
  - part 1 observation: a void reversal's activity reads "Void reversal of 1004 1004" (`lineEntryTypeLabel()` already ends "of <number>"; the plan's formula appends `entry.number`): a defect against the spec's activity form → fix round (see gate 3).
  - part 2 #1 `OPEN_LABELS` map for "Open statement": accepted (the checkpoint asks for "Open statement").
  - part 2 #2 `DOC_TYPE` label "Statement": accepted (the list's labels are singular).
  - part 2 #3 `seedStatements(pb, customerIds)`: accepted (settled at the test writer step).
  - part 2 #4 dev Numbering card shows next 1003: accepted (the seed stores ST-1001 and ST-1002; the e2e asserts ≥ 1001).
- gate 1: tests unedited: yes (`git diff --name-only` of the 8 test-writer files is empty) · `packages:generate` exit 0 · `tinycld-pkg check` exit 0 (398 files, 8397 tests) · `go test ./...` ok (227.6 s), gofmt clean, go vet ok · e2e (one command: audit-log, books-settings, books-ar-aging, books-customer-balance, books-sales-reports, customer-pages-balance): 57 passed (3.0 m). No listed spec pins every hub report (the Customers Reports menu lists its three keys by name); books-settings' Numbering test gained the Statements card (test writer). → pass
- gate 2: n/a (logic checkpoint)
- gate 3 A (correctness): 1 BLOCK, 4 NOTE, 1 DEFERRAL (staging cp/cp1-review-A.md). BLOCK reversal activity "Void reversal of 1004 1004" → accepted+fixed (fix item 1). NOTE `TestStatement_StoredBalance` does not pin the end day → accepted+fixed (item 3). NOTE Open items tie-break on item number not exercised → accepted+fixed (item 4; a checkpoint test bullet). NOTE books-settings.spec.ts out of plan → recorded under Out-of-plan changes. NOTE Open items phone layout → Design notes. DEFERRAL `tests/settings-sections-numbering.test.ts` gained no Statements describe (spec §4.7) → accepted+fixed (item 5).
- gate 3 B (conformance): script lines: 0 real, 2 false positive (migration 2100000001 unreleased and edited per plan note 3; 2100000034 a pure `git mv`, plan note 2) · 7 findings, 2 DEFERRAL (staging cp/cp1-review-B.md): #1 reversal activity → accepted+fixed (item 1); #2 two guard refusals missing from the shared case table → accepted+fixed (item 2); #3 `help/settings.md`, #4 `help/reports.md` → rebutted (checkpoint 5 owns them; see Rebuttals); #5, #6 out-of-plan files → recorded; #7 weak stored-balance test → accepted+fixed (item 3); DEFERRAL 1 phone layout → Design notes (a plan conflict, not a missing capability); DEFERRAL 2 seed signature → rebutted (see Rebuttals).
- fix round 1 (staging cp/cp1-fix-r1.md, 5 items): test writer (cp/cp1-fix-tests.md) added the reversal assertion (red: "Void reversal of 1004 1004"), the two case-table cases, a payment between Start and End, two same-due-date invoices, the Statements numbering describe; it also changed `tests/statements-fixture.test.ts`'s `refusedField` to follow the guard's order (the new Open items `end_date` case failed it). Implementer (cp/cp1-fix-impl.md): `activity` shows the entry number only when the origin is not a reversal (`server/report_statements.go`). Gate 1 again: tests unedited · check exit 0 (398 files, 8399 tests) · `go test ./...` ok (234.2 s) · the six specs 57 passed (3.0 m).
- fix review: round 1: clean (staging cp/cp1-fix-review.md). Rounds: 1.
- gate 3 A notes: none open (each NOTE fixed or recorded above)
- reviewer-caught deferrals: reviewer A — `tests/settings-sections-numbering.test.ts` gained no Statements card test; not self-declared (implementer part 2 ran it green and left it, reading "edit only a pinned list" as "no change when green"); fixed in round 1.
- commit: the commit "feat(books): statement data, numbering and reports" (its sha is in git; the driver records it)
- human: n/a (review mode C)

## Final review
- eval: (pending)
- human comments and what changed
- native: not executed in this run
