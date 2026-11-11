# Gate 2 critique — invoice-form checkpoint 5, after fix round 2

Scope: the Delivers line of checkpoint 5 (Post / Post & new, the read view of a posted or void invoice with its actions, the correction form, the Void dialog, the reader's read view). Checkpoint 6 items (Details / PDF view tabs, Download PDF) are not findings. Shots re-captured after the fix: `posted-1280`, `posted-phone-390`, `void-1280`, `void-phone-390`, `reader-1280`, `reader-390`, `void-dialog-1280`, `void-dialog-phone-390` (light and dark). Form-band and line-table decisions from checkpoints 3 and 4 (uppercase BALANCE DUE caption, phone card labels) are not re-judged.

## State check

| Shot | Light | Dark | Verdict |
|---|---|---|---|
| posted-1280 | Invoice 1003, Posted badge, read view, Edit / Void / Copy / View journal entry | same | valid |
| posted-phone-390 | same at 390, full page, More + Edit | same | valid |
| void-1280 | Invoice 1004, Void badge, Posted by + Voided by, Copy / View journal entry | same | valid |
| void-phone-390 | Invoice 1005, Void badge, both stamps, More only | same | valid |
| reader-1280 | Invoice 1003 read view, only View journal entry | same | valid |
| reader-390 | same at 390 (viewport height), only More | same | valid |
| void-dialog-1280 | "Void invoice 1003?" dialog over the read view | same | valid |
| void-dialog-phone-390 | same as a sheet | same | valid |

0 INVALID.

## Round-1 BLOCKING — verification

Phone read-view band (Email drawn over the Terms · Invoice date · Due date row, blank space under Tax): FIXED. On `posted-phone-390`, `void-phone-390`, `reader-390` and the background of `void-dialog-phone-390` the Email block sits on its own row above "Terms · Invoice date · Due date", Tax is under that row, every line is legible, and the band ends directly under Tax with no reserved blank space. Light and dark both.

## Round-0 BLOCKING — still hold

1. Wide band: `posted-1280`, `void-1280`, `reader-1280` keep Customer / Bill to / Email in one left column at full width and Terms · Invoice date · Due date in one row with Tax under; the email is on one line. Holds.
2. Totals under Amount: the totals' amounts end at the same x as the lines' Amount column (~1203 px) on all three wide shots. Holds.
3. Message on invoice / Memo in the left column beside the totals on `posted-1280` and `reader-1280`; on the phone the totals stay above Message / Memo, as the phone reference. Holds.
4. Void Balance due = Total: `void-1280` and `void-phone-390` read $205.46 in the figure and the totals row, equal to Total. Holds.

## Findings

### posted-1280 (light, dark)
nothing found.

### posted-phone-390 (light, dark)
nothing found. The Memo label now has the same gap above it as the Message label (round-0 NOTE cleared).

### void-1280 (light, dark)
nothing found.

### void-phone-390 (light, dark)
- void-phone-390: action bar — the lone "More" is drawn with accent-coloured text, while "More" on `posted-phone-390` and `reader-390` has foreground text; one style for the same control (carried from rounds 0 and 1). — NOTE
- void-phone-390: action bar — Copy and View journal entry both hide behind a lone "More"; the reference draws them as buttons when Edit is absent (carried; the plan puts "the rest in `invoice-read-more`", so not blocking). — NOTE
- Dark: same.

### reader-1280 (light, dark)
nothing found.

### reader-390 (light, dark)
- reader-390: action bar — a reader's single action (View journal entry) sits behind a lone "More" (carried; same basis as above). — NOTE
- Dark: same.

### void-dialog-1280 (light, dark)
nothing found. Title "Void invoice 1003?", body "A reversing entry is posted in the original period. The number is kept.", Cancel / Void invoice.

### void-dialog-phone-390 (light, dark)
nothing found. The band behind the sheet is now correct.

## Summary

- INVALID: 0
- BLOCKING: 0. The round-1 phone-band finding is fixed, and the four round-0 fixes hold.
- NOTE: 2 distinct, both carried — accent-coloured "More" on the void phone bar; a lone "More" hiding one or two actions on the reader's and void phone bars.

## For gate 3

- None visible.
