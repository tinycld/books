---
title: Customer pages
summary: See what a customer owes, start a transaction for them, and keep their details, notes and contact people in one place.
tags: [customers, balance, contacts]
order: 31
---

To see what a customer owes, open the customer from the Customers list. The customer's page opens with the name, the company and the billing address at the top, and what the customer owes on the right. To find a customer and open the list, see [Customers](help://books:customers).

## What the customer owes

The page shows two figures:

- **Open** is what the customer owes you in all: the customer's balance on Accounts receivable, from every posted entry that names the customer. When you post or void an invoice, a payment, a credit memo or a refund receipt that pays out a credit memo anywhere in Books, the figure changes at once. A posted credit memo lowers it by its Credit amount, and a refund receipt that pays out a credit memo raises it by its total.
- **Overdue** is what is still open on the customer's posted invoices whose due date is before today: their Balance due, not their total, so a part payment lowers it and a paid invoice drops out. A credit memo does not change it.

If the balance is in the customer's favour (you owe the customer, for example after a payment that was more than the open invoices, or a credit memo larger than them), the first figure shows as a negative amount, such as −$120.00, with the label **Credit** in place of Open. A parent customer's figures are its own only; each sub-customer has its own page. If the figures cannot load, the page shows "Balance unavailable"; choose Retry to load them again.

## Start a transaction for the customer

To start an invoice, an estimate, a sales receipt, a payment, a credit memo or a refund receipt for this customer, choose **New transaction**, or press ⌥N, and pick the type. To record money the customer sent, pick Receive payment: see [Receive payment](help://books:receive-payment). To give the customer a credit, pick Credit memo: see [Credit memos](help://books:credit-memos). The new document opens with the customer filled in. Go back to return to the customer's page. You cannot start a transaction for an inactive customer: make the customer active first.

## The tabs

The page has four tabs. To select one from anywhere on the page, press ⌥1 to ⌥4.

- **Transactions** (⌥1) lists the customer's invoices, estimates, sales receipts, payments, credit memos, refund receipts and write-offs, newest first. Choose a row to open it.
- **Contacts** (⌥2) lists the people at the customer.
- **Details** (⌥3) is the customer form: names, addresses, terms, sales tax and custom fields.
- **Notes** (⌥4) holds your notes about the customer.

## Invoice, payment and credit memo statuses

In the Transactions tab, each row shows its type and its status:

- An invoice is Draft, Paid (nothing open), Written off (nothing open, and a write-off took the rest), Partly paid (part of the total open), Overdue (all of the total open, due before today), Open or Void.
- A Payment is Draft, Applied (all of it paid invoices), Credit with the amount kept as a credit (such as Credit $100.00), or Void.
- A credit memo is Draft, Unapplied, Refunded or Void. A posted credit memo is Unapplied while some of its credit is not used yet, also after you refund part of it. A posted credit memo is Refunded when refund receipts pay out all of its credit.
- A refund receipt is Draft, Refunded (posted) or Void.

To see the payments only, choose the **Payments** chip above the list. Choose a payment's row to open the payment.

To see the credit memos only, choose the **Credit memos** chip. A credit memo's total shows with a minus sign, such as −$250.00, because it lowers what the customer owes, and it has no due date. A draft credit memo has no number yet. Choose a credit memo's row to open it.

To see the money you gave back to the customer, choose the **Refunds** chip, after Credit memos. Each row has the type Refund receipt, and its total shows with a minus sign, such as −$150.00. Choose a row to open the refund receipt. A refund receipt that refunds a sale does not change Open, because it does not touch Accounts receivable. A refund receipt that pays out a credit memo raises Open by its total, because it uses up the credit that you owed the customer. See [Refund receipts](help://books:refund-receipts).

To write off an invoice that the customer will not pay, open the row menu at the end of the invoice's row and choose **Write off**. Only a posted invoice with a balance due has it, and only if you can edit the books. The dialog opens over the page. To see the customer's write-offs, choose the **Write-offs** chip, after Refunds. Each row has the type Write-off, a total with a minus sign, such as −$400.00, and the status Written off or Void. A posted write-off lowers Open by its amount. Choose a row to open the write-off. See [Write off an invoice](help://books:write-offs).

## Edit in place

You change Details and Notes on the page itself; there is no Edit button. When you change a field, a bar shows at the bottom of the page, on every tab, with Save and Cancel. Choose Save, or press ⌘S, to write the changes and stay on the page. Choose Cancel, or press Esc, then Discard to put back the stored values. If you leave the page with changes that are not saved, Books asks "Discard changes?" first: choose Keep editing to go back, or Discard to leave without saving. When nothing is changed, Esc goes back to the list.

## Contacts

The Contacts tab lists the people you deal with at the customer: name, role, email and phone. The **Primary** contact is first and has a Primary badge; the others follow by name.

- To add a person, choose **Add contact**, or press ⌥C. Type a name (the only field you must fill in), and a role, an email and a phone if you have them. Turn on Primary contact to make the person the primary contact. Choose Save, or press ⌘↵.
- To change a person, open the menu on the person's row and choose Edit.
- To make another person the primary contact, open the menu on the person's row and choose Make primary. A customer has one primary contact, so the person who was primary before loses the badge.
- To delete a person, open the menu on the person's row, choose Delete, then choose Delete in the "Delete contact" dialog.

A read-only user sees the contacts but cannot add, change or delete them.

## Email and Call

Beside the customer's name, Email opens a new message to the customer's email address in your mail app, and Call opens your phone app with the customer's phone number. Each shows only when the customer has that value. In the Contacts tab, the email and the phone of each person open the same way. On a computer with no phone app, a browser cannot place a call, so Call and a phone number open nothing.

## On a very wide window

On a very wide window, the customer's page sits beside the list of customer names, so you can go from one customer to the next. On a smaller window or a phone, the page covers the list; choose Customers at the top to go back.
