# Gate 2 design critique: write-off, checkpoint 2 (Write off dialog on invoice)

Verdict: `CRITIQUE: 4 INVALID, 0 BLOCKING, 10 NOTE`

Scope: the 42 built shots in `docs/plans/write-off-evidence/cp2/`, each against the file of the same name in `docs/plans/write-off-reference/`. Only what checkpoint 2 delivers was judged: the dialog, the invoice badge, the Written off totals row, the Write-offs section. The lines table behind the invoice, the "More" button on the wide bar (audit history, `DocumentReadActions`) and the place of the memo block are not from this checkpoint and are no findings.

Code read to settle two points (no other code was read): `components/documents/InvoiceWriteOffs.tsx`, `components/documents/InvoiceCreditMemos.tsx`, `components/documents/DocumentReadActions.tsx`, `lib/party-transactions.ts` lines 1-170.

## State check

| Shot | Widths / schemes | State shown | Result |
|---|---|---|---|
| dialog | 390, 1280 / light, dark | Dialog open, defaults (date today, 6050 Bad debts, empty reason, notice with tax sentence) | valid |
| dialog-filled | 390, 1280 / light | Reason filled | valid |
| dialog-errors | 390, 1280 / light, dark | Date error only. The reference state has two field errors: the date error and the account error (red border on the select, "Choose an account" below it). The account holds its default 6050 Bad debts, so the account error is not drawn | INVALID (4 shots) |
| dialog-refused | 390, 1280 / light, dark | Root refusal in the error summary (faked 400) | valid |
| dialog-no-account | 390, 1280 / light, dark | "Add an expense account to the chart of accounts", action disabled | valid |
| dialog-loading | 390, 1280 / light | Figure, three skeleton rows, action disabled | valid |
| dialog-load-error | 390, 1280 / light | Load error with Retry, action disabled | valid |
| dialog-saving | 390, 1280 / light | Cancel and action dimmed (write held) | valid |
| dialog-no-tax | 390, 1280 / light | Notice with one sentence | valid |
| invoice | 390, 1280 / light, dark | Posted invoice with an open balance; Write off in the wide bar | valid |
| invoice-written-off | 390, 1280 / light, dark | Written off badge, Written off totals row, Write-offs section with one Posted row | valid |
| invoice-reopened | 390, 1280 / light | Write-offs section with one Void row. The invoice above it reads Written off with $0.00 (faked read, as the driver said); the reference's reopened invoice (Posted badge, open balance, Write off offered again) is not shown | valid for the section only |
| invoice-long | 390, 1280 / light, dark | Write-offs section with two rows, long numbers and a large amount (faked read) | valid for the section only |
| invoice-section-error | 390, 1280 / light | Section notice with Retry | valid |

### INVALID detail

- dialog-errors-390-light, dialog-errors-390-dark, dialog-errors-1280-light, dialog-errors-1280-dark: INVALID. Each shows only the date error. The account error of the reference (and of the spec: "an account is chosen: 'Choose an account'") has no built shot, so its drawing (the select's error border, the text under it, the gap to "Reason (internal)") is not verified. Capture fix: make the default account empty before the submit, for example fake the `books_accounts` read with expense accounts that have no `bad_debts` detail type and fake the `books_write_offs` read empty, then fill the early date and press ⌘↵. The part that is shown (the date error under the date field, in light and dark) agrees with the reference.

## Findings

No BLOCKING finding.

### dialog (4 shots), dialog-filled (2), dialog-no-tax (2), and every other dialog shot with this customer

- dialog-*: summary line under the title — with a long customer name the line wraps inside the date ("… · Nov 19," / "2026"), at 390 and at 1280. The reference's shorter name did not show this case — NOTE

Nothing else found in dialog-390-light, dialog-390-dark, dialog-1280-light, dialog-1280-dark, dialog-no-tax-390-light, dialog-no-tax-1280-light: order, figure, fields, notice and footer agree with the reference; light and dark are legible.

### dialog-filled

- dialog-filled-390-light: above the footer, right — a tooltip "Write off $205.46 ⌘↵" covers the lower edge of the notice. It is a hover artifact of the capture (the 1280 shot has none); move the pointer off the button before the shot — NOTE
- dialog-filled-1280-light: nothing found.

### dialog-refused

- dialog-refused-390-light, dialog-refused-390-dark: bottom of the sheet body — only the summary's heading "Please fix the following errors:" is in view; the refusal text is below the fold, under the footer. The reference showed one line of it; here the two-line summary line pushes it out. A user sees a red box with no reason until the body is scrolled — NOTE
- dialog-refused-1280-light, dialog-refused-1280-dark: bottom of the dialog body — at 1280x800 the dialog is at its full height and the error summary's lower edge sits on the footer divider with no space below it; the reference has about 20 px there — NOTE

### dialog-no-account

- dialog-no-account-* (4 shots): the "Write off to" field — the select still reads "Choose an account" and looks usable though it has no option, and the error text is closer to "Reason (internal)" than a field error is in the errors state. The reference shows the same — NOTE

### dialog-loading, dialog-load-error

- dialog-loading-390-light, dialog-load-error-390-light: sheet header — a blue focus ring on the close X. dialog-loading-1280-light, dialog-load-error-1280-light: footer — a black focus ring on Cancel. The reference has no ring; the date field does not exist yet, so the focus falls on the first control — NOTE

Nothing else found: figure, three skeleton rows, the load error with Retry and the disabled action agree with the reference.

### dialog-saving

- dialog-saving-390-light, dialog-saving-1280-light: the three fields — they look the same as when they can be edited; only Cancel and the action are dimmed. The reference shows the same — NOTE

### invoice

- invoice-1280-light, invoice-1280-dark: action bar — with Write off the bar has nine controls and wraps; "Download PDF" stands alone on a second row. The reference wraps the same way — NOTE
- invoice-390-light, invoice-390-dark: nothing found (More and Edit, as the reference).

### invoice-written-off

- invoice-written-off-390-light, -390-dark, -1280-light, -1280-dark: nothing found. Badge "Written off" (muted), totals row "Written off −$215.50" between Total and Balance due, section "Write-offs" as a table at 1280 and as cards at 390, with no sideways scroll; legible in dark.

### invoice-reopened

- invoice-reopened-390-light, invoice-reopened-1280-light: Write-offs section, status of the row — the Void badge is grey (muted); the reference draws it red. The build follows the plan ("with the tones `InvoiceCreditMemos` uses") and the one lifecycle rule of the app (`lifecycleStatus`: Void is muted), so it agrees with every other Void badge in Books. In this shot it has the same look as the "Written off" badge of the header — NOTE

### invoice-long

- invoice-long-* (4 shots): the same grey Void badge as in invoice-reopened (counted there).
- invoice-long-* (4 shots): totals panel — the shot stresses only the section. The reference's long state also shows the Written off totals row with a large amount ("−$1,234,567.89") and a long invoice number in the header; no built shot shows them — NOTE

Nothing else found: "WO-2026-000001004" and "$12,345,678.90" fit at 390 (cards) and at 1280 (table); no column collapses and nothing scrolls sideways.

### invoice-section-error

- invoice-section-error-390-light, invoice-section-error-1280-light: nothing found. The notice and Retry agree with the reference.

## For gate 3

- Phone (390): the sheet shows a close X in every dialog shot, also in dialog-saving-390-light, where it looks active. The spec says "While the write runs the dialog stays open … and Cancel does nothing." Check that the X (and a swipe down) does not close the sheet while the write is held.
- dialog-loading / dialog-load-error: the focus is on the X (390) or on Cancel (1280). The spec says "On open the Write-off date has focus on web". Check that the date field takes the focus when the reads end and the form is drawn.
- dialog-refused-390: check that the refusal text can be reached (the body scrolls) and consider a scroll to the summary after a refused submit.
- invoice-390: Write off is not in view (More and Edit only). The spec says "on a phone it is a row of More with its key as the row's `shortcut` text". No shot shows More open; check the row and its key there.
- invoice-reopened: the reopened invoice itself (Posted badge, no Written off totals row, Write off offered again) has no built evidence in this checkpoint; it can be made through the UI from checkpoint 3.
