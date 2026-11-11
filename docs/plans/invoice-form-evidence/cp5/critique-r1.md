# Gate 2 critique — invoice-form checkpoint 5, after fix round 1

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

## Round-0 BLOCKING findings — verification

1. Wide read-view band (five-column row, email broken mid-word, Due date detached): FIXED. `posted-1280`, `void-1280`, `reader-1280` now draw Customer / Bill to / Email in one left column at full width and Terms · Invoice date · Due date in one row with Tax under them, as the reference. The email is on one line.
2. Totals not under Amount: FIXED. The totals' amounts end at the same x as the lines' Amount column (~1203 px) on all three wide shots.
3. Message / Memo under the totals: FIXED. "Message on invoice" and "Memo" sit in the left column beside the totals on `posted-1280` and `reader-1280`, as the reference. On the phone the totals stay above Message / Memo, as reference `posted-phone-390` (not a finding).
4. Void Balance due $0.00: FIXED. `void-1280` and `void-phone-390` read Balance due $205.46 in the header figure and the totals row, equal to Total.

## Findings

### posted-1280 (light, dark)
nothing found.

### posted-phone-390 (light, dark)
- posted-phone-390: header band — the Email block is drawn on top of the Terms · Invoice date · Due date row: the "Email" label overprints "Terms", and "accounts.payable@harborviewhospitality.com" overprints "Net 30 · Oct 21, 2026 · Due Nov 20, 2026". Neither line can be read. Below Tax the band keeps ~70 px of empty space, so the band's height is reserved for a block that is not laid out where it is drawn. The wide band at 1280 is correct; only the phone band is broken, on every phone shot of this checkpoint. — BLOCKING (reference `posted-phone-390`: Email on its own row above "Terms · Invoice date · Due date", each legible; spec §3.6 "Body: Bill to, Email, Terms, Invoice date, Due date, … Tax")
- Dark: same.

### void-1280 (light, dark)
nothing found.

### void-phone-390 (light, dark)
- void-phone-390: header band — same Email-over-Terms overprint and trailing blank space as posted-phone-390. — BLOCKING (same basis)
- void-phone-390: action bar — the lone "More" is drawn with accent-coloured text, while "More" on `posted-phone-390` and `reader-390` has foreground text; one style for the same control (carried from round 0, not fixed). — NOTE
- void-phone-390: action bar — Copy and View journal entry both hide behind a lone "More"; the reference draws them as buttons when Edit is absent (carried from round 0; the plan puts "the rest in `invoice-read-more`", so not blocking). — NOTE
- Dark: same.

### reader-1280 (light, dark)
nothing found.

### reader-390 (light, dark)
- reader-390: header band — same Email-over-Terms overprint and trailing blank space as posted-phone-390. — BLOCKING (same basis)
- reader-390: action bar — a reader's single action (View journal entry) sits behind a lone "More" (carried from round 0). — NOTE
- Dark: same.

### void-dialog-1280 (light, dark)
nothing found. Title "Void invoice 1003?", body "A reversing entry is posted in the original period. The number is kept.", Cancel / Void invoice.

### void-dialog-phone-390 (light, dark)
nothing found in the sheet itself. The band behind it shows the posted-phone-390 overprint; not counted again.

## Summary

- INVALID: 0
- BLOCKING: 1 distinct — the phone read-view band draws Email over the Terms · Invoice date · Due date row and leaves blank space under Tax (`posted-phone-390`, `void-phone-390`, `reader-390`, and the background of `void-dialog-phone-390`). One fix in the read view's phone band clears every phone shot. The four round-0 BLOCKING findings are fixed.
- NOTE: 2 distinct — accent-coloured "More" on the void phone bar; a lone "More" hiding one or two actions on the reader's and void phone bars (both carried from round 0).

## For gate 3

- None visible.
