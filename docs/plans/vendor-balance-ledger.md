# vendor-balance — helix run ledger

- mode: unattended
- unit: p5-vendor-balance
- started: 2026-11-20
- package branch: books/p5-vendor-balance (from books main 9b54d607)   core checkout: main (654110f8)
- spec: docs/specs/vendor-balance-design.md
- checkpoints: docs/plans/vendor-balance-checkpoints.md
- reference: docs/plans/vendor-balance-reference/
- evidence: docs/plans/vendor-balance-evidence/cp<N>/ (built screenshots, capture.json, critique.md); docs/plans/vendor-balance-evidence/perf-plans.md (the query plans of spec §8)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/vendor-balance-capture.json
- review mode: C — none (unattended)
- core extension: none. Every engine feature the report uses has a Books run behind it (the Customer Balance, the A/P Aging). A performance bar of spec §8 that needs a core change stops the run for the human.
- sparks:
  - 1. Each vendor is one plain line with one figure → expressible (Books `vendorGroup()`, `server/report_spec_helpers.go`; core `ReportRow` group row; `display.columns.balance.minWidth: "max-content"`)
  - 2. The grand total is the heaviest line of the page → expressible (core `ReportRow` total row: `border-t-2 border-foreground`, `font-semibold`)

## Deferrals
(none yet)

## Rebuttals
- **finding:** critic (gate 2 "For gate 3"), checkpoint 1: "The Vendor and Balance column headers show sort arrows. The report also has the Order param, and the spec requires "No vendor" "after every vendor under both Order choices". Check that a header sort does not move the No vendor row above a vendor, or that the two sort controls do not disagree."
  **rebutted because:** the spec bar is on the Order param: "after every vendor under both Order choices" (spec §3, No vendor), and Order is "**Name** (default …) or **Largest balance**" (spec §3, Params). Both choices are pinned by `TestVendorBalanceNoVendor` ("after every vendor row and directly before the Total, under `order` = `name` and under `order` = `balance`"). The heading sort is core's report view on every report (`tinycld/core/reports/components/ReportTable.tsx:137`, `report-sort-${column.id}`, `useHeadingSort`), the same on the Customer Balance and the A/P Aging, and plan D9 makes core's view behavior core-owned. A heading sort is a sort the user chose, not an Order choice.

## Design notes
- cp 1 · populated-768 (light, dark): toolbar — the page title is cut to "Vendor Balan…" beside the five toolbar buttons (core's report view; the full title is in the document header below it). A fix moves a toolbar action into More at this width, a core change.
- cp 1 · reviewer A: `tinycld/books/seed.ts` `seedVendorBalance` — if the second entry's post throws, Old Town Print Shop stays active (no try/finally); the same as the model `seedCustomerBalance`; a seed failure stops the whole seed.
- cp 1 · reviewer A: spec §4 still names `vendorGroup()` with `hideEmpty`; the code clears it on the one level because core refuses hideEmpty on the last level (the settled dispute of checkpoint 1). The behavior is the same; the spec line is stale.
- cp 1 · reviewer A: `tests/e2e/books-vendor-balance.spec.ts` test 3 — the last wait ("no group row") is also true for a moment while the table is empty; it is safe because the Non-zero run's response is awaited first. A stronger proof would also wait for the new run's state.
- cp 1 · reviewer A: `tinycld/books/seed.ts` — `instanceof ClientResponseError` needs the seed and the client to share one `pocketbase` module; the hoisted workspace makes it so.
- cp 2 · opened-768 (light, dark): toolbar — the page title is cut to "Vendor Balan…" beside the five toolbar buttons (the same as cp 1's populated-768; core's report view, D9; the document header shows the full title).
- cp 2 · reviewer A: `server/report_spec_helpers.go` `balanceDetailLabel()` — a line whose memo and entry memo are both empty gets a label that ends in a bare separator ("2026-10-01 · Bill 1001 · "). The spec template does not say what an empty description shows, and the helper is shared with the Customer Balance, whose JSON is frozen (spec §10, Q10). A fix needs the human's decision (a Vendor Balance-only label, or a change to both reports).
- cp 2 · reviewer A: `server/report_vendor_balance_test.go` `TestVendorBalanceDetail` — the loop that checks a wanted label names its document's number cannot fail (`apNo` and `vbLineWant` read the same entry number). The real cross-check is e2e 4, 5 and 6, which compare the label with the number the UI shows.
- cp 2 · reviewer A: `docs/plans/vendor-balance-evidence/cp2/capture.json` opens its rows by `clickText` ("No vendor", "Harbor Freight Logistics"), not by test id (lesson 13); the shots show the right rows open, so the evidence is valid.

## Out-of-plan changes
- `docs/plans/vendor-balance-evidence/cp1/capture.json`, the cp1 screenshots and `critique.md`: gate-2 evidence. The Files block does not name them; the plan rule "Captures" names `docs/plans/vendor-balance-evidence/cp<N>/capture.json` (reviewer B finding 1, reviewer A NOTE).
- `docs/plans/vendor-balance-ledger.md`: written by the loop (the runner), by no agent (reviewer B finding 2).
- `docs/plans/vendor-balance-evidence/cp2/capture.json`, the six cp2 `opened-*` screenshots and `critique.md`: gate-2 evidence of checkpoint 2 (reviewer B finding 1), as for cp 1.
- `server/report_export_helpers_test.go` (new), `server/report_ap_aging_test.go`, `server/report_ar_aging_test.go` (cp 2 fix round 1, reviewer B finding 2): `exportVBCSV` was a copy of `exportAPCSV` and `exportARCSVErr`; one shared test helper (`exportShippedCSV`, `exportShippedCSVErr`) now holds the export request and its checks, and the four helpers are wrappers with unchanged signatures (lesson 10: move every caller to a new helper). No caller and no assertion changed.

## Performance
(none yet — the measured results of spec §8, on the engine with p5-report-engine-scale merged)
- cp 3 (engine: this branch, before p5-report-engine-scale; macOS dev machine; 2026-11-20; on dc06c23a + the uncommitted cp 3 test files): the query-plan bar "no step is a SCAN of a large table" fails in every run 1 to 7 (`MATERIALIZE w` → `SCAN books_journal_lines`). L not measured. S medians, median of 5 after one warm-up, no index added (an implementer probe, not the scale test): run 1 97.6 ms, 2 60.1, 3 99.1, 4 97.7, 5 55.2, 6 240.0, 7 473.3. Index added: none (a tried expression index was removed, see Checkpoint 3). The run stopped: see Checkpoint 3.

## Phase notes
- phase 1: no corrections to the extractions. The packet was built on `books/p5-ap-aging`@edcdcff2; books PR #80 merged before the gate, so the branch starts from books main 9b54d607.
- design gate (human, 2026-11-20): approved. Direction **A** (ledger lines under each vendor, on `books.journal_lines`). Q1 to Q10 of the packet as recommended:
  - Q1: direction A; not B (open bills with Due date), not C (Billed / Paid / Balance columns).
  - Q2: the balance is the ledger: posted Accounts payable lines that name the vendor, credits minus debits, on or before the day; positive = the business owes it.
  - Q3: an opened vendor shows one row per posted line, "<date> · <type> <number> · <description>", in the one Balance column; no running balance, no Due date; an applied vendor credit has no row.
  - Q4: a "No vendor" row, last under both Order choices.
  - Q5: As of default Today; Rows = Non-zero or With activity; Vendor filter; Order = Name or Largest balance; an inactive vendor muted with " (inactive)".
  - Q6: one report, titled "Vendor Balance".
  - Q7: entry points are the Vendors list's Reports menu (item above A/P Aging) and the Reports hub; no link from the vendor page or Pay bills.
  - Q8: performance acceptance on the A/P Aging's S and L datasets, the seven runs of spec §8; no such test for the Customer Balance in this unit.
  - Q9: seed additions accepted (one posted Accounts payable journal entry with no name, one that names an inactive seeded vendor, fixed 2026 dates), after the grep of spec §4.
  - Q10: the Customer Balance's params, Rows condition, line keys, detail label and display block become shared helpers; its JSON and Revision do not change.
  - Q11: moot (books PR #80 merged; branch from main 9b54d607).
  - Q12 (driver): p2-statements (lane reports, in build) shares `shipped-reports.ts`, `register.go`, `registrations_test.go`, `report_spec_helpers.go`, `seed.ts`, `help/reports.md`, `help-reports.test.ts`; the unit that merges second keeps both sides; this unit only adds new helpers to `report_spec_helpers.go`.
  - Q13 (driver): p5-report-engine-scale (lane purchases) merges first; this unit merges after it, keeps both sides, measures performance on the merged engine, and reads again the Balance Sheet and Trial Balance figures that the Q9 seed moves, at integration.
- spec: moved from the staging draft to docs/specs/vendor-balance-design.md with the answers (§11) and the merge order (§9); self-review run again. One ambiguity fixed: the payables bulk writer moves to `server/report_scale_harness_test.go` (was "when the new test needs it").
- phase 3: direction A picked at the design gate; no spark dropped.
- phase 3 pass 2 (2026-11-20): direction A captured. No spark dropped. No human corrections (unattended).
  - Fixture: `tinycld/books/lib/vendor-balance-fixture.ts` (static `RunResult`s over the seeded vendors of `vendor-form-fixture.ts`: `vendorBalanceResult({ rows, order, vendors, open, asOf })`, `emptyVendorBalanceResult()`; `VENDOR_BALANCE_PARAMS`, `VENDOR_BALANCE_COLUMNS`, `VENDOR_BALANCE_GROUPS`, `VENDOR_BALANCE_DISPLAY`, `VENDOR_BALANCE_FILTER_PICK`, `VENDOR_BALANCE_OPENED`, `VENDOR_BALANCE_EMPTY_DAY`, and `VENDOR_BALANCE_SEED` for the Q9 seed rows). One level (vendor), no subtotal rows; the lines are local shapes (posted Accounts payable lines, credit minus debit). "Today" is 2026-11-20; one line is dated after it and is not in a run. Edges: a part payment, an unapplied vendor credit (negative balance), a credit applied in part (no row) and refunded in part, one payment of two bills, a paid-off vendor and a vendor whose bill a credit cancels (Rows = With activity only), journal lines with a vendor and with none, an inactive vendor, a long name, a long description, a six-figure amount.
  - `VENDOR_BALANCE_SEED` is a proposal, not wired: a posted journal entry on Accounts payable (2100) with no name (2026-10-05, 75.00, other side 6200) and one that names the inactive Old Town Print Shop (2026-10-08, 216.00, other side 6200). Phase 4 checks the accounts, days and amounts against the tests that read the seeded Accounts payable figure (spec §4, Q9) and may change the rows.
  - Scratch route: `/a/books/helix-mockup?state=` populated, opened, with-activity, by-balance, filtered, empty, loading, error (core `ReportView` over a hand-built `ReportViewModel` from core's pure helpers, from the kept A/P Aging model; no param-options fake, because the model carries the Vendor chip's labels). The toolbar has no Export and no Share (a hand-built model of a shipped report for a reader). There is no picker shot: the Vendor picker is core's, as in the A/P Aging reference.
  - Reference: `docs/plans/vendor-balance-reference/` (38 files, light and dark), manifest `docs/plans/vendor-balance-capture.json` (13 shots). Captures run with the files command `tinycld-pkg test:e2e books/tests/e2e/helix-capture.spec.ts`, never `-g helix`. Phone states are shots of their own (`populated-phone`, `opened-phone` at 390 and 375; `empty-phone`, `loading-phone`, `error-phone` at 390), so each page loads at its width. The capture spec copy has one run-only addition (`tableMarker`, written again from the A/P Aging run's description): each capture prints the table's fit marker, the window size, each heading's width and place, `SIDEWAYS <test id>`, `CUT "<text>"`, and `MORE <px>` (the height of label lines the three-line cap hides).
  - Shipping route: core `/a/reports/<id>` (no package sidebar). The scratch route draws the Books sidebar: rows width = window − 324 px at 1024 and wider (the A/P Aging ledger has the measure of the shipping route). So: scratch 1540 = shipping 1280 (rows 1216 px); scratch 1284 = shipping 1024 (rows 960 px); scratch 1028 = shipping 768 (rows 704 px); 375 and 390 are the same on both routes.
  - Display block measured: **the Customer Balance's block fits with no change**, so `balanceDisplay()` serves both reports and `VENDOR_BALANCE_DISPLAY` holds the same values. The report is on one line at every width (measured at rows of 1216, 960, 836, 768, 704, 700, 640, 628, 529, 390, 375 and 320 px; core's marker says `one-line` at each). The Balance column is 118 px at every width (the widest figure is 130,115.25; the Total is $148,355.25) and 104 px in `filtered`. The Vendor column is 272 px at 390, 257 px at 375, 202 px at 320. No capture has a `CUT` mark: no figure is cut at 375 or 390.
    - Row heights: a row with a one-line or two-line label is 44 px; a three-line label makes it 64 px. At rows of 704 px the long vendor name takes two lines and a long line label three. On a phone the long vendor name takes three lines, " (inactive)" wraps to a second line, and most line labels take two lines.
    - The three-line cap cuts one label on a phone: "2026-01-01 · Journal entry JE-41 · Opening balance carried from the previous bookkeeping system, cleaning contract year 2025" ends in "…" (one line hidden at 390, two at 375). This is the spec's cap (`lineClamp: 3`), as in the Customer Balance.
    - The one `SIDEWAYS` mark, at 390 and 375, is core's chip strip (`report-controls`), which every core report has on a phone (four chips here).
  - Shot heights (the manifest): 1060 for 14 one-line rows and the Total; 1480 for `opened` (23 rows, some 64 px); 1260 for `with-activity` (18 rows); 1100 and 1560 for the phone shots. The measure shots are in the lane staging folder (`p3-measure/`, manifest `p3-measure.json`; logs `p3-capture-1.log`, `p3-capture-2.log`), not in the repo.
- phase 4 (2026-11-20): plan of 4 checkpoints (1 report for readers, 2 opened rows, 3 scale proof, 4 Reports menu, phone rows, help); plan-check 0 errors; review mode C (unattended). Plan review: 1 blocker, 3 major, 11 minor; each one fixed in the plan (report in the lane staging folder, `plan-review.md`).
  - F1 (blocker), F10: `VENDOR_BALANCE_SEED` named the payable account by the number 2100, which is Company Card in the seed chart; the seed chart has no Accounts payable account (the server makes it, number 2000, on the first bill post). `payableNumber` is removed from the fixture; `seedVendorBalance` reads the account by its type. The seed grep was made again for the right accounts (Accounts payable, 6200, "No vendor", Total Expenses, Net income, Old Town Print Shop): no test pins a figure that moves (plan D2 has each hit). The seeded A/P Aging gains a "No vendor" row and an "Old Town Print Shop (inactive)" row.
  - F4: the seed's line objects carry `customer: ''` (`SeedJournalLine.customer` is required).
  - F5 to F8: the run helper's model is `runAPErr`; `emptyDay` is in the shared case file and read by `vbEmptyDay`; the "not Accounts payable" assertion is named; the three runs of the agreement test get one `asOf`.
  - F2, F3, F12: e2e 4 names its viewport (1280, own-screen path); the Live causes that e2e does not drive are named with their Go test; the two-page precedent is worded as it is.
  - F9, F11, F13, F14, F15: core files cited for More and Customize; why `vendorBalanceCsv` does not call `withoutLineRecords`; the move takes its imports; run 1 is compared for vendors with a non-zero total; checkpoint 3 has a Size note (about 600 lines are a pure move).
  - Rejected: none.
- review mode switches: none

## Checkpoint 1
- test writer: server/report_vendor_balance_test.go, server/testdata/vendor_balance_spec.json, tests/vendor-balance-fixture.test.ts, tests/seed-node.test.ts (describe seedVendorBalance), tests/e2e/books-vendor-balance.spec.ts, tests/e2e/vendor-balance-helpers.ts; red for the right reason: yes (13 Go, 4 seed vitest, 3 e2e; the fixture vitest green from the start and proved able to fail with a changed copy of the JSON); untestable: none
- test disputes: TestVendorBalanceSpecLoads — the Tests bullet says the `byVendor` group has `HideEmpty` set; core refuses hideEmpty on the last level (`tinycld/core/server/reports/bind.go:851`, "the last level has no child groups to be empty of"). Resolution (runner): the test as written (HideEmpty false) is right and `vbGroup()` clears `HideEmpty`. Settled by the plan's core gap rule: "A different way to write the same report with what core has is allowed"; on a one-level report a group exists only when it has lines, so nothing is lost. Not a core gap.
- implementer: Do 1 to 8 built (shared balance helpers, Customer Balance extraction D4, `report_vendor_balance.go`, registration, `seedVendorBalance` with its call after `seedApAging`); DONE. The first implementer's report came late (it was still running when the runner was told it had ended); a second dispatch found the tree complete, made no edit, and merged both reports into cp1-impl.md. `server/registrations_test.go` and the fixture not touched.
- self-declared differences: (1) `vbGroup()` sets `HideEmpty = false` (the settled dispute above); (2) `seedVendorBalance` reads the 6200 account of both entries before the first post, so a missing account writes nothing (same error text); (3) three private seed helpers (`payableAccountId`, `vendorBalanceOther`, `postVendorBalanceEntry`), modelled on `postCustomerBalanceEntry`.
- gate 1: tests unedited: yes · `go test ./...` ok · `packages:generate` then `tinycld-pkg check` exit 0 (399 files, 8423 tests) · implementer e2e of books-vendor-balance.spec.ts 3/3 · the Do 9 e2e list of 9 files (run by the driver): pass, 58 passed · pass
- gate 2 capture: lessons that apply: 9 (one snapshot), 13 (a page loaded at each width), 21 (phone report display), 24 (seed ids, seed run once), 31 (drop focus on `report-document-period`), 33 (e2e months). Manifest `evidence/cp1/capture.json` (8 shots, light and dark, built through the Reports hub). First capture: the `empty` shot failed on an action the capture spec does not have (`waitForTextIn`); the manifest now waits for the text "As of January 1, 2020"; second capture 6/6. The built `populated` shows "Old Town Print Shop (inactive)" muted and "No vendor" directly above the Total.
- gate 2: invalid shots: none · blocking: none · notes: 1, listed under Design notes · "For gate 3": 1 (heading sort vs Order), rebutted (see Rebuttals)
- gate 3 A (correctness): 0 BLOCK, 5 NOTE; no fix; 4 NOTEs to Design notes, 1 (out-of-plan files) recorded under Out-of-plan changes
- gate 3 B (conformance): script lines: 0 real, 1 false positive (`tests/seed-node.test.ts` `new PocketBase(...)` in a vitest seed stand-in, used only for `sdk.filter`) · findings: 2 (capture.json and the ledger outside the Files block), each recorded under Out-of-plan changes, no code change
- fix review: n/a (no accepted finding, no fix round; 0 rounds)
- gate 3 A notes: 4, listed under Design notes
- reviewer-caught deferrals: none
- commit: the commit "feat(books): Vendor Balance report for readers" (this ledger row is in it)
- human: none (review mode C)

## Checkpoint 2
- test writer: server/report_vendor_balance_test.go (TestVendorBalanceDetail, TestVendorBalanceCSVOpensEveryGroup, TestVendorBalanceSpecLoads and TestVendorBalanceTopics extended; `vbRunOpen`, `vbLinesUnder`, `exportVBCSV`), tests/e2e/books-vendor-balance.spec.ts (e2e 4 to 8), tests/e2e/vendor-balance-helpers.ts (`vendorBalanceCsv`); red for the right reason: yes for the Detail, SpecLoads and CSV Go tests (core's firstLabel, no Open) and e2e 4, 5, 6, 8 (lines not found by label; line records left in the CSV). Not red: e2e 7 (allowed by Do step 0) and TestVendorBalanceTopics — checkpoint 1's sort already holds `balanceLineKeys()` (`entry.posted_at`), so an opened run already has the `collection/books_journal_entries` topic; the assertion is as the bullet says and fails if the topic is dropped. untestable: none
- implementer: one line, `Detail: &reports.Detail{Label: balanceDetailLabel(), Open: entryOpenPath()}` in `vendorBalanceSpec()` before `Display` (`server/report_vendor_balance.go`); the opened rows were already in the spec's order (no core gap); DONE
- test disputes: none
- self-declared differences: none
- gate 1: tests unedited: yes · `go test ./...` ok · `packages:generate` then `tinycld-pkg check` exit 0 (1901 files, 8423 tests) · e2e books-vendor-balance.spec.ts 8/8 · pass. After fix round 1: `go test ./...` ok, check exit 0 (1902 files, 8423 tests), e2e 8/8 · pass
- gate 2 capture: lessons that apply: 9 (one snapshot), 13 (a page loaded at each width), 24 (seeded rows reached through the UI by name), 31 (drop focus on `report-document-period`). Manifest `evidence/cp2/capture.json` (`opened` at 1280, 1024, 768, light and dark; through the Reports hub; "No vendor" then "Harbor Freight Logistics" opened); one capture, 1 passed.
- gate 2: invalid shots: none · blocking: none · notes: 2 (opened-768 light and dark, the cut title), listed under Design notes · "For gate 3": none
- gate 3 A (correctness): 0 BLOCK, 4 NOTE: NOTE 3 (e2e 5 checks only the payment line) accepted with reviewer B finding 3 and fixed; NOTEs 1, 2, 4 to Design notes
- gate 3 B (conformance): script lines: 0 · findings: 3 — 1 (cp2 evidence outside the Files block) recorded under Out-of-plan changes; 2 (`exportVBCSV` copies `exportAPCSV`/`exportARCSVErr`) accepted+fixed by a test-writer dispatch (shared `exportShippedCSV`, out-of-plan files recorded); 3 (e2e 5 does not pin the vendor's two lines) accepted+fixed by the same dispatch (`[90000, -35000]`)
- fix review: n/a — round 1 (`cp2-fix-r1.md`, 2 items: causes mirror, weak-test) touched test code only (test writer), no non-test source, so no fix review and no re-capture; 1 fix round, 0 fix-review rounds
- gate 3 A notes: 3, listed under Design notes
- reviewer-caught deferrals: none
- commit: the commit "feat(books): open a Vendor Balance vendor into its posted lines" (this ledger row is in it)
- human: none (review mode C)

## Checkpoint 3 — STOPPED: core SQL fails a performance bar
- test writer: server/report_scale_harness_test.go (the payables bulk writer moved in, D13), server/report_ap_aging_scale_test.go (moved code out, `writeAPAgingDataset`, its four tests call it, no assertion changed; `go test -run 'TestAPAging'` ok; `git diff --color-moved` shows the move), server/report_vendor_balance_scale_test.go (new: `TestVendorBalanceQueryPlans`, `TestVendorBalanceRunsAgreeWithSmallBook`, `TestVendorBalanceScale`); red for the right reason: yes (`TestVendorBalanceQueryPlans`: no `testdata/vendor_balance_stat1.json`; `TestVendorBalanceRunsAgreeWithSmallBook` green on the real report and red under `go test -overlay` with `vbNet` = debit − credit; `TestVendorBalanceScale` skipped without `BOOKS_SCALE=1`); untestable: none. The first test-writer dispatch ended on an API usage limit in the middle of the move; a second dispatch checked the appended block against the A/P file (only `apLargeTables` kept in place and D13's three lines differ) and finished it. Reports `cp3-tests.md`.
- test writer finding: with no statistics, every run 1 to 7 fails the bar `step "SCAN books_journal_lines" scans books_journal_lines or books_journal_entries (each must be read by SEARCH)` (18 failures, the same bar).
- implementer: STOPPED (Performance rule). No repo change. Report `cp3-impl.md`.
  - **Statement** (run 1, statement 4; the same in runs 1 to 7): `w AS MATERIALIZED (SELECT … FROM r0 t1 LEFT JOIN r1 t2 ON t2.id = t1.vendor LEFT JOIN r2 t3 ON t3.id = t1.account WHERE ((t1.posted IS true) AND (NULLIF(t3.type, '') IS 'accounts_payable') AND (NULLIF(substr(t1.date, 1, 10), '') <= ?)))`.
  - **Plan** (no statistics and after ANALYZE): `MATERIALIZE w` · `SCAN books_journal_lines` · `SEARCH books_vendors … LEFT-JOIN` · `SEARCH books_accounts … LEFT-JOIN`.
  - **Why no index fixes it:** core writes `eq` as `IS` (`tinycld/core/server/reports/formula.go:859`, checked by the runner) and joins a relation field by `LEFT JOIN` (`stmt.go:310`, `:378`). `IS` is not null-rejecting, so SQLite keeps the LEFT JOIN and `books_journal_lines` is the outer loop; the existing `idx_books_jlines_account_date (account, date)` cannot be reached through the account. `posted IS true` is a truth test no index serves (an index `(posted, account, vendor, date)` left the SCAN). The only usable index, an expression index on `NULLIF(substr(date, 1, 10), '')` (core `fieldSQL`, `stmt.go:262-271`), tried as `pb-migrations/2100000033_index_books_journal_lines_date.js`: passes with no statistics, but after ANALYZE runs 1, 3, 4, 5, 6, 7 return to `SCAN books_journal_lines` (on the default day every line is on or before As of) and every S median is slower (130/68/131/130/83/346/578 ms). Removed; a copy is in the lane cp folder.
  - **Time:** S medians above (Performance). L not measured.
  - **Core change that would fix it:** a required to-one relation filter written null-rejecting (`=` or an inner join) and `posted = 1` for a boolean `eq true`; then `idx_books_jlines_account_date` serves the read with no Books index. The Customer Balance (`receivableLines`, the same shape) has the same plan; it has no scale test (Q8).
- open question for the human: is this fixed by p5-report-engine-scale (Q13; the results of record are on that engine), by a core task, or does checkpoint 3 wait for that merge? Plan D14 has checkpoint 3 prove the bars on this branch's engine first.
- the checkpoint's code is in the tree, staged and not committed: the three test files above. Gate 1, gate 3: not run. Commit: this ledger alone.
- also seen (checkpoint 2's area, not acted on): run 6 of the small book labels a void reversal line "2022-11-08 · Void reversal of 1076 1076 · Void of 1076" (the number is in the type label and again as the number; `cp3-tests-dump.txt` line 23).

## Final review
- eval: (unattended only) approved | revised → <notes, fix sha> | stopped
- human comments and what changed
- native: not executed in this run
