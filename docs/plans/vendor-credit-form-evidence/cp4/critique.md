# Design critique: vendor-credit-form, checkpoint 4

Scope: the Apply to bills action and notice, the apply dialog (Sheet on a phone), the Applied to block, and Remove.
Read: all 38 built shots (18 names; `applied` at 1280 and 390, the others at one width; light and dark). Reference: the light shot of each name and width (no reference read for `apply-loading-390` and `apply-error-390`).

Result: 0 INVALID, 1 BLOCKING, 13 NOTE.

## State check

| Shot | Width | State shown | Result |
|---|---|---|---|
| posted | 1280 | Credit 1001, badge Posted, notice "Pacific Power has 3 open bills…", Apply to bills primary in the bar | valid |
| posted-phone | 390 | Same credit; bar is More + Apply to bills | valid |
| partly | 1280 | Credit 1002, badge Partly applied, Applied to block with one row and Remove | valid |
| partly-phone | 390 | Same credit, cards, Applied to block | valid |
| phone-more | 390 | More sheet on credit 1001: Edit, Void, Copy, View journal entry, Audit history (the reference uses credit 1002; same state) | valid |
| apply | 1280 | Dialog with a 4-column grid, 3 bills, credit spread 300.00 / 350.00, first cell in focus | valid |
| apply-phone | 390 | Sheet with bill cards | valid |
| apply-errors | 1280 | Cell error under row 1 and the sum error in the error summary | valid |
| apply-errors-phone | 390 | Cell error under card 1 (the error summary is below the fold) | valid |
| apply-empty | 1280, 390 | "Ironclad Equipment Rentals has no open bills…" with New bill | valid |
| apply-loading | 1280, 390 | Three skeleton rows, Apply credit disabled | valid |
| apply-error | 1280, 390 | "Books could not load the open bills." with Retry, Apply credit disabled | valid |
| remove | 1280, 390 | Confirm dialog "Remove this credit from Bill 1007?…" | valid |
| applied | 1280, 390 | Credit 1001, badge Applied, two rows in Applied to, toast "Applied $650.00 to 2 bills", no Apply to bills | valid |

The grid has no Bill total column, its last header is "Credit to apply", and it has no header tick box. This agrees with the Gates line.

## Findings

### posted-1280, posted-phone-390 (light, dark)
- posted-1280, posted-phone-390: notice "Pacific Power has 3 open bills…" — the notice is below the Attachments section, directly above "Posted by". The reference puts it directly below the title, above the details band. On the phone the built notice starts at y = 783 of an 844 px viewport, behind the action bar, so the reader does not see it without a scroll. — BLOCKING (reference decision: `posted-1280-light.png` and `posted-390-light.png` show the notice as the first block below the title and above the Vendor band; spec §3.7: "Notice (writer, posted, `balance` > 0, the vendor has an open bill)")

### partly-1280, partly-phone-390 (light, dark)
- partly-1280, partly-phone-390: Applied to row, Remove button — the label is smaller than in the reference (about 12 px against 14 px). The height is correct. — NOTE

### phone-more-390 (light, dark)
- phone-more-390: sheet rows — the key hints are lowercase ("e", "v", "c", "j"); the reference shows uppercase. Recorded at checkpoint 3; not changed. — NOTE
- phone-more-390: the "Audit history" row has a highlight background with no user action on it (possibly the pointer of the capture). — NOTE

### apply-1280 (light, dark)
- apply-1280 (also apply-errors-1280): grid, Due date column — an overdue row shows "Sep 24, 2026 · O…". The word "Overdue" is not readable; only the danger tone tells the state. The Bill column has free space (its content is about 60 px in a 130 px column). A wider Due date column, or "Overdue" on a second line as the bill no. is, keeps the word. The spec permits the ellipsis ("long text ellipsized"). — NOTE
- apply-1280 (also all apply-* shots): line "Unapplied credit $650.00" — bold in the build, regular weight in the reference. It competes with the dialog title. — NOTE

### apply-phone-390 (light, dark)
- apply-phone-390, apply-errors-phone-390: a tooltip "Apply credit ⌘↵" shows above the button and covers the edge of the third card. Possibly the pointer of the capture, but a key hint on a phone is out of place. — NOTE

### apply-errors-1280 (light, dark)
- apply-errors-1280: summary line — "Applying $100,349.00 to 2 bills · $0.00 stays unapplied" while the amount is above the credit. The "$0.00 stays unapplied" part reads as a correct state directly above the error box. — NOTE

### apply-errors-phone-390 (light, dark)
- apply-errors-phone-390: after Apply credit, the error summary ("More than the unapplied credit of $650.00.") is below the fold. Only the cell error is visible. When the only error is the sum error, the sheet shows no change. The reference shows this text directly below the Apply date, in view. — NOTE

### apply-empty-1280, apply-empty-phone-390 (light, dark)
- apply-empty: the Apply date field shows above the empty text. The reference shows no date field in this state, and the field has no use here. — NOTE

### apply-loading-1280, apply-loading-phone-390 (light, dark)
- apply-loading (dark, both widths): the three skeleton rows have almost no contrast with the dialog surface. On apply-loading-phone-390-dark they are hard to see. — NOTE
- apply-loading-1280-dark: a "Reconnecting…" pill shows at the top of the page (the capture hides this label in the other shots). Capture defect, not a build defect. — NOTE

### apply-error-1280, apply-error-phone-390 (light, dark)
- apply-error (dark, both widths): the Retry button has no visible border or surface on the danger banner; it reads as plain text. In light it is a white button. — NOTE

### remove-1280, remove-phone-390 (light, dark)
- remove (dark, both widths): the destructive Remove button is a pale, low-saturation red. It looks disabled next to the same button in light. — NOTE

### applied-1280, applied-390 (light, dark)
nothing found (on applied-390 the toast covers the back link while it shows; this is temporary)

## Carried from checkpoint 3 (not counted)
- 1280 action bar: More is the first button, left of the primary button; the reference has no More at this width.
- Details band at 1280: Credit date and Vendor's credit no. start at x = 814, detached from Vendor.

## For gate 3
- apply-errors-1280: the summary shows "$0.00 stays unapplied" when the applied sum is above the unapplied credit. Check that the clamp is intended.
- apply-errors-phone-390: check that a sum-only refusal scrolls the error summary into view in the Sheet.
