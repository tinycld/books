# ap-aging — helix run ledger

- mode: unattended
- unit: p5-ap-aging
- started: 2026-11-19
- package branch: books/p5-ap-aging (from books main 81f3a72d)   core checkout: main (3981e9b4)
- spec: docs/specs/ap-aging-design.md
- checkpoints: docs/plans/ap-aging-checkpoints.md
- reference: docs/plans/ap-aging-reference/
- evidence: docs/plans/ap-aging-evidence/cp<N>/ (built screenshots, capture.json, critique.md); docs/plans/ap-aging-evidence/perf-plans.md (the query plans of spec §9)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/ap-aging-capture.json
- review mode: C — none (unattended)
- core extension: none planned. Every engine feature the report uses has a Books run behind it (the A/R Aging, the Customer Balance). A core gap that a run shows becomes a core checkpoint 0 (human's rule, 2026-11-01), and the driver brings it to the human first.
- sparks:
  - 1. How late money is reads from where the figure sits: one column per age, older to the right → expressible (Books `agingColumns(age, net)`, `server/report_spec_helpers.go`; core `ReportTable`)
  - 2. An age with no money is blank, so the eye lands on the figures that exist → expressible (Books `blankZero()` inside `agingColumns`)
  - 3. The grand total is the heaviest line → expressible (core `ReportRow` total row)

## Deferrals
(none yet)

## Rebuttals
(every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)
- **finding:** reviewer B, checkpoint 3, DEFERRAL 1: "`server/report_ap_aging_test.go` `TestAPAgingTopics`. Agreed (brief): the run's topics are "exactly" `collection/books_payable_items`, `collection/books_vendors`, `collection/books_settings`. Exists: the test checks that the three are present and that no other `collection/books_*` topic but `books_admins` is present."
  **rebutted because:** not a deferral: nothing the spec asks is missing. The spec's Live bullet asks that "a post or a void … re-runs an open report. The run's topics are `collection/books_payable_items`, `collection/books_vendors` and `collection/books_settings`", and each of the three is asserted. Core adds the topics of each access-rule CTE a run reads (`tinycld/core/server/reports/run.go` lines 309-311, "ruleTopics holds the topics of each rule CTE select the run read"), and the read rule of spec §4.1 brings `books_admins`, `org_pkg_access` and `users`, as for every Books report (memory p5-trial-balance: "the books_journal_lines rule makes a run's topics include books_admins, org_pkg_access and users"; `TestARAgingTopics`, `server/report_ar_aging_test.go` line 1274, uses `slices.Contains`). The checkpoint's word "exactly" was a plan defect, settled as a test dispute (Checkpoint 3, test disputes).

## Design notes
(gate-2 NOTEs as `cp N · <shot>: <where> — <what>`; reviewer NOTEs as `cp N · reviewer <X> NOTE: <where> — <what>`; shown to the human at the end)
- cp 1 · reviewer A NOTE: `server/open_items_test.go` — `registerWriteGuard` is not exercised on the second test table (no collection backs `zz_open_items`); checkpoint 2's REST-refusal test on `books_payable_items` covers it.
- cp 1 · reviewer A NOTE: `server/open_items.go` `registerWriteGuard` — `refuse("%s", t.ReadOnly)` in place of `refuse(msgReceivableItemsReadOnly)` (implementer's declared difference 1): `refuse` takes a format string and `go vet` refuses a non-constant one; the message text is the same.
- cp 2 · reviewer A NOTE: `server/payable_refresh.go` `refreshPayableBill` with `server/document_balance.go` `saveDocumentBalance` — each balance save of a bill runs the bill refresh and its entry refresh, so a Pay bills payment of N bills runs N bill and N entry refreshes before the payment's own refresh. Correct and repeated; the plan asks for it (Do step 3) and the receivable side does the same. No checkpoint 4 bar times a post; if one is added, skip the entry refresh when only `balance` changed.
- cp 3 · opened-1024: item row "Vendor credit 1006" — the label wraps to 2 lines in the Vendor column (the reference wraps the same way; inside the three-line cap).
- cp 3 · item-opened-1024: the 3 lines under the bill — each label wraps to 2 or 3 lines with almost no gap between the wrapped rows, so the lines read as one text block (the reference has the same density; the three-line cap holds).
- cp 3 · reviewer A NOTE: `server/report_ap_aging.go` sort, `server/report_spec_helpers.go` `vendorSort` — two items of one vendor with the same `due` and `itemNo` (two Accounts payable lines of one manual journal entry for the same vendor) have no inner key between them, so their order can change when Order changes (the balance key reads each item's own sum under Largest balance, 0 under Name). No spec bullet breaks ("Items are in due-date order, oldest first, then by number"); D7 sets the keys. Possible fix: `col("itemKey")` after `col("itemNo")`.
- cp 4 · reviewer A NOTE and reviewer B finding 3: spec §9's dataset table cannot hold at once — 10,000 bills with 9,000 bill payment lines leave about 850 or more open items, against "about 800". The scale dataset writes 9,700 / 97,000 bills (3 % under, inside the 5 % tolerance of `arWithin`); every other count is within 5 % and journal lines are exact. The human decides whether spec §9's table is corrected.
- cp 4 · reviewer A NOTE: `server/report_ap_aging_scale_test.go` `TestAPAgingBulkWriterMatchesPosters` — the poster comparison has no void bill, void bill payment or reversal entry, though the S and L datasets write 100 / 1,000 of each; the columns of those rows are not compared with the real void path. The brief lists the six documents the test posts. Possible fix: post and void one bill and one bill payment in both apps.
- cp 4 · reviewer A NOTE: `server/report_scale_harness_test.go` — the "move with no change of body" changed three bodies to take parameters: `finish` flushes the tables in sorted name order, `lines` writes `l.vendor`, `newARWriter` takes the column map and the doc types. No A/R assertion changed.
- cp 4 · reviewer A NOTE: the brief's `TestAPAgingQueryPlans` bullet says "no temporary B-tree over a large table"; `checkPlanBars` has no such check and the L plans hold `USE TEMP B-TREE FOR GROUP BY/ORDER BY` steps. The A/R spec §9 (`docs/specs/ar-aging-design.md` line 168), which spec §9 of this report adopts, permits them; the code follows the spec and the plan's text is wrong.
- cp 5 · populated-phone-390: rows Harbor Freight Logistics and Pacific Power — the Total is on the label line for a vendor whose money is only in a later age and on the second line for the others (core's wrap of empty tracks, rule H7; the reference shows the same).
- cp 5 · item-opened-phone-390/375: the lines under Bill 1010 — the labels "2026-10-20 · Vendor credit 1006" and "2026-11-04 · Bill payment 1003" wrap to two lines (four-digit numbers of the seeded book) and the gap to the next line's label is small, so the three lines read crowded. Nothing is cut.
- cp 5 · vendors-menu-390: the Reports sheet's item "A/P Aging" starts at about x=50 and the sheet title at x=20 (the empty icon slot of the shared menu item; the Customers list's menu is the same component).
- cp 5 · vendors-menu-390: the "New" FAB shows as a cut half-circle behind the scrim, above the sheet's close button; in dark it is the brightest object outside the sheet (core FAB and Sheet).
- cp 5 · reviewer A NOTE: `tests/e2e/books-ap-aging.spec.ts` test 1, not-found half — `vendors-reports` count 0 cannot tell `headerAction={undefined}` from a `ShippedReportsMenu` that renders null (`ShippedReportsMenu.tsx:30-31`); the `hasReport` guard in `VendorsList.tsx` is correct but unpinned. Pinning it needs a test id on `RecordListFrame`'s `HeaderButtons`.
- cp 5 · reviewer A NOTE: `tests/e2e/ar-aging-helpers.ts:416` — `expectAgingLinesFit`'s poll message names "the A/R Aging rows" also for the A/P phone tests; the plan forbids edits to that helper in this unit.
- cp 5 · fix reviewer NOTE: `tests/e2e/books-ap-aging.spec.ts:337` — the reader proof `vendor-new-header` count 0 can pass before access is ready (`lib/access.ts:23` gives `canWrite: false` until then), so it proves a reader page only if the list waits for access. Possible fix: assert a reader-only sign drawn after access is ready (the reader copy of `vendorListCopy(false)`).

## Out-of-plan changes
(none yet — every file touched that no checkpoint's Files block named, with why)

## Phase notes
- phase 1: no corrections. The human approved the design packet on 2026-11-19 (design gate): the inventory, the proposed cuts and the three sparks as written. Platform-only items: none new.
- phase 2: the human accepted open questions Q1–Q10 of the packet as recommended, and two driver questions (Q11, Q12). The answers are in spec §11.
  - Q1 direction: A (one report; a vendor opens into its open items).
  - Q2: every answer given for the A/R Aging on 2026-11-18 applies (age from the due date; fixed periods Current, 1 - 30, 31 - 60, 61 - 90, 91 and over; a credit is negative in the column of its own date's age; As of defaults to Today; vendor → items → lines → document; blank empty age cells; Order Name or Largest balance; inactive vendor muted with " (inactive)"; title "A/P Aging"; the A/R Aging's phone arrangement).
  - Q3: open items from the ledger (bills, vendor credits, journal entry lines on Accounts payable); a bill payment and a vendor refund are never items.
  - Q4: what the business owes is positive; a vendor credit is negative.
  - Q5: a removed vendor credit application reads as never applied, on past days too.
  - Q6: a table of its own (`books_payable_items`) and one engine (`server/open_items.go`) for both tables.
  - Q7: a "No vendor" row, last.
  - Q8: a new Reports menu on the Vendors list with "A/P Aging", and the Reports hub; no link from Pay bills or the vendor page.
  - Q9: the A/R Aging's performance acceptance, with a payables dataset (spec §9).
  - Q10: the seed additions, after a grep of the tests that read the changed figures.
  - Q11 (driver): p2-apply-credit (lane reports) owns the receivable SQL, refresh, verify and rebuild, and merges first. This unit's phase 4 plan is written only after p2-apply-credit merges, and extracts `server/open_items.go` from that merged receivable code. If it has not merged when phase 4 is due, the unit waits. Migration: the next free number at plan time (2100000031 on 2026-11-19; main ends at 2100000030).
  - Q12 (driver): p5-report-engine-scale (lane purchases) merges first. This unit merges after it, keeps both sides of the shared files (`server/balances.go`, `server/report_sources.go` and its test, `help/reports.md`), and measures performance on the merged engine.
- phase 2, spec changes at approval (self-review): §4.4 names the display block `apDisplay()` (it returns `agingDisplay()` unless phase 3 pass 2 measures a width that needs this report's own value); §4.2 no longer pins the A/R Aging's Revision number, because p2-apply-credit merges first; §10 (merge order) and §11 (decisions) are new.
- phase 3: direction A picked (Q1).
- phase 3 pass 2 (2026-11-19): direction A captured. No spark dropped. No human corrections (unattended).
  - Fixture: `tinycld/books/lib/ap-aging-fixture.ts` (static `RunResult`s over the seeded vendors of `vendor-form-fixture.ts`: `apAgingResult({ order, vendors, open, openItems, asOf })`, `emptyApAgingResult()`; `AP_AGING_PARAMS`, `AP_AGING_COLUMNS`, `AP_AGING_GROUPS`, `AP_AGING_DISPLAY`, `AP_AGING_FILTER_PICK`, `AP_AGING_OPENED`, `AP_AGING_PAST_DAY`, `AP_AGING_EMPTY_DAY`, and `AP_AGING_SEED` for the Q10 seed rows). The open items are local shapes: no client collection backs `books_payable_items` (spec §4.5). Two levels (vendor, item), no subtotal rows. The `due` result column carries `blankAbove: true`, as the engine sets it for a `blankAbove` column.
  - `AP_AGING_SEED` is a proposal, not wired: a bill of Harbor Freight Logistics (2026-08-20, due 2026-09-19, 860.00, account 6200), a part payment of 150.00 on the seeded bill with the memo "Seed bill open" (Pacific Power, 2026-11-04, check 1061 from 1000), and a vendor credit of Harbor Freight Logistics (2026-10-06, 200.00) with 120.00 applied to the new bill on 2026-10-20. The seeded book already has a part-paid bill (Office Supply World), two open Pacific Power bills and a credit applied in part (Ironclad credit 1002). Phase 4 checks the vendors, accounts and days against the specs that read them (spec §4.5) and may change the rows.
  - Scratch route: `/a/books/helix-mockup?state=` populated, opened, item-opened, by-balance, filtered, past-day, empty, loading, error (core `ReportView` over a hand-built `ReportViewModel` from core's pure helpers; no param-options fake is needed, because the model carries the Vendor chip's labels); `&gate=<px>` sets the one-line width for a measure (0: no gate). The toolbar has no Export and no Share (a hand-built model of a shipped report for a reader).
  - Reference: `docs/plans/ap-aging-reference/` (44 files, light and dark), manifest `docs/plans/ap-aging-capture.json` (14 shots). Captures run with the files command `tinycld-pkg test:e2e books/tests/e2e/helix-capture.spec.ts`, never `-g helix`. Phone states are shots of their own (`populated-phone`, `item-opened-phone`, `empty-phone`, `loading-phone`, `error-phone`), so each page loads at its width. The capture spec copy has one run-only addition (`tableMarker`): each capture prints the table's fit marker (`data-fit-width` / `data-layout`), the window width, each heading's width and place, `SIDEWAYS <test id>` for an element in the table that scrolls sideways and `CUT "<text>"` for a clipped text.
  - Shipping route: core `/a/reports/<id>` (no package sidebar). Measured there in this run with the shipped A/R Aging: rows width 1216 px at window 1280, 960 at 1024, 836 at 900, 704 at 768, 390 at 390, 375 at 375 (window − 64 px at 768 and wider). The scratch route draws the Books sidebar: rows width = window − 324 px at 1024 and wider. So: scratch 1540 = shipping 1280 (rows 1216 px); scratch 1284 = shipping 1024 (rows 960 px); scratch 1160 = shipping 900 (rows 836 px); 375 and 390 are the same on both routes.
  - Display block measured: **the A/R Aging's block fits with no change**, so `apDisplay()` returns `agingDisplay()` and `AP_AGING_DISPLAY` holds the same values.
    - One-line column widths: Due date 127, Current 104, 1 - 30 118, 31 - 60 104, 61 - 90 104, 91 and over 117, Total 118 px (sum 792 px; the widest figure is 118,240.00). Due date is 127 px in every state, also with no item open (the blank-above worst case).
    - `oneLine.minWidth: "940px"`: at rows of 940 px (scratch 1264) the report is on one line with a Vendor column of 149 px; at 939 px it is the tablet arrangement. At 940 px and at 960 px (shipping 1024, Vendor column 168 px) an item label ("Vendor credit 12") wraps to two lines and a line label ("2026-11-03 · Bill payment 317") to three, inside the three-line cap; no date and no figure is cut. With no gate core keeps one line down to 960 px and uses the tablet arrangement at 916 px.
    - tablet arrangement (640 px to 939 px rows; measured at 706, 776, 836, 876, 939 px): the Due date and the five ages are on one line; nothing is cut.
    - phone arrangement (375 and 390): no sideways scroll of the table and nothing cut. The one `SIDEWAYS` mark, at 375, is core's chip strip (`report-controls`), which the shipped A/R Aging also has at 375 and 390.
    - No capture has a `CUT` mark.
  - Other things the captures show (core behavior, as in the A/R Aging reference): on a phone a vendor row whose money is only in a later age draws its label and Total on one line (core rule H7, accepted for the A/R Aging); a line row keeps every line of the arrangement on a phone and a tablet, so it has blank lines; in `past-day` the 61 - 90 column has a heading and no figure. The measure shots are in the lane staging folder (`p3-measure/`, manifest `p3-measure.json`; logs `p3-capture-1.log`, `p3-capture-2.log`), not in the repo.
- phase 4 (2026-11-20): plan written after the merge of p2-apply-credit (branch at cbacae83). 5 checkpoints: 1 Shared engine, A/R Aging unchanged (logic); 2 Payable items table and source (logic); 3 A/P Aging report for readers (renders); 4 Query plans and scale proof (logic); 5 Reports menu, narrow layouts, help (renders). E2E budget 9 (6 + 3).
  - Migration: `2100000029_create_books_payable_items.js`, the free number between 2100000028 and 2100000030. The audit log view (2100000032) stays the highest; `AFTER_AUDIT` stays empty; no file is renamed. Spec §4.1 and Q11 edited.
  - Seed (`AP_AGING_SEED` was a proposal): all three rows are on Harbor Freight Logistics. The part payment pays the new bill (137.25, check 1061), not Pacific Power's "Seed bill open", whose 420.00 open balance the vendor credit apply fixture and specs read. `seedApAging` runs after `seedApplyCredit` and before `seedBankMatch`. Spec §4.5 Seed edited.
  - Engine: `server/open_items.go` (`openItemsTable`) is extracted from the receivable code as p2-apply-credit merged it (three queries, credit memo applications). The receivable SQL constants and the `refreshReceivable…` / `bindReceivable…` names stay. Two golden tests (`server/testdata/receivable_statements.json`, `server/testdata/ar_aging_spec_full.json`) hold the receivable statements and the whole A/R spec JSON through every checkpoint. The aging helper extraction (§4.4) is in checkpoint 1 too, so one checkpoint holds every change that touches the A/R Aging.
  - The credit-side row id of a vendor credit application is the id + `c` (spec §4.1); the receivable table's memo side uses `UPPER(id)`. Kept different, as the spec says.
  - The A/R Aging's L run is made one time, in checkpoint 4 (spec §9 Record). The L runs (`BOOKS_SCALE=1`) are `NEEDS-RUN` for the driver.
  - Files shared with p5-report-engine-scale get additive edits only (plan rule).
  - plan-check: 0 errors.
  - Plan review (one agent, 2026-11-20): no blocker, 11 should-fix, 12 notes. All 11 are fixed in the plan:
    - F1 the second window is a second page of the same context (`openBooks(second, DESKTOP)`).
    - F2 the e2e helper signatures and bodies are written out (`apVendorWithBill`, `payPartOfBill`, `chooseAsOf`).
    - F3 `useShippedReportHref` returns `null`, not undefined; the menu test covers a reader and the report-not-found state (`freshPageWithReports(page, [])`).
    - F4 the help section goes after "Read the sales reports" (a help test pins the heading order); `tests/help-reports.test.ts` and `tests/help-vendors.test.ts` are in the plan.
    - F5 the phone tests use a vendor name that wraps and figures in two age columns, and wait for `toolbar-more-button` after the resize.
    - F6 the one-line fit at 1024 has an e2e assertion.
    - F7 the four edit sites of `balances.go` are named.
    - F8 the proof of the rollback signal (core `touch_test.go`) and the core e2e helpers are cited (D15).
    - F9 `bindReceivableEntryRefresh` is the one exception of the name rule (D4).
    - F10 `TestAPAgingItemLines`, `TestAPAgingNoVendor`, `TestAPAgingAsOfDay` and `TestAPAgingSettledItemOnPastDay` have their own assertions.
    - F11 no open choice is left to the implementer: the scale writer takes the column map as a field; the seed part payment has fixed ids; the sweep of seeded-figure readers is stated as done, with the e2e run as the check.
    - Notes acted on: F12, F13 (golden files and comment wording), F14 (Touch warning), F15 (D16: `TestRegister_BindsEachPartOnce` gains no line, a difference from spec §4.5's wording), F17 (`attachments.spec.ts` in checkpoint 2's e2e), F18 to F21 (the Sizes rule: checkpoints 2 and 3 are above the size target and stay whole), F19 (`test.step` around the phone assertions). F16, F22, F23: no change needed.
- review mode switches: none

## Checkpoint 1 — Shared engine, A/R Aging unchanged
- test writer: `server/open_items_test.go` (3 tests), goldens `server/testdata/receivable_statements.json` and `server/testdata/ar_aging_spec_full.json` written from the pre-extraction tree by a throwaway test (deleted); red for the right reason: yes (compile error naming only `receivableItems`, `openItemsTable`, `openItemDay`, `ItemDrift`); untestable: none
- implementer: `server/open_items.go` (`openItemsTable` and its methods, `itemPair`, `itemPart`, `ItemDrift`, `bindItemRefresh`), `var receivableItems`, the six aging helpers, A/R calls renamed by D4; DONE. Four Files-block test files (`receivable_items_test.go`, `receivable_write_off_test.go`, `report_ar_aging_profile_test.go`, `report_ar_aging_test.go`) needed no edit (no renamed symbol in them; reviewers A and B grepped and agree).
- test disputes: none
- self-declared differences: (1) `refuse("%s", t.ReadOnly)`, since `refuse` takes a format string and `go vet` refuses a non-constant one (Design notes); (2) the `balances.go:216` comment left naming `repairReceivables` by the "four edits" rule (fixed in the fix round); (3) test comments and failure strings that named a renamed identifier renamed too, no assertion changed; (4) engine comments say "party", error texts use `t.Noun`.
- gate 1: tests unedited: yes · pass (`go test ./...` ok; `packages:generate` + `tinycld-pkg check` exit 0: biome clean, 8388 vitest, tsc). No e2e (plan). `ar_aging_spec.json`, `ar_aging_stat1.json` unchanged. Reviewer A probed the goldens with `go test -overlay` against the HEAD receivable code: equal.
- gate 2: n/a (logic)
- gate 3 A (correctness): 0 BLOCK, 5 NOTE — refresh not run inside a transaction on the second table, so the "fails when a method names customer" claim was not met: accepted+fixed (weak-test, test writer); `balances.go:216` stale comment: accepted+fixed; field comment of `Collection` named one table: accepted+fixed (one-line comment); write guard not run on the test table and `refuse("%s", …)`: Design notes
- gate 3 B (conformance): script lines: 0 · 2 findings — `balances.go:216` stale comment: accepted+fixed (one word; the file is shared with p5-report-engine-scale, the line is not moved); golden `receivable_statements.json` written by a map encoder (alphabetical keys) and not the test's struct writer: accepted+fixed (rewritten once with `BOOKS_GOLDEN=1`, key order only; checkpoint 1 is the one place it is allowed)
- fix review: round 1: clean (0 BLOCK; 1 NOTE on the ledger's Design notes placeholder: format line kept). Findings file `cp1-fix-r1.md`; the new in-transaction refresh assertions were proven red by two `go test -overlay` mutations (pairs query naming `customer`; no settle of touched pairs). Gate 1 after the fix: pass.
- gate 3 A notes: 2, listed under Design notes
- reviewer-caught deferrals: none
- commit: (this commit)

## Checkpoint 2 — Payable items table and source
- test writer: `server/payable_items_test.go`, `server/payable_refresh_test.go`, `server/payable_stored_test.go` (new), `server/oauth_scopes_test.go`, `server/report_sources_test.go`, `server/registrations_test.go` (map entry, not red), `tests/migration-prefixes.test.ts`, `tests/seed-node.test.ts`; 29 tests; red for the right reason: yes (Go compile error naming `payableItems`, the `refreshPayable…` functions, `payableItemsSource`; vitest: missing migration file, `seedApAging` not exported); untestable: none
- implementer: migration 2100000029, `server/payable_items.go`, `server/payable_refresh.go`, the binds (D4 rename to `bindOpenItemEntryRefresh`), rebuild route keys, source, OAuth scope, `requireNoDrift`, fixture seed block (D2), `seedApAging`; DONE
- test disputes: none
- self-declared differences: (1) `seedApAging` checks the vendors of both the bill and the credit against `VENDORS` (same message); (2) the seed payment line uses the fixture's fixed `lineId`; (3) the seed bill and credit lines have no `description` (`AP_AGING_SEED` has none; the line guard does not need one); (4) `refreshPayableBill` binds `entry` also when the bill's entry is blank (the term that reads it is left out, so the bind is unused)
- gate 1: tests unedited: yes · `go test ./...` ok; `packages:generate` + `tinycld-pkg check` exit 0 (biome clean, 8392 vitest, tsc) · e2e of the Gates line (10 spec files, run by the driver after gate 3 and the fix round): 61 passed, exit 0
- gate 2: n/a (logic)
- gate 3 A (correctness): 0 BLOCK, 2 NOTE, 1 DEFERRAL — NOTE 1 + DEFERRAL (`TestPayableLinesVendorCredit` proved "each `settled` is computed again" after an application's delete for the credit only): accepted+fixed (weak-test, fresh test writer: a 200.00 bill settled in full by an application, then opened again by its delete; proven red with a two-file `go test -overlay` mutation; findings `cp2-fix-r1.md`); NOTE 2 (repeated refresh work on a bill balance save): Design notes
- gate 3 B (conformance): script lines: 0 · 0 findings
- fix review: n/a — round 1 changed only a test file (`server/payable_items_test.go`); `go test -count=1 ./...` after it: ok
- gate 3 A notes: 1, listed under Design notes
- reviewer-caught deferrals: 1 (the weak bill-side `settled` assertion; not self-declared by the test writer) — fixed in round 1, so no deferral entry
- commit: (this commit)

## Checkpoint 3 — A/P Aging report for readers
- test writer: `server/report_ap_aging_test.go` (22 Go tests), `server/testdata/ap_aging_spec.json`, `tests/ap-aging-fixture.test.ts` (3 vitest, green from the start as Do step 0 says), `tests/e2e/ap-aging-helpers.ts`, `tests/e2e/books-ap-aging.spec.ts` (6 e2e); red for the right reason: yes (Go compile error naming only `apAgingSpec`, `apAgingShipped`, `apAgingKey`, `vendorsParam`, `apDisplay`; e2e: the hub has no "A/P Aging" entry); untestable: none
- implementer: `server/report_ap_aging.go`, `vendorsParam`/`vendorGroup`/`vendorSort` in `server/report_spec_helpers.go`, `RegisterShipped(apAgingShipped())` in `server/register.go`; step 5's grep found no test or list that counts every shipped Books report, so no other file; DONE
- test disputes: 2, both ruled for the implementer (`cp3-disputes.md`), fixed by a fresh test writer:
  - `TestAPAgingTopics` asserted the topics are "exactly" the three Books topics; core adds each access-rule CTE's topics (`tinycld/core/server/reports/run.go` lines 309-311 `ruleTopics`), so the Books read rule adds `books_admins`, `org_pkg_access`, `users`. Now: the three are present and no other `collection/books_*` topic but `books_admins`; proven red with a `go test -overlay` copy of core `run.go` that drops `collection/books_payable_items`. See Rebuttals (reviewer B's DEFERRAL on it).
  - e2e test 5 called `applyCreditToBill` with the report on screen; the helper's visible-read-view check matched the credit read view Books keeps laid out under the report route (lesson 5), so its click hit the report scroller. Now the apply runs on a second page of the same context (as test 4), and page A follows by the live re-run; every assertion unchanged. (A return through the hub was tried first: the hub reopens the report as it was left, filter and opened rows kept.)
- self-declared differences: comments added to the brief's code; no other change
- gate 1: tests unedited: yes · `go test ./...` ok; `packages:generate` + `tinycld-pkg check` exit 0; e2e `books-ap-aging.spec.ts`: 6 passed. After the fix round: the same, all pass (6 e2e passed).
- gate 2: invalid shots: none · blocking: none · notes: 2, listed under Design notes. Lessons applied: 13 (each width loaded at its width), 24 (seeded rows reached by name through the UI, not by fixture id), 31 (focus dropped by a click on `report-document-period`). Capture spec copy gained `clickPattern` and `waitForTextIn` (the A/R Aging's copy had them; template candidates). Filter shot picks Harbor Freight Logistics and Pacific Power (both have seeded open bills; the reference picked Blue Ridge, which has none in the seed).
- gate 3 A (correctness): 0 BLOCK, 3 NOTE — item order when two items share `due` and `itemNo`: Design notes; Go `apEmptyDay` a hand copy of `AP_AGING_EMPTY_DAY`: accepted+fixed (mirror; `emptyDay` in the shared case file, read by the Go test and asserted by vitest, proven red); inline `import()` type: accepted+fixed (same as B 2)
- gate 3 B (conformance): script lines: 0 · 3 findings + 1 DEFERRAL — helper-file header comment named imports it does not have: accepted+fixed; inline `import('@playwright/test').Page`: accepted+fixed; helpers defined in the spec, against the plan note "its helpers are in the new `tests/e2e/ap-aging-helpers.ts`": accepted+fixed (moved, no assertion changed); DEFERRAL on `TestAPAgingTopics` "exactly": rebutted (see Rebuttals)
- fix review: n/a — round 1 (`cp3-fix-r1.md`) changed only test files and the shared test case file, fixed by a test writer
- gate 3 A notes: 1, listed under Design notes
- reviewer-caught deferrals: none (the one DEFERRAL was rebutted)
- commit: (this commit)

## Checkpoint 4 — Query plans and scale proof
- test writer: Do step 1 first (the harness move: `server/report_scale_harness_test.go` created; `server/report_ar_aging_scale_test.go` passes its own large tables, column map, doc types and statistics file; `go test -run 'TestARAging' -count=1 .` green after it), then `server/report_ap_aging_scale_test.go` (`writeAPDataset`, `apTableColumns`, `apRuns`, 4 tests). Red for the right reason: yes (`TestAPAgingQueryPlans`: `open testdata/ap_aging_stat1.json: no such file or directory`; the no-statistics reading of the seven runs passes every bar before it). `TestAPAgingBulkWriterMatchesPosters` and `TestAPAgingRunsAgreeWithSmallBook` pass now (no product code; a writer mutation of `payment_method` made the first fail). `TestAPAgingScale` skips without `BOOKS_SCALE`; `go vet` clean. Untestable: none.
  - beyond the brief: `newARWriter` takes the doc types as a variadic parameter (the old body named the A/R doc types); `arJELine` gained a `vendor` field.
  - dataset: spec §9's counts cannot all hold at once (10,000 bills with 9,000 payment lines leave at least 850 open, against "about 800"). S bills = 9,700 (3 % under, inside `arWithin`'s 5 %); L = 10 × S. Journal lines exact; the other counts within 5 %.
  - `BOOKS_SCALE_OUT` is a folder (as the A/R scale test), not the `.txt` file of Do step 4.
- scale run (driver, then runner after the fix round): first run PASS (174 s), every bar met, `server/testdata/ap_aging_stat1.json` written; after fix round 1 (the A/R S runs added) PASS (186 s), the statistics file byte-identical, the plans differ only in the random test user id. The figures under Performance are of the second run. No index added.
- implementer: Do step 5's evidence only — `docs/plans/ap-aging-evidence/perf-plans.md`, a verbatim copy of the scale output (the runner copied the second run's file over it); `go test -run 'TestAPAging|TestARAging'` green, `TestAPAgingQueryPlans` green with the statistics file; DONE
- test disputes: none
- self-declared differences: the ledger is the runner's; `tinycld-pkg check` not run by the implementer (no TS file changed)
- gate 1: tests unedited: yes · `go test ./...` ok; `packages:generate` + `tinycld-pkg check` exit 0; no e2e (the checkpoint names none). After the fix round: the same, both pass.
- gate 2: n/a (logic checkpoint)
- gate 3 A (correctness): 0 BLOCK, 7 NOTE, 1 DEFERRAL — DEFERRAL `TestAPAgingRunsAgreeWithSmallBook` compares only runs 1 and 2 with the writer's record: accepted+fixed (fix item 1; runs 3 to 7 now compared, CSV parsed, each new assertion proven red by a mutation); NOTE A/R ratio bar not measured: accepted+fixed (spec §9 Record "records that its times still meet its bars"; fix item 2); NOTE "customers" in the harness bar message: accepted+fixed (fix item 3, one-line text); NOTEs dataset 9,700 bills, poster comparison without void documents, three moved bodies changed, the brief's "temporary B-tree" text: Design notes; NOTE `BOOKS_SCALE_OUT` is a folder: no fix (recorded above)
- gate 3 B (conformance): script lines: 0 · 3 findings + 2 DEFERRAL — Performance text claimed more than the plans show: accepted+fixed (worded as the A/R spec §9 bars); stale "scale run" line: accepted+fixed; spec §9 table inconsistent: accepted, comment at `apS` (fix item 4) and a Design note for the human; DEFERRAL 1 = reviewer A's DEFERRAL: fixed; DEFERRAL 2 = the A/R ratio bar: fixed (fix item 2)
- fix review: n/a — round 1 (`cp4-fix-r1.md`) changed only test files (`server/report_ap_aging_scale_test.go`, `server/report_scale_harness_test.go`), fixed by a test writer (`cp4-fix-tests.md`); no non-test source changed
- gate 3 A notes: 4, listed under Design notes
- reviewer-caught deferrals: 2 (the small-book comparison of runs 3 to 7; the A/R ratio bar) — neither self-declared by the test writer; both fixed, none recorded as a deferral
- commit: (this commit)

## Checkpoint 5 — Reports menu, narrow layouts, help
- test writer: `tests/e2e/books-ap-aging.spec.ts` (describe "ap-aging: entry points and narrow layouts", 3 tests), `tests/help-reports.test.ts`, `tests/help-vendors.test.ts` (new); red for the right reason: yes (e2e test 1 times out on `vendors-reports`; 14 help vitest cases red: no A/P Aging text). E2E tests 2 (390) and 3 (375) green from the start, as Do step 0 allows: nothing cut, no sideways scroll, so step 3 needs no `apDisplay()` change. The spec held the key as a literal until the constant existed (removed in the fix round). untestable: none
- implementer: `AP_AGING_SHIPPED_KEY` in `lib/shipped-reports.ts`; the Reports menu in `VendorsList.tsx` (as `CustomersList.tsx`); `help/reports.md` section "Read the A/P Aging report" after "Read the sales reports", "the A/P Aging" in "Who sees Books reports"; `help/vendors.md` sentence and link; no display change (step 3); DONE
- test disputes: none
- self-declared differences: (1) the menu item's `key` is `AP_AGING_SHIPPED_KEY`, not the snippet's `'aging'`, because Do 2 says "use the exact item shape that file uses" and `CustomersList.tsx` keys items by the shipped key; (2) `help/reports.md` tags gained `a/p aging` — reverted in the fix round (reviewer B 1)
- gate 1: tests unedited: yes · `go test ./...` ok; `packages:generate` + `tinycld-pkg check` exit 0; e2e `books-ap-aging.spec.ts` + `vendor-form-list.spec.ts`: 11 passed. After the fix round: the same, 11 passed.
- gate 2: invalid shots: none · blocking: none · notes: 4 (2 report, 2 menu), listed under Design notes. Lessons applied: 13 (each width loaded at its width), 24 (seeded rows reached by name), 31 (focus dropped on `report-document-period`). Every shot opened from the Vendors list's Reports menu at `/a/books/vendors`. Capture marks: no `CUT`; the one `SIDEWAYS` is core's chip strip `report-controls`, as in the reference. The first capture had no shot of the menu itself (critic: "not judged"); a `vendors-menu` shot at 1280 and 390 was added and judged by a second critic (`critique-menu.md`), anchored on the A/R Aging's `customers-menu` shot.
- gate 3 A (correctness): 0 BLOCK, 5 NOTE — the age-rule help test matched words found elsewhere in the section: accepted+fixed (weak-test; checkpoint: "Fails when … one of the spec's Help items is missing"); "how to open a vendor, an item and a document" unasserted: accepted+fixed (weak-test, same quote); reader proof missing in test 1: accepted+fixed (weak-test; "Fails when … a reader has no menu"); `headerAction` undefined vs a null menu unpinned: Design notes; A/R wording in a shared helper's message: Design notes (plan forbids edits to it)
- gate 3 B (conformance): script lines: 0 · 2 findings — `help/reports.md` tags line changed though the plan names only two edits in that shared file: accepted+fixed (out-of-plan; line put back); stale local key constant in the spec: accepted+fixed (weak-test, now imports `AP_AGING_SHIPPED_KEY`)
- fix review: round 1 (`cp5-fix-r1.md`; tests by a test writer, each new assertion shown to fail on a mutant; the help frontmatter by an implementer): 0 BLOCK, 1 NOTE (the reader check can pass before access is ready) → Design notes
- gate 3 A notes: 2, listed under Design notes
- reviewer-caught deferrals: none
- commit: (this commit)

## Performance
- machine: darwin/arm64, 14 CPUs, go1.27.4 · date: 2026-11-20 · base commit caaef9ea · `TestAPAgingScale` PASS (186 s: S 9 s, L 84 s, A/R S 9 s, A/R L 84 s)
- statements and plans at L after `ANALYZE`: `docs/plans/ap-aging-evidence/perf-plans.md`; every statement of the seven runs met the query-plan bars of the A/R spec §9: no `SCAN` of `books_journal_lines` or `books_journal_entries`; no `SCAN` of a large table inside a loop; one outermost `SCAN books_payable_items` only in whole-book runs (run 2, statements 5 and 6); automatic indexes only on derived subqueries, none on a large table; `USE TEMP B-TREE` for GROUP BY / ORDER BY steps, which the A/R spec §9 permits
- dataset (S / L): journal lines 50,000 / 500,000 · vendors 203 / 2,003 · bills 9,700 / 97,000 · bill payments 8,000 / 80,000 · bill payment lines 9,100 / 91,000 · vendor credits 200 / 2,000 · applications 150 / 1,500 · vendor refunds 50 / 500 · manual A/P lines 100 / 1,000 · void bills 100 / 1,000 · void bill payments 100 / 1,000 · open items on the last day 800 / 8,000

| A/P run | S median | L median | L/S | bar | result |
|---|---|---|---|---|---|
| 1 default | 34.3 ms | 220.9 ms | 6.4 | ≤ 1,000 ms, ≤ 15× | pass |
| 2 past day | 41.0 ms | 289.5 ms | 7.1 | ≤ 1,000 ms, ≤ 15× | pass |
| 3 largest balance | 34.3 ms | 226.4 ms | 6.6 | ≤ 1,000 ms, ≤ 15× | pass |
| 4 five vendors | 15.3 ms | 39.9 ms | 2.6 | ≤ 1,000 ms, ≤ 15× | pass |
| 5 vendor opened | 35.4 ms | 235.2 ms | 6.7 | ≤ 1,000 ms, ≤ 15× | pass |
| 6 item opened | 48.9 ms | 307.4 ms | 6.3 | ≤ 1,000 ms, ≤ 15× | pass |
| 7 CSV export | 118.8 ms | 775.4 ms | 6.5 | ≤ 5,000 ms, ≤ 15× | pass |

| A/R run (after the engine extraction) | S median | L median | L/S | bar | result |
|---|---|---|---|---|---|
| 1 default | 70.2 ms | 364.7 ms | 5.2 | ≤ 1,000 ms, ≤ 15× | pass |
| 2 past day | 78.5 ms | 492.9 ms | 6.3 | ≤ 1,000 ms, ≤ 15× | pass |
| 3 largest balance | 67.8 ms | 368.6 ms | 5.4 | ≤ 1,000 ms, ≤ 15× | pass |
| 4 one family | 37.6 ms | 57.0 ms | 1.5 | ≤ 1,000 ms, ≤ 15× | pass |
| 5 customer opened | 68.6 ms | 382.5 ms | 5.6 | ≤ 1,000 ms, ≤ 15× | pass |
| 6 item opened | 85.1 ms | 460.6 ms | 5.4 | ≤ 1,000 ms, ≤ 15× | pass |
| 7 CSV export | 164.1 ms | 1,064.9 ms | 6.5 | ≤ 5,000 ms, ≤ 15× | pass |

- indexes added: none (`pb-migrations/2100000029_create_books_payable_items.js` unchanged)

## Final review
- eval: (not reached)
- human comments and what changed
- native: not executed in this run
