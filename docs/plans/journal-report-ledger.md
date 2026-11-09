# journal-report — helix run ledger

- mode: unattended
- unit: p5-journal-report
- started: 2026-11-08
- package branch: books/p5-journal-report (from books main 66846ed)   core checkout: main b021c3af; checkpoint 0 on core branch books/p5-journal-report (not created yet)
- spec: docs/specs/journal-report-design.md
- checkpoints: docs/plans/journal-report-checkpoints.md
- reference: docs/plans/journal-report-reference/
- evidence: docs/plans/journal-report-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/journal-report-capture.json
- review mode: C — none (unattended)
- core extension: J1 (J1a paged group rows, J1b `options.collapse` fold list; spec §4) — checkpoint 0, core PR on branch books/p5-journal-report in tinycld, merges before checkpoint 1; MAJOR; the lane does NOT take `exclusive` for J1 (released by the human after the design gate: "the others will not conflict"). Core merge: ask the human (not pre-approved).
- sparks:
  - each transaction reads as one balanced block → expressible (core record group on `entry`, `open: true`, `subtotals: true`; Debit/Credit `rollup: sum`; core `ReportRow` subtotal style; no new token)

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
- phase 1: unattended; inventory from the Books design spec, the GL design and core report docs (staging intake.md); no human corrections.
- design gate (2026-11-08): human picked direction **A**; open questions Q1–Q9 all as recommended — Q1 build J1 in core checkpoint 0 (MAJOR, lane takes `exclusive`); Q2 block heading "<number> · <type>", type alone with no number; Q3 default period This month to date; Q4 Period param only; Q5 posted lines only, a voided entry and its void reversal both show; Q6 press-a-line-to-open cut to p5-drill-down; Q7 blocks by entry date, then posting order, then number sequence, lines in entry-form order, heading sort reorders lines inside a block only; Q8 line count in heading cut; Q9 direction A. Packet kept despite core PR #452 (report perf, merged after the packet's core 047f71cb). Core merge of the J1 PR: ask the human.
- design gate, spec §4 corrections against core b021c3af: `groupStatement` is in `run.go` (was named in `levels.go`; it was in run.go at 047f71cb too); `parentKeys`/`fillKeys` are in `fill.go`; packages.md lines to change named exactly (paging paragraph "group rows … read whole, at most 5,000", "What a report returns" cap, `options.expand` cap gains `options.collapse`); `run-client.ts` `RunBody`/`rowsKeyOf` gain `collapse`. Added the #452 paragraph: J1 keeps `recordJoins` (group record joined once per level), level lookup layers (`lookupsIn`/`lookupLayers`/`rowsFrom`), fill keysets over parent rows, per-run rule-topic cache (`stmt.topics`, `checkTopics`), and the `ledger_scale` golden.
- phase 3 pass 2 (2026-11-08, unattended, core main b021c3af, J1 not built): direction **A**; no spark dropped (the one spark is expressible: core record group, `open`, `subtotals`, Debit/Credit sums). Fixture `tinycld/books/lib/journal-report-fixture.ts`: October's 10 posted entries over the seeded e2e accounts (JE-41, TR-3, JE-42 with a 70-character customer and a long entry memo, JE-43 three lines with a line memo over the entry memo and a vendor, an entry with no number (heading "Journal entry" alone), JE-44 and TR-4 on one day in posting order, JE-45 "Reversal of JE-44", JE-46 and its "Void reversal of JE-46" with the same number), one fixture-only account with no number ("Undeposited Funds"), the All dates opening entry "JE-1 · Opening balances", core `RunResult`s for populated / one block folded / all collapsed / Debit sort inside blocks / All dates / first page ending inside a block, the spec's param, `display` (column fit and the phone and tablet layouts) and group flags. Entries are typed against the generated `BooksJournalEntries` (no migration in this unit). No seed wiring (spec §5: no source or seed change). Scratch route hands core's real `ReportView` a static `ReportViewModel` (the GL model); imports the fixture relatively. Reference: 12 states in `docs/plans/journal-report-reference/` (populated at 390/1024/1280, the rest at 390/1280; light and dark; 50 shots): populated, folded, collapsed, sorted, all-dates, more, customize, empty, loading, error, timeout, no-access. The Books FAB ("New") is hidden in every shot.
  - **Widths measured for the shipping route** `/a/reports/<id>` (no package sidebar; its table is 64 px narrower than the window: 836 / 960 / 1216 at 900 / 1024 / 1280, read on the shipped GL), by probing the scratch route at windows whose table width matches (+260 px Books sidebar): shipping 900 → **tablet**; 1024 → **one line**; 1280 → **one line**; 390 → mobile. No sideways scroll at any width. Never cut at any width: dates, Debit, Credit, block headings, Total labels. Cut with an ellipsis (allowed by spec §3): Description first, the 70-character Name, and an account name longer than the 20ch floor ("6210 Software Subscriptions:Design Tools"; "6200 Software Subscriptions" on a first page measured before the long name loads). **Decision: no `display.oneLine.minWidth`** (spec §5 condition not met). Note for the plan: at the one-line widths Name (~180–200 px) is drawn wider than Description (~160–170 px) despite `description.flexGrow: 2`, because core shares spare room by what each column lacks of its natural width; spec §3 says Description takes the most of the spare room — gate 2 or the plan should decide whether Name gets a `maxWidth`.
  - Reference correction (agent, not the human): phone layout line 3 places Debit at track 2 and Credit at track 3 (spec §5 amended), so Credit ends at the right edge.
  - No human reference approval (unattended).
- phase 4 (2026-11-08, unattended): plan `docs/plans/journal-report-checkpoints.md`, checkpoint 0 (core J1) + 3 Books checkpoints, 11 e2e runs (item 1's phone run folds into the phone test). Review mode C. Decisions D1–D6 in the plan. **D1 (pass 2 open point, Name wider than Description):** Name gets `maxWidth: "16ch"` beside its `minWidth: "16ch"` in the Books spec (no core change; route named by the driver for the human); spec §3/§5 and the fixture's `JOURNAL_DISPLAY` amended; a name over ~16 characters ends in an ellipsis at every width. The plan reviewer judged D1 unsound against the 2026-11-01 rule (preferred a core change weighting the lack share by grow, or a human spec amendment); kept, because that core change would refit every report and was not approved at the design gate — **shown to the human at the end**. **D3:** the long-section page seam falls inside the second block (133 + 67 = 200 rows); spec §7 item 7 amended. D4: `exclusive` released by the human. Plan-check 0 errors, 12 warnings (names produced by earlier checkpoints, not yet in source).
  - plan review findings fixed: header period and All dates asserted (e2e 2, 3); block-order test separates posting order from sequence; block longer than one page (Go `Limit` 3); e2e 9 counts rows from run answers (FlashList mounts part of a block) and guards shared days; 20-character Account and void-reversal heading/total checked at 390/900/1024/1280; phone chip text; blank-Debit place not asserted in the sort test; Customize column list pinned by the Go column list; checkpoint 0 gains `foldKeyOf` leaving out `collapse`, the place count over group rows, unfold / Collapse all cases, #452 pins (`ledger_guard`, `fillplan`, `balance_shape`) on paged and Total statements, the closed-group-counts-as-one-row assertion, and a next-page error row with Retry (`report-loading-more-error` / `-retry`); `TestJournalPaging` collapse assertion corrected; headings test names its Go model and `mkOpening`; registrations condition made one; `applyMax` location fixed. Full review: staging `plan-review.md`.
- review mode switches: none

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
