# email-share checkpoint 3 — gate 2 design critique

Scope: the Send dialog (editor and toolbar), Send… and Copy customer link on the read view, the sent line. 27 built png, each read with its reference. Not judged: send-loading, send-load-error (not captured), send-estimate (checkpoint 4), the Audit history event (no shot).

Result: 0 INVALID, 0 BLOCKING, 5 NOTE.

## State check

All 27 built shots show the state of their name.

| shot | state shown |
|---|---|
| send-390-light, send-390-dark, send-1280-light, send-1280-dark | VALID. Dialog with the starting texts. To has no focus ring (the capture clicks the title before the shot); the reference shows it focused and selected. |
| send-full-390-light, send-full-1280-light | VALID. Full dialog to the footer: attachment line, two link buttons. |
| send-receipt-1280-light | VALID. Sales receipt dialog, "Paid. No payment is due.", Download PDF only. |
| send-long-390-light, send-long-1280-light | VALID. Long names wrap in the body, long subject and To clip in one line. The 390 sheet is scrolled (To is above the fold). The body is typed text, so it has no date block and its link is plain text. |
| send-formatted-390-light, send-formatted-1280-light | VALID. Bold, italic, underline, both lists, blockquote. Blockquote button shows its active tint. The 390 sheet is scrolled. |
| send-errors-390-light, send-errors-1280-light | VALID. Inline errors on To, Cc, Subject; "Enter a message." under the body at 1280 (below the fold at 390, as in the reference). |
| send-sending-1280-light | VALID. "Sending…" and Cancel are disabled. |
| send-refused-390-light, send-refused-1280-light | VALID. Refusal in the error summary above the footer; Send enabled again. |
| send-no-email-390-light, -390-dark, -1280-light, -1280-dark | VALID. Notice, attachment line, two link buttons, Close only. In 1280-light the bar's Send… button behind the scrim has a tint (pointer or focus state of the capture). |
| send-no-email-receipt-1280-light | VALID. Receipt text of the notice, Download PDF only, Close only. |
| read-390-light, read-390-dark, read-1280-light, read-1280-dark | VALID. Sent line with "· sent 2 times" under the title and badge. |
| read-more-390-light | VALID. More sheet with Send… and Copy customer link rows. |
| read-long-390-light | VALID. Sent line with the long address, one send. |

## Findings

- send-390-light, send-390-dark: nothing found beyond the shared note below.
- send-390-light, send-390-dark, send-full-390-light, send-refused-390-light: To field — the default address is cut at the right edge ("…hospitality.cor") with no ellipsis, so the end of the address is not readable until the field is scrolled — NOTE
- send-1280-light, send-1280-dark: nothing found.
- send-full-390-light, send-full-1280-light: nothing found. Order, labels, muted attachment line and link row agree with the reference. File name is the PDF route's name (plan decision 4).
- send-receipt-1280-light, send-no-email-receipt-1280-light: read bar behind the dialog — Send… is the filled primary button of the sales receipt bar (it is the first action there). No rule against it; it changes which action leads on a receipt — NOTE
- send-long-390-light, send-long-1280-light: nothing found. Long names wrap inside the body; nothing overflows the dialog.
- send-formatted-390-light, send-formatted-1280-light: nothing found. The seven toolbar buttons fit at 390 with no fold (plan decision 11). List indents and the quote bar are clear.
- send-errors-390-light: nothing found.
- send-errors-1280-light: under the body — "Enter a message." is larger than the three field errors above it (the spec asks `text-sm`; core field errors are smaller). The two sizes show in one view — NOTE
- send-sending-1280-light: nothing found. Reset message is not dimmed, where the reference dims it; the spec says "It is always enabled", so this is not a finding.
- send-refused-390-light, send-refused-1280-light: nothing found. The summary is directly above the footer.
- send-no-email-390-light, send-no-email-390-dark, send-no-email-1280-light, send-no-email-1280-dark: nothing found. Same structure as the reference; legible in dark.
- read-390-light, read-390-dark: sent line — it wraps to three lines and leaves "times" alone on the last line — NOTE
- read-1280-light, read-1280-dark: nothing found. Action order agrees with the spec (Receive payment, Apply credit, Send…, Edit, Void, Copy, …, Copy customer link, View journal entry, Download PDF); the two-row bar is as in the reference.
- read-more-390-light: key hints — single-letter hints are lower case ("r", "s", "v") beside "⌥L" and "⌘P"; the reference has upper case. This is the look of the existing rows, and the new Send… row follows it — NOTE
- read-long-390-light: nothing found. The long address wraps at its hyphen, as in the reference.

## For gate 3

- Every built read view (read-*, and behind each dialog): the back link reads "← Journal entries" on an invoice and on a sales receipt opened through search, while the sidebar marks Sales. The capture did not set it. Check where it leads and if this checkpoint changed it.
- Sales receipt, phone width: not captured. Send… is the first action of the receipt's wide bar. Check that "the bar's one button does not change" holds at 390 for a kind with no Receive payment.
