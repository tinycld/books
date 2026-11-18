# Gate 2 critique: sales-reports checkpoint 1 (Sales by Customer, 1280)

Compared: 10 built shots (`customer-{populated,opened,by-sales,filtered,empty}-1280-{light,dark}.png`) with the 10 matching reference shots. Names and figures are not compared (D11).

Differences that are not findings: the built shots are core's report route as the seeded user (no Books sidebar, an Export button, sort icons in the column headers); the reference is the static scratch route.

## State check

| Shot | Light | Dark | Shows |
|---|---|---|---|
| customer-populated | VALID | VALID | Period This fiscal year to date, Order Name, plain rows, two open families with totals, a muted inactive row, No customer last, Total |
| customer-opened | VALID | VALID | Harborview Kitchen (a family's customer) opened into one sale line |
| customer-by-sales | VALID | VALID | Order chip "Largest sales"; depth-0 rows in descending Sales order, parent's own row first in each family, No customer last |
| customer-filtered | VALID | VALID | Customer chip and heading line "Customer: All Harborview Hospitality Group sub-customers"; only the family shows; no No customer row |
| customer-empty | VALID | VALID | Period Jan 1 – Dec 31, 2020; core's empty text and the "Show this fiscal year" button; no rows, no Collapse all |

## Findings

### customer-populated-1280-light / -dark
Arrangement agrees with the reference: plain customer at depth 0 with no header or total; family header with blank figures while open, the parent's own row first, "Total <parent>" with the family's Sales and share; muted "Old Mill Bakery (inactive)" (label and figures); No customer last; Total under a heavy rule with "100.00%"; every share at 2 places (the shares add up to 100.00). Legible in light and dark.
- customer-populated (both), row 2 — the row "Audit access customer w1-1794937763138-1" is data of another e2e spec on the shared database; it is not a seeded customer and makes the evidence shot look unclean — NOTE (also visible in customer-opened and customer-by-sales).

### customer-opened-1280-light / -dark
Sale line label `2026-10-27 · Invoice 1012 · Bookkeeping catch-up (per month)`, regular weight, amount under Sales, blank % of sales, as the reference decided.
- customer-opened (both), opened rows — the shot holds one sale line only. The reference `opened` also shows a discount row below zero, a credit memo row below zero, and a label that wraps to two lines; the built shot gives no evidence of these three arrangements — NOTE (the brief asks for "one family's customer opened"; the Go and e2e tests pin the negative rows).

### customer-by-sales-1280-light / -dark
Order agrees with D6 and the reference. Muted row and No customer row are correct.
- customer-by-sales and customer-filtered (all four), first row — when the first row is an open family header it has a rule below it; the second family header in the same shot has none. The reference shows the same (core's view), so it is not a loss; it reads as an inconsistency between two headers of one table — NOTE.

### customer-filtered-1280-light / -dark
Nothing found beyond the note above. Chip order (Period, Customer, Order) and the heading line agree with the reference; the Order chip is fully visible (in the reference it is cut at the right edge).

### customer-empty-1280-light / -dark
Nothing found. Text and action agree with the reference; the action is a core Button and is legible in light mode.

## For gate 3
None visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 3 NOTE
