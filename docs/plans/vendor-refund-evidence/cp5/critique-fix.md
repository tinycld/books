# Gate 2 critique, fix round — vendor-refund, checkpoint 5

Scope: apply-empty-*, credit-*, credit-refunded-*, credit-applied-refunded-*, credit-more-390-light. The NOTEs of `critique.md` are not repeated.

Result: 0 INVALID, 0 BLOCKING, 1 NOTE.

## State check

| Shot | State shown | Verdict |
|---|---|---|
| apply-empty-390-light / -dark | Apply dialog (sheet) of credit 1004, vendor with no open bill: the no-open-bills text, New bill, Record refund | valid |
| apply-empty-1280-light / -dark | Same, as a dialog | valid |
| credit-390-light / -dark, credit-1280-light / -dark | Posted credit 1004, one refund of $150.00, balance $275.00, badge Partly applied | valid |
| credit-refunded-390-light / -dark, credit-refunded-1280-light / -dark | Credit 1004 refunded in full (refunds 1001 and 1004), balance $0.00, badge Refunded | valid |
| credit-applied-refunded-1280-light / -dark | Credit 1002, $30.00 applied to Bill 1007 and $240.20 refunded, balance $0.00, badge Applied | valid |
| credit-applied-refunded-390-light / -dark | Same credit; the totals show, the Applied to block is below the bottom edge of the shot | valid for the totals only (see Not verified) |
| credit-more-390-light | More sheet open on credit 1004 | valid |

## Findings

### apply-empty-390-light, apply-empty-390-dark, apply-empty-1280-light, apply-empty-1280-dark
- apply-empty-*: dialog body, above the text — the required field "Apply date *" shows in the empty state, where no bill can be applied; the reference draws the empty state with no field (Unapplied credit, the text, the two buttons). — NOTE
- Checked and correct: the text is the spec text ("Cascade Fuel & Fleet has no open bills. The credit stays on the vendor until you post a bill or record a refund."); "Record refund" is a core Button beside "New bill"; Apply credit is disabled; wrapping is clean at 390; legible in light and dark.

### credit-390-light, credit-390-dark, credit-1280-light, credit-1280-dark
- nothing found (new). The refund row is "Vendor refund 1001 · Nov 10, 2026 · $150.00", one link, no Remove, as the earlier critique describes it.

### credit-refunded-390-light, credit-refunded-390-dark, credit-refunded-1280-light, credit-refunded-1280-dark
- nothing found (new). Two refund rows in date order, no Remove; totals Refunded −$425.00, Unapplied credit $0.00; badge Refunded in the success tone.

### credit-applied-refunded-1280-light, credit-applied-refunded-1280-dark
- nothing found. Checked against spec §3.9:
  - Totals: Applied −$30.00 is above Refunded −$240.20, then Unapplied credit $0.00; all figures right-aligned in one column, minus signs the same glyph.
  - Applied to: "Bill 1007 · Nov 16, 2026 · $30.00" with Remove, then "Vendor refund 1003 · Nov 18, 2026 · $240.20" with no Remove; date order is correct.
  - Amounts: each amount is the end of its row's link text, so the two amounts are not in one column (they end at different x positions). The two row kinds use the same format and the same left edge. This is the case of the earlier NOTE (amount in the link text, the spec's text form); not repeated as a finding.
  - Badge Applied (success tone) at balance 0 with a bill application: correct.

### credit-applied-refunded-390-light, credit-applied-refunded-390-dark
- nothing found in the part shown. Totals: Applied −$30.00 above Refunded −$240.20, then Unapplied credit $0.00, aligned with the rows above.

### credit-more-390-light
- nothing found. The bar keeps Apply to bills (shown in credit-390-*); the More sheet has "Record refund" as its first row with the key text "r" at the right. The key text is lowercase, as on every other row of the sheet (e, v, c, j).

## Not verified

- credit-applied-refunded-390-*: the Applied to block (application row with Remove next to a refund row without Remove) is not in the shot; the page is not scrolled to it. The mixed list is verified at 1280 only.
- credit-* and credit-refunded-*: the prompt says a fix changed the refund row in Applied to. The row in these shots is as the earlier critique describes it (amount in the link text, no divider). No changed look is visible.
- credit-more: dark scheme not captured.

## For gate 3

Nothing visible.
