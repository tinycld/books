# Gate 2 critique: email-share, checkpoint 4 (Send from forms and lists)

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

Read: 20 built png (each name of `capture.json`) and the 18 references. The prompt gives 21 files; I have no directory listing tool, so a 21st png that is not in `capture.json` was not read. The driver must check the count.

## Per screenshot

- `form-390-light`: state OK (filled draft, phone bar Cancel / Save draft / Post / More, as the reference). Nothing found.
- `form-1280-light`: state OK (bar: Cancel, Save draft, Post, Post and send, Post & new, More; Post and send is directly after Post, as the reference). Nothing found.
- `form-more-390-light`: state OK (More sheet: Post and send ⌘⌥↵, Post & new, Download PDF disabled). The reference shows ⌥↵; the spec's later human decision is ⌘⌥↵, so the built key is correct. Nothing found.
- `batch-390-light`: state OK ("Send 3 documents?", body line, skipped line, Cancel, Send 1). Same structure as the reference. Nothing found.
- `batch-390-dark`: state OK. Text is legible on the dark sheet. Nothing found.
- `batch-1280-light`: state OK. Nothing found.
- `batch-1280-dark`: state OK. Legible. Nothing found.
- `batch-clean-1280-light`: state OK (no skipped line, Send 3). Nothing found.
- `batch-none-1280-light`: state OK (both skip reasons, "Send 0" disabled). Nothing found.
- `batch-too-many-1280-light`: state OK ("Send 201 documents?", red "Select at most 200 documents.", confirm disabled).
  - `batch-too-many-1280-light`: dialog footer, confirm button — it reads "Send 201" (disabled) next to the refusal "Select at most 200 documents."; the reference reads "Send" with no count in this state. A count that cannot be sent on the button is contradictory to read — NOTE.
- `batch-no-email-390-light`: state OK ("Email sending is not set up.", Close only). Nothing found.
- `batch-no-email-1280-light`: state OK. Nothing found.
- `batch-result-390-light`: state OK (banner "1 of 3 documents were sent." with one line for each failed invoice; the two failed rows stay ticked, the sent row is not ticked). Same structure as the reference. Nothing found.
- `batch-result-1280-light`: state OK (banner above the table, below the filters; header tick box in the mixed state). Nothing found.
- `send-estimate-1280-light`: state OK (dialog "Send estimate 1001" over the estimate form, accept/decline link, "Attachment: estimate-1001.pdf"). To shows no focus ring because the capture clicks the title before the shot. Nothing found in the dialog. The form's bar behind it: see `estimate-sent`.
- `send-loading-1280-light`: state OK (spinner, "Loading…", Send disabled, over the list). As the reference. Nothing found.
- `send-load-error-390-light`: state OK (error band with Retry, Send disabled). Nothing found.
- `send-load-error-1280-light`: state OK. Nothing found.
- `row-menu-1280-light` (no reference): state OK (row menu open; "Send…" is directly after Open, before Receive payment; same indent and type as the other rows). Nothing found.
- `estimate-sent-1280-light` (no reference): state OK (sent line "Sent Nov 22, 2026 to accounts.payable@harborviewhospitality.com" and the Save and send button after Save).
  - `estimate-sent-1280-light`: bottom of the header card, below the Status field — the sent line is inside the card's border, about 50 px below the Status select, and its left edge is about 2 px left of the field labels ("Status" at x 359, "Sent" at x 357). It reads as a detached footnote, far from the Pending badge in the title. The spec text "under the header band, above the decline note" is satisfied if the decline note also draws at this place in the card; the driver can check that against `DocumentForm.tsx` — NOTE.
  - `estimate-sent-1280-light` (also visible in `send-estimate-1280-light`): action bar — at 1280 the bar is two rows: Cancel, Delete estimate, Convert to invoice, Copy customer link, Save, Save and send, Save & close on row 1; Save & new and More alone on row 2. The primary button (Save & close) is no longer the last control, and the bar covers more of the form. No rule names a one-row bar — NOTE.

## Differences from the reference that are not findings

- The send dialog's load-error text is "The document could not load." (reference: "Could not load the document."). Copy of an earlier checkpoint's part; no rule.
- The built form bar at 1280 has More after Post & new; the reference bar ends at Post & new. Real actions (Download PDF) need it.
- No table scrolls sideways in any captured width.

## For gate 3

- `form-1280-light`, `estimate-sent-1280-light`: the back link above a sales document reads "← Journal entries". It is not a part of this checkpoint; check that the label follows the screen the user came from.
