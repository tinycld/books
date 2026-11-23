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

The total cannot be below zero. To give money back to a customer, use a [credit memo](help://books:credit-memos).

## Balance due and payments

On a posted invoice, the big figure **Balance due** is what the customer still owes on it: the total less the payments and credits applied to it. When payments are applied, the totals show a **Payments** line, such as "Payments −$100.00", above Balance due, and a Payments block under them lists each posted payment, such as "Payment 1003 · Oct 12, 2026 · $100.00". Choose a payment to open it.

The badge of a posted invoice follows its balance:

- **Posted**: nothing is paid yet.
- **Partly paid**: part of the total is paid.
- **Paid**: the whole total is paid.
- **Written off**: nothing is open, and a posted write-off took the rest of the balance.

To record a payment for the invoice, open it and choose **Receive payment**, or press R. It shows only on a posted invoice with a balance due. On a phone, it is in the More menu. The payment opens with the invoice's customer, and the invoice is paid in full; change the amount to record a part payment. See [Receive payment](help://books:receive-payment).

## Apply a customer's credit

When the customer has a credit memo with unapplied credit, a notice above a posted invoice with a balance due says how much, for example "Harbor Lane Bakery has $250.00 of unapplied credit on 2 credit memos." To use it on the invoice, choose **Apply credit**, or press A. On a phone, it is in the More menu. In the dialog, check the Apply date and the amount from each credit memo, then choose Apply credit. See [Apply a credit memo to invoices](help://books:apply-credit).

After you apply, the totals show a **Credits applied** row with a minus sign, such as −$150.00, after the Payments row and above Balance due, and Balance due goes down by the credit. The Payments block lists each credit with the payments, in date order, for example "Credit memo 1001 · Nov 16, 2026 · $150.00": choose it to open the credit memo, or choose Remove to take the credit off the invoice. An invoice that credit pays in full reads Paid. When the customer has a payment with an amount that is not applied to an invoice, the notice names it with a link, so you can open the payment and edit it.

While a credit is applied, Books refuses Void of the invoice: "Credit memos are applied to this invoice. Remove them first." An edit keeps its credits: they move to the edit. Its total cannot be below the payments and credits, for example "Payments and credits of $300.00 are applied to this invoice. Its total cannot be below that.", and its customer cannot change: "Credit memos are applied to this invoice, so its customer cannot change."

## Write off an invoice

When the customer will not pay, open the posted invoice and choose **Write off**, or press W. It shows only on a posted invoice with a balance due, after Create credit memo. On a phone, it is in the More menu. In the dialog, check the Write-off date, pick the account in Write off to (such as 6050 Bad debts) and choose Write off. The write-off takes the whole open balance: the invoice stays posted, its badge reads **Written off**, and its totals show a **Written off** row with a minus sign, such as −$400.00, above Balance due. The **Write-offs** section, under the Credit memos section, lists each write-off with its number, date, amount and status; choose a number to open the write-off. While a posted write-off names the invoice, Books refuses Edit and Void of the invoice: "This invoice is written off. Void the write-off first." For more, see [Write off an invoice](help://books:write-offs).

## Save and post

- Save draft keeps the invoice without a number. A draft does not change your books. To continue it later, find it with the app search, for example by its memo or customer.
- Post gives the invoice the next number, such as 1001, and records it in your books. An admin can change the next number in Settings, under Numbering, on the Invoices card.
- Post & new posts the invoice and opens a new one. On a phone, it is in the More menu.
- Cancel leaves the form. If you changed something, Books asks "Discard changes?" first.
- Any other way out of a form with unsaved changes asks the same question first: the Back link, the browser's Back or Forward button, and a key or a row of the Sales list beside the form. Choose Keep editing to stay with your changes, or Discard to go on. If you reload or close the browser tab, the browser asks.
- To remove a saved draft, choose More and Delete draft. This cannot be undone.

Books refuses to post into a closed period, an invoice whose customer is inactive, and an invoice whose total is zero. The message shows on the form; the draft that you saved stays.

## When someone else changed the draft

If another person saves a change to a draft invoice while you have changes of your own in it, Books refuses your next Save draft or Post and shows "This invoice changed after you opened it." Nothing is posted, and what you typed stays on the screen. A refused Save draft saves nothing. A refused Post usually saves nothing. But when you post a new invoice, or change the tax rate and the lines in one post, Books can save your changes as a draft before it refuses the post. That draft stays saved.

To see their changes, choose Load the current invoice. This replaces what you typed, so copy anything you want to keep first. Review the invoice, then save or post again. If Books cannot load the invoice, it tells you and keeps what you typed. Choose Load the current invoice again.

While you have no unsaved change, the form shows the other person's changes as they save them.

## Edit and void a posted invoice

To change a posted invoice, open it and choose Edit. The form opens as "Edit 1004" with a notice. The original stays posted until you post. When you post, the edit replaces the original under the same number, and the original becomes Void, with a link to the new one.

To cancel a posted invoice, open it and choose Void, then confirm. Books posts a reversing entry in the original period. The invoice keeps its number and shows Void.

While a posted payment pays the invoice, Books refuses Void: "Payments are applied to this invoice. Void or edit those payments first." An edit of a paid invoice keeps its payments: when you post the edit, they move to it. Its total cannot be below the payments, and its customer cannot change while payments are applied.

An edit of an invoice also keeps its credit memos: when you post the edit, every credit memo made from the invoice names the new one, so it still reads "For invoice 1004". While a draft or posted credit memo names the invoice, its customer cannot change: Books refuses the post under Customer with "Credit memos are made from this invoice, so its customer cannot change." A void credit memo does not stop the change. A void of the invoice keeps its credit memos: each one reads "For invoice 1004 (void)", and the void invoice still lists them.

To see the entry an invoice posted, open it and choose View journal entry. A posted invoice also shows in Journal Entries with the Type Invoice and its number.

## Copy an invoice

To start a new invoice from one that you already have, open it and choose Copy. The new draft has the same customer, lines, tax and message, and today's date.

## Create a credit memo

To give the customer a credit for a posted invoice, open the invoice and choose **Create credit memo**, or press M. It shows only on a posted invoice, after Copy; a void invoice does not have it. On a phone, it is in the More menu. A new credit memo opens with the invoice's customer, Bill to, Email, Tax and a copy of all its lines, today's date, and an empty message and memo. Remove or change the lines that you do not credit. The credit is not limited to the invoice's total or its balance due.

The credit memo shows **For invoice 1004** in its header: choose it to open the invoice. To keep the credit memo but not link it to the invoice, choose **Remove link**. When you pick another customer, the link goes away too. For more, see [Credit memos](help://books:credit-memos).

## Credit memos on an invoice

Under the payments of an invoice, the **Credit memos** section lists each credit memo made from it, with its number, date, amount and status. A draft credit memo shows "Draft" as its number. Choose a number to open the credit memo. An invoice with no credit memo has no such section. A credit memo does not change the invoice's Balance due until you apply it: the credit goes to the customer. To use it on this invoice, choose Apply credit (see above).

## Convert an estimate

To bill the work of an estimate, open the estimate and choose Convert to invoice. A new invoice opens with the estimate's customer, Bill to, Email, Tax, lines and message, and today's date. The Terms and Due date come from the customer. Under the customer, the invoice shows **From estimate** with the estimate's number: choose it to open the estimate. The posted invoice shows the same link under its Posted by line.

On an invoice from an estimate, the customer cannot be changed: it bills the estimate's customer. If that customer is inactive, make the customer active to convert the estimate.

When you save the invoice (Save draft or Post), the estimate becomes Closed. If you cancel the new invoice, the estimate does not change. To undo the conversion, delete the draft invoice with Delete draft, or void the posted invoice: the estimate goes back to Accepted when it has an accepted date, else to Pending. When you edit a posted invoice and post the edit, the estimate stays Closed and names the new invoice. For more, see [Estimates](help://books:estimates).

## PDF view

Each invoice has two tabs under its title: Edit (Details on a posted invoice) and PDF view. The PDF view shows the invoice as it prints. A new invoice has no PDF until you save it: choose Save draft on the tab. If you changed the form after the last save, the PDF view says "Shows the last saved version".

A draft prints with the title "Draft invoice" and no number. A void invoice prints as "Invoice 1004 (void)". The PDF shows your company details, Bill to, the number, the dates, every line, the subtotal, the tax line, the Total, the Balance due and the message. The memo does not print. To see how printed documents look, see [Printed documents](help://books:documents).

To save the PDF, choose Download PDF (in More on the form). In a web browser, the browser saves the file. In the mobile app, the share sheet opens.

## Send to your customer

To send an invoice to your customer, open the posted invoice and choose **Send…**, or press S. On a phone, Send… is in the More menu. Books opens the Send dialog ("Send invoice 1004"), and the email goes out with the invoice's PDF attached. A draft or a void invoice has no Send….

To post an invoice and send it in one step, choose **Post and send** on the form (⌘⌥↵), after Post. On a phone, it is in the More menu. Books posts the invoice as Post does, then opens the Send dialog on the posted invoice. If Books refuses the post, no dialog opens. If you cancel the dialog, the invoice stays posted and is not sent.

The Send dialog holds:

- **To**: one email address. It starts with the invoice's Email, else the customer's email. In a web browser, To has the focus when the dialog opens.
- **Cc**: up to 5 more addresses, separated by commas. It starts empty.
- **Subject**: it starts as "Invoice 1004 from" and your business name. It can have up to 300 characters.
- **Message**: the text of the email, with a row of format buttons above it: Bold, Italic, Underline, Bullet list, Numbered list, Blockquote and Link. On a narrow screen, the buttons that do not fit are in the row's More menu. To add a link, select the text and choose Link (or press ⌘K in the message), type the address and choose Apply. To remove a link, open Link on it, clear the address and choose Apply.
- The attachment line, such as "Attachment: invoice-1004.pdf", and two buttons: **Copy customer link** copies the invoice's link (see "Share an invoice by link" below), and **Download PDF** downloads the PDF.

The message starts with a greeting to the customer, "Attached is invoice 1004 from" and your business name, the Invoice date, the Due date, the Total and the Balance due (in bold), your Message to customer when the invoice has one, the invoice's customer link, and "To pay, or to ask about this invoice, reply to this email", with your business phone when it is set in Settings. When the balance is zero, it reads "Balance due: $0.00. No payment is due." The subject and the message do not name the addresses, so they do not change when you type in To or Cc.

You can change the subject and the message before you send. To put the starting subject and message back, choose **Reset message** (⌥R) beside the Message label. It replaces your changes at once, with no question. The changes are not kept: the next time you open the dialog, it starts again from the starting texts.

To send, choose **Send**, or press ⌘↵ in any field of the dialog, the message too. While the email goes out, the button reads "Sending…". When it is sent, the dialog closes and Books shows "Invoice 1004 sent to" with the address. If Books refuses the send, the reason shows in the dialog and the dialog stays open, so you can correct it and choose Send again. Books checks that To holds one valid address, that Cc holds at most 5 valid addresses, and that the subject and the message are not empty.

The email comes from the server's address with your business name as the sender's name (the business name in Settings, else the organization's name). When the customer replies, the reply goes to your own email address. The email shows your business name at the top and a line with your business name, phone and email at the bottom. Only the formats of the format buttons go out: a picture or a table that you paste into the message is removed, and its text stays.

After a send, the invoice shows a line under its status, such as "Sent Nov 20, 2026 to billing@cedarhollow.example", and "· sent 3 times" after more than one send. The line does not name the Cc addresses. Each send is also an entry of the invoice's Audit history (More → Audit history), "Sent to" the address, with the Subject and the Message that went out.

To send many invoices at once, tick them on the [Sales lists](help://books:sales-lists) and choose Batch actions → Send. A batch sends each invoice to the Email on the invoice, with the standard subject and message that Books fills in for each one at the time of the send. You cannot change the text of a batch send.

When email sending is not set up on your server, the dialog says "Email sending is not set up. Share the customer link or the PDF with your customer." and shows only Copy customer link, Download PDF and Close. Copy the link or download the PDF and send it to your customer yourself, or ask the person who runs your server to set up email sending.

Keys of sending:

- S: Send… on the read view of a posted invoice
- ⌘⌥↵: Post and send on the invoice form
- ⌘↵: Send, in the Send dialog
- Esc: Cancel, in the Send dialog
- ⌥R: Reset message, in the Send dialog
- ⌘K: Link, while the cursor is in the message
- ⌥L: Copy customer link on the read view of a posted invoice

In the mobile app with a hardware keyboard, only ⌘↵ and ⌘K work while the cursor is in the message; ⌥R and Esc work from the other fields, and the buttons always work.

## Share an invoice by link

To share an invoice with a link, open the posted invoice and choose **Copy customer link**, or press ⌥L. On a phone, it is in the More menu. Books copies the link and shows "Customer link copied." The link has the form `{{server-host}}/p/books/invoices/` followed by the invoice's own code. The email of a send holds the same link. A draft has no link, and a void invoice does not offer Copy customer link.

The customer opens the link in a web browser, with no account and no sign-in. The page shows your logo and business name, "Invoice 1004 for" and the customer's name, the **Balance due** in large type, and "Total" with the total when the balance is not the total. When payments cover the whole total, the page shows "Paid in full" in place of the balance. When a write-off or a credit memo brought the balance to zero, in whole or in part, the page shows "No payment is due." in place of the balance, with the total under it. Under it are the Invoice date and the due date, as "Due" and the date; when the due date has passed and a balance is open, it reads "Was due" in red. Then come your message to the customer and **Download PDF**, which gives the customer the invoice as it prints. When your business email or phone is set in Settings, the page shows "Questions? Contact" and your business name, with buttons that start an email or a call. The customer cannot pay or reply on the page.

The page shows the invoice as it is when the customer opens it. A payment or a change that you record shows the next time the customer opens or reloads the page.

What an edit or a void does to the link:

- When you void the invoice, its page says that your business voided the invoice and that no payment is due. It shows no amounts and no PDF.
- When you edit a posted invoice and post the edit, the original becomes void and the new version gets a link of its own. The original's link says "This invoice was replaced by invoice 1004." with the button **Open invoice 1004**, which opens the new version's page. After more edits, each press goes one version on. To send the new version's link, copy it from the new version.
- A link with a wrong code says "This link is not valid." and "Ask the business that sent it for a new link."

You cannot turn a link off or make a new one for the same invoice.

## Keyboard shortcuts

On the invoice form (a new invoice, a draft, an edit or a copy):

| Action | Key |
| --- | --- |
| Post | ⌘↵ |
| Post and send | ⌘⌥↵ |
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

- R: Receive payment (a posted invoice with a balance due)
- A: Apply credit (a posted invoice with a balance due, while the customer has unapplied credit)
- S: Send… (a posted invoice)
- E: Edit
- V: Void
- C: Copy to a new invoice
- M: Create credit memo (a posted invoice)
- W: Write off (a posted invoice with a balance due)
- ⌥L: Copy customer link (a posted invoice)
- J: View journal entry
- ⌥1 / ⌥2: Details tab / PDF view tab
- ⌘P: Download PDF

The form keys also work while the cursor is in a text box. R, A, S, E, V, C, M, W and J do not. A key does nothing while its button is hidden or turned off. If a menu or dialog is open, Esc first closes it, and the other keys do nothing. ⌘P never opens the browser's Print: on a new invoice that is not saved, it does nothing. To see all shortcuts, press ? when the cursor is not in a text box.

## Who can do what

With bookkeeper or admin access you can create, post, edit, void, copy and delete draft invoices, receive payments for them, create credit memos from them, write them off, send them by email and copy their customer links. With read-only access you can open a posted or void invoice, see its sent line, view its journal entry and download its PDF.
