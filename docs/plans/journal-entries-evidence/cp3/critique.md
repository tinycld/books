# Checkpoint 3 gate 2 critique (Fable)

State check: list-1280-light, list-1280-dark, list-390-light, list-390-dark all VALID (populated).

## Findings (first pass)
- list-1280-light/dark: Status and Total headings sit 8 px off their cells (STATUS 1043 vs badges 1050; TOTAL right edge 1254 vs amounts 1262) — BLOCKING (spec Wide: "the header is inside the scroller and sticky (shared cell style constants)"; plan Do 3: "Cells use ENTRY_COLUMNS for both heading and rows"). Fixed: the heading row's own scrollbar-gutter reserve removed.
- list-1280: No. column mixes bare register numbers with JE- numbers (seed data) — NOTE.
- list-390: cards are a uniform 96 px tall, blank band under three-line cards — NOTE.
- list-390: right column puts status badge on top and Total at the bottom; reference has Total on top. Spec "Total under the memo on the right" supports the build — NOTE.
- list-390: the New FAB covers the Total of the card under it — NOTE.

## Second pass (fresh Fable critic, after first fix)
Cause found: the zero-width trailing spacer in the heading row still added the row's gap-2 (8 px), shifting Status and Total. Fixed: spacer rendered only when a row menu exists. Same pass raised a NOTE: a reversal card with a two-line memo would clip "Reverses JE-n" in the fixed 96 px card; fixed: memo is one line on a reversal card.
Remaining NOTEs: cards put badge on top and Total at the bottom (spec "Total under the memo on the right"); FAB covers the Total of the card under it (checkpoint 2 FAB).

## Third pass (fresh Fable critic, after pill fix)
State check: all four shots VALID. Measured: 1280 pills hug text (Posted 57 px, Void 43, Draft 47), STATUS heading over the cell (1 px), TOTAL heading right edge equals every total (0 px); 390 badge and total share right edge x 373.
- All four shots: draft rows and cards show "$0.00". The list reads `entry.total`; the server writes `total` only on post (server/posting.go:95) and lists it as server-owned (server/entries.go:83). Reference shows a draft with its amount; spec has a Total column — BLOCKING.
  - Decision (user): option (b). The server stamps `total` on draft line writes, so the list stays one query. Until cp5 the seed writes `total` for drafts. Change to server/entries.go (total no longer post-only) is user-approved; recorded in the ledger as out-of-plan.
- list-390: badge on top, total at bottom (spec "Total under the memo on the right"); FAB covers the last card's total (cp2) — NOTE.
- Duplicate numbers (JE-13 twice, JE-9 three times) are correct server behavior (reversal.go:201) — not a defect.
