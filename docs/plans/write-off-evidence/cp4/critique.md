# Gate 2 critique: write-off, checkpoint 4 (Lists, customer page, help)

Judged against the Delivers line: Write off from the row menu on the Sales lists and the customer page, the Written off status and chip, the customer's Write-off transaction rows. Help is not in a screenshot. The row set differs from the reference fixture (e2e seed); that is not a finding.

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

## State check

| Shot | Named state | Shows | Verdict |
|---|---|---|---|
| list-390-light / -dark | Invoices tab, chip All, cards | Invoices tab, chip All, cards, chip "Written off" in the chip row | VALID |
| list-1280-light / -dark | Invoices tab, chip All, table | Invoices tab, chip All, table, 7 chips in the spec order | VALID |
| list-written-off-390-light | Chip Written off, cards | Chip Written off active, one card (1014 Delta Freight Partners), badge Written off | VALID |
| list-written-off-1280-light | Chip Written off, table | Chip Written off active, one row, Balance $0.00, badge Written off | VALID |
| customer-transactions-390-light / -dark | Delta Freight Partners, Transactions tab, cards | That customer, Transactions tab, chip All, three cards with the Write-off card | VALID |
| customer-transactions-1280-light / -dark | Same, table | That customer, Transactions tab, table, chip Write-offs after Refunds | VALID |
| dialog-390-light / -dark | Write off dialog as a Sheet | Sheet over the invoice read view, form body with default account | VALID |
| invoice-written-off-390-light / -dark | Written-off invoice read view | Badge Written off, Written off totals row, Write-offs section as a card | VALID |
| read-390-light / -dark | Write-off page, posted | Write-off 1001, Posted, stacked figure, band, Void and More | VALID |

## Findings

### list-390-light, list-390-dark
Nothing found. The reference's card structure is kept (number and customer, dates, total, badge under the total); the checkbox and the row menu are the real list's parts.

### list-1280-light, list-1280-dark
- list-1280-light, list-1280-dark: toolbar above the table — the filters take two rows at 1280 (search, 7 chips and All dates on the first; All customers and Batch actions on the second). The reference does not draw the toolbar, and the shots do not show if the seventh chip caused the wrap. — NOTE

The columns, the alignment and the status column agree with the reference. The table does not scroll sideways.

### list-written-off-390-light
Nothing found. The active chip is scrolled into view; the badge is muted as in the reference.

### list-written-off-1280-light
Nothing found. Balance $0.00, Total $215.50, muted "Written off" badge, as the reference decided.

### customer-transactions-390-light, customer-transactions-390-dark (no reference; judged against spec §3.6)
- customer-transactions-390-light, customer-transactions-390-dark: card "Invoice 1006", right edge — the row menu button is at the card's top, level with the title; on the Sales list cards (list-390) the same button is centred on the card's height. The plan asks for the top right, so this is consistent with the plan and not with the sibling list. — NOTE

The spec items are present: type label "Write-off 1001", "−$215.50", muted "Written off", the invoice row "Written off", Open $207.00. The totals of all cards keep one right edge (the menu column is reserved on each card). No sideways scroll of the page.

### customer-transactions-1280-light, customer-transactions-1280-dark (no reference; judged against spec §3.6)
- customer-transactions-1280-light, customer-transactions-1280-dark (also the 390 pair): row menu icon on "Invoice 1006" — the icon appears lighter than the row menu icon of the Sales list (list-1280), so the same action has two weights in two lists. — NOTE

The spec items are present: chip "Write-offs" after "Refunds", Type "Write-off", No. 1001, date, Total "−$215.50", Status "Written off" (muted), Due date "—". The menu shows only on the invoice with an open balance. The table does not scroll sideways; header and cells are aligned.

### dialog-390-light, dialog-390-dark
Nothing found. Same structure as the reference: summary line, figure, date, account, reason, notice with the sales tax sentence, Cancel and "Write off $205.46". The summary line wraps to two lines with the long customer name and stays legible.

### invoice-written-off-390-light, invoice-written-off-390-dark
Nothing found. Badge "Written off", the "Written off −$215.50" row before Balance due, the Write-offs section as a card with the number link, date, amount and Posted badge, as the reference. The lines card is the real component (plan: built from the spec text).

### read-390-light, read-390-dark
Nothing found. The figure is under the title, the band has Customer, Invoice, Write-off date, Written off to; Reason is left out because the seeded write-off has none (spec §3.5: "Reason (left out when empty)"). Void stays visible, the others are in More.

## Outside this checkpoint (not counted)
- dialog-390, invoice-written-off-390, read-390: the back link reads "Journal entries" on the invoice read view and on the write-off page. The capture opens each by URL, so there is no screen below; the link text belongs to checkpoint 3 and the invoice read view.

## For gate 3
Nothing visible.
