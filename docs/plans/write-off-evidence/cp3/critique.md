# Gate 2 critique: write-off, checkpoint 3 (Write-off page and void)

Result: 2 INVALID, 0 BLOCKING, 4 NOTE

Scope: the read page `books/write-offs/<id>` (header, band, stamps, actions), the void dialog, and the loading, error and not-found states. 24 built shots, each compared with the reference shot of the same name.

## State check and findings per screenshot

### read-390-light, read-390-dark, read-1280-light, read-1280-dark
State check: VALID. Posted write-off 1001 of Delta Freight Partners, writer's bar (Void, Open invoice, View journal entry; Void + More at 390).
- Structure agrees with the reference and spec §3.5: back link, title + Posted badge + help icon, figure "Amount written off" top right at 1280 and under the title at 390, band, stamp "Posted by Test User on Nov 19, 2026" (the spec's wording).
- read-*: band, bottom edge — with no Reason row the band keeps about 40 px of empty space below the last row against about 24 px above the first (1280: last value ends near y=197, band ends at y=239; 390: last value near y=295, band ends at y=325). The band looks as if a row is missing. — NOTE
- read-1280-*: band, first row — the link values (Customer, Invoice) sit about 12 px lower than the plain values (Write-off date, Written off to) in the same row (y=189 against y=177). The reference has the same offset. — NOTE

### read-void-390-light, read-void-390-dark, read-void-1280-light, read-void-1280-dark
State check: VALID. Void badge, "Voided by Test User on Nov 19, 2026" stamp, no Void button, Open invoice is the primary button. Back link reads "Invoice" at 1280 (the page was opened from the invoice).
- read-void-390-*: top of screen — the toast "Invoice 1019 written off: $205.46" of the capture run covers the back link, so the back link is not visible and was not judged in these two shots. A user who opens the write-off right after the write sees the same cover. — NOTE (shared with read-long-390-*, one finding)
- read-void-1280-*: the same toast sits over the left end of the action bar; it hides no button. Nothing found.
- The band's bottom space NOTE of `read` applies here too (no Reason row).

### read-long-390-light, read-long-390-dark, read-long-1280-light, read-long-1280-dark
State check: VALID. Posted write-off with a long Reason. The Reason wraps inside the band at both widths, with no clipping and no sideways scroll.
- read-long-390-*: the toast covers the back link (the NOTE above).
- Coverage remark, not a finding: the reference `read-long` also shows a long customer name, a long invoice number and a long account name that wrap or stack in the band. The built data (Harborview Hospitality Group, Invoice 1017/1018, 6050 Bad debts) has only the long Reason, so the wrap of those three values is not shown by any built shot.

### read-reader-390-light
State check: INVALID. The name says the reader's page. The shot shows the writer's bar: "More" and a primary "Void" button. It is pixel-for-pixel the same picture as read-390-light. The reference shows "More" + "Open invoice" and no Void (spec §3.5: "writer on void, and a reader: Open invoice (I), View journal entry (J)"). Not critiqued.

### read-reader-1280-light
State check: INVALID. The shot shows Void, Open invoice, View journal entry and the avatar "TO" (the Test User), the same picture as read-1280-light. The reference shows only Open invoice and View journal entry. Not critiqued.

### read-void-dialog-390-light, read-void-dialog-390-dark, read-void-dialog-1280-light, read-void-dialog-1280-dark
State check: VALID. Title "Void write-off 1001?", body "The invoice's balance due rises by $215.50 again.", Cancel and "Void write-off". A Sheet at 390, a centred Dialog at 1280. Texts agree with spec §3.5.
- read-void-dialog-390-*: sheet, top right — the close X carries a focus ring (the dialog was opened with the key V); at 1280 the ring is on Cancel. The reference shows no ring. On the phone sheet the ringed X is the most prominent control of the sheet. — NOTE

### read-loading-390-light, read-loading-1280-light
State check: VALID. Centred spinner, as the reference. Nothing found.

### read-error-390-light, read-error-1280-light
State check: VALID. Back link, "Books could not load this write-off.", Retry. Same as the reference. Nothing found.

### read-not-found-390-light, read-not-found-1280-light
State check: VALID. Back link and "This write-off does not exist". Same as the reference. Nothing found.

## Summary of findings
- INVALID: read-reader-390-light, read-reader-1280-light (they show the writer's page).
- BLOCKING: none.
- NOTE 1: band has more space below than above when there is no Reason (read-*, read-void-*).
- NOTE 2: link values sit lower than plain values in the band's first row at 1280 (also in the reference).
- NOTE 3: the write-off toast covers the back link at 390 (read-void-390-*, read-long-390-*).
- NOTE 4: focus ring on the sheet's close X at 390 in the void dialog.

## For gate 3
- If the `read-reader` capture did sign in as the collaborator (Books reader), then the page offers Void to a reader, which spec §3.5 forbids. The picture cannot tell the two causes apart: the 1280 shot shows the avatar "TO", which points to a capture that ran as the Test User. Check the sign-in of the capture and `writeOffReadActions(status, canWrite)` with the collaborator's access.
