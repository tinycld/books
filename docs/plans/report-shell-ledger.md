# report-shell — helix run ledger

- started: 2026-10-26
- mode: unattended
- unit: p5-report-shell
- package branch: books/p5-report-shell   core checkout: main@67b51fc3
- spec: docs/specs/report-shell-design.md
- checkpoints: docs/plans/report-shell-checkpoints.md
- reference: docs/plans/report-shell-reference/
- evidence: docs/plans/report-shell-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/report-shell-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - report reads like a finished document → expressible (ReportDocumentHeader strip: text-muted-foreground, text-lg font-semibold text-foreground, border-border; books_settings.business_name)
  - totals set apart by weight and rule lines, not color → expressible (font-semibold, border-t border-border subtotal, border-t-2 border-foreground total; red negatives text-danger)
  - every control shows its current value at rest → expressible (core PickMenu / Popover, core ButtonGroup, Books ReportFilterChip from Pressable + bg-secondary / border-border / text-secondary-foreground)

## Deferrals
(none yet)

## Rebuttals
(none yet)

## Design notes
(none yet)

## Out-of-plan changes
(none yet)

## Phase notes
- phase 1: unattended; design packet /Users/nas/tmp/tinycld/auto-helix-books/staging/p5-report-shell/packet.md (intake.md beside it). No human corrections.
- phase 3: design gate approved 2026-10-26. Direction C picked (one chip row under the title: period chip, method toggle, filter chips, Add filter; each chip opens a Popover, a Sheet on phone; phone row scrolls sideways, never wraps; full-width table, compact document header strip; Customize holds Number format, Rows, Columns). Human accepted the recommended answer to all 13 open questions: Q1 minimum Trial Balance built in this unit as the first report (p5-trial-balance adds to it); Q2 options in route search params via router.setParams, defaults omitted, presets by name; Q3 Accrual default, no new books_settings field; Q4 method toggle only when hasBasis (TB false); Q5 fiscal-year presets as spec lists, no week presets; Q6 day-level ranges via monthSlices/asOfSlices; Q7 this unit owns the hub, sidebar entry, registry (all v0 reports listed available: false); Q8 one renderer with folding and Collapse/Expand all, visit-only Zustand state; Q9 filters as chips only; Q10 number format ÷1000, without cents, -100/(100), red negatives, round once at display half away from zero; Q11 phone fixed label column with sideways amount columns; Q12 seven hub sections, no search; Q13 currency symbol on subtotal and total rows only. No sparks dropped. No platform-only items. Core moved a5e0c8f → 67b51fc3 before the build (TextInput 2-line change only; packet kept). Pass 2 (unattended, 2026-10-26): reference captured in docs/plans/report-shell-reference/ from docs/plans/report-shell-capture.json (15 shots x 390/1280 x light/dark = 60 PNGs): hub (registry as later units fill it; Taxes not drawn), hub-v0 (only Trial Balance, as this unit ships), hub-empty, tb (Trial Balance populated, as of Sep 30 2026), pl-folded (Profit and Loss by quarter, nested Professional fees section, Cost of goods sold folded showing its subtotal), loading, error, empty ("Show this fiscal year"), empty-filtered ("Account: 3 accounts" chip, "Clear filters"), period (as-of popover / phone sheet), invalid-date (From after To inline error, preset switched to Custom, report keeps Jan 1 – Oct 25), add-filter (menu), filter-picker (account groups + accounts, Apply pinned under a scrolling list), customize (inline Drawer on desktop, bottom Sheet on phone; Without cents + (100) + red applied live behind it), unknown. Fixture lib/report-shell-fixture.ts: accounts and settings satisfy BooksAccounts / BooksSettings; the report contract and registry are local Fixture* interfaces that the checkpoint creating lib/report-definition.ts and lib/report-registry.ts must replace with imports. No spark dropped: all three built from core components and semantic tokens (document header strip on bg-card; subtotal border-t border-border, total border-t-2 border-foreground, red text-danger; chips from Pressable + bg-secondary/border-border). Reference decisions for phase 4: (1) phone label column at 55% left about 88pt per Debit/Credit column at 390 and truncated amounts, so with one or two amount columns the reference gives the amounts a fixed 108pt and the label the rest; three or more keep 168pt label + 128pt scrolling columns (spec Report table phone bullet needs this wording); (2) period popover shows presets as wrapping pills (as the direction-C artboard) above stacked date fields; (3) the account picker is a Popover with checkbox rows, not a Menu, so Apply stays in view; (4) empty states use a Books Button, not core EmptyState (its action text is text-accent, near invisible in light mode; core change request, not made); (5) empty state for an as-of report: "No activity for As of <date>" reads badly, so the reference shows the empty states on the range report; the plan must word the as-of case. Scratch capture spec copy waits for the ready element's box and opacity to hold still after each viewport change (phone sheets were captured mid-slide otherwise); the helix template still lacks this.
- phase 3 (driver, after pass 2): spec edited from the reference — phone tables with one or two amount columns use fixed 108pt amount columns and a label column that takes the rest (55% cut amounts off at 390); three or more keep 168pt label + 128pt sideways-scrolling columns, column-label row scrolls in step with the body (refines Q11; shown to the human at the eval gate). Empty wording for as-of reports: "No balances as of <date in words>". Empty actions use core Button, not core EmptyState (its text-accent action is too faint in light mode; core change request, not made).
- phase 4: plan written (10 checkpoints: 4 logic, 6 rendering; 10 e2e tests); plan-check --unattended exit 0. Fresh plan review: 14 narrowed findings, 4 untested, Consumes name gaps, e2e reach and definitions-map points; all applied (staging plan-review.md). One partial: finding 3 "no row has both cells blank" under Active contradicts the spec (postings that cancel to zero show blank cells under Active), so the check runs under Non-zero and Active is proven by the inactive never-posted 6900 Old Petty Cash row. Deviation accepted: definitions live in lib/reports/definitions.ts beside the registry, guarded by report-registry.test.ts. e2e coverage gaps (no sectioned / range / basis / choice-filter report exists yet) listed in the plan section "Not reachable by this unit's e2e"; recorded as a deferral of e2e coverage at the eval gate.
- review mode switches: none

## Final review
- eval:
- native: not executed in this run
