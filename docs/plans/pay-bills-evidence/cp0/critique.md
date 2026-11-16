# Gate 2 design critique: pay-bills, checkpoint 0 (core N1, report header line), after the fix round

Reference: none. Basis: packet N1 as quoted in the brief, "the view prints each under the period (`text-sm text-muted-foreground`, test id `report-header-param-<id>`)", and spec §3.10 as quoted in the brief, "The document header prints "Accrual basis" or "Cash basis" (N1)." The spec file itself was not read; only the brief's quotes were used.

The stub report now has a Period param. All six shots show the period line "January 1 – December 31, 2026" with the basis line directly under it.

## State check

| Shot | Named state | Shows | Result |
|---|---|---|---|
| report-accrual-390-light | Basis Accrual, 390, light | chips "Period: This fiscal year", "Basis: Accrual"; period line; "Accrual basis" | VALID |
| report-accrual-390-dark | Basis Accrual, 390, dark | same content, dark | VALID |
| report-accrual-1280-light | Basis Accrual, 1280, light | same content, wide | VALID |
| report-accrual-1280-dark | Basis Accrual, 1280, dark | same content, wide, dark | VALID |
| report-cash-390-light | Basis Cash, 390, light | chip "Basis: Cash"; period line; "Cash basis" | VALID |
| report-cash-1280-light | Basis Cash, 1280, light | chip "Basis: Cash"; period line; "Cash basis" | VALID |

## Findings

- report-accrual-390-light: nothing found. Order is company, title, period, basis line. The basis line is the last line of the document header, left-aligned with the lines above it, muted, the same size and tone as the period line, smaller than the title, one line, no wrap.
- report-accrual-390-dark: nothing found. The period line and the basis line are legible on the dark surface, with the same tone as "End of report".
- report-accrual-1280-light: nothing found. Same order, alignment and line spacing as at 390.
- report-accrual-1280-dark: nothing found.
- report-cash-390-light: nothing found. The line follows the chip ("Cash basis"). The header height does not change between Accrual and Cash.
- report-cash-1280-light: nothing found.

The earlier NOTE (no shot showed a period line, so the order and spacing were not in evidence) is closed: every shot now shows the period line with the basis line under it, at the same line spacing as title to period.

Not a finding (not delivered by this checkpoint): at 390 the toolbar title truncates to "Stub period state…"; the full title shows in the document header below it.

## For gate 3

None.

CRITIQUE: 0 INVALID, 0 BLOCKING, 0 NOTE
