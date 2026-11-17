# Design critique: vendor-credit-form, checkpoint 3

Scope: the form and the read view, without the Apply to bills button, its notice and the Applied to block (checkpoint 4).
Read: all 52 built shots (17 names; 1280 and 390; light and dark). Reference: the light shot of each name and width.

Result: 0 INVALID, 1 BLOCKING, 6 NOTE.

## State check

| Shot | Widths | State shown | Result |
|---|---|---|---|
| new | 1280, 390 | Empty new form, Vendor has focus, one empty account line | valid |
| draft | 1280 | Saved draft, Office Supply World, one product line, More in the bar | valid |
| draft-phone | 390 | Same draft, stacked band, product line card | valid |
| correction | 1280 | "Edit 1001" with the replace note | valid |
| correction-phone | 390 | Same correction, account line card | valid |
| errors | 1280, 390 | Post on an empty form: "Vendor is required" and the line-count text | valid |
| posted | 1280, 390 | Vendor credit 1001, badge Posted, Unapplied credit row | valid |
| partly | 1280 | Vendor credit 1002, badge Partly applied, Applied and Unapplied credit rows | valid |
| partly-phone | 390 | Same credit, line cards | valid |
| phone-more | 390 | More sheet open on credit 1002 | valid |
| void | 1280, 390 | Vendor credit 1003, badge Void, Voided by line | valid |
| reader | 1280 | Credit 1002 for a reader: View journal entry, no attach area | valid |
| no-access | 1280, 390 | "You need bookkeeper access to create vendor credits" | valid |
| not-found | 1280, 390 | "This vendor credit does not exist" | valid |
| cannot-edit | 1280, 390 | "This vendor credit cannot be edited" | valid |
| loading | 1280, 390 | Spinner | valid |
| error | 1280, 390 | "Books could not load this vendor credit." with Retry | valid |

The errors shot shows other refusals than the reference (the reference shows the duplicate credit no. and a line amount error). It is still the errors state.

## Findings

### new (1280, 390; light, dark)
nothing found

### draft-1280 (light, dark), draft-phone-390 (light, dark)
- draft-1280, draft-phone-390: product line, Description cell — the long text shows three lines and the top half of a fourth line. The cut line looks broken. A cell height that ends on a full line, or a taller cell, is cleaner. — NOTE

### correction-1280, correction-phone-390 (light, dark)
nothing found

### errors (1280, 390; light, dark)
- errors-1280, errors-390: band, Vendor picker — the error text shows below the picker, but the picker has no danger border. The reference draws a danger border on a field with an error (Vendor's credit no., line Amount). — NOTE

### posted (1280, 390; light, dark)
- posted-1280 (also partly-1280, void-1280, reader-1280): details band — Vendor takes about half of the band, and Credit date and Vendor's credit no. start at x = 814. The reference puts the three fields side by side from the left. The two short fields look detached from the vendor. — NOTE
- posted-1280 (also partly-1280, void-1280, reader-1280): action bar — More is the first button, left of the primary button, and the reference has no More at this width. If More holds only Audit history, a wide bar has room for it as a button. — NOTE

### partly-1280, partly-phone-390 (light, dark)
- partly-1280, partly-phone-390: the negative account line shows "-$15.00" (hyphen) and the Applied row shows "−$30.00" (minus sign). The reference has the same difference. — NOTE

### phone-more-390 (light, dark)
- phone-more-390: sheet rows — the key hints are lowercase ("v", "c", "j"). The reference shows "E", "V", "C", "J", and the spec writes the keys in uppercase. Lowercase hints are harder to read. — NOTE

### void (1280, 390; light, dark)
- void-390 (light, dark): action bar — the bar shows only More. Copy and View journal entry are hidden, and the bar has no primary button. — BLOCKING (reference decision: `void-390-light.png` shows the bar as More + Copy, with Copy as the primary button; spec §3.7: "On a phone the actions that do not fit sit in More" — Copy fits beside More, as Edit does on posted-390)

### reader-1280 (light, dark)
nothing found other than the two posted-1280 notes

### no-access, not-found, cannot-edit, loading, error (1280, 390; light, dark)
nothing found

## For gate 3
- None visible.
