# Critique: general-ledger checkpoint 1 — Customer or vendor on lines

Delivers: a journal entry line can name one customer or one vendor (picked in the entry form, shown in the read view and the register's entry drawer, frozen at posting, copied into reversals).
Judged: the Name column / card field in the entry form, the Name picker, the Name in the read view. Reference (loose anchor): `journal-entries-reference/new-lines-*` and `posted-*`. No reference for the picker; no shot of the register's entry drawer was supplied, so the drawer is not judged.

## State check

| Shot | State named | Shows | Verdict |
|---|---|---|---|
| new-lines-1280-light / -dark | new entry form | the new form with a Name column between Account and Debit | valid |
| new-lines-390-light / -dark | new entry form | the new form, scrolled to the top; only the top of line card 1 (Account, Name label, Name trigger, the Debit/Credit labels) is above the sticky footer | valid (weak capture: the rest of the card is hidden behind the footer) |
| new-name-open-1280-light / -dark | Name picker open on line 1 | the closed form, pixel-identical to new-lines-1280; no popover, no search box, no list | **INVALID** — no picker is open |
| new-name-open-390-light / -dark | Name picker open on line 1 | a sheet "Line 1 name" with the search box, None (checked), the CUSTOMERS heading and the customers list | valid (the Vendors heading is below the fold, so the second group is not verified) |
| posted-1280-light / -dark | posted entry "Q4 retainer" with a customer on its lines | JE-17 Posted, memo "Q4 retainer", Name column "Northwind Traders" on both lines | valid |
| posted-390-light / -dark | same, phone | JE-17 read cards with "Northwind Traders" under each account | valid |

## Findings

### new-lines-1280-light / -dark
- new-lines-1280: line table, Account and Name triggers — the two adjacent pickers draw their placeholders in different tones: "Choose account" in the foreground colour, "Name" in the muted placeholder colour (as "Line memo" is). The account trigger's style is pre-existing, but the new column makes the mismatch visible side by side. — NOTE
- new-lines-1280: line table, right edge — the header rule, row rules and the ⋮ column run edge to edge (325–1280) while the fields above end at the 341–1264 inset; the reference insets the table to the same margins as the fields (rules 341–1264, ⋮ at 1226). Nothing is cut off at 1280. If the full-bleed table is the current main-branch layout of the entry screen (not a cp1 change), disregard. — NOTE
- new-lines-1280: Name column — about 165 px wide at 1280 (plan: `minWidth: 120`). A seeded name such as "Harborview Hospitality Group" will ellipsize in the trigger; no shot shows a chosen long name at 1280, so this is unproven. — NOTE
- Dark: legible, tokens consistent with the rest of the form. Nothing else found.

### new-lines-390-light / -dark
- new-lines-390: line card 1, Name field — the field carries both the label "Name" and the placeholder "Name" in the trigger, so the card reads "Name / Name". Account has no label (its placeholder "Choose account" carries the meaning); Debit and Credit have labels and no placeholder; Memo has a placeholder and no label. Either drop the label (the trigger placeholder does the job, like Account) or give the trigger an action placeholder ("Choose a customer or vendor"). — NOTE
- Hierarchy and spacing match the reference card (Account first, then the labelled fields). Nothing else found; the hidden part of the card could not be judged.

### new-name-open-1280-light / -dark
INVALID — not critiqued. Re-capture with the picker open (the test id `entry-line-name-0` pressed, the popover with the search box and the Customers / Vendors headings visible). The desktop picker (popover, group headings, None, loading / retry / empty rows) is therefore unreviewed at this gate.

### new-name-open-390-light / -dark
- Sheet title "Line 1 name", search "Search customers and vendors", None with a check, the CUSTOMERS group heading in muted small caps left of the indented options, the options in the foreground colour: consistent with the core Sheet / Books `SearchPicker` style (ProductPicker, CustomerPicker). Light and dark legible.
- The highlighted row "Harborview Events" is the pointer's hover (the trigger was pressed at that y), not a second selection; a capture artefact, not a finding.
- nothing found

### posted-1280-light / -dark
- posted-1280: line table, right edge — same full-bleed-versus-inset difference as new-lines-1280 (the reference's read table is inset 341–1264). Same caveat. — NOTE (counted once above; not added to the total)
- Name column reads "Northwind Traders" on both lines, heading NAME aligned with the cell, Debit / Credit right-aligned, Memo blank (the lines have no memo). Nothing else found.

### posted-390-light / -dark
- posted-390: line cards — the Name is drawn in the slot and style the reference uses for the line memo (a muted second line under the account), with no mark that tells a name from a memo. A reader of this card cannot tell "Northwind Traders" is the customer and not a memo; and no shot shows a line with both a Name and a memo, so the three-line card (account / name / memo) is unverified. Consider a prefix or a distinct token for the name line, or capture a line that has both. — NOTE
- Dark legible. Nothing else found.

## Totals
INVALID 2 (new-name-open-1280 light and dark) · BLOCKING 0 · NOTE 5

## For gate 3
- new-name-open-1280: the capture shows no open picker. Either the capture step failed or the desktop trigger `entry-line-name-0` does not open the popover at 1280. Gate 3 must confirm the desktop picker opens, shows the Customers and Vendors headings, and that `entry-line-name-option-retry` / `-loading` / `-empty` render (none of them is in any shot).
- The register's entry drawer (`entry-line-party-<index>`) has no shot; gate 3 covers it through the e2e's desktop drawer step.
