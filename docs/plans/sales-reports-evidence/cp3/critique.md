# Gate 2 critique: sales-reports, checkpoint 3

Scope: the Delivers line of checkpoint 3 (list entry points, phone arrangements at 375 and 390). 28 built shots read (16 report shots, 12 list-header shots), 16 reference shots read. D11 applied: arrangement judged, not names and numbers.

## State check

| Shot (light and dark) | State shown | Result |
|---|---|---|
| customer-populated-375, -390 | Sales by Customer, rows folded, families open | VALID |
| customer-opened-375, -390 | Harborview Kitchen opened, one sale line | VALID |
| product-populated-375, -390 | Sales by Product/Service, rows folded | VALID |
| product-opened-375, -390 | Wireless access point opened, five sale lines | VALID |
| customers-header-1280, customers-header-phone-390 | Customers list, Reports menu closed | VALID |
| customers-reports-open-1280 | Reports menu open as a popover, two items | VALID |
| customers-reports-open-phone-390 | Reports menu open as a bottom sheet, two items | VALID |
| products-header-1280, products-header-phone-390 | Products and services list with Sales report button | VALID |

0 INVALID.

## Findings

### customer-populated-375-light / -dark, customer-populated-390-light / -dark
Nothing found. Name on line 1, Sales and % of sales on line 2; family header, own row first, "Total <parent>" with figures; inactive row muted with " (inactive)"; 2 places on % of sales; St. Jude names wrap to 2 lines; no cut figure. Same arrangement as the reference.

### customer-opened-375-light / -dark, customer-opened-390-light / -dark
Nothing found. The sale line label wraps to 2 lines, its amount is whole, % of sales is blank on it. No customer row and the Total (100.00%) are whole. Same arrangement as the reference.

### product-populated-375-light / -dark, product-populated-390-light / -dark
- product-populated-*: Discount row and Total row — the Amount is on the label's line, not on line 2 with Quantity; the row is one line shorter than the others — NOTE. The approved reference draws the Discount row the same way (blank Quantity), so this is not a loss against the reference.

Other points clean: label line 1, Quantity and Amount line 2, % of sales and Avg price line 3; the long product name takes 3 lines at 375 and 2 at 390; inactive row muted; Total has blank Quantity and Avg price; no cut figure.

### product-opened-375-light / -dark, product-opened-390-light / -dark
Nothing found. Each sale line: label (1 or 2 lines), Quantity and Amount, then Avg price alone with a blank % of sales. The negative credit memo line is whole. Same arrangement as the reference.

### customers-header-1280-light / -dark
Nothing found. "Reports" outline button with chevron sits left of "New customer", same height, aligned with the title.

### customers-header-phone-390-light / -dark
Nothing found. Title, Reports and New customer fit one row with no overlap.

### customers-reports-open-1280-light / -dark
- customers-reports-open-1280-*: menu items — the two labels have an empty leading slot (about 36 px), so the text does not align with the popover's left padding — NOTE.

### customers-reports-open-phone-390-light / -dark
- customers-reports-open-phone-390-*: sheet items — the labels are indented about 30 px more than the sheet title "Reports" (empty icon slot) — NOTE.

### products-header-phone-390-light / -dark
- products-header-phone-390-*: header row — the two actions do not fit beside the title. They wrap to two rows ("Sales report" above, "New product or service" below), the title drops between them, and "New product or service" (starts at x 218) covers the end of the title "Products and services" (ends at x 257). The search row is pushed down 44 px against the Customers list. — BLOCKING (spec §2: "The Products and services list ... gets a **Sales report** button in its header"; critic rule: "text that wraps or truncates badly"; the Customers phone header of the same frame holds title and two actions on one row with no overlap). Counted once for light and dark.

### products-header-1280-light / -dark
Nothing found.

## Totals

0 INVALID, 1 BLOCKING, 3 NOTE.

## For gate 3

None visible.
