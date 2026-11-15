# attachments — helix run ledger

- started: 2026-11-15
- mode: unattended
- unit: p3-attachments
- package branch: books/p3-attachments   core checkout: books/p3-attachments (core checkpoint 0, E1)
- spec: docs/specs/attachments-design.md
- checkpoints: docs/plans/attachments-checkpoints.md
- reference: docs/plans/attachments-reference/
- evidence: docs/plans/attachments-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/attachments-capture.json
- review mode: C — none (unattended)
- core extension: E1 accepted — `PreviewModal` toolbar button roles and names, helix checkpoint 0 in core (branch books/p3-attachments; core PR https://github.com/tinycld/tinycld/pull/478); small, not `exclusive`
- sparks:
  - The add-files target is a calm, wide, dashed area that invites a drop without shouting → expressible (core `DropZone` around `rounded-xl border border-dashed border-border`, `text-muted-foreground`, Lucide `Paperclip` in `useThemeColor('muted-foreground')`; as Books `BankFileDrop`)

## Deferrals
(none yet)

## Rebuttals
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
(gate-2 NOTEs the loop did not act on, as
`cp N · <shot>: <where> — <what>`; shown to the human at each checkpoint
and again at the end)
- cp 0 · reviewer A NOTE: core `file-viewer/previews/GenericPreview.tsx:34-42` (not in the diff) — the body's own "Download" `Pressable` has no `accessibilityRole` and no label. If it later gets `accessibilityRole="button"`, a generic-type preview has two buttons named "Download" and a strict by-role locator fails; checkpoint 2 should use `{ name: 'Download', exact: true }` scoped to the toolbar.
- cp 0 · reviewer A NOTE: core `file-viewer/PreviewModal.tsx:135-142` — a consumer action whose label contains "Download", "Next file", "Previous file" or "Close preview" would make a substring by-role locator ambiguous. Books passes no `actions`. Checkpoint 2: use `exact: true` in the by-role locators.

- cp 1 · reviewer A NOTE 5: `server/attachments.go` `checkAttachmentUpload` requires an allow-listed extension as well as the sniffed type, while spec §3.2's client rule takes the reported type first and the extension only when the type is empty. A file with a correct type but no extension (core `picked-file.ts:44` names a nameless native document asset `document`) passes the client and is refused by the server with the type text. Checkpoint 2's `attachmentIssue` should require the extension too, so both sides agree.
- cp 1 · reviewer A NOTE 6: `server/attachments.go` size and type checks run in the create-request hook, before PocketBase's create rule, so a read-only member who uploads a 21 MB file reads the size text instead of an access refusal. Leaks nothing.

## Out-of-plan changes
- cp 1 · `docs/plans/attachments-capture.json` — biome formatting only (content unchanged); `tinycld-pkg check` refused its format.
- cp 1 · `server/sales_documents.go`, `server/sales_document_posting.go` — comments only: the `Replace` comments named only the invoice's estimate; they now name the attachments move too.
- cp 1 · `tinycld/books/types.ts` — re-exports the generated `BooksAttachments`, which the fixture and `tests/attachments-fixture.test.ts` import from `../types` as the sibling fixtures do.

## Phase notes
- phase 1: design gate 2026-11-15 (unattended; corrections and answers given there). Extractions, triage and `[?]` list as in the design packet; no correction to them. Core extension E1 accepted as helix checkpoint 0 in core (small change, not `exclusive`).
- design gate (phases 1–3 pass 1): direction A picked — attachments list and dashed add area in the shared footer's notes column, under Memo (artboards B and C cut).
- design gate answers (all as recommended in the packet):
  - Q1: writers add and remove attachments on drafts and posted bills and expenses (no ledger effect; audited); a void document's attachments are read-only.
  - Q2: type allow-list (PocketBase `mimeTypes`, checked in the client first): PDF; JPEG, PNG, GIF, WebP, HEIC/HEIF; plain text and CSV; xls, xlsx, doc, docx. HTML, SVG and executables refused.
  - Q3: at most 25 attachments per document (server guard).
  - Q4: a correction lists the original's files ("From <noun> <number>", open only); on post the server moves them to the correction in the posting transaction; the void original says "Moved to <number> (edited)".
  - Q5: in the form, adds and removes are pending and run in a `useRecordSave` attachments step after the rows step and before the post step; a failed upload stops the save with the draft saved and the row showing Retry. In a posted document's read view, a file uploads at once.
  - Q6: forms host `files` storage on `books:bill` and `books:expense` in `books_attachments`, so custom File fields work.
  - Q7: Copy does not copy attachments.
  - Q8: Attach files is ⌥A on the form and the read view, registered only while the add area shows.
  - Q9: 20 MB per file (`maxSize`); files count toward the organization's storage quota.
  - Q10: E1 accepted (core `PreviewModal` button names, checkpoint 0 in core, no `exclusive`).
- platform approvals (each approved explicitly by the human at the design gate, 2026-11-15):
  - P1: drag and drop onto the attachments area is web only (core `DropZone` is a plain view on native); native adds files through Attach files.
  - P2: "Take photo" is offered on native only, through core's chooser sheet; web opens the browser file input.
- spec wrap-up self-review (2026-11-15): §3.1 a contradiction fixed (the area stays drawn, disabled, while writes are unavailable; it is hidden only for a reader or a void document); §4 the delete rule's "rule or Go guard" choice settled as a Go delete-request guard inside `serialized` (a request hook, so the Delete draft cascade is not refused); §4 the Q2 MIME allow-list written out, and the client falls back to the file extension when the reported type is empty; §3.2/§4 the 25-file count includes custom File field rows and, on a correction, the replaced document's rows (so the move on post never passes 25); placeholder ellipses in messages written out.
- phase 3 pass 2 (2026-11-15, unattended): direction A built and captured (16 shots, 50 files in docs/plans/attachments-reference/, manifest docs/plans/attachments-capture.json). Fixture `tinycld/books/lib/attachments-fixture.ts` types `AttachmentRecord` as a local interface mirroring spec §4: the migration checkpoint that creates `books_attachments` must replace it with the generated `BooksAttachments` type (with `satisfies`) and wire `SEED_ATTACHMENT_IDS` into seed.ts. Scratch route `/a/books/helix-mockup?state=…` draws only the header and the footer (Memo, Attachments, totals, stamp), not the band or the lines. States: form-new, form-draft, form-refused, form-failed, form-correction, form-offline, posted, posted-empty, expense, reader, reader-empty, void, moved, loading, error, remove. Spark (calm dashed add area) built with core `DropZone` + `rounded-xl border border-dashed border-border`; not dropped. Reference limits: image rows show the type icon, not a core `Thumbnail` (the fixture has no stored file); the `PreviewModal` is not captured (core component, E1 changes only its names); the form-failed save notice text ("The bill was saved as a draft. 2 attachments did not upload. Save draft or Post tries them again.") and the quota refusal text in the fixture are placeholders the plan must settle. No human corrections (unattended).
- phase 4 (2026-11-15, unattended): plan `docs/plans/attachments-checkpoints.md`, checkpoint 0 (core E1, PreviewModal names) + 4 (data/guards/seed · list and preview · add and remove in the read view · pending files on forms + help); plan-check 0 errors (57 warnings: produced leaf names and earlier-checkpoint consumes). E2E budget 11 of 12, all in `tests/e2e/attachments.spec.ts` with `attachments:` titles. Phase 3 items settled: image rows use core `Thumbnail` (the reference's icon is a design note); `PreviewModal` gets built shots `preview-*` with no reference; save notice `The bill was saved as a draft. 1 attachment did not upload. Save draft or Post tries it again.` (plural "them"; expense noun); the quota text is core's sentenized message (fixture updated in cp1). Spec alignments: the save step goes in `useDocumentSave` (documents do not use `useRecordSave`); `thumbs: ['40x40']` (core Thumbnail requests `${size}x${size}`); the server checks size and type in the create-request hook so the spec texts reach the client; one attachment query per document, read in `useDocumentScreen` and split by a pure helper (the count needs custom-field rows); the stored-row date is `Nov 14` (UTC, no year); p5-audit-log is not merged, so its "Attachment" record-type option is a merge-time item for p5-audit-log. Plan review (fresh subagent, 39 findings), all fixed in the plan: correction rows load with only `replaces`; `startWrittenUpdate` "has writes" defined; Post & new and no-edit post cases; delete refusal text via `writeRefusalText`; date format; download name assertion; real-byte test files, no `.xlsx` upload; server type rule = extension + sniffed type; loading test; form loading/disabled/offline; recovery merged in `useDocumentScreen`; token/thumb check; void read-only e2e; Cancel restores a pending removal; drop overlay and offline drop; full Tab order; ⇧? group; `splitAttachmentRows` unit; kind fields (`SalesDocumentKind`); noun case; `attachmentLabel(app, r)`; `throttleProgress(loaded, total)`; one upload-state type; `TestRegister_WiresEverything`; audit hook count on a parts app; banking regression specs `banking-upload`/`for-review`; `tests/upload-stub.ts`; migration precedent path; seed uploader `ctx.user.id`; thumb rationale; `serializedRequest` 204-before-commit note; remove dialog title/message. No rebuttals.
- review mode switches: none

## Checkpoint 0
- test writer: not dispatched — the checkpoint adds no tests ("None in core"; checkpoint 2's `attachments: read view` e2e proves the names). Runner confirmed `command grep -rln PreviewModal tinycld/core --include='*.test.*'` finds no core test; untestable: none
- implementer: added `accessibilityRole="button"` and the labels "Previous file", "Next file", "Download", "Close preview" to the four toolbar `Pressable`s, and `accessibilityRole="button"` to the action `Pressable`, in core `core/file-viewer/PreviewModal.tsx`; DONE
- test disputes: none
- self-declared differences: (1) no commit/push/PR by the implementer (the runner commits, the driver pushes and opens the core PR); (2) existing JSX logic in `PreviewModalContent` (`&&` renders, `filter().map()`, inline `onPress`) left as it was, because the checkpoint says "Change nothing else"
- gate 1: tests unedited: yes (none) · pass (core `tinycld-pkg check` exit 0; `pnpm run check:core-isolation` exit 0)
- gate 2: n/a (logic checkpoint)
- gate 3 A (correctness): 0 BLOCK, 2 NOTE (to Design notes)
- gate 3 B (conformance): script lines: 0 · 0 findings
- fix review: n/a (no fix round)
- gate 3 A notes: 2, listed under Design notes
- reviewer-caught deferrals: none
- commit: core 028b2bcbbbc09e268ae3d5f8d055f1e08255ec45 (tinycld, branch books/p3-attachments); core PR https://github.com/tinycld/tinycld/pull/478; this ledger row is committed with checkpoint 1
- human: review mode C, no message
- mistakes: one stray implementer dispatch with no task (it made no change; retro log)

## Checkpoint 1
- test writer: `server/attachments_test.go`, `server/attachment_move_test.go` (new), `server/audit_test.go`, `server/oauth_scopes_test.go`, `server/registrations_test.go`, `tests/attachments-fixture.test.ts` (new), `tests/bill-host.test.ts`, `tests/expense-host.test.ts`, `tests/collections.test.ts`; red for the right reason: yes (Go through the build failure on the missing names; 9 vitest cases; 4 fixture cases red in tsc only, since the fixture data was already right); untestable: none. Differences from the brief: a read-only member's create is asserted as 400, not "403/404" (PocketBase answers 400 when a create rule fails; `TestBankUpload_OnlyWritersUpload` pins the same); PocketBase's sniffer identifies the `.xls`, `.doc`, `.xlsx`, `.docx` samples as their own allow-listed types, so the generic-container rule is not needed; added `TestAttachments_Schema` and a collections case for `uploaded_by` → users.
- implementer: migration `2100000019_create_books_attachments.js` (19 still free), `server/attachments.go`, `serializedRequest`, `moveAttachments` from both kinds' `Replace`, quota/audit/OAuth entries, `files` on both forms hosts, fixture on `BooksAttachments` with the quota text and `billCustomField`, `lib/attachment-seed-files.ts` (PDF 678 B, PNG 505 B, JPEG 813 B), `seedAttachments`; DONE
- test disputes: none
- self-declared differences: (1) no generic-container type rule: the Go rule is the extension list AND PocketBase's `validators.UploadedFileMimeType(attachmentMimeTypes)` (the schema's own detection); (2) the update guard also lets PocketBase empty `uploaded_by` when the uploader is deleted (`deleteRefRecords` → `SaveNoValidate` runs `OnRecordUpdate`; refusing it would block deleting any uploader); (3) `stampAttachmentUpload` cuts `f.OriginalName` to 255 bytes on a rune boundary, a workaround for the PocketBase fork's byte cut of `original-filename` metadata (`tinycld/third_party/pocketbase/tools/filesystem/filesystem.go:290-294`), which splits a rune and fails the upload — core change request below; (4) `moveAttachments` uses `tx.RunInTransaction` (joins the posting transaction; opens one for a direct call so the move mark works); (5) a delete reads the parent through `attachmentParent`; (6) `ATTACHMENTS` is `[...] satisfies AttachmentFixtureRow[]`, `ATTACHMENT_SEED_FILES` keyed by the seeded ids.
- core change request (for the driver): the PocketBase fork cuts `original-filename` metadata by bytes (`third_party/pocketbase/tools/filesystem/filesystem.go:290-294`), so an upload with a long multibyte name fails with "Failed to create record." in every package (Books `stampBankUpload` too). Make the cut rune-safe in core; then delete `truncateUTF8Bytes` and the `f.OriginalName` line in `server/attachments.go` (its comment says so).
- gate 1: tests unedited: yes · pass (`packages:generate`; `tinycld-pkg check` 279 files / 5580 tests; `go test ./...` ok; `bill-form.spec.ts` 15 passed; `expense-form.spec.ts` 12 passed). Seen during the build: a dev server of this workspace (`tinycld/server/app --dev … --typesDir …/core/types`) rewrote `core/types/pbSchema.ts` once; `packages:generate` right before the check restored it.
- gate 2: n/a (logic checkpoint)
- gate 3 A (correctness): BLOCK 1 (a create on a posted original did not count the rows of a draft correction that replaces it, so a posted correction could hold more than 25) accepted+fixed (`checkAttachmentCreate` adds every same-kind draft whose `replaces` is the parent; test `TestAttachmentUpload_AnOriginalCountsItsDraftCorrectionsFiles`, bill and expense). NOTE 2 (core workaround) → comment names the core fix, core change request above. NOTE 3 (no test for the uploader clear) accepted → test `TestAttachments_TheUploadersDeleteOnlyEmptiesUploadedBy` (proved red with the exception disabled). NOTE 4 (`serializedRequest` comment claimed the client shows the row again) accepted+fixed. NOTE 7 (comment wrap) accepted+fixed. NOTEs 5, 6 to Design notes; NOTEs 8–11 out-of-plan/test-change notes, recorded under Out-of-plan changes.
- gate 3 B (conformance): script lines: 0 · findings 1–4 (out-of-plan files) recorded under Out-of-plan changes, kept; 5 (core workaround) as A NOTE 2; 6 (no test for `isUploaderCleared`) accepted, test added; 7 (comment wrap) fixed; 8 (`attachmentLabel` read the bill and the expense by two different forms) fixed.
- fix review: round 1: clean (fix diff of 4 files, 0 conformance lines); gate 1 run again green (check, go test, both e2e files)
- gate 3 A notes: 2, listed under Design notes
- reviewer-caught deferrals: none
- commit: the commit that adds this row, `feat(books): attachment data, guards, and seed`
- human: review mode C, no message
- mistakes: the runner's fix finding 1 named the wrong refused create (the test writer corrected it); the fix test writer disabled the guard in the real source instead of a scratch copy (reverted at once; retro log)

## Final review
- eval: (pending)
- human comments and what changed
- native: not executed in this run
