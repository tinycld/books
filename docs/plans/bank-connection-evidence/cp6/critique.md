# Gate 2 critique — bank-connection checkpoint 6 (Upload and remove bank files)

Delivers judged: the writer's upload area (Choose file, web drop, client checks, busy / done / refused lines) and the Remove button with its confirm dialog.

Data differences named in the capture notes (one seeded file instead of four, the faked `uploaded` row with 50 KB, Nov 5 and no uploader) are not findings.

## State check

- populated-1280-light / -dark: shows the populated panel with the upload area, the files table and a Remove button. Valid.
- populated-390-light / -dark: same on a phone, file as a card with Remove. Valid.
- drag-1280-light / -dark: shows the drop overlay "Drop the bank file here" over the area. Valid. (The overlay is now opaque, which is the merged core direction, PR #439; the reference's translucent overlay with the prompt showing through is superseded.)
- uploading-1280-light / -dark, uploading-390-light / -dark: shows the busy line "Uploading checking-2026-11.csv…" with an activity indicator and a disabled Choose file. Valid.
- uploaded-1280-light / -dark, uploaded-390-light / -dark: shows the green "checking-2026-11.csv uploaded." line and the new row in the list. Valid. Caveat: the new row is the second row because the faked answer's `created` (Nov 5) is older than the seeded row (Nov 6), so this capture cannot show the spec's "first row"; the order shown is `created` desc, which is what the spec asks. Not a finding.
- refused-1280-light / -dark, refused-390-light / -dark: shows the red duplicate refusal with its final period and no added row. Valid.
- remove-1280-light / -dark: shows the "Remove checking-2026-09.csv?" dialog with the body line, Cancel and a destructive "Remove file". Valid.
- remove-390-light / -dark: the same as a sheet. Valid.

INVALID: 0.

## Findings

- populated-1280-light / -dark: nothing found.
- populated-390-light / -dark: nothing found.
- drag-1280-light / -dark: nothing found.
- uploading-1280-light / -dark: nothing found.
- uploading-390-light / -dark: upload area, busy line — the file name wraps at its hyphen ("checking-2026-" / "11.csv…") and the spinner sits on the first line only, so it is not centred on the two-line text. The reference shows the same, so it is the approved direction. — NOTE
- uploaded-1280-light / -dark: nothing found.
- uploaded-390-light / -dark: nothing found.
- refused-1280-light / -dark: nothing found.
- refused-390-light / -dark: nothing found.
- remove-1280-light / -dark: nothing found.
- remove-390-light / -dark: nothing found.

Checked against the spec and the references: the dashed `rounded-xl` area with the Upload icon, the web sentence, the core Button "Choose file", the rule line; the busy line with the indicator and the disabled button; the done line in `text-success`; the refusal in `text-danger` as the server wrote it with its period; the Remove button on each `uploaded` row (outline, small); the dialog title, body and button labels; light and dark legibility; the dialog as a sheet on a phone. All match.

## For gate 3

- The `uploaded` capture cannot prove "the file is the first row" (fake `created` older than the seeded row); e2e test 2 asserts the order.

CRITIQUE: 0 INVALID, 0 BLOCKING, 1 NOTE
