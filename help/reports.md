---
title: Run and customize a report
summary: Pick a report, set its period and filters, and change how its numbers look.
tags: [reports, trial balance, general ledger, balance sheet, journal, profit and loss, transaction detail, sales tax liability, Audit Log]
order: 60
---

Books reports, such as the Trial Balance, run in the Reports area of the app. A change to a chip or to Customize applies at once. The Accounts filter applies when you press Apply. There is no Run button.

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

To see the lines of an account, press its row. Its posted lines open below it, in date order, then by entry number. Each line shows its date, its entry number and its memo, and its amount in Debit or Credit by its sign. The No. column stays blank on the lines. Press a line to open the transaction that posted it. To open every account, press Expand all. When an account is open, the same button reads Collapse all.

To see the transactions behind the Debit or Credit of an account, press the figure (see "See the transactions behind an amount" below).

When no account shows on the day, the report shows "No rows as of" and the day. To move the day to the end of the last fiscal year, press Show end of last fiscal year.

To change how the numbers look, press Customize. You can divide by 1000, show amounts without cents, show negative numbers as -100 or (100) or in red, and hide the No., Debit or Credit column. Customize never changes the figures.

The report stays current. When someone posts or voids an entry, changes an account, or changes the Books settings, the report runs again.

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

To see the lines of an account, press its account row. Its posted lines open below it, in date order, then by entry number. Each line shows its date, its entry number and its memo. Current shows the amount of the line. Prior year shows the amount when the line is on or before the Prior year day, and 0.00 when it is not. Change and % change stay blank on the lines. Retained earnings and Net income do not open.

To see the transactions behind the Current or Prior year figure of an account, press the figure (see "See the transactions behind an amount" below).

To change how the numbers look, press Customize. You can divide by 1000, show amounts without cents, show negative numbers as -100 or (100) or in red, and hide the Current, Prior year, Change or % change column. The report opens with all four columns shown. Customize never changes the figures.

On a phone, each row wraps onto two lines in the table: the account, then Current, Prior year and Change. A phone does not show % change. The table does not scroll sideways. On a narrow window, the account name gets shorter and ends in "…", and the figures always show in full.

The report stays current. When someone posts or voids an entry, changes an account, or changes the Books settings, the report runs again.

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

The report stays current. When someone posts or voids an entry, changes an account, renames a customer or vendor, or changes the Books settings, the report runs again.

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

The report stays current. When someone posts or voids an entry, changes an account, or changes the Books settings, the report runs again.

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

On the web, ⌘-click or middle-click an amount to open Transaction Detail by Account in a new tab.

## Accrual and cash basis

The Profit and Loss, the Profit and Loss by Month, the Balance Sheet, Transaction Detail by Account and the Sales Tax Liability have a Method chip. To change the method, press the Method chip and pick Accrual or Cash. The default is Accrual. The heading of the report shows the method under the period, for example "Accrual basis" or "Cash basis".

- On Accrual, every posted entry counts on its own date. A bill counts on the bill date, and an invoice on the invoice date.
- On Cash, bills and invoices count only when they are paid, and only as far as they are paid. A bill of 500.00 with a payment of 200.00 counts 200.00, on the date of the payment. The rest counts when it is paid.
- Each payment brings back its share of each line of the bill or invoice. For example, a bill with 700.00 of office supplies and 300.00 of software, paid 400.00, counts 280.00 of office supplies and 120.00 of software.
- All other entries count on their own date on Cash too: journal entries, transfers, expenses, sales receipts, bill payments, customer payments and opening balances. A customer payment that is more than its invoices counts in full on its date, because the business has the money.
- On the Balance Sheet on Cash, Accounts payable and Accounts receivable do not hold the unpaid part of bills and invoices. Total assets still equals Total liabilities and equity.
- When you void or edit a payment, Books calculates again the shares of the other payments of the same bill or invoice. Thus voiding a payment can move another payment's share between the lines of the document by one cent. The total of each payment does not change.

When you press an amount on Cash, Transaction Detail by Account opens on Cash too. Its lines show the parts that the cash basis moves: a line "Unpaid bill (cash basis)" or "Unpaid invoice (cash basis)" takes a document out on its own date, with the number of the document, and a line such as "Bill 1003 paid (cash basis)" or "Invoice 1004 paid (cash basis)" brings back a payment's share on the payment date, with the number of the payment.

The General Ledger, the Trial Balance and the Journal show the accrual basis only.

## Read the Sales Tax Liability report

To see the sales tax you owe each agency, open the Sales Tax Liability report. Choose Reports in Books (the sidebar, or the Books menu on a phone), then press Sales Tax Liability, or press Liability report at the top of the Sales tax page. The heading shows your business name, Sales Tax Liability, and the period, for example "October 1 – 31, 2026".

The report shows the sales tax that you charged in the period, by agency and then by rate. The agencies show in name order, and inside each agency its rates show in name order. An inactive agency or rate with tax in the period shows like an active one.

- Only posted invoices and posted sales receipts count: a draft does not count, and a voided document does not count. When you edit a posted document, Books voids the original, so only the new version counts.
- The report opens on Accrual. To change the method, press the Method chip and pick Accrual or Cash (see "Accrual and cash basis" above). The heading shows "Accrual basis" or "Cash basis" under the period.
- On Accrual, a sale counts in the period of its own date, not the day it is paid.
- On Cash, the tax of an invoice counts only when the invoice is paid, and only as far as it is paid. Each payment brings back its share of the invoice's Gross total, Taxable amount and Tax amount on the date of the payment. For example, an invoice of 1,080.00 with 80.00 of tax, paid 540.00, counts 40.00 of tax on the payment date. A sales receipt counts on its own date, because it is paid when you enter it.
- On Cash, an open rate shows each invoice on its own date with its tax, and again with the same tax taken out, so the two add up to 0.00. Each payment shows its share as one more row of the invoice, on the payment date.
- Gross total is the sale before tax. Taxable amount is the part of the sale that the tax was calculated on. Non-taxable is Gross total minus Taxable amount. Tax amount is the tax of the rate.
- Each figure is the one Books stored when the document was posted. A later change to a rate, to a product's Taxable setting or to a customer's exemption does not change the report.
- A rate row adds the figures of the documents that charged that rate.
- The total row of each agency ("Total" and the agency name) and the Total row at the end show only the Tax amount. The sales columns are blank there, because a sale taxed by two rates of one agency would be counted twice.
- A sale with no tax rate, for example a sale to an exempt customer, has no sales tax, so it is not in the report.
- A sale with a tax rate and no taxable line shows under that rate: its sales are Non-taxable, and its tax is 0.00. A rate of 0% shows its sales with tax 0.00.

The agencies are open when the report opens, and the rates are folded. To see the documents that charged a rate, press the rate row. Its documents open below it, in date order, then by number. Each document shows the date it counts on, its type and number, and its customer, for example "2026-10-14 · Invoice 1042 · Harborview Dental", with its four figures. A sales receipt with no customer ends after its number. To open the invoice or sales receipt, press its document row. To fold or open all levels, press Collapse all or Expand all.

To change the dates, press the Period chip. The default is Last month. Pick a preset, such as This month or Last quarter, or pick Custom and type the first and last day. When no posted sale was taxed in the period, the report shows "No rows for" and the period.

To show only some agencies, press Add filter, then Agency. Pick one or more agencies, inactive agencies included, then press Apply. To remove the filter, press the × on the Agency chip.

The balance of an agency's liability account on the Balance Sheet also holds the payments and adjustments that you post to it, which this report does not show. Thus the report is the tax you charged, not what you still owe after a payment.

To change how the numbers look, press Customize. Customize never changes the figures.

The report stays current. When someone posts or voids an invoice, a sales receipt or a customer payment, the report runs again.

On a phone, each row wraps onto three lines in the table: the name; then Gross total and Non-taxable; then Taxable amount and Tax amount. The table does not scroll sideways.

## See who changed a record

The Audit Log lists every change that people made to Books records: when, who, what happened, and to which record. Press a row to see the record's history field by field. To read it, see [Audit log](help://books:audit-log).

## Who sees Books reports

Every user with Books read access sees the Trial Balance, the General Ledger, the Balance Sheet, the Journal, the Profit and Loss, the Profit and Loss by Month, Transaction Detail by Account, the Sales Tax Liability and the Audit Log, in every role, guests with Books access included. Books gives each of these users a viewer share of each report, and keeps the shares in step with Books access. When you give a user Books access, the user gets the share. When you remove the access, the share is removed. A user who has been offboarded has no share. Books gives no share to a user without Books access. An editor share that someone gives by hand stays until someone removes it.

A reader can change the chips and Customize for the run, copy a link with Copy link, and keep a copy with Save as. Each reader sees only the data that the reader can access.

## Build your own Books report

To make your own report from Books data, such as accounts, journal entries, journal lines, monthly account balances or customers, see [Build, share and publish reports](help://core:reports).

The sales tax data is in four sources: Sales tax lines, Tax agencies, Tax rates and Sales documents. Sales tax lines has one row for each document and tax rate, written when the document is posted. Sales documents holds the invoices and the sales receipts together. A voided document keeps its tax lines, so filter on the document's status to count only posted documents. For example, start from Sales tax lines to build the tax of each customer.
