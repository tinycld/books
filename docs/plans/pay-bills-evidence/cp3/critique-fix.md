# Gate 2 critique, fix round 1: pay-bills, checkpoint 3 (Bill payment read view and editing)

Result: 0 INVALID, 0 BLOCKING, 6 NOTE.

Shots read: 12 built (re-captured) and the 12 reference shots of the same names.

## State check

| Shot | State shown | Result |
|---|---|---|
| read-390-light, read-390-dark, read-1280-light, read-1280-dark | Posted bill payment 1001 ($400.00 of Bill 1004), badge Posted, Edit offered (wide: Edit, Void, View journal entry; phone: More, Edit) | valid |
| read-void-390-light, read-void-1280-light | Bill payment 1002, badge Void, "Voided by" line, View journal entry only | valid |
| read-replaced-390-light, read-replaced-1280-light | The replaced original 1001: badge Void, "Voided by", link "Replaced by 1001 (edited)", View journal entry only | valid |
| edit-390-light, edit-390-dark, edit-1280-light, edit-1280-dark | Pay Bills in `?replaces` mode: title "Edit bill payment 1001", no badge, Check no. 1050, vendor filter fixed and muted, row 1 paid 400.00, line "Payment 1001 now +$400.00", Cancel and Save | valid |

## The fix round

- The Bills paid Total row shows the payment total ($400.00 on 1001, $100.00 on 1002) and agrees with Amount paid in every read shot, at both widths.
- The move of the read view's shared parts changed nothing that the shots show: header, detail card, grid, cards, stamp lines and action bar are the same as in the first capture.
- The capture defects of the first critique are gone: no toast on `read-replaced-*` (old N2), no "Save ⌘↵" hint bubble on `edit-*` (old N3).

## Compared with the reference

No reference decision is lost.

- Read, void, replaced: header (title, badge, help icon, big figure Amount paid), detail card (Vendor link, Paid from, Payment date, Payment), Bills paid (wide grid Bill · Vendor's bill no. · Due date · Bill total · Paid; phone cards "Bill 1004 · No. OSW-1977"), Total row, stamp lines, the "Replaced by" link and the action bar agree with the reference at both widths and in dark.
- Edit: band, fixed vendor chip, grid and cards, totals row, the four balance lines and the Cancel / Save bar agree with the reference. Differences that follow the spec text or real data, not findings: "2 open bills" (spec "<n> open bills"; reference "4 bills"); "1 bill selected · 1 vendor" (spec text); the phone "Sort: Due date" chip (touch path for the sort, lesson 46).

## Findings

### read-390-light, read-390-dark, read-1280-light, read-1280-dark, read-void-390-light, read-void-1280-light, read-replaced-390-light, read-replaced-1280-light

- N1. all read shots: detail card, Vendor value — the vendor link is about 12 px below the values of its row neighbours (1280: link at y 189, "1000 Business Checking" at y 177; 390: 225 against 213). At 1280 the card's bottom space is larger than its top space. The reference has the same offset. — NOTE

Nothing else found on the read, void and replaced shots. Light and dark are legible; no bad wrap or truncation.

### edit-390-light, edit-390-dark, edit-1280-light, edit-1280-dark

- N2. edit-1280-light, edit-1280-dark: Bill column, row 2 — the vendor's bill no. is cut to "No. OSW-INV-558…" while the Due date column has free width after its text. Checkpoint 2's grid; the ellipsis follows the table rule (minWidth + ellipsis). — NOTE
- N3. edit-390-light, edit-390-dark: filter chips — with the Sort chip in the row, the count "2 open bills" is alone on a third line, right-aligned. The reference keeps the count in the Due row. — NOTE
- N4. all edit shots: balance lines — "Total payment" reads "-$400.00" with a short hyphen; the reference draws the longer minus sign ("−$1,100.00"), as the spec examples do ("Payments −$100.00"). Checkpoint 2's line; the new "Payment 1001 now +$400.00" line is correct. — NOTE
- N5. all edit shots: band — the Check no. input has a different fill (light: white; dark: darker), larger text and about 2 px more height than the three selects beside it. The reference has the same difference. — NOTE
- N6. edit-1280-light, edit-1280-dark: totals row — the "Total" label is under the Bill column (x 546) and the Payment total ends at the cell edge (x 1256); the reference puts "Total" under the Vendor column (x 404) and ends the Payment total at the input's text edge (x 1244), in line with the amounts above it. Checkpoint 2's part. — NOTE

## For gate 3

Nothing visible in these shots. The two items of the first critique cannot be checked from the new shots:
- The "Save ⌘↵" hint no longer shows, but the shots still show no focus ring on Paid from (spec §3.1: "On open (new or `?replaces`) Paid from has focus on web at every width").
- The toast after Save on `?replaces` ("Posted Bill payment 1001") is no longer in the shot; spec §3.5 names a toast for Pay and Pay & new only.
