# Checkpoint 9 gate 2 critique (first pass)

State check: all shots VALID. Seeded posted entry "Entries seed posted" (JE-10, $800.00, Oct 25, 2026) found with typeSearch, then the row menu opened with `entries-row-menu-<id>` (scratch spec step `rowMenu`, which finds the row by its text). No dialog was confirmed, so the seed is not mutated. Shots: row-menu-1280-light, row-menu-1280-dark, row-menu-390-light, row-reverse-1280-light, help-1280-light, help-end-1280-light, help-links-1280-light. Spec extensions (scratch spec only): steps `rowMenu`, `placeholder`+`value`, `text`, `scrollText`. Help is reached in-app: `nav-help`, search "Journal entries", click the topic (route /help/books/journal-entries).

Reference caveats: list-1280-light and list-390-light show the closed list with trigger columns but no open menu and no search, so the menu, sheet and help page have no reference. Row content differs on purpose (one searched row, JE-10, vs eight rows). The filtered list also shows a "Date range" select in place of the reference's fourth chip ("This fiscal year" select vs chip); this is carried over from earlier checkpoints.

Row menu trigger, 1280 light (reference in brackets):
- Trigger glyph (3 vertical dots) centred x 1242, row centre y 216, right of the Total column [x 1242, same]. The 44 pt hit area is x 1220-1264, which ends at the 1264 content edge [same]. Code: `width: 44, minHeight: 44`. Glyph 18 px, muted colour, matches the reference glyph size and tone.
- Header row: the actions column has no label [same].
- Row height 44 (y 194-238) [45, y 178-223]. Match.

Popover, 1280 light:
- Popover x 1067-1265, y 243-383 (198 x 140), bottom-end aligned: right edge 1265 matches the trigger's right edge (1 px shadow/border). It opens 5 px under the row rule. No clipping.
- Items in order Open, Edit, Reverse, Void (posted row actions per the plan). Row height 33, text 14 px, left inset 40 (icon slot kept empty, so text lines up with other core menus). Void is red (destructive token); the others are foreground. First row "Open" shows the keyboard-focus highlight (teal tint).
- Dark 1280: dark surface with a hairline border, light text, Void in the dark-mode red, focus row grey-blue. Tokens only, no raw colours. VALID.

Row menu, 390 light:
- The menu is a sheet hanging from the TOP edge (core `Menu` default: "edge nearest the trigger"; the row sits in the upper half). Sheet y 0-246, title "JE-10" with X at x 364, rows Open, Edit, Reverse, Void (red) at y 68/110/152/194 (42 px pitch, 15 px text, 18 px icon slot kept). Grabber at the bottom edge (y 233). Scrim dims the page and the tab bar.
- The row card behind it: trigger dots at x 352, y 277, in the right column under the Posted badge. The card is partly covered by the sheet.
- Phone sheets for dialogs in cp8 (Reverse) and the New menu (`sheetSide="bottom"`) rest at the bottom edge. This menu rests at the top. NOTE 1.
- Trigger in the card: x 331-374 wide column, 44 pt tall; sits right of the amount and badge, vertically centred between them [reference same: x 351, rows centred]. VALID.

Reverse dialog opened from the list menu, 1280 light:
- Centred dialog x 460-820 (360 wide), y 235-566, over a scrim; the list stays visible behind (row at y 216 above the dialog top). Title "Reverse JE-10" with X at x 793 (the X is now present: cp8 NOTE 3 is fixed). Reversal date 2026-11-01 with hint "Not before the entry date", Memo "Reversal of JE-10", footer Cancel and teal "Reverse entry" (x 697-799). Same as the cp8 dialog opened from the entry page. The menu is closed behind the dialog. VALID.
- Focus ring on date field is not shown in this shot (cp8 NOTE 4 no longer applies).

Help topic page, 1280 light:
- Opened from the rail help button, search, then the topic. Title "Journal entries" 24 px bold at y 36, summary line "Create, post, edit, reverse and void journal entries." in muted text at y 66. Intro in two paragraphs. Eight H2 headings (Create an entry ... Who can do what), each with a hairline rule under it, 20 px bold, 22 px space above. Text column is 680 px wide (x 84-764), left aligned, empty right half. Body 14-15 px, line height 22.
- Bullet list under "Who can do what": three bullets with small dots at x 99, text at x 107, wrapped line indented to the text (x 107). The list sits tight under the lead paragraph (about 0 px gap) while paragraphs have 6-10 px gaps. NOTE 2.
- Links: "Account register" and "Moving around Books" show as italic, underlined, black text, no link colour. They are the same colour as body text. NOTE 3.
- Sidebar of the package is not shown on the help route (rail only), as for core topics.

BLOCKING: none.

NOTE items:
1. Phone menu sheet hangs from the top edge for rows near the top of the list (core default `sheetSide` = nearest edge). The Books New menu and the Reverse sheet use the bottom edge, and a top sheet is hard to reach with a thumb. Minimal fix (optional): pass `sheetSide="bottom"` to `Menu` in `EntryRowMenu.tsx`. Needs a user decision only if the nearest-edge behaviour is a deliberate core pattern for row menus; the plan text does not require either.
2. Help list has no top margin under its lead paragraph. This is core `MarkdownRenderer`, not Books; no Books change. Out of scope.
3. Help links render italic and black (same style as body text, underlined). Core `MarkdownRenderer` behaviour for `help://` links; no Books change. Out of scope; flag for a core ticket if wanted.
4. The reference list has a "This fiscal year" chip; the built list has a select with the same label. Carried from earlier checkpoints.
