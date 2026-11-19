---
title: Receive payment
summary: Record money a customer sent, apply it to their open invoices, and keep what is left as a credit.
tags: [payments, "receive payment", invoices, customers, credit, "undeposited funds", keyboard]
order: 33
---

To record money that a customer sent you for one or more invoices, receive a payment. You pick the customer, enter how much you received, and apply it to the customer's open invoices. When you post the payment, Books gives it a number and records it in your books: Accounts receivable goes down by the amount, and the deposit account (usually Undeposited funds) goes up. Each invoice you paid shows its new Balance due. To bill a customer, see [Invoices](help://books:invoices).

## Receive a payment

To receive a payment, choose New in the sidebar (the round + button on a phone) and pick Receive payment, under Customers. You can also start it from other places:

- On a posted invoice with a balance due, choose **Receive payment**, or press R. On a phone, it is in the More menu. The payment opens with the invoice's customer, and that invoice is paid in full.
- On a customer's page, choose **New transaction** and pick Receive payment. The payment opens with the customer filled in. See [Customer pages](help://books:customer-pages).

In a web browser, the Customer field has focus when the form opens.

1. Pick the customer. The list under the form shows the customer's open invoices, the oldest due date first. An invoice due before today shows "Overdue".
2. Check the Payment date (today unless you change it).
3. Choose the Payment method (such as Check or Cash), or leave None. Type the check number or another reference in Reference no., at most 40 characters.
4. Check Deposit to (see "Undeposited funds" below).
5. Apply the payment: tick each invoice the customer paid, or type the amount in its Payment cell. Amount received shows the sum.
6. Choose Post.

A payment applies to the invoices of one customer only. To keep a note for your team, type it in **Internal memo (not printed)**. It is saved as the memo of the journal entry.

## Partial payments

To pay part of an invoice, type the amount in its Payment cell. The invoice stays open with the rest as its Balance due, and it shows Partly paid. A Payment cell cannot be more than the invoice's open balance: Books shows "More than the open balance of $243.56" under the cell.

When you type Amount received yourself, Books applies it for you: it clears the Payment cells and pays the listed invoices oldest due first, each up to its open balance. After that, a change to a Payment cell does not change Amount received. The Payment cells cannot add up to more than Amount received: Books shows "The payments add up to $1,500.00, more than the $1,243.56 received" under the list.

To pay every listed invoice in full, tick the box in the table header, or press ⌥A. When the list shows cards (on a phone or a narrow window), tick Pay all above the cards instead. To set every Payment cell to zero, choose Clear payments, or press ⌥⌫. When you did not type Amount received, it clears too.

## Overpayment and credit

When Amount received is more than the payments you apply, Books shows the rest as **Amount to credit**, with the note "Kept as a credit for" and the customer's name. When you post, the credit stays on the customer's Accounts receivable balance: the customer's page shows it as Credit. A customer with no open invoices can still pay you: the whole amount is kept as a credit.

## Undeposited funds and why

Deposit to is the account that gets the money. Books starts with your Undeposited funds account. Use it when you take several payments to the bank together: the money waits in Undeposited funds until you record the bank deposit, so your bank account matches your bank statement. To record money that went straight into the bank, pick the bank account instead.

If your chart of accounts has no Undeposited funds account, the list starts with "Undeposited funds (created when you post)". Books creates the account when you post the payment. A payment does not use the **Sales deposited to** setting of sales receipts.

## Find by invoice number

To find an invoice by its number, type the number in **Find invoice no.** above the list. With a customer chosen, the list shows only the invoices whose number starts with what you typed; invoices that you hide this way keep their payments. With no customer chosen, press Enter: Books finds the posted invoice with that number and an open balance, picks its customer and pays the invoice in full. If there is no such invoice, Books shows "No open invoice" and the number under the field.

## Save and post

- Save draft keeps the payment without a number. A draft does not change your books or any invoice's balance.
- Post gives the payment the next number, such as 1001, and records it in your books. An admin can change the next number in Settings, under Numbering, on the Payments card.
- Post & new posts the payment and opens a new one. On a phone, it is in the More menu.
- Cancel leaves the form. If you changed something, Books asks "Discard changes?" first.
- Any other way out of a form with unsaved changes asks the same question first: the Back link, the browser's Back or Forward button, and a key or a row of the Sales list beside the form. Choose Keep editing to stay with your changes, or Discard to go on. If you reload or close the browser tab, the browser asks.
- To remove a saved draft, choose More and Delete draft. This cannot be undone.

Books refuses to post a payment into a closed period, a payment whose customer is inactive, and a payment that pays an invoice more than its open balance (for example when another payment paid it first). The message shows on the form; the draft that you saved stays.

## Edit and void a payment

A posted payment opens in its read view: the customer, the date, the payment (such as "Check · 12345 · deposited to 1200 Undeposited funds"), the invoices it paid, the amount applied and the amount credited.

- To change it, choose Edit. The form opens as "Edit payment 1004". The original stays posted until you post. When you post, the edit replaces the original under the same number, and the original becomes Void. An edit keeps the original's customer.
- To cancel it, choose Void and confirm. Books posts a reversing entry in the original period. The number is kept. The invoices it paid are open again.
- To see the entry it posted, choose View journal entry.

A payment has no PDF and no Copy.

While a posted payment pays an invoice, that invoice cannot be voided. To void the invoice, void or edit the payment first.

A written-off invoice has no balance due, so it is not in the list of open invoices. When a customer pays an invoice that you wrote off, open the write-off and void it first: the invoice is open again, and you can receive the payment for it. When you void a payment of an invoice that has a write-off, the write-off stays and the invoice is open for the amount of the payment. See [Write off an invoice](help://books:write-offs).

## Keyboard shortcuts

On the payment form:

| Action | Key |
| --- | --- |
| Post | ⌘↵ |
| Post & new | ⌘⇧↵ |
| Save draft | ⌘S |
| Cancel (asks first if you changed something) | Esc |
| Delete draft (a saved draft only) | ⌘⌫ |
| Clear payments | ⌥⌫ |
| Pay every listed invoice in full | ⌥A |

In a Payment cell, ⌥↵ pays the invoice in full when the cell is empty or zero, and sets it to zero when it holds an amount. Enter moves to the next invoice's Payment cell; on the last one it moves to Clear payments.

On a posted or void payment:

- E: Edit
- V: Void
- J: View journal entry

On a posted invoice with a balance due:

- R: Receive payment

The form keys also work while the cursor is in a text box. E, V, J and R do not. A key does nothing while its button is hidden or turned off. If a menu or dialog is open, Esc first closes it, and the other keys do nothing. To see all shortcuts, press ? when the cursor is not in a text box.

## Who can do what

With bookkeeper or admin access you can receive, post, edit and void payments and delete draft payments. With read-only access you can open a posted or void payment and view its journal entry. Without bookkeeper access, the payment form says "You need bookkeeper access to receive payments".
