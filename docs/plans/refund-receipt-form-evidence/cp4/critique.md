# Gate 2 critique: refund-receipt-form, checkpoint 4

All 44 built shots were read (22 shots, light and dark), each against its reference of the same name.

Result: 0 INVALID, 2 BLOCKING, 3 NOTE.

## State check

Every built shot shows the state its name says. None is INVALID.

| Shot | Widths | Shows |
|---|---|---|
| from-sales-receipt, from-sales-receipt-phone | 1280, 390 | New refund form with the copied lines, the link row "Refund of sales receipt 1001" and "Remove link" |
| payout, payout-phone | 1280, 390 | Payout form: disabled Customer, link row, inline notice, no "Remove link" |
| payout-errors | 1280, 390 | Cap error in the link row and date error under Refund date |
| posted, posted-phone | 1280, 390 | Posted refund read view with the source link above the Payment row |
| payout-read | 1280, 390 | Posted payout read view with "Pays out credit memo 1002" |
| sales-receipt-read, sales-receipt-read-phone | 1280, 390 | Posted sales receipt with the "Refund receipts" section (grid wide, card on the phone) and Refund in the bar |
| sales-receipt-more-phone | 390 | More sheet with the row "Refund r" |
| credit-memo-read, credit-memo-read-phone | 1280, 390 | Posted credit memo with Refunded and Unapplied credit rows, the "Refunds" section, Refund credit in the bar |
| credit-memo-more-phone | 390 | More sheet with the row "Refund credit r" |
| cannot-refund-receipt | 1280, 390 | Notice "This sales receipt cannot be refunded" with the back link |
| cannot-refund-memo | 1280, 390 | Notice "This credit memo cannot be refunded" with the back link |
| link-error | 1280 | Server refusal under the link row |
| void-link | 1280 | Read view link "Refund of sales receipt 1006 (void)" |

The receipt and memo numbers (1001, 1002, 1006) differ from the reference (1004, 1001, 1002). That is seed data, not a finding.

## Findings

### payout-1280, payout-phone-390, payout-errors-1280, payout-errors-390 (light and dark)

- payout-*: link row, the text "Pays out credit memo 1002 · $410.92 unapplied" — the whole text, the unapplied figure included, is one underlined link in the link color. The reference draws only "Pays out credit memo 1001" as the link and "· $1,346.77 unapplied" as muted plain text beside it. The build loses the hierarchy between the link and the live figure, and the figure reads as part of the link target. — BLOCKING (reference decision in `payout-1280-light.png` / `payout-phone-390-light.png`: the link, then the muted text "· $… unapplied"; spec §3.3: "`DocumentSourceLink` plus the credit memo's live `balance`"). Note for the driver: the plan's `payoutLinkLabel` gives one string; the row can keep that text and still draw the figure part outside the link.
- payout-errors-*: link row, the cap error — the error draws under the notice box, so the notice separates the error from the link it is about. The reference draws the error directly under the link, above the notice. The plan puts `children` before the error, so this is the planned order. — NOTE
- payout-*, payout-errors-*, from-sales-receipt-*, link-error-*: link row and notice box, left edge — the link text and the notice box start 2 px to the left of the field labels and inputs (x = 357 against 359 at 1280), and the notice box is 2 px wider than the inputs on the right. The reference has the same offset. — NOTE
- The place of the link row above the date row is the plan decision. Not judged.
- The disabled Customer, the notice box and both error texts are legible in light and dark. The notice wraps cleanly at 390.

### payout-read-1280, payout-read-390 (light and dark)

- payout-read-*: the band's Tax cell and the totals' tax row — both read "Denver combined" with no percent. The reference shows "Denver combined (8.71%)" in both places, and every other built read view (posted, void-link, sales-receipt-read, credit-memo-read) shows the percent. — BLOCKING (spec §3.6: "the tax line \"<rate or group> (<percent>)\" with its amount"; reference `payout-read-1280-light.png`). Probable cause, for the driver: a payout writes no tax snapshot (spec §4.3), and the read view takes the percent from the tax lines.
- The source link row above the ruled Payment row agrees with the reference.

### from-sales-receipt-1280, from-sales-receipt-phone-390 (light and dark)

- Nothing found apart from the 2 px offset noted above. The link row and "Remove link" agree with the reference in look. The hint under "Message to customer" reads "Shown on the refund receipt and its PDF.", as the spec says.

### posted-1280, posted-phone-390 (light and dark)

- Nothing found.

### sales-receipt-read-1280, sales-receipt-read-phone-390 (light and dark)

- Nothing found. The section's grid does not scroll sideways at 1280, and it is a card at 390. "Refund" sits after Copy.

### sales-receipt-more-phone-390 (light and dark)

- Nothing found. The key hints show as glyphs ("⌘P"); the reference's "$mod+p" was the scratch route's.

### credit-memo-read-1280, credit-memo-read-phone-390 (light and dark)

- Nothing found. The Refunded row (muted label, minus sign, regular weight) and the Unapplied credit row (semibold) read correctly after "Credit amount". Their place is the plan decision and is not judged.

### credit-memo-more-phone-390 (light and dark)

- Nothing found.

### cannot-refund-receipt-1280, cannot-refund-receipt-390, cannot-refund-memo-1280, cannot-refund-memo-390 (light and dark)

- Nothing found. Each agrees with its reference.

### link-error-1280 (light and dark)

- Nothing found in appearance. The error text sits directly under the link row and is legible in both schemes.

### void-link-1280 (light and dark)

- void-link-*: Payment row — with no payment method and no reference, the line starts with a lower-case letter: "refunded from 1200 Undeposited funds". The spec says missing parts are left out, so the text is correct, but it reads as a cut sentence. — NOTE
- The "(void)" suffix is inside the link, as in the reference.

## For gate 3

- link-error-1280: after the refused write the title reads "Draft refund receipt". The reference keeps "New refund receipt". Check whether the form shows a saved-draft title for a record the server refused (the optimistic insert), and whether the URL and the form state agree with it.
