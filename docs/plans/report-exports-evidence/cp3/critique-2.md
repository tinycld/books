# Gate 2 critique, round 2: report-exports, checkpoint 3 (Export menu and downloads)

Read: all 26 built shots (captured again), 14 references that cover each state and width, the spec, the brief, the lessons, `memories-design.md`, the first critique.

Result: 0 INVALID, 0 BLOCKING, 4 NOTE.

## Fix check (first critique)

| First critique | Now |
|---|---|
| INVALID `empty-*` (4 files): ready state with `$0.00` rows | Fixed. The shots show the Journal over January 1902 with the view's empty text. |
| BLOCKING 1: Export trigger has no chevron | Fixed. Chevron-down after the label in the enabled, "Preparing…" and disabled states, light and dark. |
| BLOCKING 2: no separator before the export rows in "⋯" | Fixed. A rule shows between "Copy link" and "Download PDF" in `preparing-phone-390` and `disabled-phone-390`, light and dark. |

## State check

| Shot (light and dark) | State shown | Check |
|---|---|---|
| `populated-1280`, `populated-1024` | Profit and Loss with rows; "Export ⌄" last in the row, after "Copy link" | valid |
| `populated-390` | Same report; Export folded into "⋯" | valid |
| `long-title-1280`, `long-title-1024` | Saved copy with the long title; toolbar title cut with "…", full title in the page header; Export last | valid |
| `empty-1280` | Journal, "No rows for January 1 – January 31, 1902", "Show this fiscal year"; Export enabled | valid |
| `empty-390` | Same empty state; Export folded into "⋯" | valid |
| `preparing-1280` | Export disabled, reads "Preparing… ⌄"; status slot reads "Preparing…" | valid |
| `preparing-phone-390` | "⋯" sheet open; three Download rows disabled | valid |
| `disabled-1280` | "This report cannot run"; Export disabled | valid |
| `disabled-phone-390` | "⋯" sheet open over the invalid state; three Download rows disabled | valid |
| `download-failed-1280`, `download-failed-phone-390` | Error toast "Could not create the file" with the 5,000-row sentence; rows unchanged; Export enabled (1280) | valid |

## Findings

### populated-1280, populated-1024, populated-390 (light and dark)

Nothing found.

### long-title-1280, long-title-1024 (light and dark)

- `long-title-1280-light`, `long-title-1024-light` (and dark): toolbar, "Save as…" — the button still has the green tint and green text of a hover or focus left by the capture's Save as step. The shot does not show the rest state — NOTE (carried from round 1; capture, not build).
- `long-title-1280-light`, `long-title-1024-light` (and dark): title row — the cut title ends about 5 px (1280) and 8 px (1024) before "Collapse all"; the reference keeps about 14 px (`long-title-1024-light.png`) — NOTE (carried from round 1).

### empty-1280, empty-390 (light and dark)

- `empty-1280-light`, `empty-390-light` (and dark): Period chip — a rectangular focus ring is drawn inside the pill and touches the chip's text. It is the focus left by the capture's period step. The ring's shape is the chip's own style, not this checkpoint's code — NOTE (recapture with the focus moved away; the ring shape is a core item outside this checkpoint).

Nothing else found. Hierarchy and the empty text agree with the reference `empty-*`.

### preparing-1280 (light and dark)

- `preparing-1280-light` (and dark): top right — "Preparing…" shows two times, about 45 px apart (status slot and button label) — NOTE (carried from round 1; plan D3 puts the status slot at every width).

### preparing-phone-390, disabled-1280, disabled-phone-390, download-failed-1280, download-failed-phone-390 (light and dark)

Nothing found. Disabled rows and the disabled trigger stay legible in dark. The toast position agrees with the reference.

## Not a finding (later checkpoint, real data, or outside this checkpoint)

- No "Email report…" row and no rule above it: checkpoint 4.
- No "Share" on the shipped report, the org name, the figures, the sort marks, the missing package sidebar: real data and the shipping route.
- `empty-*` shows the Journal, the reference shows Profit and Loss: Books' statement layout draws zero rows, so the Journal is the report that reaches the empty text.
- `disabled-*`: "This report cannot run" with no Retry in place of the reference's "Could not load this report" + Retry: another state of the spec's disabled list.
- `download-failed-phone-390`: the report on screen is the long-title saved copy, not "Profit and Loss". The state is correct; the long page title wraps to three lines without a defect.
- Coverage: no built shot shows the status slot `report-preparing` at 390 with the sheet closed (the sheet covers the header). D3's phone path has no appearance evidence.

## For gate 3

None.
