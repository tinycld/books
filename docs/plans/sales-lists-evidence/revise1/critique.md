# Gate 2 critique: sales-lists, eval revise 1 (leave confirm)

Scope: the "Discard changes?" confirm over a dirty Books transaction form. No reference shot exists for this dialog; it is judged against the design system, the lessons, and the earlier screens.

## leave-confirm-beside-1440-light.png

State check: VALID. The confirm shows over a dirty new invoice ("Unsaved memo" in Internal memo) beside the 320 px invoices column.

- nothing found. Title, body, divider and right-aligned actions are clear; the safe action (Keep editing) has the initial focus; Discard is the destructive color; the scrim dims the column and the form equally.

## leave-confirm-beside-1440-dark.png

State check: VALID. Same state, dark scheme.

- leave-confirm-beside-1440-dark: dialog footer, Discard button — the fill is a muted rose, much less saturated than the light-scheme red, so the button reads close to a disabled control — NOTE.

## leave-confirm-phone-390-light.png

State check: VALID. The confirm shows as a bottom sheet over the dirty new invoice ("Unsaved memo") at 390.

- leave-confirm-phone-390-light: sheet header, close X — the initial focus ring is on the close X, not on Keep editing as at 1440; the ringed X is the most prominent control of the sheet after Discard — NOTE.
- leave-confirm-phone-390-light: sheet footer — Keep editing and Discard are about 32 px tall, small for touch; Keep editing is bare text with no button shape beside a filled Discard — NOTE.

## leave-confirm-phone-390-dark.png

State check: VALID. Same state, dark scheme.

- leave-confirm-phone-390-dark: sheet footer, Discard button — same muted rose fill as at 1440 dark; reads close to disabled — NOTE.
- leave-confirm-phone-390-dark: sheet header and footer — same focus-on-X and small-action findings as the light shot (not counted again).

## For gate 3

- Dark scheme: confirm that the Discard button is enabled in the dark shots (lesson: "Core Dialog action buttons disable themselves while writes are unavailable"). The muted fill can be the dark destructive token or a disabled state; the shots cannot tell which.
- Phone: the initial focus goes to the sheet's close X, not to Keep editing. Confirm that the X acts as Keep editing (the form and its edits stay).

CRITIQUE: 0 INVALID, 0 BLOCKING, 4 NOTE
