# ar-aging — helix run ledger

- mode: unattended
- unit: p5-ar-aging
- started: 2026-11-18
- package branch: books/p5-ar-aging (from books main 94fb5837)   core checkout: main (470a6f7b)
- spec: docs/specs/ar-aging-design.md
- checkpoints: docs/plans/ar-aging-checkpoints.md
- reference: docs/plans/ar-aging-reference/
- evidence: docs/plans/ar-aging-evidence/cp<N>/ (built screenshots, capture.json, critique.md); docs/plans/ar-aging-evidence/perf-plans.md (the query plans of spec §9)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/ar-aging-capture.json
- review mode: C — none (unattended)
- core extension: none planned. Two engine uses have no run behind them yet (a union source whose parts are view collections; a group label that reads `min` of a text field). Checkpoint 1's Go test pins both first; a refusal, or a performance bar of spec §9 that fails because of the SQL core writes, becomes a core checkpoint 0 (human's rule, 2026-11-01).
- sparks:
  - 1. How late money is reads from where the figure sits: one column per age, older to the right → expressible (one formula column per age in the report spec; core `ReportTable`)
  - 2. An age with no money is blank, so the eye lands on the figures that exist → expressible (Books `blankZero()`, `server/report_spec_helpers.go`)
  - 3. The grand total is the heaviest line → expressible (core `ReportRow` total row)

## Deferrals
(none yet)

## Rebuttals
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
- cp 1 · reviewers A and B: the spec's approved Live bullet was changed by the runner in unattended mode (see Out-of-plan changes) — the human must see this spec change at the eval gate. Checkpoint 2's `TestARAgingTopics` lost the clause "a run with an item opened also holds `collection/books_journal_entries`"; it still holds because `books_journal_entries` is one of the six base topics of every run — checkpoint 2's reviewers confirm it for a run with an item opened.

## Out-of-plan changes
- cp 1 · `docs/specs/ar-aging-design.md` (Live bullet) and `docs/plans/ar-aging-checkpoints.md` (the quoted Live bullet, `TestReceivableItemsEngine`'s topics, checkpoint 2's `TestARAgingTopics`): a run's topics are the views' six base collections, not the views' own topics (core `core/server/changesignal/topics.go:18-20`). Edited by the runner after the cp 1 test dispute, so checkpoint 2 does not repeat it.

## Performance
(none yet — the results of spec §9, written by checkpoint 3 and again after each change to the views, the indexes or the spec)

- machine, date, commit:
- row counts, S and L:
- runs 1 to 7: number of statements; median time at S and at L; ratio L/S; bar; pass or fail
- statements: one line each — the tables it reads and the index of each read, with no statistics and after `ANALYZE`; pass or fail
- indexes added and view changes: each with the plan step and the time before and after it
- Customer Balance run of the same day on the same dataset (no bar):
- full plan text: docs/plans/ar-aging-evidence/perf-plans.md

## Phase notes
- phase 1: unattended; no corrections. Intake: 5 inventory items from the screenshot, 1 from the human (2026-11-16: open invoices by customer), 10 `[?]`, 3 sparks (all expressible), no `[platform]` item.
- design gate (human, 2026-11-18): approved.
  - Direction: **A** — one report; customers by age; a customer opens into its open items. B (one list in sections by age) and C (two reports joined by a drill) are not built.
  - Open questions: all 16 accepted as the packet recommends.
    - Q1 direction A.
    - Q2 the report ages open items from the ledger (posted Accounts receivable lines; an invoice less the payments applied on or before the day; the unapplied part of a payment; a credit memo; a journal entry line), not the stored `books_invoices.balance`.
    - Q3 one migration with two view collections (`books_receivable_lines`, `books_receivable_applications`) and one union report source `books.receivable_items`.
    - Q4 age from the due date; no "age by transaction date" choice.
    - Q5 fixed periods: Current, 1 - 30, 31 - 60, 61 - 90, 91 and over.
    - Q6 an unapplied payment, a credit memo and a journal entry line age from their own date; a credit is a negative figure in the column of its age.
    - Q7 As of defaults to Today; a past day counts only the payments dated on or before it.
    - Q8 sub-customers nest as in the Customer Balance.
    - Q9 Accounts receivable lines with no customer are one "No customer" row, last.
    - Q10 a customer opens into its open items, oldest due date first; an item opens into its invoice and payment lines; a line opens its document.
    - Q11 an empty age cell is blank on every row, the Total row too; the Total column always shows a figure.
    - Q12 Order: Name (default) or Largest balance.
    - Q13 an inactive customer with an open item is shown, muted, with " (inactive)".
    - Q14 entry points: an "A/R Aging" item in the Customers list's Reports menu after Customer Balance, and the Reports hub.
    - Q15 one report, title "A/R Aging".
    - Q16 seed additions (a part payment on a seeded invoice, one unapplied payment, one more posted invoice, fixed 2026 dates), after a grep of the tests that read those figures.
  - Platform-only items: none new.
  - Overlap O1 (migration number): p3-vendor-pages (another lane) may also add migration 2100000026. This unit takes the next free number when the checkpoint that adds the migration commits; when the other unit merges first, the integration renumbers this unit's file.
  - Overlap O2 (`tinycld/books/seed.ts`): p3-vendor-pages also edits it; at merge both sides are kept. This unit adds its rows as their own block.
  - New requirement (human): this is the first use of a union source over view collections and of a group label that reads `min` of a text field, so the build benchmarks the report's queries on a large dataset and checks each generated SQL statement with SQLite `EXPLAIN QUERY PLAN`; where a query does not use an index or scans a large table, the build adds indexes or reworks the views. It is spec §9 (Performance acceptance) and the Behavior bullet "Performance"; the checkpoint plan carries it. Proposed there, not yet reviewed by the human:
    - dataset: S = 50,000 and L = 500,000 journal lines (L: 2,000 customers, 100,000 invoices, 80,000 payments, 90,000 applications, about 185,000 Accounts receivable lines, about 8,000 open items, five years);
    - runs: default, a past day, Order = Largest balance, one family picked, one customer opened, one item opened, the CSV export;
    - plan bars at L, with no statistics and after `ANALYZE`: no `SCAN` of `books_journal_lines` or `books_journal_entries`; no `SCAN` of another large table inside a loop, and none at all in a statement bound to picked customers, one customer or one item; no `AUTOMATIC` index on a large table; no view over a large table built whole and scanned inside a loop;
    - time bars at L (median of 5): runs 1 to 6 at most 1,000 ms each, the CSV export at most 5,000 ms, and each run at L at most 15 times its time at S;
    - a failed bar: an index in this unit's migration, then a view rework, then a core checkpoint 0 when the cause is the SQL core writes; a bar is never changed to pass;
    - results: this ledger's Performance section, with the full plans in docs/plans/ar-aging-evidence/perf-plans.md.
- phase 3 pass 2 (2026-11-18): direction A captured. No spark dropped. No human corrections (unattended).
  - Fixture: `tinycld/books/lib/ar-aging-fixture.ts` (static `RunResult`s over the seeded customers of `customer-form-fixture.ts`: `arAgingResult({ order, customers, groups, open, openItems, folded, asOf })`, `emptyArAgingResult()`; `AR_AGING_PARAMS`, `AR_AGING_COLUMNS`, `AR_AGING_GROUPS`, `AR_AGING_DISPLAY`, `AR_AGING_ANCHORED_PHONE_LAYOUT`, `AR_AGING_SEED` for the Q16 seed rows). The open items are local shapes: no client collection backs the two views (spec §8). A journal entry item is labelled with the real entry number form ("Journal entry JE-12"), not the spec's example "Journal entry 12". A line label is `<ISO date> · <type> <number>`, as `concat(date, …)` gives it.
  - Scratch route: `/a/books/helix-mockup?state=` populated, opened, item-opened, by-balance, filtered, past-day, empty, loading, error (core `ReportView` over a hand-built `ReportViewModel`); `&layout=anchored` draws the other phone arrangement; `&gate=<px>` sets the one-line width for a measure. The toolbar has no Export (a hand-built model has none).
  - Reference: `docs/plans/ar-aging-reference/` (58 files, light and dark), manifest `docs/plans/ar-aging-capture.json`. The capture spec copy has one run-only addition: each capture prints the table's fit marker (`data-fit-width` / `data-layout`), the heading widths, and `SIDEWAYS` when something in the table scrolls sideways.
  - Shipping route: core `/a/reports/<id>` (no package sidebar). Measured there (the shipped Customer Balance): rows width = window − 64 px at 768 and wider, = window below 768. The scratch route draws the Books sidebar: rows width = window − 324 px at 1024 and wider, window − 239 px from 768 to 1023. So the reference widths stand for these shipping widths: scratch 1540 = shipping 1280 (rows 1216 px); scratch 1280 = shipping 1024 (rows 956 px; shipping gives 960); scratch 1160 = shipping 900 (rows 836 px); 375 and 390 are the same on both routes.
  - Display block measured (in `AR_AGING_DISPLAY`; the Go spec must carry the same values):
    - `columns`: `name: { whiteSpace: "normal", lineClamp: 3 }`; `due`, `current`, `d30`, `d60`, `d90`, `d91`, `total`: `{ minWidth: "max-content" }`. Measured one-line column widths: Due date 122, Current 104, 1 - 30 118, 31 - 60 104, 61 - 90 104, 91 and over 117, Total 118 px (sum 787 px; the widest figure is 118,240.00).
    - `oneLine.minWidth: "940px"`. With no gate core draws one line from rows of about 960 px down to where the figures' minimums fit; at 956 px the Customer column is 169 px ("Credit memo 3" at depth 2 wraps to two lines, nothing is cut), at 876 px it would be 89 px. With the gate: shipping 1024 and wider is one line; shipping 900 (836 px) is the tablet arrangement.
    - tablet arrangement (`width: "tablet"`, `minWidth: "640px"`, 12 tracks): line 1 Customer (span 10) and Total (span 2); line 2 Due date and the five ages (span 2 each). All ages are on one line, so a figure's place names its age. Used from 640 px to 939 px rows (measured at 661, 700, 836 px).
    - phone arrangement (`width: "mobile"`, 3 tracks): line 1 Customer (span 2) and Total; line 2 Due date, Current, 1 - 30; line 3 31 - 60, 61 - 90, 91 and over. Fits at 375 and 390 with no sideways scroll of the table (the `SIDEWAYS` marks at 375, and at 390 with a long chip row, are core's chip strip, which scrolls sideways on the shipped Customer Balance too).
  - **Finding F1 (needs a decision before phase 5; phase 4 must carry it).** On a phone the spec's arrangement is ambiguous. Core draws a group row (a customer, an item, a subtotal, the Total) with only the lines it has a value in (`core/reports/lib/table-lines.ts` `rowLayout`, R14), and the heading shows the arrangement one time at the top. A customer row whose only money is in 31 - 60 draws that figure on its only figures line, in the same place as Due date (Bluefin Marine Supply −320.00 in `populated-390-*`); 61 - 90 lands where Current is, 91 and over where 1 - 30 is. The approved artboard A showed a caption on each phone figure; core has no captions. Two ways out:
    - (a) no core change: `AR_AGING_ANCHORED_PHONE_LAYOUT` (line 1 Customer and Due date; line 2 Current, 1 - 30, Total; line 3 31 - 60, 61 - 90, 91 and over). Total always has a value, so line 2 is on every row and a figure's place always names its age. It changes the spec sentence "the label and Total on the first line". Captured as `populated-anchored-*` and `item-opened-anchored-*` (375, 390).
    - (b) core checkpoint 0 (the human's rule of 2026-11-01): a group row keeps every figures line of an authored arrangement, or each figure of a wrapped row carries its column's name.
    - The reference shows the spec's arrangement in every other shot. This agent recommends (a).
  - Other things the captures show: a line row (detail) keeps all three lines on a phone and both lines on a tablet, so it is tall with blank lines (core rule: a detail row keeps every line); on one line a group row's label spans its empty cells up to its first figure; the empty state's chip reads "As of: Today" over "As of December 31, 2025" (the static model, not a defect of the build).
- human decisions after the reference capture (2026-11-18):
  - **F1: option (a).** The shipped phone arrangement is `AR_AGING_ANCHORED_PHONE_LAYOUT` (line 1 Customer and Due date; line 2 Current, 1 - 30, Total; line 3 31 - 60, 61 - 90, 91 and over). No core change. The spec's Phone bullet and its §4 display bullet say so now (the sentence "the label and Total on the first line" is the tablet arrangement only). The fixture's `AR_AGING_DISPLAY.layouts` holds the anchored layout.
  - The phone reference is `populated-anchored-375-*`, `populated-anchored-390-*`, `item-opened-anchored-375-*`, `item-opened-anchored-390-*`. The 16 phone shots of the other arrangement (`populated-375/390`, `item-opened-375/390`, `opened-390`, `by-balance-390`, `filtered-390`, `past-day-390`, light and dark) were moved out of the reference folder to the lane's staging folder (`superseded-phone-reference/`, not committed), and the capture manifest no longer lists those widths. The reference folder holds 42 files.
  - The performance acceptance of spec §9 is accepted as written. Checkpoint 1 pins the union source over views and the `min`-of-text group label first; checkpoint 3 runs the benchmark and the `EXPLAIN QUERY PLAN` checks and fills the Performance section. A bar that fails because of SQL that core writes stops the run (core checkpoint 0).
  - Spec edits from the pass 2 notes: a journal entry item is labelled "Journal entry JE-12"; a line label starts with the ISO day; the Wide bullet gives `oneLine.minWidth: "940px"`. Captures run with the files command `tinycld-pkg test:e2e books/tests/e2e/helix-capture.spec.ts`, never `-g helix`.
- phase 4 (2026-11-18): plan `docs/plans/ar-aging-checkpoints.md`, 4 checkpoints, 9 e2e tests; `plan-check.mjs --unattended` 0 errors.
  - 1 Receivable items views and source (logic): the migration with the two views, the union source, the two engine pins, OAuth read entries, the seed rows and their ripple.
  - 2 A/R Aging report for readers (renders): the shipped spec, the shared family and aging helpers, the Go cases, 6 e2e.
  - 3 Query plans and scale proof (logic): spec §9; an ordinary plan test at about 500 lines read with no statistics and with the L statistics from `server/testdata/ar_aging_stat1.json`, and the `BOOKS_SCALE=1` S and L runs.
  - 4 Reports menu, narrow layouts, help (renders): `display.layouts`, the Customers list menu item, help, 3 e2e (menu; phone 390; phone 375).
  - Plan decisions D1 to D15 are in the plan (D6: the item order reads two columns that are blank above the item level, so Largest balance never orders items; D8: the test "the audit log view runs last" changes to "after every audited collection"; D10: plan bars under L statistics at the small size; D12: a reversed manual entry is one item).
  - plan review (one fresh agent; 0 blockers, 3 major, 14 minor; all fixed in the plan):
    - P1 major: a voided manual Accounts receivable entry gave two items for ever (a reversal has no `document`). Fixed: plan D12 (the reversal line takes the reversed line's id as `item`), with a views test and a report test.
    - P7 major: the CSV export test had no setup (core exports a stored report only; core's export test helpers cannot be imported). Fixed: checkpoint 2 adds the helper `exportARCSV`; checkpoint 3 uses it (D11).
    - P8 major: loaded `sqlite_stat1` rows reach only the connection that runs `ANALYZE sqlite_schema`. Fixed: each plan reading runs on one connection, and a sub-test proves the statistics change a plan (D10).
    - Minor, fixed: proof named for the Live causes, the drill panel and the page's Open figure (D14); a one-line and no-sideways-scroll check at 1024 in e2e 6; the corrected invoice case and the entry with another document kind (D12); the view SQL written out; the seed ripple files named; limits on a view change in checkpoint 3; one name for the due day, `AR_AGING_EMPTY_DAY` moves to 2020-01-01 in checkpoint 1 (the seeded book has a 2024 line), core path rule, `arBook.app` type; red proofs for the bulk writer tests; `seedArAging` cases in `tests/seed-node.test.ts`; the A/R Aging key in the sales-reports spec's faked-read poll; one shared case file for the Go spec and the fixture (D15); core files cited (D13).
    - Confirmed by the review: core `relationCheck` accepts a union of views, a select over a view text column and the two links while their view columns stay bare relations; D6 is true; every named path and consumed name exists.
    - Report: lane staging folder, `plan-review.md` (not committed).
- review mode switches: none

## Checkpoint 1
- test writer: `server/receivable_items_test.go` (new; `arBook`, `newARBook`, `arInvoice`, `arPayment`, `arCreditMemo`), `server/report_sources_test.go`, `server/oauth_scopes_test.go`, `server/registrations_test.go`, `tests/migration-prefixes.test.ts`, `tests/seed-node.test.ts`; stub `server/receivable_items.go`; 15 tests (11 Go, 4 vitest) red for the right reason: yes; untestable: none
- implementer: two views in `pb-migrations/2100000026_create_books_receivable_items.js` (the SQL of Do 1 unchanged), `registerReceivableItems`, OAuth read entries, source `books.receivable_items`, fixture `satisfies` types, `seedArAging`. First dispatch stopped on an API usage limit with no report; a fresh implementer continued from the tree. DONE (NEEDS-RUN for the Do 9 e2e).
- engine pins: core accepts the union over two view collections and the `min(item_kind)` / `min(item_number)` group label (`CheckSources`, `Load`, `Validate`, `Run` pass in `TestReceivableItemsEngine`); no core checkpoint 0.
- test disputes: 1 — `TestReceivableItemsEngine` expected `collection/books_receivable_lines` and `collection/books_receivable_applications` in the run's Topics. Settled: the test was wrong. Core `core/server/changesignal/topics.go:18-20`: "A view's own topic is not listed, because SQLite reads the view's base tables, and their topics carry every change the view shows." A fresh test writer changed the assertion to the six base collections; re-staged. Spec Live bullet and plan corrected (Out-of-plan changes).
- self-declared differences: 5 — `AR_AGING_SEED` lost `as const` (each row `satisfies` its local type); `postCustomerBalanceInvoice` takes an optional `{ due_date, terms }` (the A/R invoice is `net_30`); `CustomerBalanceInvoice` typed from `BooksInvoices`; seed customer lookup helpers `arAgingFixtureId` / `arAgingCustomer`; `receivableItemColumns` shared var in `report_sources.go`.
- gate 1: tests unedited: yes · `go test ./...` pass · `packages:generate` + `tinycld-pkg check` pass · e2e (Do 9, driver NEEDS-RUN: books-customer-balance, books-sales-reports, customer-form-list, customer-form-page in one command): 28 passed, exit 0 · gate 1 pass
- gate 2: n/a (logic checkpoint, nothing renders)
- ripple (Do 8): `command grep -rlE 'Accounts receivable|Undeposited|1100|1200' tests/e2e` → 20 files, each read by the implementer (cp1-impl.md): account-picker labels only (products-services-form, vendor-form-page, transfer-form); own rows (opening-balances, receive-payment-keyboard, credit-memo-form, account-register-table); title or drawer only (account-register-drawer:246, journal-entries-read-only:129); row set with no figure (trial-balance:70-75, balance-sheet:46/67); comments only (profit-and-loss, books-sales-tax-liability, pay-bills-sales-tax-cash); settings flow (sales-receipt-form, sales-receipt-form-settings); the helpers and the step-9 specs. No figure the new seed moves; no spec changed. Reviewer A read the same hits and agreed.
- gate 3 A (correctness): 0 BLOCK, 4 NOTE — (1) migration listed out-of-plan: false positive, the Files block names `pb-migrations/<number>_create_books_receivable_items.js`; no action · (2) spec/plan edit: to Design notes for the human · (3) `TestReceivableItemsEngine` counts map entries, not group rows: accepted (weak test) → fix r1 item 1 · (4) seed-node `filteringPb` ignores `status = "posted"`: accepted (weak test) → fix r1 item 2
- gate 3 B (conformance): script lines: 0 real, 3 false positive (tests/seed-node.test.ts:236, :282, :344 — the fake client of a Node unit test of the superuser seed; reasons in cp1-review-B.md) · (1)(2) spec/plan out-of-plan edits: recorded, to Design notes · (3) migration out-of-plan: false positive, as A (1) · (4) Do 8 grep not in the ledger: accepted → recorded in the ripple row above from cp1-impl.md · (5) seed-node `seedArAging` cast with an early return passes silently when the export is missing: accepted (weak test) → fix r1 item 3
- deferrals: none (A and B: none found)
- fix r1 (cp1-fix-r1.md, 3 weak-test items, test files only): one helix-test-writer dispatch; it stopped before it wrote its report, and a fresh runner read its edits against each item: (1) `TestReceivableItemsEngine` counts the KindGroup rows and requires 4 · (2) `filteringPb` replaced by `servedPb` (a real SDK client over a stand-in server whose list read honors every filter clause, `status = "posted"` too) and a new case: a draft with the gala memo and customer, written first, gets no application · (3) `seedArAging` imported directly, cast and early return gone. Files changed: `server/receivable_items_test.go`, `tests/seed-node.test.ts` only.
- gate 1 after fix r1: `go test -count=1 ./...` pass · `packages:generate` + `tinycld-pkg check` pass (361 files, 7195 tests) · no e2e (no source changed)
- fix review: n/a (round 1 touched tests only) · rounds: 1
- gate 3 A notes: 1 (NOTE 2, spec/plan edit) under Design notes
- reviewer-caught deferrals: none
- commit: 30616027
- human: review mode C (unattended), no message

## Final review
- eval: (not reached)
- human comments and what changed
- native: not executed in this run
