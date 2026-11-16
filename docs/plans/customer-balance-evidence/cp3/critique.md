# Gate 2 critique: customer-balance, checkpoint 3

Scope: the Delivers line (Customers list "Balance report" button; the report on a 375 and a 390 px phone). Figures and names are not compared (plan D9). The Customers list has no reference shot (plan D7).

## State check

| shot | state named | state shown | result |
|---|---|---|---|
| phone-family-375-light | report filtered to the St. Jude family, Gala row opened | Customer chip "All St. Jude Community…", family header, Gala row open with one transaction row, family total, Total | VALID |
| phone-family-375-dark | same | same | VALID |
| phone-family-390-light | same | same | VALID |
| phone-family-390-dark | same | same | VALID |
| customers-list-1280-light | Customers list header with the Balance report button | header shows "Balance report" (outline) and "New customer" | VALID |
| customers-list-1280-dark | same | same | VALID |
| customers-list-phone-390-light | same, phone | title, "Balance report", "New customer" on one line | VALID |
| customers-list-phone-390-dark | same, phone | same | VALID |

## Findings

### phone-family-375-light, phone-family-375-dark
Compared with `opened-375-*` and `populated-375-*`. The arrangement agrees: family header on two lines with no figure, Gala name on two lines with its Balance on the same band, transaction label on three lines with an ellipsis, Balance whole in every row, "Total <parent>" on three lines, heavy rule above Total, no sideways scroll. Spec "A long customer name wraps to at most three lines … Balance is never cut" holds.
- phone-family-375-*: chip row — the row is scrolled; the first chip ("As of: Today" in the reference) is out of view and "Rows: Non-zero" touches the left edge — NOTE
- phone-family-375-*: column header — sort arrows beside CUSTOMER and BALANCE; the reference (static model) has none. Core's view, no reference decision lost — NOTE

### phone-family-390-light, phone-family-390-dark
Compared with `opened-390-*` and `populated-390-*`. Same arrangement as the reference; all figures whole; total label on three lines; dark mode legible.
- phone-family-390-*: chip row — same scrolled chip row as at 375 (counted above)
- phone-family-390-*: column header — same sort arrows (counted above)

### customers-list-1280-light
Nothing found. The outline button is beside New customer, same height, right-aligned, and secondary to the primary button.

### customers-list-1280-dark
- customers-list-1280-dark: header, "Balance report" — the outline border is faint against the dark background; the label stays legible — NOTE

### customers-list-phone-390-light
Nothing found. Title and both buttons fit one line; no wrap, no truncation.

### customers-list-phone-390-dark
- same faint outline border as at 1280 dark (counted above)

## For gate 3
None visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 3 NOTE

## After the fix round

Scope: the six Customers list shots captured again after the header className change. The phone-family shots were not captured again and are not judged again. No reference shot (plan D7): each shot is judged by itself.

### State check

| shot | state named | state shown | result |
|---|---|---|---|
| customers-list-1280-light | Customers list header with the Balance report button | title, "Balance report" (outline) and "New customer" on one line, right-aligned | VALID |
| customers-list-1280-dark | same | same | VALID |
| customers-list-phone-390-light | same, phone | title and both buttons on one line | VALID |
| customers-list-phone-390-dark | same, phone | same | VALID |
| customers-list-panel-1440-light | a customer open beside the narrow names list; header buttons wrapped | Aspen Ridge Dental open at the right; names list at the left with "Balance report" above "New customer" | VALID |
| customers-list-panel-1440-dark | same | same | VALID |

### Findings

#### customers-list-1280-light
Nothing found. Both buttons have the same height, share the title's line, and keep an even gap. The primary button stays the stronger one.

#### customers-list-1280-dark
- customers-list-1280-dark: header, "Balance report" — the outline border is still faint against the dark background; the label is legible — NOTE (the same NOTE as in the first critique)

#### customers-list-phone-390-light
Nothing found. Title and both buttons fit one line; no wrap, no truncation; the buttons end on the search row's right edge.

#### customers-list-phone-390-dark
Same faint outline border (counted above). Nothing else found.

#### customers-list-panel-1440-light
The wrap agrees with plan D7 ("the header's button row wraps (`flex-row flex-wrap`), so the button also fits the narrow names layout beside a customer page"). Both buttons are whole, right-aligned on the list's right edge, with an even gap between them and above the search row. The title is not cut.
- customers-list-panel-1440-light: names list header — the two stacked buttons have different widths (their left edges do not align), the secondary button is above the primary one, and the header is one button row taller than the Vendors list header in the same layout; the title sits at the middle of the stack — NOTE

#### customers-list-panel-1440-dark
Same stacked header (counted above) and the same faint outline border (counted above). Nothing else found.

### For gate 3
None visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE
