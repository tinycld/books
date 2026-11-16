# Design critique, fix round 2 re-capture: receive-payment, checkpoint 4

Result: 0 INVALID, 0 BLOCKING, 0 NOTE (new). Accepted finding 7 is closed.

## State check

| Shot | Light | Dark | Shows |
|---|---|---|---|
| read-void-1280 | valid | valid | Payment 1003, badge Void, Harborview Hospitality Group, two applied invoices, "Voided by" line, one filled "View journal entry" |
| read-void-390 | valid | valid | The same payment as cards, badge Void, "Voided by" line, one filled "View journal entry", no More |
| correction-1280 | valid | valid | "Edit payment 1004", Northwind Traders (disabled), $250.00 all credit, no open invoices, bar Cancel / Save draft / Post / Post & new |
| correction-390 | valid | valid | The same form stacked, bar Cancel / Save draft / Post / More |

## Accepted finding 7 (cp4-fix.md)

- read-void-390 (light and dark): CLOSED. The phone bar shows one filled "View journal entry" at the right, and no More button. This agrees with the reference `read-void-390-*` and with read-void-1280. The button fits the 390 bar, and the text is legible in light and dark.

## Findings

### read-void-390 (light and dark)
- Nothing new found.

### read-void-1280 (light and dark)
- Nothing new found. The bar is unchanged: one filled "View journal entry".

### correction-1280 (light and dark)
- Nothing new found. The capture artifact of the earlier critique (tooltip "Save draft ⌘S", tinted Save draft) is gone.

### correction-390 (light and dark)
- Nothing new found. The tinted More of the earlier critique is gone.

## Still open from critique.md (recorded there, not counted again)
- read-void-1280 and read-void-390: the Customer link sits about 12 px below the Payment date value, and the band has empty space under the values (NOTE, from checkpoint 2).
- read-void-*: the Payment value starts in lower case, "deposited to 1200 Undeposited funds" (NOTE, `paymentText`).
- correction-*: the disabled Customer picker keeps its chevron and gives no reason for the lock (NOTE).
- correction-*: the badge "Draft" beside "Edit payment 1004" (NOTE).

## Not shown by any built shot (unchanged)
- "Replaced by <n> (edited)" (`payment-replaced-by`). The built read-void shots are a plain void.
- The Void dialog with the payment text.
- A correction that lists invoices.

## For gate 3 (unchanged)
- correction-1280 and correction-390: no focus ring is visible on any field. Spec §3.1: "On open (new, draft, correction) the Customer picker has focus on web at every width". The Customer picker is disabled on the correction, so the place of the first focus cannot be seen in the shot (the capture also presses the title before the shot).
