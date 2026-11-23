# Design critique: dashboard, checkpoint 2, gate 2

Scope: the header without Customize (D7), the page grid, the preference banner, and the Invoices widget with its loading, error, empty and hidden-amounts states. The four later widgets, the Customize button and the phone header are not judged. Names and numbers are not judged (D8). The setup card under the heading is planned (D13).

All 28 built shots were read with their 28 reference shots.

## State check

| Shot (light and dark) | Shows the named state? |
|---|---|
| populated-900 | Yes. One column, Invoices card with figures. |
| populated-1280 | Yes. Two columns, card in column 1. |
| populated-1600 | Yes. Three columns, card in column 1. |
| populated-phone-390 | Yes. One column, FAB shown. |
| hidden-amounts-1280 | Yes. Switch on, all five amounts are the mask. |
| hidden-amounts-phone-390 | Yes. Switch on, amounts are the mask. |
| loading-1280 | Yes. Title and skeleton. |
| loading-phone-390 | Yes. Title and skeleton. |
| error-1280 | Yes. "This widget could not load." and Retry. |
| error-phone-390 | Yes. Same. |
| prefs-error-390 | Yes. Banner with Retry, switch disabled, default arrangement. |
| prefs-error-1280 | Yes. Same. |
| empty-390 | Yes. "No unpaid invoices." and "Create invoice". |
| empty-1280 | Yes. Same. |

INVALID: 0.

## Findings

Each finding applies to the light and the dark shot.

- populated-900: nothing found.
- populated-1280: Invoices card, bar — the "Not due yet" part is 1.5% of the bar and shows only as a teal cap about 5 px wide at the right end; it is hard to see as a part of a split. A minimum drawn width for a part that is not zero would help — NOTE. The same applies to populated-1600, populated-900, populated-phone-390, hidden-amounts-* and prefs-error-*; it is counted once.
- populated-1600: nothing more.
- populated-phone-390: nothing more.
- hidden-amounts-1280: nothing more. The leading mask keeps the figure's size, the bar stays, the count line stays, as the reference.
- hidden-amounts-phone-390: nothing more.
- loading-1280: nothing found. The skeleton blocks match the reference in size and tone, in light and dark.
- loading-phone-390: nothing found.
- error-1280: Invoices card, Retry button — the button is 44 px high with a 12 px label; the reference button is 32 px high. The small label in the tall box looks unbalanced, and it does not agree with "Create invoice" in the empty state (44 px high, 14 px bold label) — NOTE.
- error-phone-390: same Retry button as error-1280; counted once.
- prefs-error-390: nothing found. Banner, Retry, disabled switch and default arrangement match the reference.
- prefs-error-1280: nothing found.
- empty-390: Invoices card, "Create invoice" button — 44 px high with a 14 px bold label; the reference draws a compact button (32 px high, 12 px label). The built button has more weight than the card's title and text — NOTE.
- empty-1280: same button as empty-390; counted once.

Differences from the reference that are not findings:

- Empty state: the built card keeps the "View invoices" and "A/R aging" links under the button; the reference has none. The plan decides this (Do step 7: "the links row stays").
- The setup card "Finish setting up Books" between the heading and the grid (D13).
- No Customize button and no phone Customize icon (D7, checkpoint 4).
- Loading shots: the "Hide amounts" switch is enabled, because only the widget's read is held; the reference holds the preference too.

No table or grid scrolls sideways at 390, 900, 1280 or 1600.

## For gate 3

- Every shot shows the setup card ("Name your business and create your starter chart of accounts.") on a book that has posted invoices and payments. Check that the capture database really has setup not completed for this admin, and that the card's condition is the Lists hub's condition.
- hidden-amounts-phone-390 has no click in capture.json; it shows the mask from the state the 1280 shot saved. Check that the capture switches the preference off again afterwards (plan Do step 14).

## Verdict

CRITIQUE: 0 INVALID, 0 BLOCKING, 3 NOTE
