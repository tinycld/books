# Gate 2 re-critique after the fix round: customer-pages, checkpoint 2

Scope: the two BLOCKING findings of `critique.md` only, plus a check of the recaptured 390 shots for new defects from the tab-strip change. The NOTE findings of `critique.md` were not judged again.

Result: 0 INVALID, 0 BLOCKING, 0 NOTE. Both BLOCKING findings are fixed.

## State check

| Shot | Shows the named state? |
|---|---|
| details-dirty-390 (light, dark) | Yes. Details tab, Phone changed, save bar visible. |
| notes-dirty-390 (light, dark) | Yes. Notes tab, typed note, save bar visible. |
| long-390 (light, dark) | Yes. St. Jude long name and long address in the header. |
| more-menu-1280 (light, dark) | Yes. Menu open: Add sub-customer, Make inactive, Delete customer. |
| more-menu-wide-1600 (light, dark) | Yes. Record width (320 px name column beside the page), menu open with the same three items. |
| loading-390 (light, dark) | Yes. Record loading body ("Customer" + spinner). |

## Finding 1: phone tab strip rule stopped at the tabs — FIXED

- details-dirty-390 (light, dark): the rule under "Details / Notes" spans the full screen width (x=0 to 390). The selected-tab underline sits on the rule. Matches the reference decision (`details-dirty-390-*`: rule across the full page width).
- notes-dirty-390 (light, dark): same, full width. Matches `notes-dirty-390-*`.
- long-390 (light, dark): same, full width. Matches `long-390-*`.

## Finding 2: More menu detached from its trigger at 1600 — FIXED

- more-menu-wide-1600 (light, dark): the More button is at y=8 to 52; the menu opens at y=57, a 5 px gap, the same as at 1280. The right edge of the menu aligns with the right edge of the button. In light the trigger shows its open (tinted) state; in dark it shows the same treatment as the 1280 dark shot.
- more-menu-1280 (light, dark): no change. Menu directly under the More button (5 px gap), trigger in its open state, as in `more-menu-1280-*`.

## New defects from the tab-strip change

- details-dirty-390 (light, dark): nothing found. Tab positions, tab labels, the underline and the spacing to the form are as before.
- notes-dirty-390 (light, dark): nothing found.
- long-390 (light, dark): nothing found. Title and address truncate as before.
- loading-390 (light, dark): nothing found (no tab strip in this state; no change).

## For gate 3

- Nothing visible. The first critique's note on the menu position at 1360 px or more: the 1600 shot is now loaded at 1600. The first shot was resized from 1280 with the menu open, so the two captures do not show if a menu that is open during a resize follows its trigger.
