# Gate 2 critique: sales-reports checkpoint 2 (Sales by Product/Service)

Built shots: `product-{populated,opened,by-sales,filtered,picker,empty}-1280-{light,dark}.png`, compared with the same names in `docs/plans/sales-reports-reference/`. Names and figures differ by design (D11).

Result: 0 INVALID, 0 BLOCKING, 1 NOTE.

## State check

| Shot | Light | Dark | What it shows |
|---|---|---|---|
| product-populated | valid | valid | Flat product list, Period This fiscal year to date, Order Name, Total row |
| product-opened | valid | valid | "Wireless access point" open into 5 sale lines (invoices, a sales receipt, a credit memo) |
| product-by-sales | valid | valid | Order chip "Largest sales", rows in Amount order, largest first, Discount last |
| product-filtered | valid | valid | Product chip "All Service items", heading line "Product: All Service items", service rows only |
| product-picker | valid | valid | Product picker open: Search, group NON-INVENTORY with the "All Non-inventory items" pick, options, Apply |
| product-empty | valid | valid | Period Jan 1 – Dec 31, 2020, "No rows for January 1 – December 31, 2020", "Show this fiscal year" |

## Findings

- product-populated-1280-light / dark: nothing blocking. The reference arrangement is kept: five columns in the reference order, figures right-aligned, the inactive row muted with " (inactive)", Discount with blank Quantity and Avg price, the Total with a heavy rule, blank Quantity and Avg price, and "100.00%". % of sales has 2 places on every row. The long product name fits on one line and is not cut.
- product-populated-1280-light / dark (and every shot with a table): column header row — Product/Service, Quantity, Amount and Avg price have a sort icon; % of sales has none, so the header row looks uneven. The reference has no sort icons (static model). This is core's view on a live report — NOTE.
- product-opened-1280-light / dark: nothing found. Sale lines are indented under the open product, in regular weight, with Quantity, Amount and Avg price, and a blank % of sales; the credit memo line is below zero; the chevron points down; the button reads "Collapse all".
- product-by-sales-1280-light / dark: nothing found.
- product-filtered-1280-light / dark: nothing found. The Product chip has its clear control, and the heading has the "Product: …" line, as in the reference.
- product-picker-1280-light / dark: nothing found. Same structure as the reference (search field, group label with the whole-group pick, tick boxes, a long option cut with an ellipsis, Apply). The popover covers part of the table in the same way as the reference.
- product-empty-1280-light / dark: nothing found. Same structure as the reference; the action is a core Button and is legible in light and dark.

Not findings (real components, not the static model): the Export button is present in the built toolbar; the Books sidebar is collapsed in the built shots; the built shots differ in height from the reference.

Evidence remark (not a finding): the built `opened` shot has no sale line with no customer (a label that ends after the number), which the reference shows. The seeded product that was opened has no such line; `TestSalesByProductOpened` pins that label.

## For gate 3

Nothing visible.
