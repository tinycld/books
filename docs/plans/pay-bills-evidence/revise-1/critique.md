# Design critique: pay-bills, revise 1 (grid columns flex, min 95; no sideways scroll)

Scope: the human's revise 1 corrections only. Anchors: cp2 populated-1280 light/dark, cp3 read-1280 and edit-1280 (loose). Receive Payment has no anchor.
The spec file was not read for this pass; the basis is revise-1.md, helix-lessons.md line 8 and memories-design.md.

## State check

| Shot | State shown | Result |
|---|---|---|
| populated-1082-light | Pay Bills, 7 open bills, all ticked, grid (not cards) | valid |
| populated-1082-dark | same, dark | valid |
| populated-1280-light | same, 1280 | valid |
| populated-1280-dark | same, dark | valid |
| read-1082-light | Bill payment 1001, Posted, Bills paid grid | valid |
| read-1280-light | same, 1280 | valid |
| edit-1082-light | Edit bill payment 1001, 2 open bills, 1 ticked | valid |
| edit-1280-light | same, 1280 | valid |
| receive-payment-1082-light | Receive payment draft, 2 invoices ticked, grid | valid |
| receive-payment-1280-light | same, 1280 | valid |

0 INVALID.

## Check against the corrections

- Columns flex, equal share, header / rows / totals row line up at each width: yes in all 10 shots.
- Tick column fixed: yes.
- Long text ellipsizes inside its cell, no column widened: yes.
- Payment input fills its cell: yes.
- No horizontal scroller visible, grid ends at the content edge: yes at 1082 and 1280.
- Receive Payment band rows wrap at 1082 (Payment date goes below Customer): yes, no clipped field.
- Pay Bills band wraps Starting check no. / Check no. to a second row at 1082: clean.
- Dark: text, red due dates, links and inputs are legible.

## Findings

N1. populated-1082-light, populated-1082-dark, edit-1082-light: Due date column — the cell shows "Aug 8, 2026 ·…" or "Sep 24, 2026…"; the word "Overdue" is fully cut. Only the red color tells the user that the bill is overdue. revise-1.md permits "wraps or ellipsizes", so this is not a break of a rule, but a wrap to a second line (as the Bill cell does with "No. …") keeps the word — NOTE

N2. populated-1280-light, populated-1280-dark, edit-1280-light: Due date column — "Aug 8, 2026 · Ove…" is cut at 1280 also. The cp2 and cp3 anchors showed "· Overdue" in full at this width. The equal flex shares leave empty space in the Bill, Bill total and Open balance columns while Due date is cut. Permitted by the correction ("ellipsizes inside its cell"); a larger flex share or a wrap for Due date would bring the word back — NOTE

N3. receive-payment-1082-light, receive-payment-1280-light: Invoice column — the link reads "Invoice 1005 · O…" (1082) and "Invoice 1005 · Oct 6, 2…" (1280); the invoice date is cut in the middle, and the underline runs into the ellipsis. At 1280 the Original amount and Open balance columns have empty space — NOTE

N4. receive-payment-1082-light, receive-payment-1280-light: header band — after the wrap, the left group is 4 stacked rows (Customer, Payment date, method + reference, Deposit to) and Amount received stands alone at the top right above a large empty area; the divider line under the first group stops short of the band's right edge. The band is tall (about 400 px at 1082) before the invoices start. Nothing is clipped or misaligned — NOTE

N5. read-1082-light, read-1280-light: band — the Vendor link sits about 12 px lower than the Paid from, Payment date and Payment values in the same row. The cp3 anchor has the same offset, so this revise did not cause it — NOTE

populated-1082-light, populated-1082-dark: no other finding. Vendor names ellipsize ("Office Supply…", "Summit IT Se…") and "No. OSW-INV-5…" ellipsizes, as the correction permits.
read-1082-light, read-1280-light: grid columns are clean; nothing found other than N5.

## For gate 3

Nothing visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 5 NOTE
