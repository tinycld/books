# Gate 2 critique: report-drill-down, checkpoint 2

Scope: the Delivers line (statement figures open Transaction Detail by Account as a separate screen below 1360 px, with a back link to the statement). Built shots are on the shipping route `/a/reports/<id>`, which has no Books sidebar (plan D3); the reference was drawn inside the Books shell. That difference is not a finding.

## statement-1280-light.png

State check: VALID. Shows the Profit and Loss, populated (Income, Cost of goods sold, Expenses, account rows, section totals, Gross profit).

Nothing found.

- Figures that open are drawn as plain figures (`text-foreground`, tabular, right-aligned), as the spec says: "A figure that opens is drawn like any other figure".
- Structure and hierarchy match the reference: back link "Reports", title, chips, document header, Account / Total / % of income.
- The sort marks in the headings are core's real header; the static reference had none. Not a finding.

## statement-1280-dark.png

State check: VALID. Same state as light.

Nothing found. Text, rules and chips are legible.

## screen-section-1280-light.png

State check: VALID. Shows Transaction Detail by Account as its own screen (no panel), back link "Profit and Loss", chips "Period: This fiscal year to date" and "Accounts: All Expense accounts", sections per account with lines and "Total 6100 Rent".

Nothing found.

- The built table is one line per row; the reference wrapped each line onto two (it had 956 px inside the Books shell). Plan D3 decides this: at 1280 on the shipping route the one-line row applies when Date, No. and Amount are uncut. They are uncut. Description narrows with an ellipsis first, as the spec says.
- "Total 6100 Rent" $2,300.00 equals the statement's 6100 Rent figure 2,300.00.
- Period chip keeps the source's preset; Accounts chip reads the group pick. Both match the spec.

## screen-section-1280-dark.png

State check: VALID. Same state as light.

Nothing found.

## screen-month-1280-light.png

State check: VALID. Shows Transaction Detail by Account as its own screen, back link "Profit and Loss by Month", chips "Period: Jan 1 – Jan 31, 2026" and "Accounts: Rent", one section (6100 Rent), its line, "Total 6100 Rent" $1,800.00, report "Total" $1,800.00, "End of report".

- screen-month-1280-light.png: table columns, compared with screen-section — Type starts at about x=279 here and x=240 in screen-section; No., Name, Description and Split also move. The columns fit their content, so the same report has different column positions after different drills. — NOTE

Other points checked, no finding:
- The back link reads "Profit and Loss by Month"; the static reference read "Profit and Loss". The built text is the correct one (gate text: "the back link reads the source's title").
- The month cell gives a Custom range for that month; section total and report Total are equal.
- Total row has the heavy top rule, as in the reference.

## screen-month-1280-dark.png

State check: VALID. Same state as light.

Nothing found beyond the NOTE above (same layout). The heavy rule above Total is legible in dark.

## For gate 3

Nothing visible.

## Summary

CRITIQUE: 0 INVALID, 0 BLOCKING, 1 NOTE
