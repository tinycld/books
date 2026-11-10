# Gate 2 critique — invoice-form checkpoint 6 (PDF view, download and help)

Judged: the PDF view tab (unsaved and stale states), the Edit | PDF view tabs, at 1280 and 390, light and dark. Download PDF and the help topic have no screenshot and are not judged here.

## State check

| Shot | State named | Shows | Verdict |
|---|---|---|---|
| pdf-unsaved-1280-light | new form, PDF tab, no saved draft | New invoice · Draft · PDF view selected · "Save a draft to see the PDF" + Save draft | valid |
| pdf-unsaved-1280-dark | same | same, dark | valid |
| pdf-unsaved-390-light | same | same, phone | valid |
| pdf-unsaved-390-dark | same | same, phone dark | valid |
| pdf-stale-1280-light | saved draft with unsaved edits, PDF tab | Draft invoice · "Shows the last saved version" notice above the rendered PDF | valid |
| pdf-stale-1280-dark | same | same, dark | valid |
| pdf-stale-390-light | same | same, phone | valid |
| pdf-stale-390-dark | same | same, phone dark | valid |

0 INVALID.

## Findings

### pdf-unsaved-1280-light
nothing found. Tabs under the title, selected tab bold with accent underline, the notice text and a Save draft button centered in the body, as the reference and spec §3.7.

### pdf-unsaved-1280-dark
nothing found. Legible; the Edit tab is muted but readable.

### pdf-unsaved-390-light
nothing found. Phone keeps the header stack (title, badge, help, Balance due under the title), tabs, notice and button; action bar Cancel · Save draft · Post · More as spec §3.5.

### pdf-unsaved-390-dark
nothing found.

### pdf-stale-1280-light
- pdf-stale-1280-light: PDF viewer — the page sits inside a second rounded frame (outer `border` box at 483–1121 px, the page with its own shadow at 498–1106 px). In light mode the frame background is the same white as the page, so it reads as a white box with a white page inside and a 15 px ring of nothing. One frame (the page's shadow alone, or the frame with a `bg-surface-secondary` fill so the page separates from it) would be cleaner. — NOTE
- The PDF content matches spec §3.7: title "Draft invoice" with no number, Date and Due, Bill to, the line table, Subtotal, "Denver combined (8.71%)", Total, Balance due. The reference's stand-in placeholder is replaced by design.

### pdf-stale-1280-dark
- pdf-stale-1280-dark: PDF viewer — same double frame as light; in dark mode the frame fill is dark so the page does separate, but the two different corner treatments (rounded frame, square page) still show. — NOTE (same item as above, counted once)

### pdf-stale-390-light
nothing found. The notice and the viewer share the 16 px gutter; the page scales to the frame width and keeps the letter aspect, so the empty area below is inherent to a one-page PDF on a phone.

### pdf-stale-390-dark
nothing found.

## Seen but not this checkpoint's
- Header label "BALANCE DUE" is uppercase where the reference draws "Balance due" in sentence case. The header is checkpoint 3's; spec §7 fixes only the figure's style ("text-2xl font-semibold"), not the label's case. Not a finding of this gate.
- The action bar order Cancel · Save draft · Post · Post & new · More differs from the reference (which put Post & new before Post) but matches spec §3.5 verbatim. Not a finding.

## For gate 3
Nothing visible. (The Save draft button in the unsaved state, the stale notice's dirty detection, ⌥1/⌥2 and ⌘P are behavior; the e2e covers them.)

## Totals
CRITIQUE: 0 INVALID, 0 BLOCKING, 1 NOTE
