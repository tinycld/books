# Checkpoint 9 — gate 2 design critique, pass 2 (re-captured panel shots)

Scope: only `panel-1600-light.png` and `panel-1600-dark.png`, re-captured after the first critique (the capture now clears the search after it opens the row). Reference: `vendor-form-reference/panel-1600-light.png` and `-dark.png`. Not findings: the empty row-menu cell (checkpoint 10), the core `bg-danger-soft` gap, the Account number hint spacing.

## State check

| Shot | Named state | Shows it? |
|---|---|---|
| panel-1600-light | panel surface, Office Supply World open beside the full list | yes — search empty, 20 active rows, Office Supply World row tinted between Northwest Paper Co. and Pacific Power, panel "Edit vendor" with ✕, footer Cancel · Save |
| panel-1600-dark | same, dark | yes |

No INVALID shot.

## Findings

panel-1600-light: nothing found. The selected row's `bg-accent` tint now reads against untinted neighbours above and below, as the reference shows; the first critique's NOTE is closed. Panel header (52 px, title left, ✕ right), field stack, sticky footer with outline Cancel and filled Save match the reference. Differences that are not findings: Show inactive is off here (on in the reference, which adds two dimmed rows) — the list's default state, owned by an earlier checkpoint; the expense account reads "6210 Design Tools" (seeded data).

panel-1600-dark: nothing found. The selected row's lighter-navy tint is visible against its neighbours and matches the reference; title, labels, values, hint text and the footer stay legible.

## Summary

INVALID: none. BLOCKING: none. NOTE: none. The first critique's one NOTE (selected row shown with no unselected neighbour) is resolved by the re-capture.
