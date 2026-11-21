# Gate 2 critique: statements, checkpoint 5 (Statements tab, statement screen)

Scope: the 36 built `tab*` and `statement*` shots in this folder, each compared with the reference shot of the same name. The printed page was judged as a frame only.

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

## State check

All 36 shots show the state of their name.

| Shot | Sizes | State shown |
|---|---|---|
| tab | 1280 and 390, light and dark | Two statements (ST-1002 not sent, ST-1001 sent), writer, "Create statement" in the header. Table at 1280, cards at 390. |
| tab-menu | 390 light | Row menu of ST-1001 as a bottom sheet: Open, Send…, Download PDF, Delete. |
| tab-menu-wide | 1280 light | Row menu of ST-1001 as a popover with the same four items. |
| tab-reader | 1280 and 390, light | Reader: same rows, no "Create statement", no "New transaction". |
| tab-empty | 1280 and 390, light | "No statements yet", the second line, and the "Create statement" button. |
| tab-reader-empty | 1280 and 390, light | The two lines, no button. |
| statement | 1280 and 390, light and dark | After a send: the sent line with the address, Send…, Download PDF, More, the PDF page. |
| statement-unsent | 1280 and 390, light | "Not sent" and the line "The amount due was $800.00 when this statement was made." |
| statement-reader | 1280 and 390, light | Download PDF only. |
| statement-no-email | 1280 and 390, light | Send… disabled, with "Email sending is not set up". |
| statement-pdf-error | 1280 and 390, light | "Could not load the statement" with Retry, inside the frame. |
| statement-missing | 1280 and 390, light | "This statement does not exist, or you cannot open it." with Back. |
| statement-more | 1280 and 390, light | More menu open, with Delete. |
| statement-send | 1280 and 390, light and dark | "Send statement" dialog (a sheet at 390): To filled and focused, the Attachment line, Cancel, Send. |
| statement-send-refused | 1280 and 390, light | The dialog stays, with the server text in the error summary. |
| statement-delete | 1280 and 390, light | Confirm "Delete statement ST-1001?" with "The customer's balance does not change." |

## Findings

No table scrolls sideways at a captured width. The tab draws a table at 1280 and cards at 390, as the reference does.

- statement-more-390-light: top of the screen — the More menu opens as a sheet at the top edge with its handle below it, and it covers the Back link, the customer link and the title. The row menu (tab-menu-390-light) and the two dialogs open as bottom sheets. The reference shot shows the same top sheet, so the build loses nothing the reference decided. — NOTE
- statement-send-refused-390-light: above the Send button — a "Send ⌘↵" tooltip shows at phone width. The capture's pointer stays on the button after the click, so this is probably a hover effect of the capture. — NOTE
- statement-390-light, statement-390-dark, statement-unsent-390-light, statement-reader-390-light, statement-no-email-390-light: the PDF page — the page is scaled to about 325 px wide, so its text cannot be read. The frame is correct, and Download PDF is on screen. — NOTE

Each shot not named above: nothing found.

## Differences from the reference that are not findings

- statement-no-email (1280 and 390): the build puts "Email sending is not set up" at the left, under Send…. The reference puts it at the right edge of the button row. The build's position ties the note to the disabled button.
- The build's frame holds the real PDF page with a margin and a shadow, on white in dark mode too. The reference drew the page content directly in the frame. This follows the brief ("the printed page in the reference is a drawn stand-in").
- The customer header (name, address, the Open and Overdue figures, New transaction) shows above the tabs in the build. The reference shows only the name. This is real data of the customer page, not a part of this checkpoint.

## For gate 3

Nothing seen.
