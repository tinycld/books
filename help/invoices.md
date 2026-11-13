---
title: Invoices
summary: Bill a customer with an invoice, post it to Accounts receivable, and print it as a PDF.
tags: [invoices, sales, keyboard]
order: 31
---

To bill a customer, create an invoice. An invoice lists what you sold, adds sales tax, and shows the total the customer owes. When you post it, Books gives it a number and records it in your books: Accounts receivable goes up by the total, each product's income account gets its amount, and the tax goes to each tax agency's liability account.

## Create an invoice

To create an invoice, choose New in the sidebar (the round + button on a phone) and pick Invoice, under Customers. In a web browser, the Customer field has focus when the form opens, so you can start to type the customer's name at once.

1. Pick the customer. Books fills Bill to, Email, Terms and Tax from the customer, and the Due date from the terms and the invoice date. To change the address for this invoice only, choose Edit address. Later changes to the customer do not change an invoice that you already made. To open the customer, choose Edit customer. A customer that is tax exempt shows "Tax exempt" under the Customer field.
2. Check the Invoice date (today unless you change it) and the Due date. When you pick Terms or change the Invoice date, Books sets the Due date again. The Due date cannot be before the Invoice date.
3. Add the lines (see below).
4. To tell the customer something, type it in **Message to customer (printed)**. It shows on the invoice and its PDF. For a note to your team, use **Internal memo (not printed)**: only your team sees it, it is saved as the memo of the journal entry, and it does not print.

A new invoice starts with the **Default message to customer** that an admin sets in Settings → Sales, if there is one. You can change or clear it on each invoice. A copy keeps the message of the invoice it copies, an edit keeps its original's, and a saved draft keeps its own: a later change to the setting does not change them. See [Settings](help://books:settings).

Only an active customer can be on an invoice that you post. Inactive customers are not in the Customer list.

When the customer pays at the time of the sale, record a [sales receipt](help://books:sales-receipts) instead.

## Lines and their kinds

An invoice has up to 250 lines of four kinds:

- Item: a product or service with a description, a Qty, a Price and Tax (taxable or not). Books calculates the Amount as Qty × Price, rounded to the cent. The description and price come from the product; you can change them. A Price can be 0 or negative.
- Description: text only, for example a note about the work. It has no amount.
- Subtotal: the sum of the item and percent lines above it, since the previous subtotal.
- Percent: a percent of the line right above it, which must be an item or a subtotal. Use it for a discount: pick a product such as Discount and type −10 for 10% off. The percent can be from −100 to 1000.

To add an item line, choose Add line. To add another kind, choose Add… and pick Description line, Subtotal or Percent line. When you press Enter in the Price of the last line, Books adds an item line.

Each line has a menu (⋮) with Insert line above, Insert line below, Move up, Move down, Duplicate and Remove. An empty item line at the end of the invoice is dropped when you save.

## Bundles and discounts

When you pick a bundle on an item line, Books replaces the line with one item line for each product in the bundle, and a subtotal line under them. Each item's Qty is its quantity in the bundle times the Qty of the line. To give a discount on the bundle, add a percent line under its subtotal. To set up bundles, see [Products and services](help://books:products-services).

## Totals and tax

Under the lines, Books shows the Subtotal, the tax line, the Total and the Balance due. The tax line shows the name of the tax rate or group and its percent, for example "Denver combined (8.71%)". Books calculates tax on the taxable lines only. For a group, it calculates the tax of each rate in the group, rounds it to the cent, and adds the amounts. With no tax chosen, there is no tax line. An exempt customer's lines start with Tax off. To set up rates, see [Sales tax](help://books:sales-tax).

The total cannot be below zero. To give money back to a customer, use a credit memo.

## Save and post

- Save draft keeps the invoice without a number. A draft does not change your books. To continue it later, find it with the app search, for example by its memo or customer.
- Post gives the invoice the next number, such as 1001, and records it in your books. An admin can change the next number in Settings, under Numbering, on the Invoices card.
- Post & new posts the invoice and opens a new one. On a phone, it is in the More menu.
- Cancel leaves the form. If you changed something, Books asks "Discard changes?" first.
- To remove a saved draft, choose More and Delete draft. This cannot be undone.

Books refuses to post into a closed period, an invoice whose customer is inactive, and an invoice whose total is zero. The message shows on the form; the draft that you saved stays.

## When someone else changed the draft

If another person saves a change to a draft invoice while you have changes of your own in it, Books refuses your next Save draft or Post and shows "This invoice changed after you opened it." Nothing is saved, and what you typed stays on the screen. To see their changes, choose Load the current invoice. This replaces what you typed, so copy anything you want to keep first. Review the invoice, then save or post again.

While you have no unsaved change, the form shows the other person's changes as they save them.

## Edit and void a posted invoice

To change a posted invoice, open it and choose Edit. The form opens as "Edit 1004" with a notice. The original stays posted until you post. When you post, the edit replaces the original under the same number, and the original becomes Void, with a link to the new one.

To cancel a posted invoice, open it and choose Void, then confirm. Books posts a reversing entry in the original period. The invoice keeps its number and shows Void.

To see the entry an invoice posted, open it and choose View journal entry. A posted invoice also shows in Journal Entries with the Type Invoice and its number.

## Copy an invoice

To start a new invoice from one that you already have, open it and choose Copy. The new draft has the same customer, lines, tax and message, and today's date.

## Convert an estimate

To bill the work of an estimate, open the estimate and choose Convert to invoice. A new invoice opens with the estimate's customer, Bill to, Email, Tax, lines and message, and today's date. The Terms and Due date come from the customer. Under the customer, the invoice shows **From estimate** with the estimate's number: choose it to open the estimate. The posted invoice shows the same link under its Posted by line.

On an invoice from an estimate, the customer cannot be changed: it bills the estimate's customer. If that customer is inactive, make the customer active to convert the estimate.

When you save the invoice (Save draft or Post), the estimate becomes Closed. If you cancel the new invoice, the estimate does not change. To undo the conversion, delete the draft invoice with Delete draft, or void the posted invoice: the estimate goes back to Accepted when it has an accepted date, else to Pending. When you edit a posted invoice and post the edit, the estimate stays Closed and names the new invoice. For more, see [Estimates](help://books:estimates).

## PDF view

Each invoice has two tabs under its title: Edit (Details on a posted invoice) and PDF view. The PDF view shows the invoice as it prints. A new invoice has no PDF until you save it: choose Save draft on the tab. If you changed the form after the last save, the PDF view says "Shows the last saved version".

A draft prints with the title "Draft invoice" and no number. A void invoice prints as "Invoice 1004 (void)". The PDF shows your company details, Bill to, the number, the dates, every line, the subtotal, the tax line, the Total, the Balance due and the message. The memo does not print. To see how printed documents look, see [Printed documents](help://books:documents).

To save the PDF, choose Download PDF (in More on the form). In a web browser, the browser saves the file. In the mobile app, the share sheet opens.

## Keyboard shortcuts

On the invoice form (a new invoice, a draft, an edit or a copy):

| Action | Key |
| --- | --- |
| Post | ⌘↵ |
| Post & new | ⌘⇧↵ |
| Save draft | ⌘S |
| Cancel (asks first if you changed something) | Esc |
| Delete draft (a saved draft only) | ⌘⌫ |
| Add an item line after the line you are in, or at the end | ⌥↵ |
| Add a description line | ⌥T |
| Add a subtotal line | ⌥S |
| Add a percent line | ⌥5 |
| Edit tab / PDF view tab | ⌥1 / ⌥2 |
| Download PDF | ⌘P |

With the cursor in a line:

| Action | Key |
| --- | --- |
| Remove the line | ⌘⌥⌫ |
| Move the line up / down | ⌘⌥↑ / ⌘⌥↓ |
| Duplicate the line | ⌘⌥D |
| Open the line's menu | ⌥M |

On a posted or void invoice:

- E: Edit
- V: Void
- C: Copy to a new invoice
- J: View journal entry
- ⌥1 / ⌥2: Details tab / PDF view tab
- ⌘P: Download PDF

The form keys also work while the cursor is in a text box. E, V, C and J do not. A key does nothing while its button is hidden or turned off. If a menu or dialog is open, Esc first closes it, and the other keys do nothing. ⌘P never opens the browser's Print: on a new invoice that is not saved, it does nothing. To see all shortcuts, press ? when the cursor is not in a text box.

## Who can do what

With bookkeeper or admin access you can create, post, edit, void, copy and delete draft invoices. With read-only access you can open a posted or void invoice, view its journal entry and download its PDF.
