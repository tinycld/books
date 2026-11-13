---
title: Estimates
summary: Quote work to a customer and keep the quote up to date while the customer decides.
tags: [estimates, quotes, sales, keyboard]
order: 33
---

To tell a customer what work will cost before you do it, create an estimate. An estimate lists the products and services, adds sales tax, and shows a total. It does not go into your books: an estimate has no journal entry, and no report counts it.

## Create an estimate

To create an estimate, choose New in the sidebar (the round + button on a phone) and pick Estimate, under Customers. In a web browser, the Customer field has focus when the form opens.

1. Pick the customer. Every estimate has one. Books fills Bill to, Email and Tax from the customer. A customer that is tax exempt shows "Tax exempt" under the field, and its lines start with Tax off.
2. Check the Estimate date (today unless you change it) and the Tax.
3. If the offer ends on a given day, set the **Expiration date**. It can be empty, and it cannot be before the estimate date.
4. Add the lines. The lines work as on an invoice: see [Invoices](help://books:invoices).
5. To tell the customer something, type it in **Message to customer (printed)**. It shows on the estimate and its PDF. A new estimate starts with the **Default message to customer** from Settings → Sales. **Internal memo (not printed)** is for your team only.

## Save

An estimate has no draft. The first save gives it the next estimate number.

- **Save** keeps the estimate open, so you can go on working on it.
- **Save & close** saves it and goes back to where you came from.
- **Save & new** saves it and opens a new, blank estimate.
- **Cancel** leaves without saving. If you changed something, Books asks first.

On a phone, the bar shows Cancel and Save & close. Save, Save & new and Download PDF are under More.

A saved estimate stays open to changes: you can change any field and any line while it is Pending, Accepted or Rejected.

## Statuses

The second row of the form holds the status:

- **Pending**: the customer has not decided yet. A new estimate is Pending.
- **Accepted**: the customer said yes. Two fields show: **Accepted by** (who accepted, at most 200 characters) and **Accepted date** (today when you pick Accepted; you must fill it in).
- **Rejected**: the customer said no.

When you change the status from Accepted to Pending or Rejected, Accepted by and Accepted date hide, and the save clears them.

A Pending or Accepted estimate whose expiration date has passed shows **Expired** beside its status, and "Expired on" with the date under Expiration date. Expired only tells you the date has passed. It does not change the status, and you can still change the estimate.

The badges beside the title show the saved status. A status you changed but did not save yet shows in the form only.

## PDF

The **PDF view** tab shows the estimate as the customer gets it: the estimate date, the expiration date when set, Bill to, the lines, the totals and the message. It does not show the status, the acceptance or the memo. To download it, choose Download PDF (under More). A new estimate has no PDF until you save it.

## Read view

A user with read access sees every estimate in the read view, with Download PDF. A user who can write also has **Copy**, which starts a new Pending estimate with the same customer, lines, tax and message, dated today.

## Keyboard shortcuts

On the estimate form:

- ⌘↵: Save & close
- ⌘⇧↵: Save & new
- ⌘S: Save
- Esc: Cancel
- ⌘P: Download PDF
- ⌥1 and ⌥2: the Edit and PDF view tabs

In the read view:

- C: Copy
- ⌘P: Download PDF

To see every shortcut, press ⇧?.
