# Gate 2 critique: bank-categorize, checkpoint 4 (Split lines)

Verdict: `CRITIQUE: 0 INVALID, 1 BLOCKING, 3 NOTE`

Read: all 24 built PNGs. Reference PNGs read: categorize-390-light, categorize-1280-light, categorize-filled-390-light, categorize-filled-1280-dark, split (all 4), split-short-390-light, split-short-1280-light, sending-390-light, sending-1280-light, refused-390-light, refused-1280-light. The other reference PNGs were not opened.

The built data differs from the reference as the capture notes say ($1,250.00 row, 6200/6100 in place of 6300). That is not a finding.

## State check

| shot | 390 light | 390 dark | 1280 light | 1280 dark |
|---|---|---|---|---|
| categorize | valid | valid | valid | valid |
| categorize-filled | valid | valid | valid | valid |
| split | valid | valid | valid | valid |
| split-short | valid | valid | valid | valid |
| sending | valid | valid | valid | valid |
| refused | valid | valid | valid | valid |

- categorize: one-account form, no payee, no account, Split link, Categorize disabled.
- categorize-filled: payee and account chosen, Split link, Categorize enabled.
- split: 3 line cards, "Split $1,250.00 of $1,250.00", no Remaining line, Categorize enabled.
- split-short: 2 line cards, "Split $1,130.00 of $1,250.00", "Remaining $120.00" in red, Categorize disabled.
- sending: "Categorizing…" button, dimmed way switch, pickers, Add a line and Exclude.
- refused: "This transaction is already reviewed." in red above Categorize, form kept.

## Findings

### categorize-390-light, categorize-390-dark, categorize-1280-light, categorize-1280-dark
Nothing found. Structure, order (Payee, Account, Memo, Split, Categorize, Exclude) and the Split link agree with the reference and the spec.

### categorize-filled-390-light, categorize-filled-390-dark, categorize-filled-1280-light, categorize-filled-1280-dark
Nothing found.

### split-390-light, split-390-dark, split-1280-light, split-1280-dark
Nothing found. Each card is Account, then one row of Amount (right aligned, about 112 wide), Memo, remove. Totals line, Add a line, Categorize are in the reference order. No sideways scroll. Dark mode is legible.

### split-short-390-light, split-short-390-dark, split-short-1280-light, split-short-1280-dark
Nothing found. "Remaining $120.00" is red and legible in light and dark. The empty line 2 shows the "Choose an account" and "0.00" placeholders.

### sending-390-light, sending-390-dark, sending-1280-light, sending-1280-dark
- sending (all 4): the three line cards, Amount inputs and remove (X) buttons — the Amount inputs and the remove buttons show at full strength while the Payee, the top Memo, the account pickers, the line Memo inputs, Add a line, the way switch and Exclude are dimmed. In one card row the Memo looks disabled and the Amount beside it looks enabled. — BLOCKING (spec, "Sending, success and refusal": "the fields, the way switch and the drawer's Exclude are disabled."). The reference shows the same undimmed Amount, but the reference does not decide against the spec text; the built screen already dims more than the reference (top Memo, line Memos), so the Amount and remove are the only parts left out.
- sending (all 4): field labels — the labels "Memo" (top and in each card) are dimmed, and the labels "Payee", "Account" and "Amount" are not. The dimmed state is not uniform across the labels. — NOTE
- sending-390-light, sending-1280-light: the "Categorizing…" button — the spinner at the left of the text is almost not visible on the pale disabled button (a blank gap shows before the text). In dark it shows as a faint dark mark. — NOTE

### refused-390-light, refused-390-dark, refused-1280-light, refused-1280-dark
- refused (all 4): the refusal line — it is under Add a line, not directly under the totals line (order: totals, Add a line, refusal, Categorize). The reference has this same order, so it is not blocking. The spec says "in `text-danger` under the totals line" and the checkpoint's Do step 4 gives the order "`bank-cat-add-line`, `SplitTotals`, the refusal line, the submit"; built and reference both put the totals above Add a line. The driver can decide which order is correct. — NOTE

## For gate 3
- sending: check that each line's Amount input is not editable and each remove button is disabled while the write is sent (they do not look disabled; the capture notes say the same).
