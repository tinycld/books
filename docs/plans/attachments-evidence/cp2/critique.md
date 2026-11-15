# Design critique: attachments, checkpoint 2 (Attachment list and preview)

Verdict: `CRITIQUE: 0 INVALID, 0 BLOCKING, 6 NOTE`

This report replaces the critique of the earlier, invalid capture.

Scope: the Delivers line of checkpoint 2. Not counted: the add area and Remove (checkpoint 3), `Thumbnail` in place of the reference's type icon on image rows (Phase 3 item), the header, band and lines that the reference does not draw.

## State check

| Built shot | Shows | Result |
|---|---|---|
| posted-1280-light, -dark | Bill 1002 posted, writer (Edit, Void, Copy), `Attachments (2)`, PDF row then PNG row | valid |
| posted-390-light, -dark | Same bill on a phone, section after Memo, both rows whole | valid |
| reader-1280-light, -dark | Expense 1003, reader (no New, no Edit), `Attachments (1)`, one JPEG row | valid |
| reader-390-light, -dark | Same, phone (only More in the bar), row whole | valid |
| reader-empty-390-light, -dark | Bill 1003, reader, `Attachments` + `No attachments`, stamp below | valid |
| void-1280-light, -dark | Bill 1001 void, `Attachments` + `No attachments` (the reference shows a void bill with one row) | valid, see NOTE 2 |
| moved-1280-light, -dark | Expense 1002 void and replaced, `Moved to 1002 (edited)` | valid |
| loading-1280-light, -dark | Bill 1002, heading + one skeleton row, document still shows | valid |
| error-1280-light, -dark | Bill 1002, `Attachments could not be loaded.` + Retry, lines and totals still show | valid |
| error-390-light, -dark | Same, phone | valid |
| expense-390-light, -dark | Expense 1003, writer (Edit), `Attachments (1)`, one row | valid |
| preview-1280-light | `PreviewModal` open on `OSW-invoice-1002.pdf` | valid |
| preview-390-light | `PreviewModal` (full-screen sheet) open on the same PDF | valid |

## Findings

- posted-1280-light, posted-1280-dark: nothing found. Section is in the notes column, under Memo, above the Posted by stamp; heading, count and limit text share one baseline; rows have a 40 px box, a one-line name and the detail line `678 B · Test User, Nov 15`; dividers as the reference; the list ends before the totals column. All text is legible in dark.
- posted-390-light, posted-390-dark: nothing found. Full width, after Memo, rows about 55 px high (spec: "rows at least 44 px high").
- reader-1280-light, reader-1280-dark, reader-390-light, reader-390-dark, reader-empty-390-light, reader-empty-390-dark, void-1280-light, void-1280-dark, moved-1280-light, moved-1280-dark: heading row — `Up to 20 MB each` shows to a reader and on a void document, where no file can be added; the reference shows no limit text in these states (and none in loading and error) — NOTE (1). Not BLOCKING: spec §2 gives the limit text "beside it" with no condition, and the runner made this change on purpose. The spec and the approved reference disagree here; the human must decide. My opinion: the text is noise where no add is possible.
- void-1280-light, void-1280-dark: notes column — the built state is void with no file; the reference state is void with one read-only row. No built shot shows a void document that holds a file — NOTE (2). No rule is broken (spec §3.3: "a reader, or anyone on a void document, sees "No attachments"").
- moved-1280-light, moved-1280-dark: notes column — `Moved to 1002 (edited)` is plain text; two lines below it, the link `Replaced by 1002 (edited)` gives almost the same message — NOTE (3). The reference's `No attachments` under the Moved line is absent as the plan says ("instead of "No attachments""); not a finding.
- moved-1280-light, moved-1280-dark: action bar — the tooltip `View journal entry j` and the hover state of the button are in the shot — NOTE (4), capture artefact.
- loading-1280-dark: skeleton row — the skeleton is almost invisible on the dark background — NOTE (5). The reference is equally faint, so no decision is lost.
- loading-1280-light, loading-1280-dark: skeleton row — the two bars are about 245 px and 125 px wide; the reference bars fill the column (about 400 px and 135 px), as a real row does — NOTE (6).
- error-1280-light, error-1280-dark, error-390-light, error-390-dark: nothing found. Danger text and the outline Retry button on one line, as the reference; legible in dark; the rest of the document shows.
- expense-390-light, expense-390-dark: nothing found.
- preview-1280-light: nothing found. Name at the left; Next, Download, Close at the right; no Previous on the first file, as the plan says; the PDF page draws.
- preview-390-light: nothing found. Full-screen sheet, same toolbar, the page fits the width.

## For gate 3

Nothing visible.
