# Design critique: purchase-lists, checkpoint 4 (Row actions, keys and help)

Scope: the Delivers line (row menus, tick boxes, Batch actions, the Void and Delete draft dialogs and banner). 30 built shots read (15 names, light and dark), each against the reference of the same name. Row count and row identity differ from the reference by data (vendor "Northwest Paper Co." or the search "Hosted phone plan"); that is not a finding.

Result: 0 INVALID, 0 BLOCKING, 4 NOTE.

## Per screenshot

### all-ticked-1280-light / all-ticked-1280-dark
State check: VALID. Two of four rows ticked, header tick box shows the mixed mark, Batch actions enabled, ticked rows tinted. Same structure as the reference.
- all-ticked-1280-dark: Status cell of the ticked draft row (Nov 17 Bill) — the Draft badge loses its outline on the selected-row tint, so it reads as plain muted text while the unticked Draft badges keep the outline. The reference has the same effect. — NOTE

### all-ticked-phone-390-light / all-ticked-phone-390-dark
State check: VALID. Cards with a tick box at the start, two ticked and tinted, icon Batch actions button beside the search field, row menu button at the end of each card.
- all-ticked-phone-390-dark: same Draft badge outline loss on the ticked card (covered by the NOTE above, not counted again).
Light: nothing found.

### read-only-1280-light / read-only-1280-dark
State check: VALID. No New button (header and sidebar), no tick boxes, no Batch actions; the row menu buttons stay. The vendor picker shows a focus ring (it was the last control pressed; capture effect, not a finding).
Nothing found.

### read-only-phone-390-light / read-only-phone-390-dark
State check: VALID. No New button, no FAB, no tick boxes, no Batch actions icon; card menus stay.
Nothing found.

### row-menu-1280-light / row-menu-1280-dark
State check: VALID. The menu of the posted Zenith Telecom bill is open with Open, Pay bill, Void (destructive tone), Copy, View journal entry, in the spec's order, with no Edit. Same menu as the reference.
- row-menu-1280-light: table under the toolbar — the search field holds "Hosted phone plan" but the table still shows the unfiltered bills of all vendors (11 rows). The shot was taken before the search landed (250 ms debounce; the row-menu test id exists before the filter applies). The list and its filter disagree in the evidence. Add a wait for the narrowed list before the menu press. — NOTE
- row-menu-1280-dark: same unfiltered table under a filled search field. — NOTE

### row-menu-phone-390-light / row-menu-phone-390-dark
State check: VALID. The sheet "Bill 1008" holds Open, Pay bill, Void, Copy, View journal entry. Same structure as the reference.
- row-menu-phone-390-light: cards behind the sheet — the list is not narrowed (cards of Pacific Power and Northwest Paper Co. show; the card of bill 1008 is not in view), while the dark shot shows the one matching card. Same capture timing as the 1280 shots. — NOTE
Dark: nothing found.

### row-menu-credit-1280-light / row-menu-credit-1280-dark
State check: VALID. The menu of the Unapplied vendor credit holds Open, Apply to bills, Record refund, Void, Copy, View journal entry, in the spec's order.
Nothing found.

### batch-menu-1280-light / batch-menu-1280-dark
State check: VALID. Two rows ticked, the Batch actions menu is open below its button with Delete drafts and Void. Same as the reference.
Nothing found.

### batch-menu-phone-390-light / batch-menu-phone-390-dark
State check: VALID. The sheet "Batch actions" holds Select all, Clear selection, Delete drafts, Void (the last two enabled, because two cards are ticked).
Nothing found.

### batch-confirm-1280-light / batch-confirm-1280-dark
State check: VALID. All four rows ticked; dialog "Delete 3 drafts?" with "1 selected document is not a draft and stays. The drafts and their lines are deleted. This cannot be undone.", Cancel and a destructive "Delete drafts".
Nothing found.

### batch-confirm-phone-390-light / batch-confirm-phone-390-dark
State check: VALID. Same text in a bottom sheet, all four cards ticked.
Nothing found.

### batch-none-1280-light / batch-none-1280-dark
State check: VALID. One posted credit ticked; dialog "No drafts to delete" / "The selected document is not a draft." with Close only and no confirm button.
Nothing found.

### batch-result-1280-light / batch-result-1280-dark
State check: VALID. Banner "0 done, 1 refused: The period is closed." above the table with a dismiss control; the refused draft bill stays ticked and listed.
Nothing found.

### batch-result-phone-390-light / batch-result-phone-390-dark
State check: VALID. Same banner above the cards; the refused card stays ticked.
Nothing found.

## For gate 3

- row-menu-1280-light and -dark: the row of Brightwave Marketing (No. 1009, posted, total $860.00) shows Balance $0.00, and the lower edge of a red status badge shows below the menu. The brief says the seed posts this bill with no payment and that it reads Overdue; a posted unpaid bill with balance $0.00 and an Overdue badge does not agree with the spec's rule "Overdue: posted, balance > 0, due date before today". The badge text is hidden by the menu, so check the row.
- row-menu shots: confirm that the unfiltered list under a filled search field is only capture timing (the phone dark shot shows the search works).
