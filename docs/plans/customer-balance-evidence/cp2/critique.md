# Gate 2 critique: customer-balance, checkpoint 2 (Opened customers, filter and order)

Verdict: `CRITIQUE: 0 INVALID, 1 BLOCKING, 7 NOTE` (distinct findings; the BLOCKING one shows in all four `picker` shots).

Read: 16 built shots, capture.json, the spec, the lessons, memories-design.md, and 10 reference shots (the eight light ones, plus `opened-1280-dark` and `picker-390-dark`). The other six dark reference shots were not opened; the built dark shots were judged on their own.

Not findings (by the brief): names and figures (D9); no Customer picks in the document header (checkpoint 4); no Share button and no Books sidebar (core's view at `/a/reports/<id>` as the seeded user, D4).

## State check

| shot | shows its state? |
|---|---|
| opened-390-light / dark | Yes. "Harborview Kitchen" (1 line) and "No customer" (9 lines) are open. |
| opened-1280-light / dark | Yes. Same two rows open. |
| by-balance-390-light / dark | Yes. Chip reads "Order: Larges…" (cut by the chip strip); rows are largest first. |
| by-balance-1280-light / dark | Yes. Chip "Order: Largest balance". |
| filtered-390-light / dark | Yes. Chip "Customer: Aspen Ridge Dental, All Harborview Ho…"; rows are Aspen Ridge Dental, the Harborview header, Harborview Kitchen, the family total, Total. |
| filtered-1280-light / dark | Yes. Full chip text; same rows. |
| picker-390-light / dark | Yes (sheet, no picks). But see NOTE P2: no parent group is in view. |
| picker-1280-light / dark | Yes (popover under Add filter, no picks). Same NOTE P2. |

## Findings

### picker-390-light, picker-390-dark, picker-1280-light, picker-1280-dark

- **P1** — picker: top of the option list — the customers that have no parent are under a group header "(NONE)" with a whole-group pill "All (none) sub-customers". These customers are not sub-customers and have no parent name; the pill offers a pick with a label that has no meaning (and the chip would then read "Customer: All (none) sub-customers"). — **BLOCKING** (spec §3 Params, Customer: "sub-customers listed under their parent's name with a whole-group pick "All <parent> sub-customers""; the reference `picker-*` shows group headers and pills only for named parents). The blank group is probably drawn by core's picker; if so, this is a core gap to report (plan "Core gap rule"), not something to hide in Books.
- **P2** — picker: whole list — the shot shows only the "(none)" group. No parent group ("All Harborview Hospitality Group sub-customers") is in view, so the look of a real group header and its pill is not evidenced at either width. In the reference the pill squeezes the header to "MARISOL AL…", "NORT…", and to nothing for Harborview; the build cannot be compared. Capture again with the search filled ("Harborview") or the list scrolled. — NOTE
- **P3** — picker-1280: option "Audit access customer w1-179486544260…" is cut with an ellipsis in the popover while the 390 sheet shows it whole. Test data, long name; the popover has a fixed width. — NOTE

### opened-1280-light, opened-1280-dark

- **O1** — first line under "No customer" ("2024-08-15 · Journal entry JE-16 · Prior-year consulting") is underlined; no other line is. Probably the pointer's hover (or focus) state from the capture. Confirm that it is not a permanent style of the first line. — NOTE
- **O2** — lines "2026-11-16 · Void reversal of JE-10 JE-10 · Void of JE-10" (and JE-14): the entry number shows two times in sequence, and three times in the label. The label follows the spec's formula (`<date> · <type> <number> · <description>`), so no rule is broken, but it reads as an error. — NOTE
- Other: nothing found. The opened rows, their indent, the right-aligned signed figures, the muted inactive row, the family header and total, and the heavy Total line agree with the reference in light and dark.

### opened-390-light, opened-390-dark

- **O2** applies (the void reversal labels wrap to "…Void reversal of JE-10 / JE-10 · Void of JE-10").
- **O3** — St. Jude family and the open "No customer" block: rows of two and three lines stack with no space between them, and the separator above "Total Harborview Hospitality Group" touches the last line of the Kitchen detail row. Row ends are hard to see. The reference has the same density (core's phone row), so no decision is lost. — NOTE
- Other: nothing found. Labels wrap to at most three lines, Balance is never cut.

### by-balance-1280-light, by-balance-1280-dark

- **B1** — first row (the open "St. Jude…" family header) has a separator below it; the "Harborview Hospitality Group" header lower down has none. The reference has the same line, so it is core's first-row border; it looks inconsistent. — NOTE
- Other: nothing found. Order is largest first, the parent's own row is first in each family, No customer is in balance order, Total is last.

### by-balance-390-light, by-balance-390-dark

- Nothing found. (The "Order: Larges…" chip is cut by the scrolling chip strip, as in the reference.)

### filtered-1280-light, filtered-1280-dark

- Nothing found. The chip names both picks and has its clear button; the family shows header, Harborview Kitchen and its total without the parent's own row; no "No customer" row.

### filtered-390-light, filtered-390-dark

- **F1** — chip strip: the Customer chip is wider than the screen ("Customer: Aspen Ridge Dental, All Harborview Ho…" runs off the right edge), so its start and its clear button are never in view together. The reference shows the same strip (unscrolled), so it is core's chip; a width limit with an ellipsis would read better on a phone. — NOTE
- Other: nothing found.

### All shots (header row)

- **H1** — column headers show sort arrows ("CUSTOMER ⇅", "⇅ BALANCE"); the reference headers have none. With the Order chip this gives two ways to order the report. Core's live view draws them; no rule names them. — NOTE

## For gate 3

- Picker: what the "All (none) sub-customers" pill selects, and what the chip shows after it (P1).
- Whether a press on a column header's sort arrows conflicts with the Order param (D5 order: parent's own row first, No customer place) (H1).
- Whether the underline on the first "No customer" line is hover only (O1).
- Whether a void reversal entry carries the original's number (the label shows "Void reversal of JE-10 JE-10"), or `lineEntryTypeLabel()` already holds the number and the label adds it again (O2).
