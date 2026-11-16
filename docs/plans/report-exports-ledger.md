# report-exports — helix run ledger

- mode: unattended
- unit: p5-exports
- started: 2026-11-15
- package branch: books/p5-exports (from books main fced471)   core checkout: books/p5-exports (from core main 416abf26)
- spec: docs/specs/report-exports-design.md
- checkpoints: docs/plans/report-exports-checkpoints.md
- reference: docs/plans/report-exports-reference/
- evidence: docs/plans/report-exports-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/report-exports-capture.json
- review mode: C — none (unattended)
- core extension: accepted at the design gate (checkpoint 0, small, no exclusive): report export/email routes, Go export formatter + shared case file, PDF/Excel/CSV writers, pdfrender and save-file moved from Books to core, Export menu + email dialog. tinycld PR: (opened after checkpoint 0, branch books/p5-exports)
- sparks:
  - 1 The exported page reads as a finished document → expressible (PDF first page: logo and brand color via branding.Load, heading, title, period, centered; ink on white)
  - 2 Quiet edge controls for the actions → dropped (the toolbar is outline text buttons with a "⋯" fold; an icon strip would be a second toolbar)
  - 3 The email form is complete when it opens → expressible (useForm default values in a core Dialog)

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
- phase 1: unattended; intake at staging/p5-exports/intake.md; no corrections.
- phase 3: design gate 2026-11-15 — human picked direction A (one Export menu, email in a core Dialog) and signed off the core change. Open questions Q1–Q16 accepted as recommended, with two changes: Q3 adds Excel (.xlsx) written in Go with omnidoc pkg/xlsx (formats PDF, Excel, CSV); Q13 the server names the file semantically from the report's saved name and its date (`<report name>-<date part>.<ext>`), not editable. Spec updated to match.
- phase 3 pass 2: reference captured (direction A), unattended, so no human approval of the reference and no corrections. Fixture `tinycld/books/lib/report-exports-fixture.ts`; scratch route `/a/books/helix-mockup?state=<populated|long-title|empty|disabled|preparing|download-failed|email-off|email|email-filled|email-invalid|email-refused|sending>`; manifest `docs/plans/report-exports-capture.json`; shots in `docs/plans/report-exports-reference/`.
  - The screen ships on core's route `/a/reports/<id>`, which has no package sidebar. The scratch route draws inside the Books layout, so its report area is narrower than the shipping view at the same window width. Measure every width and toolbar fold on the shipping route.
  - Core `ReportView` builds its own toolbar and takes no extra item, so the scratch route draws the view from the parts `ReportView` is made of (`ReportBackLink`, `ResponsiveToolbar`, `ReportControls`, `ReportNotices`, `ReportDocumentHeader`, `ReportBody`, `useTableLayout`) over a hand-built `ReportViewModel`, with one more toolbar item. Checkpoint 0 puts the item in `ReportView`.
  - Facts for the plan, found while building the reference:
    - `ResponsiveToolbar` folds a `custom` item into "⋯" as one row or as a `Menu.Sub`, never as rows of its own. The 390 reference shows the four entries as rows of "⋯" (through the toolbar's `moreMenu` prop, which the scratch route sets on a phone only). Checkpoint 0 needs a toolbar overflow form that lists an item's rows in "⋯", or the same `moreMenu` path in `ReportHeader`.
    - Core `Menu.Item` has no second line. The reference draws "Email sending is not set up" as a `Menu.Custom` text row under the disabled item. Checkpoint 0 either keeps that or adds a description to `Menu.Item`.
    - Core `Dialog` focuses its first focusable at open and takes `initialFocusRef`; To is the first field, so no focus hook is needed.
    - `useForm({ errors })` (react-hook-form 7.89) shows field errors with no submit; the reference uses it for the invalid state.
    - The dialog is `size="lg"` (480 px). "Attach as" is a core `ButtonGroup` (PDF, Excel, CSV). The attachment line follows the chosen format.
    - A separator stands before "Email report…" in the menu (as on the artboard).
  - Not sure about (for the critic and the plan): on a phone the spec's "Preparing…" has no button to show on, because Export is inside "⋯"; the reference shows the four "⋯" entries disabled while a file is prepared (`preparing-phone`), and nothing in the closed toolbar says a file is on its way. The inline error texts of the form (`EMAIL_FIELD_ERRORS`) are reference copy; the zod schema owns the final words.
  - Sparks: 3 (complete email form) is in the reference (`email-*`). 1 (finished-document page) is the PDF's first page, a file the server makes from a Go HTML template; no screen shows it, so it is not in this reference and gate 2 has no shot of it. It is not dropped. No spark dropped in pass 2.
  - No seed wiring: the feature has no collection; the seeded ledger already fills the shipped Profit and Loss report.
- phase 4: plan written, unattended (no human plan approval; review mode C). 5 checkpoints after checkpoint 0, with a Sizing line: 0 to 4 are core tasks (core repo, branch books/p5-exports), 5 is Books. `plan-check.mjs --unattended`: 0 errors.
  - Human decisions 2026-11-16: the feature slug stays `report-exports` (no rename). Plan decision D4 is accepted: core checkpoint 1 adds a core migration so `audit_logs.action` allows `report.export` and `report.email`; the spec's Data section now says so; the lane does not take `exclusive` for it.
  - Plan-check fixes: the omnidoc `xlsx` names in checkpoint 2's Consumes are written with their package (`xlsx.SheetEdit.SetString`, …), and the app shell's `tests/e2e/email-log-helpers.ts` exports are named with their file, because plan-check reads only the package and `tinycld/core`.
  - Plan review (fresh subagent; findings in staging `plan-review.md`): 5 BLOCK, 17 NOTE. All BLOCKs fixed:
    - B1 (cp1) the page-by-page test could pass with a first-page-only read (450 rows, page limit 1 000) → the test sets `runLimits.maxPage` to 100 and asserts the count, the first and last row, and no duplicate.
    - B2 (cp4) `CaptureLogOn()` read only `TINYCLD_EMAIL_LOG`, so email was off in dev though the spec says "dev and e2e" → also true under `--dev` (`devAutoLog`); D16; Go test in `core/server/mailer/log_test.go`.
    - B3 (cp2) the Excel test pinned `'=SUM(A1)` as the cell text; the apostrophe rule is the CSV's only → `RawCell` gives plain text, `writeCSV` adds the apostrophe with `csvGuard`; the Excel cell is the plain string; D15.
    - B4 (cp4) `ReportEmailDialog` had no heading and no period words for its defaults → props `{ model, heading, periodWords }`, passed by `ReportView` from the view model (it already has both).
    - B5 (cp3, cp4, cp5) e2e tests with more than one goal → cp5 test 2 loses the invoice download (the existing `pdf-preview` and `invoice-form-pdf` specs prove it); cp5 test 3 is the phone CSV only; cp3 test 4 keeps the states of the Export button, and the builder and drill-panel checks are one assertion each in existing core tests; cp4's Escape moved to test 1 and offline to test 2. D17 says a test may assert each state of the one control its goal is about. This rule was decided unattended.
  - NOTEs taken: `canExport(state)` and `exportOffered(...)` are pure functions with a table test over all nine view states (N1); Export's place after Copy link is asserted (N2); D18 for a reader who is not the owner (N3); the `report.email` row is checked in Settings → Audit log (N4); D13 for "and 1 other" (N5); D14 for `saveFile` (N6); the audit screen's action lists get the two actions, file named in cp1 (N7); the offline step names its precedent (N8); the `emailSender` seam for the 502 test (N9); the `params` case shape (N10); "keeps `today`" (N11); the full path of `composition_parity_test.go` (N12); `biome.json` in cp1 Files (N13); `reports-union-blank-above.spec.ts` in cp3's gate (N15); the sample helper holds no path (N16); `packages:generate` after the migration (N17). N14 needs no change (both checkpoints use the same refusal text).
  - A later phase must know: the checkpoint gates of core checkpoints run from the core repo; core e2e titles also start with `report-exports:`; the e2e budget is 12 (cp3 5, cp4 4, cp5 3).
- review mode switches: none

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
