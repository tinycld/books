# expenses-by-vendor — helix run ledger

- mode: unattended
- unit: p5-expenses-by-vendor
- started: 2026-11-21
- package branch: books/p5-expenses-by-vendor (from books main 8520130e)   core checkout: main (9429431)
- spec: docs/specs/expenses-by-vendor-design.md
- checkpoints: docs/plans/expenses-by-vendor-checkpoints.md
- reference: docs/plans/expenses-by-vendor-reference/
- evidence: docs/plans/expenses-by-vendor-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/expenses-by-vendor-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - Each vendor is one plain line with its figure at the right edge → expressible (one group level: Books `vendorGroup()`; core `ReportRow` group row; `display.columns.amount.minWidth: "max-content"`)
  - The grand total is the heaviest line of the page → expressible (core `ReportRow` total row: `border-t-2 border-foreground` + `font-semibold`)

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
- phase 1: design packet generated unattended (staging/p5-expenses-by-vendor/packet.md); no corrections.
- phase 3: design gate 2026-11-21 — human picked direction A (one row per vendor with Total and % of expenses; a vendor opens into its expense lines) and accepted Q1–Q16 as recommended (spec §11). Directions B and C dropped. No core extension.
- phase 3 pass 2 (2026-11-21, unattended): direction A captured. No spark dropped. No reference corrections (unattended; the human's approval of the reference is the driver's).
  - Fixture: `tinycld/books/lib/expenses-by-vendor-fixture.ts` (static `RunResult`s over the seeded vendors of `vendor-form-fixture.ts`: `expensesByVendorResult({ from, to, method, rows, order, vendors, open })`, `emptyExpensesByVendorResult()`; `EXPENSES_BY_VENDOR_PARAMS`, `_COLUMNS`, `_GROUPS`, `_DISPLAY`, `_PHONE_LAYOUT`, `_FILTER_PICK`, `_OPENED`, `_CASH_OPENED`, `_TOTALS`, and the period constants). The lines are local shapes of `books.basis_lines` rows (layer `ledger` or `cash`, debit minus credit). It checks at load: Accrual Total 164,646.50, Cash Total 40,937.00, With activity Total = Accrual Total, Harbor Freight Logistics 1,838.00 (Accrual) and 1,038.00 (Cash), December 2025 Total 0. "Today" is 2026-11-21, fiscal year from January. Edges: a bill with two expense lines, a vendor with only a vendor credit (row and share below zero), vendor credits that lower a vendor, expenses and journal lines with a vendor and with none, a write-off line in No vendor, a line with a blank description, a part-paid bill (Cash), a bill after the period, a bill and its void and a bill a credit cancels (Rows = With activity only), an inactive vendor, a long vendor name, a long account name with no number, a long description, an eight-digit amount, a period whose Total is zero.
  - The fixture has no seed proposal: spec §4 (Q11) gives the seed rows to phase 4, which first reads what the seed already posts.
  - Scratch route: `/a/books/helix-mockup?state=` populated, opened, with-activity, by-amount, filtered, cash, zero, empty, loading, error (`&gate=<px>` replaces the one-line gate for a measure; 0 removes it). Core `ReportView` over a hand-built `ReportViewModel` from core's pure helpers, from the kept A/P Aging model; the model type needed no change. No param-options fake (the model carries the Vendor chip's labels). The toolbar has no Export and no Share, and rows are not links. There is no picker shot: the Vendor picker is core's.
  - Reference: `docs/plans/expenses-by-vendor-reference/` (46 files, light and dark), manifest `docs/plans/expenses-by-vendor-capture.json` (16 shots). Captures run with the files command `tinycld-pkg test:e2e books/tests/e2e/helix-capture.spec.ts`, never `-g helix`. Phone states are shots of their own (`populated-phone`, `opened-phone` at 390 and 375; `cash-phone`, `empty-phone`, `loading-phone`, `error-phone` at 390). The capture spec copy has one run-only addition (`tableMarker`): each capture prints the table's fit marker (`data-fit-width` / `data-layout`), the window size, each heading's width and left edge, the row count, `SIDEWAYS <test id>`, `CUT "<text>"`, and `MORE <px> "<text>"` (the height of label lines the three-line cap hides).
  - Shipping route: core `/a/reports/<id>` (no package sidebar). The scratch route draws the Books sidebar: rows width = window − 324 px at 1024 and wider. So: scratch 1540 = shipping 1280 (rows 1216 px); scratch 1284 = shipping 1024 (rows 960 px); scratch 1028 = shipping 768 (rows 704 px); below 768 the row is the window on both routes.
  - Display block measured: **`oneLine.minWidth: "640px"`**; `name` `whiteSpace: "normal"`, `lineClamp: 3`; `amount`, `pct` `minWidth: "max-content"`; `mobile` layout, 2 tracks (`name` line 1 span 2; `amount`, `pct` line 2). Measure with the gate at 0 (rows of 375, 390, 430, 480, 520, 560, 600, 640, 680, 720, 760 px): the three columns fit one line from 375, but the three-line cap cuts line labels in the `opened` state at every width up to 600 and none from 640; in the `cash` state up to 520 and none from 560. On one line Total is 94 px and % of expenses 118 px at every width from 430. With the gate at 640: 375, 390, 600 and 639 draw the `mobile` arrangement, 640 one line; at 375 and 390 no label and no figure is cut, labels take at most 3 lines; at 320 one label loses one line (the long Bill 1046 label). A shipping window of 768 (rows 704 px) is one line. The value differs from the Sales by Customer's 520 px because a line label here also holds the account.
  - Core behavior seen in the captures, not this report's: on a phone the toolbar title ends in "…" ("Expenses by Vend…") and the chip row (`report-controls`) scrolls sideways; the table never does.
  - For phase 4: on Method = Cash an opened vendor shows more than "one row per posted expense line" (spec §3, Q6): `books.basis_lines` also gives the cash-basis rows of `server/cash_basis.go`. The `cash` shots show them: each bill line, its taken-out row ("Unpaid bill (cash basis)", below zero, on the bill's date), and one row for each payment's share ("Bill payment 317 · … · Bill 1042 paid (cash basis)"); a vendor credit and a write-off have a taken-out row too. The fixture assumes a cash-basis row carries its line's vendor and account and names the entry `cash_basis.go` gives it; phase 4 reads the row shape and pins the labels and the vendor with a Go run. The spec's sentence needs the Cash case added (the rows still add up to the vendor's Total).
  - For phase 4: under Rows = With activity a vendor at 0.00 shows "0.00%" in the fixture (`with-activity` shot: Northwest Paper Co., Zenith Telecom); the Go run decides what `percentOfTotal` gives for a zero row.
- phase 4 (2026-11-21, unattended): plan `docs/plans/expenses-by-vendor-checkpoints.md`, 4 checkpoints (1 report spec, figures and seed; 2 opened vendors, cash rows, live; 3 query plans and scale proof; 4 Reports menu, phone rows, help), 12 e2e tests. `plan-check.mjs --unattended`: 0 errors.
  - Spec amended from the code (no human choice): §3 "Opening a vendor" has the Cash rows and their memos (`server/cash_basis.go`, `server/document_balance.go`) and the ledger line before its take-out row (a last sort key on `layer`, plan D4); §3 "Columns": a vendor at 0.00 under With activity shows 0.00% when the Total is not zero (core `tc_pct`, plan D6); §4 sort names `expenseLineKeys()`; §4 seed and §8 "Where" hold what phase 4 found.
  - Seed (Q11, plan D5): the seed already has expense lines with no vendor and vendor credits that lower a vendor. It gains one posted journal entry on 2026-09-16 on 6200 Software Subscriptions (no 1099 box): debit 96.00 Coastal Coffee Roasters (inactive), debit 184.00 Willamette (long name), credit 280.00 no vendor. It nets to zero, so no statement figure moves. No Expense document is added: it would move a bank or card register.
  - Scale (plan D7): `writeAPDataset` does not change; this report's dataset is that book plus the server's `rebuildCashBasis`. Every scale run is `NEEDS-RUN`.
  - Plan review (`staging/p5-expenses-by-vendor/plan-review.md`): 0 BLOCKER, 4 MAJOR, 9 MINOR, all fixed in the plan. MAJOR: (1) the memos of a vendor credit application and a vendor refund were wrong in D3 and the spec, and had no Go test; (2) e2e test 5 called `filterToVendors` under Non-zero after the void, where the helper times out; (3) `voidPostedEntry` voids a journal entry, not a bill: a new `voidBill` helper; (4) a change of the shared `chooseBalanceOrder` had four callers outside Files: now a new `chooseExpenseOrder`, no shared helper changes. MINOR: test 8's second page; the seed line moved from 6210 (a 1099 account) to 6200; D7 against spec §8 and a wider bulk-equality test; the menu item's key and `hasReport`; the description's spec section; helper signatures and Produces; four narrow tests (non-expense account types, a refund of an expense, All dates, an inactive vendor in the picker; the expense line in e2e test 6); three vague phrases; the phone test's helper.
- review mode switches: none

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
