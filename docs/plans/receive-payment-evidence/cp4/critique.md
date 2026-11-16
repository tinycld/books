# Design critique: receive-payment, checkpoint 4 (Void, edit and journal links)

Result: 0 INVALID, 1 BLOCKING, 5 NOTE

## State check

| Shot | Light | Dark | Shows |
|---|---|---|---|
| read-void-1280 | valid | valid | Payment 1003, badge Void, Harborview Hospitality Group, two applied invoices, "Voided by" line, View journal entry only |
| read-void-390 | valid | valid | The same payment as cards, badge Void, "Voided by" line, one button "More" |
| read-1280 | valid | valid | Payment 1002, badge Posted, actions Edit / Void / View journal entry |
| read-390 | valid | valid | Payment 1002, badge Posted, actions More + Edit |
| correction-1280 | valid | valid | "Edit payment 1004", Northwind Traders (disabled), $250.00 all credit, no open invoices |
| correction-390 | valid | valid | The same form stacked, bar Cancel / Save draft / Post / More |

Capture artifact (not a state fault): the pointer stays where `payment-read-edit` was pressed. correction-1280 thus shows the hover tooltip "Save draft ⌘S" and a tinted Save draft; correction-390 shows a tinted More. See NOTE 5.

## Findings

### read-void-390 (light and dark)
- read-void-390: action bar, bottom right: the only action of a void payment is hidden. The bar shows one outline button "More"; the user must open a menu to find its single row. The 1280 build of the same state shows "View journal entry" as a filled button, so the two widths disagree. BLOCKING (reference decision `read-void-390-*`: the bar holds one filled button "View journal entry"; spec §3.7: "Writer on void, and reader: View journal entry only."). A menu is correct only when more than one action must move into it (posted: Edit + More, as `read-390-*`).

### read-void-1280 (light and dark)
- read-void-1280: header band, Customer column: the customer link sits about 12 px below the Payment date and Payment values (link at y 189, the others at y 177), and the band is about 24 px taller than the reference band with empty space under the values. The reference puts the three values on one line. This part is from the read view of checkpoint 2, not from this checkpoint. NOTE
- read-void-1280: header band, Payment value: with no method and no reference the text starts in lower case, "deposited to 1200 Undeposited funds". It reads as a cut sentence. NOTE (text from `paymentText`, an earlier checkpoint)
- Actions row: nothing found. One filled "View journal entry", Edit and Void gone, as the reference.

### read-1280 (light and dark)
- Actions row: nothing found. Edit (filled), Void, View journal entry, in the order and weight of the reference.
- The Customer value offset of read-void-1280 shows here too (same NOTE, not counted again).

### read-390 (light and dark)
- Actions row: nothing found. More + Edit (filled), as the reference.
- The Customer value offset shows here too: the link is at y 225, the Payment date value at y 213 (same NOTE, not counted again).

### correction-1280 (light and dark)
- correction-1280: header band, Customer: the disabled picker keeps its chevron and gives no reason for the lock. Only the grey text tells the user that the field cannot open. A short hint under the field (below the input, lesson 27) or no chevron makes the lock clear. Text is legible in light and dark. NOTE
- correction-1280: title row: the badge "Draft" stands beside "Edit payment 1004", the number of a posted payment. It can read as "payment 1004 is a draft". NOTE
- correction-1280: action bar: hover tooltip "Save draft ⌘S" and tinted Save draft are capture artifacts (pointer left on the Edit position). Move the pointer away (press the title, as the read shots do) before the shot. NOTE
- Title, big figure, list text, totals, memo and bar: nothing found. Structure agrees with `no-open-1280`.

### correction-390 (light and dark)
- correction-390: Customer: same disabled-picker NOTE as 1280 (not counted again).
- correction-390: action bar: tinted More is the same capture artifact (not counted again).
- Stacked band, totals, memo and bar: nothing found. Structure agrees with `no-open-390`.

## Not shown by any built shot
- "Replaced by <n> (edited)" (`payment-replaced-by`), which this checkpoint delivers and the reference `read-void-*` shows. The built read-void shots are a plain void, so the link cannot be judged. Capture the void original of a correction to cover it.
- The Void dialog with the payment text.
- A correction that lists invoices (rows with stored payments). The built correction is all credit.

## For gate 3
- correction-1280 and correction-390: no focus ring is visible on Payment date (the reference form shows a ring on the focused Customer). The scope says the correction opens with Payment date focused. Either the focus is not there, or the DateField draws no focus ring.
