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
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
(none yet — gate-2 NOTEs the loop did not act on, as
`cp N · <shot>: <where> — <what>`; shown to the human at each checkpoint
and again at the end)

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
- phase 4: not started; waits for the merge of p2-apply-credit (Q11).
- review mode switches: none

## Performance
(none yet — the measured results of spec §9)

## Final review
- eval: (not reached)
- human comments and what changed
- native: not executed in this run
