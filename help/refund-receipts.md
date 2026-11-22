---
title: Refund receipts
summary: Give money back to a customer, for a sale that was paid or for a credit that the customer holds.
tags: [refund receipts, refunds, sales, credit memos, customers, keyboard]
order: 35
---

A refund receipt records money that you give back to a customer. It lists what you refund, adds the sales tax back, and records the account that the money left, in one step. When you post it, Books gives it a number and records it in your books: the Refund from account goes down by the total, each product's income account goes down by its amount, and each tax agency's liability account goes down by its tax. A refund of a sale does not change Accounts receivable, because the customer owed nothing.

## Refund a sale

To refund a sale, choose New in the sidebar (the round + button on a phone) and pick Refund receipt, under Customers. You can also start one from a customer's page, with New transaction, or with New on the Refund receipts tab of the [Sales lists](help://books:sales-lists). In a web browser, the Customer field has focus when the form opens.

1. Pick the customer, or leave "No customer" for a walk-in sale. Books fills Bill to, Email and Tax from the customer, and focus moves to Refund date. A customer that is tax exempt shows "Tax exempt" under the field, and its lines start with Tax off.
2. Check the Refund date (today unless you change it) and the Tax.
3. Fill in the payment: see "Refund from and its balance" below.
4. Add the lines that you refund. Enter the amounts as positive numbers: a line of Qty 1 and Rate 150.00 refunds $150.00. The lines work as on an invoice: see [Invoices](help://books:invoices).
5. To tell the customer something, type it in **Message to customer (printed)**. It shows on the refund receipt and its PDF. A new refund receipt starts with an empty message: the Default message to customer setting does not fill it. **Internal memo (not printed)** is for your team only, and it is saved as the journal entry memo.

The header shows the **Amount refunded**: the total of the refund receipt. The last row of the totals is Amount refunded too.

## Refund from and its balance

The second row of the form holds the payment:

- Payment method: how you gave the money back, such as Cash, Check or Credit card. Choose None if you do not want to record it.
- Reference no.: a check number or a card reference, at most 40 characters.
- Refund from: the account that the money left. You can pick a bank account or an Undeposited funds account. Books starts with your first active bank account, or your first active Undeposited funds account when you have no bank account. Under the field, Books shows the posted balance of the account, for example "Balance $4,077.38", so you can see that the money is there. Money refunded from Undeposited funds shows as money out (a negative amount) in the list of your next [bank deposit](help://books:bank-deposits).

Refund from always shows. The **Sales deposited to** setting in Settings → Sales is for sales receipts only. If your chart of accounts has no bank account and no Undeposited funds account, Refund from says "Add a bank account or an Undeposited funds account to the chart of accounts". Add one in Chart of Accounts first.

## Start from a sales receipt

To refund a sale that you recorded with a sales receipt, open the posted sales receipt and choose **Refund**, or press R. On a phone, it is in the More menu. A void sales receipt does not have it. The new refund receipt starts with the sales receipt's customer, Bill to, Email, Tax, payment method and a copy of all its lines, with today's date, no reference no. and an empty message and memo. Refund from is the sales receipt's Deposit to account while that account is active. Remove or change the lines that you do not refund. The refund is not limited to the sales receipt's total. See [Sales receipts](help://books:sales-receipts).

The form shows **Refund of sales receipt 1004** under the customer: choose it to open the sales receipt. To keep the refund receipt but not link it to the sales receipt, choose **Remove link**. When you pick another customer, the link goes away too. When the sales receipt is voided later, the link stays and reads "Refund of sales receipt 1004 (void)", and you can still save and post the draft. The posted refund receipt shows the same link, and the sales receipt lists the refund in its Refund receipts section. A refund receipt does not change the sales receipt.

If the sales receipt is not posted, or you cannot open it, the form shows "This sales receipt cannot be refunded" with a link back.

## Pay out a credit memo

To pay out a credit memo, so that the customer gets the money of a credit, open the posted credit memo and choose **Refund credit**, or press R. On a phone, it is in the More menu. Only a credit memo with unapplied credit has it. The new refund receipt starts with the credit memo's customer, Bill to, Email, Tax and a copy of all its lines, with today's date (or the credit memo's date, when that is later), no payment method, no reference no. and an empty message and memo. See [Credit memos](help://books:credit-memos).

The form shows **Pays out credit memo 1001 · $250.00 unapplied**: the credit that is still open on the credit memo. Under it, the form says "This refund pays out a credit. It lowers what Books owes the customer; income and sales tax were lowered by the credit memo." In a payout the Customer field is read-only and there is no Remove link: a payout stays with its credit memo.

A payout posts to Accounts receivable, not to income. The credit memo already lowered income and sales tax when you posted it, and it left a credit in Accounts receivable that you owe the customer. The payout takes the money out of the Refund from account and uses up that credit in Accounts receivable, so the customer's Open figure goes up by the total and the credit memo's unapplied credit goes down by it. A payout writes no sales tax, and it does not change the sales reports.

Two rules apply to a payout:

- The total must be more than zero and not more than the unapplied credit. Otherwise Books shows, under the link, for example "The refund is more than the unapplied credit of $250.00 on credit memo 1001."
- The refund date must be on or after the credit memo's date. Otherwise Books shows, under Refund date, for example "Date the refund on or after the credit memo's date, Nov 12, 2026."

If the credit memo is not posted, has no unapplied credit, or you cannot open it, the form shows "This credit memo cannot be refunded" with a link back.

## Refund part of a credit

To refund part of a credit, remove or lower lines in the payout until Amount refunded is the part that you give back. The rest stays on the credit memo as unapplied credit, and the credit memo stays **Unapplied**. To pay out the rest later, choose Refund credit on the credit memo again. When no credit is left, the credit memo is **Refunded** on the customer's Transactions tab. The credit memo's read view shows a Refunded row and an Unapplied credit row under its totals.

When a part of the credit memo is applied to invoices, a payout can refund only what is left: its cap and the "unapplied" amount in **Pays out credit memo 1001 · $100.00 unapplied** are the credit that is not applied or refunded yet. When nothing is left after a payout, the credit memo reads **Applied** if a part of it was applied to invoices, else Refunded. See [Apply a credit memo to invoices](help://books:apply-credit).

## Save and post

- Save draft keeps the refund receipt without a number. A draft does not change your books.
- Post gives the refund receipt the next number and records it in your books. Refund receipts have their own numbers: see the Refund receipts card in Settings → Numbering.
- Post & new posts it and opens a new one. On a phone, it is in the More menu.
- Cancel leaves the form. If you changed something, Books asks "Discard changes?" first. Choose Keep editing to stay with your changes, or Discard to go on.
- Delete draft deletes a saved draft. Only a draft can be deleted.

Books does not save a refund receipt whose total is below zero ("A refund receipt total cannot be below zero. Use a sales receipt."). Books does not post a refund receipt whose total is zero, whose customer is inactive, that has no product or service line, or whose Refund from is not an active bank or Undeposited funds account. The inactive customer shows under Customer, the Refund from refusal under Refund from, and a refusal about one line under that line.

On a refund receipt with a tax rate, Books also refuses to post when its taxable lines total below zero ("The taxable lines of a refund receipt cannot total below zero. Make a negative line not taxable, or lower it.") or when its subtotal is below zero ("The subtotal of a refund receipt cannot be below zero. Lower the negative lines."). Any other refusal, such as the zero total, shows at the top of the form.

## Edit, void and copy

A posted refund receipt shows the payment in one line, for example "Check · 20417 · refunded from 1000 Business Checking", and its link to the sales receipt or the credit memo.

- To change it, choose Edit. The form opens as "Edit 1003". When you post, the edit replaces the original under the same number, and the original becomes Void. The edit keeps the original's link and memo. The edit of a payout can refund up to the credit memo's unapplied credit plus what the original paid out.
- To cancel it, choose Void and confirm. Books posts a reversing entry in the original period, and the number is kept. When you void a payout, the credit memo's credit is unapplied again.
- To start a new one from it, choose Copy. A copy keeps the customer, lines, tax, payment method, Refund from (while that account is active) and message, and has today's date, no reference no., no memo and no link. A copy of a payout is a refund of a sale.
- To see the entry it posted, choose View journal entry.

A sales receipt that refund receipts are made from can still be edited, but not to another customer: "Refund receipts are made from this sales receipt, so its customer cannot change." The edit moves the refunds' links to the new version. A credit memo that a posted refund receipt pays out cannot be voided: void the refund first. See [Credit memos](help://books:credit-memos) for the rules of its edit.

## Cash basis

On Accrual and on Cash, a refund of a sale counts on its own date, as a sales receipt does. A payout is a payment of its credit memo: on Cash, it brings back its share of the credit memo's lines and tax on the refund date, with a line such as "Credit memo 1001 refunded (cash basis)". So on Cash, a credit memo that you refund lowers income and sales tax on the day the money goes back. See "Accrual and cash basis" in [Reports](help://books:reports).

## When to use a credit memo instead

Use a refund receipt when money goes back to the customer. When the customer has not paid an invoice, give a credit with a credit memo instead: it lowers what the customer owes in Accounts receivable, and no money leaves your bank. An invoice has no Refund: credit it with a [credit memo](help://books:credit-memos), then pay out the credit with Refund credit if the customer wants the money.

## Refund receipts elsewhere in Books

- The Refund receipts tab of the [Sales lists](help://books:sales-lists) lists your refund receipts. Each amount shows with a minus sign, such as −$150.00, and a posted refund receipt is Refunded.
- On the [customer's page](help://books:customer-pages), the Refunds chip of the Transactions tab lists the customer's refund receipts.
- A refund of a sale lowers the Sales Tax Liability and the sales reports on its date: see [Reports](help://books:reports).
- The app search finds a refund receipt by its number, its reference no., its memo or its message, as "Refund receipt 1003" with its customer's name.

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

On a posted or void refund receipt:

- E: Edit
- V: Void
- C: Copy to a new refund receipt
- J: View journal entry
- ⌥1 / ⌥2: Details tab / PDF view tab
- ⌘P: Download PDF

On a posted sales receipt, R is Refund. On a posted credit memo with unapplied credit, R is Refund credit.
