# Design critique after the fix round: customer-pages, checkpoint 3 (balance figures and New transaction)

Scope: the page header region, the two figures, the New transaction button, menu and sheet, and the inactive hint. The tab bodies are not judged (the built shots show Details; the reference shows Transactions).

Read: all 30 recaptured built shots (light and dark). Reference shots read: `transactions-390-light`, `transactions-1280-light`, `long-390-light`, `long-1600-light`, `empty-inactive-sub-390-light`, `empty-inactive-sub-1280-light`. The other reference shots were not read again in this round; the first critique compared them.

Result: 0 INVALID, 0 BLOCKING, 4 NOTE.

## The two fixes

- Tooltip over the Overdue figure (first critique, BLOCKING): gone. `empty-inactive-sub-390-light` and `-dark` show both figures ("$0.00", "$0.00") with no overlay, the disabled full-width button, and the hint below it. Same as the reference.
- Phone More icon with a two-line title: in each 390 shot with a two-line title (transactions, credit, error, loading, long, new-menu-phone, empty-inactive-sub) the More icon is at the top right, level with the first title line. This agrees with spec §3.1 "More as an icon button at the top right". See the NOTE on the icon row.

## State check

| Shot | Widths | State shown | Verdict |
|---|---|---|---|
| transactions | 390, 1280, 1600 | Populated header, Open $2,111.77, Overdue $0.00, button enabled | valid |
| credit | 390, 1280 | Label "Credit", figure "−$120.00" | valid |
| error | 390, 1280 | "Balance unavailable" with Retry, no figures | valid |
| long | 390, 1600 | Long name and long address, figures $0.00 | valid |
| loading | 390, 1280 | Both figures "—" | valid |
| new-menu | 1280 | Popover menu open: Invoice, Estimate, Sales receipt | valid |
| new-menu-phone | 390 | Bottom sheet "New transaction" with the three items | valid |
| empty-inactive-sub | 390, 1280 | Inactive sub-customer, button disabled, hint shown, no overlay | valid |

Light and dark of each shot show the same state.

## Findings

### transactions-390, -1280, -1600 (light, dark)
- transactions-390 (and each 390 shot with a two-line title): title row — the More icon is now level with the first title line (about y 78), but the Email and Call icons stay centered on the two-line title (about y 88). The three icons are in one row and are about 10 px out of line. The reference has all three on one line (centered). The new More position follows the spec; the Email and Call icons could move to the same line. — NOTE
- transactions-1280 / -1600: actions row — the More button is about 2 px lower and 2 px taller than New transaction. The reference has the same offset. — NOTE (unchanged from the first critique)

Nothing else found.

### credit-390, -1280 (light, dark)
Nothing found (390: the icon-row NOTE above applies).

### error-390, -1280 (light, dark)
Nothing found (390: the icon-row NOTE above applies).

### long-390, -1600 (light, dark)
Nothing found. 390: the title shows two lines and truncates ("St. Jude / Community …"); More is at the top right; the figures and the button keep their positions. 1600: the title wraps to two lines and does not push the figures or the buttons. Same as the reference (390: the icon-row NOTE above applies).

### loading-390, -1280 (light, dark)
Nothing found (390: the icon-row NOTE above applies).

### new-menu-1280 (light, dark)
Nothing found.

### new-menu-phone-390 (light, dark)
Nothing found.

### empty-inactive-sub-390 (light, dark)
- empty-inactive-sub-390: hint under the button — "Make this customer active to add transactions." wraps after "add" at about 215 px although the row is 358 px wide. The reference wraps the same way. — NOTE (unchanged)
- The icon-row NOTE above applies here too: Call icon and the Inactive badge at about y 88, More at about y 78.

### empty-inactive-sub-1280 (light, dark)
- empty-inactive-sub-1280: actions row — the hint under the disabled button makes its column wider than the button, so the gap between New transaction and More grows to about 87 px (8 px in the active state). The reference has the same layout. — NOTE (unchanged)

## For gate 3
- The first critique asked to check if a disabled `ShortcutButton` shows or keeps its tooltip on the mobile breakpoint. The recapture only waits for the tooltip to fade, so the shots do not answer this question.
