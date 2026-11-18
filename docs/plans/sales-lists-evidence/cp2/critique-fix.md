# Design critique after the fix: sales-lists, checkpoint 2 (loading and error states)

Scope: the 8 recaptured shots only (`loading-1280`, `loading-phone-390`, `error-1280`, `error-phone-390`, light and dark). The first critique (`critique.md`) stays valid for all other shots.

The fix: the search field now draws in the loading and error states. The reference draws no search field there; that difference is the intended fix (spec: "The 320 px column keeps the search field"; a refused filtered query must leave the search editable) and is not a finding.

Result: 0 INVALID, 0 BLOCKING, 2 NOTE.

## State check

| Shot | Light | Dark | Shows |
|---|---|---|---|
| loading-1280 | valid | valid | Header, tabs (Invoices selected), search field, core LoadingState spinner, no rows |
| loading-phone-390 | valid | valid | Same on phone |
| error-1280 | valid | valid | Header, tabs, search field, banner "Sales transactions could not load." + Retry, no rows |
| error-phone-390 | valid | valid | Same on phone |

## Findings

### loading-1280 (light, dark)
- nothing found. The search field is at the same place and size as in the populated shots (x 340, y 120, 360 px wide), so the screen does not move when the rows land. The spinner is centered in the area below the field.

### loading-phone-390 (light, dark)
- nothing found. The field takes the full row with the 16 px side margins of the header.

### error-1280 (light, dark)
- banner — it now sits 12 px below the search field, with the same left edge as the field and the title. The flush top edge that the first critique noted ("the banner touches the tab strip's bottom line") is gone. Nothing found in light.
- error-1280-dark: banner, Retry button — the button has no visible surface or border on the dark banner; it reads as plain text, not as a button. The reference dark shot draws it the same way, and it is the shared `ListBanner`. — NOTE

### error-phone-390 (light, dark)
- banner — message and Retry fit on one line, no wrap or truncation; 12 px gap below the search field. Nothing found in light.
- error-phone-390-dark: Retry button — same as error-1280-dark (see the note above; not counted again).

### All 8 shots
- search field — about 40 px tall (y 120 to 160). The brief's confirmed reference choices say "toolbar controls 44 px tall", but Do 5 says the field "keeps its own height". This is the first critique's note, now visible in these states too. — NOTE (carried from `critique.md`, not new)

## For gate 3
- none visible.
