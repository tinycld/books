# Design critique: customer-pages, checkpoint 3 (balance figures and New transaction)

Scope: the page header region, the two figures, the New transaction button, menu and sheet, and the inactive hint. The tab bodies are not judged (the built shots show Details; the reference shows Transactions). All 30 built shots were read (light and dark).

Result: 0 INVALID, 1 BLOCKING (in 2 shots), 3 NOTE.

## State check

| Shot | Widths | State shown | Verdict |
|---|---|---|---|
| transactions | 390, 1280, 1600 | Populated header, Open $2,111.77, Overdue $0.00, button enabled | valid |
| credit | 390, 1280 | Label "Credit", figure "−$120.00" | valid |
| error | 390, 1280 | "Balance unavailable" with Retry, no figures | valid |
| long | 390, 1600 | Long name and long address, figures $0.00 | valid |
| loading | 390, 1280 | Both figures "—" (balance read held) | valid |
| new-menu | 1280 | Popover menu open: Invoice, Estimate, Sales receipt | valid |
| new-menu-phone | 390 | Bottom sheet "New transaction" with the three items | valid |
| empty-inactive-sub | 390, 1280 | Inactive sub-customer, button disabled, hint shown | valid (390 has an overlay, see the finding) |

Light and dark of each shot show the same state.

## Findings

### transactions-390, -1280, -1600 (light, dark)
- transactions-1280 / -1600: actions row — the More button is about 2 px lower and 2 px taller than New transaction, so the two buttons do not share a top edge. The reference has the same offset. — NOTE

Nothing else found. Figures, labels, the 3 px markers (warning, danger) and the button agree with the reference at each width. Markers and labels are legible in dark.

### credit-390, -1280 (light, dark)
Nothing found. The label reads "Credit", the figure has the true minus sign, and the block keeps its width and alignment.

### error-390, -1280 (light, dark)
Nothing found. "Balance unavailable" with the Retry link replaces the figures; the button row stays in place. Same as the reference.

### long-390, -1600 (light, dark)
Nothing found. The long name truncates (390) or wraps to two lines (1600) and does not push the figures or the button. Same as the reference.

### loading-390, -1280 (light, dark)
Nothing found. Both figures read "—" with their labels and markers; the layout does not move when values arrive (same block positions as the transactions shots at 1280).

### new-menu-1280 (light, dark)
Nothing found. The menu opens under the button, right edges aligned, first row highlighted. Same as the reference.

### new-menu-phone-390 (light, dark)
Nothing found. Bottom sheet with the title "New transaction", close control and three items. Same as the reference.

### empty-inactive-sub-390 (light, dark)
- empty-inactive-sub-390-light and -dark: over the Overdue figure — a tooltip "New transaction ⌥N" is drawn on top of the figure "$0.00" and hides most of it. The reference shot has no overlay and the figure is fully readable. — BLOCKING (spec §3.1 "Phone: the header stacks — name and icons, company and address, the two figures side by side, then New transaction as a full-width button"; spec §3.2 "Each is a large figure with a small uppercase label and a 3 px left marker"; reference `empty-inactive-sub-390-*` shows both figures unobstructed.) If the tooltip comes from the capture's pointer position, the shot must be taken again with the pointer away from the button. If it shows without a pointer (focus, or a disabled button that does not clear its hover), the build must be corrected. In both cases this shot is not evidence of a clean inactive header on phone.
- empty-inactive-sub-390: hint under the button — "Make this customer active to add transactions." wraps after "add" at about 215 px although the row is 358 px wide. The reference wraps the same way. — NOTE

### empty-inactive-sub-1280 (light, dark)
- empty-inactive-sub-1280: actions row — the hint under the disabled button makes its column wider than the button, so the gap between New transaction and More grows to about 87 px (8 px in the active state) and the button moves left. The reference has the same layout. — NOTE

## For gate 3
- Phone, inactive customer: a shortcut tooltip ("New transaction ⌥N") shows on the disabled New transaction button at the 390 width (both schemes). Check if a disabled `ShortcutButton` shows, or keeps, its tooltip, and if a tooltip with a keyboard shortcut must show at all on the mobile breakpoint.
