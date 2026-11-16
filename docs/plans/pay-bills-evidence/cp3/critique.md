# Gate 2 critique: pay-bills, checkpoint 3 (Bill payment read view and editing)

Result: 0 INVALID, 0 BLOCKING, 7 NOTE.

Shots read: 12 built (`read`, `edit` at 390 and 1280, light and dark; `read-void`, `read-replaced` at 390 and 1280, light) and the 12 reference shots of the same names.

## State check

| Shot | State shown | Result |
|---|---|---|
| read-390-light, read-390-dark, read-1280-light, read-1280-dark | Posted bill payment 1001 (seeded partial payment, $400.00 of Bill 1004), badge Posted, Edit offered | valid |
| read-void-390-light, read-void-1280-light | Bill payment 1002, badge Void, "Voided by" line, View journal entry only | valid |
| read-replaced-390-light, read-replaced-1280-light | The replaced original 1001: badge Void, "Voided by", link "Replaced by 1001 (edited)", View journal entry only | valid (a toast from the capture's Save is on the shot, see N2) |
| edit-390-light, edit-390-dark, edit-1280-light, edit-1280-dark | Pay Bills in `?replaces` mode: title "Edit bill payment 1001", no badge, Check no. 1050, vendor filter fixed, row 1 paid 400.00, line "Payment 1001 now +$400.00", Cancel and Save | valid |

## Compared with the reference

No reference decision is lost.

- Read view: header (title, badge, help icon, big figure Amount paid), detail card (Vendor link, Paid from, Payment date, Payment), Bills paid (wide grid Bill, Vendor's bill no., Due date, Bill total, Paid; phone cards), Total row, the stamp lines, and the action bar (wide: Edit, Void, View journal entry; phone: More, Edit) agree with the reference at both widths and in dark.
- Void and replaced: badge, stamp lines, the "Replaced by" link and the single action agree with the reference.
- Edit: band, fixed vendor chip, grid and cards, totals row, the four balance lines and the Cancel / Save bar agree with the reference. Differences that follow the spec text or real data, not findings: the count reads "2 open bills" (spec: "<n> open bills"; reference "4 bills"); the summary reads "1 bill selected · 1 vendor" (spec text; reference "2 bills selected · Pacific Power"); the phone has a "Sort: Due date" chip that the reference does not have (a touch path for the sort, lesson 46).
- The row of Bill 1004 shows Open balance $1,250.00 with a payment of 400.00, and New balance is Current balance + 400 − 400. Both agree with spec §3.3 and §3.4.

## Findings

### read-390-light, read-390-dark, read-1280-light, read-1280-dark, read-void-*, read-replaced-*

- N1. all read shots: detail card, Vendor value — the vendor link is about 12 px below the values of its row neighbours (1280: link at y 189, "1000 Business Checking" at y 177; 390: 225 against 213). At 1280 this also makes the card's bottom space larger than its top space. The reference has the same offset. — NOTE

Nothing else found on `read-*` and `read-void-*`. Light and dark are legible; no bad wrap or truncation.

### read-replaced-390-light, read-replaced-1280-light

- N2. read-replaced-390-light: top of screen — the toast "Posted Bill payment 1001" from the capture's Save covers the back link. read-replaced-1280-light: bottom left — the same toast lies over the edge between the sidebar and the action bar. The state below is fully readable. A capture step that closes the toast (or waits for it to go) gives a clean shot. — NOTE

### edit-390-light, edit-390-dark, edit-1280-light, edit-1280-dark

- N3. all edit shots: above the Save button — a hint bubble "Save ⌘↵" is shown at open. The reference has none. It hides nothing, but it shows on a screen that the user did not touch. See "For gate 3". — NOTE
- N4. edit-1280-light, edit-1280-dark: Bill column, row 2 — the vendor's bill no. is cut to "No. OSW-INV-558…" while the grid has free width (Due date column has about 60 px of empty space after its text). The number is what the user compares with the paper bill. The grid is checkpoint 2's part; the ellipsis follows the table rule (minWidth + ellipsis). — NOTE
- N5. edit-390-light, edit-390-dark: filter chips — with the Sort chip in the row, the count "2 open bills" goes alone to a third line, right-aligned. The reference keeps the count in the Due row. — NOTE
- N6. all edit shots: balance lines — "Total payment" reads "-$400.00" with what looks like a short hyphen; the reference draws the longer minus sign ("−$1,100.00"), as the spec examples do ("Payments −$100.00"). Checkpoint 2's line; the new "Payment 1001 now +$400.00" line is correct. — NOTE
- N7. all edit shots: band — the Check no. input has a white (dark: darker) fill, larger text and 2 px more height than the three selects beside it. The reference has the same difference. — NOTE

## For gate 3

- The "Save ⌘↵" hint is visible at open in all four edit shots. At 390 the capture's click on Edit is at the place where Save then appears (hover can explain it). At 1280 the two buttons are at different places, so hover does not explain it. If Save holds the keyboard focus, this breaks spec §3.1: "On open (new or `?replaces`) Paid from has focus on web at every width". The shots do not show a focus ring on Paid from.
- Save on `?replaces` shows the toast "Posted Bill payment 1001". Spec §3.5 names a toast for Pay and Pay & new; for Save it names only "replace with `books/bill-payments/<correction id>`".
