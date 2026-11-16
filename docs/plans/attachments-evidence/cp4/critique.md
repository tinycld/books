# Gate 2 critique: attachments, checkpoint 4 (pending attachments on forms)

Second critique, on the re-captured set. It replaces the first critique.

Scope: the footer only (Memo, Attachments section, totals, save notice). The reference draws only the header and the footer.

Result: 0 INVALID, 0 BLOCKING, 8 NOTE.

## State check

| Shot | Verdict | What it shows |
|---|---|---|
| form-new-1280-light / -dark | valid | New bill. Two pending rows (`vendor-bill.pdf`, `scan.jpg`, "Not saved yet"), each with Remove; compact add row. The reference shows the empty full-height area; the built `form-refused` and `form-offline` shots show that area. |
| form-new-390-light / -dark | valid | Same, stacked: totals, Memo, Attachments. |
| form-draft-1280-light / -dark | valid | Draft bill after Save draft. One stored row (`meter-readings.txt`, "23 B · Test User, Nov 15") above one pending row (`meter-photo.jpg`, "5 B · Not saved yet"); both have Remove; heading "Attachments (2)". |
| form-draft-390-light / -dark | valid | Same, stacked. |
| form-failed-1280-light / -dark | valid | Draft bill, save notice under the header, one failed row with the error in danger color, Retry and Remove. |
| form-failed-390-light / -dark | valid | Same, stacked; the error wraps to four lines beside Retry. |
| form-correction-1280-light / -dark | valid | Edit 1002. "Attachments (2)", limit text, group label "From Bill 1002", two stored rows with no Remove, compact add row. |
| form-correction-390-light / -dark | valid | Same, stacked after Memo. |
| form-refused-1280-light / -dark | valid | New bill, empty full-height add area, the refusal text under the area in danger color. |
| form-offline-1280-light / -dark | valid | New bill, offline banner, empty full-height add area still drawn, Attach files disabled, save buttons disabled. |
| moved-1280-light / -dark | valid | Void expense 1002, heading "Attachments" with no count and no limit text, "Moved to 1002 (edited)", stamps, "Replaced by 1002 (edited)". |

## Findings

### form-new (4 shots)
- form-new-1280-*: footer left column — the Memo label and field start at x=344; the Attachments heading, rows and add area start at x=342 (the right edges differ by the same 2 px). The same offset is in form-draft, form-failed, form-correction, form-refused and form-offline at 1280 — NOTE
- form-new-390-*: nothing found

### form-draft (4 shots)
- nothing found. The stored row above the pending row agrees with the reference (size, uploader, date, Remove; pending row "Not saved yet"; compact add row under the list).

### form-failed (4 shots)
- form-failed-1280-* and form-failed-390-*: action bar — a hover tooltip is in the capture ("Post ⌘↵" at 1280; "Save draft ⌘S" with the hover fill on Save draft at 390). It does not cover the footer — NOTE
- Save notice, failed row, Retry, Remove, wrap of the error at 390: nothing found. The notice has the exact text of the brief and the position of the reference.

### form-correction (4 shots)
- form-correction-1280-* and -390-*: row `OSW-invoice-1002.pdf` — the thumbnail is a blank white tile. In light it reads as an empty box; in dark it is the brightest element of the section. It is the server-made thumbnail of the seeded PDF (a blank page), so the cause is the seed file, not the row — NOTE
- form-correction-*: the state is the Edit before any change, so no row of the correction's own is shown. A pending row with Remove below the open-only "From Bill 1002" rows (the reference's third row) is not in the evidence — NOTE (a gap in the evidence, not a defect in the screen)
- Group label, open-only rows with no Remove, count, limit text, compact add row: nothing found. They agree with the reference. The label reads "From Bill 1002" (spec text); the reference has "From bill 1003".

### form-refused (2 shots)
- form-refused-1280-*: add area — the tooltip "Attach files ⌥A" is above the button and covers the middle of the prompt ("Drag fil… e them"). In the full-height area the tooltip falls on the prompt line each time the button has hover or focus, and focus returns to the button after the file chooser closes — NOTE
- Refusal text under the area: nothing found (danger color, legible in light and dark, two lines, no clipping).

### form-offline (2 shots)
- form-offline-1280-*: the built state has no rows, so the disabled Remove of a row is not in the evidence — NOTE
- The area stays drawn and Attach files is disabled, as the spec and the reference decided: nothing found.

### moved (2 shots)
- moved-1280-*: under "Moved to 1002 (edited)" — the reference shows a second line "No attachments"; the build shows only the moved line. Spec §3.3 says "a reader, or anyone on a void document, sees "No attachments"", but §3.6 names only the moved line for a replaced original ("lists none and says "Moved to <number> (edited)" under its Attachments heading"), and the moved line already tells the reader that no file is here. The two spec texts do not agree, so there is no clear rule to quote; the driver decides if the reference line must come back — NOTE
- No count and no limit text on the replaced original (lesson 47): correct.
- A hover tooltip ("View journal entry j") is in the capture; it is outside the footer.

### States not captured
- The fix round added two states that have no shot: the section disabled while a save runs, and a refused delete shown on its row. Their appearance is not judged — NOTE

## Design notes (not findings)
- Pending image rows show the type icon because the file is not stored. Stored image rows (form-correction, `packing-slip-photo.png`) show the Thumbnail, as the brief settled.
- The built icon tile has a border; the reference tile is a filled muted square. Both are legible in light and dark.
- The built form-new shows two pending rows; the reference shows the empty area. The empty area is in form-refused and form-offline.

## For gate 3
- form-failed: the row error is a file-type refusal ("utility-bill.pdf is not a file type Books keeps…") and the row offers Retry. A retry of a type refusal cannot succeed.
