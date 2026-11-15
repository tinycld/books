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
(none yet — every file touched that no checkpoint's Files block named, with why)

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
- phase 4: <plan-review findings fixed; review mode C (unattended)>
- review mode switches: none

## Final review
- eval: (unattended only) approved | revised → <notes, fix sha> | stopped
- human comments and what changed
- native: not executed in this run
