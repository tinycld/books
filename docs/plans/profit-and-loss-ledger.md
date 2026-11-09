# profit-and-loss — helix run ledger

- mode: unattended
- unit: p5-profit-and-loss
- started: 2026-11-09
- package branch: books/p5-profit-and-loss (from books main 9cf2b70)   core checkout: main 95077d35; checkpoint 0 on core branch books/p5-profit-and-loss (from core main 95077d35)
- spec: docs/specs/profit-and-loss-design.md
- checkpoints: docs/plans/profit-and-loss-checkpoints.md
- reference: docs/plans/profit-and-loss-reference/
- evidence: docs/plans/profit-and-loss-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/profit-and-loss-capture.json
- review mode: C — none (unattended)
- core extension: P1 `percentOfSection`, P2 `pivot.range`, P3 `pivot.order: "spec"`, P4 bucket labels in words, at spec version 4 (spec §4) — checkpoint 0, core PR on branch books/p5-profit-and-loss in tinycld, merges before checkpoint 1; MAJOR; lane purchases holds `exclusive` (taken 2026-11-09); core merge: pre-approved by the human 2026-11-09 ("merge core after ci green")
- sparks:
  - the statement reads top to bottom as a calculation; each computed line sits where its inputs end → expressible (core `layout` sections per account type, top-level computed rows over `{subtotal}` and earlier rows, `ReportRow` ruled subtotal and computed rows, `groups[].open`; no new token or component)

## Deferrals
- **agreed:** Profit and Loss on cash basis (the Accrual / Cash method param), Books spec §Scope "cash/accrual" and §Audience "cash-basis reports derived from payment allocations".
  **built:** accrual basis only; both reports and the help topic say "accrual basis".
  **reason:** upstream dependency — cash basis is derived from payment allocations, and Books has none.
  **blocker evidence:** no payment collection in `books/pb-migrations/` (`2100000002_create_books_ledger.js` `doc_type` is `journal`, `transfer`); units p2-receive-payment and p3-pay-bills not merged (ledger folder, 2026-11-09).
  **impact:** a business that files on cash basis cannot read its P&L on that basis in Books until payments exist; the Balance Sheet's cut Accrual / Cash toggle waits on the same unit.
  **unblock:** p3-pay-bills adds the Accrual / Cash method param to the Profit and Loss reports and the Balance Sheet; the human extends that unit's manifest description with this text.
  **tracked in:** manifest unit p3-pay-bills — description extended and depends on p5-profit-and-loss, p5-balance-sheet added 2026-11-09 on the human's word ("add to manifest as you suggest").
  **found by:** design packet Q1, approved at the design gate 2026-11-09.
  **checkpoint:** design (before checkpoint 0).

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
- 2026-11-09 design gate (unattended): the human picked direction A ("A, accept suggested answers"). Every open question as recommended: Q1 accrual only, cash deferred to p3-pay-bills; Q2 two shipped reports (Profit and Loss; Profit and Loss by Month), no P6; Q3 % of income on Total only; Q4 default period this fiscal year to date; Q5 the five sections always show; Q6 flat by full name; Q7 P&L rows open into lines, by-month rows do not; Q8 Rows Non-zero (default) and Active, All cut; Q9 P4 bucket words for every report; Q10 `exclusive` for checkpoint 0; Q11 % of income over Total Income alone; Q12 P1–P4 at spec version 4, no bump; Q13 by-month cap 36 months. Core merge pre-approval: not given (ask).
- Packet and artboards: /Users/nas/tmp/tinycld/auto-helix-books/staging/p5-profit-and-loss/ (packet.md, intake.md, artboards.html).
- 2026-11-09 phase 3 pass 2 (unattended): reference captured for direction A, no human approval step. Fixture `tinycld/books/lib/profit-and-loss-fixture.ts` (static `RunResult`s for both reports; the by-month result already has the P2/P3/P4 shape: every month a column, months before Total, headings "Jan 2026" as plain column labels until checkpoint 0 types them). Scratch route draws core `ReportView` from a static `ReportViewModel` (the p5-balance-sheet route model). 13 states, 56 shots in `docs/plans/profit-and-loss-reference/`: P&L populated (390/1024/1280), opened (6200 Insurance's three lines), rows-active (6700 nets to 0.00), collapsed, no-lines, customize, loading, error, timeout, no-access; by month: month-populated (390/1024/1280; April 0.00 for 4100 and 4900), month-no-lines, month-capped (47 months, first 36, pivotCap notice). Spark 1 kept (not dropped). No corrections.
- Spec gap found in pass 2: spec §5 `display` for Profit and Loss has no `oneLine` gate, and without one core's fit puts all three columns on one line at 390 (labels cut to "4000 Service ..."), so §3's phone wrap never shows. The reference uses `display.oneLine.minWidth: "600px"` (fixture `PROFIT_AND_LOSS_ONE_LINE_MIN_WIDTH`); the Go spec must carry it (the Journal's 880px / General Ledger's 1040px precedent).
- By month at 1280 inside the Books shell does not fit one line: 11 months + Total + % wrap into core's automatic lines (§3 accepts this). Measure again on the shipping route `/a/reports/<id>` (no package sidebar).
- 2026-11-09 phase 4 (unattended): plan `docs/plans/profit-and-loss-checkpoints.md`, checkpoint 0 (core P1–P4) + 4 (statement; opened lines and live; by month; phone, fit and help); 11 e2e runs. Spec edited: §5 P&L `display` gains `oneLine.minWidth: "600px"` with the measured reason (D1); §7 item 2 drops the Net income delta (D2, shared e2e DB). Review mode C. plan-check: 0 errors.
- 2026-11-09 plan review (fresh subagent; report /Users/nas/tmp/tinycld/auto-helix-books/staging/p5-profit-and-loss/plan-review.md): 29 findings, all fixed in the plan except two optional ones (A1 rename in live e2e; A7 "All dates" header, core-owned). Fixed: by-month Rows, filter, no-lines, topics, cap % of income pins; unconditional label ellipsis check; layout-report paging shape left to core's `run.go` (stop on a repeated or dropped computed row); no-access as the Trial Balance's (D8); inactive account pinned (D9); P1 pivot-cell ruling (D10); month words pinned in core vitest and e2e 8 (D7); `reports.DisplayOneLine`, `reports.SortKey`, `'auto'`, bucket `FieldType` constants `reports.Month` …; `Node.Subtotal` reuse ruled; P1 group subtotal and Type Percent, P2 mid-month and non-summed tests; P3/P4 core help checks; phone run carries item 1's header and chips; `scrollRowTo` dropped (not exported).
- Ledger header says core merge pre-approved; the design-gate phase note says "not given (ask)". The plan follows the header; the driver confirms.

## Final review
- eval:
