---
title: Sales receipts
summary: Record a sale that the customer paid at once, and where the money was deposited.
tags: [sales receipts, sales, payments, keyboard]
order: 32
---

To record a sale that the customer paid for at the time of the sale, create a sales receipt. A sales receipt lists what you sold, adds sales tax, and records the payment in one step. When you post it, Books gives it a number and records it in your books: the account in Deposit to goes up by the total, each product's income account gets its amount, and the tax goes to each tax agency's liability account. Nothing goes to Accounts receivable, because the customer owes nothing.

## Create a sales receipt

To create a sales receipt, choose New in the sidebar (the round + button on a phone) and pick Sales receipt, under Customers. In a web browser, the Customer field has focus when the form opens.

1. Pick the customer, or leave "No customer" for a walk-in sale. Books fills Bill to, Email and Tax from the customer. To clear the customer, pick "No customer": Bill to and Email clear and Tax goes to your default rate. A customer that is tax exempt shows "Tax exempt" under the field, and its lines start with Tax off.
2. Check the Sale date (today unless you change it) and the Tax.
3. Fill in the payment (see below).
4. Add the lines. The lines work as on an invoice: see [Invoices](help://books:invoices).
5. To tell the customer something, type it in **Message to customer (printed)**. It shows on the sales receipt and its PDF. **Internal memo (not printed)** is for your team only.

## Payment and Deposit to

The second row of the form holds the payment:

- Payment method: how the customer paid, such as Cash, Check or Credit card. Choose None if you do not want to record it.
- Reference no.: a check number or a card reference, at most 40 characters.
- Deposit to: the account that gets the money. You can pick a bank account or an Undeposited funds account. Books starts with your first Undeposited funds account, or your first bank account when you have no Undeposited funds account. Use Undeposited funds when you take the money to the bank later with other payments.

If your chart of accounts has no bank account and no Undeposited funds account, Deposit to says so. Add one in Chart of Accounts first.

## Save and post

- Save draft keeps the sales receipt without a number. A draft does not change your books.
- Post gives the sales receipt the next number and records it in your books.
- Post & new posts it and opens a new one. On a phone, it is in the More menu.

Books refuses to post a sales receipt whose total is zero, whose customer is inactive, or whose Deposit to is not an active bank or Undeposited funds account. A refusal about one field shows under that field (the inactive customer under Customer, the Deposit to refusal under Deposit to). Any other refusal, such as the zero total, shows at the top of the form.

A posted sales receipt shows the payment in one line, for example "Check · 43567 · deposited to 1200 Undeposited funds". To change it, choose Edit; to cancel it, choose Void; to start a new one from it, choose Copy. A copy keeps the customer, lines, tax, payment method and message, and has no reference no. and no memo.

## Keyboard shortcuts

The form and the read view use the same keys as an invoice:

| Action | Key |
| --- | --- |
| Post | ⌘↵ |
| Post & new | ⌘⇧↵ |
| Save draft | ⌘S |
| Cancel | Esc |
| Delete draft | ⌘⌫ |
| Edit tab / PDF view tab | ⌥1 / ⌥2 |
| Download PDF | ⌘P |

On a posted or void sales receipt: E edits, V voids, C copies and J opens the journal entry. Payment method and Deposit to open with Enter or Space; ↑ and ↓ move, a letter jumps to the first choice that starts with it, and Enter picks.
