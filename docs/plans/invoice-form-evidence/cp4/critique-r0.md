# Critique — invoice-form checkpoint 4 (Line kinds, bundles and keys), gate 2

Judged: the Delivers line only (bundle expansion, the percent-line target error, Add line / Add… with their keys, the one-stop row menu and row keys, the phone cards' menu). cp 3 design notes in the ledger are not repeated.

## State check

| shot | state named | shows | verdict |
|---|---|---|---|
| add-menu-1280-light/dark | Add… menu open under the grid | 3 Item lines; Add… open: Description line ⌥T, Subtotal ⌥S, Percent line ⌥5 | valid |
| add-menu-tablet-911-light/dark | same at the 640 px form | same, 640 px form | valid |
| row-menu-1280-light/dark | line 2's row menu open | menu on line 2: Insert line above, Insert line below, Move up ⌘⌥↑, Move down ⌘⌥↓, Duplicate ⌘⌥D, Remove ⌘⌥⌫ | valid |
| row-menu-tablet-911-light/dark | same at 640 px form | same | valid |
| row-menu-phone-390-light/dark | card 1's menu as a sheet | sheet "Line 1", Move up disabled (first line) | valid |
| kinds-1280-light/dark | bundle → 5 Items + Subtotal, −10 % Discount, Description line, Percent line with target error | all present; Balance due "—" (form invalid) | valid |
| kinds-tablet-911-light/dark | same at 640 px form | same | valid |
| kinds-phone-390-light/dark | same as cards | same as cards; error spans the card | valid |

0 INVALID.

## Findings

### add-menu-1280, add-menu-tablet-911
- nothing found. Keys read ⌥T / ⌥S / ⌥5 as the spec; menu placement and highlight match the reference. (Light and dark both legible.)

### row-menu-1280, row-menu-tablet-911, row-menu-phone-390
- row menu, "Insert line below" row — no key is drawn beside it; the other four actions show theirs. The reference draws `⌥↵` there (row-menu-1280 and row-menu-phone-390). — BLOCKING (spec §3.1: "Each line has one row menu button … holding Insert line above, Insert line below, Move up, Move down, Duplicate, Remove; the same actions have keys (below)"; key map: "Add item line after the focused line … ⌥↵"; spec §3.3: "each menu row showing its key through core `Menu`'s `shortcut` text"; reference row-menu-1280 shows "Insert line below ⌥↵"). If the menu row inserts a row of the focused row's kind rather than an Item line, it is still a row action with no key shown; either way the reference's decision is lost. The menu is core's (checkpoint 0 E2), so the fix may be a core `shortcut` on that row.
- row-menu-phone-390: the sheet is docked to the top of the viewport (title at y≈25, drag handle on its bottom edge) over the page header; the reference sheet rises from the bottom with the handle on top. — NOTE (no rule; core Menu-as-Sheet placement, but a bottom sheet reads as the phone pattern the rest of the app uses).

### kinds-1280, kinds-tablet-911
- Subtotal row, amount — "$533.00" is right-aligned to the row's edge (ends at x≈1214 at 1280, ≈845 at 911), ~54 px right of the Amount column where every Item and Percent figure ends (x≈1160 / ≈790); it sits under the Tax slot. The reference (filled-1280) aligns the Subtotal figure with the line amounts. — BLOCKING (spec §7 sparks: "Totals aligned under Amount: shared amount-column width constant; `tabular-nums text-right`"; ledger sparks: "totals line up under the amount column"; reference filled-1280 Subtotal row "$1,833.00" flush with "$1,350.00" above it).
- Subtotal row, label — bold "Subtotal" at the far left of the row, ~850 px from its figure at 1280; the reference places the label beside the figure (right-aligned in the Rate slot). — NOTE.
- Percent line under the Description line, Rate slot — "A percent line applies to the item or subtotal right above it" wraps to four lines in the ~90 px slot (both widths); placement under the cell is the plan's (brief Do 3), but the column cannot hold the sentence. — NOTE (spec says only "shows the inline error").
- kinds-tablet-911 (and add-menu-/row-menu-tablet-911), Description cells — a sliver of a fourth text line is visible, cut mid-glyph at the cell's bottom edge ("Wi-Fi 6E / ceiling- / mount / [clipped]", "A free first / hour to / scope the / [clipped]"). — NOTE (spec: "Description cell grows to 3 lines" — it does; the clipped peek is polish).
- kinds-tablet-911 header — "Product or service" wraps to two lines while the other headers are one; the header row's baselines differ. — NOTE.

### kinds-phone-390
- Subtotal card — reads "Subtotal" (kind label) / "Amount" (field label) / "Subtotal $533.00" (row label + figure): the word appears twice with a stray "Amount" label between. Description card — "Description" (kind label) / "Description" (field label) / the text. The reference cards show the kind label and the content only. — NOTE.
- sticky bar — a "Cancel Esc" tooltip is drawn above Cancel on the phone shot; a hover hint on a touch layout (probably the capture's mouse resting there). — NOTE.
- otherwise clean: the percent target error spans the card, cards are legible in light and dark.

## For gate 3
- none seen.

Totals: 0 INVALID, 2 BLOCKING, 7 NOTE.
