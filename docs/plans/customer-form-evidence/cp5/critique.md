# Checkpoint 5 — design critique

Scope: the Delivers line of checkpoint 5 (save, Save and new, edit save, refusals, Discard changes? guard, read-only surface, search palette). Gate 2 focus: the footer — Cancel, Save and new, Save on a new customer; Cancel, Save on an edit. The side panel, the row menu, inactive and delete belong to later checkpoints and are not judged here.

Method: every built screenshot was read whole and compared with the reference of the same name; the footer and header were also compared at 3x crops, built above reference. The band between the header rule and the first field was pixel-checked on the dark 390 shots (one color, no stray pixels).

## State check

| Shot | Expected | Shows | Verdict |
|---|---|---|---|
| new-390-light | empty new customer, page surface, light | "‹ Customers" / "New customer", every field empty, Parent "None (top level)", Same as billing on, footer Cancel · Save and new · Save, tab bar below | valid |
| new-390-dark | same, dark | same, dark tokens | valid |
| new-1280-light | empty new customer, page surface, light | same content in the centered 720 px column, half-width pairs, City/State/Postal on one line, footer Cancel · Save and new · Save | valid |
| new-1280-dark | same, dark | same, dark tokens | valid |
| page-390-light | a saved customer reopened in edit mode, light | "Edit customer", Helix Capture Studio with company, first/last name, email, phone and billing address filled, Mobile/Website/Notes empty (not entered by the capture), footer Cancel · Save | valid |
| page-390-dark | same, dark | same, dark tokens | valid |
| page-1280-light | same, light, 1280 | same, pairs side by side | valid |
| page-1280-dark | same, dark, 1280 | same, dark tokens | valid |

No shot is INVALID.

## Critique

Footer (the gate 2 focus): on every shot the footer matches the reference decision — a top border, buttons right-aligned, outlined Cancel and Save and new, filled primary Save at the far right; the edit footer drops Save and new and keeps Cancel · Save. Button size, spacing, radius and labels are the same as the reference in light and dark at both widths. The footer sits above the phone tab bar at 390 and inside the content area at 1280. Save is the only filled button, so the primary action reads at a glance. Nothing lost against the reference; nothing broken against the spec ("Footer: Cancel, Save, and Save and new (create only)").

Differences from the reference that are not findings:
- The 390 reference shows the Books New FAB over the form; the build hides it. The spec decides this: "The Books New FAB is hidden on a customer page (`hidesNewFab`)".
- The reference edit page shows the parent-picker help text and a filled Notes field because its customer (Harborview) has sub-customers and notes; the capture-created customer has neither.

Per-shot findings:

- new-390-light: header — the back chevron is a small text glyph ("‹") that sits lower and lighter than the "Customers" label; the reference draws an icon chevron at label height, visually one control with the label — NOTE
- new-390-dark: nothing found (same chevron note applies)
- new-1280-light: nothing found (same chevron note applies)
- new-1280-dark: nothing found (same chevron note applies)
- page-390-light: nothing found (same chevron note applies)
- page-390-dark: nothing found (same chevron note applies)
- page-1280-light: nothing found (same chevron note applies)
- page-1280-dark: nothing found (same chevron note applies)

The chevron is one shared header component, so it is one finding, not eight. It does not change structure, hierarchy or where detail lives, and no spec text or token rule names the glyph, so it stays a NOTE.

## Not in evidence (not findings)

These states are in the Delivers line but no screenshot shows them, so this review cannot judge them visually: a field refusal under its field (`form-field-display_name`, `form-field-email`), the root refusal in `form-error-summary` on an edit save, the "Discard changes?" dialog (Discard destructive, Keep editing), the read-only surface with its footer Close (no read-only member is seeded), and the search palette hit. The e2e covers their behavior; if the human wants to see them, a later capture should add `error`, `discard` and `read-only` shots.

## Summary

BLOCKING: 0. NOTE: 1 (back chevron glyph vs the reference's icon chevron). The footer this gate focuses on matches the approved reference in both schemes and at both widths.
