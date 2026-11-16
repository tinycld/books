# Design critique: pay-bills checkpoint 6 (Sales Tax Liability on cash)

Reference: none (brief, Gates line). Basis: spec §3.10 ("gains the same Method param"; "chip `report-param-method` after Period / As of"; "The document header prints "Accrual basis" or "Cash basis" (N1)"). Compared with the cp5 shots `pl-cash-390-light.png` and `pl-accrual-1280-light.png` for the same core header.

Scope judged: the Method chip and the header line. The report table layout is from an earlier unit and is not judged.

## State check

| Shot | Shows its state | Evidence |
|---|---|---|
| stl-accrual-390-light | yes | chip "Method: Accrual", header line "Accrual basis" |
| stl-accrual-390-dark | yes | same, dark |
| stl-accrual-1280-light | yes | chip "Method: Accrual", header line "Accrual basis" |
| stl-accrual-1280-dark | yes | same, dark |
| stl-cash-390-light | yes | chip "Method: Cash", header line "Cash basis", figures differ from Accrual |
| stl-cash-390-dark | yes | same, dark |
| stl-cash-1280-light | yes | chip "Method: Cash", header line "Cash basis", total $23.09 against $181.30 on Accrual |
| stl-cash-1280-dark | yes | same, dark |

No shot is INVALID.

## Findings

- stl-accrual-1280-light: nothing found. The Method chip is directly after Period and before "Add filter". The line "Accrual basis" is under the period, in the same muted style, left-aligned with the title. Same as the cp5 Profit and Loss header.
- stl-accrual-1280-dark: nothing found. Chip and header line are legible.
- stl-cash-1280-light: nothing found.
- stl-cash-1280-dark: nothing found.
- stl-accrual-390-light, stl-accrual-390-dark, stl-cash-390-light, stl-cash-390-dark: chip row, right edge — the "Add filter" chip is cut by the screen edge ("+ Ad", "+ Add f") — NOTE. The Method chip is fully in view after Period. The cp5 phone shot cuts its second chip in the same way, so this is the core chip row's scroll behavior, with no fade or other scroll cue.

Other than this, the four 390 shots are clean: the header line is under the period, does not wrap, and is legible in light and dark.

## Not a finding (out of this checkpoint's Delivers)

- 390, table: the two figure lines of a row end at different x positions for the left column (line 1 at about 200 px, line 2 at about 220 px). The column header has the same offset, so it is the report's phone layout from p5-sales-tax-liability.

## For gate 3

Nothing visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 1 NOTE
