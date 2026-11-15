# audit-log — helix run ledger

- mode: unattended
- unit: p5-audit-log
- started: 2026-11-15
- package branch: books/p5-audit-log   core checkout: books/p5-audit-log
- spec: docs/specs/audit-log-design.md
- checkpoints: docs/plans/audit-log-checkpoints.md
- reference: docs/plans/audit-log-reference/
- evidence: docs/plans/audit-log-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/audit-log-capture.json
- review mode: C — none (unattended)
- core extension: checkpoint 0 on branch books/p5-audit-log in tinycld (T1 date-time cells in the reader's zone, T2 date ranges over a date-time in the reader's zone, T3 Select over a text column, D5 record panel beside a report via manifest `reportPanels`); MAJOR, no `exclusive` (human, 2026-11-15); merges at the next design gate, before the package PR. tinycld PR: not opened yet.
- sparks:
  - Event reads as words a bookkeeper says → expressible (Event, Record type, Record columns in core report cells, `text-foreground`; labels from Go select options, using core T3)
  - Date to the minute, zone once → needs extension (accepted: core T1 `dateTimeText` + header zone line, T2 `options.timeZone`)

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
- cp 0 (core): `docs/plans/2026-11-15-report-zone-times-and-record-panel-part-1.md` and `-part-2.md` — the Files block names only the outline file; the task bodies are in two part files (written in parallel, as the earlier core plans `2026-11-14-report-drill-down-part-*.md` are).

## Phase notes
- phase 1: unattended; no corrections to the extractions (intake in the staging folder). The design gate (2026-11-15) answered the packet's questions below.
- phase 3: direction **A** picked by the human at the design gate (2026-11-15): a report row opens the record's history in core's side panel beside the report at 1360 px and wider (core D5), its own screen below.
- design gate answers (human, 2026-11-15):
  - Q1 where a row's history opens: as recommended — A (panel at ≥ 1360 via core D5, screen below).
  - **Q2 who sees the Audit Log and record history: CHANGED from the recommendation (Books admins only).** Any reader who can see a record can also see that record's audit log, in the report rows, the Record history screen and panel, and the "Audit history" More items. Resolved in the spec §5 "Visibility rule": the view's list and view rule is Books `READ` (`books_access.can_read`), because every audited collection's list and view rule is `READ` and Books has no narrower per-record rule, so per-record visibility equals every Books reader; a Go test (`TestAuditLogRuleFollowsAudited`) fails when an audited collection's rule diverges. The admin-only parts were removed: `booksReportLevel`, the admin-level share sync and the `books_admins` share hooks ("Admin-level shipped report shares" dropped; the report is shared by the existing `books.*` share sync), admin gating of the More items (now every reader; More appears with Audit history alone where a reader had no other action), the admin-only no-access text, tests and help.
  - Q3 which events: as recommended — Books record writes only; sign-ins stay in core Settings → Audit log.
  - Q4 default date range: as recommended — This month.
  - Q5 line rows: as recommended — their own rows, opening their document's history.
  - Q6 Audit history in More menus: as recommended — added in this unit to DocumentReadActions, EntryActionBar, CustomerMoreMenu (gating per Q2: every reader).
  - Q7 date parts and buckets of a date-time: as recommended — only ranges and comparisons use the reader's zone; buckets keep the UTC day, documented in core docs/packages.md.
  - **Q8 `exclusive` for checkpoint 0: CHANGED from the recommendation (take it).** Checkpoint 0 does not take `exclusive`; it rebases on other report lanes' core changes as they merge. Removed from the spec.
  - Q9 spec version: as recommended — no bump.
  - Q10 a document's history includes its lines' events: as recommended — yes, through the view's `parent_type` / `parent_id`.
- phase 3 pass 2 (unattended, no human approval of the reference): direction A, no spark dropped. Fixture `tinycld/books/lib/audit-log-fixture.ts` (30 rows, Nov 12–14 2026, Central time; local `AuditLogRow` interface is replaced by the generated `BooksAuditLog` type in the migration checkpoint). Scratch route `tinycld/books/screens/helix-mockup.tsx` (git-excluded, deleted before the PR) draws core's real `ReportView` over a static model. Stand-ins until checkpoint 0: T1 date-time is the row label's preformatted text and the zone line "Times in Central Time" is a second `periodWords` line; the D5 panel is a Books view in ReportView's `side` slot styled as core's DrillPanel (480 px); the selected-row mark is not drawn. Checkpoint 0 re-captures report, panel and history shots. Capture manifest `docs/plans/audit-log-capture.json`, reference `docs/plans/audit-log-reference/` (report 1280/1440/1024/390/375, panel 1440, filtered, empty ×2, empty month, loading, error ×2, history 1280/390, history more/deleted/vendor/loading/error/empty/no-access). Measured fits (inside the Books sidebar; the shipping route /a/reports/<id> is wider): one-line@956 (1280), one-line@1116 (1440), tablet@700 (1024), tablet@636 (panel 1440), mobile@390, mobile@375. Decisions: `oneLine.minWidth` 760px; User and Record type have NO column minWidth (spec said 16ch / 14ch: with any User min the phone line 2 fell to automatic lines); phone layout tracks 7 (created 5 + event 2; user 2, type 2, record 3); a phone row truncates long user names ("Marco R…"). The capture spec copy puts widths in test titles and logs each table's `data-layout`.
- phase 4: plan `docs/plans/audit-log-checkpoints.md`, checkpoint 0 (core T1, T2, T3, D5) + 4; 12 e2e. Spec §5 `display` bullet edited to the pass 2 measures (oneLine 760px; no User/Record type least width). Review mode C (unattended). Plan review (34 findings, report in the staging folder `plan-review.md`), all fixed:
  - untested value rules → pure `fieldValueText`/`changedFieldRows` + `tests/audit-field-value.test.ts`; test 4 asserts no `name_key` row and no "Changed (hidden)".
  - line event form → P9 (title "Line N — Changed" + the table); test 6 now edits a draft line 120.00 → 150.00 before post.
  - header business name and period words → test 1 and `TestAuditLogSpecLoads` (`Heading`); view column whitelist → `TestAuditLogViewColumns`.
  - saved-draft More and read-only document/customer More → tests 11 and 12 extended; tablet layout beside the panel → test 9 reads cell tops.
  - `showMore` lives in `lib/customer-page-tabs.ts` (+ `tests/customer-page-tabs.test.ts:85`) → Files fixed, `showWriteItems` added; `journal-entries-actions.spec.ts:260,265` (`entry-actions` absent on void) → Files + ripple grep; `DocumentReadActions` null-return → Do 2.
  - `customerPath(id).path` is a pattern → test pins filled paths; `auditOpenLabel` → explicit map for settings/taxes/banking; `header.title` = record_label, type in `history-type`; back link `history-back` (EntryBackLink precedent); test 10 no longer relies on core resize behavior.
  - wrong names: `helpTopic` → `readHelpTopic`; `booksCurrency` → `formatMoney` with the record's or settings' currency; fixture `auditRow` exported in cp2.
  - Go/TS copies → P12 golden `server/testdata/audit_log_spec.json` + `tests/audit-log-fixture.test.ts`; hook test on `newRegisteredApp`.
  - P5 names all six collaborator tests; level helpers move to `tests/e2e/books-access-helpers.ts`.
  - cp0: chip/drill files named, opened row `aria-selected`, vitest command, salesstub templates + unit test + every salesstub spec in its gate.
  - open money-field list → closed by the field-map test; live record and relation reads → loading/error rules (P11, Do 4–5); More item while access loads → Do 2.
  - accepted as decisions: P10 (view sources are the line collections), P13 (no-access hub/link is Go + core e2e), P14 (Show 50 more proven by the hook test).
- review mode switches: none

## Checkpoint 0
- core plan: `tinycld` branch `books/p5-audit-log` (from main 9cc926c0, no newer main), `docs/plans/2026-11-15-report-zone-times-and-record-panel.md` (outline) + `-part-1.md` (Tasks 1–6: T3, T1 ×2, T2 ×2, D5 generator) + `-part-2.md` (Tasks 7–11: D5 rules, D5 view, docs and help, salesstub stub, e2e), commit 066ea78f (not pushed; the driver pushes). Written with writing-plans: one agent wrote the outline, two wrote the parts in parallel. 11 tasks, 19 rulings (R1–R19), 3 open questions (Q1–Q3), verdict MAJOR, no `exclusive` (Q8), spec version 4, no bump (Q9).
- plan review: two reviewers (coverage: 3 BLOCK, 5 NOTE; code accuracy, with `go test -overlay` on scratch copies: 2 BLOCK, 9 NOTE) → 17 items accepted and fixed (staging `cp/cp0-plan-fix.md`). Main fixes: the outline brought in line with the parts' 12 corrections; a core comment that named Books replaced by a fictional package; 12 one-time mutations in Task 11 Step 3 (and the `reportLink` vitest) so each e2e assertion is seen red; a Customize-closes-the-panel step; the Go statement-equality tests compare after `sameShape` (PocketBase names rule placeholders at random); the panel title is keyed by record path (a second row opening the same record blanked it); `readerZone` reads the client's UTC names; `isTwelveHour` falls back to `hour12`; a failed panel chunk retries (`reloadableChunk`); docs state the typed-day limit (Q3). Not fixed: code NOTE 7 (a period pivot or month group of a DateTime buckets by the UTC day even when the period is zoned) — decided by spec Q7; checkpoint 1's display must not pivot the audit log by month. Fix review: round 1 → 1 BLOCK (`sameShape` kept a param PocketBase binds but inlines, so `TestZoneUnknownOrLocalIsUTC` failed 3/3) fixed by the runner with the reviewer's verified code (passes `-count=5` on the reviewer's scratch overlay), 3 NOTE (R12 name and Task 8 Step 12 setup comment fixed; item 13 wording needs no change). Rounds: 1.
- open questions for the human (in the core plan): Q1 the row mark after a reload or a pasted link (recommended: the row id stays in the UI store; after a reload the panel shows with no row marked); Q2 the device zone read once per app start (recommended yes); Q3 a DateTime compared with a typed day stays UTC while a period chip is zoned (recommended: accept for now, documented).
- names changed versus the plan's Produces: none renamed; added names N1–N5 (outline "Names changed"; e.g. `ReportViewModel.zoneWords: string | null` required, `RECORD_KEY = 'dr'`, `clearedDrillKeys` also clears `dr`, stub panel path `panel`, stub files under `components/` and `screens/panel/[id]`).
- Books plan changes the core plan reports back (amend before checkpoint 1): B1 every computed column of the audit view needs `CAST(… AS TEXT)` (PocketBase types an uncast expression as json, which Select and Text refuse; `created` stays a bare `a.created`); B2 the row mark is not kept over a reload (Q1), so checkpoint 3's e2e asserts the mark only after a press; B3 below 1360 px with `dr` in the URL the panel is a page over the report with a back link (`report-record-panel-back`) and no ✕; B4 the scratch route's static model passes `zoneWords`; B5 `segments` for `books/history/<collection>/<id>` are `[<collection>, <id>]`; B6 the `reportPanels` entry works as planned; B7 a panel open closes Customize and Customize closes the panel.
- stopped: Do step 2 — the human's review of the core plan. Resume: fold the human's answers into the core plan, then subagent-driven development (Do step 3), Do 4 (Books consumers), Do 6 (gate 2, books side). Do 5 (the core PR) is the driver's.
- test writer, implementer, gates 1–3: not started (Do 3 onward).

## Final review
- eval: (unattended only) approved | revised → <notes, fix sha> | stopped
- human comments and what changed
- native: not executed in this run
