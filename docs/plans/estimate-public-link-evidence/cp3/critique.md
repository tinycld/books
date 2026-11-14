# Design critique: estimate-public-link, checkpoint 3 (gate 2)

Scope: the decision block, the Accept step, the Decline step, the sending, refusal and network states. All 30 built shots were read. Reference shots read: 20 of 30 (each shot name at one width and scheme or more).

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

## State check

| Shot | Sizes read | State shown | Result |
|---|---|---|---|
| pending | 390, 1280; light, dark | Sentence, Accept (primary), Decline (outline), Download PDF | valid |
| accept | 390, 1280; light, dark | Accept step open, "Your name" empty and focused, Accept estimate, Back | valid |
| accept-error | 390, 1280; light, dark | "Enter your name." under the field, field with error border | valid |
| accept-refused | 390, 1280; light, dark | Name typed, refusal box "This estimate is no longer waiting for an answer." above the buttons, step open (as the capture note says) | valid |
| decline | 390, 1280; light, dark | Question, "Reason (optional)" empty and not focused, Decline estimate (destructive), Back | valid |
| decline-typed | 390; light, dark | Reason with two lines, field focused, step open | valid |
| decline-network | 390, 1280; light, dark | Reason kept, "Could not send. Check your connection and try again." above the buttons, buttons enabled | valid |
| accept-sending | 1280; light, dark | "Accepting…" with spinner, both buttons disabled | valid |
| decline-sending | 1280; light, dark | "Declining…" with spinner, both buttons disabled | valid |

## Findings

### pending-* (4 shots)
Nothing found. Structure agrees with the reference: sentence in muted text, two full-width buttons directly under the total block, Download PDF last in the card.

### accept-* (4 shots)
Nothing found. The field is empty and focused (spec: "The name focuses when the step opens (web)"); the reference shows a typed name, which is data only.

### accept-error-* (4 shots)
Nothing found. Error text is inline under the field, legible in light and dark.

### accept-refused-* (4 shots)
- accept-refused-*: refusal box — the gap above the box (about 24 px from the field) is two times the gap below it (about 12 px to Accept estimate), so the box looks attached to the button — NOTE. The reference has the same spacing.

### decline-* (4 shots)
Nothing found. The dark destructive button is a muted rose, the same as the reference.

### decline-typed-390-* (2 shots)
Nothing found.

### decline-network-* (4 shots)
Nothing found (same spacing remark as accept-refused; counted one time).

### accept-sending-1280-*, decline-sending-1280-* (4 shots)
- accept-sending-1280-dark, decline-sending-1280-dark: the pressed button — the spinner is dark blue on the dimmed teal / rose fill and is almost not visible; in light it is faint also — NOTE. The reference has the same low contrast (core `ButtonSpinner` in a disabled core `Button`).

### All shots
- all: the capture estimate has no message, no expiration date and no business email or phone, so no built shot shows a step under the divider and message, or the card with the contact block below it (the reference shows both) — NOTE. This is a coverage gap of the evidence, not a visible defect; those parts are checkpoint 2 items.

## For gate 3
Nothing visible.
