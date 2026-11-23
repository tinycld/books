---
title: Run and customize a report
summary: Pick a report, set its period and filters, and change how its numbers look.
tags: [reports, trial balance, general ledger, balance sheet, journal, profit and loss, transaction detail, sales tax liability, customer balance, a/r aging, vendor balance, expenses by vendor, 1099 summary and detail, Audit Log, reconciliation report]
order: 60
---

Books reports, such as the Trial Balance, run in the Reports area of the app. A change to a chip or to Customize applies at once. The Accounts filter applies when you press Apply. There is no Run button. Some large reports do not update by themselves when the books change: see "Reports that you refresh" below.

## Open Books reports

To open Books reports, choose Reports in the Books sidebar. On a phone, swipe in from the left edge of the screen to open the Books menu, then choose Reports. Reports opens with only Books reports shown, under the line "Showing reports from Books". Press a report to open it.

To go back to the Books reports, press Reports at the top of the report. To see the reports of every package, press Show all reports.

## Read the Trial Balance

The Trial Balance shows the balance of each account on one day. Its heading shows your business name (or your organization's name when the business name is empty), Trial Balance, and the day, for example "As of September 30, 2026". The accounts show in the order of the chart of accounts. The columns are Account, No., Debit and Credit.

- An account with a debit balance shows it in Debit. An account with a credit balance shows it, as a positive amount, in Credit. For example, an overdrawn bank account shows in Credit. A balance of zero shows 0.00 in Debit. No amount is negative.
- The Total row adds the rows that show. Without a filter, Debit and Credit have the same total when the books are in balance.
- Asset, liability and equity accounts show their full balance on the day. Income and expense accounts show only the activity from the start of the fiscal year that holds the day. The income and expense of earlier years show on the retained earnings account, among the equity accounts.
- Only posted journal lines count. Drafts do not count. A voided entry and its reversal cancel each other.

To change the day, press the As of chip. Pick Today, End of last month, End of last quarter or End of last fiscal year. The default is End of last month. To use your own day, pick Custom, then type the day or pick it from the calendar. Quarters and fiscal years start in the fiscal year start month of your books.

To change which accounts show, press the Rows chip and pick one:

- Non-zero shows the accounts with a balance that is not zero. This is the default.
- Active shows the accounts with a posted line on or before the day, also when the balance is zero.
- All shows every active account, and each inactive account that has a posted line. An account with no lines shows no amount in Debit or Credit.

To show only some accounts, press Add filter, then Accounts. Type in Search to find an account by name, and pick one or more accounts. To pick all the accounts of one type, pick "All <type> accounts", for example "All Expense accounts". The types show in the order of the chart of accounts. Press Apply. To remove the filter, press the × on the Accounts chip. When the filter hides every row, press Clear filters.

To see the lines of an account, press its row. The first row below it reads "Balance before" and the month of the As of day, for example "Balance before Nov 2026". It shows the balance of the account at the end of the month before. For the retained earnings account, it also holds the income and expense of earlier fiscal years. Below it are the posted lines of that month, up to the As of day, in date order, then by entry number. Each line shows its date, its entry number and its memo, and its amount in Debit or Credit by its sign. The No. column stays blank on the lines. Press a line to open the transaction that posted it. Lines of earlier months do not show here. To see every line of an account, press its Debit or Credit figure. To open every account, press Expand all. When an account is open, the same button reads Collapse all.

To see the transactions behind the Debit or Credit of an account, press the figure (see "See the transactions behind an amount" below).

When no account shows on the day, the report shows "No rows as of" and the day. To move the day to the end of the last fiscal year, press Show end of last fiscal year.

To change how the numbers look, press Customize. You can divide by 1000, show amounts without cents, show negative numbers as -100 or (100) or in red, and hide the No., Debit or Credit column. Customize never changes the figures.

The report does not update by itself. To see new changes, press **Refresh** (see "Reports that you refresh" below).

## Read the General Ledger

The General Ledger shows every posted journal line of a period, with one section for each account. To open it, choose Reports in the Books sidebar, then press General Ledger. Its heading shows your business name, General Ledger, and the period, for example "October 1 – 28, 2026".

The sections show in the order of the chart of accounts. Each section has the account number and full name, for example "1000 Business Checking". All sections are open when the report opens. To fold a section, press its heading. Press it again to open it. To fold or open all sections, press Collapse all or Expand all.

- The first row of a section is Beginning balance. It shows the balance of the account on the day before the period starts. Asset, liability and equity accounts count all earlier posted lines. Income and expense accounts count only the lines from the start of the fiscal year that holds the first day of the period. The retained earnings account also counts the income and expense lines of earlier fiscal years. With All dates, every beginning balance is 0.00.
- Each line of the section shows its date, Type (for example Journal entry, Transfer or "Void reversal of JE-12"), No. (the entry number), Name (the customer or vendor on the line), Description (the line memo, or the entry memo when the line has none), Split, Debit and Credit. Split shows the other account of the entry. When the entry has more than two lines, Split shows "-Split-".
- The lines show in date order, then in the order they were posted. Press a line to open the transaction that posted it.
- Balance is the running balance of the account after each line, by the normal side of the account. Asset and expense accounts add debits and subtract credits. Liability, equity and income accounts add credits and subtract debits. Thus a credit card or a loan shows a positive balance when you owe money on it, as in its register.
- The Total row of a section shows the Debit and Credit totals of the section and, in Balance, the ending balance of the account.
- The Total row at the end adds the Debit and Credit of every line that shows.
- Only posted lines show. Drafts do not show. A voided entry and its void reversal both show, and they cancel each other in the balance.

To change the dates, press the Period chip. The default is This month to date. Pick a preset, such as This month, Last quarter or This fiscal year, or pick Custom and type the first and last day. To see every line from the start of your books, pick All dates.

To change which accounts show, press the Rows chip and pick one:

- With activity shows each account with a posted line in the period, or with a beginning balance that is not zero. This is the default. An account with a beginning balance and no lines in the period shows its Beginning balance row and its Total row.
- All also shows every other active account.

To show only some accounts, press Add filter, then Accounts. Pick one or more accounts, or "All <type> accounts", then press Apply. To remove the filter, press the × on the Accounts chip.

To sort the lines, press a column heading, for example Debit. The lines sort inside each section, and the sections keep the order of the chart of accounts. Press the heading again to sort in the opposite direction, and a third time to go back to the order of the report. The Balance heading does not sort: each line keeps its true running balance in every sort. Copy link keeps the sort.

A large book does not load all its lines at once. When you scroll near the end, the report loads the next lines. The running balance continues from the lines above.

The report does not update by itself. To see new changes, press **Refresh** (see "Reports that you refresh" below).

On a phone, each line wraps onto lines in the table: the date, Type and No.; then Name and Description; then Split; then Debit, Credit and Balance. On a tablet, each line keeps the date, Type, No., Debit, Credit and Balance on its first line, and shows Name, Description and Split below them. A narrow desktop window shows the tablet arrangement too. The table does not scroll sideways.

## Read the Balance Sheet

The Balance Sheet shows what the business owns and owes on one day, beside the same day a year earlier. To open it, choose Reports in the Books sidebar, then press Balance Sheet. Its heading shows your business name, Balance Sheet, and the day, for example "As of November 8, 2026".

The report has three sections: Assets, Liabilities and Equity. All levels are open when the report opens. To fold a level, press its heading. To fold or open all levels, press Collapse all or Expand all.

- Assets holds Current assets (with Bank accounts, Accounts receivable and Other current assets), Fixed assets and Other assets.
- Liabilities holds Current liabilities (with Accounts payable, Credit cards and Other current liabilities) and Long-term liabilities.
- Equity holds the equity accounts, then Retained earnings, then Net income.
- Each class and each type ends in its total row, for example "Total Current assets" and "Total Bank accounts". Each section ends in its total row, for example "Total Assets". A class or a type with no account to show does not show. The three sections always show, also when they are empty.
- The last row is Total liabilities and equity. It adds Total Liabilities and Total Equity.
- Each account shows its number and its full name, for example "1000 Business Checking". An account with no number shows its full name only. Sub-accounts are not nested. Inside a type, the accounts show in the order of the chart of accounts.

The columns are Account, Current, Prior year, Change and % change.

- Every figure is a balance by the normal side of the account. Assets add debits and subtract credits. Liabilities and equity add credits and subtract debits. Thus a normal balance shows a positive amount, and a contra account, such as accumulated depreciation or owner's draws, shows a negative amount.
- Current is the balance on the As of day. Its heading shows the day, for example "Nov 8, 2026".
- Prior year is the balance on the same day one year earlier. Its heading shows that day. When the As of day is February 29, the Prior year day is February 28.
- Change is Current minus Prior year. % change is Change divided by the Prior year amount (without its sign), times 100. When Prior year is 0.00, % change is blank.
- An account with no lines on the day shows 0.00.
- Only posted journal lines count. Drafts do not count. A voided entry and its reversal cancel each other.

Retained earnings and Net income are not accounts that you post to directly. Books calculates them for each column from the income and expense lines, and the fiscal year start month of your books splits them:

- Retained earnings shows the lines of the retained earnings account, plus all income and expense from before the fiscal year that holds the day of the column.
- Net income shows the income minus the expenses of the fiscal year that holds the day of the column, up to that day. A profit shows a positive amount.
- Income and expense accounts do not show as rows of their own.

Total assets equals Total liabilities and equity, in Current and in Prior year. This is because every posted entry balances: the debits of each entry equal its credits. Retained earnings and Net income hold the income and expense lines, so each line is counted once.

To change the day, press the As of chip. Pick Today, End of last month, End of last quarter or End of last fiscal year. The default is Today. To use your own day, pick Custom, then type the day or pick it from the calendar.

The Balance Sheet opens on Accrual. To see it on the cash basis, press the Method chip and pick Cash (see "Accrual and cash basis" below).

To change which accounts show, press the Rows chip and pick one:

- Non-zero shows the accounts with a balance that is not zero on the As of day or on the Prior year day. This is the default.
- Active shows the accounts with a posted line on or before the As of day, also when the balance is zero.

To see the lines of an account, press its account row. The first row below it reads "Balance before" and the month of the As of day, for example "Balance before Nov 2026". Its Current shows the balance of the account at the end of the month before. Its Prior year shows the balance of the account on the Prior year day. Below it are the posted lines of that month, up to the As of day, in date order, then by entry number. Each line shows its date, its entry number and its memo. Current shows the amount of the line. Prior year shows 0.00 on the lines. Change and % change stay blank on the "Balance before" row and on the lines. Lines of earlier months do not show here. To see every line of an account, press its Current figure. An account opens the same way on Accrual and on Cash. Retained earnings and Net income do not open.

To see the transactions behind the Current or Prior year figure of an account, press the figure (see "See the transactions behind an amount" below).

To change how the numbers look, press Customize. You can divide by 1000, show amounts without cents, show negative numbers as -100 or (100) or in red, and hide the Current, Prior year, Change or % change column. The report opens with all four columns shown. Customize never changes the figures.

On a phone, each row wraps onto two lines in the table: the account, then Current, Prior year and Change. A phone does not show % change. The table does not scroll sideways. On a narrow window, the account name gets shorter and ends in "…", and the figures always show in full.

The report does not update by itself. To see new changes, press **Refresh** (see "Reports that you refresh" below).

## Read the Journal

The Journal shows every posted entry of a period with its debit and credit lines. To open it, choose Reports in the Books sidebar, then press Journal. Its heading shows your business name, Journal, and the period, for example "October 1 – 31, 2026".

Each posted entry is one block in the report. The heading of a block shows the entry number and type, for example "JE-41 · Journal entry" or "TR-7 · Transfer". An entry with no number shows its type alone. The blocks show in date order, then in the order the entries were posted. All blocks are open when the report opens.

- Each line of a block shows its date, Account (the account number and full name), Name (the customer or vendor on the line), Description (the line memo, or the entry memo when the line has none), Debit and Credit. A blank Debit or Credit is zero. The lines show in the order of the lines in the entry. Press a line to open the transaction that posted it.
- Each block ends in its total row, for example "Total JE-41 · Journal entry", and the block total has an equal Debit and Credit.
- The Total row at the end of the report adds the Debit and Credit of every line that shows, and they are equal.
- Only posted entries show. Drafts never show. A voided entry and its void reversal both show, each as its own block, for example "JE-12 · Void reversal of JE-12".

To change the dates, press the Period chip. The default is This month to date. Pick a preset, such as This month, Last quarter or This fiscal year, or pick Custom and type the first and last day. To see every entry from the start of your books, pick All dates. When no entry was posted in the period, the report shows "No rows for" and the period. To see the whole fiscal year, press Show this fiscal year.

To fold a block, press its heading. A folded block shows the Debit and Credit totals of the entry on its heading. Press the heading again to open it. To fold or open all blocks, press Collapse all or Expand all.

To sort the lines inside each block, press a column heading, for example Debit. The blocks keep their order. Press the heading again to sort in the opposite direction, and a third time to go back to the order of the report. Copy link keeps the sort.

A long period does not load all its entries at once. When you scroll near the end, the report loads the next blocks. A long entry continues on the next part that loads, and the Total row shows at the end.

The report does not update by itself. To see new changes, press **Refresh** (see "Reports that you refresh" below).

On a phone, each line wraps onto three lines in the table: the date and Account; then Name and Description; then Debit and Credit. On a tablet, each line wraps onto two lines: the date, Account, Debit and Credit; then Name and Description. A narrow desktop window shows the tablet arrangement too. The table does not scroll sideways.

## Read the Profit and Loss

The Profit and Loss shows the income and expenses of a period, and what is left. To open it, choose Reports in Books (the sidebar, or the Books menu on a phone), then press Profit and Loss. To see each month of the period in its own column, press Profit and Loss by Month. The heading shows your business name, the report title, and the period, for example "January 1 – November 9, 2026".

The report shows its parts in this order:

1. Income: the income accounts, then Total Income.
2. Cost of goods sold: the cost of goods sold accounts, then Total Cost of goods sold.
3. Gross profit: Total Income minus Total Cost of goods sold.
4. Expenses: the expense accounts, then Total Expenses.
5. Net operating income: Gross profit minus Total Expenses.
6. Other income: the other income accounts, then Total Other income.
7. Other expenses: the other expense accounts, then Total Other expenses.
8. Net other income: Total Other income minus Total Other expenses.
9. Net income: Net operating income plus Net other income.

The five sections always show, also when they have no lines. An empty section shows 0.00 in its total. All sections are open when the report opens. To fold a section, press its heading. To fold or open all sections, press Collapse all or Expand all.

- Each account row shows the account number and full name, for example "6600 Rent or lease". Inside a section, the accounts show in the order of the chart of accounts.
- Amounts read by the normal side of the account. An income account shows credits minus debits, and an expense account shows debits minus credits. Thus the usual amounts are positive. A discount account, such as "Discounts and refunds given" among the income accounts, reads negative, because it takes away from income.
- % of income shows each row as a share of Total Income for the same period. Other income is not counted in Total Income, so Total Income reads 100.0%. When Total Income is 0.00, % of income is blank.
- Only posted journal lines count. Drafts do not count. A voided entry and its reversal cancel each other.

The Profit and Loss opens on Accrual: income and expenses count on the day they are entered. To see them on the day they are paid, press the Method chip and pick Cash (see "Accrual and cash basis" below).

To change the dates, press the Period chip. The default is This fiscal year to date. Pick a preset, such as This month, Last quarter or This fiscal year, or pick Custom and type the first and last day. To see every line from the start of your books, pick All dates.

To change which accounts show, press the Rows chip and pick one:

- Non-zero shows the accounts with an amount for the period that is not zero. This is the default.
- Active shows the accounts with a posted line in the period, also when the amount is zero.

To see the lines of an account, press the account row. Its posted lines in the period open below it, in date order, then by entry number. Each line shows its date, its entry number and its memo, and its amount in Total. % of income stays blank on the lines. Press a line to open the transaction that posted it. The computed rows, such as Gross profit, do not open.

To see the transactions behind the Total of an account or a section, or behind a month of the Profit and Loss by Month, press the figure (see "See the transactions behind an amount" below).

To change how the numbers look, press Customize. You can divide by 1000, show amounts without cents, show negative numbers as -100 or (100) or in red, and hide the % of income column. Customize never changes the figures.

The Profit and Loss stays current. When someone posts or voids an entry, changes an account, or changes the Books settings, the report runs again. The Profit and Loss by Month does not update by itself: press **Refresh** (see "Reports that you refresh" below).

On a phone, each row of the Profit and Loss wraps onto two lines in the table: the account; then Total and % of income. The table does not scroll sideways.

The Profit and Loss by Month shows every month of the period in its own column, headed by the month, for example "Jan 2026". A month with no line reads 0.00. After the months come Total, for the whole period, and % of income, which is the share of Total in Total Income. A period can show at most 36 months. When the period is longer, the first 36 months show, and a notice tells how many months are left out. Total and % of income still count the whole period. With All dates, only the months that have a posted line show. The rows of the Profit and Loss by Month do not open their lines, but each month figure and each Total figure of an account or a section opens its transactions. When the window is too narrow for all the columns on one line, each row shows the account and the first months on its first line, then the other figures on the lines below, in column order. The table does not scroll sideways.

## See the transactions behind an amount

To see the transactions behind an amount, press it. Books opens Transaction Detail by Account with the posted lines that make up the amount. On the web, the pointer underlines an amount that opens.

These amounts open:

- Profit and Loss: the Total of an account, and the Total of a section on its heading row and on its "Total <section>" row, for example "Total Expenses". % of income and the computed rows, such as Gross profit and Net income, do not open.
- Profit and Loss by Month: each month and the Total of an account or a section. A month opens the lines of that month inside the period, so a period that starts on March 10 opens March 10 – 31 from the March column.
- Balance Sheet: Current and Prior year of an account. Change, % change, the totals, Retained earnings and Net income do not open.
- Trial Balance: Debit or Credit of an account. The retained earnings row and the Total row do not open.
- The General Ledger, the Journal and Transaction Detail by Account show the lines already, so their amounts do not open.

On a section heading of the Profit and Loss or the Profit and Loss by Month, press the name to fold the section, and press an amount to see its transactions.

On a window that is 1360 px wide or more, the transactions show in a panel beside the statement, and the amount that you pressed stays marked. On a narrower window and on a phone, they open as their own report. When you narrow the window while the panel is open, the panel covers the statement, and its back link closes it.

The panel shows its own Period, Method and Accounts chips, its heading and its lines. In the panel and on a phone, each line wraps onto three lines: the date, Type and No.; then Name and Description; then Split and Amount. A change to a chip in the panel runs only the panel's report. After you change a chip in the panel, no amount of the statement stays marked. Press a line in the panel to open its transaction; Back on the transaction returns to the statement with the panel open. Press another amount to show its transactions in the same panel. To see the report with Customize, Share, Save as and Copy link, press Open as full report. To close the panel, press Close (✕) or Escape. When you open Customize, the panel closes.

Transaction Detail by Account shows:

- Period, Method and Accounts chips that the press set. Period is the period of the statement, or the part of it that the amount covers, such as one month or the days up to the As of day. Method is the method of the statement (from the Trial Balance, always Accrual). Accounts is the one account, or "All <type> accounts" for a section, for example "All Expense accounts".
- One section for each account, in the order of the chart of accounts. Each line shows its date, Type, No., Name, Description, Split and Amount.
- Amount is each line by the normal side of its account, so an expense reads positive and a refund to it reads negative.
- The total of each section, and the Total of the report, equals the amount that you pressed, because they add the same posted lines. From a Trial Balance Credit of an asset or expense account, the total reads as a negative amount, for example -50.00.

When you pick accounts of different types by hand, the Total adds the amount of each line by the normal side of its account type.

The back link at the top of Transaction Detail by Account shows the name of the statement that you came from, for example "Profit and Loss". Press it, or Back in your browser or on your phone, to go back to the statement as you left it.

Press a line to open its transaction. An invoice, sales receipt or bill line opens the document, a transfer line opens the transfer, and any other line opens the journal entry. Back on the transaction returns to the report.

Transaction Detail by Account also opens from Reports, like the other Books reports. From Reports, it shows the lines of every account for This month to date until you pick accounts.

The report does not update by itself. To see new changes, press **Refresh** (see "Reports that you refresh" below).

On the web, ⌘-click or middle-click an amount to open Transaction Detail by Account in a new tab.

## Accrual and cash basis

The Profit and Loss, the Profit and Loss by Month, the Balance Sheet, Transaction Detail by Account and the Sales Tax Liability have a Method chip. To change the method, press the Method chip and pick Accrual or Cash. The default is Accrual. The heading of the report shows the method under the period, for example "Accrual basis" or "Cash basis".

- On Accrual, every posted entry counts on its own date. A bill counts on the bill date, and an invoice on the invoice date. On Accrual, a vendor credit counts on its credit date.
- On Cash, bills and invoices count only when they are paid, and only as far as they are paid. A bill of 500.00 with a payment of 200.00 counts 200.00, on the date of the payment. The rest counts when it is paid.
- Each payment brings back its share of each line of the bill or invoice. For example, a bill with 700.00 of office supplies and 300.00 of software, paid 400.00, counts 280.00 of office supplies and 120.00 of software.
- On Cash, a vendor credit counts only when you apply it to a bill, and only as far as you apply it, on the apply date. The bill counts that part as paid on the same date, so a credit applied in full shows the bill's cost less the credit. An unapplied vendor credit changes no figure on Cash. See [Vendor credits](help://books:vendor-credits).
- On Cash, a vendor refund counts as a payment of its vendor credits on the refund date: it brings back each credit's share of its lines on that day. So a vendor credit that you never apply to a bill but the vendor refunds lowers the expense on the day the money comes back. See [Vendor refunds](help://books:vendor-refunds).
- On Cash, a credit memo counts only when its credit is used. A refund receipt that pays out a credit memo counts as a payment of the credit memo on the refund date: it brings back the credit memo's share of its lines and tax on that day. So a credit memo that you refund lowers income and sales tax on the day the money goes back. A credit memo that you apply to an invoice counts on the apply date, and the invoice counts that part as paid on the same date. See [Refund receipts](help://books:refund-receipts) and [Apply a credit memo to invoices](help://books:apply-credit).
- On Cash, a write-off is no payment: the part of an invoice that you wrote off never counts as income or as sales tax collected, and the write-off's own entry does not count either. On Accrual, the write-off's account goes up and Accounts receivable goes down on the write-off date. See [Write off an invoice](help://books:write-offs).
- All other entries count on their own date on Cash too: journal entries, transfers, expenses, sales receipts, refund receipts that refund a sale, bill payments, customer payments and opening balances. A customer payment that is more than its invoices counts in full on its date, because the business has the money.
- On the Balance Sheet on Cash, Accounts payable and Accounts receivable do not hold the unpaid part of bills and invoices. Total assets still equals Total liabilities and equity.
- When you void or edit a payment, Books calculates again the shares of the other payments of the same bill or invoice. Thus voiding a payment can move another payment's share between the lines of the document by one cent. The total of each payment does not change.

When you press an amount on Cash, Transaction Detail by Account opens on Cash too. Its lines show the parts that the cash basis moves: a line "Unpaid bill (cash basis)" or "Unpaid invoice (cash basis)" takes a document out on its own date, with the number of the document, and a line such as "Bill 1003 paid (cash basis)" or "Invoice 1004 paid (cash basis)" brings back a payment's share on the payment date, with the number of the payment. For a vendor credit, "Unapplied vendor credit (cash basis)" takes the credit out on its own date, and "Vendor credit 1002 applied (cash basis)" and "Bill 1003 paid by vendor credit (cash basis)" bring back the applied share on the apply date, with the number of the vendor credit. For a vendor refund, "Vendor credit 1002 refunded (cash basis)" brings back the refunded share on the refund date. For a refund receipt that pays out a credit memo, "Credit memo 1001 refunded (cash basis)" brings back the refunded share on the refund date. For a credit memo applied to an invoice, "Credit memo 1001 applied (cash basis)" and "Invoice 1009 paid by credit memo (cash basis)" bring back the applied share on the apply date, with the number of the credit memo.

The General Ledger, the Trial Balance and the Journal show the accrual basis only.

## Read the Sales Tax Liability report

To see the sales tax you owe each agency, open the Sales Tax Liability report. Choose Reports in Books (the sidebar, or the Books menu on a phone), then press Sales Tax Liability, or press Liability report at the top of the Sales tax page. The heading shows your business name, Sales Tax Liability, and the period, for example "October 1 – 31, 2026".

The report shows the sales tax that you charged in the period, by agency and then by rate. The agencies show in name order, and inside each agency its rates show in name order. An inactive agency or rate with tax in the period shows like an active one.

- Only posted invoices, posted sales receipts, posted credit memos and posted refund receipts count: a draft does not count, and a voided document does not count. A credit memo lowers the figures of its rate: its Gross total, Taxable amount and Tax amount show as negative figures. A refund receipt that refunds a sale lowers them in the same way, on its own date, and shows as a row such as "Refund receipt 1003". A refund receipt that pays out a credit memo has no tax figures, because the credit memo already lowered them. When you edit a posted document, Books voids the original, so only the new version counts.
- The report opens on Accrual. To change the method, press the Method chip and pick Accrual or Cash (see "Accrual and cash basis" above). The heading shows "Accrual basis" or "Cash basis" under the period.
- On Accrual, a sale counts in the period of its own date, not the day it is paid.
- On Cash, the tax of an invoice counts only when the invoice is paid, and only as far as it is paid. Each payment brings back its share of the invoice's Gross total, Taxable amount and Tax amount on the date of the payment. For example, an invoice of 1,080.00 with 80.00 of tax, paid 540.00, counts 40.00 of tax on the payment date. A sales receipt counts on its own date, because it is paid when you enter it. A refund receipt that refunds a sale counts on its own date too. A credit memo counts only when its credit is used: a refund receipt that pays out the credit brings back its share of the credit memo's figures on the refund date, and an application to an invoice brings back its share on the apply date, for the credit memo and as a payment of the invoice. So on Cash, a credit memo that is not applied and that no refund receipt pays out changes no figure.
- On Cash, an open rate shows each invoice on its own date with its tax, and again with the same tax taken out, so the two add up to 0.00. Each payment shows its share as one more row of the invoice, on the payment date.
- Gross total is the sale before tax. Taxable amount is the part of the sale that the tax was calculated on. Non-taxable is Gross total minus Taxable amount. Tax amount is the tax of the rate.
- Each figure is the one Books stored when the document was posted. A later change to a rate, to a product's Taxable setting or to a customer's exemption does not change the report.
- A rate row adds the figures of the documents that charged that rate.
- The total row of each agency ("Total" and the agency name) and the Total row at the end show only the Tax amount. The sales columns are blank there, because a sale taxed by two rates of one agency would be counted twice.
- A sale with no tax rate, for example a sale to an exempt customer, has no sales tax, so it is not in the report.
- A sale with a tax rate and no taxable line shows under that rate: its sales are Non-taxable, and its tax is 0.00. A rate of 0% shows its sales with tax 0.00.

The agencies are open when the report opens, and the rates are folded. To see the documents that charged a rate, press the rate row. Its documents open below it, in date order, then by number. Each document shows the date it counts on, its type and number, and its customer, for example "2026-10-14 · Invoice 1042 · Harborview Dental" or "2026-11-10 · Credit memo 1001 · Harborview Dental", with its four figures. A sales receipt with no customer ends after its number. To open the invoice, sales receipt, credit memo or refund receipt, press its document row. To fold or open all levels, press Collapse all or Expand all.

To change the dates, press the Period chip. The default is Last month. Pick a preset, such as This month or Last quarter, or pick Custom and type the first and last day. When no posted sale was taxed in the period, the report shows "No rows for" and the period.

To show only some agencies, press Add filter, then Agency. Pick one or more agencies, inactive agencies included, then press Apply. To remove the filter, press the × on the Agency chip.

The balance of an agency's liability account on the Balance Sheet also holds the payments and adjustments that you post to it, which this report does not show. Thus the report is the tax you charged, not what you still owe after a payment.

To change how the numbers look, press Customize. Customize never changes the figures.

The report stays current. When someone posts or voids an invoice, a sales receipt, a credit memo, a refund receipt or a customer payment, the report runs again.

On a phone, each row wraps onto three lines in the table: the name; then Gross total and Non-taxable; then Taxable amount and Tax amount. The table does not scroll sideways.

## Read the Customer Balance report

To see what each customer owes on a day, open Reports and choose Customer Balance. You can also press Reports at the top of the Customers list, then Customer Balance. The heading shows your business name, Customer Balance, and the day, for example "As of November 16, 2026".

The report adds the posted transactions on your Accounts receivable accounts, dated on or before the As of day. A draft does not count. A voided document does not count, because its void reversal cancels the original. A customer's balance is its debits minus its credits on those accounts.

- Each customer row equals the Open figure on the [customer's page](help://books:customer-pages) for the same day.
- The Total row at the end equals Accounts receivable on the Balance Sheet for the same day.
- These figures agree because the report, the customer's page and the Balance Sheet add the same posted Accounts receivable lines up to that day. Each line names at most one customer, so it counts in exactly one customer row, and the No customer row holds the lines that name none.
- The No customer row adds the Accounts receivable lines that name no customer, such as an opening balance or a journal entry with no name. Because the report includes those lines, the Total equals the Balance Sheet. The row shows after every customer.
- A customer with no sub-customers is one line. A customer with sub-customers shows as a group: a heading with the customer's name, then a row for the customer's own balance, then a row for each sub-customer, then "Total" and the customer's name, which adds the rows of the family.
- A credit balance, for example after an overpayment, is a negative figure, and a family's Total and the report's Total subtract it.
- An inactive customer with a balance shows with "(inactive)" after its name, in lighter text.

To see the transactions behind a balance, press the customer row: it opens into its transactions, one row for each posted line, in date order. Each transaction shows its date, its type and number, and its description, for example "2026-10-14 · Invoice 1042 · Catering deposit". A transaction with no description ends after its number. An invoice is a positive figure and a payment a negative one, and the transactions add up to the customer's balance. To open a transaction's document, press its row: the invoice, payment or journal entry opens beside the report on a very wide window, else as its own screen. To fold a family, press its heading.

To change the day, press the As of chip. The default is Today.

To choose which customers show, press the Rows chip. Non-zero, the default, shows each customer whose balance is not 0. With activity also shows a customer whose transactions add up to 0. A family whose customers are all hidden is hidden with its total.

To show only some customers, press Add filter, then Customer. Pick one or more customers, inactive customers included; a sub-customer is listed under its parent's name, and "All" with the parent's name and "sub-customers" picks the whole family. Then press Apply. With customers picked, the No customer row does not show, and a line under the date names your picks, for example "Customer: Aspen Ridge Dental, All Harborview Hospitality Group sub-customers". To remove the filter, press the × on the Customer chip.

To change the order, press the Order chip. Name, the default, orders families and customers by name. Largest balance puts the largest balance first; a family counts by its total, and inside a family the parent's own row stays first.

The report stays current. When someone posts or voids a transaction or renames a customer, the report runs again.

On a phone, each row keeps its name and its Balance on one line. A long name or transaction wraps to at most three lines, and the Balance is never cut. Customize and Export are under **⋯**.

## Read the A/R Aging report

To see what each customer owes and how late it is, open Reports and choose A/R Aging. You can also press Reports at the top of the Customers list, then A/R Aging. The heading shows your business name, A/R Aging, and the day, for example "As of November 16, 2026".

The report lists the open items of each customer on the As of day. An open item is one of these:

- An invoice, less the payments and the applied credits dated on or before the day that apply to it.
- The part of a payment that applies to no invoice.
- A credit memo, for the part of its total that is not applied to an invoice on the day.
- A posted journal entry line on Accounts receivable that comes from none of these documents.

Only posted transactions dated on or before the As of day count. A draft does not count. A voided document and its void reversal cancel each other, and a voided payment no longer pays its invoices. An item that adds up to 0 on the day does not show.

An item's age is the number of days from its due date to the As of day. An invoice ages from its due date. Every other item ages from its own date, and its Due date shows that date. The columns are Customer, Due date, Current, 1 - 30, 31 - 60, 61 - 90, 91 and over, and Total.

- Current holds the items that are not yet due on the day: age 0 or less.
- 1 - 30, 31 - 60, 61 - 90 and 91 and over hold the items that are that many days past their due date.
- Each item is in the one column of its age, and in Total. A customer row, a family total and the Total row add their items in each column.
- An age column with no money on a row is blank. Total always shows a figure.
- A credit, such as the unapplied part of a payment or a credit memo, is a negative figure in the column of its age, and it lowers Total.

When you apply a credit memo to an invoice, the applied credit lowers the invoice's item from the apply date, and on an As of day before the apply date the invoice shows its full open amount. From the apply date, the credit memo shows only its unapplied rest, the part of its total that is not applied, as a negative figure. An invoice that credit pays in full, and a credit memo that is applied in full, do not show from the apply date. Applying a credit does not change the customer's Total or the report's Total, because the invoice's item goes down by the amount and the credit memo's item goes up by the same amount. When you remove the credit from the invoice, both items show their full amounts again.

The figures agree with the other reports. A customer's Total equals its figure on the [Customer Balance](help://books:reports) for the same day, and the Open figure on its customer's page for today. The Total row at the end equals Accounts receivable on the Balance Sheet for the same day. These figures agree because every row comes from a posted Accounts receivable line, and the line of a payment is split into the parts that pay invoices and its unapplied part, which add up to the line. An applied credit moves an amount from the credit memo's item to the invoice's item, so it adds up to zero.

- A customer with no open item on the day does not show.
- A customer shows as a group when one of its sub-customers is in your Customer pick (with no Customer filter, every sub-customer is) and has an invoice, payment, credit memo or journal entry on Accounts receivable dated on or before the As of day, also one that is now paid in full. The group has a heading with the customer's name, then a row for the customer's own items, then a row for each sub-customer with an open item, then "Total" and the customer's name. So a customer whose only sub-customer has nothing open still shows its heading, its own row and its total.
- Every other customer is one line, also a customer with sub-customers.
- The No customer row holds the items of Accounts receivable lines that name no customer. It shows after every customer.
- An inactive customer with an open item shows with "(inactive)" after its name, in lighter text.

To see a customer's open items, press the customer row: it opens into one row for each open item, in due date order, oldest first, then by number. Each item shows its type and number, for example "Invoice 1042" or "Payment 17", its Due date, and its amount in the column of its age. To see the lines of an item, press the item row: an invoice opens into the invoice and the payments and credit memos that apply to it on or before the day, for example "2026-11-03 · Payment 317" or "2026-11-16 · Credit memo 1001". The invoice is a positive figure and a payment or an applied credit a negative one, and the lines add up to the item's amount. To open a line's document, press the line: the invoice, payment, credit memo or journal entry opens beside the report on a very wide window, else as its own screen. To fold a family, press its heading.

To change the day, press the As of chip. The default is Today. A past day shows the items as they were open on that day. When no item is open on the day, the report shows "No rows as of" and the day.

To show only some customers, press Add filter, then Customer, and pick one or more customers, inactive customers included; a sub-customer is listed under its parent's name, and "All" with the parent's name and "sub-customers" picks the whole family. Then press Apply. With customers picked, the No customer row does not show, and a line under the date names your picks. To remove the filter, press the × on the Customer chip.

To change the order, press the Order chip and pick Name or Largest balance. Name, the default, orders families and customers by name. Largest balance puts the largest Total first; a family counts by its total, inside a family the parent's own row stays first, and the No customer row stays last. The items of a customer keep their due date order.

The report stays current. When someone posts or voids an invoice, a payment, a credit memo or a journal entry, corrects an invoice or a payment, applies a credit memo to an invoice or removes it, renames a customer or changes its parent, or changes the Books settings, the report runs again.

On a phone, each row wraps onto lines in the table: the name and the Due date; then Current, 1 - 30 and Total on the first line of figures; then 31 - 60, 61 - 90 and 91 and over. On a tablet, each row keeps the name and Total on its first line, and shows the Due date and the five age columns below them. A narrow desktop window shows the tablet arrangement too. A long name wraps to at most three lines, a figure is never cut, and the table does not scroll sideways. Customize and Export are under **⋯** on a phone.

## Read the sales reports

To see what you sold in a period, open Reports and choose Sales by Customer or Sales by Product/Service. You can also press Reports at the top of the Customers list, then Sales by Customer. On the Products and services list, press Sales report at the top to open Sales by Product/Service. The heading shows your business name, the report's title and the period.

Sales by Customer shows what each customer bought, and Sales by Product/Service shows what you sold of each product and service.

- Only posted invoices and posted sales receipts count, less posted credit memos and posted refund receipts that refund a sale. A draft does not count, and a voided document does not count. When you edit a posted document, Books voids the original, so only the new version counts.
- A sale counts on its document's date. A posted credit memo lowers sales on its own date, whether or not its credit is used, so its lines show as negative figures and lower its customer's and its products' figures.
- A posted refund receipt that refunds a sale lowers sales on its own date in the same way: its lines show as negative figures, for example "2026-11-12 · Refund receipt 1003 · Network visit". A refund receipt that pays out a credit memo does not change the sales reports, because the credit memo's lines already count.
- Each figure is the line amount before sales tax. Description lines and subtotal lines do not count.
- Both reports read the same lines, so their two Totals are equal for the same period and filters. Each Total equals the Subtotals of the period's posted invoices and sales receipts, less the Subtotals of its posted credit memos and of its posted refund receipts that refund a sale.
- % of sales is the row's sales as a share of the Total, with two decimal places; the Total shows 100.00%. A row below zero has a share below zero. When the Total is 0, the column is blank.
- The reports are on the accrual basis: a sale counts on its date, not the day it is paid. Thus they can differ from Income on a cash-basis Profit and Loss. They can also differ from Income on an accrual-basis Profit and Loss, because a product's income account can be any account.
- An inactive customer or product with sales in the period shows with "(inactive)" after its name, in lighter text.

In Sales by Customer, a customer with no sub-customer sales is one row. A customer whose sub-customers have sales shows as a family: a heading with the customer's name, then the customer's own row (when it has sales), then a row for each sub-customer, then "Total" and the customer's name, which adds the rows of the family. Each customer's % of sales is its share of the report's Total, and the family's total shows the family's share. The No customer row holds the sales receipts that name no customer, and it shows after every customer.

In Sales by Product/Service, each product or service with a sale in the period has one row with its Quantity, Amount, % of sales and Avg price. Avg price is the Amount divided by the Quantity. A discount (a percent line, such as the Discount product) counts on its own product's row, not on the product it discounts, which keeps its full amount. A discount has no quantity, so its row has no Quantity and no Avg price. The Total row shows the Amount and 100.00%, but the Total has no Quantity and no Avg price, because the units of different products do not add up. A product whose quantities add up to 0 in the period, for example one sold and then fully credited, also has a blank Quantity and Avg price.

To see the sales behind a figure, press a customer or product row: it opens into its sale lines, in date order, then by document, then by line. Each sale line shows its date, its type and number, and the product (in Sales by Customer) or the customer (in Sales by Product/Service), for example "2026-10-14 · Invoice 1042 · Network visit". A sales receipt with no customer ends after its number. The sale lines add up to the row's figure, and their % of sales is blank. To open the invoice, sales receipt, credit memo or refund receipt, press a sale line: its document opens as its own screen. To fold a family, press its heading.

To change the dates, press the Period chip. The default is This fiscal year to date. When no posted sale is in the period, the report shows "No rows for" and the period.

To show only some customers or products, press Add filter, then Customer or Product, and pick from the filter's list. Inactive customers and products are in the lists. A sub-customer is listed under its parent's name, and "All" with the parent's name and "sub-customers" picks the whole family. Products are listed by type, and "All Service items" or "All Non-inventory items" picks a whole type. With customers picked, the No customer row does not show, and a line under the period names your picks.

To change the order, press the Order chip and pick Name or Largest sales. Name, the default, orders the rows by name. Largest sales puts the largest sales first; a family counts by its total, inside a family the parent's own row stays first, and the No customer row stays last.

The reports stay current. When someone posts or voids an invoice, a sales receipt, a credit memo or a refund receipt, or renames a customer or a product, the open report runs again.

On a phone, a Sales by Customer row shows the name on the first line, then Sales and % of sales. A Sales by Product/Service row shows the name, then Quantity and Amount, then % of sales and Avg price. A long name wraps to at most three lines, and a figure is never cut. Customize and Export are under **⋯**.

## Read the A/P Aging report

To see what you owe each vendor and how late it is, open Reports and choose A/P Aging. You can also press Reports at the top of the Vendors list, then A/P Aging. The heading shows your business name, A/P Aging, and the day, for example "As of November 16, 2026".

The report lists the open items of each vendor on the As of day. An open item is one of these:

- A bill, less the bill payments and the applied vendor credits dated on or before the day that apply to it.
- A vendor credit, less the parts of it that are applied to bills and the vendor refunds dated on or before the day.
- A posted journal entry line on Accounts payable that comes from none of these documents.

A bill payment and a vendor refund are never items of their own: each of their lines is a part of the bill or the vendor credit it names. Only posted transactions dated on or before the As of day count. A draft does not count. A voided document and its void reversal cancel each other, and a voided bill payment or vendor refund no longer applies. An item that adds up to 0 on the day does not show.

An item's age is the number of days from its due date to the As of day. A bill ages from its due date. Every other item ages from its own date, and its Due date shows that date. The columns are Vendor, Due date, Current, 1 - 30, 31 - 60, 61 - 90, 91 and over, and Total.

- Current holds the items that are not yet due on the day: age 0 or less.
- 1 - 30, 31 - 60, 61 - 90 and 91 and over hold the items that are that many days past their due date.
- Each item is in the one column of its age, and in Total. A vendor row and the Total row add their items in each column.
- An age column with no money on a row is blank. Total always shows a figure.
- A figure is what you owe. A vendor credit is a negative figure in the column of its age, and it lowers the vendor's Total.

When you apply a vendor credit to a bill, the applied credit lowers the bill's item from the apply date, and the vendor credit shows only the part that is not applied. Applying a credit does not change the vendor's Total or the report's Total, because the bill's item goes down by the amount and the credit's item goes up by the same amount. When you remove the credit from the bill, both items show their full amounts again, also on a past As of day: a removed application reads as never applied.

The figures agree with the other reports. A vendor's Total for today equals the Open balance on its vendor page (the Open figure, or the Credit figure when the vendor owes you). The Total row at the end equals Accounts payable on the Balance Sheet for the same day. These figures agree because every row comes from a posted Accounts payable line or is a part of one: the lines of a bill payment add up to its Accounts payable figure, and so do the lines of a vendor refund, and an applied credit moves an amount from the vendor credit's item to the bill's item, so it adds up to zero.

- A vendor with no open item on the day does not show.
- The No vendor row holds the items of Accounts payable lines that name no vendor. It shows after every vendor.
- An inactive vendor with an open item shows with "(inactive)" after its name, in lighter text.

To see a vendor's open items, press the vendor row: it opens into one row for each open item, in due date order, oldest first, then by number. Each item shows its type and number, for example "Bill 1042" or "Vendor credit 3", its Due date, and its amount in the column of its age. To see the lines of an item, press the item row: a bill opens into the bill and the bill payments and vendor credits that apply to it on or before the day, for example "2026-11-03 · Bill payment 317" or "2026-11-05 · Vendor credit 12", each a negative figure. A vendor credit opens into the credit, the bills it is applied to and its vendor refunds, for example "2026-11-05 · Bill 1042" or "2026-11-09 · Vendor refund 4", each a positive figure. The lines add up to the item's amount. To open a line's document, press the line: the bill, bill payment, vendor credit, vendor refund or journal entry opens beside the report on a very wide window, else as its own screen.

To change the day, press the As of chip. The default is Today. A past day shows the items as they were open on that day. When no item is open on the day, the report shows "No rows as of" and the day.

To show only some vendors, press Add filter, then Vendor, and pick one or more vendors, inactive vendors included. Then press Apply. With vendors picked, the No vendor row does not show, and a line under the date names your picks. To remove the filter, press the × on the Vendor chip.

To change the order, press the Order chip and pick Name or Largest balance. Name, the default, orders the vendors by name. Largest balance puts the largest Total first, and the No vendor row stays last. The items of a vendor keep their due date order.

The report stays current. When someone posts or voids a bill, a bill payment, a vendor credit, a vendor refund or a journal entry, corrects one of them, applies a vendor credit to a bill or removes it, renames a vendor, or changes the Books settings, the report runs again.

On a phone, each row wraps onto lines in the table: the name and the Due date; then Current, 1 - 30 and Total on the first line of figures; then 31 - 60, 61 - 90 and 91 and over. On a tablet, each row keeps the name and Total on its first line, and shows the Due date and the five age columns below them. A narrow desktop window shows the tablet arrangement too. A long name wraps to at most three lines, a figure is never cut, and the table does not scroll sideways. Customize and Export are under **⋯** on a phone.

## Read the Vendor Balance report

To see what you owe each vendor on a day, open Reports and choose Vendor Balance. You can also press Reports at the top of the Vendors list, then Vendor Balance. The heading shows your business name, Vendor Balance, and the day, for example "As of November 16, 2026".

The report adds the posted transactions on your Accounts payable accounts, dated on or before the As of day. A draft does not count. A voided document does not count, because its void reversal cancels the original. A vendor's balance is its credits minus its debits on those accounts, so a figure is what you owe.

- Each vendor row equals the Open balance on the [vendor's page](help://books:vendor-pages) for the same day (the Open figure, or the Credit figure when the vendor owes you).
- Each vendor row also equals the vendor's Total in the A/P Aging for the same day.
- The Total row at the end equals Accounts payable on the Balance Sheet for the same day.
- These figures agree because the report, the vendor's page, the A/P Aging and the Balance Sheet add the same posted Accounts payable lines up to that day. Each line names at most one vendor, so it counts in exactly one vendor row, and the No vendor row holds the lines that name none.
- The No vendor row adds the Accounts payable lines that name no vendor, such as an opening balance or a journal entry with no name. Because the report includes those lines, the Total equals the Balance Sheet. The row shows after every vendor.
- A negative figure is money the vendor owes you, for example a vendor credit that is not applied to a bill, and the report's Total subtracts it.
- An inactive vendor with a balance shows with "(inactive)" after its name, in lighter text.

To see the transactions behind a balance, press the vendor row: it opens into its transactions, one row for each posted line, in date order. Each transaction shows its date, its type and number, and its description, for example "2026-10-14 · Bill 1042 · Office chairs". A transaction with no description ends after its number. A bill and a vendor refund are positive figures, and a bill payment and a vendor credit are negative ones, and the transactions add up to the vendor's balance. A vendor credit that you apply to a bill has no row, because the apply does not change what you owe the vendor. To open a transaction's document, press its row: the bill, bill payment, vendor credit, vendor refund or journal entry opens as its own screen.

To change the day, press the As of chip. The default is Today. When no posted Accounts payable line is on or before the day, the report shows "No rows as of" and the day.

To choose which vendors show, press the Rows chip. Non-zero, the default, shows each vendor whose balance is not 0. With activity also shows a vendor whose transactions add up to 0, for example a bill that is paid in full.

To show only some vendors, press Add filter, then Vendor, and pick one or more vendors, inactive vendors included. Then press Apply. With vendors picked, the No vendor row does not show, and a line under the date names your picks. To remove the filter, press the × on the Vendor chip.

To change the order, press the Order chip. Name, the default, orders the vendors by name. Largest balance puts the largest balance first. The No vendor row stays last in both.

To see the open bills with their due dates and how late they are, read the A/P Aging instead. The Vendor Balance shows one figure for each vendor and the transactions behind it.

The report stays current. When someone posts or voids a bill, a bill payment, a vendor credit, a vendor refund or a journal entry, renames a vendor, changes an account's type, or changes the Books settings, the report runs again.

On a phone, each row keeps its name and its Balance on one line. A long name or transaction wraps to at most three lines, and the Balance is never cut. Customize and Export are under **⋯**.

## Read the Expenses by Vendor report

To see what you spent with each vendor in a period, open Reports and choose Expenses by Vendor. You can also press Reports at the top of the Vendors list, then Expenses by Vendor. The heading shows your business name, Expenses by Vendor, the period, and the basis, for example "Accrual basis".

The report adds the posted lines on your Cost of goods sold, Expense and Other expense accounts, dated in the period, on the basis you choose. A line's figure is its debit minus its credit, so an expense is a positive figure. A draft does not count. A voided document does not count, because its void reversal cancels the original. A line on an asset, liability or equity account never counts, so a bill that buys equipment on a fixed asset account is not in the report.

- A vendor credit lowers the vendor's figure, and so does a refund of an expense. A vendor that has only a vendor credit in the period shows below zero.
- The No vendor row adds the expense lines that name no vendor, such as an expense with no payee, a journal entry line with no name, or the bad debt line of a write-off. It shows after every vendor.
- % of expenses is the row's Total as a share of the report's Total, to two places, so the Total row shows 100.00% and a row below zero has a share below zero. An opened line shows no share. When the report's Total is 0, the column is blank.
- An inactive vendor with expenses in the period shows with "(inactive)" after its name, in lighter text.
- With no vendor picked, the Total row at the end equals Cost of goods sold plus Expenses plus Other expenses of the Profit and Loss for the same period and basis. These figures agree because both reports add the same posted lines on the same three account types, and each line names at most one vendor, so it counts in exactly one row.

To see the lines behind a vendor's figure, press the vendor row: it opens into one row for each posted expense line, in date order. Each line shows its date, its type and number, its account and its line memo, or the entry memo when the line has none, for example "2026-10-14 · Bill 1042 · 6600 Rent or lease · Office rent". A bill's lines show the bill's memo. A line with no memo, in an entry with no memo, ends after its account. The lines add up to the vendor's Total. To open a line's document, press the line: the bill, expense, vendor credit, vendor refund, bill payment, write-off or journal entry opens as its own screen.

To change the basis, press the Method chip and pick Accrual, the default, or Cash. On Accrual a bill counts on its date. On Cash a bill counts when it is paid, by each payment's share, on the payment's date, and an expense counts on its date on both. On Cash an opened vendor also shows the rows that take an unpaid bill out of the cash basis: each bill line is followed by a row "Unpaid bill (cash basis)" with the opposite figure, and each payment adds a row for each bill line, such as "Bill 1042 paid (cash basis)", with the line's share of the payment. A vendor credit and a write-off have the same kind of rows ("Unapplied vendor credit (cash basis)", "Write-off (cash basis)"), and a vendor credit that is applied to a bill or refunded shows "Vendor credit 12 applied (cash basis)" or "Vendor credit 12 refunded (cash basis)". A bill that a vendor credit pays shows "Bill 1042 paid by vendor credit (cash basis)".

To change the period, press the Period chip. The default is This fiscal year to date. When no posted expense line is in the period, the report shows "No rows for" and the period.

To choose which vendors show, press the Rows chip. Non-zero, the default, shows each vendor whose Total is not 0. With activity also shows a vendor whose lines add up to 0, for example a bill and its void in the period, with 0.00% as its share.

To show only some vendors, press Add filter, then Vendor, and pick one or more vendors, inactive vendors included. Then press Apply. With vendors picked, the No vendor row does not show, the Total is the total of your picks, % of expenses is the share of that total, and a line under the period names your picks. To remove the filter, press the × on the Vendor chip.

To change the order, press the Order chip. Name, the default, orders the vendors by name. Largest expenses puts the largest Total first. The No vendor row stays last in both.

To see what you still owe each vendor, read the Vendor Balance instead, as [Read the Vendor Balance report](help://books:reports) above says. The Expenses by Vendor shows what you spent in the period, paid or not.

The report does not update by itself: under the chips it shows the note "This report does not update by itself. Press Refresh to see new changes." and a **Refresh** button. When someone posts or voids a bill, an expense, a vendor credit, a bill payment or a journal entry, renames a vendor, changes an account's type, or changes the Books settings after you opened the report, press **Refresh** to see the change.

On a phone, each row shows the name on the first line, then Total and % of expenses on the second. A long name or line wraps to at most three lines, and a figure is never cut. Customize and Export are under **⋯**.

## Read the 1099 Summary and Detail report

To see what you paid each 1099 vendor in a calendar year, open Reports and choose 1099 Summary and Detail. You can also press Reports at the top of the Vendors list, then 1099 Summary and Detail, or press **Open the 1099 report** in Settings → 1099s. The heading shows your business name, 1099 Summary and Detail, the period, the Show and Form choices (for example "Vendors: At or above the threshold" and "Form: NEC and MISC"), the vendors that you picked, and the threshold (for example "1099 threshold: $2,000.00").

The report counts payments by their payment date. An expense counts on its date, and a journal entry line counts on the entry's date. A bill counts only as far as it is paid: each bill payment counts its share of the bill's lines on the payment's date, and a vendor credit that pays a bill counts on the day it is applied. A vendor credit that is applied or refunded counts below zero on that day. A payment counts when it is posted, is on a Cost of goods sold, Expense or Other expense account, and names a vendor. A draft does not count. A voided document does not count, because its void reversal cancels the original. A payment's figure is its debit minus its credit.

A card payment is an expense, a bill payment or a vendor refund with the payment method Credit card or Debit card, or one that is paid from a credit card account (for a vendor refund, refunded to one). The card processor reports card payments on a 1099-K, so a card payment is never reportable and the report shows it under Excluded. A journal entry line is never a card payment. So a card charge that you categorize from a bank transaction in Banking, which posts as a journal entry, counts under Reportable when its account has a 1099 box.

Each row shows three figures:

- Reportable: the payments on accounts with a 1099 box that are not card payments.
- Excluded: the card payments and the payments on accounts with no box. Excluded is blank on a row with nothing excluded.
- All payments: every payment, so All payments is Reportable plus Excluded.

Each vendor row shows the vendor's name, then "(inactive)" when the vendor is inactive, in lighter text, and "(legal name: …)" when its legal name differs from its name. Under each vendor, the report shows a row for each 1099 box that has payments, such as "NEC 1 · Nonemployee compensation" or "MISC 1 · Rents", in box order, then Not reported. A payment's box is the box that its account has in Settings → 1099s when the report runs, so a change of an account's box moves the account's payments of every year. The Not reported row holds the payments on accounts with no box: to report them, give the account a box in Settings → 1099s, then press **Refresh**. A vendor with no payment in the period has no row. The Total row at the end adds the vendors that the report shows.

The threshold is the 1099 reporting threshold in Settings → 1099s, and only a Books admin can change it there. The report compares the threshold with each vendor's Reportable, added across the vendor's boxes, and a vendor at exactly the threshold is at or above it.

To choose which vendors show, press the Show chip: At or above the threshold, the default, shows the 1099 vendors whose Reportable is equal to or more than the threshold. Below the threshold shows the 1099 vendors whose Reportable is less than it. All 1099 vendors shows every vendor that has Track payments for 1099 on. Not tracked for 1099 shows the vendors with tracking off that have payments, so you can find a vendor that you did not mark. To track a vendor, see [1099 tracking](help://books:1099-tracking).

To report one form, press the Form chip. NEC and MISC, the default, shows every box. With Form set to 1099-NEC the report shows only the box NEC 1, and with 1099-MISC only the MISC boxes; then the Not reported rows and the boxes of the other form do not show, and the threshold is compared with the Reportable of that form.

To change the order, press the Order chip: Name, the default, orders the vendors by name, and Largest reportable puts the largest Reportable first.

To show only some vendors, press Add filter, then Vendor, and pick one or more vendors. Then press Apply. A line under the period names your picks. To remove the filter, press the × on the Vendor chip.

The period is a calendar year: the default is This calendar year, January 1 to December 31, whatever month your fiscal year starts in. To change it, press the Period chip and pick Last calendar year, another preset or Custom; the threshold is then compared with the payments of that period. When no vendor has a row to show, the report shows "No rows for" and the period.

Each vendor row is open when the report opens, and each box row is closed. To see the payments behind a box, press the box row: it opens into one row for each payment, in date order. Each payment shows its date, its type and number, its account and its line memo, or the entry memo when the line has none, for example "2026-05-08 · Bill payment 14 · 6210 Design Tools · Bill 1058 paid (cash basis)". A card payment ends with "· paid by card". When a payment in the period is voided, the opened box shows the payment and its void reversal as two rows, one above zero and one below, that add up to zero. Expand all and Collapse all open and close every row. To open a payment's document, press the payment: the expense, bill payment, vendor credit, vendor refund or journal entry opens as its own screen.

The report shows no tax ID. To see which 1099 vendors are missing a tax ID, open Settings → 1099s.

The report does not update by itself: under the chips it shows the note "This report does not update by itself. Press Refresh to see new changes." and a **Refresh** button. When someone posts or voids a payment, changes an account's box, turns tracking on or off for a vendor, or changes the threshold after you opened the report, press **Refresh** to see the change.

On a phone, each row shows the name on the first line, then Reportable, Excluded and All payments on the second. A long name or payment wraps to at most three lines, and a figure is never cut. Customize and Export are under **⋯**.

## Reports that you refresh

Six Books reports read every journal line, so they do not run again each time the books change: the General Ledger, Transaction Detail by Account, the Trial Balance, the Balance Sheet, the Journal and the Profit and Loss by Month. Under the chips, each of them shows the note "This report does not update by itself. Press Refresh to see new changes." and a **Refresh** button. The Expenses by Vendor reads every posted expense line on the basis you choose, so it shows the same note and **Refresh** button too. The 1099 Summary and Detail reads posted payment lines too, with no basis to choose, so it also shows the note and **Refresh** button.

To see the changes made after you opened the report, press **Refresh**, or press the R key. The report runs again and keeps your place. A change that you make to a chip or to a filter runs the report again, and that run reads the newest data. Customize changes only how the figures look.

Transaction Detail by Account opened from a figure, in the panel at the side, has its own **Refresh** button.

The Profit and Loss, the Customer Balance, the Vendor Balance, the A/R Aging, the A/P Aging, the sales reports, the Sales Tax Liability, the Audit Log, the Reconciliation Report and the two statement reports stay current: they run again when the books change, and show no **Refresh** button. When someone saves a change to the columns, the filters or the layout of the Profit and Loss, the Customer Balance, the Vendor Balance, the Audit Log or Statement: Balance Forward, that report does not update by itself any more and shows **Refresh**. A change to only the title or the description keeps it current.

A report that you build over journal lines, or that shows columns from journal lines, or over the Audit log, does not update by itself. A copy that you keep with Save as of one of the six reports above, of the Profit and Loss, of the Customer Balance, of the Vendor Balance, of the Expenses by Vendor, of the 1099 Summary and Detail, of the Audit Log or of Statement: Balance Forward does not update by itself either. Each shows the same note and **Refresh** button. A copy of the A/R Aging, of the A/P Aging, of a sales report, of the Sales Tax Liability or of Statement: Open Items stays current.

## Download or email a report

To keep or send a copy of a report, press **Export** on a Books report (on a phone, the entries are under **⋯**) and choose a PDF, an Excel or a CSV file, or **Email report…**. The file is named after the report and its period or as-of day, for example `profit-and-loss-2026-01-01-to-2026-11-15.pdf`. For what each file holds and how to email it, see [Download or email a report](help://core:reports).

## See who changed a record

The Audit Log lists every change that people made to Books records: when, who, what happened, and to which record. Press a row to see the record's history field by field. To read it, see [Audit log](help://books:audit-log).

## Who sees Books reports

Every user with Books read access sees the Trial Balance, the General Ledger, the Balance Sheet, the Journal, the Profit and Loss, the Profit and Loss by Month, Transaction Detail by Account, the Sales Tax Liability, the Customer Balance, the A/R Aging, the A/P Aging, the Vendor Balance, the Expenses by Vendor, the 1099 Summary and Detail, Sales by Customer, Sales by Product/Service, the Reconciliation Report and the Audit Log, in every role, guests with Books access included. Books gives each of these users a viewer share of each report, and keeps the shares in step with Books access. When you give a user Books access, the user gets the share. When you remove the access, the share is removed. A user who has been offboarded has no share. Books gives no share to a user without Books access. An editor share that someone gives by hand stays until someone removes it.

A reader can change the chips and Customize for the run, copy a link with Copy link, and keep a copy with Save as. Each reader sees only the data that the reader can access.

## Build your own Books report

To make your own report from Books data, such as accounts, journal entries, journal lines, monthly account balances or customers, see [Build, share and publish reports](help://core:reports).

A report that you build over journal lines, or that shows columns from journal lines, does not update by itself (see "Reports that you refresh" above).

The sales tax data is in four sources: Sales tax lines, Tax agencies, Tax rates and Sales documents. Sales tax lines has one row for each document and tax rate, written when the document is posted. Sales documents holds the invoices, the sales receipts, the credit memos and the refund receipts together. In Sales documents, a credit memo has the Kind "Credit memo" and a refund receipt the Kind "Refund receipt", and their Subtotal, Tax and Total are positive, as they are on the document. A credit memo lowers what the customer owes, so a report that adds totals across kinds must filter by Kind, for example to invoices and sales receipts only. A voided document keeps its tax lines, so filter on the document's status to count only posted documents. For example, start from Sales tax lines to build the tax of each customer.

## Statement reports

Two Books reports hold the lines of customer statements: **Statement: Balance Forward** (a customer's balance before a period, then each Accounts receivable line of the period with the running balance) and **Statement: Open Items** (each item open on a day, with its due date and aging). Every Books reader sees them in the Reports hub. Each statement's PDF is built from one run of its type's report for that customer, as the user who opens it. To make and send statements, see [Customer statements](help://books:statements).

## Reconciliation Report

The **Reconciliation Report** shows each finished reconciliation of a bank or credit card account: the beginning balance, each cleared transaction with the running balance, and the total, which is the statement's ending balance. Filter it by Account and by Statement. To open it for one statement, press View report on the reconciliation's summary or on its row in the History tab of Reconcile. To read it, see [Reconcile an account](help://books:reconcile).
