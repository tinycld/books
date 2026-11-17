# Gate 2 design critique — credit-memo-form, checkpoint 3

Scope: the Delivers line of checkpoint 3 (form, read view, PDF tab, states). The invoice-link row of the form is checkpoint 4 and is not judged.

Read: all 64 built shots (light and dark, each width). Reference: the light shot of each name at each width. The dark reference shots were not read.

Result: 0 INVALID, 1 BLOCKING (one cause, visible in 6 shot names), 5 NOTE.

## State check

| Shot | Shows the named state? |
|---|---|
| new (1280, 390) | Yes. New form, Customer has focus, one empty Item line. |
| draft, draft-phone | Yes. Seeded draft (St. Jude), 2 lines. |
| correction, correction-phone | Yes. "Edit 1001", the replace notice, all line kinds. |
| exempt | Yes. Exempt customer ("Tax exempt" hint), tax $0.00. |
| errors (1280, 390) | Yes, but it shows only one refusal (see NOTE 1). |
| pdf-unsaved (1280, 390) | Yes. "Save a draft to see the PDF". |
| pdf-stale (1280, 390) | Yes. "Shows the last saved version" above the server page. |
| pdf-posted (1280, 390) | Yes. Posted memo 1001, PDF tab, server page. |
| posted, posted-phone | Yes. Posted memo 1001, Details tab. |
| phone-more | Yes. More sheet open on the posted memo. |
| void, void-phone | Yes. Void badge, "Voided by" stamp (see NOTE 2). |
| reader, reader-phone | Yes. No Edit/Void/Copy; View journal entry and Download PDF only. |
| no-access, cannot-edit, not-found, loading, error (1280, 390) | Yes, each. |

No shot is INVALID.

## Findings

### BLOCKING

**B1. Read view totals: the tax row shows a negative amount, and the column does not add up.**

- posted-1280-light/dark: totals panel, row "Denver combined (8.71%)" — shows `-$42.07` between Subtotal `$1,304.70` and Total `$1,346.77` — BLOCKING
- posted-phone-390-light/dark: same row — `-$42.07` — BLOCKING
- reader-1280-light/dark: same row — `-$42.07` — BLOCKING
- reader-phone-390-light/dark: same row — `-$42.07` — BLOCKING
- void-1280-light/dark: same row — `-$16.46` between Subtotal `$189.00` and Total `$205.46` — BLOCKING
- void-phone-390-light/dark: same row — `-$16.46` — BLOCKING

Basis:
- Reference decision: `posted-1280-light.png` and `posted-phone-390-light.png` show the row as `$42.07`; `void-1280-light.png` shows `$8.89`. The reference draws the tax as a positive amount that adds to the Total.
- Spec §3.5: "Right, under Amount: Subtotal, the tax line "<rate or group> (<percent>)" with its amount (none with no tax), **Total** (`border-t`, `font-semibold`), and **Credit amount** (= Total)."
- Spec §3.4: "Amounts are entered positive".
- The same memo's form (`correction-1280-light`) and its PDF (`pdf-posted-1280-light`) show `$42.07`. Only the read view shows the minus sign.

Probable cause (for the implementer, not verified in code): the read view reads the stored tax lines, which a credit kind stores negated (spec §4.3 "a credit kind writes `gross_amount`, `taxable_amount` and `amount` negated").

### NOTE

**N1. errors-1280 / errors-390 (light, dark): the capture shows one refusal only.**
The reference `errors` shot shows three things: the root summary box, a refusal under Customer, and a refusal under the lines. The built shot shows only "Lines is required" under an empty table ("No rows yet."). The driver declared the empty table and the core text as known and planned. Two items stay open:
- The look of `FormErrorSummary` and of a refusal under Customer is not shown in any built shot of this checkpoint. This gate cannot judge them.
- For comparison, the spec text is: "Post adds "Add at least one product or service line"". The built text is "Lines is required". The driver must confirm that this is the planned text for this capture path.

**N2. void-1280 / void-phone-390: the "Replaced by … (edited)" stamp is not shown.**
The reference `void` shot is a replaced original and draws the link "Replaced by 1002 (edited)" under the stamps. The built shot is a memo voided with Void, so the stamp row is absent. Its look is not evidenced in this gate. (Spec §3.7: ""Posted by …", "Voided by …", "Replaced by 1001 (edited)"".)

**N3. correction-phone-390 (light, dark): the capture stops at the Subtotal line.**
The 2600 px height ends at line 4 of 7. The Percent and Description cards, the totals, the message and the memo of a correction are not in view at 390. In the last visible card the words repeat: kind label "Subtotal", field label "Amount", then the row "Subtotal $983.00". This is the shared line card.

**N4. correction-1280 (light, dark): line 7 Description shows a cut fourth text line.**
The textarea shows three lines and the top half of a fourth ("the Portland metro area was…"). The reference `draft-1280` shows the same cut on its first line, so this is the shared lines table, not new in this build.

**N5. posted, reader, pdf-posted: the link reads "For invoice 1003".**
The plan's seed pick names invoice 1004 ("number 1004, the third of `INVOICE_SEED_IDS`"). The read view and the PDF agree with each other (1003), so this is a data point for the driver, not a look defect.

## Per screenshot

- new-1280-light/dark, new-390-light/dark: nothing found.
- draft-1280-light/dark, draft-phone-390-light/dark: nothing found.
- correction-1280-light/dark: N4.
- correction-phone-390-light/dark: N3.
- exempt-1280-light/dark: nothing found.
- errors-1280-light/dark, errors-390-light/dark: N1.
- pdf-unsaved-1280/390 light/dark: nothing found.
- pdf-stale-1280/390 light/dark: nothing found.
- pdf-posted-1280/390 light/dark: N5. The white page on the dark scheme is correct for paper.
- posted-1280-light/dark, posted-phone-390-light/dark: B1, N5.
- phone-more-390-light/dark: nothing found. (Void is drawn in the destructive color and the key reads "⌘P"; the reference shows plain text and "$mod+p". The build is the better of the two.)
- void-1280-light/dark, void-phone-390-light/dark: B1, N2.
- reader-1280-light/dark, reader-phone-390-light/dark: B1, N5.
- no-access, cannot-edit, not-found, loading, error (all widths and schemes): nothing found.

## For gate 3

- B1 is probably a data-sign defect in the read view's tax rows (the stored snapshot is negated for a credit kind). Check which value `DocumentTotalsPanel` receives on the read view.
- N1: confirm that Post on a form with no usable line gives the refusal text the spec names, and that the e2e assertion on `credit-memo-line-error` agrees with the built text.
