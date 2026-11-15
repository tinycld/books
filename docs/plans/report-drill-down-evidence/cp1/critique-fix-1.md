# Gate 2 critique, fix round 1 — report-drill-down, checkpoint 1

Scope: the Delivers line (Transaction Detail by Account on core's report screen, line links). The drill figures, the panel and the phone layout are later checkpoints and are not judged.

Differences from the reference that are by design and are not findings: no Books sidebar (shipping route `/a/reports/<id>`), back link "Reports" (opened without `from`), seeded data and figures, and the one-line row at 1280 and 1024 where the reference shows the wrapped row (brief D3: the reference row was 956 px inside the Books shell; the shipping row is 1216 px and 960 px, at or above `oneLine` 960px).

## screen-1280-light.png

State check: VALID. Populated: Period Jan 1 – Nov 30, 2026, Accounts Rent, one section "6100 Rent" with 5 lines, section total and report Total.

Checked against the spec: header (business, title, period in words); chips Period then Accounts; columns in the spec order with heading "Account / Date"; section label "<number> <full name>" with no count; "Total 6100 Rent" and "Total"; void pair shown and cancelling; "-Split-"; Date, No. and Amount whole; Description cut with an ellipsis only.

Findings:
- screen-1280-light: column headings row, left edge — the heading "ACCOUNT / DATE" starts about 4 px left of the "Total" labels and the document header text (x 76 against x 80) — NOTE

## screen-1280-dark.png

State check: VALID. Same state as the light shot.

Findings: nothing found. All text is legible; the chips, the borders and the total rule have sufficient contrast.

## screen-1024-light.png

State check: VALID. Populated, same data, loaded at 1024 (row 960 px, one-line layout).

Checked: Date, No. and Amount are whole; no column goes past the right edge; no sideways scroll is visible.

Findings:
- screen-1024-light: Description column — it is the narrowest text column (about 15 characters: "October rent, s…", "Register split p…", "Entries seed au…"), while Split shows unused width after its longest value and Amount has a large blank area to its left. The spec permits the ellipsis ("Description, Split and Name narrow with an ellipsis first"), so this is not a rule break, but the column that holds the detail gets the least room at this width — NOTE
- screen-1024-light: Type column, row 3 — "Void reversal o…" is cut. The spec names only Date, No. and Amount as never cut, and gives Type a `12ch` fit, so no rule is broken; the cut hides the number that tells this row from a plain void reversal — NOTE
- screen-1024-light: first column heading — "ACCOUNT / DATE" wraps onto two lines ("ACCOUNT /" then "DATE") with its sort icon away from the text; the other headings stay on one line — NOTE

## screen-1024-dark.png

State check: VALID. Same state as the 1024 light shot.

Findings: the same three NOTEs as screen-1024-light (not counted again). Nothing specific to dark: text and rules are legible.

## screen-empty-1280-light.png

State check: VALID. Empty: Period Jan 3, 2026, Accounts Rent; "No rows for January 3, 2026" with the "Clear filters" button; no table, no Collapse all.

Checked against the spec ("empty 'No rows for <period>' … or 'Clear filters' when Accounts is set") and lesson 10 (the action is a core Button). Same arrangement as the reference.

Findings: nothing found.

## screen-empty-1280-dark.png

State check: VALID. Same state as the light shot.

Findings: nothing found.

## For gate 3

Nothing visible.

## Count

CRITIQUE: 0 INVALID, 0 BLOCKING, 4 NOTE
