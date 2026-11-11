# Gate 2 design critique — invoice-form, checkpoint 3 (form and draft saving)

Judged: the header band and its fills, the four-kind line table on core `TableField` (Item lines only are captured here), live totals and Balance due, Save draft / Cancel / Delete draft, every load state. Not judged: tabs (cp6), Post / Post & new (cp5), bundles, row menu, line kinds other than Item (cp4).

## State check

| Shot | Shows its state? |
|---|---|
| new-1280-light/dark, new-390-light/dark | yes — empty new form, one empty Item line |
| filled-1280-light/dark | yes — saved draft (title "Draft invoice", Draft badge, More button), 3 Item lines, totals |
| filled-phone-390-light/dark | yes — same draft as cards |
| edit-address-1280/390 light/dark | yes — address inputs and email input revealed |
| exempt-1280-light/dark | yes — Northwind Traders, taxable off, tax line $0.00 |
| no-tax-1280-light/dark | yes — Tax None, no tax line in totals |
| errors-1280-light/dark | yes — Customer is required, due-date error, Lines is required |
| errors-phone-390-light/dark | yes |
| no-access-1280/390 light/dark | yes |
| not-found-1280/390 light/dark | yes |
| loading-1280/390 light/dark | yes — spinner |
| error-1280/390 light/dark | yes — message and Retry |

0 INVALID.

## Findings

### new-1280-light / new-1280-dark
- Lines grid, Qty column — the core `NumberInput` stepper (−, value, +) is wider than its column: the value box and the "+" button are drawn under the Rate input. On the new form the Qty value "1" is not visible at all (only "−" shows, then the Rate box, with the "+" circle's right edge peeking out at x≈943). — BLOCKING (spec §3.3: "Wide (form ≥ 640 px): a grid with column headers Product or service · Description · Qty · Rate · Amount · Tax · (menu)"; memory p1-chart-of-accounts: "a column must never collapse to blank (minWidth + ellipsis)")
- Lines grid, Product and Description columns — Product is ~140 px and truncates its own placeholder ("Choose a pr…"); Description is ~140 px. The reference gives Product ~200 px (full product names) and makes Description the widest column; the built grid gives that width to the Qty/Rate region instead. — BLOCKING (reference `new-1280`, `filled-1280`: Description is the widest column and product names read in full; spec §3.3: "Description cell grows to 3 lines" — at 140 px three lines hold about six words)
- Lines grid header row — "Amount" header sits at x≈955 while the amount values are right-aligned at x≈1077; the "$0.00" touches the Tax toggle with no gap. — NOTE
- Title row — no "Draft" badge on the new form; the reference shows one and the spec lists the badge in the header without exception. — BLOCKING (spec §3.2: "Header right: title ("New invoice", …), status badge (Draft / Posted / Void)"; reference `new-1280`, `new-390` show "Draft")
- Above the grid — "Lines *" label with a required asterisk; the reference starts the table at its column headers. Engine chrome that duplicates what the headers say. — NOTE
- Header band — Tax (half width) wraps alone onto its own row under the three quarter fields, leaving the right half of the band empty, and the band is ~420 px tall for an empty form. Follows the host layout the plan names (terms/date/due_date quarter, tax_rate half), so not a rule break; the reference grouped Terms, Tax and the dates in a right column. — NOTE
- Header band, Email — "Email" label with nothing under it on a new form (text-only until Edit address, none when empty). A bare label reads as a broken field; the Bill to row at least has the "Edit address" link. — NOTE
- Top right — "BALANCE DUE" in uppercase; spec and reference write "Balance due". — NOTE

### new-390-light / new-390-dark
- Header band, Invoice date — the field's calendar button is pushed past the band and the viewport: a sliver of it is visible at the right screen edge (x≈388, y≈418) outside the band's border. — BLOCKING (lesson 32: "a column cut off at the right edge is a defect")
- Header band, Due date — the calendar button floats ~40 px to the right of its input (input ends x≈186, icon at x≈228) instead of sitting inside the input as it does at 1280. Same cause as above (the DateField's addon is laid out against the cell, not the input). — BLOCKING (same basis; the 1280 shots show the intended control)
- Line card, Tax toggle — the card ends with a bare toggle (partly visible at the bottom of the card at y≈1580 in edit-address-390) with no label; every other field in the card has one. — BLOCKING (spec §3.3: "Phone: each line is a card (kind label, fields stacked …)"; reference `filled-phone`: "Taxable" label beside the toggle)
- Line card, kind label — "Item" only; the reference numbered it "1 · ITEM". — NOTE
- Title row — no Draft badge (same as 1280). — BLOCKING (same basis)

### filled-1280-light / filled-1280-dark
- Lines grid, Qty — row 1's "2" is fully hidden behind the Rate input; row 3's "12" shows as a clipped "1" at x≈785. The amounts ($378.00, $105.00) prove the values are stored; the grid just cannot show them. — BLOCKING (same basis as new-1280)
- Lines grid, Product / Description — "Wireless ac…", "Initial consul…", "Cat6 patch …"; row 1's description wraps to four lines in the 140 px cell and the fourth ("installed and…") is cut at the bottom edge. — BLOCKING (same basis as new-1280)
- Lines grid header — Amount header misaligned with values; amount touches the toggle. — NOTE
- Everything else reads well: band fills (Bill to lines, Edit address / Edit customer, email text, Net 30, due date +30, Denver combined), Draft badge, Balance due figure, totals block with the tax line "Denver combined (8.71%)", Total `border-t` + semibold, Cancel / Save draft / More bar. Dark mode is legible throughout.

### filled-phone-390-light / filled-phone-390-dark
- Header band, Invoice date / Due date — calendar buttons as in new-390 (one off-viewport, one detached). — BLOCKING (same basis)
- Line cards, Tax toggle — unlabeled toggle at the bottom of each card. — BLOCKING (same basis)
- Line cards — kind label "Item" without the line number. — NOTE
- Page order — totals come after Message and Memo; the reference placed them right under "Add line", before Message, so the subtotal and tax sit next to the lines they sum. Balance due at the top softens this. — NOTE
- Cards themselves are good: Qty stepper, Rate, right-aligned Amount, row menu top right, Description grows.

### edit-address-1280-light / edit-address-1280-dark
- Header band — address inputs span the full 1245 px band; "Suite 300", "United States" in inputs this wide look oversized. Follows the full-width `bill_to` layout, so no rule; the reference kept them in a ~425 px column. — NOTE
- Lines grid — Qty hidden, Product/Description narrow (same as new-1280). — BLOCKING (same basis)
- Title — no Draft badge. — BLOCKING (same basis)
- Email input, "Edit customer" link under the address, "Edit address" link gone while editing: correct.

### edit-address-390-light / edit-address-390-dark
- Date calendar buttons, unlabeled Tax toggle (visible at the card bottom, y≈1580), no Draft badge — as new-390. — BLOCKING (same bases)
- Address inputs stacked one per row: fine on a phone.

### exempt-1280-light / exempt-1280-dark
- Lines grid, Description — after the product pick the cell is scrolled to its last line: the first line ("ceiling-mount") is cut at the top of the box. Same root cause (140 px column makes the text four lines in a three-line cell). — BLOCKING (same basis as new-1280 Description)
- Lines grid, Qty — value hidden. — BLOCKING (same basis)
- Title — no Draft badge. — BLOCKING (same basis)
- Taxable off, tax line "Denver combined (8.71%) $0.00", Balance due $189.00: matches the reference's exempt decision.

### no-tax-1280-light / no-tax-1280-dark
- Same grid findings as exempt (Description scrolled and clipped, Qty hidden), no Draft badge. — BLOCKING (same bases)
- Totals with no tax line, Tax "None": correct.

### errors-1280-light / errors-1280-dark
- Top right — Balance due reads "$0.00" while the form is invalid; the reference errors shot shows "—". The spec says "—" while invalid, but the plan defines `balanceDueText` as "—" only when totals are null, and with no lines the totals are computable, so the texts can be read both ways. — NOTE (spec §3.2: '"—" while invalid'; plan: '"—" when null')
- No Draft badge. — BLOCKING (same basis)
- Error placement is right: "Customer is required" under Customer, "The due date cannot be before the invoice date" under Due date (wraps to two lines inside the quarter column, readable), "Lines is required" under the Add buttons with "No rows yet." in the table. Red text is legible in dark mode.

### errors-phone-390-light / errors-phone-390-dark
- Header band, Invoice date — calendar button clipped at the right viewport edge (sliver at x≈388, y≈440); Due date's button detached. — BLOCKING (same basis as new-390)
- No Draft badge. — BLOCKING (same basis)
- Errors under their fields; totals block right-aligned. Fine.

### no-access-1280 / no-access-390 (light, dark)
nothing found (matches the reference: back link, plain sentence).

### not-found-1280 / not-found-390 (light, dark)
nothing found.

### loading-1280 / loading-390 (light, dark)
nothing found (centered spinner; the reference shows the same).

### error-1280 / error-390 (light, dark)
nothing found (message, Retry; a back link above, which the reference lacks — an addition, not a loss).

## Summary of distinct findings

BLOCKING (5):
1. Wide grid Qty stepper overflows under the Rate input; the quantity is unreadable (new, filled, edit-address, exempt, no-tax at 1280).
2. Wide grid Product and Description columns ~140 px: product names truncated, descriptions wrap past three lines and clip (top or bottom); the reference made Description the widest column.
3. Phone band DateFields: Invoice date's calendar button clipped off the viewport, Due date's detached from its input (all 390 form shots).
4. Phone line card: Tax toggle has no label (all 390 form shots with a card).
5. New form has no Draft badge (new, edit-address, exempt, no-tax, errors at both widths).

NOTE (9): Tax alone on its own band row / tall band; "Lines *" label; "BALANCE DUE" uppercase; Amount header misaligned and amount touching the toggle; card kind label without the line number; phone totals after Memo; bare "Email" label on a new form; errors Balance due "$0.00" vs "—"; full-width address inputs at 1280.

## For gate 3

- Nothing behavioral seen. The Qty values are stored (amounts are right); only the drawing is broken.
