# Design critique — sales-tax-liability, checkpoint 3 (Rate rows open into documents)

Shots: `rate-open-{1280,390}-{light,dark}.png` against the reference shots of the same names. Figures differ from the reference by design (D7); the arrangement is judged. Notes already in the ledger's Design notes (Sales Stub tab, header inset, cut customer name at 390, ISO date, sort marks, cut Sort chip, 20 px offset between figure lines 2 and 3) are not repeated.

## State check

- rate-open-1280-light: VALID. "Colorado state" is open: six document rows, then "Total Colorado state".
- rate-open-1280-dark: VALID. Same.
- rate-open-390-light: VALID. "Colorado state" is open; document rows show below it.
- rate-open-390-dark: VALID. Same.

## Findings

### rate-open-1280-light / rate-open-1280-dark

Checked against the Delivers line and the reference:
- Label `<date> · <Invoice|Sales receipt> <number> · <customer>`: present; "2026-10-14 · Sales receipt 1003" ends after the number.
- Order: date, then number (10-06 1001, 10-06 1005, 10-14 1002, 10-14 1003, 10-20, 10-21).
- Each document row has four figures; "Total Colorado state" has four figures and they are the sums of the rows; agency totals and Total show Tax amount only.
- Document rows are regular weight, rate rows bold, subtotal under a rule: same hierarchy as the reference. Dark: all text legible.

- rate-open-1280-*: document rows, label column — the document label starts about 2 px left of the rate label above it (x 112 against 114), so the nesting shows by weight only, not by indent; the reference does the same (372 against 374) — NOTE

### rate-open-390-light / rate-open-390-dark

Checked: each rate row is the label, then Gross total · Non-taxable, then Taxable amount · Tax amount; each document row has the same three lines; no figure is cut; no sideways scroll shows in the table; "Total City and County of Denver" shows the tax alone. Same arrangement as the reference. Dark: all text legible.

Do 3 (three tap-height lines per row): a rate row is three 44 px lines (132 px). It is tall but each line is clear, the two figure pairs keep their columns down the page, and the reference decided this arrangement. No finding against it.

- rate-open-390-*: document rows under "Colorado state" — a document row is about 100 px (figure lines about 28 px apart), a rate row 132 px (lines 44 px apart), so the page has two line pitches; the reference does the same — NOTE
- rate-open-390-*: bottom of the shot — the shot ends in the third document row (its line 3 is half under the tab bar). "Total Colorado state" (four figures on two lines) and the sales receipt row with no customer are not in the shot, so their phone look is not judged at this gate; the reference has the same cut, and e2e 7 pins the subtotal row's lines — NOTE

## Summary

0 INVALID, 0 BLOCKING, 3 NOTE.

## For gate 3

Nothing seen.
