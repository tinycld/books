# Gate 2 critique: dashboard, checkpoint 4 (Customize, phone header and help)

Read: 18 built shots and 18 reference shots (9 names, light and dark), the brief, the spec, the lessons, `memories-design.md`, `capture.json`.
Judged by D8: the arrangement, not the names and numbers. The setup card ("Finish setting up Books") on the built page is D13 and is not a finding.

Result: 0 INVALID, 2 BLOCKING, 3 NOTE.

## State check

| Shot | Light | Dark | Shows |
|---|---|---|---|
| edit-1280 | valid | valid | Edit mode: five rows, Done, one hidden row (Sales), disabled Move buttons at the ends, Reset to default. |
| edit-390 | valid | valid | Phone edit mode: handle, name, two Move buttons, switch, no word "Show". |
| all-hidden-1280 | valid | valid | "All widgets are hidden." and a Customize button; no card. |
| all-hidden-390 | valid | valid | The same on a phone. |
| reordered-1280 | valid | valid | Grid in a changed order, Sales absent. |
| populated-phone-390 | valid | valid | Default arrangement, one column, phone header. |
| hidden-amounts-phone-390 | valid | valid | Hide amounts on, every amount masked. |
| prefs-error-1280 | valid | valid | Banner with Retry, Customize and Hide amounts disabled. |
| prefs-error-390 | valid | valid | The same on a phone; the icon button is disabled. |

State remark (not INVALID): the prompt says the built edit and reordered shots have Bank accounts first. They do not. The built order is Invoices, Bank accounts, Expenses, Profit and loss (Sales hidden): `capture.json` presses `dashboard-edit-up-bankAccounts` one time, which moves Bank accounts from third to second. The shots still show a changed order and a hidden widget, so the states are valid. To match the reference order, the capture must press Move up two times.

## Findings

### edit-1280 (light, dark)
- edit-1280: Reset to default button, below the list — the reference button has a leading reset icon; the built button has text only — NOTE.
- All other parts agree with the reference: list width, row parts, disabled Move up on the first row and Move down on the last, the muted name of the hidden row, primary Done.

### edit-390 (light, dark)
- edit-390: header, right end — the reference draws Done as a filled primary text button; the built page draws an outline check icon in the neutral tone. The plan orders the icon (`Check`, `useThemeColor('foreground')`), so this is not a break. The button that ends edit mode has less weight than on the wide page — NOTE.
- edit-390: Reset to default button — no leading icon (same as edit-1280) — NOTE.
- Rows: names are not cut, Move buttons are full size, nothing scrolls sideways.

### all-hidden-1280 (light, dark)
- nothing found.

### all-hidden-390 (light, dark)
- nothing found.

### reordered-1280 (light, dark)
- nothing found for this checkpoint. The grid follows the saved order and the hidden widget is absent.

### populated-phone-390 (light, dark)
- nothing found. Heading on the left, switch with its label and the icon button on the right, one column.

### hidden-amounts-phone-390 (light, dark)
- nothing found.

### prefs-error-1280 (light, dark)
- prefs-error-1280: all five cards, with the header switch — every amount draws as "•••••" while the disabled Hide amounts switch shows off. The reference shows the amounts with the switch off. The screen contradicts itself, and the masked state is the saved value, not the default — BLOCKING ("A failed preference read shows the default arrangement with a banner "Your dashboard settings could not load." and "Retry"; the Customize and Hide amounts controls stay disabled until it loads."; reference `prefs-error-1280-*` shows unmasked amounts).
- Customize is disabled, as required.

### prefs-error-390 (light, dark)
- prefs-error-390: all cards, with the header switch — the same defect: amounts masked, switch shown off — BLOCKING (same spec text; reference `prefs-error-390-*`).
- The Customize icon button is disabled, as required.

## Outside this checkpoint (not counted)
- Bank accounts card (checkpoint 3): in the built row "1000 Business Checking", "9 to review" is about 30 px below the name and the amount aligns with the name. In the reference the two lines are about 18 px apart and the amount is centered on the pair.

## For gate 3
- prefs-error: find the source of the masked amounts. Possible causes: the hook gives the stored `hideAmounts` while `isError` is true, or the fake (`fakeRecords` on `user_preferences`, status 400) does not stop the value that the earlier capture step saved. If the cause is the capture only, capture again with Hide amounts off.
- `capture.json`: the `edit` and `reordered` shots do not reach the reference order (Bank accounts first).
