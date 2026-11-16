# Design critique: report-exports, checkpoint 4 (Email report dialog and send)

Round 1: 4 INVALID, 3 BLOCKING, 2 NOTE (email-refused shots showed no refusal; disabled row's second line too faint; "Attach as" stacked; attachment line not in view).

## Round 2

Shots read: all 28 built shots (`<name>-<1280|390>-<light|dark>.png`), captured again after the fix round, and the reference shots with the same names (light for each state, dark for a sample).

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

## State check

| Shot (light and dark) | State shown | Verdict |
|---|---|---|
| export-menu-1280 | Export menu open: 3 downloads, separator, "Email report…" | valid |
| export-menu-phone-390 | "More actions" sheet with the four entries | valid |
| email-off-1280 | Menu open, "Email report…" disabled, second line shown | valid |
| email-off-phone-390 | Sheet open, "Email report…" disabled, second line shown | valid |
| email-1280 | Dialog as opened, focus ring on To, defaults filled, attachment line in view | valid |
| email-phone-390 | Sheet as opened, focus ring on To, defaults filled, attachment line in view | valid |
| email-invalid-1280 | Inline error under To | valid |
| email-invalid-phone-390 | Inline error under To | valid |
| email-refused-1280 | Refusal sentence in a red-outlined box at the top of the body, typed values kept, Send enabled | valid |
| email-refused-phone-390 | The same, the sentence on two lines | valid |
| sending-1280 | Cancel and "Sending…" disabled | valid |
| sending-phone-390 | Cancel and "Sending…" disabled | valid |
| sent-1280 | Dialog closed, toast "Report sent to dana@harborlane.test" | valid |
| sent-phone-390 | Sheet closed, toast at the top | valid |

Heights: 1000 at 1280 and 1300 at 390 for email-off, email, email-invalid and email-refused, as the reference; 800 and 844 for export-menu, sending-phone and sent, as the reference.

## Round-1 findings: resolved or not

| Round-1 finding | Class | Round 2 |
|---|---|---|
| email-refused-* (4 files): no refusal in view | INVALID | Resolved. The summary is at the top of the dialog body, above To, at both widths, in light and dark. |
| email-off-*: second line dimmed with the disabled row | BLOCKING | Resolved. The label is dimmed; "Email sending is not set up" is at the muted text color and is readable in light and dark at 1280 and 390. |
| email-*: "Attach as" stacked, one button per line | BLOCKING | Resolved. One row of three equal segments (PDF, Excel, CSV), PDF selected, at both widths. |
| email-*: attachment line not in view | BLOCKING | Resolved. `profit-and-loss-2026-01-01-to-2026-11-16.pdf` shows under "Attach as" on one line at 1280 and at 390, in muted text, readable in light and dark. |
| email-phone-390-*: Message box cuts the last default line | NOTE | Not resolved. See the finding below. |
| email-*: Cc has no "Optional" sign | NOTE | Not resolved. See the finding below. |

## Findings

### export-menu-1280-light, export-menu-1280-dark
Nothing found.

### export-menu-phone-390-light, export-menu-phone-390-dark
Nothing found.

### email-off-1280-light, email-off-1280-dark, email-off-phone-390-light, email-off-phone-390-dark
Nothing found.

### email-1280-light, email-1280-dark, email-phone-390-light, email-phone-390-dark
(These findings are also visible in email-invalid-*, email-refused-* and sending-*; each is counted once.)
- email-phone-390-*: Message box — the last default line (the sender's name, "Test User") is cut through the middle by the lower edge of the box. The built box is about 165 px high; the reference box is about 190 px and shows the whole default message — NOTE. One more row of height shows the full default text.
- email-*: Cc field — the reference's "Optional" placeholder is gone; Cc has no sign that it is optional (To has a hint line) — NOTE.
- email-*: attachment line — the built line is the bare file name; the reference reads "Attachment: <file name>". Under "Attach as" the bare name is understood, but a label makes the line clear by itself — NOTE. (The e2e compares the text of `report-email-attachment` with the file's name, so a label must be outside that element.)

### email-invalid-1280-light, email-invalid-1280-dark, email-invalid-phone-390-light, email-invalid-phone-390-dark
Nothing found. The error is inline under To (red border, red text), legible in light and dark, and takes the place of the hint.

### email-refused-1280-light, email-refused-1280-dark, email-refused-phone-390-light, email-refused-phone-390-dark
Nothing found. The sentence is legible in light and dark; at 390 it wraps cleanly onto two lines; To, Subject, Message and the format are kept; Send reads "Send".

### sending-1280-light, sending-1280-dark, sending-phone-390-light, sending-phone-390-dark
Nothing found. Cancel and "Sending…" are visibly disabled in light and dark, as in the reference.

### sent-1280-light, sent-1280-dark, sent-phone-390-light, sent-phone-390-dark
Nothing found. The toast fits on one line at both widths and is legible in light and dark.

## Differences from the reference that are not findings
- No Books sidebar, no "Share" button, other organization name, accounts and dates: real data and the real signed-in user.
- Refusal summary: a red-outlined box with the sentence only; the reference has a filled box with the heading "Please fix the following errors:". The position (top of the body) is kept, and the heading does not fit a server limit.
- Validation text ("not-an-address is not an email address") differs from the reference's wording: the plan's wording (step 4).
- To has a hint line below the input in place of the reference's placeholder (lesson 27).
- The second line of the disabled row sits under the label (core `Menu.Item` `description`): plan decision D2.
- Sort arrows in the table headings: not part of this checkpoint.

## Capture artifacts (not findings)
- email-refused-* (4 files): the tooltip "Send ⌘↵" is drawn over the footer edge because the pointer stays on Send after the click. It hides nothing. A faint remainder of it is in email-invalid-1280-dark and email-invalid-phone-390-dark.

## For gate 3
Nothing visible.
