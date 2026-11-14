# Design critique: bill-form, checkpoint 5 (Purchases settings and help)

Scope judged: Settings → Purchases (Bills card, Bill lines select, read-only row) and the effect of the setting on the bill form. The bill form's own layout (band, line cards, totals, action bar) is the work of checkpoints 2 and 3; items on it are marked "outside this slice".

Result: 0 INVALID, 0 BLOCKING, 6 NOTE.

## State check

| Shot | Shows the named state? |
|---|---|
| settings-390-light / -dark | Yes. Purchases detail page, Bills card, select "Accounts and products", hint, Save (disabled, form not changed). |
| settings-1280-light / -dark | Yes. Section list with Purchases after Sales and selected; same card. |
| settings-readonly-1280-light / -dark | Yes. Read-only row "Bill lines / Accounts and products", no select, no Save; the Access section is absent, which agrees with a non-admin. |
| new-accounts-1280-light / -dark | Yes. New bill with "Account details" only, one empty account line, no product heading. Totals show Total and Balance due only. |
| new-products-390-light / -dark | Yes. New bill with "Product and service details" only, one empty product line card, no account table. |
| new-products-1280-light / -dark | Yes. Same state as a grid. |
| correction-phone-390-light / -dark | Yes. "Edit 1002" with the replace note, two account line cards and three product line cards. The image cannot show that the setting was "Accounts only" at capture; capture.json order (after new-accounts, before new-products) agrees with it. |

## Findings

### settings-390-light, settings-390-dark
- settings-390: card, between the select and the hint — the gap above the hint (about 28 px) is larger than the gap between the label and the select and than the gap between the hint and Save, so the hint reads as detached from its field. The reference has the same gap. — NOTE
- settings-390: page header — the built page has a back arrow before "Purchases"; the reference has none. This is the real `SettingsShell` phone header and is correct. Not a finding.

### settings-1280-light, settings-1280-dark
- settings-1280: section list — no summary line ("Bill lines: Accounts and products") is visible under "Purchases"; the other sections show none also, so this agrees with the shell at this width. No shot shows the phone section list, so the spec text "section-list line "Bill lines: Accounts and products"" has no visual evidence in this set. — NOTE
- Same hint gap as settings-390. Counted once, above.
- Otherwise nothing found. The section list column is the real shell (the reference drew the card without it); structure and hierarchy of the card are those of the reference. Light and dark are legible.

### settings-readonly-1280-light, settings-readonly-1280-dark
- settings-readonly: Bills card, below the one row — a divider line is drawn under the last (only) row, directly above the card's bottom edge. The reference has the same line. — NOTE
- Otherwise nothing found.

### new-accounts-1280-light, new-accounts-1280-dark
- new-accounts: bottom left — the "Saved." toast from the Settings save is still shown and covers the lower part of the sidebar. Capture artifact (declared in the prompt), not a defect of the screen. — NOTE
- new-accounts: left edges — "Account details" heading at x=340, the table at x≈342, "Memo" at x≈344; the reference has all three on one left edge. Outside this slice (checkpoint 3 layout). — NOTE
- The state the reference decided is kept: one table, its heading, one empty line, "Add account line", Memo left and totals right under Amount, bar Cancel / Save draft / Post / Post & new.

### new-products-390-light, new-products-390-dark
- new-products-390: top — the "Saved." toast covers the back link ("Journal entries") of the form. Capture artifact; same NOTE as above, not counted again.
- new-products-390: product line card — Qty and Rate are each a full-width row; the reference has them side by side. The spec says "fields stacked", and the card is checkpoint 3's. Not a finding of this slice.
- Otherwise nothing found. The state (product table only, one empty product line, no account table) agrees with the reference.

### new-products-1280-light, new-products-1280-dark
- Nothing found for this slice. Qty shows the default 1 and Amount shows $0.00 (the reference shows both empty); real data, no decision lost. The picker placeholder is not truncated in the build (it is in the reference).

### correction-phone-390-light, correction-phone-390-dark
- correction-phone (light): action bar — "More" appears with a tinted (accent) fill, different from Cancel and Save draft and from the reference, where it is a plain outline button. It can be a focus or hover state left by the capture; examine it at full size. — NOTE
- Otherwise nothing found. The decision of the reference is kept: under a setting that hides the product table, the correction shows both tables with all their lines, the two table subtotals, Total and Balance due.

## For gate 3
- Confirm where the section-list line "Bill lines: <label>" is drawn at 1280 (the e2e reads it on desktop, but it is not visible in settings-1280).
- Confirm why "More" is tinted in correction-phone-390-light (focus state or style).
