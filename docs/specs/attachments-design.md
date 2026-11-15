# Attachments — design

Unit p3-attachments · package books · feature `attachments`. Approved at the design gate (2026-11-15): direction A; the open questions answered as recommended; platform items P1 and P2 approved; core extension E1 accepted. Built against books `main`@7bb9419 (p3-bill and p3-expense merged) and core `main`@9cc926c.

## 1. Goal
A writer keeps the vendor's bill or the receipt with the bill or expense it supports: they add files to it, and everyone who can read the document opens them in the app.

## 2. Where it lives
- No new route. An **Attachments** section in the shared document layout (direction A: in the footer's notes column), shown only by the kinds whose `features.attachments` is on: the bill and the expense. Invoice, sales receipt and estimate do not show it.
- Form (`DocumentForm` footer): the left column, under Memo; on a phone or when the lines draw as cards, after Memo in the stacked footer.
- Read view (`DocumentReadView` `ReadFooter`): the left column, under Memo, above the Posted by / Voided by stamps; on a phone after Memo.
- Section heading "Attachments" (`text-sm font-semibold text-foreground`, as the line-table headings) with a count when there is at least one file ("Attachments (2)") and the limit text "Up to 20 MB each" (`text-sm text-muted-foreground`) beside it. The limit text shows only where a file can be added: for a writer on a document that is not void. A reader, a void document and a replaced (moved) original show no limit text.

## 3. Behavior

### 3.1 The add area
- A dashed area (core `DropZone` around a `View` `rounded-xl border border-dashed border-border`, Lucide `Paperclip`) with the prompt — web: "Drag files here or choose them"; native: "Add a photo or a file" — and an outline button **Attach files** (core `ShortcutButton`, §3.7).
- Web: dropping files on the area adds them; a drag over it shows `DropZone`'s overlay "Drop files to attach". Native: no drop (P1, approved).
- **Attach files** calls core `usePickFiles` with `multiple: true`: web opens the browser file input; native opens core's chooser sheet with Take photo, Photo library and Files (P2, approved). The picker opens inside the press or key event (a browser opens a file input only from a user gesture).
- When the document has attachments the area shrinks to one row (paperclip, prompt, button) under the list, so the list leads. With none it is the full-height prompt (about 96 px).
- The area is not drawn for a reader or on a void document. While writes are unavailable (`useServerActionState().isDisabled`) the area stays drawn, so the layout does not jump: **Attach files** is disabled and a drop is refused.

### 3.2 When a file is stored
- **Read view of a posted document** (writer): a picked or dropped file uploads at once, one request per file, each row showing its progress (§3.3). There is nothing to save.
- **Form** (new, draft, correction, copy): picked and dropped files are **pending**. They show in the list with the label "Not saved yet" and count as an edit (Cancel opens the discard dialog). Save draft, Post and Post & new upload them after the document row and its lines are written and before the post step (`useRecordSave` gains an attachments step after the rows step). Removing a stored attachment in the form is pending too: the row hides and the delete runs in the same step. A failed upload stops the save there: the document stays saved as a draft, the failed row shows its error with **Retry** and **Remove**, and the form stays open (as "a post refused after the draft was written leaves the draft and shows the refusal"). Pressing Save draft or Post again retries every failed file.
- Pending files live in a Books Zustand store keyed by the form session (not React state), so they survive a re-render and are dropped when the form unmounts or Cancel discards.
- Every file is checked before upload:
  - over 20 MB — "<name> is larger than 20 MB.";
  - a type not on the allow-list (§4) — "<name> is not a file type Books keeps. Attach a PDF, an image, or an office or text file." The client checks the file's reported MIME type; when the reported type is empty it checks the file name's extension (`.pdf`, `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.heic`, `.heif`, `.txt`, `.csv`, `.xls`, `.xlsx`, `.doc`, `.docx`);
  - over 25 attachments on the document — "A bill holds at most 25 attachments." / "An expense holds at most 25 attachments." The count is every stored, uploading and pending row of the document (section rows and custom File field rows), less pending removals; on a correction it also counts the attachments of the document it replaces, because they move to the correction when it posts (§3.6).
  A refused file is not added; the message shows under the area (`accessibilityRole="alert"`, `text-danger`) until the next add.

### 3.3 The list
- One row per file, in upload order (oldest first): a 40 px thumbnail (core `Thumbnail`, `?thumb=40x40`) or the type icon (`getFileIconForMime`). The thumbnail rule: a type core renders (`thumbnails.CanGenerate`: HEIC, HEIF, WebP, PDF, DOCX, XLSX and the other document types core lists) gets a JPEG thumbnail the server generates after the upload (§4), and the row draws that file; a JPEG, PNG or GIF draws PocketBase's own `?thumb=` of the stored file; any other type, and a rendered type until its thumbnail is stored (or when the render fails), draws the type icon. The realtime update that stores the thumbnail redraws the row; the file name (one line, `numberOfLines={1}`, ellipsis at the end; the type shows in the thumbnail or icon); and a second line "1.2 MB · Ana Lopez, Nov 14" (size, uploader, upload date; a pending row: "1.2 MB · Not saved yet"; an uploading row: "Uploading… 45%"; a failed row: the error in `text-danger`).
- A row is a button that opens the file (§3.4). A writer's row has a trailing **Remove** icon button (Lucide `X`, `accessibilityLabel="Remove <name>"`), hidden on a void document and for a reader.
- Remove in the read view opens a core `ConfirmDialog`: "Remove <name>? It is deleted from this bill." (expense: "It is deleted from this expense."), action **Remove** (destructive). Remove in the form needs no dialog (it is pending; Cancel restores it).
- Wide: the list is one column in the footer's left span (the notes span). Phone: full width, rows at least 44 px high.
- Loading: the section shows one skeleton row while the attachment query loads. Load error: "Attachments could not be loaded." with **Retry** (core `recoverLiveQueries` through the screen's merged recoveries, Books `lib/live-recovery.ts`); the rest of the document still shows.
- Empty: a writer sees the full add area (§3.1); a reader, or anyone on a void document, sees "No attachments" (`text-sm text-muted-foreground`), so a reader knows none exist.

### 3.4 Opening a file
- Pressing a row opens core `PreviewModal` on that file: images, PDFs (web and native), text and the rest through core's preview registry (`GenericPreview` offers Download for a type it cannot draw). Previous / Next move through the document's attachments in list order; Download (`downloadFile`: a browser download on web, the share sheet on native); Close and Esc close it. The toolbar buttons have the accessible names "Previous file", "Next file", "Download" and "Close preview" (core E1, checkpoint 0).
- The file field is protected, so the preview and thumbnail URLs carry a file token (`useAuthedFileURL` / `useAuthedThumbnailURL`).
- A pending file (not stored yet) does not open; its row is not a button.

### 3.5 Who can do what
- Readers (any Books access that reads bills and expenses) see the list and open and download files.
- Writers (bookkeeper or admin) add and remove files on a draft and on a posted document; the ledger does not change, and the audit log records each add and remove. A void document's attachments are read-only. The server enforces this (§4); a refused write shows the server's message on the row.
- Offline / server not taking writes: add and remove disable; open still works for a file already fetched.

### 3.6 Lifecycle
- **Delete draft**: the draft's attachments and their files are deleted with it (relation cascade).
- **Copy** (`?copy=`): attachments are not copied; the copy starts with none (a new bill or expense needs its own vendor bill or receipt).
- **Edit of a posted document** (`?replaces=`, a correction): the form lists the original's attachments under the label "From <noun> <number>" (open only, no Remove), followed by the correction's own. New files are pending and upload to the correction at its first save. When the correction posts, the server moves every attachment of the original (section rows and custom File field rows) to the correction in the posting transaction, so the posted correction holds all of them; the original (now void, "Replaced by …") lists none and says "Moved to <number> (edited)" under its Attachments heading. Files are moved, not copied.
- **Void**: attachments stay and become read-only.
- Attachments are not part of the document's `revision`: adding or removing one does not move a draft's revision, and a stale-revision refusal never drops pending files.

### 3.7 Keyboard
- **Attach files**: ⌥A (`ShortcutButton` with the screen's `scopeOwner`), registered only while the add area shows, in the ⇧? group "Bill" / "Expense" on the form and in the read view's group. Web and iOS hardware keyboard (standing approval).
- Tab order: Memo → each attachment row (open) → its Remove → Attach files → action bar. In the read view the rows follow Memo the same way.
- In `PreviewModal`, Esc closes (core Dialog); Previous / Next are named buttons (E1).

### 3.8 Custom file fields
- Both hosts declare core forms `files` storage in `books_attachments` (§4), so a custom **File** field an admin adds to a bill or expense form works through core `FileField` (today it shows "Bill has no file storage."). A custom file field's rows carry its key in `field`; the Attachments section lists only rows whose `field` is empty. The same type, size, count and status rules apply to both.

### 3.9 Elsewhere in Books
- Storage quota: `books_attachments` counts toward the organization total (`quotaSources()` in `server/quota.go`, no owner field); the core quota refusal shows on the row.
- Audit: `books_attachments` creates and deletes are audited, labelled "Attachment <name> on Bill 1003" or "Attachment <name> on Draft expense". The record-type label "Attachment" goes into p5-audit-log's `auditRecordTypeOptions()` (`server/audit.go`) and `lib/audit-fields.ts`: this unit adds it when p5-audit-log merged first; otherwise p5-audit-log adds it.
- OAuth: `books_attachments` joins the Books scope (`server/oauth_scopes.go`), read for read, write for write.
- `TestRegister_BindsEachPartOnce` hand list gains the new hooks.
- Help: new topic `help/attachments.md` (id `books:attachments`): how to attach a vendor's bill or a receipt (drop on web, Attach files, Take photo on a phone), the 20 MB limit and the types, that files on a new or edited document are stored when you save, opening and downloading, removing (who, and not on a void document), what Edit, Copy, Void and Delete draft do to attachments, ⌥A. `help/bills.md` and `help/expenses.md` link to it (`help://books:attachments`).

## 4. Data
- New migration (the next free number in `pb-migrations/` at build time): collection **`books_attachments`**:
  - `bill` (relation `books_bills`, optional, cascade delete), `expense` (relation `books_expenses`, optional, cascade delete) — exactly one is set (Go guard);
  - `field` (text ≤ 40; empty for the Attachments section, a custom field key otherwise);
  - `file` (file, required, one file, `maxSize` 20 971 520, `protected: true`, `thumbs: ['80x80']`, `mimeTypes` the allow-list: `application/pdf`; `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/heic`, `image/heif`; `text/plain`, `text/csv`; `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`). HTML, SVG and executables are refused, because a stored file opens from the app's own origin;
  - `thumbnail` (file, optional, one file, `maxSize` 2 097 152, `protected: true`, `thumbs: ['40x40']`, `mimeTypes` `image/jpeg`) — a JPEG of at most 480 × 360 that the server generates for a type core renders; empty for any other type;
  - `name` (text ≤ 255), `size` (number, int ≥ 0), `uploaded_by` (relation users, optional) — written by the server from the upload and the auth record, whatever the client sent (core `FileField` sends `size` and the uploader, so the create rule does not refuse them);
  - `created`, `updated`. Indexes on `(bill, created)` and `(expense, created)`.
  - Rules: list/view READ; create WRITE; update null (an attachment never changes; the server's own move and thumbnail store are Go saves); delete WRITE.
- Go (`server/attachments.go`):
  - a create-request hook stamps `name` (the upload's original name, trimmed to 255), `size` and `uploaded_by`;
  - a create guard inside `serialized` refuses: both or neither parent set; a void parent ("This bill is void. Its attachments can't change." / "This expense is void. Its attachments can't change."); the 26th attachment of a document ("A bill holds at most 25 attachments." / "An expense holds at most 25 attachments."), counting every row of the document and, for a correction, the rows of the document it replaces;
  - a delete-request guard inside `serialized` refuses a void parent with the same message (a request hook, so the relation cascade of Delete draft is not refused);
  - `moveAttachments(tx, from, to)`, called by the bill and expense correction posting step in the posting transaction, re-points every row of the original to the correction (a row keeps its thumbnail);
  - the background render (`server/attachment_thumbnails.go`): after a create commits, when core `thumbnails.CanGenerate` accepts the type of the stored name's extension, a background job reads the stored file, renders it with core `thumbnails.Generate` (480 × 360, under a timeout) and, once the server is writable (`readonly.WhenWritable`, bounded by `readonly.TailWait`), sets `thumbnail` on a fresh copy of the row. A row deleted meanwhile, or a render that fails, logs a warning and keeps the type icon. The update guard admits only this store of a thumbnail on a row that has none, beside the move and PocketBase's clearing of a deleted uploader; every other update is refused with "An attachment is not changed. Remove it and attach the file again.". The store makes no audit row (core audit logs request hooks only), and the quota counts `size` only (the thumbnail is not the person's file);
  - registers the quota source, the audit collection and the OAuth scope entry.
- Forms hosts `books:bill` and `books:expense` (`forms/hosts.ts`): `files: { collection: 'books_attachments', recordColumn: 'bill' | 'expense', fieldColumn: 'field', sizeColumn: 'size', uploaderColumn: 'uploaded_by', nameColumn: 'name', fileColumn: 'file' }`; `columns` unchanged (no column added to the host collections). No new built-in: the section is a Books part of the document layout, fixed in the footer, not movable in Settings → Forms.
- Client: `books_attachments` in `collections.ts` (`...onDemand`, relations `uploaded_by` → users); the section reads its rows with one `useLiveQuery` (`where` the parent id and `field = ''`, `orderBy created`), the uploader through `materialize()`; writes: upload through core `uploadRecordWithFile` then `acceptServerRow` (the sanctioned file-bytes exception, as `useBankFileUpload`), delete through `useMutation` (`collection.delete`). The upload error text reuses Books `uploadErrorText` (moved from `lib/bank-connections.ts` to a shared `lib/upload-errors.ts`).
- Kind flag: the document kinds' `features` gain `attachments` (bill and expense on).
- Seed (`seed.ts`, through `lib/attachments-fixture.ts`): one PDF and one PNG on the seeded posted Office Supply World bill, one JPEG receipt on a seeded posted expense, one HEIC photo on another seeded posted expense (expense 1002, so the generated thumbnail is seen); small generated files (a few KB) committed under the fixture.

## 5. Cut
- Attachments on other documents (invoice, sales receipt, estimate, journal entry, transfer) — the spec scopes attachments to bills and expenses in v0.
- A standalone attachments list or "attachment lab" (unlinked uploads matched to documents later) — not in the spec's scope.
- Creating a bill or expense from an uploaded receipt (OCR) — not in scope.
- Renaming an attachment — a file keeps the name it was uploaded with.
- Searching by attachment name — Books search covers number, refs, memo and party.
- Paste from the clipboard — not shown; Attach files and drop cover web.
- Attachments in a PDF or email — bills and expenses have no PDF or email.
- A full-width gallery band under the footer (artboard B) and a side-by-side receipt pane beside the form (artboard C) — the design gate picked direction A, which keeps the one shared document layout.
- Copying attachments on Copy, and copying them on a correction — a correction moves them (§3.6).

## 6. Platform notes
- Standing approval (human, 2026-11-11): the ⌥A shortcut (web and iOS hardware keyboard; Android uses the visible button).
- P1 — approved by the human at the design gate (2026-11-15): drag and drop is web only (core `DropZone` renders a plain view on native). Native users add files only through Attach files; iPad drag from Files or Photos is not supported.
- P2 — approved by the human at the design gate (2026-11-15): Take photo is offered on native only, through core's chooser sheet. On web, Attach files opens the browser's file input; the app offers no direct camera action there.

## 7. Sparks carried
- Calm, wide, dashed add area: core `DropZone` + `rounded-xl border border-dashed border-border` + `text-muted-foreground`, as Books `BankFileDrop`.
- Core extension E1 — accepted at the design gate: core `PreviewModal`'s Previous, Next, Download and Close get `accessibilityRole="button"` and the labels "Previous file", "Next file", "Download", "Close preview" (`tinycld/core/file-viewer/PreviewModal.tsx`, no API change). It is helix checkpoint 0 in core, on branch `books/p3-attachments`; small, not `exclusive`. The core PR merges at the next design gate, before the package PR.

## 8. Non-goals
- No change to the ledger: an attachment never posts, never moves a total, never blocks Post.
- No virus scanning, no image editing or cropping.
- No per-person attachment storage (the files count toward the organization).
- No change to how invoices, sales receipts and estimates look.

## 9. Engine reach (self-review)
- Pick: core `usePickFiles` (`multiple`, `sources`). Drop: core `DropZone` (web). Upload with progress: core `uploadRecordWithFile({ onProgress })` + `throttleProgress`; refusal status from `UploadError`. Preview: core `PreviewModal` + registry; Download: `downloadFile`; thumbnail: core `Thumbnail` (needs `thumbs` on the field). Protected file URLs: `useAuthedFileURL`. Confirm: core `ConfirmDialog`. Shortcut: core `ShortcutButton`.
- Custom file fields: core forms host `files` (`lib/forms/host.ts`, Go `server/forms/defs.go`), core `FileField`.
- Pending files held through the save: a Books store plus a new attachments step in Books `useRecordSave` (after the rows step, before the post step).
- Accessible names for the preview's toolbar: E1, core checkpoint 0.
