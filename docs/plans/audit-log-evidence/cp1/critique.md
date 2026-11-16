# Design critique: audit-log checkpoint 1 (Audit log view and report)

Scope: the Delivers line (the report, its columns, default sort, chips, phone and tablet layouts). Capture differences that are not findings: no Books sidebar (real route `/a/reports/<id>`), e2e data and business name, `filtered` = Event: Changed (the reference used User), `empty-month` chip text "Last month" (the reference used a custom range).

Result: 0 INVALID, 2 BLOCKING, 11 NOTE.

Superseded for report-375, report-390 and the new report-800 by `critique-fix-1.md` (after the fix round: 0 BLOCKING; the 375 rows hold two lines, the tablet layout has evidence).

## State check

| Shot (light and dark) | State shown | Verdict |
|---|---|---|
| report-1280 | populated, default chip "This month", 5 columns, one line per row | valid |
| report-1440 | populated, one line per row | valid |
| report-1024 | populated, one line per row (see NOTE: not the tablet layout) | valid |
| report-390 | populated, phone layout, 2 lines per row | valid |
| report-375 | populated, phone width, 3 lines per row (see BLOCKING) | valid |
| report-filtered-1280 | chip "Event: Changed", only Changed rows | valid |
| report-empty-1280 | chips User + Event, "No rows for …", Clear filters | valid |
| report-empty-390 | same, phone | valid |
| report-empty-month-1280 | "Last month", "No rows for October 1 – October 31, 2026", Show this fiscal year | valid |

## Findings

### report-375-light
- report-375-light: table heading and every row — the row is on 3 lines (Date changed + User; Event + Record type; Record), with a 3-line heading. The reference at 375 shows 2 lines (Date changed · Event; User · Record type · Record). The designed `mobile` layout is not applied; the row is core's automatic lines. The built 390 shot has the designed layout, so the cause is at 375 only, with real labels (probably a long unbroken word in Record, for example "1794785303992-1" or "240.00", that makes a track too wide for the 359 px row) — BLOCKING (spec §3: "**Phone (390) and the panel:** each row wraps to two lines: date changed · event; user · record type · record."; spec §5 display: "with one, the phone's second line fell back to core's automatic lines at 390 and 375"; lesson 32: "phone report tests run at 375 as well as 390"; reference `report-375-light.png`).
- report-375-light: chip row, right edge — a third control shows as a thin cut sliver after "Add filter"; the reference has none there — NOTE.

### report-375-dark
- report-375-dark: table heading and every row — same 3-line fallback as light — BLOCKING (same basis; reference `report-375-dark.png`).
- report-375-dark: chip row, right edge — same cut sliver — NOTE.

### report-390-light
- report-390-light: line 2, Record type track — real labels are cut: "Journal e…", "Journal li…", "Product …". The reference shows the type in full ("Invoice line"). "Journal entry" and "Journal line" are hard to tell apart, while Record beside it has spare lines. No rule names Record type as never cut, so no basis for BLOCKING. Recommendation: a wider type track (for example user 2 · type 3 · record 2) or let the type wrap — NOTE.
- report-390-light: chip row, right edge — a third chip with a sort icon is cut by the screen edge; the reference shows only "Date changed" and "Add filter" — NOTE.

### report-390-dark
- report-390-dark: Record type track — same cut labels — NOTE.
- report-390-dark: chip row, right edge — same cut chip — NOTE.

### report-1024-light, report-1024-dark
- report-1024-light: table — the shot shows the one-line desktop row, because the content is 960 px wide without the Books sidebar (`oneLine.minWidth` 760 px). The reference at 1024 shows the tablet layout (created · user · event · type on line 1, Record on line 2, headings without sort arrows). The built set thus has no evidence of the tablet layout that this checkpoint delivers. A capture at about 700–760 px content width is necessary to judge it — NOTE.
- report-1024-dark: same — NOTE.

### report-empty-390-light, report-empty-390-dark
- report-empty-390-light: chip row — the row is scrolled to its end: "Date changed" is off screen (a sliver at the left edge), "Add filter" is cut at the right. The reference shows the row from its start. Probably the capture (the chip was added last) — NOTE.
- report-empty-390-dark: same — NOTE.

### report-1280, report-1440, report-filtered-1280 (light and dark)
- report-1280-light (and 1440, filtered, both themes): Record column — account labels have no space after the colon ("3000:Owner's Equity credit 240.00", "6900:Old Petty Cash"); the spec example is "1010 Business Savings". The label is the audit label as logged (spec §10: no change to the labels), so it is not a defect of this checkpoint — NOTE.
- Other than that: nothing found. Header (business name, title, period, "Times in Central Time" once), column order, date text to the minute, and dark-mode legibility agree with the reference.

### report-empty-1280, report-empty-month-1280 (light and dark)
- nothing found. The empty text, "Clear filters" with a chip set, and "Show this fiscal year" without one agree with the spec and the reference; the action is a core Button (lesson 10).

## For gate 3
- report-filtered-1280: the rows of seeded records (Account "6900:Old Petty Cash", Tax rate, Tax agency) read User "System". The spec keeps "System" for "a change no person made (the automatic reversal sweep)". Make sure that only writes without an actor read "System".
- report-390 / report-375: identify the third control in the chip row (cut at the right edge) and make sure it is intended on the phone.
