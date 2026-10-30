# Checkpoint 9 — gate 2 design critique

Scope: the footer (Cancel, Save, Save and new on new; Cancel and Save on edit), the Discard changes? question, the selected row beside the panel, and the read-only footer (code only, no shot). Known and not findings: `bg-danger-soft` undefined, the empty row-menu cell (checkpoint 10), the Account number hint spacing (NOTE already on record).

## State check

| Shot | Named state | Shows it? |
|---|---|---|
| new-1100-light | new vendor, empty form, page surface | yes — "New vendor", every field empty, footer Cancel · Save and new · Save |
| new-1100-dark | same, dark | yes |
| page-1100-light | edit Office Supply World, page surface | yes — "Edit vendor", seeded values, footer Cancel · Save |
| page-1100-dark | same, dark | yes |
| discard-1100-light | dirty edit form, Cancel pressed, Discard changes? open | yes — Notes holds the typed "Call before the delivery.", dialog open over the form, footer still Cancel · Save; the body is scrolled to the Notes field (the fill scrolled it), the reference shows the top of the form |
| discard-1100-dark | same, dark | yes |
| panel-1600-light | panel surface, Office Supply World open beside the list | yes — list filtered by the search to the one row, that row tinted, panel "Edit vendor" with ✕, footer Cancel · Save |
| panel-1600-dark | same, dark | yes |

No INVALID shot.

## Findings

new-1100-light: nothing found. Footer order and weights match the reference (Cancel outline, Save and new outline, Save filled primary).

new-1100-dark: nothing found.

page-1100-light: nothing found. Footer is Cancel · Save as the reference decided; Save and new is absent on edit. The expense account reads "6210 Design Tools" where the reference shows "6400 Office and general" — seeded data, not a finding.

page-1100-dark: nothing found.

discard-1100-light: nothing found. Title "Discard changes?", message "This vendor has changes that are not saved.", actions "Keep editing" (text) and "Discard" (danger, filled) match the spec and the reference; the backdrop dims rail, sidebar and content as in the reference.

discard-1100-dark: nothing found. The dimmed danger button and white title stay legible.

panel-1600-light: selected row — the shot filters the list to one row, so it proves the tint but not the contrast between a selected row and its unselected neighbours, which the reference shows; the row's `bg-accent` tint itself matches the reference — NOTE.

panel-1600-dark: same as light — NOTE (counted once with the light shot). Nothing else found: the selected row's darker-navy tint, the panel header, the ✕ and the footer match the reference.

## Read-only footer (code, no shot)

`recordFooter` in `tinycld/books/lib/record-display.ts` returns `{ cancel: canWrite, save: canWrite, saveAndNew: canWrite && mode === 'new', close: !canWrite }`. For a read-only member that is Close alone, no Cancel, no Save — which is what `read-only-1100-*` and `read-only-1600-*` show (one outline "Close" at the right of the footer). `recordTitle` gives "Vendor" for that user, as the references do. Nothing found.

## Summary

INVALID: none. BLOCKING: none. NOTE: 1 (panel selected-row evidence shows no unselected neighbour).
