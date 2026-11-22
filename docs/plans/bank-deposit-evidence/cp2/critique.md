# Gate 2 design critique: bank-deposit, checkpoint 2 (read view)

Scope: the Delivers line of checkpoint 2 (posted deposit read view: header, band, items, other funds, totals, memo, stamps, Void and View journal entry). Edit is checkpoint 4; its absence is not a finding. The seeded deposit holds one item and one other funds line.

## State check

| Shot | Named state | Shows | Result |
|---|---|---|---|
| read-1280-light | posted deposit, read view, wide | Deposit 1001, Posted, $192.40, grid + table, bottom bar Void / View journal entry | VALID |
| read-1280-dark | same, dark | same, dark theme | VALID |
| read-390-light | posted deposit, read view, phone | Deposit 1001, Posted, figure under title, item card, line card, bottom bar More | VALID |
| read-390-dark | same, dark | same, dark theme | VALID |

## Findings

### read-1280-light
- read-1280-light: bottom action bar — Void is the filled primary button. The reference gives the filled style to Edit and draws Void as an outline button. With Edit absent, the destructive action has the primary weight. Checkpoint 4 adds Edit, which can restore the reference order; no rule is quoted for the interim. — NOTE
- read-1280-light: Items deposited header, Date column — the reference draws a sort arrow beside DATE and a taller header row; the build draws a plain header at the height of the Other funds header. Spec §3.8 gives the read grid no sort (the sort is a form rule, §3.4), so the build is consistent and the two table headers now match each other. — NOTE

No other finding. Structure, hierarchy and placement match the reference: back link, title + badge + help icon, big figure top right, band with Deposit to and Deposit date, Items deposited grid (Received from, Transaction link, Date, Payment, Amount), Other funds table (Received from "—", Account, Description, Amount), three right-aligned totals with the rule above Deposit total, memo, "Posted by" stamp. Amounts are right-aligned and in one column edge. No sideways scroll. No cut or badly wrapped text.

### read-1280-dark
- Same two NOTE items as read-1280-light (same layout); not counted again.
- Legibility: nothing found. Link, badge, muted labels and the stamp are readable on the dark surface; borders and the band are visible.

### read-390-light
- read-390-light: bottom action bar — one button, More, holds the two actions (Void, View journal entry). The reference bar is More + Edit, so this follows the reference's phone decision; until checkpoint 4 the bar has no direct action. — NOTE

No other finding. Figure sits under the title as the reference decides; band keeps both details on one line; the item card (name + amount, link line "Sales receipt 1009 · Nov 21, 2026", payment text) and the line card (account + amount, description) match the reference cards; totals, memo and stamp match. No sideways scroll, no cut text.

### read-390-dark
- Same NOTE as read-390-light; not counted again.
- Legibility: nothing found.

## Not judged here (per the Gates line)
- `read-void-*`, `error-*`, loading and not-found: no built shot; read against code and e2e.
- Money out in `text-danger` ("−$20.00") and long-description truncation: the seeded deposit has no such row, so the shots cannot show them.

## For gate 3
- Nothing visible in the shots.

CRITIQUE: 0 INVALID, 0 BLOCKING, 3 NOTE
