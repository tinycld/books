---
title: Sales receipts
summary: Record a sale that the customer paid at once, and where the money was deposited.
tags: [sales receipts, sales, payments, deposit, keyboard]
order: 32
---

To record a sale paid on the spot, create a sales receipt. A sales receipt lists what you sold, adds sales tax, and records the payment in one step. When you post it, Books gives it a number and records it in your books: the deposit account goes up by the total, each product's income account gets its amount, and the tax goes to each tax agency's liability account. Nothing goes to Accounts receivable, because the customer owes nothing.

## Create a sales receipt

To create a sales receipt, choose New in the sidebar (the round + button on a phone) and pick Sales receipt, under Customers. In a web browser, the Customer field has focus when the form opens.

1. Pick the customer, or leave "No customer" for a walk-in sale. Books fills Bill to, Email and Tax from the customer. To clear the customer, pick "No customer": Bill to and Email clear and Tax goes to your default rate. A customer that is tax exempt shows "Tax exempt" under the field, and its lines start with Tax off.
2. Check the Sale date (today unless you change it) and the Tax.
3. Fill in the payment (see below).
4. Add the lines. The lines work as on an invoice: see [Invoices](help://books:invoices).
5. To tell the customer something, type it in **Message to customer (printed)**. It shows on the sales receipt and its PDF. **Internal memo (not printed)** is for your team only.

## Payment and deposit

The second row of the form holds the payment:

- Payment method: how the customer paid, such as Cash, Check or Credit card. Choose None if you do not want to record it.
- Reference no.: a check number or a card reference, at most 40 characters.
- Deposit to: the account that gets the money. You can pick a bank account or an Undeposited funds account. Books starts with your first Undeposited funds account, or your first bank account when you have no Undeposited funds account. Use Undeposited funds when you take the money to the bank later with other payments.

If your chart of accounts has no bank account and no Undeposited funds account, Deposit to says so. Add one in Chart of Accounts first.

## Why Deposit to may be missing

An admin can choose one account for every sale in Settings → Sales, in **Sales deposited to**. With **Ask** (the default), every sales receipt shows Deposit to. With an account chosen, the form does not show Deposit to, and Books deposits every sales receipt to that account when you save or post it. The read view still shows where the money went, for example "deposited to 1200 Undeposited funds".

While an account is chosen there, Books does not let you make that account inactive, delete it, or change it to a type that cannot take deposits. To do that, choose another account or Ask in Settings → Sales first. The setting covers sales receipts only. See [Settings](help://books:settings).

## Default message

An admin can set a **Default message to customer** in Settings → Sales. Each new invoice and new sales receipt starts with that message in Message to customer (printed). You can change or clear it on each one. A copy keeps the message of the sales receipt it copies, an edit keeps its original's, and a draft keeps the message it was saved with: a later change to the setting does not change them.

## Save and post

- Save draft keeps the sales receipt without a number. A draft does not change your books.
- Post gives the sales receipt the next number and records it in your books.
- Post & new posts it and opens a new one. On a phone, it is in the More menu.

Books refuses to post a sales receipt whose total is zero, whose customer is inactive, or whose Deposit to is not an active bank or Undeposited funds account. A refusal about one field shows under that field (the inactive customer under Customer, the Deposit to refusal under Deposit to, or at the top of the form when Deposit to is not shown). Any other refusal, such as the zero total, shows at the top of the form.

## Edit, void and copy

A posted sales receipt shows the payment in one line, for example "Check · 43567 · deposited to 1200 Undeposited funds".

- To change it, choose Edit. The form opens as "Edit 1004". When you post, the edit replaces the original under the same number, and the original becomes Void.
- To cancel it, choose Void and confirm. Books posts a reversing entry in the original period, and the number is kept.
- To start a new one from it, choose Copy. A copy keeps the customer, lines, tax, payment method and message, and has today's date, no reference no. and no memo.
- To see the entry it posted, choose View journal entry.

## Keyboard shortcuts

The form uses the same keys as an invoice:

| Action | Key |
| --- | --- |
| Post | ⌘↵ |
| Post & new | ⌘⇧↵ |
| Save draft | ⌘S |
| Cancel | Esc |
| Delete draft | ⌘⌫ |
| Edit tab / PDF view tab | ⌥1 / ⌥2 |
| Download PDF | ⌘P |

On a posted or void sales receipt:

- E: Edit
- V: Void
- C: Copy to a new sales receipt
- J: View journal entry
- ⌥1 / ⌥2: Details tab / PDF view tab
- ⌘P: Download PDF

Payment method and Deposit to open with Enter or Space; ↑ and ↓ move, a letter jumps to the first choice that starts with it, and Enter picks.

## When to use an invoice instead

Use a sales receipt when the customer pays at the time of the sale. When the customer pays later, create an [invoice](help://books:invoices): it records what the customer owes in Accounts receivable until the payment comes in.
