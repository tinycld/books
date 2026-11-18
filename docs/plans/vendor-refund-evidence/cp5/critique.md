# Gate 2 critique — vendor-refund, checkpoint 5

Scope: the vendor credit read view (Refunded row, refund rows in Applied to, badge, Record refund). The apply-empty shots are not part of this critique.

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

## State check

| Shot | State shown | Verdict |
|---|---|---|
| credit-390-light | Posted credit 1004, $425.00, one refund of $150.00, balance $275.00, badge Partly applied | valid |
| credit-390-dark | same | valid |
| credit-1280-light | same | valid |
| credit-1280-dark | same | valid |
| credit-refunded-390-light | Credit 1004 refunded in full (refunds 1001 and 1006), balance $0.00, badge Refunded | valid |
| credit-refunded-390-dark | same | valid |
| credit-refunded-1280-light | same | valid |
| credit-refunded-1280-dark | same | valid |

## Checked against spec §3.9 and found correct

- Totals: Refunded row with a minus sign, after Total and before Unapplied credit, in all 8 shots. No Applied row shows; nothing is applied to a bill, and the reference shows none in this state.
- Badge: Partly applied in the warning tone with a balance; Refunded in the success tone at balance 0 with nothing applied to a bill. Legible in light and dark.
- Applied to: each posted refund is one link, "Vendor refund 1001 · Nov 10, 2026 · $150.00", in date order, with no Remove.
- Bar, 1280: Record refund is directly after Apply to bills; both are absent on the credit refunded in full.
- Bar, 390: Apply to bills stays the bar button; Record refund is not in the bar (it is in More, not opened in these shots).
- More at the left is the approved build; not a finding.

## Findings

### credit-390-light, credit-390-dark, credit-1280-light, credit-1280-dark
- credit-*: Applied to, refund row — the amount is inside the link text and the row has no divider; the reference puts the amount right-aligned in its own column with a line under the row. The build follows the spec text ("Vendor refund 1001 · Nov 17, 2026 · $50.00", a link). — NOTE

### credit-refunded-390-light, credit-refunded-390-dark, credit-refunded-1280-light, credit-refunded-1280-dark
- credit-refunded-*: Applied to, the two refund rows — the rows are 48 px apart with no divider between them, so two underlined links look loose and not like a list. — NOTE
- credit-refunded-*: action bar — Edit is drawn as the primary (filled) button on a credit refunded in full; the reference draws no primary button in this state. This is the behavior of the shared bar. — NOTE

## Not verified

- A credit with Applied and Refunded rows together: no built shot shows it. The mixed list (application rows with Remove beside refund rows without Remove, and the alignment of their amounts) and the Applied row above Refunded in the totals are not checked. A shot of a credit with one bill application and one refund is necessary to check them against spec §3.9.
- The More menu content at 390 (Record refund with the text R): not opened in a shot.

## For gate 3

Nothing visible.
