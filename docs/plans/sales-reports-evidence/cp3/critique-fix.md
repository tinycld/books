# Gate 2 re-critique after the fix: sales-reports, checkpoint 3

Scope: the list headers of the Delivers line (Customers list Reports menu, Products and services list Sales report button), captured again after the `RecordListFrame` header fix. 16 built shots read (8 names, light and dark). No reference (D9): each shot judged by itself. The report shots of the first critique were not captured again and are not judged here.

## State check

| Shot (light and dark) | State shown | Result |
|---|---|---|
| products-header-1280 | Products and services list, Sales report button, wide | VALID |
| products-header-phone-390 | Same list at 390, cards | VALID |
| products-header-narrow-375 | Same list at 375, cards | VALID |
| customers-header-1280 | Customers list, Reports menu closed, wide | VALID |
| customers-header-phone-390 | Same list at 390, menu closed | VALID |
| customers-header-narrow-375 | Same list at 375, menu closed | VALID |
| customers-reports-open-1280 | Reports menu open as a popover, two items | VALID |
| customers-reports-open-phone-390 | Reports menu open as a bottom sheet, two items | VALID |

0 INVALID.

## The first critique's BLOCKING finding

products-header-phone-390: FIXED. The title "Products and services" is whole on its own row. "Sales report" and "New product or service" are on one row below it, right-aligned, same height, no wrap and no overlap. The same holds at 375 (products-header-narrow-375). Light and dark agree.

## Findings

### products-header-1280-light / -dark
Nothing found. Title and the two buttons are on one row, as before the fix.

### products-header-phone-390-light / -dark
- products-header-phone-390-*: search box — the placeholder "Search products and services" is cut at the box edge with no ellipsis ("Search products and service") — NOTE. The box width is not a part of this checkpoint.
- products-header-phone-390-*: header — the action row adds about 44 px, so the search row starts lower than on the Customers list of the same frame (164 against 120) — NOTE. This is the result of the fix; the buttons do not fit beside this title.

### products-header-narrow-375-light / -dark
Nothing found other than the two NOTEs above (the placeholder is cut earlier, "Search products and servi"; counted once).

### customers-header-1280-light / -dark
Nothing found.

### customers-header-phone-390-light / -dark
Nothing found. Title, Reports and New customer stay on one row; the fix did not move them.

### customers-header-narrow-375-light / -dark
Nothing found. Title, Reports and New customer fit one row at 375 with a clear gap after the title.

### customers-reports-open-1280-light / -dark
- customers-reports-open-1280-*: menu items — the labels have an empty leading slot (about 36 px), so the text is not at the popover's left padding — NOTE (carried from the first critique, not changed).

### customers-reports-open-phone-390-light / -dark
- customers-reports-open-phone-390-*: sheet items — the labels are indented about 30 px more than the sheet title "Reports" — NOTE (carried from the first critique, not changed).

## Totals

0 INVALID, 0 BLOCKING, 4 NOTE.

## For gate 3

None visible.
