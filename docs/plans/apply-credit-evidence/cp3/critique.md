# cp3 gate-2 critique (apply-credit, checkpoint 3: Apply from a credit memo)

Verdict: `CRITIQUE: 0 INVALID, 0 BLOCKING, 6 NOTE`

Read: the brief (cp3.md), the capture report (cp3-capture.md), the spec, the lessons, memories-design.md, all 48 built PNGs, and 35 reference PNGs (each shot at 390 or 1280 or both; each dark shot of the read view, the dialog and Remove).
Not read: 13 reference PNGs, all a second width or theme of a shot whose other reference was read (memo-390-dark, memo-partly-390-dark, memo-partly-1280-dark, memo-dialog-390-dark, memo-dialog-part-390-dark, memo-dialog-part-1280-light, memo-dialog-part-1280-dark, memo-dialog-spread-390-light, memo-dialog-errors-390-dark, memo-dialog-errors-1280-dark, memo-dialog-loading-390-light, memo-dialog-load-error-1280-light, remove-1280-dark). The built shot of each was read and judged on its own.

No table or grid scrolls sideways at a captured width. The apply grid shows at 1280 and cards show at 390.

## State check and findings, per shot

### memo (390 light/dark, 1280 light/dark)
State: VALID. Posted memo 1001, notice "Harborview Hospitality Group has 2 open invoices…" above the band, Apply to invoices in the bar (phone: More + Apply to invoices).
- memo-1280-light, memo-1280-dark (and each 1280 read view shot): bottom bar — "More" is the first button, left of the primary "Apply to invoices"; the reference bar at 1280 has no More and starts with Apply to invoices — NOTE (shared read bar; the plan's order of the named actions is kept).
- 390: nothing found.

### memo-partly (390 light/dark, 1280 light/dark)
State: VALID. Badge "Partly applied", Applied −$150.00, Unapplied credit $100.00, Applied to block with one row and Remove. At 390 the shot is scrolled, so the title and badge are cut at the top edge; the 1280 shots show them whole.
- Nothing found. The block, the row (link + Remove) and the totals rows match the reference in structure and order.

### memo-refunded (390 light, 1280 light)
State: VALID as "refunded" (Refunded −$205.46, Unapplied credit $410.92, Refunds block). It is not the reference's state (applied and refunded, badge "Partly applied"); the capture report gives the seed as the cause. At 390 the header is out of view.
- Nothing found in what is drawn.
- Not evidenced: the Applied row and the Refunded row together, and the Applied to block above the Refunds section (spec §3.5 "above the Refund receipts section").

### memo-reader (390 light, 1280 light)
State: VALID. No notice, no Apply to invoices, the Applied to row has no Remove, the bar holds More / View journal entry / Download PDF.
- Nothing found.

### memo-block-error (390 light, 1280 light)
State: VALID. Applied to heading with "Books could not load where this credit is applied." and Retry inside the block.
- Nothing found. (The notice touches the action bar only because of the capture's scroll position.)

### memo-applied (390 light, 1280 light)
State: VALID. 1280: badge "Applied", Applied −$250.00, Unapplied credit $0.00, two rows with Remove, no Apply to invoices and no notice. 390: the same below the fold line; the badge is above the view (capture report says so).
- Nothing found.

### memo-long (390 light, 1280 light)
State: VALID for the long name and the large header amount ($1,073,679.01). The number is short (server sequence; capture report). The totals panel with the large amounts is below the view at both widths, so it is not evidenced here.
- Nothing found. The notice wraps beside its button at both widths as in the reference; the long name, address and email wrap inside the band.

### memo-dialog (390 light/dark, 1280 light/dark)
State: VALID. Title "Apply credit memo 1003", figure "Unapplied credit $100.00" with the help icon, Apply date, the list with the spread on the first row, Cancel / Apply credit. 1280: grid, Clear, summary. 390: Sheet with cards.
- memo-dialog-1280-light/dark (and each 1280 grid shot): Invoice column — the cell reads "Invoice 1016 · S…"; the invoice date is cut in each row, while the Due date column has unused width. On the 390 cards the invoice date is not shown. The reference has the same cut — NOTE.
- memo-dialog-390-light/dark (and each 390 rows shot): Clear and the summary line are below the second card, out of view while Apply credit is in view. The reference has the same order — NOTE.

### memo-dialog-part (390 light/dark, 1280 light/dark)
State: VALID. 60.00 in the first row; 1280 summary "Applying $60.00 to 1 invoice · $40.00 stays unapplied".
- Nothing found (the two NOTEs of memo-dialog apply).

### memo-dialog-spread (390 light, 1280 light)
State: VALID. Two rows ticked, 60.00 and 40.00; 1280 summary "Applying $100.00 to 2 invoices · $0.00 stays unapplied".
- Nothing found.

### memo-dialog-errors (390 light/dark, 1280 light/dark)
State: VALID for the client errors (date error under the date, root error in the summary box, row error under the cell). No server-refused row error; the capture report gives the cause.
- memo-dialog-errors-1280-light/dark: summary line — reads "Applying $300.00 to 1 invoice · $0.00 stays unapplied" under the root error "More than the unapplied credit of $100.00." The two lines disagree for the reader — NOTE.
- Not evidenced: a server refusal under a row's cell (three-line text in the 114 px column, as the reference's second row).

### memo-dialog-saving (390 light, 1280 light)
State: VALID. Tick box, Clear, Cancel and Apply credit are dimmed.
- Nothing found. (The date and amount inputs do not look dimmed; the reference is the same.)

### memo-dialog-loading (390 light, 1280 light)
State: VALID. Three skeleton rows under the date, Apply credit disabled.
- Nothing found.

### memo-dialog-load-error (390 light, 1280 light)
State: VALID. "Books could not load the open invoices." with Retry, Apply credit disabled.
- Nothing found.

### memo-dialog-long (390 light, 1280 light)
State: VALID. Figure $1,073,679.01, the list with seven-figure balances.
- memo-dialog-long-1280-light: Credit to apply cell, first row — the value is cut at the right edge ("1,073,679.0", the last digit is not in view, no ellipsis). The Open balance cell beside it shows $1,342,098.76 whole, and the Due date column has unused width. The reference's value (987,654.32) is shorter and fits, so no reference decision is broken — NOTE. This is the strongest of the notes: the cell holds the amount that one key applies.
- memo-dialog-long-390-light: nothing found.

### memo-dialog-empty (390 light, 1280 light)
State: VALID. "Granite Peak Outfitters has no open invoices. The credit stays on the customer until you post an invoice or refund it." with New invoice / Refund credit, Apply credit disabled.
- Nothing found.

### remove (390 light/dark, 1280 light/dark)
State: VALID. "Remove credit" dialog (Sheet at 390) with the spec text for Invoice 1016 and $150.00, Cancel / Remove.
- Nothing found.

### remove-refused (390 light, 1280 light)
State: VALID. The refusal shows in a boxed line inside the dialog, above the footer; the row stays in the block (1280).
- remove-refused-390-light, remove-refused-1280-light: refusal text — "The books are closed through 2026-11-30. Ask a Books admin for a close-date override to post on 2026-11-16." The days are ISO text, while each other day on this screen reads "Nov 16, 2026" (the reference refusal reads "Nov 30, 2026"), and "to post on" does not describe a removal — NOTE. The text in the shot is a faked response.

## Findings list
1. memo-1280-* (each 1280 read view): bar — More stands before the primary Apply to invoices — NOTE
2. memo-dialog*-1280-*: Invoice column — invoice date cut in each row ("Invoice 1016 · S…"), not shown on the 390 cards — NOTE
3. memo-dialog*-390-*: Clear and the summary are out of view with two or more cards — NOTE
4. memo-dialog-errors-1280-light/dark: summary "$0.00 stays unapplied" under the root error "More than the unapplied credit" — NOTE
5. memo-dialog-long-1280-light: Credit to apply cell cuts "1,073,679.01" to "1,073,679.0" — NOTE
6. remove-refused-390/1280-light: ISO days and "to post on" in the refusal text — NOTE

## Not evidenced by this capture (no finding)
- A memo that is applied and refunded: the Applied and Refunded rows together, and the Applied to block above the Refunds section.
- A server refusal under a row's Credit to apply cell.
- The totals panel of the read view with seven-figure amounts (memo-long is not scrolled to it).
- A long document number in the title, the dialog title and the Invoice cell (the server numbers documents).

## For gate 3
- Remove refusal: the shot's text is a faked response. Compare the real close-date refusal of a delete with it (day format, "to post on").
