# Design critique: audit-log, checkpoint 3 (History panel beside the report)

Result: 0 INVALID, 2 BLOCKING, 3 NOTE.

Superseded by `critique-fix-1.md` (0 BLOCKING): the BLOCKING was a capture problem. The pressed row moved out of view when the report took its tablet layout beside the panel; the capture now scrolls it back into view and checks its `aria-selected`.

The 2 BLOCKING findings are one problem in the light and the dark shot: the shots do not show the mark on the opened row. I cannot tell from the shots if the mark is missing or if the pressed row is below the visible rows.

## panel-1440-light.png

State check: VALID. The shot shows the record panel open beside the Audit Log. The panel is 480 px wide (x 960 to 1440). It has the record title, Open as full screen, and the close button. The report is 896 px wide and uses the tablet layout (Date changed, User, Event, Record type on line 1; Record on line 2). No sideways scroll is visible.

Findings:

- panel-1440-light: report rows, left of the panel — no row shows a selected mark. The panel shows "Studio lamp w1-179479…", but none of the 8 visible rows is a Studio lamp row, and none has the selected background. The reference shows the opened row at the top of the list with a tinted background. Either the mark is missing, or the pressed row is below the fold and the shot cannot prove the mark. Capture again with the pressed row in view. — BLOCKING (spec §3 Record history: "the opened row is marked selected"; checkpoint Delivers: "one at a time, the row marked"; reference `panel-1440-light.png` shows the marked row)
- panel-1440-light: report rows, tablet layout — line 1 and line 2 of a row are 36 px apart, and the next row starts 36 px below. There is no divider and no larger gap between rows, so the Record line does not clearly belong to the row above it. The reference has the same spacing, and core owns the layout. — NOTE
- panel-1440-light: table heading — "DATE CHANGED" starts at x 76, but "RECORD" on heading line 2 and all cells start at x 80. The 4 px offset is also in the reference and is core's. — NOTE
- panel-1440-light: panel, Changed card, Price row — the values show a currency symbol ("$900.00", "$1,250.00"). The spec example and the reference show an amount without a symbol ("1,250.00", "240.00"). This is content of checkpoint 2's `RecordHistory`, not of this checkpoint. — NOTE

Accepted differences from the reference (not findings):

- No Books sidebar. The built route is core's `/a/reports/<id>`; the reference was drawn on the Books scratch route. The spec gives 896 px for the report beside the panel, and the built shot matches it.
- A Sort chip shows in the toolbar. The wrapped headings have no sort controls, so core adds the chip.
- The panel title is cut with an ellipsis. The e2e name is long; the cut is clean and does not touch Open as full screen.
- The panel holds 2 events with empty space below. This is real data.

## panel-1440-dark.png

State check: VALID. Same state as the light shot.

Findings:

- panel-1440-dark: report rows, left of the panel — no row shows a selected mark, as in the light shot. The dark reference shows the opened row with a lighter background. — BLOCKING (spec §3 Record history: "the opened row is marked selected"; checkpoint Delivers: "one at a time, the row marked"; reference `panel-1440-dark.png` shows the marked row)
- The 3 NOTE findings of the light shot apply here too. They are not counted again.

Legibility: the muted text ("Added Studio lamp…", the date and user line, "Field / Before / After") is readable on the dark card. The card borders and the panel border are visible.

## report-1440-light.png

State check: VALID. The shot shows the populated report at 1440 with no panel, one line per row, sortable headings, no Sort chip.

Nothing found. The structure, the heading block ("Times in Central Time"), the column order and the chips agree with the reference. The missing Books sidebar is the accepted route difference named above.

## report-1440-dark.png

State check: VALID. Same state as the light shot.

Nothing found.

## For gate 3

- If the pressed row is in fact below the fold in the panel shots, check that a row press keeps the pressed row in view when the panel opens and the report changes to its tablet layout (row heights double).
