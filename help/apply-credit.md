---
title: Apply a credit memo to invoices
summary: Use a customer's credit memo to pay that customer's open invoices, in full or in part, with no money received.
tags: [credit memos, invoices, "apply credit", credits, customers, payments, keyboard]
order: 37
---

When a customer has a credit memo with unapplied credit and also owes you on invoices, apply the credit to those invoices. Each application lowers the invoice's Balance due and the credit memo's unapplied credit by the same amount, on the apply date. No money moves, so an application posts no journal entry: the credit memo already lowered Accounts receivable, and the invoice raised it, for the same customer. The customer's Open figure does not change when you apply. To make the credit, see [Credit memos](help://books:credit-memos); for the invoice, see [Invoices](help://books:invoices).

You can apply a credit only to invoices of the credit memo's own customer. A sub-customer's invoices are not listed.

## Use a credit memo on an invoice, from the credit memo

1. Open the posted credit memo and choose **Apply to invoices**, or press A. When the customer has open invoices, a notice above the credit memo says how many, for example "Harbor Lane Bakery has 2 open invoices. Apply this credit to lower what they owe.", with an Apply to invoices button. On a phone, Apply to invoices is the button beside More. You can also choose Apply to invoices in the row menu of the credit memo on the Sales lists (the Credit memos tab and All sales) and on the customer's Transactions tab: the credit memo opens with the dialog.
2. The dialog "Apply credit memo 1001" shows the **Unapplied credit** at the top and the customer's open invoices under the Apply date, with each invoice's due date, Open balance and a Credit to apply cell. The invoice the credit memo was made from is first, then the others by due date.
3. Check the **Apply date** and the amounts (see below). The dialog opens with the credit spread over the listed invoices in their order, so you can apply it at once with ⌘↵.
4. Choose **Apply credit**.

Books shows, for example, "Applied $150.00 to 1 invoice", and you stay on the credit memo. Under the list, before you apply, the dialog shows what you apply, for example "Applying $150.00 to 1 invoice · $100.00 stays unapplied".

When the customer has no open invoice, the dialog says so, for example "Harbor Lane Bakery has no open invoices. The credit stays on the customer until you post an invoice or refund it." Choose New invoice to enter one, or Refund credit to pay the credit out (see [Refund receipts](help://books:refund-receipts)).

## Use a credit memo on an invoice, from the invoice

1. Open the posted invoice and choose **Apply credit**, or press A. It shows only while the invoice has a balance due and the customer has unapplied credit; a notice above the invoice says how much, for example "Harbor Lane Bakery has $250.00 of unapplied credit on 2 credit memos.", with an Apply credit button. On a phone, Apply credit is in the More menu.
2. The dialog "Apply credit to invoice 1009" shows the invoice's **Open balance** at the top and the customer's credit memos with unapplied credit, by credit date, with a credit memo made from this invoice first. Each row shows the Credit date, the Unapplied credit and a Credit to apply cell.
3. The dialog opens with credit placed in list order up to the open balance. Check the Apply date and the amounts, then choose **Apply credit**.

Books shows, for example, "Applied $150.00 from 1 credit memo". Under the list, the dialog shows what stays due, for example "Applying $150.00 from 1 credit memo · $250.00 stays due".

## Pay a part of an invoice

To pay a part of an invoice with credit, type an amount below its open balance in its Credit to apply cell. The invoice stays open for the rest, and it shows Partly paid. When the credit is smaller than the invoice's open balance, the dialog places all of the credit on it, and the invoice stays open for the rest too.

To change the amounts:

- Tick a row to set it to the lesser of its own limit and the amount that is still free. Tick it again to clear it.
- Type an amount in a Credit to apply cell. An amount above zero ticks the row.
- Choose Clear to empty every cell.

A cell cannot be more than its row's limit, for example "More than the open balance of $400.00" under an invoice's cell, or "More than the unapplied credit of $250.00" under a credit memo's cell. All the cells together cannot be more than the amount at the top of the dialog. At least one row must have an amount.

## Lower one invoice by a part of its amount

When you agree to take a part off one invoice, for example for a late delivery, open the posted invoice and choose **Create credit memo**, change the lines to the amount you take off, and post the credit memo. Then choose **Apply to invoices** on the new credit memo: the invoice it was made from is first in the list, so choose Apply credit. The invoice's Balance due goes down by the credit. A credit memo does not change an invoice until you apply it.

## The apply date

The apply date is the day the credit pays the invoice. It starts at today, or at the credit memo's date when that is later. From an invoice, it starts at the latest credit date of the credit memos that the dialog ticks when it opens, when that is later than today.

- The apply date cannot be before the credit memo's date: "The apply date can't be before the credit date." From an invoice, the message names the credit memo, for example "The apply date can't be before the credit date of credit memo 1002, Nov 12, 2026."
- The apply date cannot be in a closed period, unless you hold a close-date override.

## What you see after you apply

- The credit memo's totals show **Applied** with a minus sign, such as −$150.00, then Refunded (when a refund receipt pays it out) and **Unapplied credit**. Its **Applied to** section lists each invoice, for example "Invoice 1009 · Nov 16, 2026 · $150.00". Its badge reads Partly applied while some credit is left, and Applied when none is left.
- The invoice's totals show **Credits applied** with a minus sign above Balance due, and its Payments section lists the credit, for example "Credit memo 1001 · Nov 16, 2026 · $150.00". An invoice that credit pays in full reads Paid.
- On the Sales lists and the customer's Transactions tab, a credit memo with no credit left reads **Applied** when a part of it was applied to invoices, and Refunded when refund receipts paid out all of it.
- The customer's Overdue figure goes down when a credit pays an overdue invoice. Open does not change.

## Remove

To take a credit off an invoice, choose **Remove** on the invoice's row in the credit memo's Applied to section, or on the credit memo's row in the invoice's Payments section, then confirm: "Remove this credit from Invoice 1009? The invoice's balance goes up by $150.00 and the credit is unapplied again." Remove puts both balances back. Books refuses Remove when the apply date is in a closed period and you hold no close-date override.

An application is never edited. To change an amount, remove it and apply the credit again.

## Why an applied credit memo or invoice cannot be voided

While a credit is applied, the credit memo and the invoice depend on each other, so Books refuses to void either one:

- A credit memo: "This credit is applied to invoices. Remove it from those invoices first."
- An invoice: "Credit memos are applied to this invoice. Remove them first."

Remove each application first, then void. An edit keeps the applications: they move to the edit. Books refuses an edit of the credit memo whose total is below what is applied, that changes its customer, or whose date is after the earliest apply date. Books refuses an edit of the invoice whose total is below its payments and credits, or that changes its customer.

## A payment amount that is not applied

The dialog applies credit memos only. When a payment that the customer sent is more than the invoices it paid, the rest is not applied to an invoice: it stays on the customer as a credit. The invoice's notice names such payments, for example "Payment 1004 has $100.00 that is not applied to an invoice. Open the payment and edit it to apply that amount." To use that amount on the invoice, open the payment, choose Edit, and type the amount in the invoice's Payment cell. See [Receive payment](help://books:receive-payment).

## Cash basis

On the cash basis, an application counts as a payment of the invoice on the apply date: it brings back its share of the invoice's income and sales tax, and the same share of the credit memo's, so an invoice paid in full by a credit shows the sale less the credit on the apply date. An unapplied credit memo still changes no cash figure. Remove takes those figures away again. See "Accrual and cash basis" in [Reports](help://books:reports).

## Keyboard shortcuts

| Action | Key |
| --- | --- |
| Apply to invoices (a posted credit memo with unapplied credit) | A |
| Apply credit (a posted invoice with a balance due, while the customer has unapplied credit) | A |
| Apply credit, in the dialog | ⌘↵ |
| Tick or untick the row (in a Credit to apply cell) | ⌥↵ |
| Cancel the dialog | Esc |

In a Credit to apply cell, ↵ moves to the next row's cell, and from the last row to Clear. A does not work while the cursor is in a text box, and it does nothing while its action is not offered. To see all shortcuts, press ? when the cursor is not in a text box.

## Who can do what

With bookkeeper or admin access you can apply credit memos to invoices and remove them. With read-only access you can see the Applied to section, the Credits applied row and the credits in an invoice's Payments section.
