# Checkpoint 6 critique — Customer side panel on wide windows

Delivers: at 1360 px or more the customer opens in a 480 px panel beside a usable list, with its own chrome and the open row highlighted.

Measured (pixel samples, built vs reference):
- Panel left border: 1 px `border` at x=1120 in both schemes; panel spans 1120–1600 (480 px). Same as reference.
- Panel header: title "Edit customer" + ✕, 1 px bottom border at y=51 (52 px header). Same as reference.
- Open row "Alvarez kitchen remodel": light `rgb(240,253,250)`, dark `rgb(30,41,59)`, full width 324–1120. Same values as reference. Neighbor rows keep `bg-background`.
- Footer: Cancel + Save right-aligned, 1 px top border. Same as reference.
- The list stays beside the panel with search, Show inactive and all rows reachable.

## panel-1600-light.png
State check: VALID. 1600 px window, Show inactive on (Old Mill Bakery and Northwind Boise dimmed with "Inactive"), the sub-customer "Alvarez kitchen remodel" open in a 480 px panel at the right of the content area, its row highlighted.

Findings: nothing found.

## panel-1600-dark.png
State check: VALID. Same state as the light shot in dark mode. Panel border, header border, highlighted row and footer render with dark tokens; the highlight is subtle but equals the reference's decision.

Findings: nothing found.

## Out of scope (not findings for this checkpoint)
- No row menu in the trailing cell: checkpoint 7.
- The list differs from the reference in details that belong to the list checkpoints, not this one: search placeholder ("Search customers" vs "Search name, email or phone"), row height (56 px vs about 52 px), and empty Phone cells where the reference mockup shows numbers (the form confirms the fixture has only a Mobile value for these customers, so the list is correct for its data).
