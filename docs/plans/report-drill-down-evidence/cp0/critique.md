# Design critique: report-drill-down, checkpoint 0, gate 2

Scope: the states spark 1 changes (drilled figures at rest; the open-figure mark). The panel's own chrome is a scratch stand-in and is not judged.

Method: screenshots only. No source file and no token value was read, so the cause named under the BLOCKING findings is an inference from the pixels.

## State check

| Shot | Shows its named state? |
|---|---|
| statement-1280-light | Yes. Profit and Loss, populated, no panel. |
| statement-1280-dark | Yes. |
| statement-390-light | Yes. Phone layout, populated, no panel. |
| statement-390-dark | Yes. |
| panel-1440-light | Yes. Statement with the panel open; the open figure (6600 Rent or lease, Total 18,000.00) is in the shot. |
| panel-1440-dark | Yes. |

0 INVALID.

## Findings

### statement-1280-light
Nothing found. Drilled Total figures read as plain figures (foreground color, no underline at rest), the same as the reference.

### statement-1280-dark
Nothing found.

### statement-390-light
Nothing found. Figures on the second line of each row are plain, the same as the reference.

### statement-390-dark
Nothing found.

### panel-1440-light
- panel-1440-light: statement, row "6600 Rent or lease", Total cell (about x 731-840, full row height) — the open-figure mark is a solid mid slate block (about slate-500), much darker than each muted surface on the same screen (the Period and Rows chips, which are near white). It is the heaviest element on the statement, heavier than the section totals. The dark figure text on it has low contrast (estimated 3.5:1 or less), so the figure is harder to read than its neighbours. It does not read as a quiet muted mark. — BLOCKING (spec §3: "The open figure stays marked while the panel shows exactly its params (`bg-muted` on the cell"; spec §10 spark 1: "Figures read as plain figures ... the open figure `bg-muted`; no new token")

### panel-1440-dark
- panel-1440-dark: same cell — the mark is the same mid slate fill as in light (it does not change with the scheme). On the dark background it is the brightest surface on the screen, far lighter than the muted chips (dark slate). It reads as a strong selection, not a muted mark. The white figure on it is legible. — BLOCKING (same basis: spec §3 "`bg-muted` on the cell"; §10 "the open figure `bg-muted`; no new token")

Cause to check (not verified here): the fill looks the same in the two schemes and matches a muted-foreground-like slate, not the muted surface the chips use. Likely the cell does not get the themed `bg-muted` token: a different class or a class that the build did not generate. Compare the cell's computed background with a `bg-muted` surface in each scheme.

Not findings:
- Reference panel-1440 (height 900) does not show the 6600 row, so the reference has no approved look for the mark. The judgment above is against the spec text and the muted surfaces in the build.
- "6410 Office and general:Software subscriptions ..." truncates with an ellipsis beside the panel: acceptable.
- Panel chrome: not judged (scratch stand-in, checkpoint 3).

## For gate 3
None visible.

CRITIQUE: 0 INVALID, 2 BLOCKING, 0 NOTE
