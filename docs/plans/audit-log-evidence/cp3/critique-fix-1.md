# Design critique, fix round 1: audit-log, checkpoint 3 (History panel beside the report)

Result: 0 INVALID, 0 BLOCKING, 4 NOTE.

The 2 BLOCKING findings of `critique.md` (no mark on the opened row, light and dark) are closed: the pressed row is now in view and marked in the two panel shots.

## panel-1440-light.png

State check: VALID. The record panel is open beside the Audit Log. The panel is 480 px wide (x 960 to 1440) with the record title, Open as full screen and the close button. The report is 896 px wide and uses the tablet layout (Date changed, User, Event, Record type on line 1; Record on line 2). No sideways scroll is visible. The list is scrolled, so the pressed row is in view.

Closed finding:

- The opened row ("Studio lamp w1-1794795495356-1 (brass)", Changed) has a tinted background across its two lines (y 590 to 662). It is the only marked row, and it agrees with the panel title and the panel's newest event. This agrees with the reference decision (tinted opened row).

Findings:

- panel-1440-light: report rows, tablet layout — line 1 and line 2 of a row are 36 px apart, and the next row starts 36 px below. There is no divider and no larger gap between rows, so the Record line does not clearly belong to the row above it. Only the marked row shows where a row starts and ends. The reference has the same spacing, and core owns the layout. — NOTE
- panel-1440-light: table heading — "DATE CHANGED" starts at x 76, but "RECORD" on heading line 2 and all cells start at x 80. The 4 px offset is also in the reference and is core's. — NOTE
- panel-1440-light: panel, Changed card, Price row — the values show a currency symbol ("$900.00", "$1,250.00"). The spec example is without a symbol (§3: "an amount as money in the Books currency (\"1,250.00\")"), and the reference shows "240.00". This is content of checkpoint 2's `RecordHistory`, not of this checkpoint's Delivers line, so it is not BLOCKING here. — NOTE
- panel-1440-light: report rows, the Books settings row at y 828 — its Date changed cell is underlined. This is the hover underline (the pointer was left on that row during the capture). It makes a second row look special beside the marked row. Move the pointer off the table before the shot. — NOTE

Accepted differences from the reference (not findings):

- No Books sidebar. The built route is core's `/a/reports/<id>`; the reference was drawn on the Books scratch route. The spec gives 896 px for the report beside the panel, and the built shot agrees.
- A Sort chip shows in the toolbar. The wrapped headings have no sort controls, so core adds the chip.
- The panel title is cut with an ellipsis. The e2e name is long; the cut is clean and does not touch Open as full screen.
- The top row is cut by the fixed heading. This is a scrolled list, not a layout defect.
- The panel holds 2 events with empty space below. This is real data.

## panel-1440-dark.png

State check: VALID. Same state as the light shot.

Closed finding:

- The opened row has a lighter background across its two lines, as in the dark reference. It is the only marked row.

Findings:

- The 4 NOTE findings of the light shot apply here too. They are not counted again.

Legibility: the marked row's text stays readable on the lighter background. The muted text (the date and user line, "Field / Before / After", "Added Studio lamp…") is readable on the dark card. The card borders and the panel border are visible.

## report-1440-light.png

State check: VALID. The populated report at 1440 with no panel: one line per row, sortable headings, no Sort chip.

Nothing found. The heading block ("Times in Central Time"), the column order and the chips agree with the reference.

## report-1440-dark.png

State check: VALID. Same state as the light shot.

Nothing found.

## report-1024-light.png

State check: VALID. The populated report alone at 1024: one line per row, sortable headings, no Sort chip, no sideways scroll. All 5 columns are inside the view, and no Record value is cut.

Nothing found.

Accepted difference from the reference: the reference at 1024 shows the tablet layout (two lines), because the Books sidebar of the scratch route leaves the report about 700 px. The built report is alone and 960 px wide, and the spec decides one line for that width (§5 display: "960 px for the report alone at 1024 with overlay scrollbars … 920 sits between them").

## report-1024-dark.png

State check: VALID. Same state as the light shot.

Nothing found.

## For gate 3

Nothing.
