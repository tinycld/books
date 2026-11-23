# Gate 2 design critique: report-1099 checkpoint 0 (core)

Reference: none (core's own states on the stub report). 18 screenshots read (9 shots, light and dark). Capture log: `cp0-capture-1.log`, 10 passed.

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

## State check

| Shot | Light | Dark | Shows |
|---|---|---|---|
| cp0-header-1280 | valid | valid | Populated report, 3 capture rows, header line "Stub floor: $1,234.56" |
| cp0-header-1024 | valid | valid | Same |
| cp0-header-768 | valid | valid | Same |
| cp0-header-390 | valid | valid | Same, phone toolbar (Customize + More) |
| cp0-header-375 | valid | valid | Same |
| cp0-period-picker-1280 | valid | valid | Period popover open, This calendar year selected, Last calendar year listed |
| cp0-period-picker-390 | valid | valid | Period sheet open, same presets |
| cp0-empty-1024 | valid | valid | Empty state for January 1 – January 31, 1903, action "Show this calendar year" |
| cp0-empty-390 | valid | valid | Same |

## Findings per screenshot

### cp0-header-1280-light / -dark
- Checked: the line "Stub floor: $1,234.56" is directly under the param line "Accrual basis", with the same type size, color, left edge and line spacing as the period and param lines. The amount shows its currency. No sideways scroll (marker fit=1216, window=1280).
- cp0-header-1280: Total row, Amount column — the Total row shows no figure, so the heaviest line of the table is empty — NOTE (stub report data; this checkpoint does not deliver the total).

### cp0-header-1024-light / -dark
- Nothing found. Header line as at 1280 (fit=960).

### cp0-header-768-light / -dark
- Nothing found. Header line as at 1280 (fit=704). The toolbar buttons stay on one line with the title.

### cp0-header-390-light / -dark
- Nothing found. The header line is on one line at the left edge of the other header lines. The three columns fit (fit=390). The Basis chip ends close to the right edge but is not cut.

### cp0-header-375-light / -dark
- cp0-header-375: toolbar title — "Stub calendar ye…" is cut with an ellipsis beside Customize (marker: CUT "Stub calendar year") — NOTE (core toolbar title behavior that this checkpoint does not change; the document header below shows the full title).
- Header line and table: nothing found (fit=375, no sideways scroll).

### cp0-period-picker-1280-light / -dark
- Checked: "This calendar year" is directly after "This fiscal year", and "Last calendar year" is directly after "Last fiscal year" (plan D3). The selected chip is legible in light and dark. From and To show 2026-01-01 and 2026-12-31.
- cp0-period-picker-1280: preset chips — the calendar-year chips make two more wrapped rows, and "This fiscal year to date" is now apart from "This fiscal year" (the calendar chip is between them) — NOTE (order is the plan's decision D3).

### cp0-period-picker-390-light / -dark
- Nothing found. The sheet shows all presets, From and To, with no cut chip. Dark sheet is legible.

### cp0-empty-1024-light / -dark
- Nothing found. The document header keeps its lines ("Accrual basis", "Stub floor: $1,234.56"). The text "No rows for January 1 – January 31, 1903" and the button "Show this calendar year" are centered and legible in light and dark.

### cp0-empty-390-light / -dark
- Nothing found. The empty text is on one line and the action fits.

## Not shown by the shots

- "Wraps as the param lines do": the line "Stub floor: $1,234.56" is short and does not wrap at 375. No shot shows a wrapped header line, so the wrap is not proved by appearance. The line uses the same visual style as the param lines at each width.

## For gate 3

- None.
