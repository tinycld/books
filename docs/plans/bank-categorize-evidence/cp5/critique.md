# Gate 2 critique — bank-categorize, checkpoint 5 (Chosen rows, Reviewed, Undo, help)

Verdict: CRITIQUE: 0 INVALID, 1 BLOCKING, 2 NOTE

Read: all 52 built PNGs (13 shots x 390/1280 x light/dark). Reference: the 26 light PNGs, plus `dialog-busy-390-dark` and `added-1280-dark`. The other 24 dark reference PNGs were not opened; the dark built shots were judged on their own and against the light reference structure.

Data differences that are not findings: entry numbers "JE-23" / "TR-2"; the seed connects 1000 and 2100 only; e2e account names ("Bank e2e w2-…"); the "Sales Stub" tab and flask rail icon.

## State check

Each built shot shows the state of its name. No INVALID.

| shot | 390 light | 390 dark | 1280 light | 1280 dark |
|---|---|---|---|---|
| selected | valid | valid | valid (third chosen row is below the fold; "3 selected" shows) | valid |
| dialog | valid | valid | valid | valid |
| dialog-busy | valid | valid | valid | valid |
| batch-done | valid | valid | valid | valid |
| batch-failed | valid | valid | valid | valid |
| reviewed | valid | valid | valid | valid |
| added | valid | valid | valid | valid |
| added-split | valid | valid | valid | valid |
| added-transfer | valid | valid | valid | valid |
| added-loading | valid | valid | valid | valid |
| added-error | valid | valid | valid | valid |
| undone | valid | valid | valid | valid |
| read-only-added | valid | valid | valid | valid (a "Reconnecting…" pill shows at the top; see NOTE 2) |

## Findings

### selected (4 shots)
Nothing found. Bar order Match, Categorize, Exclude, Clear agrees with the reference. The FAB over a row amount at 390 is also in the reference.

### dialog (4 shots)
Nothing found. Title, sums line, Account with focus ring, Payee, Cancel, Categorize agree with the reference at both widths and in both schemes.

### dialog-busy (4 shots)
- dialog-busy-390-light, dialog-busy-390-dark: selection bar behind the sheet — the bar's Categorize button changes to a spinner with "Categorizing…", the row becomes wider than the panel, and Clear is cut at the panel's right edge ("Clea"). — BLOCKING (reference decision: `dialog-busy-390-light` / `-dark` show the bar as "Match · Categorize · Exclude · Clear", all four as dimmed text, all inside the panel, and the busy sign only in the dialog; spec: "While the batch runs, the dialog's button shows "Categorizing…" with core `ButtonSpinner` and the bar's other actions are disabled").
- dialog-busy-1280-light, dialog-busy-1280-dark: the same cause. A piece of the bar's second busy button ("…izing…") shows at the right edge of the dialog, beside Exclude. In the reference no bar text shows there. Counted in the BLOCKING finding above, not separately.

The dialog itself (disabled Account and Payee, dimmed Cancel, "Categorizing…" with spinner) agrees with the reference.

### batch-done (4 shots)
Nothing found. "Categorized 3 transactions." in muted text under the toolbar, as in the reference.

### batch-failed (4 shots)
Nothing found. Red line under the bar, two rows stay chosen, "2 selected". The line wraps to two lines at 390, as in the reference.

### reviewed (4 shots)
Nothing found. In Books column with "Added · Journal entry JE-23" and "Matched · Bill payment 1001" as links; phone cards show the text as the third line.

### added (4 shots)
Nothing found. Heading, link row (number, date, amount), line (account, amount), "Added … by …", Undo. Agrees with the reference. The seeded row has no payee, so the link row's second line holds the date only.

### added-split (4 shots)
- added-split-*: line list — the built data has only short account names ("4000 Consulting Income", "6100 Rent"). The reference shows a long account label cut with an ellipsis before the amount ("6300 Bank charges, merchant processin…"). No built shot shows that case, so the truncation is not verified here. — NOTE

Otherwise nothing found: payee on the link row, memo under each line, negative amount, tabular alignment.

### added-transfer (4 shots)
Nothing found. Link row "Transfer TR-n", no lines, Added by, Undo.

### added-loading (4 shots)
Nothing found. Heading with core spinner below it, as in the reference.

### added-error (4 shots)
Nothing found. "Books could not load this transaction's entry." and Retry, as in the reference.

### undone (4 shots)
Nothing found. Result line in muted text; wraps to two lines at 390, as in the reference.

### read-only-added (4 shots)
- read-only-added-1280-dark: top centre of the page — a "Reconnecting…" pill. It is in no other shot, the light one included. It is probably from the capture's fake, not from the feature, but the shot is not a clean picture of the state. — NOTE (take the shot again when the fix round captures)

Otherwise nothing found: facts show, no Undo.

## Not from this checkpoint (not counted)
- read-only-added-390-*: the reader's "View register" link in the panel header makes the title "1000 Business Checking" wrap to two lines. The link is not part of the Delivers line.
- batch-failed-1280-*, undone-1280-*: the account card strip cuts a fourth card at the right edge. The strip is from an earlier unit.

## For gate 3
- dialog-busy: the selection bar's Categorize goes to its busy form while the dialog runs the batch (the same cause as the BLOCKING finding). Check that the bar's Categorize is only disabled, not busy, when the batch comes from the dialog.
