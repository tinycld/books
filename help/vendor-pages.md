---
title: Vendor pages
summary: See what you owe a vendor, start a bill or a payment for them, and keep their details, notes and contact people in one place.
tags: [vendors, balance, bills, contacts]
order: 32
---

To see what you owe a vendor, open the vendor from the Vendors list. The vendor's page opens on the Transactions tab, with the name, the company and the address at the top, and what you owe the vendor on the right. To find a vendor and open the list, see [Vendors](help://books:vendors).

## What you owe the vendor

The page shows two figures:

- **Open** is what you owe the vendor in all: the vendor's balance on Accounts payable, from every posted entry that names the vendor. A bill raises it; a bill payment and a vendor credit lower it. When you post or void one of them anywhere in Books, the figure changes at once.
- **Overdue** is what is still open on the vendor's posted bills whose due date is before today: their balance, not their total, so a part payment lowers it and a paid bill drops out. A bill due today is not overdue.

If the vendor owes you (for example, a vendor credit larger than the open bills), the first figure shows as a negative amount, such as −$120.00, with the label **Credit** in place of Open. If the figures cannot load, the page shows "Balance unavailable"; choose Retry to load them again.

## Start a transaction for the vendor

To start a transaction for this vendor, choose **New transaction**, or press ⌥N, and pick one of:

- **Bill**: see [Bills](help://books:bills).
- **Pay bills**: pay this vendor's open bills.
- **Expense**: a purchase you paid at once.
- **Vendor credit**: a credit the vendor gives you.
- **Vendor refund**: money the vendor pays back to you.

The new document opens with the vendor filled in. Go back to return to the vendor's page, with any changes you had not saved still there. You cannot start a transaction for an inactive vendor: the button is disabled and says "Make this vendor active to add transactions." Make the vendor active first.

## The tabs

The page has four tabs. To select one from anywhere on the page, a text field included, press ⌥1 to ⌥4.

- **Transactions** (⌥1) lists the vendor's documents.
- **Contacts** (⌥2) lists the people at the vendor.
- **Details** (⌥3) is the vendor form: names, address, terms, account number, default expense account, 1099 fields and custom fields.
- **Notes** (⌥4) holds your notes about the vendor.

## The Transactions list

The Transactions tab lists the vendor's bills, expenses, bill payments, vendor credits and vendor refunds, newest first. Each row shows the date, the type, the number, the due date (bills only), the total and the status. A vendor credit's total shows with a minus sign, such as −$250.00, because it lowers what you owe. A draft has no number yet. A void document stays in the list with the Void status; when you correct a document, only the correction is listed.

The statuses are:

- A bill is Draft, Paid (nothing open), Partly paid (part of the total open), Overdue (all of the total open, due before today), Open or Void.
- An expense is Draft, Paid or Void.
- A bill payment is Paid or Void.
- A vendor credit is Draft, Unapplied (some of its credit is not used yet), Closed (all of its credit is used) or Void.
- A vendor refund is Draft, Received or Void.

To see one type only, choose its chip above the list: Bills, Expenses, Bill payments, Vendor credits or Vendor refunds. Choose All, or Show all when a chip has no rows, to see every type again. Choose a row to open its document; go back to return to the page.

## Contacts

The Contacts tab lists the people you deal with at the vendor: name, role, email and phone. The **Primary** contact is first and has a Primary badge; the others follow by name.

- To add a person, choose **Add contact**, or press ⌥C. Type a name (the only field you must fill in), and a role, an email and a phone if you have them. Turn on Primary contact to make the person the primary contact. Choose Save, or press ⌘↵.
- To change a person, open the menu on the person's row and choose Edit.
- To make another person the primary contact, open the menu on the person's row and choose Make primary. A vendor has one primary contact, so the person who was primary before loses the badge.
- To delete a person, open the menu on the person's row, choose Delete, then choose Delete in the dialog.

## Edit in place

You change Details and Notes on the page itself; there is no Edit button. When you change a field, a bar shows at the bottom of the page, on every tab, with Save and Cancel. Choose Save, or press ⌘S, to write the changes and stay on the page. Choose Cancel, or press Esc, then Discard to put back the stored values. If you leave the page with changes that are not saved, Books asks "Discard changes?" first: choose Keep editing to go back, or Discard to leave without saving. A document you open from the page does not ask, because the page stays under it. When nothing is changed, Esc goes back to the list.

## More

Choose **More** beside New transaction to make the vendor inactive or active again (Make inactive, Make active), to delete the vendor (Delete vendor), or to see the vendor's audit history (Audit history).

## Shortcuts

- ⌥N opens New transaction.
- ⌥1 to ⌥4 select the tabs.
- ⌘S saves your changes, and Esc cancels them (or goes back to the list when nothing is changed).
- ⌥C adds a contact, and ⌘↵ saves the contact dialog.

## Email and Call

Beside the vendor's name, Email opens a new message to the vendor's email address in your mail app, and Call opens your phone app with the vendor's phone number (or the mobile number when there is no phone). Each shows only when the vendor has that value. In the Contacts tab, the email and the phone of each person open the same way. On a computer with no phone app, a browser cannot place a call, so Call and a phone number open nothing.

## Read-only users

A read-only user sees the figures, the transactions, the contacts, the details and the notes, but cannot change them. New transaction is not shown, the contacts have no actions, and More holds Audit history only.

## On a very wide window

On a very wide window, the vendor's page sits beside the list of vendor names, so you can go from one vendor to the next. On a smaller window or a phone, the page covers the list; choose Vendors at the top to go back. For the customer's page, see [Customer pages](help://books:customer-pages).
