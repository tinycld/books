# Checkpoint 4 design critique — account panel

Scope: the Delivers line and gate-2 note of "### Checkpoint 4" only. Row menu, delete, batch and import are not judged. Settled decisions (SelectInput radio list for Account type; heavy Name/Type truncation at 1280 beside the 380px drawer) are not re-litigated.

## State check

| Shot | State | Verdict |
|---|---|---|
| panel-open-1280-light/dark | "Edit account" drawer inline beside the list, Business Checking / 1000 / Bank selected, Cancel + Save | VALID |
| panel-open-390-light/dark | "Edit account" bottom sheet, same values, Save + Cancel | VALID |
| panel-new-1280-light/dark | "New account" drawer, blank fields, no type selected, Cancel + Save and new + Save | VALID |
| panel-new-390-light/dark | "New account" bottom sheet, blank fields, Save + Save and new + Cancel | VALID |
| panel-subaccount-1280-light/dark | "New account" drawer scrolled, Bank chosen (Bank detail types listed), sub-account toggle on, Parent account lists Business Checking, Description below | VALID |
| panel-subaccount-390-light/dark | same as above in the bottom sheet | VALID |

Gate-2 checks at 1280 (all four 1280 shots): Name, Type, Detail type, Balance and the empty row-menu gutter are all on screen with no horizontal scroll. Balance is fully visible and right-aligned in every row. Detail type is non-blank in every row (Checking, Accounts..., Machiner..., Credit card, Owner's ..., Service i..., Rent or l..., Dues an...). Truncated cells keep the number and the first word, and columns stay aligned. Pass.

## Findings

panel-open-1280-light, panel-open-1280-dark: list, row 1000 Business Checking — the row whose panel is open has no selected highlight; it looks identical to every other row, so the list gives no cue which account the drawer edits — BLOCKING (reference panel-open-1280-light/dark: the open row 1010 carries a tinted selected background; this is a state the reference shows and the build loses it)

panel-open-1280-*, panel-new-1280-*: drawer body — the scroll region ends on a whole option ("Equity", the 10th of 15 types) with ~40px of blank space before the sticky bar and no scrollbar, fade or divider. Nothing signals that Income/Expense types, Detail type, the sub-account toggle, Parent account and Description exist below. A user reads the form as complete at "Equity" — BLOCKING (reference panel-open-1280-*: every field from Account name through Description is on screen with the sticky bar below; the build hides four of the seven fields behind an unsignaled fold. The fix is the affordance, e.g. a top border on the sticky bar, a bottom border on the header, or the platform scrollbar; it does not reopen the SelectInput decision)

panel-open-390-*, panel-new-390-*: bottom sheet body — same missing scroll affordance; the clip point lands on a whole button in panel-open ("Other asset") and mid-button in panel-new ("Fixed asset"), so only one of the two shots hints at more content — NOTE (same cause as above; one fix covers both)

panel-subaccount-1280-*, panel-subaccount-390-*: panel header and sticky bar — scrolled content runs under the header ("Other income" / "Savings" clipped flush against the title) and under the sticky bar (Description box cut with no bottom edge) with no divider or shadow on either. Reads as a layout fault rather than scrolling — NOTE

all 1280 and 390 shots: Account number label — reads "Account number"; the reference reads "Account number (optional)" and the spec field list says "Account number (optional)". No field in the built form carries a required or optional marker, so the user cannot tell which of Name and Number must be filled — NOTE (label only; not a structure or state loss)

panel-open-*, panel-new-*: Detail type — not visible in any unscrolled shot, so the "disabled until a type is chosen" rendering (spec: "Detail type (select, disabled until a type is chosen, options from the type)") and its label/placeholder cannot be verified from this evidence. panel-subaccount shows the enabled list (Checking, Savings, Money market, Cash on hand, Trust account) correctly filtered to Bank — NOTE (evidence gap; add a shot of the new panel scrolled to Detail type with no type chosen)

panel-open-*: Edit form — no shot shows the edit target's Detail type, sub-account state or Description pre-filled from the row, nor the type-locked help text or the read-only variant. The Delivers line and tests cover these; the evidence does not — NOTE (evidence gap)

panel-subaccount-1280-*, panel-subaccount-390-*: Parent account — one unselected option "Business Checking" (correctly the only Bank account). It renders in the same radio-list style as Account type, so with one option it looks like a static value rather than a choice to make. Acceptable under the settled SelectInput decision; record with the compact-picker design note — NOTE

panel-*-390-*: touch sizes — type/detail/parent option rows are ~36px tall with a 6px gap, the sticky Save / Save and new / Cancel buttons ~36-38px, the header close icon ~24px. Below the usual 44px phone target; same size as the reference's wide-screen buttons, but the reference never showed the phone form — NOTE

panel-new-390-*, panel-subaccount-390-*: sticky bar — three full-width stacked buttons take ~150px of the ~630px sheet, leaving ~4.5 option rows of form. A single row (Cancel | Save and new | Save) would return ~90px to the form — NOTE

Dark mode (all six dark shots): drawer and sheet surfaces, input borders, selected teal option, toggle, chips and sticky-bar buttons all have light-mode parity; drawer left divider at 1280 is present as in the reference — nothing found.

Sticky bar order: wide = Cancel · Save and new · Save (matches reference); phone = Save · Save and new · Cancel stacked, primary on top. Consistent with phone convention — nothing found.

Panel header: title + close icon aligned with the reference at 1280; on phone the sheet has rounded top corners and a dimmed backdrop — nothing found.

## Summary

2 BLOCKING: (1) the open row has no selected highlight in the list; (2) the drawer/sheet body ends on a whole option with blank space and no scroll cue, so Detail type, the sub-account toggle, Parent account and Description are hidden behind an unsignaled fold.
8 NOTE: header/sticky-bar dividers, "(optional)" label dropped, Detail type disabled state and edit pre-fill not in evidence, single-option Parent select appearance, phone touch sizes, stacked phone buttons, phone clip point.
