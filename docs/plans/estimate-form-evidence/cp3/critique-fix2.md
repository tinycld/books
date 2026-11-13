# estimate-form cp3 — design critique after fix round 2 (narrow)

Scope: only `closed-phone-390-light/dark` and `closed-draft-1280-light/dark`, against the reference shots of the same names. The 4 built shots and the 4 references were read. The other cp3 shots were not judged again.

Result: 0 INVALID, 0 BLOCKING, 1 NOTE.

## Earlier note N1 (no message in these shots)

Closed. The read view draws the message in all 4 shots.

- `closed-phone-390-light/dark` (Estimate 1011): "Message to customer (printed)" with "Thank you for the chance to quote this work. Prices hold until the expiration date." is below the totals and above "Internal memo (not printed)". The text wraps to 2 lines with no clipping. Position and order agree with the reference.
- `closed-draft-1280-light/dark` (Estimate 1012): the same block is in the left footer column, beside the totals, above the memo. The text wraps to 2 lines. Position and order agree with the reference.

The text is legible in light and dark (label in the muted tone, body in the foreground tone).

## Earlier note N2 (uneven gap above the converted link at 1280)

Not visible now. With the message drawn, the left column is as tall as the totals column, and the gap between the memo and "Converted to a draft invoice" is about 48 px, the same as in the reference. The cause is not proved fixed: an estimate with no message and a short memo can show the larger gap again. No shot shows that case.

## Per screenshot

### closed-phone-390-light, closed-phone-390-dark
State check: valid (Closed badge, read view, message and memo, "Converted to invoice 1006" on its own row, bar More · Open invoice (primary) on one row).
Nothing found.

### closed-draft-1280-light, closed-draft-1280-dark
State check: valid (Closed badge, read view, message and memo, "Converted to a draft invoice" on its own row, bar Open invoice (primary) · Copy · Download PDF).
Nothing found.

## Notes

- N1 (carried as N4 of critique-fix1) — all 4 shots: the back link reads "Journal entries" on an estimate. The reference shows the same label, so no decision is lost. An estimate posts no journal entry; taste only.

## Not findings

- The built estimates have no Expiration date and no Accepted by / Accepted date; the reference estimate (1005) has them. This is the data of the captured estimates (Pending, no expiration), not a lost decision: the spec shows these fields "when set".
- The built band shows a "Status / Closed" detail that the reference band does not. Spec §3.8 lists the status badge among the read view's details.

## For gate 3

Nothing.
