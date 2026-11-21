# Design critique — vendor-balance, checkpoint 1 (Vendor Balance report for readers)

Scope: the Delivers line of checkpoint 1 (one row per vendor, the No vendor row, the Total, the four params, inactive vendors marked, the empty state). Opened vendor rows (checkpoint 2) and the Reports menu, phone rows and help (checkpoint 4) are not judged. Names and figures differ from the reference by plan decision D8. Width pairs by D8.

Result: 0 INVALID, 0 BLOCKING, 1 NOTE.

## State check

| Built shot | Shows its state? |
|---|---|
| populated-1280-light / -dark | Yes. 10 vendor rows, muted "Old Town Print Shop (inactive)", "No vendor" directly above Total. |
| populated-1024-light / -dark | Yes. Same rows. |
| populated-768-light / -dark | Yes. Same rows. |
| with-activity-1280-light / -dark | Yes. Chip "Rows: With activity"; "Metro Commercial Properties 0.00" is added; Total unchanged (4,058.00). |
| by-balance-1280-light / -dark | Yes. Chip "Order: Largest balance"; rows largest first, negative balances last among vendors, "No vendor" last. |
| filtered-1280-light / -dark | Yes. Chip "Vendor: Harbor Freight Logistics, Pacific Power" with a clear control; header line "Vendor: …"; two rows; no "No vendor" row; Total 592.75. |
| empty-1024-light / -dark | Yes. "No rows as of January 1, 2020", the action "Show end of last fiscal year", no table, no Expand all. |
| populated-phone-390-light / -dark | Yes. Same rows as populated, two columns on one line. |

No shot is INVALID.

## Findings per screenshot

- populated-1280-light: nothing found.
- populated-1280-dark: nothing found.
- populated-1024-light: nothing found.
- populated-1024-dark: nothing found.
- populated-768-light, populated-768-dark: toolbar, page title — the title is cut to "Vendor Balan…" beside the five toolbar buttons. The reference at the paired width (populated-1028) shows the full title, but it has four buttons (no Export; its model is static, D9). The full title is printed again in the document header directly below, so no information is lost. The toolbar is core's report view; a fix (an action moved into More at this width) is a core change. — NOTE
- with-activity-1280-light: nothing found.
- with-activity-1280-dark: nothing found.
- by-balance-1280-light: nothing found.
- by-balance-1280-dark: nothing found.
- filtered-1280-light: nothing found.
- filtered-1280-dark: nothing found.
- empty-1024-light: nothing found.
- empty-1024-dark: nothing found.
- populated-phone-390-light: nothing found.
- populated-phone-390-dark: nothing found.

## Checked and not findings

- Reference decisions kept at every width: one plain line per vendor with one figure; muted inactive row with " (inactive)"; "No vendor" last under both Order choices; heavy rule above a semibold Total; heading block (business name, title, "As of <day>"); "End of report".
- Table fit: the capture log reports `one-line` at 1280, 1024, 768 and 390 (name 1108 / 852 / 596 / 282, balance 108). The table does not scroll sideways at any captured width. Balance is not cut.
- Capture log `SIDEWAYS report-controls` at 390: the param chip strip scrolls sideways ("Order: Name" is cut with a fade). This is the chip strip, not a table, and the reference phone shot shows the same cut.
- Export button and the sort arrows in the column headers are in the build and not in the reference: core's live report view (D9); the reference is a static model.
- The opened vendor rows in the reference `with-activity-1540` and `filtered-1540`, and "Collapse all": checkpoint 2.
- Phone label wrap (two-line inactive row, three-line long name in the reference): the seeded book has no name long enough to wrap at 390, so this shot does not show it. The phone rows proof is checkpoint 4.
- No rail item / tab-bar item is marked active in the build (the reference marks Books; it is drawn on the Books scratch route and the shipping route is core's `/a/reports/<id>`, D8). Core shell, outside this checkpoint.
- Dark mode: the muted row is dimmer than its neighbours and still readable; it matches the reference.
- Sums: populated rows add up to 4,058.00; filtered rows add up to 592.75.

## For gate 3

- The Vendor and Balance column headers show sort arrows. The report also has the Order param, and the spec requires "No vendor" "after every vendor under both Order choices". Check that a header sort does not move the No vendor row above a vendor, or that the two sort controls do not disagree.
