# Gate 2 critique: attachments, checkpoint 3 (Add and remove, read view), after the fix round

Shots read: 18 built (9 names; light and dark), 14 references. Not read: the run ledger (its Design notes can already hold note 1); the references `posted-390-dark`, `posted-empty-*-dark`, `form-refused-1280-dark` (the light reference of each name was read).

## State check

| Shot | State shown | Result |
|---|---|---|
| posted-1280-light / -dark | Posted bill 1002, writer, 2 stored rows, compact add row | valid |
| posted-390-light / -dark | Same, phone, section after Memo | valid |
| posted-empty-1280-light / -dark | Posted bill 1003, no files, full add area | valid |
| posted-empty-390-light / -dark | Same, phone | valid |
| expense-390-light / -dark | Posted expense 1003, 1 stored row, compact add row | valid |
| remove-1280-light / -dark | Remove confirm open (Dialog) on OSW-invoice-1002.pdf | valid |
| remove-390-light / -dark | Remove confirm open (Sheet) | valid |
| form-refused-1280-light / -dark | Read view, refusal line for page.html under the add area | valid |
| form-offline-1280-light / -dark | Read view offline (offline pill shown), Attach files and row Remove disabled | valid |

0 INVALID.

## Findings

- posted-1280-light, posted-1280-dark, posted-390-light, posted-390-dark: nothing found beyond note 1.
- posted-empty-1280-light, posted-empty-1280-dark, posted-empty-390-light, posted-empty-390-dark: nothing found. Full-height dashed area, paperclip, prompt, outline button, limit text beside the heading: as the reference.
- expense-390-light, expense-390-dark: nothing found. The row is above 44 px; the add row fits at 390 with no wrap.
- remove-1280-light, remove-1280-dark, remove-390-light, remove-390-dark: nothing found. Title, message, Cancel and destructive Remove agree with the reference (also the muted Remove color in dark) and with the spec text.
- form-refused-1280-light, form-refused-1280-dark (refusal line only): the line is under the add area, in the danger color, wraps cleanly in two lines, legible in both schemes. See note 2.
- form-offline-1280-light, form-offline-1280-dark (add area and row Remove only): the area stays drawn and the layout does not move against posted-1280; Attach files is dimmed; both row Remove (X) icons are now dimmed to the same degree as the button, in light and in dark, and stay visible. The file names and detail lines keep full contrast, which agrees with "open still works". The fix is correct. Nothing found.

Notes:

1. posted-*, remove-*, form-refused-*, form-offline-* (all with bill 1002): attachment list, row 1, thumbnail of OSW-invoice-1002.pdf — the generated thumbnail is a blank white page. In light it reads as an empty box (only a faint border); in dark it is a hard white square, the brightest object on the screen. The row gives no type cue apart from `.pdf` in the name. The probable cause is the seeded 678 B PDF (a page with no visible content), not the component. A seed PDF with visible content would show that the thumbnail works. — NOTE
2. form-refused-1280-light, form-refused-1280-dark: Attach files button — the capture left the pointer on the button, so the shot shows its hover state and the tooltip "Attach files ⌥A". The tooltip touches the lower edge of row 2. Capture artifact; the refusal line is not affected. — NOTE
3. Coverage: the checkpoint delivers an uploading row ("Uploading… 45%" with progress) and a failed row (error in the danger color, Retry, Remove). The references `posted-*` and `expense-390-*` show the uploading row with a progress bar. No built shot shows an uploading row or a failed row, so their appearance was not judged. — NOTE

## For gate 3

- Nothing. (The earlier item, row Remove not dimmed offline, is closed by the fix.)

CRITIQUE: 0 INVALID, 0 BLOCKING, 3 NOTE
