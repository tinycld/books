# Gate 2 critique — checkpoint 10 (Customize panel)

Judged: the Customize button; the inline drawer (1280) and the bottom sheet (390); the folding sections Number format and Rows; the controls in the panel; Reset to defaults; the effect of the options on the table. The Columns section is correctly absent (the Trial Balance has no column choice). The fold button is correctly absent (the Trial Balance has no section rows).

## State check

| Shot | State named | Shows | Verdict |
|---|---|---|---|
| customize-1280-light | panel open, without cents + (100) + red on | Inline drawer open at the right of the report; Number format open with Without cents, (100) and red on; Rows folded; Reset to defaults; the table stays visible with whole-dollar amounts | valid |
| customize-1280-dark | same, dark | same as light, dark palette | valid |
| customize-390-light | panel open on phone | Bottom sheet with handle, "Customize" title, close X, the same sections and controls, Reset to defaults; the report dimmed behind | valid |
| customize-390-dark | same, dark | same as light, dark palette | valid |

## Critique

Reference check (structure, hierarchy, where the detail lives): the build keeps the reference's panel structure on both sizes — title row with close button, divider, caret + section title, label-left / control-right rows, the two-option ButtonGroup under its own label, a divider between sections, outline "Reset to defaults" at the bottom. The inline drawer shares the row with the report on wide, and the report updates behind it (the amounts show the Without cents effect). The phone sheet keeps the title row, the handle, and the same control layout. Differences from the reference (Trial Balance instead of Profit and Loss, no Columns section, no Collapse all button, no business name line) all come from the spec or the seed data, not from the build.

customize-1280-light: nothing found.

customize-1280-dark: nothing found. Toggles, the selected "(100)" button, the dividers and the section titles are legible on the dark surface.

customize-390-light: nothing found.

customize-390-dark: nothing found.

Evidence note (not a build finding):

- all shots: table — the Trial Balance puts every balance on its own side, so no amount is negative and the "(100)" style and "Show negative numbers in red" have no visible effect in any shot. The screenshots demonstrate the Without cents effect only; negative style and red are covered by the e2e URL assertions (`negative=parens`, `red=1`) and not by this gate's images. — NOTE

## Verdict

No BLOCKING finding. Gate 2 passes.
