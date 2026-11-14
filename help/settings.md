---
title: Settings
summary: Company details, the close date and overrides, sales deposits and the default message, bill lines, document numbering, 1099s, and who can open Books.
tags: [settings, close date, override, sales, default message, purchases, bill lines, numbering, 1099s, access]
order: 20
---

To close the books through a date, open Settings, choose Accounting, turn on Close the books and enter the date. People can no longer post entries dated on or before that date. If you move the date earlier or turn the switch off, Books asks you to confirm that closed periods will reopen.

To let someone post into a closed period, open Settings, choose Accounting and press Grant an override under Close the books. Pick the person, give a reason of at least 3 characters and choose how long it lasts. Only a person with Bookkeeper or Admin access can receive an override. The override ends by itself when its time is over. To end it early, press Revoke on its row. Past overrides stay under Show past overrides, without actions. A person who holds an override sees it in Settings with the reason.

## Company details

To change company details, open Settings and choose Company. Enter the legal business name, tax ID, address, phone, email and website, then press Save. Books uses one currency, US dollars. The logo and brand color are set in the organization settings. To see how documents print with these details, press Preview PDF. See [Printed documents](help://books:documents). If you only have read access, you see the details but cannot change them. To set up Books for the first time, see [Set up Books](help://books:setup-wizard).

## Fiscal year

To change the month the fiscal year starts, open Settings, choose Accounting, pick the month and press Save.

## Sales

To set how sales receipts deposit and the message new documents start with, open Settings and choose Sales. Everyone with Books access sees the section; only a Books admin can change it. The section has two cards, each with its own Save button:

- Sales receipts: **Sales deposited to**. With Ask (the default), each sales receipt shows Deposit to and you pick the account there. Choose a bank account or an Undeposited funds account to hide Deposit to and deposit every sale to that account. While an account is chosen, Books does not let you make it inactive, delete it, or change it to a type that cannot take deposits.
- Invoices, estimates and sales receipts: **Default message to customer**, at most 4000 characters. New invoices, estimates and sales receipts start with this message, and you can change it on each one. A change does not touch documents that you already made.

For more, see [Sales receipts](help://books:sales-receipts).

## Purchases

To choose which line tables a new bill shows, open Settings and choose Purchases. Everyone with Books access sees the section; only a Books admin can change it. The Bills card has one setting, **Bill lines**, with its own Save button:

- Accounts and products (the default): a new bill shows Account details and Product and service details.
- Accounts only: a new bill shows Account details only.
- Products only: a new bill shows Product and service details only.

A table that the setting hides still shows on a bill that already has lines in it, so editing an older bill never loses lines. For more, see [Bills](help://books:bills).

## Numbering

To change how entries are numbered, open Settings and choose Numbering. Each document type has a card with a prefix and a next number, such as Invoices and Estimates. A new prefix applies to entries posted from now on (on the Estimates card, to estimates saved from now on, because an estimate takes its number when you first save it), and numbers already issued do not change. The next number can move forward only, so it never repeats a number. If a number is already used, Books shows a message under Next number.

## 1099s

To set up 1099 reporting, open Settings and choose 1099s. The section has three cards:

- Reporting threshold: the amount that the 1099 report will use, when it is available. Only a Books admin can change it.
- Accounts reported on 1099s: the 1099 box of each expense account. A bookkeeper or an admin can change the boxes.
- 1099 vendors: the vendors that you track for 1099, with the last four digits of each tax ID, or Missing tax ID. Choose a vendor to open it.

For the full steps, see [1099 tracking](help://books:1099-tracking).

## Access levels

To change who can use Books, open Settings and choose Access. Only a Books admin sees this section. Each person has one of four levels:

- None: Cannot open Books.
- Read-only: Can see everything and change nothing.
- Bookkeeper: Can enter and post entries and manage accounts. Cannot change settings, except the 1099 boxes of accounts.
- Admin: Everything a bookkeeper can do, plus settings, access, and close-date overrides.

Organization owners and admins always have Admin access, and their rows are locked. You cannot change your own access. A Books admin who is not an organization owner or admin can only switch a bookkeeper to admin and back. To search, type a name or an email address.

To work with accounts, see [Chart of Accounts](help://books:chart-of-accounts).
