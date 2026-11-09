---
title: Run and customize a report
summary: Pick a report, set its period and filters, and change how its numbers look.
tags: [reports, trial balance, general ledger, journal]
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

## Read the Journal

The Journal shows every posted entry of a period with its debit and credit lines. To open it, choose Reports in the Books sidebar, then press Journal. Its heading shows your business name, Journal, and the period, for example "October 1 – 31, 2026".

Each posted entry is one block in the report. The heading of a block shows the entry number and type, for example "JE-41 · Journal entry" or "TR-7 · Transfer". An entry with no number shows its type alone. The blocks show in date order, then in the order the entries were posted. All blocks are open when the report opens.

- Each line of a block shows its date, Account (the account number and full name), Name (the customer or vendor on the line), Description (the line memo, or the entry memo when the line has none), Debit and Credit. A blank Debit or Credit is zero. The lines show in the order of the lines in the entry.
- Each block ends in its total row, for example "Total JE-41 · Journal entry", and the block total has an equal Debit and Credit.
- The Total row at the end of the report adds the Debit and Credit of every line that shows, and they are equal.
- Only posted entries show. Drafts never show. A voided entry and its void reversal both show, each as its own block, for example "JE-12 · Void reversal of JE-12".

To change the dates, press the Period chip. The default is This month to date. Pick a preset, such as This month, Last quarter or This fiscal year, or pick Custom and type the first and last day. To see every entry from the start of your books, pick All dates. When no entry was posted in the period, the report shows "No rows for" and the period. To see the whole fiscal year, press Show this fiscal year.

To fold a block, press its heading. A folded block shows the Debit and Credit totals of the entry on its heading. Press the heading again to open it. To fold or open all blocks, press Collapse all or Expand all.

To sort the lines inside each block, press a column heading, for example Debit. The blocks keep their order. Press the heading again to sort in the opposite direction, and a third time to go back to the order of the report. Copy link keeps the sort.

A long period does not load all its entries at once. When you scroll near the end, the report loads the next blocks. A long entry continues on the next part that loads, and the Total row shows at the end.

The report stays current. When someone posts or voids an entry, changes an account, renames a customer or vendor, or changes the Books settings, the report runs again.

On a phone, each line wraps onto three lines in the table: the date and Account; then Name and Description; then Debit and Credit. On a tablet, each line wraps onto two lines: the date, Account, Debit and Credit; then Name and Description. A narrow desktop window shows the tablet arrangement too. The table does not scroll sideways.

## Who sees Books reports

Every user with Books read access sees the Trial Balance, the General Ledger and the Journal, in every role, guests with Books access included. Books gives each of these users a viewer share of each report, and keeps the shares in step with Books access. When you give a user Books access, the user gets the share. When you remove the access, the share is removed. A user who has been offboarded has no share. Books gives no share to a user without Books access. An editor share that someone gives by hand stays until someone removes it.

A reader can change the chips and Customize for the run, copy a link with Copy link, and keep a copy with Save as. Each reader sees only the data that the reader can access.

## Build your own Books report

To make your own report from Books data, such as accounts, journal entries, journal lines, monthly account balances or customers, see [Build, share and publish reports](help://core:reports).
