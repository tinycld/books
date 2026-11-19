# Design critique: purchase-lists, checkpoint 3, fix round

Scope: the re-captured shot `beside-1440` (light and dark), compared with the reference files of the same name. The other 25 shots were not captured again and are not judged here. The NOTEs of the first critique (`critique.md`, N1 to N4) are not repeated; N3 (the "← Expenses" back link in the document pane) is still on screen in both files.

Result: 0 INVALID, 0 BLOCKING, 0 NOTE.

## Per screenshot

- `beside-1440-light`: state check OK. It shows the state its name says: the 320 px column of two-line rows (number and vendor, amount and status badge), the search field only (no chips, no date range, no vendor picker), row "1008 · Zenith Telecom" marked, and the real bill read view (Bill 1008, Posted, balance due $189.50, the two line tables, totals, attachments, the action bar) in the rest of the width. The blank document pane of the first capture is gone. Nothing found.
- `beside-1440-dark`: state check OK. Same content as the light file. Marked row, badges, muted text, the header card and the action bar are legible on the dark surface. Nothing found.

## Compared with the reference

- Kept: header "Expenses" with "New bill", the tab strip with Bills active (clipped at the fourth tab, as in the reference), the search field with the placeholder "Number, reference or memo", two-line rows 60 px high, the open row marked, the document in the rest of the width.
- Proper differences: the Expenses entry is in the sidebar and active (the reference was captured before the entry existed); the marked row has a left accent bar in addition to the tint; the document pane is the real read view (the reference pane is a stand-in); a draft row shows the vendor alone, as the reference does.

## Outside this checkpoint (not findings)

Seen in the bill read view, which this checkpoint does not change (spec §8: "No change to the behavior of a purchase document form or read view"):

- Header card, Due date: the value reads "Due Dec 12, 2026" below the label "Due date", so the word "Due" shows two times.
- Line tables and totals: the Amount column ends about 73 px before the right end of the row rules (x 1351 against 1424), so the amounts do not align with the "BALANCE DUE" figure at the top right.

## For gate 3

Nothing.
