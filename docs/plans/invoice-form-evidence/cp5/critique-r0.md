# Gate 2 critique — invoice-form checkpoint 5 (Posting, read view and corrections)

Scope: the Delivers line of checkpoint 5 (Post / Post & new with the Post-only line check and refusals, the read view of a posted or void invoice with its actions, the correction form, the Void dialog, the reader's read view, cannot-edit). Checkpoint 6 items (Details / PDF view tabs, Download PDF) are not findings. Form-band and line-table layout decided in checkpoints 3 and 4 (stacked band, "Lines *" label, uppercase BALANCE DUE caption, phone card labels) are not re-judged here.

## State check

| Shot | Light | Dark | Verdict |
|---|---|---|---|
| errors-post-1280 | New invoice, one Description line, "Add at least one product or service line" under the table | same | valid |
| errors-post-phone-390 | same at 390 (scrolled to the error) | same | valid |
| refusal-1280 | Draft invoice, close-date refusal in the error summary | same | valid |
| refusal-phone-390 | same at 390 | same | valid |
| posted-1280 | Invoice 1003, Posted badge, read view, Edit / Void / Copy / View journal entry | same | valid |
| posted-phone-390 | same at 390, More + Edit | same | valid |
| correction-1280 | Edit 1003, Draft badge, replace note, form filled from 1003 | same | valid |
| correction-390 | same at 390 | same | valid |
| void-dialog-1280 | "Void invoice 1003?" dialog, body text, Cancel / Void invoice | same | valid |
| void-dialog-phone-390 | same as a sheet | same | valid |
| void-1280 | Invoice 1004, Void badge, Posted by + Voided by, Copy / View journal entry | same | valid |
| void-phone-390 | Invoice 1005, Void badge, both stamps, More only | same | valid |
| reader-1280 | Invoice 1003 read view, only View journal entry | same | valid |
| reader-390 | same at 390, only More | same | valid |
| cannot-edit-1280 | "This invoice cannot be edited" with back link | same | valid |
| cannot-edit-390 | same at 390 | same | valid |

0 INVALID.

## Findings

### errors-post-1280 (light, dark)
nothing found. The Post check sits under the Add buttons in the error colour, as the reference.

### errors-post-phone-390 (light, dark)
nothing found.

### refusal-1280 (light, dark)
nothing found. The refusal is in the summary above the band with the title "Draft invoice", as the reference. The hover tooltip "Post & new ⌘⇧↵" is a capture artefact.

### refusal-phone-390 (light, dark)
nothing found.

### posted-1280 (light, dark)
- posted-1280: header band — the band is a five-column row (Customer · Bill to · Email · Terms · Invoice date) with Due date and Tax on a second row; Due date lands under Customer, Tax floats under the Email/Terms gap, the Customer name wraps ("Harborview Hospitality / Group") and the email breaks mid-word ("accounts.payable@harbo / rviewhospitality.com"). The reference keeps Customer, Bill to and Email in one left column at full width and groups Terms · Invoice date · Due date in one row with Tax under them. The build separates Due date from Invoice date and makes the Email column too narrow for an address. — BLOCKING (reference `posted-1280`: left column Customer / Bill to / Email; right column "Terms · Invoice date · Due date" in one row, "Tax" under; same in `void-1280`, `reader-1280`)
- posted-1280: totals block — the totals' amounts are flush with the page's right edge (~1264 px) while the lines' Amount column ends at ~1203 px with the Tax column after it; the totals are not under Amount. The build's own form (cp3) aligns them. — BLOCKING (spec §7: "Totals aligned under Amount: shared amount-column width constant; `tabular-nums text-right`")
- posted-1280: message and memo — drawn full width under the totals with the labels "Message" / "Memo"; the reference and the build's own form put "Message on invoice" and Memo in the left column beside the totals. The read view changes where the detail lives from the form it mirrors, and a one-line message runs the full 920 px. — BLOCKING (reference `posted-1280`: "Message on invoice" and "Memo" left of the totals; spec §3.6 "Header as the form")
- Dark: same findings; legibility is fine.

### posted-phone-390 (light, dark)
- posted-phone-390: band — Terms, Invoice date, Due date and Tax are each a full-width stacked field; the reference puts Terms · Invoice date · Due date in one row on the phone too, which keeps the band shorter. — NOTE
- posted-phone-390: message / memo — the "Memo" label sits directly under the last message line with no gap (the "Message" label above has normal spacing); label reads "Message" instead of "Message on invoice". — NOTE
- Dark: same.

### correction-1280 (light, dark)
nothing found. Title "Edit 1003", Draft badge, the replace note with the exact text, lines and totals filled.

### correction-390 (light, dark)
nothing found.

### void-dialog-1280 (light, dark)
nothing found. Title "Void invoice 1003?", body "A reversing entry is posted in the original period. The number is kept.", confirm "Void invoice" (stand-in "Void entry" replaced as planned). The background band shows the posted-1280 band finding; not repeated.

### void-dialog-phone-390 (light, dark)
nothing found.

### void-1280 (light, dark)
- void-1280: header figure and totals — the big figure reads "Balance due $0.00" and the totals' Balance due row reads $0.00 while Total reads $205.46. The spec defines the figure as the total in this unit and the Balance due row as "= Total in this unit"; the reference void (`void-1280`: $560.89 = total) keeps that. If a zero balance on a void invoice is a plan decision, it is not written anywhere the critic was given. — BLOCKING (spec §3.2: "the big figure "Balance due $243.56" (the total in this unit)"; §3.4: "**Balance due** (= Total in this unit)")
- void-1280: header band — same five-column band with the email broken mid-word; see posted-1280. — BLOCKING (same basis)
- void-1280: totals block — not aligned under Amount; see posted-1280. — BLOCKING (same basis)
- Dark: same.

### void-phone-390 (light, dark)
- void-phone-390: figure — "Balance due $0.00" with Total $205.46; same as void-1280. — BLOCKING (same basis)
- void-phone-390: action bar — the only control is "More", drawn with accent-coloured text, while the same "More" on `posted-phone-390` and `reader-390` has foreground-coloured text. One button style for the same control. — NOTE
- void-phone-390: action bar — a void invoice's two actions (Copy, View journal entry) both hide behind one "More" button; with Edit absent the bar has room for them, and the reference shows them as buttons. — NOTE
- Dark: same.

### reader-1280 (light, dark)
- reader-1280: header band — same band finding as posted-1280 (email mid-word break, Due date detached from the dates). — BLOCKING (same basis)
- reader-1280: totals block — same alignment finding as posted-1280. — BLOCKING (same basis)
- reader-1280: message / memo — same placement finding as posted-1280. — BLOCKING (same basis)
- Dark: same.

### reader-390 (light, dark)
- reader-390: action bar — a reader's single action (View journal entry) hides behind a lone "More" button; one action behind a menu is an extra tap for nothing. The reference draws it as a button. — NOTE
- Dark: same.

### cannot-edit-1280 (light, dark)
nothing found. Matches the reference.

### cannot-edit-390 (light, dark)
nothing found.

## Summary

- INVALID: 0
- BLOCKING: 4 distinct (wide read-view band structure and email wrap; totals not under Amount; message/memo moved under the totals; void Balance due figure $0.00 against the spec's "= Total in this unit"). The band, totals and message findings repeat on `void-1280` and `reader-1280`; one fix in `InvoiceReadView` clears all three shots.
- NOTE: 4 distinct (phone band stacks the three date fields; phone Memo label spacing and "Message" label; "More" button colour differs between void and posted/reader phone bars; a lone "More" hiding one or two actions on the reader's and the void phone bars).

## For gate 3

- Void invoice: the stored `total` is 205.46 but the screen shows Balance due 0.00 in two places; confirm which value the read view is meant to show and that the figure and the totals row read the same source.
