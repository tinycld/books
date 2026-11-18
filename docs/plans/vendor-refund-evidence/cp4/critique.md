# Gate 2 design critique: vendor-refund, checkpoint 4 (Refund edit and void)

Scope: the Delivers line only. The read actions by role and status, the correction form at `?replaces=<id>`, the cannot-edit notice. The read view body (band, grid, cards) is checkpoint 3 work; differences there are recorded as NOTE only.

Result: 0 INVALID, 0 BLOCKING, 5 NOTE.

## State check

| Shot | Shows the named state | Evidence |
|---|---|---|
| read-390-light / dark | Yes | Posted badge, writer bar: More, Edit (Void and View journal entry are in More on a phone, as the reference) |
| read-1280-light / dark | Yes | Posted badge, bar: More, Edit, Void, View journal entry |
| read-void-390-light / dark | Yes | Void badge, "Voided by", bar: More, View journal entry; no Edit, no Void |
| read-void-1280-light / dark | Yes | Same as above |
| read-reader-390-light | Yes | Posted badge, bar: More, View journal entry; no Edit, no Void |
| read-reader-1280-light | Yes | Same; the sidebar has no New button (reader) |
| cannot-edit-390-light | Yes | "This vendor refund cannot be edited" |
| cannot-edit-1280-light | Yes | Same |
| correction-390-light | Yes | Title "Edit vendor refund 1001", Draft badge, Vendor has focus and muted (read-only) text, bar: Cancel, Save draft, Post, More |
| correction-1280-light | Yes | Same title; bar: Cancel, Save draft, Post, Post & new |
| read-replaced-390-light | Yes | Void badge, "Voided by", link "Replaced by 1001 (edited)", bar: More, View journal entry |
| read-replaced-1280-light | Yes | Same |

## Findings

### read-390-light, read-390-dark
Nothing found for this checkpoint.
- read-390-*: "Vendor credits refunded" card — the build draws "Vendor credit 1004 · No. CFF-RC-3310" as one link and three label-value pairs in one row; the reference draws the vendor's number as a muted line under the link, Credit date on its own row, then Credit total and Refunded. This is the shared card of checkpoint 3 (plan stand-in d), not this checkpoint's work — NOTE. The same applies to read-void-390-*, read-reader-390-light and read-replaced-390-light.

### read-1280-light, read-1280-dark
Nothing found for this checkpoint. The bar agrees with spec §3.7 (Edit, Void, View journal entry); the added More (History) agrees with the brief ("More holds the History row as on the payment").
- read-1280-*: detail band — the Vendor link is about 12 px lower than the Refund date and Payment values in the same row, and the band has more space below than above. The reference has the same offset; the band is checkpoint 3 work — NOTE. The same applies to read-void-1280-*, read-reader-1280-light and read-replaced-1280-light.

### read-void-390-light, read-void-390-dark, read-void-1280-light, read-void-1280-dark
Nothing found. Void badge, "Voided by" line and the entry-only bar agree with spec §3.7 ("Writer on a void refund, and a reader: View journal entry only"). Light and dark are legible.

### read-reader-390-light, read-reader-1280-light
Nothing found. No Edit and no Void for the reader.

### cannot-edit-390-light, cannot-edit-1280-light
- cannot-edit-*: page body — one line of text below the back link and no other content. It is the same as the reference and as spec §3.8 (only the not-found state has "a back link" in the body). The state looks bare; a Button back to the refund is a possible improvement — NOTE.

### correction-390-light
- correction-390-light: action bar, More — More has a tinted (accent) background; Cancel and Save draft are plain, and the reference More is plain. Probable cause: the pointer stayed at that position after the press on Edit in the read view (hover state in the capture). If it is not hover, the tint makes More compete with Post — NOTE.
- correction-390-light: Vendor field — the read-only trigger keeps its chevron, which tells the user that it opens; only the muted text shows that it is locked. The reference draws it the same way. A trigger without chevron is clearer — NOTE (also correction-1280-light, same finding, counted once).

### correction-1280-light
Nothing more found. Title, Draft badge, focus on Vendor (spec §3.2: "On new, draft and correction the Vendor picker has focus"), the row with Unapplied credit $425.00 and Refund 150.00, and the full bar agree with the spec and the reference.

### read-replaced-390-light, read-replaced-1280-light
Nothing found. "Replaced by 1001 (edited)" is a link below the "Posted by" / "Voided by" lines, as the reference.

## For gate 3
Nothing visible.
