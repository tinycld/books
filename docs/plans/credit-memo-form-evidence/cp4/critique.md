# Gate-2 design critique: credit-memo-form, checkpoint 4

Result: 0 INVALID, 0 BLOCKING, 4 NOTE (22 built shots, each compared with its reference).

Round 1 only. NOTE 1 (the link row's gaps) was fixed in fix round 1 and every shot was captured again; `critique-r2.md` judges the new from-invoice and errors shots. The tooltip of NOTE 3 is still in the new errors-1280-light shot (critique-r2).

## State check

| Shot (light and dark) | Shows the named state | Verdict |
|---|---|---|
| from-invoice-1280 | New credit memo from invoice 1003: customer, Bill to, Email, Tax, seven copied lines, link row "For invoice 1003" + "Remove link" | VALID |
| from-invoice-phone-390 | Same form on a phone, lines as cards, link row on one line | VALID |
| errors-1280 | "Choose a posted invoice of this customer." under the link row; no summary | VALID |
| errors-390 | Same refusal under the link row on a phone | VALID |
| void-link-1280 | Posted memo read view, last band row "For invoice 1016 (void)" | VALID |
| void-link-390 | Posted memo read view, last band row "For invoice 1015 (void)" | VALID |
| cannot-credit-1280 | Back link + "This invoice cannot be credited" | VALID |
| cannot-credit-390 | Same on a phone | VALID |
| invoice-read-1280 | Invoice 1003 with "Create credit memo" after Copy, bar on two rows, "Credit memos" grid with memo 1001 | VALID |
| invoice-read-phone-390 | Invoice 1003 on a phone, "Credit memos" as a card, bar More + Edit | VALID |
| invoice-more-phone-390 | More sheet with row "Create credit memo" and key "m" | VALID |

## Findings

- from-invoice-1280, from-invoice-phone-390, errors-1280, errors-390 (light and dark): link row in the band — the space above the row (Email value to the button, about 38 px) is larger than the space below it (button to the "Credit memo date" label, about 26 px), and both are larger than the band's gap between Bill to and Email (about 20 px). The row looks loose from the group it belongs to. The reference has the same large gap above its link row, so no approved decision is lost — NOTE
- from-invoice-*, errors-* (light and dark): link row, left edge — "For invoice 1003" starts 2 px to the left of the field labels (x 357 against 359 at 1280; 33 against 35 at 390). The reference has the same offset — NOTE
- errors-1280-light: above the action bar — a hover tooltip "Save draft ⌘S" covers the "Credit amount" total row. This is a capture artifact (the pointer stayed on Save draft); the dark shot does not have it. Capture again with the pointer moved away if the shot is kept as evidence — NOTE
- invoice-read-1280, invoice-read-phone-390 (light and dark): "Credit memos" section — the built shots show one row (1001, Unapplied). The reference also shows a draft row (link "Draft", muted badge). The seed has no draft memo that names this invoice, so the look of the draft row and of a two-row list has no gate-2 evidence; the e2e void test is the only cover — NOTE

Nothing found:
- void-link-1280, void-link-390 (light and dark): the link is the last row of the read band, as the reference.
- cannot-credit-1280, cannot-credit-390 (light and dark): same as the reference.
- invoice-more-phone-390 (light and dark): row and key text as the reference. The built sheet shows "⌘P" where the reference shows "$mod+p", and Void in the destructive color; both are the shared menu's own drawing.

Checked and correct against the checkpoint text:
- Link row place: between the band's first row and the date row (plan decision); refusal text small and destructive under the row; legible in light and dark.
- "Remove link" is a small outline button; it does not compete with the form's actions.
- Wide invoice bar: seven buttons and More, wraps to two rows at 1280 as the reference; "Create credit memo" after Copy.
- "Credit memos" section: between the memo and the "Posted by" stamp; columns No. (link), Date, Amount (right), Status; header style equal to the lines table above it (the reference used upper case; the built style is more consistent with the screen); cards on a phone with no sideways scroll.

## For gate 3

None visible.
