# Email and share — design

Unit p2-email-share · package books · feature `email-share`. Built against books `books/p2-bank-deposit`@cf393c4 (origin/main merged), core main@4adc15b. Uses the documents of p2-invoice, p2-estimate, p2-sales-receipt, p2-credit-memo and p2-refund-receipt, the PDFs of p2-pdf, the estimate link of p2-estimate-public-link, the send path of p2-statements and the lists of p2-sales-lists. The human approved direction A (the Send dialog) at the design gate on 2026-11-22, with the packet's recommended answer for every open question except questions 5, 7 and 18: the subject and the message of a single send are edited (the message as rich text), the email is HTML with a text part, and the TS mirror gives the editor's starting subject and message. The gate also accepted one core extension (a rich-text formatting toolbar, checkpoint 0) and the switch of mail's compose to it in this unit. Branch `books/p2-email-share` in books, tinycld (core) and mail.

## 1. Goal

A writer sends a sales document to its customer by email with the PDF attached, in two key presses from the document, and can change the subject and the message before the send; when email is not set up, the writer shares the customer link or the PDF. An invoice gets a customer link as an estimate has.

## 2. Where it lives

- No nav entry and no new Books screen. The send surface is one dialog, `SendDocumentDialog`, opened from:
  - the read view of a sent-able document (action **Send…**),
  - the document form (**Post and send** on a posting kind, **Save and send** on an estimate),
  - a sales list's row menu (**Send…**),
  - a sales list's Batch actions menu (**Send**).
- New public route `/p/books/invoices/<token>` (screen file `public-screens/invoices/[token].tsx`; the manifest's `publicRoutes` and the `./public-screens/*` export exist).
- The invoice read view and form gain **Copy customer link** (the estimate has it).
- Core (checkpoint 0, repo `tinycld`): a new component `RichTextToolbar` in `tinycld/core/components/editor/RichTextToolbar.tsx`, imported as `@tinycld/core/components/editor/RichTextToolbar` (§3.8).
- Mail (repo `mail`): `ComposeWindow.tsx` and `InlineComposeForm.tsx` use the core toolbar; `components/ComposeToolbar.tsx` is deleted (§3.8).

## 3. Behavior

### 3.1 What can be sent

- Kinds: invoice, estimate, sales receipt, credit memo, refund receipt (each kind with `features.pdf` and `features.email`).
- Statuses: a posting kind when it is posted; an estimate when it is pending, accepted or rejected. A draft, a void document and a closed estimate offer no Send.
- Only a Books writer sends (`useBooksAccess`); the server enforces it. A reader sees the sent line (§3.6) and no Send.

### 3.2 The Send dialog

A core `Dialog` (`size="md"`; a Sheet on a phone) titled "Send invoice 1004" (the kind's noun and the number). Top to bottom:

- **To** (core `TextInput`, required): one email address. Filled with the document's `email`, else the customer's `email`. It has the focus at open on web (`useFocusOnOpen`), its text selected.
- **Cc** (core `TextInput`, optional): at most 5 addresses, separated by commas. Empty at open.
- **Subject** (core `TextInput`, required, one line, at most 300 characters). It starts with the subject of §3.4 for this document.
- **Message**: the label "Message", then the core `RichTextToolbar` (§3.8: Bold, Italic, Underline, Bullet list, Numbered list, Blockquote, Link), then the rich-text body (`testID` `document-send-body`): the editor of core `useRichEditor` (`@tinycld/core/lib/editor/rich`) with `contentFormat: 'html'`, `minHeight: 160` and `initialContent` the starting message of §3.4 for this document. The body grows with its text; the dialog's content scrolls. The starting subject and message do not name the recipient's address, so they do not change while the user types To or Cc.
- **Reset message** (link button, key ⌥R, `testID` `document-send-reset`), at the right of the "Message" label: puts the starting subject and the starting message back (`setValue` for the subject, `editor.setContent` for the body), at once and with no confirm. It is always enabled.
- "Attachment: <file name>" (`text-sm text-muted-foreground`), the file name of the document's PDF (`invoice-1004-cedar-hollow-inn.pdf`).
- A row of two link buttons, always shown: **Copy customer link** (invoice and estimate only) and **Download PDF**. Copy customer link copies the link (expo-clipboard) with the toast "Customer link copied."; Download PDF runs the existing `usePdfDownload`.
- Core `FormErrorSummary` (root errors only, `rootErrorOnly`).
- Footer: `Dialog.CancelButton` (Esc) and `Dialog.ActionButton` "Send" (⌘↵, `DIALOG_SUBMIT_SHORTCUT`), which reads "Sending…" while the request runs; both are disabled then, and the dialog does not close.

Keys and focus: Tab moves To, Cc, Subject, the toolbar's buttons, the body, Reset message, the link buttons, the footer. A mouse press on a toolbar button does not take the focus from the body (the toolbar's focus guard), so the format applies to the selection. ⌘↵ sends from every field; in the body it arrives through the editor's `onSubmitShortcut`. Esc closes the dialog from every field (the body's `onEscape` returns false); the edited subject and message are not kept, and the next open starts from the starting texts.

Validation is a zod schema through `useForm` + `zodResolver` (`lib/document-send.ts`): To "Enter an email address." / "Enter a valid email address."; Cc "Enter valid email addresses, separated by commas." / "Use 5 addresses or fewer."; Subject "Enter a subject." / "Use 300 characters or fewer."; Message "Enter a message." (the body's text is empty) / "The message is too long. Shorten it and send again." (its HTML is above 20 000 characters). The body is not a registered input: at Send the dialog reads `editor.getHTML()` and `editor.getText()`, writes them to the form values `body` and `bodyText` with `setValue`, and then runs `handleSubmit`, so the same schema checks every field. To, Cc and Subject errors draw inline under the field (core `TextInput`); the Message error draws under the body (`text-sm text-destructive`, `testID` `document-send-body-error`).

On success the dialog closes with the toast "Invoice 1004 sent to <address>". A refusal for the document (the answer's `failed`) or for the request shows in `FormErrorSummary` and the dialog stays; a second press sends the same document again (a send creates no document, lesson 40).

**Email is not set up** (`useEmailStatus().canSend` false, loading or failed read included): To, Cc, Subject, the toolbar, the body and Reset message are not drawn, and no editor mounts. In their place a notice (`DocumentNotice` tone info) reads "Email sending is not set up. Share the customer link or the PDF with your customer." (for a kind with no link: "Email sending is not set up. Download the PDF and send it to your customer."), with the two link buttons under it. The footer holds only Close. The Send… action itself stays enabled, so the dialog is the one place that names the other two paths.

**Load.** The dialog reads the document, its customer and `books_settings` with its own `useLiveQuery(…findOne())` calls. While they load: a spinner and "Loading…"; Send is disabled. The form and the editor mount only when the three reads have landed (a child component of the dialog), so the starting subject and message are complete at the editor's first mount and no effect fills them later. A failed read: `DialogLoadError` with Retry (`mergeRecoveries`, one `recoverLiveQueries` call); Send stays disabled.

### 3.3 Where Send is offered

- **Read view.** `DocumentReadAction` gains `send` (label "Send…", key `s`) and `link` (label "Copy customer link", key ⌥L, invoice only here; the estimate's existing ⌥L action is unchanged). Order on a posted document for a writer: the existing first actions (Receive payment, Apply credit), then **Send…**, then Edit, Void, Copy and the rest; Copy customer link comes before View journal entry. On a quote: Send… comes after Convert to invoice and before Copy customer link. On a phone both are rows of More; the bar's one button does not change. Keys register only while the action is offered.
- **Form.** A posting kind's form gains **Post and send** (key ⌘⌥↵, `allowInInputs`; ⌥↵ stays the form's Add line key, human 2026-11-22): it posts as Post does and, when the post lands (the posted record's URL), opens the Send dialog on the posted document's read view. The estimate form gains **Save and send** (⌘⌥↵): saves as Save does, then opens the dialog. Wide: a `ShortcutButton` in the action bar after Post (after Save on an estimate). Phone: a row of More. A refused post or save opens no dialog. Cancel of the dialog leaves the document posted or saved and not sent.
- **Sales list row menu.** The Invoices, Estimates, Sales receipts, Credit memos and Refund receipts tabs (and All sales) gain the row "Send…" for a writer on a sent-able row, after Open. It opens the same dialog over the list.
- **Batch.** The Batch actions menu gains "Send" for a writer when at least one selected row is sent-able. It opens a core `ConfirmDialog`: "Send 12 documents?" with "Each goes to the email address on the document." and, when some selected rows cannot be sent, "3 are skipped: 2 have no email address, 1 is a draft or void." Confirm reads "Send 9". With no sendable row the confirm button is disabled. At most 200 documents go in one request; a larger selection is refused in the dialog: "Select at most 200 documents." With email not set up the dialog reads "Email sending is not set up." and has only Close. The batch has no subject and no message field: the server fills both for each document (one text cannot fit every customer), and the request carries neither.
  - Result: every send succeeded: the toast "9 documents sent" and the selection clears. Some failed: a `ListBanner` above the list reads "6 of 9 documents were sent." with one line for each failed document, "<kind> <number>: <the server's message>"; the failed rows stay selected, so a second Send repeats only those.

### 3.4 The email

- One message for each document: To and Cc as given, the document's PDF attached (the file of `GET /api/books/pdf/<kind>/<id>`, same name).
- From: the server's sender address with the display name "<business name>" (`books_settings.business_name`, else the organization's name). Reply-To: the address of the user who sends. As statements (§3.5 of that spec).
- An HTML email with a plain-text part (`SendRequest.HTMLBody` and `SendRequest.TextBody`), for a single send and for a batch, so both look the same.
- **Whose text.** A single send (read view, Post and send, Save and send, row menu) sends the subject and the message the user has in the dialog. A batch sends the starting subject and the starting message, which the server fills from each document at the time of the send. Amounts print with Go `formatMoney`, days with Go `formatDay`. A line break in a name becomes a space (`oneLine`).
- **Starting subject**: "<Kind> <number> from <business name>", for example "Invoice 1004 from Aspen Ridge Landscaping". Kind words: Invoice, Estimate, Sales receipt, Credit memo, Refund receipt.
- **Starting message.** It is HTML. Each block below is one `<p>`; a line break inside a block is a `<br>`; the balance line of an invoice ("Balance due: …") is in `<strong>`; a link is an `<a href>` whose text is the address itself; every filled value is HTML-escaped, and a line break in the document's message is a `<br>`. Each `<…>` is filled; a block in square brackets is present only under its condition.

  Invoice:
  ```
  Hello <customer name>,

  Attached is invoice <number> from <business name>.

  Invoice date: <date>
  Due date: <due date>
  Total: <total>
  Balance due: <balance>

  [<the invoice's message to the customer>]

  View this invoice online:
  <customer link>

  To pay, or to ask about this invoice, reply to this email[ or call <business phone>].
  ```
  The business name is not a block of the message: the frame's footer signs the email.
  With a balance of zero the balance line reads "Balance due: $0.00. No payment is due." and the closing sentence reads "To ask about this invoice, reply to this email[ or call <business phone>]."

  Estimate: "Attached is estimate <number> from <business name>."; the block "Estimate date: <date>", "[Expires: <expiration date>]", "Total: <total>"; the message; then, while the estimate is pending and not expired, "To accept or decline this estimate, open:" and the link (`estimateLinkUrl`), otherwise "View this estimate online:" and the link; closing "To ask about this estimate, reply to this email[ or call <business phone>]."

  Sales receipt: "Attached is sales receipt <number> from <business name>."; "Date: <date>", "Total: <total>", "Paid. No payment is due."; the message; closing "To ask about this sales receipt, …". No link.

  Credit memo: "Attached is credit memo <number> from <business name>."; "Date: <date>", "Credit: <total>", "Unapplied credit: <balance>"; the message; closing "To ask about this credit memo, …". No link.

  Refund receipt: "Attached is refund receipt <number> from <business name>."; "Date: <date>", "Refund: <total>"; the message; closing "To ask about this refund receipt, …". No link.
- **One source for the starting texts.** TS `documentEmail()` (`lib/document-email.ts`) returns `{ subject, bodyHtml }` and gives the dialog its starting subject and message; it is a mirror of Go `documentEmail()` (`server/document_email.go`), which the batch uses. Both are pinned by one shared vector file (`server/testdata/document_email_cases.json`: subject and message HTML for each case), as `documentTotals` is. There is no preview endpoint.
- **What the server does with a message** (the user's, or its own for a batch), in this order:
  1. Sanitizes the HTML with core `render.Sanitize` (`tinycld.org/core/render`) and a Books allowlist (`documentEmailAllowlist`, `server/document_email.go`): tags `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `s`, `ul`, `ol`, `li`, `blockquote`, `h1`, `h2`, `h3`, `code`, `pre`, `hr`, `a`; attribute `href` on `a` only; `AllowHrefMailto: true`; `ClassPrefix: "books-email-"` (no editor class has it, so every class is dropped). The sanitizer drops scripts, event handlers and every other tag (an image, a table) and keeps their text; it keeps only the inline styles its own filter accepts.
  2. Puts the frame around it (Go `html/template`, `server/document_email.go`): a header with the business name as the email's largest text, the message, and a footer line "<business name>[ · <business phone>][ · <business email>]" in small muted text. The frame has no logo and no app name. Its inline styles are fixed light values of the email template (as the PDF template has), not app tokens. The frame is `HTMLBody`.
  3. Builds the text part (`TextBody`) from the sanitized message with core `html.PlainText` (`tinycld.org/core/html`). `PlainText` joins a whole fragment into one line, so Books `emailText()` (`server/document_email.go`) calls it once for each line of the message: it walks the sanitized message's top-level blocks (parsed with `golang.org/x/net/html`, the parser `render.Sanitize` and `html.PlainText` use; it becomes a direct dependency of the Books Go module), splits a block at each `<br>`, gives each `li` its own line ("- " in a `ul`, "1. ", "2. " in an `ol`) and joins the blocks with a blank line. A link prints its text only (the starting message prints the address as the link's text). The footer line follows after a blank line. The text part has no header line.
- The server sends its own result of these steps; the HTML the client holds never goes to the customer unsanitized.
- The server refuses: more than 200 documents in one request; more than 500 document emails by one user in an hour ("You have sent 500 document emails in the last hour. Try again later."); a document the user cannot read ("Document not found."); a document that is not sent-able ("A draft cannot be sent." / "A void document cannot be sent." / "A closed estimate cannot be sent."); an address it refuses ("Enter a valid email address."); a subject or a message in a request of more than one document ("A batch send cannot carry a subject or a message."); a single send with an empty subject ("Enter a subject.") or a subject above 300 characters ("Use 300 characters or fewer."; a line break in it becomes a space first); a message above 20 000 characters, or above 50 000 after the sanitizer ("The message is too long. Shorten it and send again."); a message whose text is empty after the sanitizer ("Enter a message."); a file over 10 MB; no Books write access; email not set up ("Email sending is not set up.").
- Retries: the statements rule (that spec §3.5 "Retries"), by the same code: at most 3 tries for a sender error, none for a refusal, a refused recipient fails at once with "The email server refused <address>. Correct the address and send again.", one limit token for each document, one try for each later document after one outage.

### 3.5 The invoice's customer link

- Every invoice has a `public_token` from its creation (server-set, 43 URL-safe characters, never changes), as an estimate has. The link is `<server address>/p/books/invoices/<token>`, built by `documentLinkUrl('invoice', token)` (`lib/document-link.ts`; `estimateLinkUrl` becomes a call of it).
- **Copy customer link** is offered to writers on a posted invoice (read view ⌥L; a row of More on a phone; the Send dialog's link button). A draft has no customer page; a void invoice offers no copy.
- **The public page** uses the estimate page's frame: one centered card (max width 560 px wide; full width with page padding on a phone), `OrgLogo` and the business name on top, no app chrome, system light and dark, page title "Invoice 1004 · <business>".
  - "Invoice 1004 for <customer display name>".
  - The label "Balance due" and the balance in the Books money format, the largest text of the page (`text-3xl font-semibold`). Under it, when the balance differs from the total: "Total <total>".
  - "Invoice date <date>" and "Due <due date>"; when the balance is above zero and the due date is before today, "Due <due date>" is `text-destructive` and reads "Was due <due date>".
  - The invoice's message when it is not empty.
  - **Download PDF** (link button): the printed invoice through the token route of §4.3 (core `downloadFromUrl`).
  - Below the card, when Books `email` or `phone` is set: "Questions? Contact <business>" with mailto and tel link buttons (the estimate page's `PublicEstimateContact`, made shared).
  - There is no action for the customer: no payment, no reply form.
- **States**, each its own testID'd view:
  - **Loading**: the card frame, a spinner, "Loading invoice…".
  - **Open** (posted, balance above zero): as above.
  - **Paid** (posted, balance zero): the amount line reads "Paid in full" (`text-success`) with "Total <total>" under it.
  - **Void, not replaced**: "<business> voided this invoice. No payment is due." No amounts, no PDF.
  - **Replaced** (void with `replaced_by`): "This invoice was replaced by invoice <new number>." with the button **Open invoice <new number>**, which moves to the replacement's page (`router.replace` to its token path). A chain of edits takes one press for each step.
  - **Not found** (no row: a wrong link, a draft, a deleted draft): "This link is not valid." and "Ask the business that sent it for a new link."
  - **Load error**: "The invoice could not load." with **Try again** (`recoverLiveQueries`).
- A change in Books shows on the next read (foreground, network back, reload); the page is not pushed live (core change signals go to signed-in clients only).

### 3.6 The sent line

- Each send is stored (§4.2). Where a document shows its status, a line reads "Sent Nov 20, 2026 to billing@cedarhollow.example" (`text-sm text-muted-foreground`, `testID` `<kind>-sent-line`); after more than one send, "· sent 3 times" follows. Cc addresses are not in the line.
  - Read view: under the status badge, in each kind's `…ReadDetails`.
  - Estimate form (an estimate is sent while it is still a form): under the header band, above the decline note.
- A document never sent shows no line. Each send is also a row of the document's Audit history ("Sent to <address>" by <user>), whose fields show the Subject and the Message that were sent (the message as text, from `body_text`).
- Sales lists gain no Sent column and no filter.

### 3.7 Access, help

- Send, Post and send, Save and send, the batch Send and Copy customer link need Books write access. The `link` and `send` actions are not offered to a reader.
- Help: `help/invoices.md` and `help/estimates.md` gain "Send to your customer" (Send…, Post and send / Save and send, what the email says, how to change the subject and the message and how Reset message puts them back, that a batch sends the standard text, Cc, the sent line, what to do when email is not set up, the keys `S`, `⌘⌥↵`, `⌘↵`, `⌥R`, `⌥L`); `help/invoices.md` gains "Share an invoice by link" (what the customer sees, what an edit or a void does to the link); `help/sales-receipts.md`, `help/credit-memos.md`, `help/refund-receipts.md` gain a short "Send" section; `help/sales-lists.md` gains the row and batch Send; `help/documents.md` links to them.

### 3.8 The core toolbar and the mail switch

- **Core `RichTextToolbar`** (checkpoint 0; `tinycld/core/components/editor/RichTextToolbar.tsx`), generalized from mail's `ComposeToolbar.tsx`. Props: `commands` (`EditorCommands`) and `toolbarState` (`EditorToolbarState`, both from `@tinycld/core/lib/editor/types`, as `useRichEditor` returns them); optional `leadingItems`, `trailingItems` and `rightItems` (`ToolbarItem[]` of core `ResponsiveToolbar`); optional `className` for the wrapping view (the caller sets the border side).
  - It draws, through core `ResponsiveToolbar` (so items that do not fit fold into its More menu, each with its label and icon): `leadingItems`, then Bold, Italic, Underline, a separator, Bullet list, Numbered list, a separator, Blockquote, Link, then (after a separator, when given) `trailingItems`; `rightItems` at the right edge.
  - Each format button keeps mail's behavior: `accessibilityRole` button, its label ("Bold", "Italic", "Underline", "Bullet list", "Numbered list", "Blockquote", "Link"), the selected state and the `primary` tint while its format is active at the caret, and the web focus guard (a mouse press does not blur the editor).
  - **Link** opens core `PromptDialog` (`@tinycld/core/ui/PromptDialog`: title "Link", placeholder "https://", `defaultValue` the caret's link or "https://", confirm "Apply", `required` false, `requiresServer` false) on web and native. A value sets the link (`commands.setLink`); an empty value removes it (`commands.removeLink`); Cancel changes nothing. This replaces mail's `window.prompt` (web) and `Alert.prompt` (iOS only; Android has none), which do not move to core.
  - It names no package, no Send and no attachment. Core gets no new token and no other component.
- **Books** uses it with no extra items, above the body, with a bottom border.
- **Mail switch** (repo `mail`, same unit): `ComposeWindow.tsx` and `InlineComposeForm.tsx` draw `RichTextToolbar` with Send as the leading item, Attach as the trailing item and Discard as the right item, built by one mail helper (`mail/tinycld/mail/components/compose-toolbar-items.tsx`) that both use; the wrapper keeps its top border. `mail/tinycld/mail/components/ComposeToolbar.tsx` is deleted, and `mail/README.md` names the new parts. The compose toolbar's order, labels and look do not change; the one change a mail user sees is the Link dialog in place of the browser prompt. `mail/help/composing.md` needs no change (it names ⌘K and the formats, not the prompt).

## 4. Data

### 4.1 Read

- **Dialog**: the document by id (`findOne()`), its customer (`materialize()` in the same query), the one `books_settings` row; `useEmailStatus()` (core `fetchEmailStatus()`).
- **Sent line**: one `useLiveQuery` over `books_document_sends` where `doc_type` and `document` match, ordered by `created` descending; the line reads the first row and the count.
- **Public page**: `setShareToken(token)` before the first query; one `useLiveQuery` over `books_invoice_public` where `token` matches, `findOne()`; `useOrgInfo()` for the logo and the fallback name.

### 4.2 New collection `books_document_sends`

One row for each sent email. One new migration (number taken at plan time: the next free one; the audit-log view migration keeps its place as that migration's own comment requires).

| field | type | note |
|---|---|---|
| `doc_type` | select `invoice`, `estimate`, `sales_receipt`, `credit_memo`, `refund_receipt`, required | |
| `document` | text, 15, required | the document's record id |
| `number` | text, max 40 | the document's number at the send |
| `customer` | relation → `books_customers`, required, cascade delete | |
| `to` | text, max 320, required | |
| `cc` | text, max 2000 | comma-separated |
| `subject` | text, max 300 | the subject that was sent |
| `body` | text, max 50 000 | the sanitized message HTML that was sent (without the frame) |
| `body_text` | text, max 50 000 | the same message as text (`emailText()`), for the Audit history |
| `sent_by` | relation → `users` | not reassigned at offboarding (history, as `posted_by`) |
| `created` | autodate | the send time |

Rules: list and view for Books `can_read`; no create, update or delete rule (only the send route writes, as the app). Index `(doc_type, document, created)`. Registered in `collections.ts` (`onDemand`, relation `customer`), in `audit.RegisterCollection` (label: the kind word and `number`; field labels in `lib/audit-fields.ts`: `subject` "Subject" and `body_text` "Message" of kind `text`, `body` of kind `internal`, so the history shows the message once, as text) and in the OAuth scopes (read scope only). The Go delete hook of an estimate and of a draft document deletes its sends. The document collections get no sent field: a posted document stays untouched by a send.

### 4.3 Invoice link

- `books_invoices.public_token` (text 43, pattern `^[A-Za-z0-9_-]{43}$`, unique index), added to migration `2100000010_create_books_invoices.js` in place (Books is unreleased; a developer database needs `pnpm run db:reset`). A server field: pinned unset on client create and update; the Go invoice create sets it with `newPublicToken()` (`server/estimate_link.go`).
- View collection `books_invoice_public` (in the new migration): `id`, `token`, `number`, `status` (posted or void; a draft has no row), `date`, `due_date`, `total`, `balance`, `currency`, `message`, `customer_name`, `replaced_by_token`, `replaced_by_number` (from the invoice in `replaced_by`), `business_name`, `business_email`, `business_phone`. Never memo, fields, form, bill_to, email, lines, tax, terms, the customer id or the entry. listRule = viewRule = `@request.headers.x_share_token != "" && token = @request.headers.x_share_token`. `changesignal.RegisterView('books_invoice_public', 'books_invoices', 'books_customers', 'books_settings')`. OAuth: read scope only.
- PDF: `GET /api/books/public/invoices/{token}/pdf` in `pdf_routes.go`, by the code of the estimate's token route (shape check, indexed lookup, constant-time compare; 404 for no match, a draft or a void invoice). Not in the OAuth registration.

### 4.4 Send route (`server/document_send.go`)

- `POST /api/books/documents/send`, body `{ documents: [{ kind, id, to, cc, subject?, body? }] }` (at most 200; `subject` and `body` only when the request holds one document; an item carries both or neither, and "Enter a subject." / "Enter a message." refuse one without the other; a batch of one selected row carries neither). Session only (not in the OAuth registration). For each item: checks Books write access and that the user can read the row (`reports.FindViewableRecord`), the status rule of §3.1, the addresses and (single send) the subject and message rules of §3.4; builds the document's PDF with the kind's builder of `documentKinds`; takes the subject and the message from the request, or from `documentEmail()` when the request gives none; runs the three steps of §3.4 (`render.Sanitize`, the frame, `emailText()` over `html.PlainText`); sends through `mailer.DefaultSender(app)` as `mailer.FullSender` (`SendFull` with `Subject`, `HTMLBody`, `TextBody`, `ReplyTo`, `To`, `Cc`, one `mailer.Attachment`); then creates the `books_document_sends` row (with `subject`, `body` and `body_text` as sent) as the app through the create-request hook chain, so the audit row is written. Answer: `{ sent: [send rows], failed: [{ kind, id, message }] }`.
- The delivery with its retries, the address check, the limiter pattern and the email-set-up check move out of `server/statement_routes.go` into `server/email_delivery.go`, and both routes call them (lesson 8); the statements route keeps its own limiter and texts. The document limiter is `ratelimit.NewPerApp("books.documents.send", 500, time.Hour)` by user.
- When the email was sent and the row's save fails, the item fails with "The email was sent, but the send could not be recorded."

### 4.5 Writes (client)

- **Send**: `useDocumentSend` (`hooks/useDocumentSend.ts`), a core `useMutation` (`networkMode: 'always'`) that posts to the route with the Books `postStatementRoute` request helper (renamed `postBooksRoute`); a single send carries the dialog's `subject` and `body` (the editor's HTML), a batch carries neither. It parses the answer with zod, then files the rows with `books_document_sends.accept(sent)` (`@tinycld/core/lib/server-rows`). The outcome is read from the answer's `{ sent, failed }`, never from the store.
- **Post and send / Save and send**: the form's existing post or save; the dialog opens from a synchronous Zustand value set before the write (`stores/document-send-store.ts`: the document to send after the write lands, and the batch's failed list), so an optimistic row that swaps the form for the read view does not lose it.
- No client write to `books_document_sends`, `public_token` or the view.

### 4.6 Seed and tests

- `seed.ts`: no send rows (the route sends email; the e2e capture log receives). Every seeded invoice gets its token through the create hook.
- Go: `documentEmail` for each kind against the shared vectors (zero balance, no phone, no message, a message with a line break and with `<` and `&`, an expired estimate, an accepted one, a name with a line break); the sanitizer step (a script, an event handler, an image, a table, a class, a `javascript:` link are gone; the allowed tags stay); `emailText` (paragraphs, `<br>`, both list kinds, a link, the footer line); the send route (each refusal, the subject and message rules, a subject or message in a batch refused, the limit, a part failure, a retried sender error, a refused recipient, Cc, the stored row with `subject`, `body` and `body_text`, the audit row, Reply-To, the HTML part with the frame and the text part, the attachment name from the capture log; a batch item sends the starting texts); the statements route's tests still pass on the moved delivery code; the invoice token (set at create, a client value refused, unique); the public view (columns, a draft has no row, a request with no token or a wrong one lists nothing, a filter on a private field is refused); the public PDF route; the estimate delete removes its sends; `TestRegister_BindsEachPartOnce`.
- Unit (vitest): `documentEmail` TS against the same vectors; `documentReadActions` and `quoteReadActions` with the new actions; the send schema; the batch skip counts; `useDocumentSend` through `tests/accounts-form-harness.ts`.
- E2e (`tests/e2e/email-share-*.spec.ts`, helpers `email-share-helpers.ts`): an invoice the test creates with a unique memo; Send… by `S`, To has focus, the Subject and the body hold the starting texts, ⌘↵ sends, the toast, the sent line (the e2e capture log sends); an edited subject and a body with typed text made bold by the toolbar and a link set through the Link dialog are in the sent email (the e2e capture log) and in the Audit history; Reset message puts both texts back; an empty subject and an empty body are refused inline; ⌘↵ typed in the body sends; a refused send (the answer rewritten with `page.route`) shows in the dialog and a second press sends; Post and send; Save and send on an estimate; the row menu; the batch with one row that has no address; email not set up (the status read faked) shows the notice and the two link buttons; Copy customer link then the public page in a context of its own (`trackRealtimeClients`): open, paid, void, replaced with its forward, not found; a reader sees no Send; one phone run (390) of the Sheet (with the toolbar's fold into More), More and the public card.
- Core (checkpoint 0): core has no screen that mounts `RichTextToolbar`, and a component gets no vitest test, so its behavior is proved by the e2e of its two users on the unit's branches: mail's compose specs (they pass unchanged, and one added mail e2e sets and removes a link through the Link dialog, at the default viewport and at 390 where Link is in More) and the Books specs above.
- Mail: the existing compose specs (`mail/tests/mail-buttons.spec.ts` and the specs that send through compose) pass with no change to their locators.

## 5. Cut

- **Sending from a mailbox of the `mail` package** (the umbrella spec's "through the registry when `mail` is installed"): core has no registry by which a package offers a compose or send service (searched: `tinycld/docs/packages.md` "Registries", `core/server` packages, `core/lib/packages`), and CI runs core and Books alone. The server's own sender is used, as statements and core report emails do; "email is available" means the server can send (`fetchEmailStatus`), not that `mail` is installed.
- **The "Email view" tab** of the umbrella spec's tab row: the dialog's subject and message show what is sent; the tabs stay Edit / Details and PDF view.
- An editable subject or message in a batch send: one text cannot fit every customer, so the server fills both (the statements reason).
- Default texts in Settings, saved templates, and keeping an edited text for the next send: every dialog starts from the document's own starting texts.
- A confirm on Reset message and on a close with edited text.
- An email that draws the document (a line table, the totals block): the PDF is attached. A logo in the email: the frame names the business in text.
- Images, tables, colors, font choices and attachments of the user's own in the message: the toolbar offers none, and the sanitizer drops an image or a table that is pasted.
- A preview endpoint and a "send a test to me" action.
- Bcc; more than one To address; "Send me a copy" (Cc holds the sender's address when wanted).
- "Send later", scheduled sends, reminders for overdue invoices.
- Online payment, a payment link, and a reply form on the invoice page.
- A line table on the invoice page: Download PDF shows the printed invoice.
- Turning a link off or resetting it.
- A Sent column, a sent filter and a delivery-method filter in the sales lists.
- Delivery tracking (delivered, opened, bounced).
- Sending a bill, an expense, a vendor credit, a payment or a deposit (no PDF, no email field).
- Moving statements onto `books_document_sends` (a statement keeps its `sent_at` / `sent_to`).

## 6. Platform notes

- **Signed off (human, 2026-11-22): the message editor on native is a WebView.** `useRichEditor` draws the DOM editor on web and the TenTap WebView editor inside the dialog (a Sheet on a phone) on native, as mail's compose does. Drawbacks: the WebView page takes a moment to start, so the body shows after the rest of the dialog; a hardware-keyboard key typed in the body goes to the WebView, so of the dialog's keys only ⌘↵ works there (through `onSubmitShortcut`), and ⌥R and Esc work from the other fields and by their buttons; no gate of this run executes native.
- Keyboard shortcuts (web and an iOS hardware keyboard; Android uses the visible buttons and menus) and focus on To at open (web only) have standing approval (human, 2026-11-11). Copy customer link uses expo-clipboard on both platforms. Download PDF follows the signed-off document PDF path (p2-pdf).

## 7. Sparks carried

1. The amount the customer owes is the heaviest text of what they receive: the public page's balance `text-3xl font-semibold text-foreground`; in the email, "Balance due" on its own line.
2. The business's identity leads; the app's does not show: `OrgLogo` and the Books business name on the page; the business name as the From display name, the email frame's header and its footer.

Core extension (accepted by the human at the design gate, 2026-11-22; not from a spark): the core `RichTextToolbar` of §3.8, checkpoint 0, on core branch `books/p2-email-share`. It is a small additive change and takes no `exclusive`. Its core PR merges at the next design gate, before the package PRs; the mail PR (same branch name) merges after the core PR.

## 8. Non-goals

- No change to a posted document by a send: no sent field, no revision bump, no ledger write.
- No core change other than `RichTextToolbar`: no new token, registry, route, Go function or editor option. `render.Sanitize`, `html.PlainText`, `useRichEditor`, `ResponsiveToolbar` and `PromptDialog` are used as they are.
- No import of, or check for, the `mail` package in Books, and no Books code in mail: the two share only the core toolbar.
- No change to mail's compose other than the toolbar's source and its Link dialog: the editor, the send path, the drafts and the attachments stay.
- The dialog does not sanitize: the server's sanitizer is the one that counts, and the editor's own schema is not a security rule.
- No sign-in, account or portal for the customer.
- No change to the estimate's public page or its accept and decline flow, except that its frame, contact block and state views move to shared files with no change of look.
- No change to the statements send behavior; only its delivery code moves.
