# Design critique: sales-tax-liability, checkpoint 4 (Liability report button)

Scope: the **Liability report** button in the Sales tax page header, judged against the header's existing actions. Rows and figures differ from the reference (seeded e2e book against a static fixture); they are not judged.

## populated-1280-light.png

State check: valid. Populated Sales tax page (two agencies with rates, tax groups, a default).

- populated-1280-light: header, action row — "Liability report" is the first button, to the left of the primary "Add agency". A navigation button comes before the page's primary action; after "Add group" or nearest the title would keep the reference order of the write actions. — NOTE

The button uses the same outline style, height, text size and gap as "Add group". It is on the title's baseline. Nothing else found.

## populated-1280-dark.png

State check: valid. Populated.

- Same order note as the light shot (counted one time, above).

Border and label are legible on the dark surface and match "Add group". Nothing else found.

## populated-390-light.png

State check: valid. Populated, phone layout.

- populated-390-light: header, below the title — "Liability report" is alone on its own row above the action row ("Add agency", "Add group", "Show inactive"). The header is one row taller than the reference (first card starts at about y=156 against y=112), and a lone secondary button sits above the primary action. It cannot fit on the action row at this width (the row ends at about x=323; the button is about 108 px wide), so the wrap is correct; the order (secondary above primary) is the polish point. — NOTE

Left edge aligns with the title and "Add agency". Row gap equals the gap to the card. The button is inside the viewport. Nothing else found.

## populated-390-dark.png

State check: valid. Populated, phone layout.

- Same own-row note as the light shot (counted one time, above).

Legible; matches "Add group". Nothing else found.

## Summary

The reference decided a header of title + help icon on the left and the actions on the right (1280), and title above an action row (390). The build keeps both. No spec text, design-system rule or reference decision is broken: spec §2 asks only for "a **Liability report** button in its header", and the plan says "On a phone it wraps with the header as the actions do".

## For gate 3

Nothing visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE
