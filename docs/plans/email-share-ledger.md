# email-share — helix run ledger

- started: 2026-11-22
- mode: unattended
- unit: p2-email-share
- package branch: books/p2-email-share (books, at 5e7c1a25)   core checkout: books/p2-email-share (tinycld, at c4d5887e)   mail checkout: books/p2-email-share (mail, at de10289)
- spec: docs/specs/email-share-design.md
- checkpoints: docs/plans/email-share-checkpoints.md
- reference: docs/plans/email-share-reference/
- evidence: docs/plans/email-share-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/email-share-capture.json
- review mode: C — none (unattended)
- core extension: accepted (human, design gate 2026-11-22) — checkpoint 0, core `RichTextToolbar` (`tinycld/core/components/editor/RichTextToolbar.tsx`), generalized from mail's `ComposeToolbar.tsx`; tinycld branch books/p2-email-share, PR not opened yet; small additive change, no `exclusive`; the core PR merges at the next design gate, before the package PRs
- mail switch (same unit): mail's compose uses the core toolbar and `mail/tinycld/mail/components/ComposeToolbar.tsx` is deleted; mail branch books/p2-email-share; the mail PR merges after the core PR
- sparks:
  - The amount the customer owes is the heaviest text of what they receive → expressible (public invoice page balance `text-3xl font-semibold text-foreground`; in the email, "Balance due" on its own line, in `<strong>`)
  - The business's identity leads; the app's does not show → expressible (core `OrgLogo` + Books business name on the page; business name as the From display name and in the email frame's header and footer)
  - A tinted band heads the line table → dropped (it belongs to the PDF template of p2-pdf, not to a screen of this unit)

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
- phase 1: no corrections to the extractions (design gate, human, 2026-11-22). The gate added one core extension that no spark asked for: the core rich-text toolbar (checkpoint 0). Intake: `/Users/nas/tmp/tinycld/auto-helix-books/staging/p2-email-share/intake.md`.
- phase 2 (design gate, human, 2026-11-22; the answers in full: `/Users/nas/tmp/tinycld/auto-helix-books/staging/p2-email-share/gate-answers.md`; the questions: `packet.md` beside it):
  - Direction: **A, the Send dialog**.
  - Accepted as recommended: Q1 (the server's own sender, core `mailer`), Q2 (all five sales kinds), Q3 (an invoice customer link, view only, in this unit), Q4 (a replaced invoice forwards to its replacement), Q6 (one To, Cc of at most 5, no Bcc), Q8 (no "Email view" tab), Q9 (Post and send / Save and send, ⌥↵), Q10 (row menu Send… and batch Send), Q11 (collection `books_document_sends`), Q12 (no Sent column or filter), Q13 (Send… opens the dialog when email is not set up), Q14 (sent-able statuses), Q15 (the statements limits), Q16 (keys), Q17 (the email names the customer link).
  - Q5 changed: a single send has an editable Subject (plain text) and an editable rich-text Message, both starting from the server's text, with a Reset control; a batch stays server-filled. The request carries subject and body (single send only), checked by zod and by the server, each with a length cap. Each `books_document_sends` row stores the subject and the sanitized body HTML; the Audit history shows them.
  - Q7 changed: an HTML email with a plain-text part, PDF attached; the server sanitizes the body with core `render.Sanitize` and an allowlist, puts the business header and footer around it, and builds the text part with core `html.PlainText`; batch emails are server-built HTML too.
  - Q18 adjusted: the TS mirror of the server text (shared vectors with Go) gives the editor's starting subject and HTML; no preview endpoint.
  - Rich text editor (new): core `useRichEditor` (`@tinycld/core/lib/editor/rich`) with `contentFormat: 'html'`; the core toolbar is checkpoint 0; mail switches to it in this unit.
  - [platform] signed off (human, 2026-11-22): on native the editor runs in a WebView inside the dialog, as mail's compose does. Standing approvals (human, 2026-11-11): keyboard shortcuts; web focus on To at open.
  - Decisions the spec made to carry the answers out (not asked at the gate; each is in the spec, and the eval gate shows them):
    - Core `html.PlainText` joins a whole fragment into one line (`tinycld/core/server/html/text.go`), so Books `emailText()` calls it once for each line of the message (blocks, `<br>`, list items) to keep the text part's line breaks. No core change.
    - The core toolbar's Link control uses core `PromptDialog` on web and native. Mail's `window.prompt` / `Alert.prompt` (iOS only) do not move to core, so a mail user sees a Link dialog in place of the browser prompt.
    - Length caps: subject 300 characters; message HTML 20 000 characters in the request and 50 000 after the sanitizer.
    - The send row has `body` (sanitized HTML) and `body_text` (the same as text); the Audit history shows `body_text` as "Message" and treats `body` as `internal`.
    - The email frame has the business name as its header and a footer line with name, phone and email; no logo (a logo in the email stays cut).
    - Reset message has the key ⌥R and no confirm; Esc closes the dialog from the body too, and edited text is not kept.
    - Sanitizer allowlist: `p br strong b em i u s ul ol li blockquote h1 h2 h3 code pre hr a[href]`, mailto allowed, every class dropped; a pasted image or table loses its tag.
    - Core has no screen that mounts the toolbar: checkpoint 0 is proved by mail's compose e2e (plus one added Link e2e) and the Books e2e, on the unit's branches.
  - Spec self-review: the unit holds the send, the invoice customer link, the core toolbar and the mail switch; the human kept them in one unit at the gate (Q3, and the gate's "mail switch in this unit").
- phase 3: direction A picked at the design gate (above); no spark dropped after intake.
  - Pass 2 (2026-11-22): fixture `tinycld/books/lib/email-share-fixture.ts`, scratch route `tinycld/books/screens/helix-mockup.tsx`, manifest `docs/plans/email-share-capture.json`, reference `docs/plans/email-share-reference/` (34 states; widths 390 and 1280; light, and dark for the 6 main states). No human correction (unattended: the eval gate shows the reference).
  - Stand-in: core `RichTextToolbar` does not exist yet (checkpoint 0). The reference draws the dialog's body with core `useRichEditor` and a stand-in toolbar row in the scratch route only (seven format buttons through core `ResponsiveToolbar`; Link does nothing). The checkpoint that builds the dialog captures these states again with the core toolbar.
  - Both sparks are in the reference: the balance is the public page's largest text (`text-3xl font-semibold`), and in the message "Balance due" is on its own line in bold; the business name heads the public card, with no app name on the card. No spark dropped in pass 2.
  - The fixture's rows of `books_document_sends` and `books_invoice_public` are typed by local interfaces (the collections do not exist yet); the migration checkpoint replaces them with the generated types. The seed takes nothing from the fixture (spec §4.6).
  - The public invoice page ships on `/p/books/invoices/<token>` with no app chrome; the reference draws it inside the Books layout. Measure its widths on the shipping route.
  - Not drawn: the sales list row menu's "Send…" row, the estimate form's sent line and Save and send, the Audit history row of a send, the toolbar's Link dialog.
  - Findings for the plan (spec text against the code, and what the reference showed): `/Users/nas/tmp/tinycld/auto-helix-books/staging/p2-email-share/pass2-plan-notes.md`.
- phase 4 (2026-11-22, unattended; review mode: C): plan `docs/plans/email-share-checkpoints.md`, checkpoint 0 and 5 more. `plan-check.mjs --unattended` exits 0.
  - Checkpoints: 0 Core toolbar and mail switch (core + mail; logic, proved by mail e2e) · 1 Send records and invoice link data (logic) · 2 Document email and send route (logic) · 3 Send dialog on read view (renders) · 4 Send from forms and lists (renders) · 5 Public invoice page and help (renders, last rendering checkpoint). E2E added: 12 (mail 1; checkpoint 3: 4; 4: 4; 5: 3).
  - Plan decisions for the eval gate (each is in the plan's "Decisions that apply to every checkpoint"):
    - Migration `2100000034_create_books_document_sends.js` (new: the collection and the `books_invoice_public` view); in-place edits of the unreleased `2100000010` (`public_token`) and `2100000038` (the audit view files a send under its document by `doc_type`). A developer database needs a reset.
    - Core writes no values on a created audit row, so the history's send event reads the live send row for "Sent to <address>", Subject and Message.
    - The attachment's file name is the PDF route's ("invoice-1004.pdf"); the spec's example with the customer's name does not match the route.
    - Not-set-up notice: `DocumentInlineNotice` (the spec's `DocumentNotice` has no tone); the attachment line stays in that state.
    - Batch dialog: one Books `BatchSendDialog` from core `Dialog` parts, not core `ConfirmDialog` (it cannot disable only its confirm or show Close alone). With no sendable row the confirm reads "Send 0", disabled. No core change.
    - Batch address: the document's own `email`; a row with none is skipped. `DocumentListRow` gains `email`.
    - Reset message stays at the right of the Message label; Tab order is To, Cc, Subject, Reset message, toolbar, body, link buttons, footer (the spec's text lists Reset after the body).
    - `FormErrorSummary` is in a strip of its own between the dialog's body and footer, so a refusal is in view at any height.
    - A business name that ends with a period gets no second period in the email's first sentence.
    - The toolbar does not fold at 390 in the Books dialog; the fold is proved by mail's phone test of checkpoint 0.
    - A writer's pending, accepted or rejected estimate is a form, so its send entry on its own screen is Save and send; the quote read view (closed, or a reader) offers no Send. The sales list row menu offers Send… for those estimates.
    - Mail's existing Link test (`mail/tests/mail-buttons.spec.ts`) changes: it drives the Link dialog in place of the browser prompt.
    - `tinycld/core/e2e-helpers.ts` gains one export line (the capture-log helpers) in checkpoint 0, so a Books spec can read the sent email.
    - The Send dialog's load error has no e2e test (its reads are served from the store on the screens that open it); a pure status function, the recovery unit test and gate 2 cover it. The public page's load error is in e2e.
    - On web `⌘↵` typed in the editor is taken by the dialog's submit key in the capture phase; the editor's `onSubmitShortcut` is the native path. Both call one submit.
    - `postStatementRoute` is renamed `postBooksRoute`; the statements delivery code moves to `server/email_delivery.go` (statements keep their texts and limiter).
  - Plan review (one agent; report: `/Users/nas/tmp/tinycld/auto-helix-books/staging/p2-email-share/plan-review.md`): 1 BLOCKER, 4 MAJOR, 14 MINOR; all fixed in the plan, none rejected.
    - BLOCKER: Save and send on a stored estimate with no change opened no dialog (the save returns before the hold). Fixed: a `send` save mode; the no-change branch opens the dialog; the forms test sends an unchanged estimate.
    - MAJOR: the queued send was cancelled at `release(id)`, which also runs after a success. Fixed: cancel in the two `onError` handlers only; a server-refused post is in the forms test.
    - MAJOR: Go tests that save an invoice directly (`mkInvoiceRow` and 4 saves) were not in checkpoint 1's Files. Fixed.
    - MAJOR: the load error with Retry had no test. Fixed: e2e for the public page; unit cases for the dialog (decision 21).
    - MAJOR: the reader test's sent-line half was conditional. Fixed: the owner step sends the invoice; the reader sees the line.
    - MINOR (fixed): the row-menu e2e helper's regex and 3 specs with pinned menus, 2 specs added to checkpoint 4's gate; `readActionsOf` sets `canSend`; only failed rows stay ticked (as the spec); the batch test's `route.fetch` sends one item; assertions added for the batch offer rule, the all-sent result, the repeat send, Cc, "Sending…", the selected To, a second kind's sent line, the page title, part-paid total, "Was due", contact links; one signature for `SendDocumentDialog` and the store in Names; `getByRole('textbox', { name: 'Link' })` in mail's tests; core files cited for the selection and the web submit key; stale counts and a hedged file choice in checkpoint 1; `ListBanner` takes one message; `go.sum` in Files.
    - Not checked by the reviewer: the scratch route's line ranges (the plan now names a search, not lines), `lib/receive-payment-fixture.ts:65`, `PublicEstimateCard.tsx:87`.
- review mode switches: none

## Final review
- eval: (not reached)
- human comments and what changed
- native: not executed in this run
