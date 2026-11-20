---
title: Write off an invoice
summary: Move the open balance of an invoice that the customer will not pay to an expense account, such as Bad debts.
tags: [write-offs, bad debts, invoices, customers, keyboard]
order: 36
---

When a customer will not pay an invoice, write off its open balance. A write-off moves the balance due of the invoice to an expense account in one posted, numbered document. The invoice stays posted, and its balance due becomes $0.00. To undo it, void the write-off.

## Write off an invoice

1. Open the posted invoice, then choose **Write off**, or press W. On a phone, it is in the More menu. You can also choose Write off in the row menu of the invoice on the Sales lists (the Invoices tab and All sales) and on the customer's Transactions tab. The dialog opens over the screen you are on.
2. Check the **Amount to write off**. It is the whole open balance of the invoice. You cannot type a part of it.
3. Check the **Write-off date**. It starts at today, or at the invoice date when that is later. It cannot be before the invoice date, and it cannot be in a closed period unless you hold a close-date override.
4. Pick the account in **Write off to**. The list holds your active expense and other expense accounts.
5. To tell your team why, type it in **Reason (internal)**. It is saved as the memo of the journal entry, and it does not print.
6. Choose **Write off $400.00** (the button shows the amount), or press ⌘↵. To close the dialog without a change, choose Cancel or press Esc.

Books shows "Invoice 1009 written off: $400.00" and you stay on the screen. Only a posted invoice with a balance due has Write off, and only for a bookkeeper or an admin. A draft, a void invoice and a paid invoice do not have it.

If the balance changed while the dialog was open, for example because someone posted a payment, Books refuses the write-off: "The open balance of invoice 1009 is now $300.00. Check it and write it off again." The amount in the dialog shows the new balance, so choose Write off again.

## What a write-off posts

A write-off posts one journal entry on its date: a debit of the amount to the account you picked, and a credit of the same amount to Accounts receivable. Both lines name the customer, so the customer's Open figure goes down by the amount. On the invoice, the totals show a **Written off** row with a minus sign, such as −$400.00, above Balance due, and the badge reads **Written off**. The **Write-offs** section of the invoice lists each write-off, with its number, date, amount and status. Choose the number to open the write-off.

## Which account to choose

Books starts with the account of your newest posted write-off. When there is none, it starts with your first active account with the detail type Bad debts. A new chart of accounts has **6050 Bad debts** for this.

If your chart is older and has no Bad debts account, add one: open the [Chart of accounts](help://books:chart-of-accounts), choose New account, enter the name Bad debts and the number 6050, choose the type Expense and the detail type Bad debts, and choose Save. If your chart has no active expense account at all, the dialog says "Add an expense account to the chart of accounts" and you cannot write off.

## A customer who paid a part

When a customer paid a part of an invoice and will not pay the rest, write off the invoice: the write-off takes only the open balance. For example, an invoice of $500.00 with a payment of $200.00 is written off for $300.00. The invoice's totals show the payment and the write-off.

## Sales tax stays owed

A write-off does not change the sales tax of the invoice. The tax that the invoice charged stays owed to the tax agency, and the Sales Tax Liability report does not change. For an invoice with sales tax, the dialog says so, for example "Its sales tax of $80.00 stays owed to the tax agency."

## Void a write-off

To undo a write-off, open it (from the invoice's Write-offs section, the customer's Transactions tab or Journal Entries) and choose **Void**, or press V. Confirm with Void write-off. Books posts a reversing entry in the original period, the write-off keeps its number and shows Void, and the invoice's balance due goes back up by the amount. A write-off is never edited or deleted: to change one, void it and write the invoice off again.

When the customer pays after all, void the write-off first, then receive the payment for the invoice. See [Receive payment](help://books:receive-payment).

On the write-off's page, choose **Open invoice** (I) to open the invoice, or **View journal entry** (J) to see the entry it posted. On a phone, Void stays on the page and the others are in the More menu.

## Why a written-off invoice cannot be edited

While a posted write-off names an invoice, Books refuses Void and Edit of the invoice: "This invoice is written off. Void the write-off first." The write-off took the invoice's balance, so a change to the invoice would leave it wrong. Void the write-off, change the invoice, then write it off again if the customer still will not pay. Copy and Create credit memo stay.

## Cash basis

On the cash basis a write-off is no payment: the part of the invoice that you wrote off never counts as income or as sales tax collected, and the write-off's own entry does not count either. Only the parts that the customer paid count. On Accrual, the account you picked goes up and Accounts receivable goes down on the write-off date. See "Accrual and cash basis" in [Reports](help://books:reports).

## Write off or credit memo

Use a write-off when the customer will not pay. Use a [credit memo](help://books:credit-memos) when the sale itself changes: a lower price or goods that come back. A credit memo lowers your income and the sales tax; a write-off moves the balance to an expense account and keeps the sales tax owed. For the invoice itself, see [Invoices](help://books:invoices).

## Keyboard shortcuts

| Action | Key |
| --- | --- |
| Write off (on a posted invoice with a balance due) | W |
| Write off, in the dialog | ⌘↵ |
| Cancel, in the dialog | Esc |
| Void (on a posted write-off) | V |
| Open invoice (on a write-off) | I |
| View journal entry (on a write-off) | J |

W, V, I and J do not work while the cursor is in a text box. To see all shortcuts, press ? when the cursor is not in a text box.

## Who can do what

With bookkeeper or admin access you can write off an invoice and void a write-off. With read-only access you can open a write-off, its invoice and its journal entry.
