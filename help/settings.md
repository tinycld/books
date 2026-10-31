---
title: Settings
summary: Company details, the close date and overrides, document numbering, 1099s, and who can open Books.
tags: [settings, close date, override, numbering, 1099s, access]
order: 20
---

To close the books through a date, open Settings, choose Accounting, turn on Close the books and enter the date. People can no longer post entries dated on or before that date. If you move the date earlier or turn the switch off, Books asks you to confirm that closed periods will reopen.

To let someone post into a closed period, open Settings, choose Accounting and press Grant an override under Close the books. Pick the person, give a reason of at least 3 characters and choose how long it lasts. Only a person with Bookkeeper or Admin access can receive an override. The override ends by itself when its time is over. To end it early, press Revoke on its row. Past overrides stay under Show past overrides, without actions. A person who holds an override sees it in Settings with the reason.

## Company details

To change company details, open Settings and choose Company. Enter the legal business name, tax ID, address, phone, email and website, then press Save. Books uses one currency, US dollars. The logo and brand color are set in the organization settings. If you only have read access, you see the details but cannot change them. To set up Books for the first time, see [Set up Books](help://books:setup-wizard).

## Fiscal year

To change the month the fiscal year starts, open Settings, choose Accounting, pick the month and press Save.

## Numbering

To change how entries are numbered, open Settings and choose Numbering. Each document type has a prefix and a next number. A new prefix applies to entries posted from now on, and numbers already issued do not change. The next number can move forward only, so it never repeats a number. If a number is already used, Books shows a message under Next number.

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
