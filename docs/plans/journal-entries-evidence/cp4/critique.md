# Checkpoint 4 gate 2 critique (first pass)

State check: posted-1280-light, posted-1280-dark, posted-390-light, posted-390-dark, void-1280-light, void-390-light all VALID (populated: title, badge, total, lines, totals strip; not loading, not not-found).
Shots are seeded entries JE-10 (posted) and JE-13 (void), found by pressing the row with the memo text (scratch capture spec extended with `pressText` and `afterReady`).

Measurements (1280, posted): DEBIT heading right edge 887 = debit cell right edge 887; CREDIT heading right edge 1011 = credit cell right edge 1011 (0 px). Heading-to-memo gap 8 px (reference 8 px). Header total right edge 1264 = totals-strip "In balance" right edge 1264. Badge sits 8 px right of title, vertically centered on title; same as reference. 390: badge left 16, total right edge 373 (reference 373); strip values and "In balance" right edge 373.

## Findings
- posted/void-1280: line table rows, header rule and row borders run full-bleed (x 324 to 1280). Reference insets the table to the page gutter (x 340 to 1264), aligned with the header total. Heading and cell alignment is correct, only the rules differ — NOTE.
- posted/void-390: "Dr"/"Cr" marker is small and muted; reference marker is bold and same size as the amount. Amount right edges differ by 4 to 5 px between a Dr row (352) and a Cr row (357) because the markers have different widths; reference has the same trait. Deliberate difference judged acceptable — NOTE.
- void-1280/390: "Reversed by JE-13" is a standalone link row; reference shows a labeled detail ("Reversed by" label over the link, in the detail grid). Build is less consistent with the other labeled details and the label is part of the link text. Judged: not fine as-is for design parity — NOTE (not blocking; it is readable and tappable). Suggest a labeled detail cell.
- void shots: the entry is JE-13 and the link text is also "Reversed by JE-13". This is seed data with duplicate numbers (server reversal.go:201, same as cp3), not a defect — NOTE.
- linked-entry links use router.replace: not visible in a shot. Back goes to the list in one step instead of to the previous entry. Acceptable for a read-only chain — NOTE.
- posted/void-390: the New FAB (cp2) floats over the content area above the totals strip; reference has none. Covers no content in these shots — NOTE.
- All shots: no action bar (Void/Reverse/Edit, More/Edit); reference shows it. Out of scope for this checkpoint (later checkpoint) — NOTE.
- Line memo column and 390 line sub-memo are not exercised: seed lines have no memo, so the Memo heading shows with an empty column. Cannot judge — NOTE.
- Light/dark: dark tokens match the reference (backgrounds, badge, text); no raw-color artifacts.

No BLOCKING findings.
