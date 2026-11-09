---
title: Run and customize a report
summary: Pick a report, set its period and filters, and change how its numbers look.
tags: [reports, trial balance, general ledger, balance sheet]
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

To see the lines of an account, press its row. Its posted lines open below it, in date order, then by entry number. Each line shows its date, its entry number and its memo, and its amount in Debit or Credit by its sign. The No. column stays blank on the lines. To open every account, press Expand all. When an account is open, the same button reads Collapse all.

When no account shows on the day, the report shows "No rows as of" and the day. To move the day to the end of the last fiscal year, press Show end of last fiscal year.

To change how the numbers look, press Customize. You can divide by 1000, show amounts without cents, show negative numbers as -100 or (100) or in red, and hide the No., Debit or Credit column. Customize never changes the figures.

The report stays current. When someone posts or voids an entry, changes an account, or changes the Books settings, the report runs again.

## Read the General Ledger

The General Ledger shows every posted journal line of a period, with one section for each account. To open it, choose Reports in the Books sidebar, then press General Ledger. Its heading shows your business name, General Ledger, and the period, for example "October 1 – 28, 2026".

The sections show in the order of the chart of accounts. Each section has the account number and full name, for example "1000 Business Checking". All sections are open when the report opens. To fold a section, press its heading. Press it again to open it. To fold or open all sections, press Collapse all or Expand all.

- The first row of a section is Beginning balance. It shows the balance of the account on the day before the period starts. Asset, liability and equity accounts count all earlier posted lines. Income and expense accounts count only the lines from the start of the fiscal year that holds the first day of the period. The retained earnings account also counts the income and expense lines of earlier fiscal years. With All dates, every beginning balance is 0.00.
- Each line of the section shows its date, Type (for example Journal entry, Transfer or "Void reversal of JE-12"), No. (the entry number), Name (the customer or vendor on the line), Description (the line memo, or the entry memo when the line has none), Split, Debit and Credit. Split shows the other account of the entry. When the entry has more than two lines, Split shows "-Split-".
- The lines show in date order, then in the order they were posted.
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

To change which accounts show, press the Rows chip and pick one:

- Non-zero shows the accounts with a balance that is not zero on the As of day or on the Prior year day. This is the default.
- Active shows the accounts with a posted line on or before the As of day, also when the balance is zero.

To see the lines of an account, press its account row. Its posted lines open below it, in date order, then by entry number. Each line shows its date, its entry number and its memo. Current shows the amount of the line. Prior year shows the amount when the line is on or before the Prior year day, and 0.00 when it is not. Change and % change stay blank on the lines. Retained earnings and Net income do not open.

To change how the numbers look, press Customize. You can divide by 1000, show amounts without cents, show negative numbers as -100 or (100) or in red, and hide the Current, Prior year, Change or % change column. The report opens with all four columns shown. Customize never changes the figures.

On a phone, each row wraps onto two lines in the table: the account, then Current, Prior year and Change. A phone does not show % change. The table does not scroll sideways. On a narrow window, the account name gets shorter and ends in "…", and the figures always show in full.

The report stays current. When someone posts or voids an entry, changes an account, or changes the Books settings, the report runs again.

## Who sees Books reports

Every user with Books read access sees the Trial Balance, the General Ledger and the Balance Sheet, in every role, guests with Books access included. Books gives each of these users a viewer share of each report, and keeps the shares in step with Books access. When you give a user Books access, the user gets the share. When you remove the access, the share is removed. A user who has been offboarded has no share. Books gives no share to a user without Books access. An editor share that someone gives by hand stays until someone removes it.

A reader can change the chips and Customize for the run, copy a link with Copy link, and keep a copy with Save as. Each reader sees only the data that the reader can access.

## Build your own Books report

To make your own report from Books data, such as accounts, journal entries, journal lines, monthly account balances or customers, see [Build, share and publish reports](help://core:reports).
