# Gate 2 critique: report-drill-down, checkpoint 1

Scope judged: the Transaction Detail by Account report on core's report screen (header, chips, sections, line rows, totals, empty state, fit at 1280 and 1024). Not judged: drilled figures, the `from` back link, the panel, phone (checkpoints 2 and 3).

Differences from the reference that are by design and are not findings:
- No Books sidebar: the shipping route `/a/reports/<id>` has none (plan D3).
- Back link reads "Reports" (Gates line: "the back link reads "Reports" here (opened without `from`)").
- Rows, figures, account and business name come from the e2e seed.
- One-line rows with sort arrows in the headings at 1280 and 1024, where the reference shows the two-line tablet layout. The reference table was about 956 px and 700 px wide inside the Books shell; the built table is 1216 px and 960 px, and D3 says the `oneLine` gate is measured again on the shipping route.

## State check

| Shot | Named state | Shows | Result |
|---|---|---|---|
| screen-1280-light.png | populated, 1280, light | one section "6100 Rent", 5 lines, section total, report Total | VALID |
| screen-1280-dark.png | populated, 1280, dark | same, dark | VALID |
| screen-1024-light.png | populated, 1024, light | same rows at 1024 | VALID |
| screen-1024-dark.png | populated, 1024, dark | same, dark | VALID |
| screen-empty-1280-light.png | empty, 1280, light | "No rows for November 1 – November 14, 2026" + Clear filters | VALID |
| screen-empty-1280-dark.png | empty, 1280, dark | same, dark | VALID |

## Findings

### screen-1280-light.png
Nothing found. Header (business, title, period in words), both chips, section heading "6100 Rent", columns in spec order, "Total 6100 Rent" and "Total" are present. Date, No. and Amount are whole. Amount heading and figures share the right edge. The one long description ends with an ellipsis.

### screen-1280-dark.png
Nothing found. Text, rules and chips are legible; same layout as light.

### screen-1024-light.png
- screen-1024-light: Type column, row "Oct 1, 2026 / Void reversal o…" — the Type label is cut while the Split column has about 90 px of unused width beside "Business Checking" and "Accounts payable" — NOTE. The spec sentence "Description, Split and Name narrow with an ellipsis first" reads against this, but the same spec fixes the fit (`type` `12ch`, `split` `20ch`), and the build follows those values, so I do not call it a broken rule. The driver can decide. The document number is still readable in the No. column.
- screen-1024-light: Description column — every description but two is cut to about 15 characters ("October rent, s…", "Register split p…", "Entries seed au…"), while Split and the gap before Amount hold spare width. The spec permits the ellipsis; the result is hard to read at the exact 960 px gate — NOTE.
- screen-1024-light: first column heading — "ACCOUNT / DATE" wraps onto two lines and its sort arrow sits far from the text, at the column's right edge; the other headings are on one line — NOTE.

### screen-1024-dark.png
Same three NOTEs as screen-1024-light (not counted again). No dark-only problem.

### screen-empty-1280-light.png
Nothing found. Matches the reference's structure: both chips, document header with the period in words, centered message, "Clear filters" as a core Button, no Collapse all.

### screen-empty-1280-dark.png
Nothing found.

## Totals

0 INVALID, 0 BLOCKING, 3 NOTE.

## For gate 3

- The document header's first line reads "Test Organization". Spec: "Header: the Books business name, the title, the period in words." Confirm that this text is the Books business name of the e2e book and not the organization name used as a fallback.
- The Gates line asks for a Custom period in the built URL (populated: Custom covering the seeded lines; empty: Custom of one day). The shots use "All dates" and "This month to date". The arrangement is the same, so it does not change this critique.
