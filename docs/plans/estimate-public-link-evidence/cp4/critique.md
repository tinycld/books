# Gate 2 critique — estimate-public-link, checkpoint 4 (Decline note and help)

Scope: the Books decline note in the estimate form and in the read view. The help topic has no screenshot and is not judged here.

Result: 2 INVALID, 1 BLOCKING, 3 NOTE.

## State check

| Shot | State | Result |
|---|---|---|
| books-note-1280-light | Estimate 1006, Rejected, note with the long reason | valid |
| books-note-1280-dark | same | valid |
| books-note-390-light | Estimate 1006 form at 390 | INVALID |
| books-note-390-dark | same | INVALID |
| books-note-empty-1280-light | Estimate 1007, Rejected, note with the date only | valid |
| books-note-empty-1280-dark | same | valid |
| read view (books-read-note-*) | no built shot | judged from code and reference, see below |

## books-note-390-light, books-note-390-dark — INVALID

The shots show the form from the title down to the Status field. The decline note is not in the image: it is below the fold, behind the sticky bar (Cancel / Save & close / More). The reference `books-note-390-*` shows the note with its wrapped reason. Not critiqued.

Capture again with `estimate-decline-note` scrolled into view (page loaded at 390). The wrap of the long reason at 390 has no evidence until then.

## books-note-1280-light, books-note-1280-dark

Agrees with the spec: the note is in the band directly under the Status row; the lead and "Reason:" are muted, the reason is in the foreground color; the full reason shows, wrapped, with its line break. Legible in light and dark. The date (Nov 14, 2026) differs from the reference because the seed uses its own today: not a finding.

- books-note-1280-*: band, between the Status select and the note — the gap is about 50 px (reference: about 38 px), larger than the gap between the label and its field, so the note reads as loose text at the bottom of the band, not as part of Status. Cause: `mt-4` on top of the form row's own bottom space. — NOTE
- books-note-1280-*: band, left edge of the note — the note text starts 2 px left of the field labels ("Status", "Customer") above it. — NOTE

## books-note-empty-1280-light, books-note-empty-1280-dark

Agrees with the spec and the reference: one line, "Declined by the customer on Nov 14, 2026.", no "Reason:" line, no empty gap under it. The two notes above (gap, 2 px edge) apply here also; they are not counted again. Nothing else found.

## Read view — judged without a built shot

No built screenshot exists (the e2e server has no Books reader; the checkpoint's Gates line allows this). This part is judged from `EstimateDeclineNote.tsx`, `EstimateReadDetails.tsx`, `DocumentReadView.tsx` (`ReadBand`), `DocumentDetail.tsx`, the form shots and the reference `books-read-note-*`.

Agrees with the spec and the reference by code: the note is a child of `StatusDetail`, directly under the status badge, `testID` `estimate-read-decline-note`, same component and colors as the form's note, no `numberOfLines`.

- read view at 390: Status detail with the long reason — `StatusDetail` is `max-w-[420px] items-start` with no `min-w-0 max-w-full`, and it sits in `ReadBand`'s `flex-row flex-wrap` row. On a phone the band's inner width is about 326 px (390 − 32 page − 32 band). A flex item does not shrink there, so with the long reason its width is its text's, up to 420 px: the reason goes past the band's edge and the screen's edge. `DocumentDetail` has `min-w-0 max-w-full` for this exact case (its comment: "in a wrapping row of details its width would otherwise be its text's, past the card's edge"). — BLOCKING (spec §3.5: "Reason: <reason>" under it (full text, wrapped, never cut)"; reference `books-read-note-390-*` wraps the reason inside the card). Found in code, not in a shot: confirm at 390 after the fix (`max-w-full` with the 420 px cap, as `DocumentDetail`).
- read view at 1280: details row — the right column of `ReadBand` is about 430 px wide; the two dates plus a 420 px Status detail do not fit in one row, so Status with the note wraps under the dates. The reference draws Status beside the dates. The note stays under the badge, so the reference's decision holds. — NOTE

## For gate 3

- Form shots: the back link above "Estimate 1006" reads "Journal entries". The estimate was opened through search; check that the label and target are correct for an estimate (not part of this checkpoint's Delivers line).
- Read view: no automated or visual evidence of the note for a reader (plan self-review 4 accepts this); the BLOCKING item above is the result of that gap.
