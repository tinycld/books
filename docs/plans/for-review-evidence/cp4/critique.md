# for-review checkpoint 4: gate-2 critique

Delivers: check boxes on For review and Excluded rows (writers), select-all on the header and the phone bar, the selection bar with count and sums, batch Exclude / Move to For review with its busy and refusal states, and the read-only checks of the whole queue.

Compared: 24 built shots in `for-review-evidence/cp4/` with the same-named references in `for-review-reference/`. Data differs by design (seed vs fixture); structure compared.

## State check

| shot | 1280 light | 1280 dark | 390 light | 390 dark |
|---|---|---|---|---|
| selected | valid | valid | valid | valid |
| busy | valid | valid | valid | valid |
| failed | valid | valid | valid | valid |
| done | valid | valid | valid | valid |
| excluded-selected | valid | valid | valid | valid |
| read-only | valid | valid | valid | valid |

- selected: three rows checked, "3 selected · Spent $396.95 · Received $1,250.00", Exclude + Clear in place of the toolbar, header box mixed (dash); phone bar shows the mixed box + "Select all".
- busy: same text kept, "Excluding…" with spinner, Clear disabled, three rows gone (tab "For review (5)"), remaining boxes and select-all dimmed.
- failed: "This transaction is locked." in danger color under the bar, "1 selected · Spent $34.55 · Received $0.00", AMAZON MARKETPLACE back and checked, select-all mixed. The capture report explains why the line is the server message and not the "2 of 3" summary of the reference; the spec allows both ("the server's message when every failure has the same one"). Same structure as the reference.
- done: toolbar back, "Excluded 3 transactions." muted under it, "For review (5)", boxes empty.
- excluded-selected: Excluded tab, two rows checked, "Move to For review" + Clear, select-all mixed.
- read-only: no check column, no select-all, toolbar still shown; drawer for CHECK 1050 with the facts and no action button; phone drawer is a bottom sheet.

0 INVALID.

## Findings

### selected
- selected-390-light, selected-390-dark: selection bar — the summary wraps after "Received", so "$1,250.00" sits alone on line two, separated from its label; the reference kept the summary on one line (shorter sums). Spec allows `flex-wrap`, so this is polish: the three phrases could wrap as units (one `Text` per phrase, `flex-wrap` on the row) so a label never parts from its amount. — NOTE
- selected-1280-*: nothing else found. Check column, header box, bar order (text · Exclude · Clear) and outline buttons match the spec and the reference.

### busy
- busy-390-light: "Excluding…" button — the disabled label reads light teal, fainter than the same disabled label at 1280 (gray). Legible but low contrast; worth checking why the two widths differ (phone bar hover/press residue or a different disabled style). — NOTE
- busy-1280-dark, busy-390-dark: row boxes and select-all box — the disabled boxes are almost invisible against the dark card (only a faint outline). Disabled should look disabled, but at this level the column reads empty; a slightly stronger disabled border would keep the column legible. — NOTE
- Otherwise clean: spinner + "Excluding…", Clear disabled, text kept, rows gone optimistically, as the spec says.

### failed
- nothing found. Danger line sits under the bar and above the header (reference position), the refused row is back and checked, select-all mixed, text `text-danger` legible in both themes.

### done
- nothing found. Toolbar back, muted result line under it, boxes empty, counts updated. (Capture report mentions a scrolled side nav in done-1280-light; the final PNG shows the New button, so no artifact.)

### excluded-selected
- nothing found. Same structure as For review with "Move to For review" as the batch button, in both widths and themes.

### read-only
- nothing found for this checkpoint: no check column, no select-all, no selection bar, drawer without action, toolbar and list present for the reader (spec: "Read-only user: the tabs, toolbar, lists and drawer facts; no check boxes, no select-all, no selection bar, no drawer actions"). The drawer's chip position differs from the reference (right of the amount vs under "Spent"); that is checkpoint 3's drawer, not this checkpoint's part.

### Across the 390 list shots (not this checkpoint's part)
- selected/busy/failed/done/excluded-selected-390-*: the page's floating "+" button covers the right end of the fourth card's amount ("-$12,843." / "-$86." / "-$450." / "-$6…"). The reference shows the same overlap, and the FAB belongs to the Banking page, not to this checkpoint. Recorded so it is not lost: the card list could end with bottom padding the height of the FAB, or the FAB could hide while a list scrolls. — NOTE (out of this checkpoint's scope)

## Totals

0 INVALID, 0 BLOCKING, 4 NOTE.

## For gate 3

Nothing visible. Every state the capture reached matches the behavior the spec describes (optimistic removal, refused row back and chosen, result line text).
