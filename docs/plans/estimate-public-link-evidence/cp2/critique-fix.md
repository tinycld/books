# Gate 2 design critique after fix: estimate-public-link, checkpoint 2

Scope: fix finding 2 of `cp2-fix.md` only. The Books document action bar (`DocumentSaveBar`) now wraps onto further right-aligned rows. Six re-captured shots. No reference exists; the bar is judged against the screen it sits in. The notes of `critique.md` are not repeated.

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

## State check

| Shot | Shows the named state? |
|---|---|
| books-bar-1280-light, books-bar-1280-dark | Yes. Estimate 1001 form, sidebar open. Bar in 2 rows: 7 buttons, then More. |
| books-bar-1024-1024-light, books-bar-1024-1024-dark | Yes. Sidebar open at 1024. Bar in 2 rows: 5 buttons, then Save & close, Save & new, More. |
| books-bar-tablet-800-light, books-bar-tablet-800-dark | Yes. Tablet width, narrow sidebar. Bar in 3 rows: 3 buttons, 4 buttons, then More. |

No screenshot is INVALID.

## Fix check

The fix condition is met in all six shots: no button is cut off, all eight actions (Cancel, Delete estimate, Convert to invoice, Copy customer link, Save, Save & close, Save & new, More) are visible, the order and the labels are unchanged, and Save & close is the one primary button. Rows are right-aligned to the content edge, with equal gaps between buttons and between rows. The bar keeps its top border and its background in light and dark. Button text does not wrap or truncate at any width.

## Findings

- books-bar-1280-light, books-bar-1280-dark: bottom bar, second row — More is alone on the second row, so the bar is two times as high for one button, and More is no longer in line with the other actions. The row of seven ends about 16 px short of the width that More needs. A smaller gap or smaller horizontal padding at this width keeps one row — NOTE.
- books-bar-1024-1024-light, books-bar-1024-1024-dark: bottom bar — the row break is between Save and Save & close, so the three save actions are divided between two rows (Save at the end of row 1, Save & close and Save & new on row 2). A break before Save keeps the save group together. The Status field behind the bar is cut by the bar's top edge; the form scrolls, so this is not a defect — NOTE.
- books-bar-tablet-800-light, books-bar-tablet-800-dark: bottom bar — three rows, with More alone on the third. The bar is about 170 px high, 19 % of the 900 px window, and Copy customer link is on a row with the save actions, apart from Convert to invoice. All actions are reachable, but the bar looks unplanned at this width. A fixed split (document actions on one row, save actions and More on the other) gives two rows — NOTE.

## For gate 3

- Nothing new. The back link "Journal entries" of `critique.md` is still on these shots.
