# Gate 2 re-critique (round 2): credit-memo-form, checkpoint 3

Scope: only the shots captured again (errors, posted, posted-phone, reader, reader-phone, void, void-phone), light and dark. Built: `docs/plans/credit-memo-form-evidence/cp3/`. Reference: `docs/plans/credit-memo-form-reference/`.

Result: 0 INVALID, 0 BLOCKING, 6 NOTE.

Round-1 fix confirmed: the read view's tax row is positive ("Denver combined (8.71%)  $42.07" in posted and reader; "$16.46" in void), and Total = Credit amount = the big figure in each shot.

## errors-1280-light, errors-1280-dark

State check: VALID. A new credit memo after Post, with a refusal under Customer ("Customer is required") and a refusal under the empty lines table ("Lines is required"). No invoice-link row (checkpoint 4), as the Gates line says.

Findings:
- errors-1280-light/dark: under the lines table — the refusal reads "Lines is required" (core's required text) and the table shows "No rows yet."; the reference shows one empty Item line and "Add at least one product or service line". The shot has zero rows, so this is a different input than the reference's (an empty default line); the Post rule's own text is not shown in this shot. The text is legible and in the correct place (under "Add line", `text-destructive`, both schemes) — NOTE
- errors-1280-light/dark: whole shot — the shot shows fewer refusal places than the reference: no `FormErrorSummary` banner and no server refusal under Customer. This agrees with the plan ("The summary holds only the root refusal"), so it is not a defect of the build; the banner's look is not shown in this round — NOTE
- errors-1280-light/dark: band, Email — with no customer, the "Email" label has nothing below it (no value, no placeholder, no dash); "Bill to" has at least "Edit address". The label alone looks unfinished — NOTE
- errors-1280-light/dark: band, bottom edge — the space below the date/Tax row (about 42 px) is about twice the space above the Customer label (about 20 px). The band looks bottom-heavy when there is no link row — NOTE

## posted-1280-light, posted-1280-dark

State check: VALID. Read view of posted "Credit memo 1001", badge Posted, tabs Details | PDF view, band with the invoice link as its last row, the lines grid with every line kind, totals ending in "Credit amount", message, memo, "Posted by …", actions More, Edit, Void, Copy, View journal entry, Download PDF.

Nothing found. Structure, hierarchy and spacing agree with the reference. Differences are real data only ("For invoice 1003", "Posted by Test User, Nov 16, 2026"). Dark is legible.

## posted-phone-390-light, posted-phone-390-dark

State check: VALID. Same posted memo at 390: big figure under the title, lines as cards, totals, notes, bar with More and Edit.

Nothing found.

## reader-1280-light, reader-1280-dark

State check: VALID. A reader's read view: no "+ New", actions More, View journal entry, Download PDF only (no Edit, Void, Copy).

Nothing found.

## reader-phone-390-light, reader-phone-390-dark

State check: VALID. A reader's read view at 390, bar with More only, as the reference.

Nothing found.

## void-1280-light, void-1280-dark

State check: VALID. Read view of a void memo ("Credit memo 1004", badge Void), "Posted by …" and "Voided by …", actions More, Copy, View journal entry, Download PDF (no Edit, no Void).

Findings:
- void-1280-light/dark: under the stamps — the built memo is a plain void, so the reference's "Replaced by 1002 (edited)" link does not show. Not a defect (this record has no correction); the link's look in the built screen is not shown in this round — NOTE

## void-phone-390-light, void-phone-390-dark

State check: VALID. A void memo at 390 ("Credit memo 1006"; a different record than the wide shot's 1004, both valid), line card, totals, both stamps, bar with More only.

Findings:
- void-phone-390-light/dark: action bar, More — the button is drawn tinted (accent fill and accent text in light, accent text in dark); in reader-phone and in the reference the same button is neutral (outline, foreground text). It looks like a hover or pressed state that stayed after the capture voided the memo through More — NOTE
- The "Replaced by" note of void-1280 applies here too (counted once).

## For gate 3

- errors: with the default empty Item line left in place (the reference's input), confirm that Post shows "Add at least one product or service line" under the lines (spec §3.6: "Post adds \"Add at least one product or service line\""), and decide if a table with zero rows must show the same text in place of core's "Lines is required".
- void-phone: confirm the More button returns to its neutral look after the menu closes (no stuck hover or focus style on touch).
