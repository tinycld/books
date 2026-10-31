# Checkpoint 11 — gate 2 design critique

Judged: the Delivers line (the row menu on rows and cards, Make inactive / Make active, the Delete product or service dialog with the server's refusal, the list and panel checks at wide and phone sizes) and the layout points of Decisions "Layout is the gate 2 critique's" at 1280, 390, 1600 and, for the narrow list column, 1360. The help topic has no screenshot; it is read against the spec at the end.

Method: every built PNG viewed in light and dark; each pair pixel-diffed against its reference (Pillow `ImageChops.difference`); `panel-narrow-1360-*` (no reference) measured by pixel scan.

## State check

| Shot | Shows the named state? |
|---|---|
| row-menu-1280-light / dark | Yes. Writer list at 1280, the Cat6 patch cable row's menu open: Edit, Make inactive, Delete. |
| delete-refused-1280-light / dark | Yes. The Delete product or service dialog for Cat6 patch cable after Delete was refused: name, "This cannot be undone.", the 2-bundles refusal in red, Cancel and Delete; the list behind is unchanged. |
| delete-refused-phone-390-light / dark | Yes. Same dialog as a bottom sheet at 390 over the cards, above the tab bar; the refusal line present. |
| list-1280-light / dark | Yes. Populated writer list, a kebab in every row. |
| list-390-light / dark | Yes. Populated phone cards, a kebab on every card, two-line title, FAB, tab bar. |
| panel-1600-light / dark | Yes. 1600 x 1300, Design software license (annual) open in the 480 px panel, its row marked, kebabs in the list beside the panel. |
| panel-narrow-1360-light / dark | Yes. 1360 x 800, the same product open; the list column is 324 to 880 px (556 px). |

No shot is INVALID.

## Pixel diff against the references

| Pair | Differing pixels | Where |
|---|---|---|
| row-menu-1280 light / dark | 0 / 0 | identical |
| delete-refused-1280 light / dark | 0 / 0 | identical |
| delete-refused-phone-390 light / dark | 1873 / 1875 | x 309–370, y 745–777: the Delete button's fill only. Built light (228,51,90) vs reference (225,29,72); built dark (227,104,124) vs reference (157,76,96). This is the button's hover tint: the capture clicks `delete-product-confirm`, and in the bottom-anchored sheet the button stays under the pointer when the refusal line grows the body, whereas the centred 1280 dialog re-centres and the button moves out from under it. Not a design difference. |
| list-1280 light / dark | 0 / 0 | identical |
| list-390 light / dark | 0 / 0 | identical |
| panel-1600 light / dark | 0 / 0 | identical |

## Measurements, panel-narrow-1360-light

- List column 324 to 880 px = 556 px; panel 880 to 1360 = 480 px (spec: "a 480 px column at the right").
- Name column 340 to 488 = 148 px (Decisions `minWidth: 148`); the long names end in an ellipsis at x 466–474, before the Type column; the SKU line below stays whole; no name is blank.
- Type header and cells start at 488.
- SALES PRICE header right edge 707; every price cell right edge 707 (0 px).
- COST header right edge 819; every cost cell right edge 819 (0 px).
- Kebab dots at x 852–855, whole, in all rows; the table's 4 px overflow (560 − 556) falls in the row's `pr-2` padding under the panel's left border. No scrollbar is drawn (headless macOS overlay scrollbars), so the sideways scroll itself is not visible; what is visible is that no column shrank or collapsed to absorb the 4 px.
- Open row background (240,253,250) = `bg-accent`, as at 1600.

## Findings per screenshot

**row-menu-1280-light:** nothing found. The kebab is a separate 44 px cell after Cost (spec: "The menu button is a sibling of the row's open button"); the menu anchors under it, right-aligned to the kebab, with Edit, Make inactive and Delete in that order (spec: "Edit, Make inactive or Make active, Delete"); Delete in the danger colour, the first item carrying the focus highlight; the rows behind stay legible and the menu does not cover its own row.

**row-menu-1280-dark:** nothing found. Menu surface, border and the Delete red read on the dark list.

**delete-refused-1280-light:** nothing found. Title "Delete product or service"; lines in the spec's order and tones: name plain, "This cannot be undone." muted, the refusal "This item is in 2 bundles. Take it out of them first, or make it inactive." in the danger colour; no bundle line (Cat6 is a Non-inventory item); Cancel then a solid red Delete; the dialog stays open and the row behind is unchanged (spec: "the refusal shows in the dialog").

**delete-refused-1280-dark:** nothing found. The refusal red and the muted explanation stay legible on the dark dialog.

**delete-refused-phone-390-light:** Delete button — drawn in its hover tint because the pointer rests on it after the capture's click; same layout as the reference otherwise — NOTE (capture artefact, not a build defect). Sheet: grab handle, title with ✕, the three lines wrapping cleanly at 390, Cancel and Delete above the tab bar. The search placeholder clip is cp6's NOTE and is not repeated.

**delete-refused-phone-390-dark:** Delete button — the hover tint jumps from the resting (157,76,96) to (227,104,124), a far larger step than in light mode ((225,29,72) to (228,51,90)); the resting dark destructive button looks like the danger colour at about two-thirds opacity — NOTE (core `Button` dark destructive styling, shared by every delete dialog; no products rule). Otherwise as light.

**list-1280-light:** nothing found. A kebab in every row, vertically centred on the row, the same x in every row (1250), inside the Cost column's right padding; the money columns, header texts, SKU line and ellipses are as cp6 measured (this pair is pixel-identical to the reference).

**list-1280-dark:** nothing found. The kebab's muted dots read on the dark rows.

**list-390-light:** FAB — the round + button sits over the menu column and covers the kebab of whichever card scrolls under it (here "Logo and brand design package"); the card's menu is reachable only after scrolling that card above or below the FAB — NOTE (the reference shows the same; spec puts the FAB on the list with no rule on the menu column; a bottom inset of the FAB's height on the card list keeps the last card's menu reachable; check that it exists). Cards: name, "Type · price", SKU, kebab vertically centred on the card and clear of the text; two-line title beside the New button.

**list-390-dark:** same FAB NOTE as light; otherwise nothing found.

**panel-1600-light:** nothing found. The kebabs stay visible in the list column beside the panel (test 8's "`product-menu-<id>` is visible beside the panel"); the open row carries `bg-accent`; the panel form is one column at 480 px, unchanged from cp9.

**panel-1600-dark:** nothing found.

**panel-narrow-1360-light:** nothing found. At the 556 px column every column holds its Decisions width (148 / 120 / 112 / 112 / 44), both money columns stay right-aligned under their headers at 0 px, Name truncates with an ellipsis and never blanks, the kebab is whole, the open row is marked, and the panel is 480 px. The sideways scrollbar is not drawn under overlay scrollbars; nothing in the shot suggests the table shrank instead of overflowing. The sticky header is not observable in a static capture.

**panel-narrow-1360-dark:** nothing found. Header, muted SKUs, ellipses and kebabs legible; the open row's accent tint visible.

## Help topic (read, not captured)

`help/products-services.md`: frontmatter title and summary present; the three types each in one sentence with their use; create (New product or service, New → Product or service, the phone's round + button, choose a type, Save and new); unique names with case ignored; Sales price and Income account; I purchase this from a vendor with Purchase description, Cost and Expense account; bundles (Add row, Qty, move up and down, no bundle in a bundle, no price or accounts of its own); search by name, SKU or sales description; Make inactive, Make active, Show inactive; delete "cannot be undone", the item-on-a-bundle refusal, the unsaved-changes line; custom fields in Settings → Forms; beside the list on a very wide window, its own page otherwise; All lists back to Lists. No `Ctrl` or `Alt`. `help/navigating-books.md` links `help://books:products-services`. Matches the spec's list. Not judged visually.

## Summary

- BLOCKING: none.
- NOTE: (1) the phone delete sheet's Delete button is captured in its hover tint (capture artefact); (2) the dark destructive button's resting/hover contrast is a large step (core `Button`); (3) the phone FAB covers the row menu of the card under it; confirm a bottom inset on the card list.

Decisions layout points: money right-aligned within 1 px — pass at 1280 (identical to reference) and 1360 (0 px both columns); header column texts NAME, TYPE, SALES PRICE, COST — pass; 560 px minimum in a narrower column — pass at 556 px (no column collapsed; the scrollbar itself is not drawn by headless macOS); Name's ellipsis — pass at 1280, 1360 and 1600; two-line phone title — pass; one-column 480 px panel — pass at 1360 and 1600. Every built shot shows its named state and every reference pair is pixel-identical outside the phone hover tint. Gate 2 passes for checkpoint 11.
