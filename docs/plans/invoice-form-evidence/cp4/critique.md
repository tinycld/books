# Critique — invoice-form checkpoint 4 (Line kinds, bundles and keys), gate 2, round 2 (after fix round 2)

Judged: the Delivers line only. Round-1 critique: `critique-r1.md`. This round verifies its open BLOCKING 1 (row menu "Insert line below" without ⌥↵) on every row-menu shot and reports any new appearance issue in those shots. The fix (core table built-in `insertShortcuts`, Books `insertShortcuts: { below: 'Alt+Enter' }` on the `lines` built-in) changes only the row menu's text; the other cp4 shots are not re-judged. Round-1 NOTEs that are unchanged are not re-listed.

## State check

| shot | state named | shows | verdict |
|---|---|---|---|
| row-menu-1280-light | line 2's row menu open, wide grid | menu on line 2 (Initial consultation): Insert line above, Insert line below ⌥↵, Move up ⌘⌥↑, Move down ⌘⌥↓, Duplicate ⌘⌥D, Remove ⌘⌥⌫ | valid |
| row-menu-1280-dark | same, dark | same | valid |
| row-menu-tablet-911-light | same at the 640 px form | same menu on line 2 | valid |
| row-menu-tablet-911-dark | same, dark | same | valid |
| row-menu-phone-390-light | card 1's menu as a sheet | sheet "Line 1": Insert line above, Insert line below ⌥↵, Move up ⌘⌥↑ (disabled: first line), Move down ⌘⌥↓, Duplicate ⌘⌥D, Remove ⌘⌥⌫ | valid |
| row-menu-phone-390-dark | same, dark | same | valid |

0 INVALID.

## Round-1 BLOCKING 1 — verified fixed

- row-menu-1280 (light and dark): "Insert line below" now shows `⌥↵` at the right edge of the row (x≈1231), in the same column and the same muted weight as `⌘⌥↑`, `⌘⌥↓`, `⌘⌥D`, `⌘⌥⌫` below it. "Insert line above" has no key, which matches the key map (no key is assigned to it).
- row-menu-tablet-911 (light and dark): `⌥↵` at x≈862, aligned with the other keys.
- row-menu-phone-390 (light and dark): `⌥↵` at the sheet's right edge (x≈358), aligned with the other keys; the reference phone sheet draws the same glyphs in the same place.
- Glyph form matches the reference (`⌥↵`, not `Alt+Enter`); legible in both schemes.

## Findings per screenshot

### row-menu-1280 (light, dark)
- nothing new.

### row-menu-tablet-911 (light, dark)
- nothing new.

### row-menu-phone-390 (light, dark)
- nothing new. (The round-1 NOTE about the sheet docked to the top of the viewport is unchanged and not re-listed.)

## For gate 3
- none seen.

Totals: 0 INVALID, 0 BLOCKING, 0 NOTE (new). Round-1 BLOCKING 1 is fixed on all six row-menu shots with no new finding.
