# Design critique, round 2: apply-credit, checkpoint 4 (Apply credit on an invoice)

Verdict: `CRITIQUE: 0 INVALID, 0 BLOCKING, 0 NOTE`

Scope: the three shots captured again in round 2, each read with its reference of the same name. The other 25 shots and the one NOTE of round 1 (the Remove button's position in the phone Payments block) are in `critique.md` and are not repeated. Seed differences named in `cp4-capture.md` (document numbers, one memo in place of two, no payment that is not applied for Fox Hollow, the Credit memos section) are not findings.

## Per screenshot

### invoice-block-error-390-light
- State check: VALID. Posted invoice 1016, Partly paid, Credits applied −$150.00, Balance due $250.00. The Payments block shows its danger notice "Books could not load the credits applied to this invoice." with Retry, fully above the bar. The Credit memos section follows.
- Findings: nothing found. The notice has the structure of the reference: heading, danger box, text that wraps in two lines, Retry at the right.

### invoice-block-error-1280-light
- State check: VALID. Same state. The notice is full width under the Payments heading, with Retry at the right, above the action bar.
- Findings: nothing found.

### invoice-mixed-390-light
- State check: VALID. Written off badge, $0.00. Totals: Payments −$3,000.00, Credits applied −$300.00, Written off −$6,575.25, Balance due $0.00 (the rows add up to $9,875.25). The Payments block lists Payment 1003 (Nov 5), then Credit memo 1004 (Nov 19) with Remove, all above the bar. No tooltip, no focus ring.
- Findings: nothing found. The round 1 capture remark (the "Edit e" tooltip, Remove cut by the bar) is gone. Remove under its link is the round 1 NOTE; it is not counted again.

## Summary of findings
- INVALID: none.
- BLOCKING: none.
- NOTE: none new.

## For gate 3
- Nothing new. The round 1 item stays open for the driver: invoice-mixed-390-light cuts the Credit memos row's status at the bar, so this shot does not show if credit memo 1004 (applied in full) reads "Applied" or "Refunded" (spec §3.5).
