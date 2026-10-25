---
title: Chart of Accounts
summary: Read, add, edit, deactivate, delete and import the accounts your books use.
tags: [accounts, chart of accounts, import, csv]
order: 20
---

The Chart of Accounts lists every account your books use. To open it, choose Chart of Accounts in the Accounting group of the sidebar, or choose the Accounts card on the Lists page.

## Read the tree

Each account shows its number, name, type, detail type and balance. A sub-account sits under its parent. To fold a parent, press the arrow next to it. A folded parent shows "incl. sub-accounts" and its balance includes the balances of all accounts under it.

To find an account, type part of its name or number in the search box. To narrow the list to one kind of account, use the group chips. To re-sort, press the Name, Type or Balance heading. Press it again to reverse the order. Inactive accounts are hidden until you turn on Show inactive.

To see the transactions of one account, open its menu and choose View register. See [Account register](help://books:account-register).

## Add or edit an account

To add an account, choose New account. Enter a name, choose the type and the detail type, and choose Save. To keep adding accounts, choose Save and new. To make an account a sub-account, choose its Parent account. Leave Parent account on None (top level) for a top-level account. A sub-account has the same type as its parent. Accounts can nest up to 5 levels.

To edit an account, press its row. The type is locked when the account has journal lines or sub-accounts.

You need bookkeeper access to change accounts. With read-only access you can look at accounts but not change them.

## Make an account inactive

An inactive account stays in your books but you cannot post to it. To make an account inactive, open the menu on its row and choose Make inactive. To do the same for several accounts, select them with the checkboxes and choose Make inactive from Batch actions. To use an inactive account again, turn on Show inactive and choose Make active in its menu.

## Delete an account

To delete an account, open the menu on its row and choose Delete. An account that has journal lines or sub-accounts cannot be deleted. The dialog tells you why and offers Make inactive instead.

## Import accounts from a CSV file

To add many accounts at once, choose Import on the Chart of Accounts page. The import has three steps.

1. **Upload.** Choose a CSV file. On the web you can also drag the file onto the upload area. The file must have a header row, use commas between columns (a comma-separated file; semicolons and tabs are not supported), and be UTF-8. The limit is 2000 rows and 1 MB. The page shows an example. To copy it, choose Copy example.
2. **Map columns.** Match each of Number, Name, Type, Detail type, Parent, Description and Inactive to a column of your file. The page matches columns by their header text. Name and Type must be matched. Every row needs a Type and a Detail type that belong together (a valid pair), and the example on the page shows valid values.
3. **Import.** The preview lists every row as Ready, Skipped: already exists, or Error with the reason. Rows with errors are never imported. The button reads Import N accounts, where N is the number of Ready rows. Choose it to add those rows. Parents are added before their children. If two rows claim the same number, the preview marks the row inserted second (parents go first) with an Error, and error rows are not imported.

A Parent cell can hold the full path, for example `Cash and bank:Operating checking`, or just a name when only one account has it. Inactive accepts yes, no, true, false, 1 or 0.

If the server refuses a row, the import stops. The page shows how many rows were imported, the row that failed as Row N, its name and the reason. Fix the file and import it again: rows that already exist are skipped, so nothing is added twice.

Imported balances are not supported.

See also [Moving around Books](help://books:navigating-books).

To enter the balances your accounts held on your starting date, see [Opening balances](help://books:opening-balances).
