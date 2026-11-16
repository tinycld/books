# Design critique: pay-bills, checkpoint 5 (Cash basis on the statements)

Reference: none (Gates line). Basis: spec §3.10 — "chip `report-param-method` after Period / As of" and "The document header prints "Accrual basis" or "Cash basis" (N1)."

Scope judged: the Method chip and the header line on Profit and Loss and Balance Sheet. The report table, its columns and its phone layout are from earlier units and are not judged.

## State check

| Shot | State shown | Result |
|---|---|---|
| pl-accrual-390-light | Profit and Loss, chip "Method: Accrual", header "Accrual basis" | valid |
| pl-accrual-390-dark | same, dark | valid |
| pl-accrual-1280-light | Profit and Loss, chip "Method: Accrual", header "Accrual basis" | valid |
| pl-accrual-1280-dark | same, dark | valid |
| pl-cash-390-light | Profit and Loss, chip "Method: Cash", header "Cash basis", figures differ from accrual (Income 12,003.70 against 25,362.40) | valid |
| pl-cash-1280-light | same at 1280 (Rent 2,438.37 against 3,158.37) | valid |
| bs-accrual-390-light | Balance Sheet, chip "Method: Accrual", header "Accrual basis" | valid |
| bs-accrual-1280-light | same at 1280 | valid |
| bs-cash-390-light | Balance Sheet, chip "Method: Cash", header "Cash basis" | valid |
| bs-cash-390-dark | same, dark | valid |
| bs-cash-1280-light | Balance Sheet, chip "Method: Cash", header "Cash basis", Accounts receivable 9,000.00 against 22,667.16 | valid |
| bs-cash-1280-dark | same, dark | valid |

0 INVALID.

## Findings

- pl-accrual-390-light: chip row, right edge — the chip "Method: Accrual" is cut at the screen edge ("Method: Accrua"); the default value of the new chip is not fully readable without a scroll. The row scrolls and has an edge fade, and "Method: Cash" fits (pl-cash-390-light). — NOTE
- pl-accrual-390-dark: chip row, right edge — the same cut of "Method: Accrual". — NOTE
- pl-accrual-1280-light: nothing found. Chip order Period · Method · Rows; "Accrual basis" is directly under the period line, in the same muted style.
- pl-accrual-1280-dark: nothing found. Chip and header line are legible.
- pl-cash-390-light: nothing found.
- pl-cash-1280-light: nothing found.
- bs-accrual-390-light: nothing found. Chip order As of · Method · Rows; "Accrual basis" under "As of November 16, 2026".
- bs-accrual-1280-light: nothing found.
- bs-cash-390-light: nothing found.
- bs-cash-390-dark: nothing found.
- bs-cash-1280-light: nothing found.
- bs-cash-1280-dark: nothing found.

## Seen, outside this checkpoint (not findings)

- Balance Sheet at 390: the column head "NOV 16, 2025" wraps to two lines while its neighbours stay on one, and "% CHANGE" is not on the phone layout.
- Balance Sheet at 1280: "10308.3%" has no thousands separator.

## For gate 3

Nothing visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE
