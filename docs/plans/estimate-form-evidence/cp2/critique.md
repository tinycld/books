# Design critique: estimate-form, checkpoint 2

Result: 0 INVALID, 5 BLOCKING, 7 NOTE.

Scope read: all 46 built shots (light and dark). Reference: the light shot of each name at 1280, plus the light phone shots of new, filled-phone, accepted-phone, expired-phone, errors-phone, reader-phone, pdf and loading. Not read: the dark reference shots, and the 390 reference shots of error, not-found and no-access.

Parts of later checkpoints (Delete estimate, Convert to invoice, Open invoice, the converted line) are absent from the built bars and are not findings.

## Phone bar on one row (the reference flaw)

Confirmed fixed. `new-390`, `filled-phone-390`, `accepted-phone-390`, `expired-phone-390`, `errors-phone-390` and `pdf-390` (light and dark) each show Cancel · Save & close (primary) · More on one row. The reference wraps More to a second row; the build does not.

## State check

| Shot | State shown | Verdict |
|---|---|---|
| new-1280, new-390 | New estimate, Pending, empty form, one empty line | valid |
| filled-1280, filled-phone-390 | Saved Estimate 1005, Pending, 4 items and a Subtotal row | valid |
| accepted-1280, accepted-phone-390 | Saved Estimate 1006, Accepted, Accepted by and Accepted date shown | valid |
| expired-1280, expired-phone-390 | Estimate 1007, Pending and Expired badges, hint under Expiration date | valid |
| rejected-1280 | Estimate 1008, Rejected, no acceptance fields | valid |
| errors-1280, errors-phone-390 | Saved estimate with one inline error (Expiration date) | valid, but thin: see findings |
| pdf-1280, pdf-390 | PDF tab of an unsaved estimate with the Save notice | valid |
| reader-1280, reader-phone-390 | Read view of an Accepted estimate | valid |
| loading-1280, loading-390 | Spinner | valid |
| error-1280, error-390 | Load error with Retry | valid |
| not-found-1280, not-found-390 | "This estimate does not exist" | valid |
| no-access-1280, no-access-390 | "You need bookkeeper access to create estimates" | valid |

Light and dark agree in every pair. Dark mode is legible in all shots.

## Findings

### BLOCKING

1. errors-1280, errors-phone-390: band row 2, Accepted date — Status is Accepted, Accepted date is empty, the form was submitted (the Expiration date error is drawn), and no error shows under Accepted date. — BLOCKING (spec 3.3: "Accepted date (day, required while shown, default today when the user picks Accepted)"; brief: "`Enter the accepted date` (`acceptedDateRequired`)"; reference `errors-1280` and `errors-phone-390` draw the error under Accepted date together with the Expiration date error).

2. reader-phone-390 (light and dark): details card, Accepted by — the value "Marisol Alvarez-Whitfield, owner, by phone with the site lead" stays on one line, runs past the card border and is cut at the screen edge with no wrap and no ellipsis. — BLOCKING (spec 3.8: "`DocumentReadView` with the estimate's details: estimate date, expiration date, status badge, Accepted by / Accepted date when set"; spec 3.3: "Accepted by (text ≤ 200, optional)": a value inside the limit cannot be read).

3. reader-phone-390 (light and dark): bottom bar — the bar holds only "More". The one action of a reader is hidden in a menu. — BLOCKING (brief decision: "a reader's open estimate shows Download PDF only"; reference `reader-phone-390` shows a primary "Download PDF" button on the bar; built `reader-1280` shows it).

4. new-1280, filled-1280, accepted-1280, expired-1280, rejected-1280, errors-1280 (light and dark): lines table header, last column — "Tax" breaks in the middle of the word ("Ta" / "x"). — BLOCKING (reference `new-1280`, `filled-1280` and the other wide form shots show the header "Tax" on one line; memory p1-chart-of-accounts: "a column must never collapse to blank (minWidth + ellipsis)"). The table is the shared invoice table, so the fix is in the shared column width.

5. new-1280, filled-1280, accepted-1280, expired-1280, rejected-1280, errors-1280 (light and dark): totals panel, tax row — the label "Denver combined (8.71%)" is left-aligned and wraps to two lines, while "Subtotal" and "Total" are right-aligned on one line. — BLOCKING (reference `filled-1280`, `expired-1280`, `rejected-1280`: the tax label is on one line and right-aligned in the same label column as Subtotal and Total; the built phone shots do it correctly).

### NOTE

6. errors-1280, errors-phone-390: no form summary is shown. The capture notes say the summary and the inline errors cannot show together. The appearance of `estimate-error-summary` on this screen is thus not in the evidence and was not judged. — NOTE

7. reader-1280, reader-phone-390: details "Tax" and the totals tax row read "Denver combined" with no rate. The reference reads "Denver combined (8.71%)" in both places, and the built form shows the percent. — NOTE

8. All form shots, both widths: header band — about 40 px of empty space below the date row before the divider, and again below Status before the band's lower edge. The reference band is tighter. — NOTE

9. accepted-1280, errors-1280: header band — row 1 uses three narrow fields on the left half; row 2 uses three thirds of the full width. The columns of the two rows do not align. The reference aligned them. — NOTE

10. accepted-1280, accepted-phone-390: band row 2 — the Accepted by text is larger than the Status and Accepted date values beside it. — NOTE

11. filled-phone-390, accepted-phone-390, errors-phone-390: line cards — the card title is "Item" with no line number (reference: "Line 1 · Item"), while refusals name "Line <n>". Qty and Price each take a full row, so a card is much taller than in the reference. — NOTE

12. not-found-*, no-access-*: one left-aligned line of text with no action, while the error state is centered with a button. The three states do not look like one family. Same as the reference. — NOTE

### Nothing found

- pdf-1280, pdf-390 (light and dark): nothing found.
- loading-1280, loading-390 (light and dark): nothing found.
- error-1280, error-390 (light and dark): nothing found.
- expired-1280, expired-phone-390: badges and hint correct; only findings 4, 5 and 8 apply.
- rejected-1280: only findings 4, 5 and 8 apply.

## For gate 3

- errors-*: with an Expiration date error and an empty Accepted date in one submit, only the Expiration date error is reported (finding 1). Check that the two `superRefine` rules both run.
- reader-*: the read view's tax label has no percent although the form's has (finding 7). Check the rate read for a quote kind (an estimate has no tax lines).
