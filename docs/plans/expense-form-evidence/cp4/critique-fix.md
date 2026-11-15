# Design critique (recapture): expense-form, checkpoint 4

Scope: the six shots captured again with the "Saved." toast closed, read against the reference shots of the same names. This report completes `critique.md`; the other eight shots keep their results from that file.

Result: 0 INVALID, 0 BLOCKING, 1 NOTE.

## State check

| Shot | State shown | Result |
|---|---|---|
| settings-390-light / -dark | Purchases card, select at "Accounts and products", Save disabled; no toast | valid |
| new-products-390-light / -dark | New expense, phone, only the Product and service details table (card); no toast | valid |
| new-accounts-1280-light / -dark | New expense, wide, only the Account details table; no toast | valid |

No toast is on screen in any of the six shots. The headers can now be judged.

## Findings

### settings-390-light
- settings-390-light: header — the built screen has the pushed-page header (back arrow, "Purchases", a rule below it); the reference has a larger page title "Purchases" with no back arrow and no rule — NOTE (the real settings stack header replaces the scratch route's title; the title text and its place above the card are kept, and the rule seen in the first critique is this header's border).

Card title "Bills and expenses", label "Purchase lines", the select, the note text on two lines and the disabled Save agree with spec §3.10 and the reference. Card position and spacing are the same as the reference.

### settings-390-dark
Nothing found. The header is the same as the light shot (covered by the note above). Header text, card title, label, note and the disabled Save are legible.

### new-products-390-light
Nothing found. The back link "Journal entries" is in its place, as the reference. Title, Draft badge, help icon, Amount paid figure, the stacked band, the "Product and service details" heading and the product card agree with the reference. No account heading appears, as spec §3.10 requires for "Products only".

Qty "1" and Amount "$0.00" in the built card, where the reference card is empty, come from the real starting line. Not a finding.

### new-products-390-dark
Nothing found. Same structure as the light shot; all text is legible.

### new-accounts-1280-light
Nothing found. No toast is over the sidebar now. Only "Account details" shows, with one starting line; no product heading. The Total figure's right edge is on the Amount column's right edge.

The reference shows a picked Paid from account with its balance line, Check and a Ref no.; the built shot has an empty band. The band is checkpoint 3's part and the shot's state (accounts only) is correct. Not a finding.

### new-accounts-1280-dark
Nothing found.

## Design note (not a finding)
The accepted deviation, core `TableField` "No rows yet." under an empty table, does not appear in these shots: each shown table has one starting line.

## For gate 3
None seen.
