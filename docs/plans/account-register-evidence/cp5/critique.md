# CP5 critique: phone cards and entry drawer (round 2)

Previous round: 1 BLOCKING ("Draft" title fallback) and 5 NOTEs (opening-balance card not evidenced, phone sheet ~250px blank, duplicated number, empty memo rows, card line order).

## State check
- populated-390-light / -dark: VALID. Card list under the stacked header, "This fiscal year", figures intact at 390.
- populated-1280-light / -dark: VALID. Table, Opening balance row with figure, no drawer.
- populated-drawer-390-light / -dark: VALID. Bottom sheet for entry 6 over the scrim; the sheet now ends ~40px above the tab bar (size md fixed the blank area).
- populated-drawer-1280-light / -dark: VALID. Inline right panel for entry 6; row 6 highlighted in the table and the Business Checking line highlighted in the drawer, both themes.
No INVALID shots. No regression: Debit, Credit, Balance all visible at 1280 and 390; close target is `minWidth/minHeight: 44`.

## Fixed since the previous round
- BLOCKING "Draft" fallback: gone. Title is `entryNumberLabel(number)` (the number, else "—"); title "6" in the shots reads sane. A number-less entry gets a bare "—" heading plus "Number —" below it: weak but correct.
- Phone sheet blank space: fixed (size md, content fits the sheet).
- Empty memo rows: fixed (`LineMemo` returns null when the memo is empty); Rent and Software Subscriptions are single compact rows.

## Critique
populated-390-light, populated-390-dark
- Card third line — the separator sits against the account name: "Accounts receivable· Journal entry", "-Split-· Journal entry". The leading space of `{' · '}` in a separate `Text` collapses on web; the reference decided a spaced " · ". Reads as a typo on every card. — NOTE (RegisterCard.tsx: render the separator in its own `Text` with horizontal margin, or one `Text` for "name · type")
- Card list — the opening-balance card and the long-memo card (Jan 1, entry 8) are below the fold; neither is in any shot. Code: `OpeningCard` is a 96pt item with one line of text (the wide row is 44pt), `RegisterCard` fixes height 96 with a 2-line memo, so truncation is plausible but unverified. — NOTE (evidence gap, second round; capture a short range or scroll to the end)
- Card third line order "account · type" vs reference "type · account" — carried, hierarchy unchanged. — NOTE

populated-1280-light, populated-1280-dark
- nothing found.

populated-drawer-390-light, populated-drawer-390-dark
- Header + fields — title "6" and a "Number 6" field directly under it; the reference carries the number in the title only. Carried. — NOTE (drop the Number field, or title the sheet with the type and keep the field)
- nothing else found; lines legible in dark, highlight visible.

populated-drawer-1280-light, populated-drawer-1280-dark
- nothing found. Debit/Credit/Balance scrolled off beside the drawer is the reference decision (spec Platform notes).

## Summary
- BLOCKING: 0.
- NOTE: 4 (card separator spacing, opening/long-memo cards not evidenced, card line order, duplicated number).
