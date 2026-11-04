# trial-balance — helix run ledger

- mode: unattended
- unit: p5-trial-balance
- started: 2026-11-01
- package branch: books/p5-trial-balance   core checkout: books/p5-trial-balance (from core main 7a21579b)
- spec: docs/specs/trial-balance-design.md
- checkpoints: docs/plans/trial-balance-checkpoints.md
- reference: docs/plans/trial-balance-reference/
- evidence: docs/plans/trial-balance-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/trial-balance-capture.json
- review mode: C — none (unattended)
- core extension: report engine spec v2 (E1–E14) and the report formula editor (OQ2) — tinycld PR https://github.com/tinycld/tinycld/pull/424 (merged 2026-11-03, ba0eb769); checkpoint 0, merges before checkpoint 1; MAJOR, `exclusive` held by lane purchases until it merges. Runs as writing-plans → the human's plan review → subagent-driven development → core PR.
- sparks:
  - none — the report renders in core's report view (`ReportDocumentHeader`, ruled Total row); no spark to carry

## Deferrals
(none yet)

## Rebuttals
(none yet)

## Design notes
(none yet)

## Out-of-plan changes
(none yet)

## Phase notes
- phase 1: unattended intake (staging `~/tmp/tinycld/auto-helix-books/staging/p5-trial-balance/intake.md`). Design packet revision 1 designed around engine gaps; at the design gate (2026-11-01) the human set a binding rule: design without the limits of what reports support today; when something is missing, stop and implement it in core. Packet revision 2 turned every gap into a checkpoint 0 extension.
- phase 2: spec approved at the design gate, 2026-11-01. Answers: Q1 posted journal lines are the rows read (ADR 0002 rewritten); Q2 Debit and Credit by sign with totals that add the rows shown (E2); Q3 Rows Non-zero (default) / Active / All through `groups[].having` (E3) and `fill` (E4); Q4 server-maintained `books_accounts.full_name`; Q5 direction A; Q6 Accounts filter with options from a source (E8); Q7 opened rows labelled by `detail.label` (E7); Q8 + Q11 + OQ7 Books reports ship unpublished (E10) and Books shares them with every user who has Books read access, any role; Q9 `Field.TextDay` (E1); Q10 vendors and products wait for their units; Q12 rows keyed by account id (record groups, E4). OQ1 one exclusive core PR for E1–E13 + OQ2; OQ2 the builder's formula editor offers `if`/`case`/comparisons/`and`/`or`/`not`/`isEmpty`/`coalesce`/date parts/`lookup`/`record` through an optional operator-set prop on the forms `FormulaEditor`; OQ3 one retained-earnings account per chart (owners' starter chart gains 3900; the server refuses a second one and refuses deleting, deactivating or re-typing the only one); OQ4 E13 (groups open by default) built now; OQ5 `POST /api/reports/param-options` approved under the reports read exception; OQ6 `total: "rows"` adds only the rows shown, `recompute` totals every base row.
- phase 3: direction A picked (Account · No. · Debit · Credit, chart order); B and C retired; no spark dropped (none carried). Pass 2 (fixture, scratch route, reference capture) runs after checkpoint 0 merges.
- phase 3 pass 2 (2026-11-04, unattended, core main e71fe387): fixture `tinycld/books/lib/trial-balance-fixture.ts` (the e2e book's accounts plus `3900 Retained earnings`, a prior-year entry for the seed, the spec's params as core `ParamDef`s, run results typed against core `RunResult`, the Accounts picker's first page as `ParamOptionsPage`). The scratch route hands a static view model to core's real `ReportView` (chips, document header, table, Customize, states, the real source-backed Accounts picker); the capture spec answers `POST /api/reports/param-options` from the fixture for the picker shot (`fakeOptions`). Reference: 10 states × 390/1280 × light/dark in `docs/plans/trial-balance-reference/` (populated, opened, rows-all, filtered, picker, customize, empty, empty-filtered, loading, error). No human reference approval (unattended). Facts the capture showed, carried into the plan: (1) on a phone core's view wraps each row onto two lines (label, then No./Debit/Credit) with no sideways scroll (E14, added by the human after the spec was written), so spec §7 item 9 "the four columns scroll sideways inside the table" was stale and is corrected to the E14 behavior; (2) core's empty text is "No rows as of January 1, 1900" (`emptyMessage` writes the day in words), so §7 item 8's "Jan 1, 1900" is corrected; (3) core's hub opens on "Mine": a Books reader finds the shared Trial Balance under "Shared with me" (the first admin, its owner, under Mine).
- phase 4: (pending)
- review mode switches: none

## Checkpoint 0 (core, tinycld branch books/p5-trial-balance) — must merge before checkpoint 1
- scope: E1 `Field.TextDay`; E2 `columns[].total: "rows"`; E3 `groups[].having`; E4 record groups (`record` leaf, `groups[].label`, `groups[].fill`); E5 `sort[].formula`; E6 `lookup`; E7 `detail.label`; E8 `params[].optionsFrom` + `POST /api/reports/param-options`; E9 `Source.Heading` / result `heading`; E10 `Shipped.Unpublished`; E11 report e2e helpers exported via `@tinycld/core/e2e-helpers`; E12 spec version 2 + builder round-trip; E13 `groups[].open`; OQ2 report formula editor. Spec §4 has each change's engine, schema, client, builder and help parts.
- exclusive: held by lane purchases (MAJOR: spec v2, run and builder draft contracts, a forms-engine prop)
- status: merged 2026-11-03 (PR #424, ba0eb769); tasks 0–28 + 25e, 27a, final review and fix wave; `exclusive` released
- flash-list fork PRs: #1 (squash 8364a161) and #2 (squash 265c951d) merged; core pins 265c951d. Follow-up fork PR: isMomentumEnd correctedDataRef guard + a test hook for reports-scroll-anchor (replaces the React fiber walk)

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
