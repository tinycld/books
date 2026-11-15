# Design critique: attachments, checkpoint 2 (Attachment list and preview), after revise 1 fix round 2

Verdict: `CRITIQUE: 0 INVALID, 0 BLOCKING, 8 NOTE`

This report replaces the critique of the capture after revise 1 (fix round 1).

Scope: the Delivers line of checkpoint 2, revise-1 items 1 and 2, and fix round 2 item 2. Not counted: the add area and Remove (checkpoint 3); a thumbnail where the reference shows a type icon (the human's decision, revise 1 item 1); the header, band and lines that the reference does not draw.

Check of the changes under judgment:
- Fix round 2, item 2 (thumbnail in the bordered 40 px tile): done. In posted-1280-light and posted-390-light the PDF row's mark is a rounded 40 px tile with a visible border on the white screen. The PNG and JPEG marks have the same size and corner radius in all shots, light and dark. The previous BLOCKING 1 is closed.
- Revise 1, item 1 (generated thumbnails): the PDF row draws an image tile, not the type icon. No built shot shows a HEIC, WebP or office row (NOTE 8).
- Revise 1, item 2 (limit text only where a file can be added): `Up to 20 MB each` is absent in reader-1280, reader-390, reader-empty-390, void-1280 and moved-1280, and present in posted-* and expense-390 (writer). This agrees with the reference.

## State check

| Built shot | Shows | Result |
|---|---|---|
| posted-1280-light, -dark | Bill 1002 posted, writer (Edit, Void, Copy), `Attachments (2)` + limit text, PDF row then PNG row | valid |
| posted-390-light, -dark | Same bill on a phone, section after Memo, both rows whole | valid |
| expense-390-light, -dark | Expense 1003, writer (Edit), `Attachments (1)` + limit text, one JPEG row | valid |
| reader-1280-light, -dark | Expense 1003, reader (no New, no Edit), `Attachments (1)`, no limit text, one JPEG row | valid |
| reader-390-light, -dark | Same, phone (only More in the bar) | valid |
| reader-empty-390-light, -dark | Bill 1003, reader, `Attachments` + `No attachments`, no limit text | valid |
| void-1280-light, -dark | Bill 1001 void, `Attachments` + `No attachments`, no limit text (the reference shows a void bill with one row) | valid, see NOTE 3 |
| moved-1280-light, -dark | Expense 1002 void and replaced, `Moved to 1002 (edited)`, no limit text | valid |
| loading-1280-light, -dark | Bill 1002, heading + one skeleton row, document still shows | valid |
| error-1280-light, -dark | Bill 1002, `Attachments could not be loaded.` + Retry, lines and totals still show | valid |
| error-390-light, -dark | Same, phone | valid |
| preview-1280-light | `PreviewModal` open on `OSW-invoice-1002.pdf` | valid |
| preview-390-light | `PreviewModal` (full-screen sheet) open on the same PDF | valid |

## Findings

- posted-1280-dark, posted-390-dark: PDF row, leading tile — the thumbnail fills the tile, so the tile is a solid white 40 px square, the brightest object on the screen; no page content can be read in it. In light the same tile is white with a thin border and no muted fill, so it is fainter than the reference's muted tile — NOTE (1). No rule is broken: spec §3.3 "a 40 px thumbnail (core `Thumbnail`, `?thumb=40x40`)", and a white page is the true image of this file. An inset of the image in the muted tile (the fix brief permits "inset or filling") makes the page read as a page in both schemes.
- posted-1280-light, -dark, posted-390-light, -dark (all other parts): nothing found. Section in the notes column under Memo, above the Posted by stamp; heading, count and limit text on one baseline; one-line names; detail line `678 B · Test User, Nov 15`; dividers as the reference; the list ends before the totals column; phone rows are higher than 44 px.
- expense-390-light, expense-390-dark: nothing found.
- reader-1280-light, reader-1280-dark, reader-390-light, reader-390-dark: nothing found. No limit text, as the reference.
- reader-empty-390-light, reader-empty-390-dark: nothing found.
- loading-1280-light, loading-1280-dark, error-1280-light, error-1280-dark, error-390-light, error-390-dark: heading row — `Up to 20 MB each` shows while the list loads and after it failed; the reference shows no limit text in these two states — NOTE (2). No rule is broken: spec §2 "for a writer on a document that is not void". The lesson "A hint that explains an action ... shows only where that action is offered" points the same way, because no add control is offered in these states.
- void-1280-light, void-1280-dark: notes column — the built state is void with no file; the reference state is void with one read-only row. No built shot shows a void document that holds a file — NOTE (3).
- moved-1280-light, moved-1280-dark: notes column — `Moved to 1002 (edited)` is plain text; two lines below it, the link `Replaced by 1002 (edited)` gives almost the same message — NOTE (4). The reference's `No attachments` under the Moved line is absent as the plan says; not a finding.
- moved-1280-light, moved-1280-dark: action bar — the tooltip `View journal entry j` and the hover state of the button are in the shot — NOTE (5), capture artefact.
- loading-1280-dark: skeleton row — the skeleton is almost invisible on the dark background — NOTE (6). The reference is equally faint in light.
- loading-1280-light, loading-1280-dark: skeleton row — the two bars are about 245 px and 125 px wide; the reference bars fill the column (about 400 px and 135 px) — NOTE (7).
- error-1280-light, -dark, error-390-light, -dark (all other parts): nothing found.
- (evidence) no shot: no built shot shows a HEIC, WebP or office row with its generated thumbnail (revise 1, item 1); `moved-*` shows expense 1002 after its rows moved to the correction. Only the PDF thumbnail (a white page) is shown, so the look of a generated photo thumbnail in the tile is not confirmed — NOTE (8).
- preview-1280-light: nothing found. Name at the left; Next, Download, Close at the right; no Previous on the first file; the PDF page draws.
- preview-390-light: nothing found.

## For gate 3

- posted-*: check that the PDF row's thumbnail image has content (the generated JPEG of the page) and is not an empty or failed image. The shots show only white.
