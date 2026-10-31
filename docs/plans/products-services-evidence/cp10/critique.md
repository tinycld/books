# Gate 2 critique — checkpoint 10 (Bundle items save and reorder)

Scope: the Delivers line only (a bundle's rows load into the form in position order; the save, refusal and partial-create paths are behavior, covered by the e2e and unit tests, not visible in a static capture). Row actions, Qty width and the card layout come from core `TableField` (decisions.md, driver decision 2: both columns `flex-1`, no Books override).

Measured against the references: `bundle-1100-light` and `bundle-1100-dark` are byte-identical to the reference files. `bundle-phone-390-light` and `-dark` differ from the reference by less than 0.04 pixel-equivalents (ImageMagick `compare -metric AE`), which is sub-pixel anti-aliasing; no visible change.

Seeded data check: the rows show in fixture position order (`BUNDLE_ITEMS` positions 0 to 3: Wireless access point ×2, Cat6 patch cable ×12, Cable ties ×1, On-site network troubleshooting ×1), so `useBundleItems` orders by `position` and the quantities map through `BUNDLE_ITEM_MAPPER` as the spec says.

## bundle-1100-light.png

State check: VALID. Edit of the seeded bundle `Small office network install, up to ten workstations` at 1100 px, light scheme, title "Edit bundle", Type shown as text "Bundle" with "A bundle keeps its type.", Name + SKU side by side, four item rows in the grid layout, "Add row", Cancel/Save footer.

Findings:
- bundle-1100-light: Bundle items rows, the ↑ ↓ trash group — the row actions sit top-aligned (icon centre ≈ y 542) while the row's select and Qty input are 44 px tall (centre ≈ y 551); the actions read as floating above the row rather than belonging to it — NOTE (core `TableField`; the reference shows the same)
- bundle-1100-light: Bundle items rows, Qty stepper — the "+" button ends ≈ 8 px before the ↑ arrow, so the stepper and the row actions read as one five-button cluster — NOTE (core `TableField`; the reference shows the same)
- bundle-1100-light: Bundle items header — "Product or service *" starts 4 px right of the select below it and "Qty *" starts 3 px right of the − button; the required mark is a spaced ASCII asterisk, while the field labels above ("Type", "Name") use the red superscript mark — NOTE (core `TableField` head style)
- Everything else: nothing found. Hierarchy (back link → title → fields → table → footer) is clear, label/input spacing is consistent with the Type/Name/SKU cells, the inactive row shows "Cable ties, 100 pack (inactive)" in muted text as the spec requires, the first row's ↑ and the last row's ↓ are disabled, and the long fourth product name truncates with an ellipsis inside its trigger.

## bundle-1100-dark.png

State check: VALID. Same state as the light capture, dark scheme.

Findings:
- Same three NOTEs as the light capture (core `TableField` row-action alignment, stepper/action gap, head label inset and asterisk style).
- Legibility: nothing found. Input borders, the table row separators, the muted "(inactive)" text and the disabled ↑/↓ arrows all remain distinguishable on the dark background.

## bundle-phone-390-light.png

State check: VALID. The same bundle opened from the product card at 390 px, light scheme, one-column form (Name above SKU), the items as cards (`form-table-items-cards`), "Add row", Cancel/Save footer above the mobile tab bar.

Findings:
- nothing found. The cards carry label → select → Qty label → stepper → actions in a consistent order; the stepper fills the card width; the ↑ ↓ trash group is right-aligned on its own line, which reads correctly at this width; the long fourth name truncates with an ellipsis; the "(inactive)" suffix is present. The one-column layout matches the spec ("the 480 px panel and phones show one column").

## bundle-phone-390-dark.png

State check: VALID. Same state as the phone light capture, dark scheme.

Findings:
- nothing found. The card border is faint but visible, and every control stays legible.

## Summary

BLOCKING: none.
NOTE: three, all in the desktop grid, all from core `TableField` and identical in the approved reference (row actions top-aligned against 44 px inputs; "+" stepper abutting the row actions; column-head inset and asterisk style). None is a Books change; if wanted, they are a core `TableField` follow-up.

Gate 2 verdict for checkpoint 10: PASS.
