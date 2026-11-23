# Design critique, round 2: report-1099, checkpoint 2 (Report spec, figures and choices)

Scope: the two shots captured again after the manifest fix (`untracked`, `by-amount`), light and dark, each with its reference pair (built 1280 = reference 1540, D8). The other shots keep the verdict of `critique.md`. Opened boxes and payment rows (checkpoint 3) and phone rows (checkpoint 5) are not judged.

Result: 0 INVALID, 0 BLOCKING, 1 NOTE.

Both NOTEs of round 1 on these shots are closed:
- `untracked`: the shot height is now 1260; the full list, the Total row and "End of report" are in view.
- `by-amount`: the capture now sets Show = All 1099 vendors before Order = Largest reportable; the row order differs from the Name order.

## State check

| Shot | Light | Dark | Shows |
|---|---|---|---|
| untracked-1280 | valid | valid | Show = Not tracked for 1099 (chip and heading line "Vendors: Not tracked for 1099"); 8 vendors in name order, boxes closed, Total row, End of report |
| by-amount-1280 | valid | valid | Order = Largest reportable (chip); vendors by Reportable, largest first: Jamal Okafor 3,050.00, Old Town Print Shop 2,000.00, Greenline Landscaping 1,250.00, Willamette 0.00. The Name order is Greenline, Jamal, Old Town, Willamette, so the shot proves the order |

The `by-amount` capture uses Show = All 1099 vendors; the Gates line and the reference use the default Show. This is necessary: with the default Show the seeded book has two vendors whose two orders are equal. The chip and the heading line both say "All 1099 vendors". Not a finding.

## Findings

### untracked-1280 (light, dark)
- untracked-1280: first vendor row ("Cascade Fuel & Fleet") — a full-width divider line is below the first vendor row only; no other vendor or box row has one. The reference has the same line below its first row, and so do the other shots of this checkpoint, so this is core's report table, not this unit's. — NOTE

Nothing else found. Structure agrees with the reference: heading with business name, title, period, "Vendors: …", "Form: …", "1099 threshold: $2,000.00"; four chips and Add filter; vendor rows open, box rows closed and indented; "Not reported" box rows with Reportable 0.00; Excluded blank when zero on vendor, box rows; the inactive vendor row muted and legible in dark; heavy Total row with the currency sign; figures right-aligned under their headings; no figure cut; no sideways scroll.

Differences from the reference that are not findings: sort arrows in the column headings and an Export button (the real core view); more vendors and other figures (the seeded book); negative figures ("-150.00").

### by-amount-1280 (light, dark)
Nothing found (the first-row divider line is the same NOTE as above; counted once). The long Willamette label wraps to two lines with the figures centered on it, as in the reference. The muted inactive row is legible in light and dark. Blank Excluded cells on vendor and box rows with no excluded amount; the Total row holds $974.00.

## For gate 3

- untracked-1280: "Ironclad Equipment Rentals" has a vendor row and a "Not reported" box row with Reportable 0.00, Excluded blank, All payments 0.00 (its rows add up to zero). Make sure a vendor whose rows net to zero is meant to show (raised in round 1; still in the shot).
- untracked-1280: "Cascade Fuel & Fleet" has Reportable -150.00 under "MISC 1 · Rents" and no other row. Make sure this is a seeded credit share or refund and not a sign error.
- Heading, first line: "Test Organization" (raised in round 1). Spec §3 Heading: "The Books business name".
