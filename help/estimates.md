---
title: Estimates
summary: Quote work to a customer, keep the quote up to date while the customer decides, and turn it into an invoice.
tags: [estimates, quotes, sales, convert, keyboard]
order: 33
---

To quote a price before you bill, create an estimate. An estimate lists the products and services, adds sales tax, and shows a total. It does not go into your books: an estimate has no journal entry, and no report counts it. When the customer says yes, convert the estimate to an invoice in one step.

## Create an estimate

To create an estimate, choose New in the sidebar (the round + button on a phone) and pick Estimate, under Customers. In a web browser, the Customer field has focus when the form opens.

1. Pick the customer. Every estimate has one. Books fills Bill to, Email and Tax from the customer. A customer that is tax exempt shows "Tax exempt" under the field, and its lines start with Tax off.
2. Check the Estimate date (today unless you change it) and the Tax.
3. If the offer ends on a given day, set the **Expiration date**. It can be empty, and it cannot be before the estimate date.
4. Add the lines. The lines work as on an invoice: see [Invoices](help://books:invoices).
5. To tell the customer something, type it in **Message to customer (printed)**. It shows on the estimate and its PDF. A new estimate starts with the **Default message to customer** from Settings → Sales. **Internal memo (not printed)** is for your team only.

## Save

An estimate has no draft. The first save gives it the next estimate number. An admin can change the next number in Settings, under Numbering, on the Estimates card.

- **Save** keeps the estimate open, so you can go on working on it.
- **Save & close** saves it and goes back to where you came from.
- **Save & new** saves it and opens a new, blank estimate.
- **Cancel** leaves without saving. If you changed something, Books asks first.

On a phone, the bar shows Cancel and Save & close. Save, Save & new, Convert to invoice, Delete estimate and Download PDF are under More.

A saved estimate stays open to changes: you can change any field and any line while it is Pending, Accepted or Rejected.

## Statuses and Expired

The second row of the form holds the status:

- **Pending**: the customer has not decided yet. A new estimate is Pending.
- **Accepted**: the customer said yes.
- **Rejected**: the customer said no.
- **Closed**: an invoice was made from the estimate. You cannot pick Closed: Books sets it when the invoice is saved. A closed estimate opens in the read view and cannot change.

A Pending or Accepted estimate whose expiration date has passed shows **Expired** beside its status, and "Expired on" with the date under Expiration date. Expired only tells you the date has passed. It does not change the status, and you can still change and convert the estimate.

The badges beside the title show the saved status. A status you changed but did not save yet shows in the form only.

## Accept an estimate

To record that the customer accepted, set Status to Accepted. Two fields show: **Accepted by** (who accepted, at most 200 characters) and **Accepted date** (today when you pick Accepted; you must fill it in). Then save.

When you change the status from Accepted to Pending or Rejected, Accepted by and Accepted date hide, and the save clears them.

## Convert to invoice

To bill the work, open a Pending or Accepted estimate and choose **Convert to invoice**. If the estimate has changes, Books saves it first; if the save is refused, the estimate stays open and nothing is converted. A Rejected estimate cannot be converted: set it to Pending or Accepted first.

A new invoice opens with the estimate's customer, Bill to, Email, Tax, lines and message. The invoice date is today, and the Terms and Due date come from the customer. Under the customer, the invoice shows **From estimate** with the estimate's number: choose it to open the estimate. The customer cannot be changed on an invoice from an estimate.

Nothing happens to the estimate until you save the invoice (Save draft or Post). Then the estimate becomes Closed, and its read view shows "Converted to invoice" with the invoice's number, or "Converted to a draft invoice". To go to that invoice, choose **Open invoice**. If you cancel the new invoice, the estimate does not change.

## Undo a conversion

To undo a conversion, work on the invoice. If you delete the draft invoice, or void the posted invoice, the estimate goes back to Accepted when it has an accepted date, else to Pending, and you can change it again. When you edit a posted invoice and post the edit, the estimate stays closed and names the new invoice. See [Invoices](help://books:invoices).

## Delete an estimate

To delete a saved estimate, choose **Delete estimate** and confirm. This cannot be undone, and the estimate's number is not used again. Books does not delete an estimate that an invoice was made from: set it to Rejected instead. A closed estimate cannot be deleted.

## PDF

The **PDF view** tab shows the estimate as the customer gets it: the estimate date, the expiration date when set, Bill to, the lines, the totals and the message. It does not show the status, the acceptance or the memo. To download it, choose Download PDF (under More). A new estimate has no PDF until you save it.

## Read view

A closed estimate opens in the read view for everyone. A user with read access sees every estimate in the read view. The read view has **Open invoice** (a closed estimate only), **Copy** (a user who can write) and **Download PDF**. Copy starts a new Pending estimate with the same customer, lines, tax and message, dated today.

## Keyboard shortcuts

On the estimate form:

- ⌘↵: Save & close
- ⌘⇧↵: Save & new
- ⌘S: Save
- Esc: Cancel
- ⌥I: Convert to invoice
- ⌘⌫: Delete estimate (a saved estimate only)
- ⌘P: Download PDF
- ⌥1 and ⌥2: the Edit and PDF view tabs

The lines take the same keys as on an [invoice](help://books:invoices).

In the read view:

- C: Copy
- I: Open invoice
- ⌘P: Download PDF

To see every shortcut, press ⇧?.
