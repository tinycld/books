# Gate 2 critique: report-exports, checkpoint 3 (Export menu and downloads)

Read: all 26 built shots, the 26 references of the same names, the spec, the brief, the lessons, `memories-design.md`, both capture manifests.

Result: 4 INVALID, 2 BLOCKING, 3 NOTE.

## State check

| Shot (light and dark) | State shown | Check |
|---|---|---|
| `populated-1280`, `populated-1024`, `populated-390` | Profit and Loss with rows; Export last in the row (1280, 1024), folded into "⋯" (390) | valid |
| `long-title-1280`, `long-title-1024` | Saved copy with the long title; title cut with "…" in the toolbar row, full title in the page header | valid |
| `empty-1280`, `empty-390` | Not the empty state. See below. | INVALID (4 files) |
| `preparing-1280` | Export button disabled, reads "Preparing…"; status slot reads "Preparing…" | valid |
| `preparing-phone-390` | "⋯" sheet open; three Download rows disabled | valid |
| `disabled-1280` | Invalid state ("This report cannot run"); Export disabled | valid (the reference shows the error state; the two are both in the spec's disabled list) |
| `disabled-phone-390` | "⋯" sheet open over the invalid state; three Download rows disabled | valid |
| `download-failed-1280`, `download-failed-phone-390` | Error toast "Could not create the file" with the 5,000-row sentence; report unchanged; Export enabled | valid |

### INVALID: `empty-1280-light`, `empty-1280-dark`, `empty-390-light`, `empty-390-dark`

The shots show a statement with section rows and `$0.00` totals (Total Income, Gross profit, …) and the "Collapse all" button. The view is in its ready state with rows. The reference `empty-*` shows the empty state: the text "No rows for January 1 – November 9, 2026", the button "Show this fiscal year", and no "Collapse all".

I read the driver's note (Books' statement layout draws zero rows). It does not change the check: no built shot shows Export beside the view's empty text, which is the state the spec names ("An empty report can be exported") and the reference drew. To make the shots valid, capture a shipped report that has no statement layout (for example the General Ledger or the Journal) over the 1902 period, so the empty text shows.

Not critiqued. For the driver's decision only: the part of this checkpoint that these shots do show (Export enabled, last in the row at 1280, folded at 390) has no visible defect.

## Findings

### populated-1280, populated-1024, long-title-1280, long-title-1024, preparing-1280, disabled-1280, download-failed-1280 (light and dark)

- `populated-1280-light` (and each shot above): toolbar, Export button — the button has no chevron. It looks the same as "Copy link" and "Save as…", which act at once; nothing shows that it opens a menu — BLOCKING (reference decision: every reference shot that shows the button draws it as "Export ⌄", with a chevron-down after the label, in the enabled state `populated-1280-light.png`, the busy state `preparing-1280-light.png` "Preparing… ⌄" and the disabled state `disabled-1280-light.png`).

### preparing-phone-390, disabled-phone-390 (light and dark)

- `preparing-phone-390-light`, `disabled-phone-390-light` (and dark): "⋯" sheet, between "Copy link" and "Download PDF" — no separator. The three file rows run on from the toolbar's own actions as one flat list — BLOCKING (reference decision: `preparing-phone-390-light.png` and `disabled-phone-390-light.png` draw a rule between "Copy link" and "Download PDF", so the export rows are a group of their own in "⋯". This is not the separator of checkpoint 4, which is the one above "Email report…").

### preparing-1280 (light and dark)

- `preparing-1280-light`: top right — "Preparing…" shows two times, 45 px apart: the status slot in the back-link row and the button label below it — NOTE (plan D3 puts the status slot at every width; at a width where the button is in the row the second text adds nothing a sighted reader needs).

### long-title-1280, long-title-1024 (light and dark)

- `long-title-1280-light`, `long-title-1024-light`: toolbar, "Save as…" — the button has a green tint and green text. It is the hover or focus left by the capture's Save as step, not a state of the build — NOTE (recapture with the pointer and focus moved away, so the shot shows the rest state).
- `long-title-1024-light`: title row — the cut title "Profit and Loss by Mon…" ends about 6 px before "Collapse all"; at 1280 the gap is about 11 px and the reference keeps about 12 px — NOTE.

### populated-390, download-failed-1280, download-failed-phone-390, disabled-1280, disabled-phone-390

Nothing more found. The toast position (over the table at 1280, over the title row at 390) is the same as in the reference.

## Not a finding (later checkpoint, real data, or outside this checkpoint)

- No "Email report…" row and no rule above it: checkpoint 4.
- No "Share" button on the shipped report, the org name, the figures, the sort marks in the column headings, the missing package sidebar: real data and the shipping route.
- `disabled-*`: "This report cannot run" with no Retry in place of the reference's "Could not load this report" + Retry: another state of the spec's disabled list.
- Coverage: no built shot shows the status slot `report-preparing` at 390 with the sheet closed (in `preparing-phone-390` the sheet covers the header). D3's phone path has no appearance evidence.
- Outside this checkpoint, seen in the invalid `empty-*` shots: the focus ring on the Period chip is a rectangle inside a pill and touches the chip's text.

## For gate 3

- `empty-*`: the chip reads "Rows: Non-zero" and the statement still lists sections and totals of `$0.00`. Not this checkpoint's code (Books' layout); named only because it is visible.
