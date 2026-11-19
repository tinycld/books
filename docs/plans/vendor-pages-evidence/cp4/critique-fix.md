# Gate 2 re-critique: vendor-pages, checkpoint 4 (corrected capture)

Scope: only the re-captured shots `loading-*`, `error-*`, `transactions-1280-*`, `transactions-1600-*`, `transactions-cards-390-*`. Delivers: "the vendor page shows what the business owes the vendor (Open and Overdue), starts a new transaction for the vendor from one menu, lists every purchase document of the vendor on a Transactions tab that is the default, and has its help topic."

Read: 14 built shots (all), 11 reference shots (`loading` 390 light, 1280 light + dark; `error` 390 light, 1280 light + dark; `transactions` 390 light + dark, 1280 light + dark, 1600 light), the spec, the lessons, memories-design, the first critique.

Result: 0 INVALID, 0 BLOCKING, 5 NOTE. The two "Not evidenced" states of the first critique that this capture covers (Transactions loading, Transactions error banner) are now evidenced.

No "Can't reach the server" toast shows in any of the 14 shots.

## Per screenshot

### loading (390, 1280; light, dark)
State check: VALID. Both figures show "—" with their labels and markers, and the Transactions tab shows the spinner under the chip row with no table, no cards and no empty text. This is the state of the reference `loading-*` (spec §3.2 "both figures show "—"", §3.5 "Loading: `LoadingState`").
- nothing found. Header, tabs, chips and spinner are at the same places as in the reference at both widths; the spinner is legible in dark.

### error (390, 1280; light, dark)
State check: VALID. The header shows "Balance unavailable" with a Retry link, and the Transactions tab shows the banner "Transactions could not load." with a Retry button under the chips. This is the state of the reference `error-*` (spec §3.2, §3.5 "Error: the Books error banner with Retry").
- error-390-*, error-1280-*: header — the New transaction row and the tab strip are 6 px and 2 px higher than in the loading and loaded states (1280: button y 137 against 143; 390: button y 273 against 279), so the page moves when the balance read fails or recovers — NOTE. The reference has the same heights. (Carried from the first critique; now seen at 390 too.)
- error-390-dark, error-1280-dark: banner Retry — the button has no visible edge or fill on the dark banner; it reads as plain text, not as a button (the light shot shows a white button) — NOTE. The reference dark shot is the same.

### transactions-1280 (light, dark)
State check: VALID. Populated Transactions tab, default tab, All chip selected, table with Date, Type, No., Due date, Total, Status; five seeded rows newest first. The draft vendor credit has an empty No. cell and a negative total; Due date is a date on bill rows and "—" on the others. The table fits the page; no sideways scroll.
- transactions-1280-*: table header and cell text — start 8 px left of the page gutter (x 340 against 348 for the title, tabs and chips) — NOTE. The reference has the same offset. (Carried.)
- transactions-1280-dark: "Draft" badge — the muted text and border are faint on the dark surface — NOTE. The reference dark shot is the same. (Carried; counted once for 1280, 1600 and the cards.)

### transactions-1600 (light, dark)
State check: VALID. Record surface: the Vendors names column on the left with Office Supply World selected, no back button on the page, the same table. The table fits the surface; no sideways scroll.
- transactions-1600-*: header right column — the Open / Overdue markers start 8 px below the top edge of the surface, tighter than at 1280 — NOTE. The reference is the same. (Carried.)
- transactions-1600-*: table text 8 px left of the gutter (x 661 against 669) and the faint dark "Draft" badge — see the 1280 NOTEs; not counted again.

### transactions-cards-390 (light, dark)
State check: VALID. Phone layout of the populated Transactions tab: stacked header, the two figures side by side, full-width New transaction, the tab strip, the chip row scrolling sideways (last chip cut at the edge), and cards with type and number, date, total and status. The draft vendor credit card shows the type alone. This is the 390 state of the reference `transactions-390-*`.
- nothing found beyond the faint dark "Draft" badge (see the 1280 NOTE).

## Not evidenced (outside this re-capture)
- Long amounts (`long-*`), `read-only`, `details-read-only`: unchanged from the first critique; not part of the shots given for this round.

## For gate 3
- None visible.
