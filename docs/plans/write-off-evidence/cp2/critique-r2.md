# Gate 2 design critique, round 2: write-off, checkpoint 2 (Write off dialog on invoice)

Scope: 6 built shots in `docs/plans/write-off-evidence/cp2/`, each compared with the file of the same name in `docs/plans/write-off-reference/`. Appearance only.

Result: 0 INVALID, 4 BLOCKING (one defect, visible in the 4 `dialog-errors` shots), 3 NOTE.

## State check

| Shot | State shown | Verdict |
|---|---|---|
| dialog-errors-390-light | Sheet open, date error and account error shown | valid |
| dialog-errors-390-dark | same, dark | valid |
| dialog-errors-1280-light | Dialog open, date error and account error shown | valid |
| dialog-errors-1280-dark | same, dark | valid |
| dialog-filled-390-light | Sheet open, date, account 6050 Bad debts and reason filled, no error | valid |
| dialog-filled-1280-light | Dialog open, same filled state | valid |

Differences that come from data and are not findings: the customer name, the invoice number, the amount ($205.46), the tax ($16.46), the invoice status badge (Posted), the dates. The focus ring on the Reason field in the filled shots is the focus left by the capture's typing.

## Findings

### The one BLOCKING defect (4 shots)

Where: the "Write off to" field in its error state.

What:
- The select has no error border. The reference draws the select with a red border when "Choose an account" shows.
- The message is not attached to its field. The built message is about 24 px below the select and about 30 px above the "Reason (internal)" label, so it is almost in the middle between the two fields. The reference puts it about 15 px below the select and about 43 px above the next label.
- The two field errors of the same dialog have different gaps: the date error is about 17 px below its input, the account error about 24 px below its select.
- Cause as seen: the message is drawn after the select's own bottom margin (the filled shots show 34 px between the select and the Reason label; the error shots add 20 px to it).

Basis: reference decision. `dialog-errors-*` in the reference shows the invalid account field marked with a red border and its message directly below the field, with the larger gap after the message.

- dialog-errors-390-light: "Write off to" field — no error border; message detached from the field — BLOCKING (reference `dialog-errors-390-light`: red border on the select, message directly below it)
- dialog-errors-390-dark: "Write off to" field — same — BLOCKING (reference `dialog-errors-390-dark`: same decision)
- dialog-errors-1280-light: "Write off to" field — same — BLOCKING (reference `dialog-errors-1280-light`: same decision)
- dialog-errors-1280-dark: "Write off to" field — same — BLOCKING (reference `dialog-errors-1280-dark`: same decision)

### Notes

- dialog-errors-390-light, dialog-errors-390-dark: bottom of the Sheet body — the notice is cut by the footer ("owed to the tax agency." is half hidden). The reference Sheet shows the full notice with no scroll. The built body is taller because of the two-line summary and the extra 20 px of the account error. The body scrolls, so the text is reachable. The fix of the BLOCKING defect gives 20 px back — NOTE
- all 6 shots: summary line — the line wraps and puts the year alone on line 2 ("Nov 19," / "2026"). The cause is the long customer name. A date that does not break, or a customer name that truncates, reads better — NOTE
- dialog-errors-1280-light, dialog-errors-1280-dark, dialog-filled-1280-light: read bar behind the dialog — "Download PDF" wraps to a second row, and a "More" button shows at the left of a bar that already shows every action at 1280. The reference bar also wraps, but shows no "More". This is behind the scrim and belongs to the `invoice-*` shots; check it there — NOTE

Per shot, apart from the lines above:
- dialog-errors-390-light, dialog-errors-390-dark, dialog-errors-1280-light, dialog-errors-1280-dark: nothing else found. The date error agrees with the reference.
- dialog-filled-390-light, dialog-filled-1280-light: nothing else found. Structure, order, figure prominence, notice and footer agree with the reference.

Dark shots: text, error text, borders and the notice are legible.

## For gate 3

- None seen in these shots.
