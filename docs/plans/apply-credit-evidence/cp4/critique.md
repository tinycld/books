# Design critique: apply-credit, checkpoint 4 (Apply credit on an invoice)

Verdict: `CRITIQUE: 2 INVALID, 0 BLOCKING, 1 NOTE`

Scope: the Delivers line ("a writer applies the customer's credit memos to a posted invoice from the invoice's read view, sees the notices, the Credits applied row and the credits in the Payments block with Remove, and on a phone finds Apply credit in More"). 28 built PNGs were read, each with its reference of the same name. Seed differences named in `cp4-capture.md` (customer, document numbers, one memo in place of two, sales tax) are not findings.

## Per screenshot

### invoice-390-light, invoice-390-dark
- State check: VALID. Posted invoice, balance above zero, notice with Apply credit, payments line in the same box. The phone bar shows More and Edit, no Apply credit button.
- Findings: nothing found.

### invoice-1280-light, invoice-1280-dark
- State check: VALID. Notice with Apply credit and the payments line; the bar has Apply credit after Receive payment and before Edit.
- Findings: nothing found.

### invoice-credited-390-light, invoice-credited-390-dark
- State check: VALID. Partly paid badge, Credits applied −$150.00 between Total and Balance due, Payments block with the credit row and Remove under the link.
- invoice-credited-390 (both schemes): Payments block, credit row — Remove is on its own line, at the left, about as far from its link as one row is from the next. With a second row below it, the eye cannot tell which row the button belongs to. A smaller gap to its link, or a group for each row, makes it clear — NOTE. (The same layout shows in invoice-mixed-390-light and invoice-remove-390-light; counted one time.)

### invoice-credited-1280-light, invoice-credited-1280-dark
- State check: VALID. Same state; Remove is beside the link.
- Findings: nothing found.

### invoice-dialog-390-light, invoice-dialog-390-dark
- State check: VALID. Sheet with the title "Apply credit to invoice 1019", the Open balance figure with the help icon, Apply date, one card (tick box, memo link, Credit date, Unapplied credit, full-width input), Clear, the summary, the payments line, Cancel and Apply credit.
- Findings: nothing found. The card labels the date "Credit date"; the reference has no label there. This adds detail and loses nothing.

### invoice-dialog-1280-light, invoice-dialog-1280-dark
- State check: VALID. Dialog with the grid (tick box, Credit memo, Credit date, Unapplied credit, Credit to apply), no sideways scroll, summary and payments line under the list.
- Findings: nothing found.

### invoice-dialog-part-390-light, invoice-dialog-part-1280-light
- State check: VALID. A typed part (60.00 of $271.78); the summary reads "Applying $60.00 from 1 credit memo · $374.84 stays due".
- Findings: nothing found.
- Coverage remark (not a finding): the reference shows a second row with no tick and a dimmed 0.00. The built customer has one memo, so no built shot shows a row with no tick.

### invoice-dialog-errors-390-light, invoice-dialog-errors-1280-light
- State check: VALID. The date error under Apply date and the row error under the Credit to apply cell, both in the danger tone; the typed values stay.
- Findings: nothing found.

### invoice-dialog-load-error-390-light, invoice-dialog-load-error-1280-light
- State check: VALID. "Books could not load the customer's credits." with Retry; Apply credit is disabled. (The failed read is the close-override read; the drawn state is the same as the reference.)
- Findings: nothing found.

### invoice-dialog-no-credit-390-light, invoice-dialog-no-credit-1280-light
- State check: VALID. "Cedar & Pine Landscaping has no unapplied credit."; Apply credit is disabled; the notice under the dialog shows only the payments line and the bar has no Apply credit.
- Findings: nothing found.

### invoice-block-error-390-light
- State check: INVALID. The name says the Payments block's load error. The shot shows the top of the read view and stops at the Credits applied row; the Payments block and its notice ("Books could not load the credits applied to this invoice." with Retry) are below the bar. Not critiqued.
- Cause seen in `capture.json`: this shot has no `height` (invoice-credited has `"height": 1100`), and `scrollTo` did not move the block into view.

### invoice-block-error-1280-light
- State check: INVALID. Only the "Payments" heading shows, at the edge of the action bar; the error notice with Retry is not in the shot. Not critiqued. Same cause.

### invoice-remove-390-light, invoice-remove-1280-light
- State check: VALID. "Remove credit" with the body "Remove this credit from Invoice 1016? The invoice's balance goes up by $150.00 and the credit is unapplied again.", Cancel and a danger Remove; a Sheet at 390, a Dialog at 1280.
- Findings: nothing found.

### invoice-paid-390-light
- State check: VALID. Paid badge, $0.00, no notice, the bar has More and Edit only. The Balance due row and the Payments block are below the bar in this shot; the 1280 shot shows them.
- Findings: nothing found.

### invoice-paid-1280-light
- State check: VALID. Paid badge, Credits applied −$326.13, Balance due $0.00, the credit row with Remove; no Receive payment, Apply credit or Write off in the bar.
- Findings: nothing found.

### invoice-mixed-390-light
- State check: VALID. Written off badge; Payments −$3,000.00, Credits applied −$300.00, Written off −$6,575.25, Balance due $0.00 (the rows add up to the total); the Payments block lists the payment, then the credit in date order.
- Findings: nothing found here (the Remove position is the NOTE above).
- Capture remark (not a finding): a hover tooltip "Edit e" is drawn above the Edit button, and the bar cuts the Remove button. The pointer was left on Edit.

### invoice-mixed-1280-light
- State check: VALID. Same state; the totals, the Payments block with Remove beside the credit row, then the Credit memos and Write-offs sections.
- Findings: nothing found in what this checkpoint delivers. See "For gate 3".

## Summary of findings
- INVALID: invoice-block-error-390-light, invoice-block-error-1280-light. Capture them again with the Payments block in view (for example `"height": 1100`, as invoice-credited).
- BLOCKING: none.
- NOTE: 1 (the Remove button's position in the phone Payments block).

## For gate 3
- invoice-mixed-1280-light, Credit memos section, row 1006: the status badge reads "Refunded". Credit memo 1006 ($300.00) is applied in full to this invoice (the Payments block shows "Credit memo 1006 · Nov 19, 2026 · $300.00"), and nothing in the shot shows a refund. Spec §3.5: "**Applied** (success; `balance` 0 and `applied` above zero); **Refunded** (success; `balance` 0 and `applied` 0)". The section is not in this checkpoint's Delivers line or Files list, and I did not read the code, so I cannot tell which checkpoint owns this status (`creditMemoStatus`). The driver must confirm that a checkpoint owns it. invoice-paid-1280-light probably has the same row below the bar.
