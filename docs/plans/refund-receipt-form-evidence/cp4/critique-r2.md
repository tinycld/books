# Gate 2 re-critique (fix round 2): refund-receipt-form, checkpoint 4

Scope: the 8 shots that fix round 2, item 1 changed (`payout`, `payout-phone`, `payout-errors`, light and dark, 1280 and 390). Each was read against its reference of the same name. Findings already recorded in `critique.md` are not repeated.

Result: 0 INVALID, 0 BLOCKING, 0 NOTE.

## State check

Every built shot shows the state its name says. None is INVALID.

| Shot | Shows |
|---|---|
| payout-1280-light, payout-1280-dark | Payout form: disabled Customer, link row, inline notice, no "Remove link" |
| payout-phone-390-light, payout-phone-390-dark | The same form in the stacked phone layout with a line card |
| payout-errors-1280-light, payout-errors-1280-dark | Cap error in the link row and date error under Refund date |
| payout-errors-390-light, payout-errors-390-dark | The same two errors in the phone layout |

The memo number, the customer, the amounts and the one line (reference: seven lines) are seed data, not a finding.

## Fix round 2, item 1: resolved

In all 8 shots the link is only "Pays out credit memo 1002" (underlined, link color). The text "· $410.92 unapplied" follows on the same line as muted plain text with no underline. This agrees with the reference decision (`payout-1280-light.png`, `payout-phone-390-light.png`) and with spec §3.3 ("`DocumentSourceLink` plus the credit memo's live `balance`").

- The space before "·" is present; the row reads "Pays out credit memo 1002 · $410.92 unapplied".
- At 390 the link and the figure fit on one line. Nothing is cut and nothing wraps badly.
- The muted figure is legible in light and dark.

## Findings

### payout-1280-light, payout-1280-dark
- Nothing found.

### payout-phone-390-light, payout-phone-390-dark
- Nothing found.

### payout-errors-1280-light, payout-errors-1280-dark
- Nothing found. Both error texts are legible in both schemes.

### payout-errors-390-light, payout-errors-390-dark
- Nothing found. The cap error wraps to two lines cleanly.

## Not judged

- The place of the link row above the date row (plan decision).
- The two NOTEs of `critique.md` on these shots (the cap error under the notice box; the 2 px left offset of the link row) are unchanged and stay as recorded there.

## For gate 3

- None.
