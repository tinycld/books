# Design critique: audit-log, checkpoint 0 (core zone times and record panel)

Built shots: `docs/plans/audit-log-reference/` (re-captured on the core branch).
Earlier reference: `staging/p5-audit-log/cp/cp0-old-reference/` (stand-ins).
Scope: the Delivers line (T1 date-time cells and zone line, D5 record panel and row mark). 21 shots.

Verdict: 0 INVALID, 0 BLOCKING, 1 NOTE.

## Spec §3 checks (core)

| Check | Result | Seen in |
|---|---|---|
| Times in Central time, to the minute | Yes. Top row "Nov 14, 2026, 4:07 PM" (the spec's example); Nov 13 rows "6:02 PM", "2:15 PM", "2:11 PM" in `report-filtered-1280-*`. Each value is the same as the stand-in text of the earlier reference. Nov 12 rows are below the fold in all shots: not seen. | all populated shots, panel event headers |
| "Times in Central Time" once in the header | Yes. One line, below the period line, in the document header. Not repeated in the panel. Absent in `report-loading-1280-light` (header shows only the title, as the earlier reference). | all shots but loading |
| Panel 480 px beside the report at 1440 | Yes. The panel's left edge is at x=960; 1440 - 960 = 480. The report stays at the left. | `panel-1440-light`, `panel-1440-dark` |
| Opened row marked | Yes. The first row (Nov 14, 4:07 PM, Invoice 1001) has a tint over its two lines: pale teal in light, slate in dark. No other row is marked. The earlier reference had no mark. | `panel-1440-light`, `panel-1440-dark` |

## Per screenshot

State check first, then findings.

- `report-1440-light`: populated, valid. §3: Central times yes, zone line once yes. Nothing found. (Header block is 2 px shorter than the earlier reference; no loss.)
- `report-1440-dark`: populated, valid. §3: yes, yes. Nothing found.
- `report-1280-light`: populated, valid. §3: yes, yes. Nothing found.
- `report-1280-dark`: populated, valid. §3: yes, yes. Nothing found.
- `report-1024-light`: populated (tablet layout, Record on line 2), valid. §3: yes, yes. Nothing found. Same structure as the earlier reference.
- `report-1024-dark`: populated, valid. §3: yes, yes. Nothing found.
- `report-390-light`: populated (phone, two lines for each row), valid. §3: yes, yes. Nothing found. Date is not cut; no sideways scroll.
- `report-390-dark`: populated, valid. §3: yes, yes. Nothing found.
- `report-375-light`: populated, valid. §3: yes, yes. Nothing found.
- `report-375-dark`: populated, valid. §3: yes, yes. Nothing found.
- `report-empty-1280-light`: empty with chips set ("Clear filters"), valid. §3: zone line once yes; no times on screen.
  - `report-empty-1280-light`: document header — the line "Times in Central Time" shows although the screen has no time; the earlier reference had no zone line in the empty states — NOTE. (Spec T1 says the line shows "when a shown column is a date-time", and the column is still a shown column, so no rule is broken. The period is also compared in that zone, so the line is not wrong.) The same NOTE applies to the 5 shots below.
- `report-empty-1280-dark`: empty with chips, valid. Same NOTE.
- `report-empty-390-light`: empty with chips (phone), valid. Same NOTE. The empty text wraps to 2 lines, as the earlier reference.
- `report-empty-390-dark`: empty with chips, valid. Same NOTE.
- `report-empty-month-1280-light`: empty for October ("Show this fiscal year"), valid. Same NOTE.
- `report-empty-month-1280-dark`: empty for October, valid. Same NOTE.
- `report-filtered-1280-light`: populated with the User chip, valid. §3: Central times yes (Nov 14 and Nov 13 rows), zone line once yes. Nothing found. The long record name wraps to 2 lines.
- `report-filtered-1280-dark`: populated with the User chip, valid. §3: yes, yes. Nothing found.
- `report-loading-1280-light`: loading (spinner), valid. §3: no times and no zone line on screen (not applicable). Nothing found. Same as the earlier reference.
- `panel-1440-light`: record panel open beside the report, valid. §3: Central times yes (rows and panel event headers agree), zone line once yes, panel 480 px yes, opened row marked yes. Nothing found. Header: title "Invoice 1001", Open as full screen, close button.
- `panel-1440-dark`: record panel open, valid. §3: yes, yes, yes, yes. Nothing found. The mark is legible in dark.

## For gate 3

None visible.
