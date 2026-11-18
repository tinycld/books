# purchase-lists — helix run ledger

- started: 2026-11-18
- mode: unattended
- unit: p3-purchase-lists
- package branch: books/p3-purchase-lists   core checkout: main
- spec: docs/specs/purchase-lists-design.md
- checkpoints: docs/plans/purchase-lists-checkpoints.md
- reference: docs/plans/purchase-lists-reference/
- evidence: docs/plans/purchase-lists-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/purchase-lists-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - The status of each row is readable from its color → expressible (Books `StatusBadge` tones over success / warning / destructive / muted / info tokens)
  - A row with several categories says so in one quiet word → expressible ("Split" in `text-muted-foreground`; one category in `text-foreground`)
  - A category that looks like an input in each row → dropped (it serves inline edit, which Q4 cuts)

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
- phase 1: design packet generated unattended (look-ahead), staged at /Users/nas/tmp/tinycld/auto-helix-books/staging/p3-purchase-lists/; no corrections.
- phase 3: design gate 2026-11-18 — human picked direction A (tabs by kind, the document beside its list) and accepted Q1–Q17 as recommended. Overlap: p2-refund-receipt (lane reports) merges first; this unit merges `main` and moves the Q15 renames onto the refund-receipt tab and fields.
- phase 3 pass 2: reference captured 2026-11-18 from the scratch route (`/a/books/helix-mockup?tab=&state=`), 40 shots, light and dark, in docs/plans/purchase-lists-reference/ (direction A). No spark dropped: "Split" draws in `text-muted-foreground`, status in `StatusBadge` tones. No human corrections (unattended). Notes for the plan: the route is built from the shared list parts (`ListTable`, `ListCards`, `ListTabs`, `ListFilterChips`, `SearchField`, `SearchPicker`, `ListBanner`, `SelectBox`, `StatusBadge`, core `Menu` / `PickMenu` / `Dialog`) with local copies of the sales-only pieces, test ids `purchases-…`; the Type column is 120 px minimum (108 on Sales) so "Vendor refund" is not cut, which makes the All purchases table minimum 912 px for a writer; category accounts are seed chart numbers (6100 Rent, 6200 Software Subscriptions, 6210 Design Tools) and the fixture has no seed selection yet (spec §4 "Seed" is checkpoint work); the `beside` shot shows a stand-in for the document, as the sales-lists reference does; a list keeps the phone New FAB (`hidesNewFab`), so the phone shots show it.
- phase 4: plan written 2026-11-18, 4 checkpoints (1 Purchase list data and rules, logic; 2 List area in shared parts, logic; 3 Expenses routes, rows and filters, renders; 4 Row actions, keys and help, renders), 12 e2e (0 / 0 / 6 / 6). plan-check `--unattended` exit 0 (warnings only: names a later checkpoint consumes before source has them, and names the last user produces). Plan review (one `general-purpose` agent, report in the lane notes, `plan-review.md`): 31 findings, 5 High, all fixed in the plan: (1) the fixture lines of the seeded documents had no amounts, so the seed could not post their totals: checkpoint 1 adds the amounts and a "lines sum to total" fixture test; (2) the `.limit(2)` proof ran on a harness that ignores `limit`: it now runs on pbtsdb's real loader (model `tests/collections-real.test.ts`) and checkpoint 3 test 1 reads Category cells; (3) a bill payment's Edit and the column's New "Pay bills" used `router.replace` from a child stack, which removes the list: both push, with an e2e in checkpoint 4 test 2; (4) the e2e named vendors by fixture constants, not display names ("Northwest Paper Co.", "Zenith Telecom", "Brightwave Marketing", "Old Town Print Shop"); (5) `refuseBatchWrite` cannot refuse a void: `refusePurchaseWrite` by record id. Also fixed: per-tab key `tabStateKey(tab)` = `<area>:<key>` at every named site (both areas have an `all` tab); `kindLabel` / `listDocumentHref` / `isSalesKind` for the widened row kind; `keepKey` so the vendor page keeps rows on a chip change; `draftBillFor` / `postedBillFor` helpers; gate lists gained the two `sales-lists-leave-guard*` specs, `balance-sheet`, `profit-and-loss`, `journal-report`, `report-drill-down` and `vendor-pages-*` (checkpoint 4); checkpoint 2 of the first plan cut in two (size). Decisions: the seed posts only two bills and one vendor credit (no expense, payment or refund: they move a bank register) and the e2e only reads seeded rows; a test that writes creates its own vendor and documents. Not verified before the build, named in the plan: that All purchases (minimum 912) draws its table at 1280; that the seeded posts move no total an existing report spec asserts (checkpoint 1 Gate 1 runs those specs); the Expo Router behavior of a push to Pay Bills from a child stack (checkpoint 3 step 5 probes it); the fixes were not given to a second review.
- review mode switches: none

## Final review
- eval:
