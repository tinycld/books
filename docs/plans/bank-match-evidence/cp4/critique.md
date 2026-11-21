# Gate 2 critique: bank-match, checkpoint 4 (Reviewed matches, undo and help)

Verdict: `CRITIQUE: 0 INVALID, 0 BLOCKING, 1 NOTE`

Read: all 20 built shots (5 names × 390/1280 × light/dark). Reference shots read: the 10 light shots, and the dark shots `reviewed-1280`, `matched-1280`, `read-only-matched-1280`. The other 7 dark reference shots were not opened; the dark built shots were judged on their own and against the light reference structure.

Scope judged: the In Books column and the card's third line, the Matched to section, Undo match, the result line of an undo, the reader view. The help topic has no screenshot in this set and was not judged.

## State check

| Shot | 390 light | 390 dark | 1280 light | 1280 dark |
|---|---|---|---|---|
| reviewed | valid | valid | valid | valid |
| matched | valid | valid | valid | valid |
| matched-three | valid (2 lines) | valid (2 lines) | valid (2 lines) | valid (2 lines) |
| undone | valid | valid | valid | valid |
| read-only-matched | valid | valid | valid | valid |

- reviewed: Reviewed tab is active, one matched row, In Books shows "Matched · Bill payment 1001" as a link.
- matched: drawer (sheet at 390, inline at 1280) on ONLINE BILL PAY 0915 with Matched to, one link row, the "Matched … by …" line and Undo match.
- matched-three: the drawer lists 2 link rows, not 3, and the row reads "Matched · 2 transactions". The state the name stands for (a match that holds several Books transactions: plain text in the list, the lines listed in the drawer) is shown. The three-line count itself is not shown by any built shot.
- undone: the result line "Match undone. The transaction is back in For review." shows under the toolbar and the drawer is closed. At 1280 the Reviewed list is empty after the undo (the reference keeps two rows); the state is the same.
- read-only-matched: same drawer with no Undo match; the sidebar has no New button and the panel header shows "View register" in place of the menu.

## Findings

### reviewed-390-light, reviewed-390-dark
Nothing found. The card has three lines (description, date, In Books link) and the amount at the right, as the reference.

### reviewed-1280-light, reviewed-1280-dark
Nothing found. In Books is between Description and Spent; header and cells are aligned; the memo line is kept; nothing scrolls sideways.

### matched-390-light, matched-390-dark
- matched-390-*: Matched to, link row "Bill payment 1001" — the link is regular weight; the reference draws the type-and-number link in a heavier weight ("Expense 1029"), which sets it apart from the muted line under it — NOTE. The same applies to every Matched to row of the set (matched-1280-*, matched-three-*, read-only-matched-*); counted once.

The amount is on line 1 of the row, not centred on the two lines as in the reference. This is settled difference 1 of the brief ("line 1 is the box (writers), the type-and-number link and the amount"); not a finding.

### matched-1280-light, matched-1280-dark
Nothing more found. With the inline drawer open the list is cards, so nothing scrolls sideways; the reference shows a table there with Spent and Received out of view, so the build is the correct side of the rule "A table never scrolls sideways". The chosen card is marked; legible in dark.

### matched-three-390-light, matched-three-390-dark
Nothing more found. Line 2 of each row is the date alone (settled difference 1: "the date alone when the entry has no customer or vendor").

### matched-three-1280-light, matched-three-1280-dark
Nothing more found. "Matched · 2 transactions" is plain text and the one-line match under it is a link, as the reference decides.

### undone-390-light, undone-390-dark
Nothing found. The result line wraps to two lines, as in the reference.

### undone-1280-light, undone-1280-dark
Nothing found. The result line sits above the empty-state text; the two do not collide and both are legible.

### read-only-matched-390-light, read-only-matched-390-dark
Nothing more found. No Undo match; the section ends at the "Matched … by …" line with no gap left by the missing button.

### read-only-matched-1280-light, read-only-matched-1280-dark
Nothing more found.

## Seen outside this checkpoint (not findings)
- read-only-matched-390-*: the panel title "1000 Business Checking" wraps to two lines beside "View register". The panel header is from an earlier unit.
- *-390-*: the tab strip cuts the fourth tab to "F" at the right edge. Earlier unit.
- *-1280-* with the drawer open: the second account card is cut at the right edge of the card row. The reference shows the same.

## For gate 3
- Every drawer shot: "Imported Nov 20, 2026 by Test User" and "Matched Nov 19, 2026 by Test User" for rows the seed made in the same second. One text shows the UTC day and the other the local day (the capture note says the same).
- No three-line match was captured, so the row text "Matched · 3 transactions" and a three-row Matched to list are shown only by the reference and by unit tests.
