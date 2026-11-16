# Gate 2 critique — pay-bills, checkpoint 4 (Bill balance, payments, Pay bill)

Counts are distinct findings: 0 INVALID, 1 BLOCKING (seen in 2 shots), 2 NOTE.

## State check

| Shot | Named state | Shows | Result |
|---|---|---|---|
| bill-1280-light.png | seeded partly paid bill, read view | Bill 1004, badge Partly paid, Balance due $850.00, Payments −$400.00, Payments block with one row | VALID |
| bill-1280-dark.png | same, dark | same | VALID |
| bill-390-light.png | same, phone | same | VALID |
| bill-390-dark.png | same, phone, dark | same | VALID |

## Findings

### bill-1280-light.png
- Totals (right column) — the rule is above Total, and no rule is above Balance due; Total and Balance due have the same weight. The reference puts the rule above Balance due, so Balance due reads as the result of Total less Payments. Balance due is still the last line and bold — NOTE
- Payments block (left column, below Attachments) — the block is below the attachment drop area, far from the totals line "Payments −$400.00" that it explains. The reference puts it at the level of the totals. The reference shows isolated parts, so the position is not a reference decision — NOTE
- Delivered and correct: big figure BALANCE DUE $850.00; badge Partly paid in warning tone; totals line "Payments −$400.00" above Balance due; row "Bill payment 1001 · Sep 15, 2026 · $400.00" as a link; Pay bill first of the actions and primary.

### bill-1280-dark.png
- Same two NOTEs as bill-1280-light.png. No legibility problem: badge, link, figures and muted labels are readable.

### bill-390-light.png
- Action bar (bottom) — the bar shows More and Edit (primary). Pay bill is not visible; the reference bar shows More and Pay bill (primary) — BLOCKING (plan, checkpoint 4 Files: "`documentReadActions(..., { canReceivePayment, canPayBill })` puts Pay bill first and primary"; reference decision: `bill-390-light.png` shows Pay bill as the primary phone action; the wide built bar does put Pay bill first and primary, so the phone bar disagrees with it)
- Totals — same rule position NOTE as 1280 (counted once).
- Delivered and correct: Balance due under the title, badge, totals line, Payments row on one line with no wrap.

### bill-390-dark.png
- Action bar (bottom) — same as bill-390-light.png: Edit is primary, Pay bill is not visible — BLOCKING (same basis)
- No legibility problem.

## Not findings
- Vendor is plain text in the built header card (a link in the reference), and the card has Terms and Mailing address: the existing bill read view, not this checkpoint's additions.
- More in the wide bar (not in the reference): the audit history row of added item D2.
- Line table and Attachments look: out of scope by the Gates line.

## For gate 3
- Back link, all four shots — the label is "Journal entries". The shots were opened from the bill payment's read view. Added item D1 says: "The back label must name what Back leads to (it must not say "Journal entries" when it goes to a bill)". Check where Back leads from this screen and that the label names it. A screenshot cannot show the target.
- Phone action bar — check that Pay bill is in More at 390 and why Edit takes the primary place (the phone branch of the read action bar does not follow the "first and primary" order).
