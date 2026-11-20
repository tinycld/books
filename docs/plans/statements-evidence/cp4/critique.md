# Design critique: statements, checkpoint 4 (Preview, send and failed runs)

Scope: the Delivers line (Preview and its dialog, Save and send and its extra rule, the run notice of a part failure, the email-not-set-up state, the phone bar and its More menu). 17 built shots, each compared with the reference shot of the same name. The built data is the e2e seed, so names, counts and amounts differ from the reference; that is not a finding.

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

## State check

| Shot | State shown | Verdict |
|---|---|---|
| populated-1280-light / -dark | 14 ticked rows, total, bar with Cancel, Preview, Save, Save and send | valid |
| populated-390-light / -dark | cards, "Select all", total first, bar with Save and send and More | valid |
| send-error-1280-light / -dark | "Enter a valid email address." under Bluefin, "Enter an email address or clear the tick." under Delta (and under the two seed rows that have no address) | valid |
| send-error-390-light / -dark | the same errors in the cards | valid |
| failed-1280-light | notice "2 of 4 statements were sent." with two customer lines; only Delta and Evergreen keep their tick; heading tick mixed; total of 2 customers | valid |
| failed-390-light | the same, cards | valid |
| no-email-1280-light | Save and send disabled, "Email sending is not set up" under the bar | valid |
| no-email-390-light | the same in the phone bar | valid |
| preview-1280-light / -dark | Dialog "Preview" with the PDF page, Close, Download | valid |
| preview-390-light / -dark | Sheet "Preview" with the PDF page, Close, Download | valid |
| more-menu-390-light | Sheet "More" with Preview, Save, Cancel and their key hints | valid |

## Findings

- populated-1280-light: nothing found
- populated-1280-dark: nothing found
- populated-390-light: nothing found
- populated-390-dark: nothing found
- send-error-1280-light: nothing found
- send-error-1280-dark: nothing found
- send-error-390-light: nothing found
- send-error-390-dark: nothing found
- failed-1280-light: nothing found
- failed-390-light: above the bar's Save and send button — a tooltip "Save and send ⌘↵" stays drawn over the list after the run failed; it covers part of the last visible card, and it shows a key hint on the phone layout. The reference shot has no tooltip, and failed-1280-light and send-error-390 have none — NOTE
- no-email-1280-light: nothing found
- no-email-390-light: nothing found
- preview-1280-light: PDF frame — the white page is on a near-white frame, so only a faint shadow separates the page from the frame; the dark shot separates them clearly — NOTE
- preview-1280-light, preview-1280-dark: bottom of the PDF frame — the page is cut flush at the frame's lower edge, with no cue that the document continues ("Page 1 of 14" is inside the page only). The 390 shots show the top of page 2, which gives the cue there — NOTE
- preview-1280-dark: no other finding
- preview-390-light: nothing found
- preview-390-dark: nothing found
- more-menu-390-light: nothing found

The frame around the PDF (title, close button, bordered page area, footer with Close and the primary Download) has the same structure and size as the reference at both widths. The run notice, the inline errors, the disabled primary with its note, and the More sheet keep the reference's position and hierarchy.

## For gate 3

- failed-390-light: the tooltip of Save and send is still open after the run ended and after a click on the screen title. Possible cause: the button became disabled during the run, so the tooltip did not get its close event. Check that the tooltip closes when the button is disabled, and that no key-hint tooltip opens on the phone layout.
