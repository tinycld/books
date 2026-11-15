# Gate 2 critique after the fix round — estimate-public-link, checkpoint 4 (Decline note and help)

Scope: the Books decline note in the estimate form and in the read view. The help topic has no screenshot and is not judged here.

Result: 0 INVALID, 0 BLOCKING, 4 NOTE.

## State check

| Shot | State | Result |
|---|---|---|
| books-note-1280-light | Estimate 1006, Rejected, note with the long reason | valid |
| books-note-1280-dark | same | valid |
| books-note-390-light | Estimate 1006 at 390, note with the long reason in view | valid (was INVALID) |
| books-note-390-dark | same | valid (was INVALID) |
| books-note-empty-1280-light | Estimate 1007, Rejected, note with the date only | valid |
| books-note-empty-1280-dark | same | valid |
| read view (books-read-note-*) | no built shot | judged from code, see below |

## books-note-390-light, books-note-390-dark

The note is in the band directly under the Status field. The lead and "Reason:" are muted, the reason is in the foreground color. The full reason shows in 6 lines with its line break, inside the band, with no cut and no overflow. The sticky bar does not cover it. Legible in light and dark. Agrees with the spec ("full text, wrapped, never cut") and with the reference's decision (note under Status, inside the card).

The two NOTE items of the 1280 shots (gap, 2 px edge) show here also; they are not counted again.

## books-note-1280-light, books-note-1280-dark

No change from the first critique. Agrees with the spec and the reference.

- books-note-1280-*: band, between the Status select and the note — the gap is about 50 px, larger than the gap between a label and its field, so the note reads as loose text at the bottom of the band. — NOTE
- books-note-1280-*: band, left edge of the note — the note text starts 2 px left of the field labels ("Status", "Customer"). — NOTE

## books-note-empty-1280-light, books-note-empty-1280-dark

Nothing found (the two NOTE items above apply; not counted again).

## Read view — judged from code (no built shot)

Files read: `EstimateReadDetails.tsx`, `EstimateDeclineNote.tsx`, `DocumentReadView.tsx` (`ReadBand`), `DocumentDetail.tsx`.

The first critique's BLOCKING item is RESOLVED.

- `StatusDetail` is now `min-w-0 max-w-full items-start gap-0.5`, the same width rule as `DocumentDetail`. The 420 px cap moved to the note (`className="mt-1 max-w-[420px]"`).
- The details row (`flex-row flex-wrap`) is a stretched child of its column, so its width is definite. `max-w-full` limits `StatusDetail` to that width. The note is an `items-start` child, so its width is the smaller of its text, 420 px, and the cell. The two `Text` nodes have no `numberOfLines`, so they wrap in that width.
- 390 (phone branch: `flex-col`, column without `flex-1`): the row is about 326 px wide (390 − 32 page − 32 band). The cell is at most 326 px. The reason wraps inside the band, as reference `books-read-note-390-*`.
- 768 with the sidebar (wide branch: `flex-row gap-6`, columns `min-w-0 flex-1`): each column is about 180 px (the exact value depends on the sidebar width). `min-w-0` on the column and `max-w-full` on the cell keep the cell inside the column. The reason wraps; it does not go past the band.
- 1280: each column is about 434 px. The cell is at most 420 px. Inside the band.
- The load-error row gets the same `className`, with `flex-wrap`, so it has the same limits.
- The note stays under the status badge, `testID` `estimate-read-decline-note`, with the form note's colors.

Remaining items:

- read view at 1280: details row — the two dates use about 220 px of the 434 px column, and the Status cell with the long reason has a 420 px basis, so Status wraps to its own line under the dates. The reference draws Status beside the dates. The note stays under the badge, so the reference's decision holds. — NOTE (unchanged from the first critique)
- read view at 768 with the sidebar: Status cell — the column is about 180 px, so the long reason has about 12 lines and the band becomes tall. Contained and legible. — NOTE

There is still no shot of the read view. This result is from code only.

## For gate 3

- Form shots: the back link above "Estimate 1007" reads "Journal entries" (the estimate was opened through search). Check that the label and target are correct for an estimate. Not part of this checkpoint's Delivers line.
- Read view: no automated or visual evidence of the note for a reader (plan self-review 4 accepts this).
