# report-drill-down — helix run ledger

- mode: unattended
- unit: p5-drill-down
- started: 2026-11-14
- package branch: books/p5-drill-down (from main 9b8984e)   core checkout: books/p5-drill-down (from main f201007)
- spec: docs/specs/report-drill-down-design.md
- checkpoints: docs/plans/report-drill-down-checkpoints.md
- reference: docs/plans/report-drill-down-reference/
- evidence: docs/plans/report-drill-down-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/report-drill-down-capture.json
- review mode: C — none (unattended)
- core extension: checkpoint 0 on core branch books/p5-drill-down (from main f201007) — D2 `detail.open`, D1 `columns[].drill`, D3 `from=` back link, D4 report-in-a-panel (`useOpenDrill`, `ReportDrillPanel`, `useReportView` `urlPrefix`/`uiScope`, detail-surface threshold moved to core); MAJOR, lane holds `exclusive`; human accepted 2026-11-14
- sparks:
  - figures read plain at rest, underline on hover → expressible (core `RowCell` `Link asChild` + `Pressable` `hovered` → `underline`; web hover signed off as platform item 1)
  - opened report names its origin and returns in one press → expressible (core `ReportBackLink` with the source title, D3)

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
- phase 1: none (unattended; intake in the design packet)
- phase 3: design gate 1 (2026-11-14): human replaced directions A/B/C with a hybrid — side panel on windows ≥ 1360 px (the Books detail-surface pattern), a separate screen below; Q1–Q10 accepted as recommended. Design gate 2 (2026-11-14): Q12–Q16 accepted as recommended (no history entry per panel open; panel shows chips, sort, line links only; panel becomes a page when the window narrows below 1360; threshold moves to core; panel 480 px); platform items signed off: web hover underline, ⌘-click / middle-click opens the full report in a new tab. Phase 3 pass 2 captures at 1440, 1280 and 390.
- phase 3 pass 2 (2026-11-14, unattended, core main f201007): direction **hybrid** (panel ≥ 1360 px, separate screen below). No spark dropped; both are drawn only in part until checkpoint 0: spark 1 (hover underline, `bg-muted` on the open figure) needs core D1 `RowCell`, so the statement's figures are plain in the reference and checkpoint 0 re-captures `statement` and `panel`; spark 2 (back link with the source title) is drawn by a scratch stand-in of D3 `ReportBackLink`. Fixture `tinycld/books/lib/report-drill-down-fixture.ts`: Transaction Detail by Account as core `RunResult`s over the P&L fixture's accounts (every Expenses account's posted lines add to its P&L Total; 6600 Rent or lease 18,000.00 = ten bills + a void pair; 6700 Repairs nets 0.00; Expenses 33,953.00), params, columns, phone + tablet `display.layouts`, `oneLine` 960px (measured: a 956 px row does not fit one line), drill values, and the P&L `amount@drill` cells on local `DrillTarget`/`DrillParams` interfaces that checkpoint 0 replaces with core's D1 types. Scratch route hands core's real `ReportView` / `ReportControls` / `ReportNotices` / `ReportDocumentHeader` / `ReportBody` static `ReportViewModel`s; the D4 panel (`report-drill-panel`, header, Open as full report, ✕, page form) and the D3 back link are stand-ins in the route. Widths here include the Books sidebar; the shipping route `/a/reports/<id>` has none (at 1440 the statement there keeps about 896 px beside the panel). Capture spec copy: test titles carry the widths so a state is loaded at each width (lesson 16). Reference: 22 shots × light/dark = 44 files in `docs/plans/report-drill-down-reference/`: statement (1280, 390), panel, panel-section, panel-empty, panel-loading, panel-error, panel-no-access (1440), panel-page (1280), screen (1280, 1024, 390), screen-section (1280, 390), screen-month (1280), screen-empty (1280, 390), screen-loading (1280), screen-error (1280, 390), screen-timeout, screen-no-access (1280). No human reference approval (unattended); no corrections.
- phase 4 (2026-11-14, unattended): plan `docs/plans/report-drill-down-checkpoints.md`, 4 checkpoints: 0 core report drills, links, drill panel (logic; core PR on `books/p5-drill-down`, D2 → D1 → D3 → D4; books-side gate 2 retypes the fixture to core's `DrillTarget`/`DrillParams` and re-captures `statement-*` + `panel-*`); 1 Transaction Detail report, line links (renders); 2 statement figures open Transaction Detail (renders); 3 drill panel, phone, help (renders). Plan decisions D1–D9: e2e 18 → 12 (panel mechanics in core `reports-drill.spec.ts` on salesstub); core owns loading/error/timeout/no-access; widths re-measured on `/a/reports/<id>` (no sidebar; 960px kept or raised, result recorded at cp1); fixture retype at cp0 gate 2, committed with cp1; `server/entry_routes.json` via go:embed + TS relative import; TB e2e as-of Today; `detail.open` on GL/Journal/P&L/TB in cp1; Accounts is a chip on every drill and under Add filter from the hub (core `controlItems` rule; a default would break "no account → every account"); TD paging/Customize left to core's generic specs. plan-check `--unattended`: 0 errors, 26 warnings (core-internal produced names; later-checkpoint names not in source yet). Plan review (general-purpose; report in staging `plan-review.md`): 44 findings, 0 placeholders. Fixed: core e2e helpers `rowOf`/`cellOf`/`chooseParamOption`/`waitForTableFit` gain a scope (cp0 Files); cp0 core e2e now covers builder preview + read-only text, hover underline/cursor, cell `href`, Back with no history, `from` not viewable, back-link loading/failure ("Reports"), Escape focus, no history entry, reload, panel sort, controls absent in panel, page-form header, page → panel on widen, press anywhere on a row, zero figure, panel loading/error/no-access (`reports-failure-states.spec.ts`); cp0 runs every `reports-*.spec.ts`; docs test file named; Accounts chip (D8) and Sort step (D9); `openTransactionDetail` uses Add filter; cp1 test 1 finds lines by memo, presses a non-label cell, asserts the header; cp1 test 4 asserts empty text + Clear filters; Go Display pin as literals; TB param lines 53–65; drill pins moved into `report_transaction_detail_test.go` (spec §5); `tdAccount()` node + `tdAccountOf()` drill value; `chooseAsOf` object form; retained-earnings check presses the cells under Rows All (`chooseRows` gains `'all'`); new Equity account in place of a missing precedent; Gate 1 runs every report-helper importer (plan rule) plus `products-services-list`, `journal-entries-read-only`, `account-register-drawer`; cp3 panel test asserts Date/No./Amount whole, statement width, live update; `waitForTableFit` scoped to the panel; help "Who sees Books reports" names Transaction Detail. None rejected.
- review mode switches: none

## Checkpoint 0/1/2 …

## Final review
- eval:
