# Gate-2 critique, fix round 1 — bank-categorize checkpoint 4 (Split lines)

Verdict: `CRITIQUE: 0 INVALID, 0 BLOCKING, 1 NOTE`

Read: 16 built PNGs (sending, refused, split, split-short × 390/1280 × light/dark) and the 16 matching reference PNGs, the brief, the spec, the lessons, memories-design.md, the capture notes.

Accepted data differences (capture notes): the $1,250.00 Cedar & Pine row in place of the $970.00 Brightline row; 6200/6100 in place of 6300; no bank Memo fact row on the seeded row.

## Fix checks

- Sending: the line Amount inputs and the remove X are now dimmed with the pickers and the memos, at both widths and in both schemes. The Split link does not show in a split form, so its dimming cannot be seen in these shots.
- Refused: the refusal line is now directly under the totals line and above Add a line, as the spec says ("otherwise in `text-danger` under the totals line"). The reference drew it under Add a line; the spec text decides, so this difference is not a finding.

## sending

State check: VALID in the 4 shots. Each shows the split form with 3 lines, the "Categorizing…" button, and the way switch, Payee, Memo, the line fields, Add a line and Exclude dimmed.

- sending-390-light: nothing found.
- sending-390-dark: nothing found.
- sending-1280-light: nothing found.
- sending-1280-dark: nothing found.
- sending-* (all 4): the "Categorizing…" button — the spinner at the left of the text is almost not visible on the dimmed primary colour; only an empty space shows. The reference has the same look. — NOTE

## refused

State check: VALID in the 4 shots. Each shows the split form, enabled again, with "This transaction is already reviewed." in the danger colour.

- refused-390-light: nothing found.
- refused-390-dark: nothing found. The refusal text is legible on the dark surface.
- refused-1280-light: nothing found.
- refused-1280-dark: nothing found.

## split

State check: VALID in the 4 shots. Each shows 3 line cards (Account, then Amount / Memo / X on one row), "Split $1,250.00 of $1,250.00" with no Remaining line, Add a line, and Categorize enabled.

- split-390-light: nothing found.
- split-390-dark: nothing found.
- split-1280-light: nothing found.
- split-1280-dark: nothing found.

The structure agrees with the reference: card border, Amount right aligned at about 112 wide, Memo flexible, X at the right, totals line, Add a line (outline), Categorize, the divider, Exclude. A long line memo is cut at the input edge ("Incoming wire f"), as in the reference.

## split-short

State check: VALID in the 4 shots. Each shows 2 line cards, line 2 with "Choose an account" and an empty amount (placeholder 0.00), "Split $1,130.00 of $1,250.00", "Remaining $120.00" in the danger colour, and Categorize disabled.

- split-short-390-light: nothing found.
- split-short-390-dark: nothing found.
- split-short-1280-light: nothing found.
- split-short-1280-dark: nothing found.

## Not judged (not in this checkpoint's Delivers)

- 1280: the account-card strip is cut at the drawer edge (the second card). The reference shows the same; it belongs to the Banking page, not to the split form.

## For gate 3

- The 44 pt box of the remove button and the dimmed Split link cannot be confirmed from the screenshots.
