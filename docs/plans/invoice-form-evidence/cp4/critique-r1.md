# Critique — invoice-form checkpoint 4 (Line kinds, bundles and keys), gate 2, round 1 (after fix round 1)

Judged: the Delivers line only. Round-0 critique: `critique-r0.md`. This round verifies its BLOCKING 2, says whether BLOCKING 1 is still present, and reports any new finding the fix caused.

## State check

| shot | state named | shows | verdict |
|---|---|---|---|
| kinds-1280-light/dark | bundle → 5 Items + Subtotal, −10 % Discount, Description line, Percent line with target error | all present; Balance due "—" (form invalid) | valid |
| kinds-tablet-911-light/dark | same at the 640 px form | same | valid |
| kinds-phone-390-light/dark | same as cards | same as cards; error spans the card | valid |
| add-menu-1280-light/dark | Add… menu open under the grid | 3 Item lines; Add… open: Description line ⌥T, Subtotal ⌥S, Percent line ⌥5 | valid |
| add-menu-tablet-911-light/dark | same at 640 px form | same | valid |
| row-menu-1280-light/dark | line 2's row menu open | menu on line 2: Insert line above, Insert line below, Move up ⌘⌥↑, Move down ⌘⌥↓, Duplicate ⌘⌥D, Remove ⌘⌥⌫ | valid |
| row-menu-tablet-911-light/dark | same at 640 px form | same | valid |
| row-menu-phone-390-light/dark | card 1's menu as a sheet | sheet "Line 1", Move up disabled (first line) | valid |

0 INVALID.

## Round-0 BLOCKING 2 — verified fixed

- kinds-1280 (light and dark): the Subtotal figure "$533.00" now ends at x≈1160, flush with "$189.00", "$17.50", "$34.00", "$150.00", "$142.50" and "-$53.30" above and below it; the Tax slot of the row is empty; the row menu dots sit at x≈1242 like every other row.
- kinds-tablet-911 (light and dark): "$533.00" ends at x≈791, flush with the Item and Percent amounts (x≈790).
- The bold "Subtotal" label now sits right-aligned beside the figure (ending at the Rate slot's right edge, x≈1041 / ≈671), which is the reference's placement (filled-1280). The round-0 NOTE about the far-left label is resolved by the same fix.
- No new finding caused by the fix: the row's height, divider, label weight and figure size match the neighbouring rows in both schemes and both widths.

## Round-0 BLOCKING 1 — still present

- row-menu-1280, row-menu-tablet-911, row-menu-phone-390 (light and dark): the "Insert line below" row still shows no key; the other four keyed actions show theirs. The reference draws `⌥↵` there (row-menu-1280, row-menu-phone-390). — BLOCKING (spec §3.1: "Each line has one row menu button … holding Insert line above, Insert line below, Move up, Move down, Duplicate, Remove; the same actions have keys (below)"; key map: "Add item line after the focused line … ⌥↵"; spec §3.3: "each menu row showing its key through core `Menu`'s `shortcut` text"). Needs the core change the driver named; not fixed in this round.

## Findings per screenshot

### kinds-1280
- nothing new. Round-0 NOTE still present: Percent line under the Description line, Rate slot — "A percent line applies to the item or subtotal right above it" wraps to four lines in the ~90 px slot. — NOTE.

### kinds-tablet-911
- nothing new. Round-0 NOTEs still present: Description cells show a clipped sliver of a fourth line ("Wi-Fi 6E / ceiling- / mount / [clipped]") — NOTE; header "Product or service" wraps to two lines while the other headers are one — NOTE; the percent target error wraps to four lines — NOTE.

### kinds-phone-390
- nothing new. Round-0 NOTEs still present: Subtotal card reads "Subtotal" (kind) / "Amount" (field) / "Subtotal $533.00"; Description card reads "Description" / "Description" / text — NOTE; a "Cancel Esc" tooltip is drawn above Cancel on a touch layout — NOTE.

### add-menu-1280, add-menu-tablet-911
- nothing found.

### row-menu-1280, row-menu-tablet-911
- "Insert line below" without a key — BLOCKING (see above; still present).

### row-menu-phone-390
- "Insert line below" without a key — BLOCKING (see above; still present).
- The sheet is still docked to the top of the viewport (title at y≈25, drag handle on its bottom edge) over the page header; the reference sheet rises from the bottom with the handle on top. — NOTE (no rule; core Menu-as-Sheet placement).

## For gate 3
- none seen.

Totals: 0 INVALID, 1 BLOCKING (round-0 BLOCKING 1, unchanged, awaits the core change), 7 NOTE (all carried from round 0; the Subtotal-label NOTE is resolved). Round-0 BLOCKING 2 is fixed with no new finding.
