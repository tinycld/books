---
title: Run and customize a report
summary: Pick a report, set its period and filters, and change how its numbers look.
tags: [reports, trial balance]
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

## Who sees Books reports

Every user with Books read access sees the Trial Balance, in every role, guests with Books access included. Books gives each of these users a viewer share of the report, and keeps the shares in step with Books access. When you give a user Books access, the user gets the share. When you remove the access, the share is removed. A user who has been offboarded has no share. Books gives no share to a user without Books access. An editor share that someone gives by hand stays until someone removes it.

A reader can change the chips and Customize for the run, copy a link with Copy link, and keep a copy with Save as. Each reader sees only the data that the reader can access.

## Build your own Books report

To make your own report from Books data, such as accounts, journal entries, journal lines, monthly account balances or customers, see [Build, share and publish reports](help://core:reports).
