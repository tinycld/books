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
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
(none yet — gate-2 NOTEs the loop did not act on, as
`cp N · <shot>: <where> — <what>`; shown to the human at each checkpoint
and again at the end)

## Out-of-plan changes
(none yet — every file touched that no checkpoint's Files block named, with why)

## Performance
(none yet — the measured results of spec §8, on the engine with p5-report-engine-scale merged)

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

## Final review
- eval: (unattended only) approved | revised → <notes, fix sha> | stopped
- human comments and what changed
- native: not executed in this run
