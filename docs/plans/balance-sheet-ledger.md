# balance-sheet — helix run ledger

- mode: unattended
- unit: p5-balance-sheet
- started: 2026-11-08
- package branch: books/p5-balance-sheet (from books main 66846ed)   core checkout: books/p5-balance-sheet (from core main b021c3a); checkpoint 0 on core branch books/p5-balance-sheet
- spec: docs/specs/balance-sheet-design.md
- checkpoints: docs/plans/balance-sheet-checkpoints.md
- reference: docs/plans/balance-sheet-reference/
- evidence: docs/plans/balance-sheet-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/balance-sheet-capture.json
- review mode: C — none (unattended)
- core extension: report spec extensions G1, G3, G4, G5, G7, G8 at spec version 4 (no bump; spec §4) — checkpoint 0, core PR on branch books/p5-balance-sheet, merges before checkpoint 1; MAJOR, the lane holds `exclusive` (taken at the design gate 2026-11-08). Core merge: pre-approved at the design gate (2026-11-08) — merge when checks are green. Runs as writing-plans → the human's plan review → subagent-driven development → core PR. Serialized with p5-journal-report's exclusive checkpoint 0 by the claim; the second rebases.
- sparks:
  - nested outline whose totals step out one level at a time → needs extension (accepted 2026-11-06): core `layout` sections, nested groups with `subtotals`, `groups[].open`, `ReportRow` depth indent and ruled subtotal rows, plus G1 (ragged levels) and G5 (hide empty groups)

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
- phase 1: packet regenerated 2026-11-08 (unattended, staging/p5-balance-sheet/) against books main 66846ed (p5-general-ledger merged) and core main b021c3a; the 2026-11-06 packet is kept in `discarded-2026-11-06/`. Re-verified gaps: G2 dropped (replaced by G8), G6 dropped as a bump (fields at v4), G8 new.
- phase 3: design gate 2026-11-08 — human kept direction **A** (section › class › type › account; Current · Prior year · Change · % change; Retained earnings and Net income inside Equity). Q1–Q12 as in the packet's Decided questions. N1–N5 all as recommended: N1 new fields at spec version 4, no bump; N2 G8 replaces G2; N3 G8's derived-column output change accepted for every layout report; N4 take `exclusive` — the lane holds it now; N5 opened lines show Change and % change blank. Overlap with p5-journal-report: build now; whichever unit merges first adds `accountLabel` to `server/report_spec_helpers.go`, the other uses it; the two core checkpoint 0s are serialized by the exclusive claim. Core PR pre-approved to merge when its checks are green. No spark dropped. Spec self-review fixes: Customize lists Current too (core lists every column after the label); phone layout sentence about % change made unambiguous; design-gate decisions section added. Lessons added to docs/helix-lessons.md: list core's engine parts before writing a report spec; artboard toolbar defaults follow the packet's answers.
- phase 3 pass 2 (2026-11-08, unattended, core b021c3a): direction **A**; no spark dropped (the one spark is needs-extension: G1 + G5, drawn with stand-ins below). Fixture `tinycld/books/lib/balance-sheet-fixture.ts`: the artboards' book (starter-chart accounts, every class and type, Harbor Lane Design LLC, As of Today = 2026-11-08, prior day 2025-11-08), Accounts payable netting 0.00 on both days (hidden under Non-zero with its type, G5; shown under Active), Undeposited funds with no prior balance (% change blank), contra accounts negative, a long prepaid sub-account name, Retained earnings as the sample book's balancing figure (Total Assets 65,935.55 / 57,122.10 = Total liabilities and equity, checked), the opened checking account's six lines (Prior year 0.00 after the prior day, Change/% blank), the spec's params as `ParamDef`s, the phone/tablet `display.layouts`, and constants for the e2e spec (title, description, shipped key, labels, headings). Scratch route hands core `ReportView` a static `ReportViewModel` (p5-trial-balance / journal-report model). Not-yet-built core parts drawn as the spec says: **G3** dated headings put in the table columns' labels (Customize keeps "Current"/"Prior year"); **G7** hidden key columns absent from the result; **G1** ragged rows at the parent's depth, and `visibleRows` called without the spec because core `endsInSubtotal` reads `depth + 1` until `ResultRow.level` lands (with the spec, Equity accounts would lose their figures); **G4/G8** computed rows inside Equity with per-row Change/% change. Checkpoint 0 must re-capture every state after these land (the route then passes the real spec). Reference: 10 states in `docs/plans/balance-sheet-reference/` (populated at 390/1024/1280, the rest at 390/1280; light and dark): populated, opened, rows-active, collapsed, no-lines, customize, loading, error, timeout, no-access (a layout report has no empty state). Widths are measured on the scratch route, which renders the Books sidebar; the real route `/a/reports/<id>` has none, so its view is wider at the same window. The Books FAB ("New") is hidden. No human reference approval (unattended).
- phase 4 (2026-11-08, unattended): plan `docs/plans/balance-sheet-checkpoints.md`, checkpoint 0 (core G1, G3, G4, G5, G7, G8 + G9) and 3 package checkpoints; review mode C. Phone finding of phase 3 settled in core: G9 (plan decision P1) — an authored layout that does not fit at the full continuation indent is tried at fewer indent levels before core falls to automatic lines, so the 390 px view draws the spec's mobile layout (no % change). Plan review (staging/p5-balance-sheet/plan-review.md) findings fixed: `accountLabel` collides with `var accountLabel` in server/audit.go → `accountRowLabel` (P4); `byAccount` not open (Q8); e2e never asserts deltas on the shared DB (P7) and dated checks only on days ≤ the seed's day (P3, robust through seed year 2028); G5 class-level and hidden-skipped-row cases; G4 group-row cells; builder controls not offered where bind refuses; core help/docs check; drafts/voids on RE/NI; NoAccess leaks; Total L&E = TL + TE; % change text in e2e; Active hides line-less accounts; phone run reads header, chips, headings; each e2e owns its accounts; placeholders named (`opts.Expand`, depth from padding, `AccountType.Key/Group`, header test ids). Not taken: forcing the tablet wrap in e2e (one line fits down to ~620 px; core's fit tests drive it; P2).
- review mode switches: none

## Checkpoint 0
- do step 1 (writing-plans): core plan written, not committed: `/Users/nas/tmp/tinycld/books/tinycld/docs/plans/2026-11-08-report-engine-statements.md` (core branch books/p5-balance-sheet at main b021c3a; p5-journal-report's core checkpoint 0 not merged, so no rebase). 14 tasks in build order G7 → G1 → G5 → G3 → G4 → G8 → G9 → builder → help/docs → zoo_* statement test; verdict MAJOR. Names under Produces unchanged (added: `GroupBlankSkip`, `ColumnHeading`, builder `offers*` helpers, formula place `heading`). Plan review by an sdd-reviewer (staging cp/cp0-core-plan-review.md): 1 blocker, 8 major, 4 minor, every real finding fixed (planner report: staging cp/cp0-core-plan.md).
- open questions for the human in the core plan (each with a recommended answer): (1) G5 with "recompute" totals — hide groups the way a having does; (2) offer "Hide a group when every row in it is hidden" on bucketed levels.
- stopped (2026-11-08): do step 2 — the human's review of the core plan (spec §4: "writing-plans, then the human's plan review, then subagent-driven development, then the PR"). Resume at do step 3 (SDD of the core plan) when the human approves; fold the human's changes into the core plan first. Test writer, implementer and gates 1–3 not started.

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
