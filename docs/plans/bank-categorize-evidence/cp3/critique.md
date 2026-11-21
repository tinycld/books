# Gate 2 design critique — bank-categorize, checkpoint 3

Scope: the way switch, Categorize with one account, Transfer, the next-row result line. The Split link (checkpoint 4) is not a finding. `sending-*` and `refused-*` are compared on the button, the disabled fields and the refusal line only. `picker-failed` was not captured and is not critiqued.

All 56 built PNGs and the 56 matching reference PNGs were read (14 shots × 390 / 1280 × light / dark).

Result: 2 INVALID, 2 BLOCKING, 4 NOTE.

## State check and findings, per shot

### categorize (390, 1280 × light, dark)
State: valid. A For review row with no suggestion, Categorize way selected, empty Payee / Account, Memo = bank description, Categorize disabled.
Nothing found. (No Split link: checkpoint 4.)

### categorize-filled (390, 1280 × light, dark)
State: valid. Payee and account picked, Categorize enabled.
Nothing found.

### categorize-picker-1280 (light, dark)
State: valid. The account picker is open: search field, groups by account type, sub-account 6210 indented, tick on 6200.
Nothing found.

### categorize-picker-390 (light, dark)
State: INVALID (both). The shots show the filled form with no picker on screen. They are the same picture as categorize-filled-390, except for a darker backdrop. The capture report says that the picker sheet is open behind the transaction sheet. Not critiqued. See the BLOCKING finding of payee-picker-390 for the cause.

### payee-picker-1280 (light, dark)
State: valid. The payee picker is open: search field, "No payee" with tick, group "Customers".
Nothing found.

### payee-picker-390 (light, dark)
State: valid in part. The Payee sheet is open, but only its top 140 px show (title, search field, "No payee").
- payee-picker-390-light, payee-picker-390-dark: the Payee picker sheet, top of screen — the picker sheet is drawn behind the transaction sheet. The transaction sheet covers the list of customers and vendors, so the user cannot see or press a payee. The same cause hides the account picker fully (categorize-picker-390), so a phone user cannot choose the required account — BLOCKING (spec §3 Categorize: "Payee — Books `SearchPicker` over active customers and vendors (`linePartyOptions`, groups "Customers" and "Vendors"), with a "No payee" choice"; spec §6: "The drawer, the pickers, the split cards, the dialog and the mutations run on web and native."). The reference 390 shots do not show an open picker, so the reference made no decision here. If the cause is the core sheet stacking order, this is a core task.

### sending (390, 1280 × light, dark)
State: valid. Button reads "Categorizing…" and is disabled; Payee, Account, the way switch and Exclude are dimmed.
- sending-*: Memo field — Memo keeps its full-strength text and border while Payee and Account are dimmed, so the form looks half disabled — NOTE. The reference shows the same look. See "For gate 3".
- sending-*: submit button, left of "Categorizing…" — the spinner is almost not visible on the dimmed button (light: white on pale teal; dark: dark teal on dark teal). It looks like an empty gap — NOTE. The reference shows the same.

### refused (390, 1280 × light, dark)
State: valid. "This transaction is already reviewed." in danger color above the enabled Categorize button; the drawer keeps the transaction and the picked account.
Nothing found. The line is legible in light and dark.

### loading (390, 1280 × light, dark)
State: valid. Fact rows, then the spinner in the place of the switch and section, then Exclude.
Nothing found.

### match (390, 1280 × light, dark)
State: valid. "Match (1)" selected, one suggestion ticked, totals line, Match and Find other matches.
- match-* (all 4): directly under the way switch — the line "Books transactions that fit this bank transaction." is missing. The build removed the full `SectionHeading` (title and sentence); the reference removed only the title "Match" — BLOCKING (reference decision: match-390/1280-light/dark show "Books transactions that fit this bank transaction." in muted text between the switch and the first suggestion). The plan text says the section "loses its own `SectionHeading` "Match"", which can be read as the full component; the driver decides if the plan overrules the reference.

### transfer-empty (390, 1280 × light, dark)
State: valid. Transfer way, summary line, "To account" empty, Memo, Record transfer disabled.
Nothing found.

### transfer (390, 1280 × light, dark)
State: valid. 2100 Company Card picked, Record transfer enabled.
Nothing found.

### transfer-in (390, 1280 × light, dark)
State: valid. Received row, "A transfer of $3,100.00 into 1000 Business Checking.", "From account" 1010 Business Savings.
Nothing found. The summary wraps to two lines cleanly.

### read-only (390, 1280 × light, dark)
State: valid. No way switch, no form, no Exclude; fact rows only.
- read-only-390-light, read-only-390-dark: account panel header behind the sheet — "1000 Business Checking" wraps to two lines beside "View register" — NOTE. This is the reader header of an earlier unit, not this checkpoint's work.

### categorize-long (390, 1280 × light, dark)
State: valid. Long description wraps in the fact row; long payee and account names truncate with an ellipsis in the triggers; long memo is cut by the input.
Nothing found.

### added-result-1280 (light, dark)
State: valid. "Added Journal entry JE-25." under the toolbar, muted; the drawer shows the next row with an empty form.
Nothing found on appearance. See "For gate 3" for the number text.

### added-result-390 (light, dark)
State: valid for the drawer (it shows the next row after the add).
- added-result-390-light, added-result-390-dark: the result line — the line "Added Journal entry …" is behind the transaction sheet, so a phone user sees no confirmation while the sheet is open — NOTE. The reference 390 shots show the same.

## Checked and clean across the set
- No table or grid scrolls sideways at 390 or 1280. At 1280 the panel beside the 380 drawer shows the For review list as cards with no clipped amount.
- The way switch sits directly above its section under a top border, as the reference.
- Light and dark: labels, placeholders, muted summary, danger text and disabled buttons are legible.

## For gate 3 (behavior, not findings)
1. sending: confirm that Memo is not editable while the write is sent (spec: "the fields, the way switch and the drawer's Exclude are disabled"). It does not look disabled.
2. added-result: the line reads "Added Journal entry JE-25."; the spec example is "Added Journal entry 1042.". Confirm that the "JE-" prefix is the entry number of this database and not a doubled label.
3. Fact row "Imported Nov 21, 2026" for a run on Nov 20 local time (capture report item 4): possible UTC date.
4. Phone: the open `SearchPicker` sheet is behind the transaction sheet (the BLOCKING finding above); check where the stacking order is set.
5. `picker-failed` cannot be reached on Banking (capture report): driver or human decision.
