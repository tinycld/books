# cp2 gate-2 critique — Search, filters and date order

Delivers judged: the toolbar (search, Dates, Type, Clear filters) on the three transaction tabs, the filtered empty state, the newest/oldest toggle on the Date header and the phone bar. Check boxes, selection bar, drawer and focus stripe are later checkpoints and are not judged.

## State check

| shot | state shown | verdict |
|---|---|---|
| review-390-light / -dark | toolbar (search, All dates, All transactions), phone bar "Newest first", newest-first cards | valid |
| review-1280-light / -dark | toolbar row, header "DATE ↓", newest-first rows | valid |
| filtered-390-light / -dark | search "office depot", Type "Money out", "Clear filters" link, one matching card | valid |
| filtered-1280-light / -dark | same filters, one matching row, "Clear filters" ends the toolbar row | valid |
| filtered-empty-390-light / -dark | search "zelle to marco", "Clear filters" link, "No transactions match these filters." + outline "Clear filters" button | valid |
| filtered-empty-1280-light / -dark | same | valid |
| oldest-390-light / -dark | phone bar "Oldest first", cards Oct 1 → Oct 2 → Oct 6 | valid |
| oldest-1280-light / -dark | header "DATE ↑", rows Oct 1 → Oct 2 → Oct 6 | valid |

0 INVALID.

## Findings

### review-390-light, review-390-dark, filtered-390-light, filtered-390-dark, filtered-empty-390-light, filtered-empty-390-dark, oldest-390-light, oldest-390-dark
- Toolbar (phone) — the toolbar is three rows: the search field, then "All dates" alone, then "All transactions" (with "Clear filters" beside it when set). Dates and Type are each drawn as a 160-wide, 44-high select box, so the two do not fit side by side in the 322 px body and the second wraps. The reference puts both menus on the second row as compact chips. — BLOCKING (spec §3 The toolbar: "One row on wide, two rows on a phone (search on the first)")
- Phone bar — "Newest first" / "Oldest first" is text only; the reference draws the direction arrow (↓ / ↑) after the text, as the wide Date header does. The words carry the state, so nothing is lost; the plan's Do 7 names text only for the bar variant. — NOTE

### review-1280-light, review-1280-dark, filtered-1280-light, filtered-1280-dark, filtered-empty-1280-light, filtered-empty-1280-dark, oldest-1280-light, oldest-1280-dark
- Toolbar — Dates and Type are 44-high, 160-wide select-style boxes with the chevron at the far right edge, the same height as the search field; the reference draws them as compact chips (about 32 high, sized to the label, chevron next to the text). The row reads heavier than the reference and than the register's toolbar chips. No rule names the size; taste. (The same box size is what forces the phone wrap above, so one fix may cover both.) — NOTE
- Tab bar to toolbar gap — the rule under the tabs sits at y≈486 and the search field starts at y≈514 (≈28 px); the reference has 16 (rule 424, field 440). On the phone the same: rule ≈290, field ≈319 (≈29) against the reference's 16. This is the open cp1 Design note ("check the bar-to-toolbar gap is 16"); it is still ~28. — NOTE

### Clean
- filtered-empty (both widths, both themes): the sentence is centered `text-muted-foreground`, the "Clear filters" action is an outline core Button, the toolbar stays above it with the "Clear filters" link ending the row; legible in light and dark.
- oldest (both widths): the header arrow flips to ↑, the order is ascending by date; rows and cards read cleanly.
- "Clear filters" link: `text-primary` teal is legible in both themes, vertically centered against the 44-high controls.
- Dark mode: no contrast problem seen in any shot.

## Open cp1 Design note checked here
- "When checkpoint 2's toolbar lands, check the bar-to-toolbar gap is 16": not met, ~28 px at both widths (NOTE above).

## For gate 3
- Nothing seen. (The seed shows one "OFFICE DEPOT #2231" row under "office depot" + "Money out" and none under "zelle to marco", as the brief predicts.)

CRITIQUE: 0 INVALID, 1 BLOCKING, 3 NOTE
