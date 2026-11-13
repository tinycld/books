# Design critique: estimate-form, checkpoint 3 (Convert, delete and undo)

Built: `docs/plans/estimate-form-evidence/cp3/`. Reference: `docs/plans/estimate-form-reference/`. All 20 built shots were read. The reference was read in light only (10 shots).

Result: 0 INVALID, 1 BLOCKING, 1 NOTE.

## State check

| Shot (light and dark) | State shown | Result |
|---|---|---|
| delete-390 | Saved Pending estimate, delete confirm as a sheet | VALID |
| delete-1280 | Saved Pending estimate, delete confirm dialog | VALID |
| delete-refused-1280 | Delete dialog with the server refusal (estimate is Rejected, the real path) | VALID |
| phone-more-390 | More sheet open on a saved estimate | VALID |
| closed-1280 | Closed estimate read view, posted invoice | VALID |
| closed-phone-390 | Closed estimate read view at 390, posted invoice | VALID |
| closed-draft-1280 | Closed estimate read view, draft invoice | VALID |
| invoice-from-estimate-1280 | New invoice from an estimate, read-only Customer and link | VALID |
| invoice-from-estimate-phone-390 | Same at 390 | VALID |
| invoice-posted-1280 | Posted invoice read view with "From estimate" under the stamp | VALID |

## Findings

### B1 (BLOCKING): the "Converted to …" line lost its place and its link

Shots: closed-1280-light, closed-1280-dark, closed-draft-1280-light, closed-draft-1280-dark, closed-phone-390-light, closed-phone-390-dark.

- closed-1280-*, closed-draft-1280-*: details band, right of the Status badge — "Converted to invoice 1005" / "Converted to a draft invoice" is plain foreground text with no label, in a row of labelled fields. Its baseline is about 2 px below the values beside it ("Nov 13, 2026", the badge). It reads as a third field value without a label.
- closed-phone-390-*: details band, between the Status row and Tax — the same plain text, on a line of its own, with no label.

Basis:
- Reference decision (closed-1280-light, closed-draft-1280-light, closed-phone-390-light): the line is an underlined accent link on its own row below the message and memo. It has the same style and position as "From estimate 1005" on the posted invoice (invoice-posted-1280). The build keeps the link style for "From estimate" (invoice-posted-1280, invoice-from-estimate-*) but not for "Converted to".
- Brief, stand-ins: "the read mocks `EstimateReadMock`, `ReadBar`, `ReadBand`, `SourceLink` (→ `DocumentReadView` with `EstimateReadDetails` and `DocumentReadActions`, checkpoint 2; `DocumentSourceLink`, checkpoint 3)".
- Spec §3.8: "for a closed estimate the line "Converted to invoice 1004" with Open invoice."

The Open invoice button is present and primary in all six shots. The loss is the link and the position of the line.

### N1 (NOTE): required mark on a read-only Customer

Shots: invoice-from-estimate-1280-light, -dark, invoice-from-estimate-phone-390-light, -dark.

- Header band, Customer label — the label shows the red required mark ("Customer *") above read-only text. The user cannot change the value. The reference shows no mark, but the reference shows no mark on any field.

## Per screenshot

- delete-390-light, delete-390-dark: nothing found.
- delete-1280-light, delete-1280-dark: nothing found.
- delete-refused-1280-light, delete-refused-1280-dark: nothing found. The refusal text is legible in the two schemes. The bar correctly has no Convert on a Rejected estimate.
- phone-more-390-light, phone-more-390-dark: nothing found. The Save row is an approved addition (brief, "Pass-2 flaw carried").
- closed-1280-light, closed-1280-dark: B1.
- closed-draft-1280-light, closed-draft-1280-dark: B1.
- closed-phone-390-light, closed-phone-390-dark: B1.
- invoice-from-estimate-1280-light, invoice-from-estimate-1280-dark: N1.
- invoice-from-estimate-phone-390-light, invoice-from-estimate-phone-390-dark: N1. The read-only Customer and the link are stacked, as in the reference.
- invoice-posted-1280-light, invoice-posted-1280-dark: nothing found. "From estimate 1015" is under the Posted-by stamp, as in the reference.

## Outside this checkpoint (not counted)

- invoice-posted-1280-*: the Due date value reads "Due Dec 13, 2026" under the label "Due date". The word "Due" is there twice. The reference shows "Dec 4, 2026". This is the invoice read view of an earlier unit.
- The back link of an estimate reads "Journal entries" (capture notes: from the direct entry URL). The reference shows the same label.

## For gate 3

- closed-1280-*, closed-draft-1280-*, closed-phone-390-*, invoice-posted-1280-*: the read views show no "Message to customer (printed)". invoice-from-estimate-* (an estimate made by the same capture path) shows the message "Thank you for the chance to quote this work. Prices hold until the expiration date." Find out whether those estimates had an empty message or the read view dropped it. The screenshots cannot tell.
- closed-*: the "Converted to …" text has no link style, so it probably cannot be pressed. Confirm whether it is a Tab stop or plain text.
