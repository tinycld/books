---
title: Credit memos
summary: Give a customer a credit that lowers what the customer owes you.
tags: [credit memos, credits, sales, customers, keyboard]
order: 34
---

A credit memo gives a customer a credit, for example for goods returned or for a price you lowered after the sale. When you post it, Books gives it a number and records it in your books: Accounts receivable goes down by the total, so the customer owes you less, and each product's income account and each tax agency's liability account go down by their amounts.

## To give a customer a credit

To create a credit memo, choose New in the sidebar (the round + button on a phone) and pick Credit memo, under Customers. You can also start one from a customer's page, with New transaction. In a web browser, the Customer field has focus when the form opens.

1. Pick the customer. Books fills Bill to, Email and Tax from the customer, and focus moves to Credit memo date. A customer that is tax exempt shows "Tax exempt" under the field, and its lines start with Tax off.
2. Check the Credit memo date (today unless you change it) and the Tax.
3. Add the lines that you credit. Enter the amounts as positive numbers: a line of Qty 1 and Rate 250.00 credits $250.00. The lines work as on an invoice: see [Invoices](help://books:invoices).
4. To tell the customer something, type it in **Message to customer (printed)**. It shows on the credit memo and its PDF. A new credit memo starts with an empty message. **Internal memo (not printed)** is for your team only, and it is saved as the journal entry memo.

The header shows the **Credit amount**: the total of the credit memo. The last row of the totals is Credit amount too.

## Start a credit memo from an invoice

To credit a sale that you invoiced, open the posted invoice and choose **Create credit memo**, or press M. On a phone, it is in the More menu. A void invoice does not have it. The new credit memo starts with the invoice's customer, Bill to, Email, Tax and a copy of all its lines, with today's date and an empty message and memo. Remove or change the lines that you do not credit. The credit is not limited to the invoice's total or its balance due. See [Invoices](help://books:invoices).

The form shows **For invoice 1004** under the customer: choose it to open the invoice. To keep the credit memo but not link it to the invoice, choose **Remove link**. When you pick another customer, the link goes away too. When the invoice is voided later, the link stays and reads "For invoice 1004 (void)". The posted credit memo shows the same link, and the invoice lists the credit memo in its Credit memos section. A credit memo does not change the invoice's Balance due: the credit goes to the customer.

## What a credit memo does to the customer's balance

When you post a credit memo, the customer's **Open** figure on the [customer's page](help://books:customer-pages) goes down by the Credit amount. When the customer's credits are more than what the customer owes, the figure shows as a negative amount, such as −$250.00, with the label **Credit** in place of Open. Overdue does not change, because it adds only the balance due of invoices.

On the customer's Transactions tab, choose the **Credit memos** chip to see the customer's credit memos. Each total shows with a minus sign, such as −$250.00. A posted credit memo is **Unapplied** while its credit is not used yet. All posted credit memos are Unapplied for now, because Books cannot yet apply a credit to an invoice or refund it.

## Sales tax on a credit memo

A posted credit memo lowers the sales tax that you owe. On the [Sales Tax Liability report](help://books:reports) on Accrual, it lowers the Gross total, the Taxable amount and the Tax amount of its rate on the credit memo's date, and shows as a row such as "Credit memo 1001" with negative figures. Press the row to open the credit memo. To set up rates, see [Sales tax](help://books:sales-tax).

## Cash basis

On Accrual, a posted credit memo counts on its own date, as every posted entry does. On Cash, a credit memo counts only when its credit is used, as an invoice counts only when it is paid. Books cannot yet apply or refund a credit, so on Cash a credit memo changes no figure of the Profit and Loss, the Balance Sheet, Transaction Detail by Account or the Sales Tax Liability. See "Accrual and cash basis" in [Reports](help://books:reports).

## Save and post

- Save draft keeps the credit memo without a number. A draft does not change your books.
- Post gives the credit memo the next number and records it in your books.
- Post & new posts it and opens a new one. On a phone, it is in the More menu.

Books does not save a credit memo whose total is below zero, as a draft or posted. Books does not post a credit memo whose total is zero or whose customer is inactive. The inactive customer shows under Customer, and a refusal about one line shows under that line. Any other refusal, such as the zero total, shows at the top of the form.

## Edit, void and copy

- To change a posted credit memo, choose Edit. The form opens as "Edit 1001". When you post, the edit replaces the original under the same number, and the original becomes Void. The edit keeps the original's link to its invoice.
- To cancel it, choose Void and confirm. Books posts a reversing entry in the original period, and the number is kept. The customer's Open figure goes back up by the Credit amount.
- To start a new one from it, choose Copy. A copy keeps the customer, lines, tax and message, and has today's date, no memo and no link to an invoice.
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

On a posted or void credit memo:

- E: Edit
- V: Void
- C: Copy to a new credit memo
- J: View journal entry
- ⌥1 / ⌥2: Details tab / PDF view tab
- ⌘P: Download PDF

On a posted invoice:

- M: Create credit memo
