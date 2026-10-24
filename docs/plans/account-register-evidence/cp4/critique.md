# CP4 critique: wide table and sorting (round 2)

Previous round: 1 BLOCKING (1280 light+dark: table wider than the content area, Balance heading and cells clipped, opening-row figure clipped); 1 NOTE (back link full foreground, not muted). Both fixed; see below.

## State check
- populated-1280-light: populated (8 rows, opening-balance row, opening/ending figures). VALID.
- populated-1280-dark: same. VALID.
- populated-390-light: populated (same rows, sideways-scrolling table). VALID.
- populated-390-dark: same. VALID.

## Re-check of previous findings
- Clipping: fixed in both schemes. Balance heading reads "BALANCE" in full; every balance cell and the opening-row "$0.00" end at x=1263 (16px inside the 1280 edge), same as the header's ending-balance figure (1262).
- Alignment: heading and cell right edges match within 1px in both schemes — Debit 1027/1026, Credit 1139/1138, Balance 1263/1263. Left columns unchanged (Date 340, Ref 448, Type 536, Memo 694, Account 826).
- Back link: now rgb(100,116,139) (muted-foreground) on both schemes, the same value the reference uses; legible on the dark background and the title is now the first read.

## Findings

populated-1280-light: header, balance block — "Opening balance" is top-aligned with the "Ending balance" label, so the small $0.00 figure floats above the ending figure; the reference bottom-aligns the two blocks so the opening figure sits beside the large ending figure. Minor hierarchy difference, both read correctly. — NOTE

populated-1280-dark: header, balance block — same as light. — NOTE

populated-390-light: nothing found (header stacks; table scrolls sideways; Type cell "Journal ent… Void" truncates but phone cards replace this later; not broken).

populated-390-dark: nothing found.

## Checked and clean
- Memo one line, no wrap; Account truncates before Memo; "-Split-" and other-account names present; "Void" label muted beside the type; "Void reversal of 8" fits on one line.
- Sort arrow on Date; newest first; opening-balance row last in this order, italic muted, figure in the Balance column only.
- Dark mode: text, separators, muted Ref no./Void/opening-row text all legible; no raw-color mismatches against the reference.
