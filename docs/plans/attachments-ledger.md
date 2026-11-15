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
- core extension: E1 accepted — `PreviewModal` toolbar button roles and names, helix checkpoint 0 in core (branch books/p3-attachments; PR number not yet opened); small, not `exclusive`
- sparks:
  - The add-files target is a calm, wide, dashed area that invites a drop without shouting → expressible (core `DropZone` around `rounded-xl border border-dashed border-border`, `text-muted-foreground`, Lucide `Paperclip` in `useThemeColor('muted-foreground')`; as Books `BankFileDrop`)

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

## Final review
- eval: (pending)
- human comments and what changed
- native: not executed in this run
