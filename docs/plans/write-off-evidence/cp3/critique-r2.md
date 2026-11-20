# Gate 2 critique, round 2: write-off, checkpoint 3 (Write-off page and void)

Result: 0 INVALID, 0 BLOCKING, 3 NOTE

Scope: the read page `books/write-offs/<id>` (header, band, stamps, actions), the void dialog, and the loading, error and not-found states. 24 built shots (captured again after fix round 1), each compared with the reference shot of the same name. Judged afresh.

## State check and findings per screenshot

### read-390-light, read-390-dark, read-1280-light, read-1280-dark
State check: VALID. Posted write-off 1001 of Delta Freight Partners, writer's bar (Void, Open invoice, View journal entry at 1280; More + Void at 390). No Reason row (the seeded write-off has no reason; spec §3.5: "Reason (left out when empty)").
- Structure agrees with the reference and spec §3.5: back link, title + Posted badge + help icon, figure "AMOUNT WRITTEN OFF" top right at 1280 and under the title at 390, band, stamp "Posted by Test User on Nov 19, 2026" (the spec's wording; the reference's time of day is not in the spec).
- read-390-*: band — the space above the first row and below the last row is now equal. Nothing found.
- read-1280-*: band, the one row — the link values (Customer, Invoice) sit about 12 px lower than the plain values (Write-off date, Written off to): y=189 against y=177. The same cause leaves about 30 px below the links against about 18 px above the labels. The reference has the same offset. — NOTE

### read-void-390-light, read-void-390-dark, read-void-1280-light, read-void-1280-dark
State check: VALID. Void badge, stamps "Posted by …" and "Voided by Test User on Nov 19, 2026", no Void button, Open invoice is the primary button (More + Open invoice at 390). Back link reads "Invoice" at 1280.
- read-void-390-*: top of screen — the toast "Invoice 1019 written off: $205.46" of the capture run covers the back link. The back link was not judged in these two shots. A user who opens the write-off directly after the write sees the same cover until the toast goes. — NOTE (one finding, shared with read-long-390-*)
- read-void-1280-*: the toast is over the left end of the action bar and hides no button. The link offset NOTE of `read-1280` applies. Nothing more found.

### read-long-390-light, read-long-390-dark, read-long-1280-light, read-long-1280-dark
State check: VALID. Posted write-off with a long Reason. The Reason wraps in the band at both widths, with no clipping and no sideways scroll. The band's bottom space is correct with the Reason row.
- read-long-390-*: the toast covers the back link (the NOTE above).
- Coverage remark, not a finding: the reference `read-long` also shows a long customer name, a long invoice number and a long account name that wrap or stack in the band. The built data (Harborview Hospitality Group, Invoice 1017/1018, 6050 Bad debts) has only the long Reason, so no built shot shows the wrap of those three values.

### read-reader-390-light
State check: VALID. The reader's bar: More + Open invoice, no Void. Same as the reference (spec §3.5: "writer on void, and a reader: Open invoice (I), View journal entry (J)"). Nothing found.

### read-reader-1280-light
State check: VALID. The bar has only Open invoice (primary) and View journal entry. The sidebar has no "+ New" button (the reference shows one; a reader has nothing to create, so this is correct for real access data). The avatar "TO" is the Test User with the faked read_only access row, as the capture note says. The link offset NOTE of `read-1280` applies. Nothing more found.

### read-void-dialog-390-light, read-void-dialog-390-dark, read-void-dialog-1280-light, read-void-dialog-1280-dark
State check: VALID. Title "Void write-off 1001?", body "The invoice's balance due rises by $215.50 again.", Cancel and "Void write-off". A Sheet at 390, a centred Dialog at 1280. The texts agree with spec §3.5.
- read-void-dialog-390-*: sheet, top right — the close X has a focus ring (the dialog was opened with the key V); at 1280 the ring is on Cancel. The reference shows no ring. On the phone sheet the ringed X is the most prominent control. — NOTE

### read-loading-390-light, read-loading-1280-light
State check: VALID. Centred spinner, same as the reference. Nothing found.

### read-error-390-light, read-error-1280-light
State check: VALID. Back link, "Books could not load this write-off.", Retry. Same as the reference. Nothing found.

### read-not-found-390-light, read-not-found-1280-light
State check: VALID. Back link and "This write-off does not exist". Same as the reference. Nothing found.

## Summary of findings
- INVALID: none. The two `read-reader` shots of round 1 are now valid.
- BLOCKING: none.
- NOTE 1: at 1280 the link values of the band sit about 12 px lower than the plain values, and the band has more space below than above (also in the reference).
- NOTE 2: the write-off toast covers the back link at 390 (read-void-390-*, read-long-390-*).
- NOTE 3: focus ring on the sheet's close X at 390 in the void dialog.
- Closed from round 1: the band's empty space at 390 when there is no Reason.

## For gate 3
- Nothing.
