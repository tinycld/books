# Gate 2 design critique of the fix — vendor-refund, checkpoint 3

Scope: the two `read-reader` shots captured again after fix item 1 (`cp3-fix.md`), each against its reference shot, spec §3.4 / §3.7 and the earlier critique.

Result: 0 INVALID, 0 BLOCKING, 2 NOTE.

## Earlier BLOCKING finding

RESOLVED. `read-reader-1280-light`: the "Vendor credits refunded" grid row now shows "No. CFF-RC-3310" in the muted tone under the "Vendor credit 1004" link, as the reference shot and spec §3.4 ("the vendor's credit no. "No. CM-8841" muted under it"). The header and the row keep their shared column widths; the date and the money columns stay aligned and right-aligned.

## State check

| Shot | State shown | Verdict |
|---|---|---|
| read-reader-1280-light | Posted refund 1001, read view, bar with View journal entry only | valid |
| read-reader-390-light | Posted refund 1001, read view as cards, bar with View journal entry only | valid |

Capture remark (not a finding): the sidebar "+ New" button is hidden in the built 1280 shot and shown in the reference. The earlier critique identified this as a capture difference.

## Findings

### read-reader-1280-light
- read-reader-1280-light: band — the Vendor link sits about 12 px lower than the Refund date and Payment values, and the band has empty space under the values (also in the reference; carried from the earlier critique) — NOTE

### read-reader-390-light
- read-reader-390-light: "Vendor credits refunded" card, first line — "Vendor credit 1004 · No. CFF-RC-3310" is one line, all in the link tone and underlined. The reference puts "No. CFF-RC-3310" muted on its own line under the link. The one-line text agrees with spec §3.4 ("Vendor credit 1002 · No. CM-8841" on the first line), so only the tone of the credit no. differs: it reads as part of the link, not as muted detail. Not changed by this fix — NOTE

## For gate 3
Nothing visible.
