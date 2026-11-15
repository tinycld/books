# Design critique: expense-form, checkpoint 4

Scope: the Delivers line of checkpoint 4 (void end to end, the Purchase lines setting with its new words and its effect on the expense form). 14 built shots read against the 14 reference shots of the same names.

Result: 0 INVALID, 0 BLOCKING, 4 NOTE.

Not judged: the header area of `settings-390` (light and dark). A "Saved." toast covers it in the two shots. See the notes.

## State check

| Shot | State shown | Result |
|---|---|---|
| void-1280-light / -dark | Read view of a void expense: Void badge, "Voided by" line, actions Copy and View journal entry only | valid |
| new-accounts-1280-light / -dark | New expense with only the Account details table | valid |
| new-products-390-light / -dark | New expense, phone, with only the Product and service details table (card) | valid |
| new-products-1280-light / -dark | New expense with only the Product and service details table | valid |
| settings-390-light / -dark | Purchases card with the select at "Accounts and products", Save disabled | valid (header hidden by a toast) |
| settings-1280-light / -dark | Same card, wide | valid |
| settings-readonly-1280-light / -dark | Read-only row "Purchase lines" / "Accounts and products", no select, no Save | valid |

## Findings

### void-1280-light, void-1280-dark
Nothing found. Structure, band, Payment row, totals, the two "by" lines and the action bar agree with the reference. The Void badge is legible in the two schemes.

### new-accounts-1280-light
- new-accounts-1280-light: bottom left, over the sidebar — a "Saved." toast from the capture's settings save is still on screen — NOTE (capture artifact; it does not cover the form).

The reference shows a picked Paid from account with its balance line, Check and a Ref no.; the built shot has an empty band. That band is checkpoint 3's part and the shot's state (accounts only) is correct, so this is not a finding.

### new-accounts-1280-dark
Nothing found.

### new-products-390-light
- new-products-390-light: top of the screen — the "Saved." toast covers the back link "Journal entries" — NOTE (capture artifact; the dark shot shows the link in its place).

Qty "1" and Amount "$0.00" in the built card, where the reference card is empty, come from the real starting line. Not a finding.

### new-products-390-dark
Nothing found.

### new-products-1280-light, new-products-1280-dark
Nothing found. The Total figure's right edge is on the Amount column's right edge. No product heading appears in the accounts-only shots and no account heading here, as spec §3.10 requires.

### settings-390-light
- settings-390-light: top of the screen — the "Saved." toast covers the page title area; a horizontal rule shows above the toast that the reference does not have — NOTE (the header of the real phone screen cannot be judged from this shot; recapture after the toast closes, or let the 390 shot open the page without a save).

Card title "Bills and expenses", label "Purchase lines", the note text and the Save button agree with spec §3.10 and the reference.

### settings-390-dark
- settings-390-dark: top of the screen — same toast over the page title area — NOTE (same as the light shot).

### settings-1280-light, settings-1280-dark
Nothing found. The built shot has the real settings section list between the sidebar and the card; the reference (scratch route) has none. The card itself agrees with the reference: title, label, select width, note on one line, Save.

### settings-readonly-1280-light, settings-readonly-1280-dark
Nothing found. One row, label left in muted text, value right, as the reference. The section list has no Access entry and the sidebar has no New button, which agrees with a reader.

## Design note (not a finding)
The accepted deviation, core `TableField` "No rows yet." under an empty table, does not appear in these shots: each shown table has one starting line.

## For gate 3
None seen.
