---
title: Sales lists
summary: Find, filter, sort and act on your invoices, estimates, sales receipts, payments, credit memos and refund receipts.
tags: [sales, invoices, estimates, payments, "credit memos", "sales receipts", "refund receipts", search, keyboard]
order: 30
---

To find a sales transaction, choose Sales in the sidebar. The Sales area has seven tabs: All sales lists every invoice, estimate, sales receipt, payment, credit memo and refund receipt, and the Invoices, Estimates, Sales receipts, Payments, Credit memos and Refund receipts tabs each list one kind. Each tab keeps its own search, status chip, date range, customer and sort while the app is open. A void document that a correction replaced is not listed; the correction carries its number.

To start a new transaction, choose New. On a kind tab it starts that kind ("New invoice", "Receive payment", and so on); on All sales it opens a menu of the six kinds. If you have read-only access, New is hidden.

The Refund receipts tab lists the money you gave back to customers. Its columns are those of the Sales receipts tab, and each amount shows with a minus sign, such as −$150.00, because a refund receipt gives money back. Its status chips are Draft, Refunded (posted) and Void. Its row menu and batch actions are those of the Sales receipts tab. See [Refund receipts](help://books:refund-receipts).

## Search and filters

- **Search**: type a document number or a word of its memo in the search field ("Number or memo"). The list updates a moment after you stop typing. Search does not match the customer's name; use the customer picker for that.
- **Status chips**: choose one chip to list only the documents with that status, for example Open, Overdue, Paid or Draft. All lists every status. On the Invoices tab, Open also lists Partly paid and Overdue invoices.
- **Date range**: choose This month, Last month, This quarter, This fiscal year or Last fiscal year to list the documents dated in that period. All dates removes the limit.
- **Customer picker**: choose a customer to list only that customer's documents (not those of its sub-customers). All customers removes the filter.

When nothing matches, choose Clear filters to reset the search, the chip, the date range and the customer.

## Sort

The list starts with the newest date first. To sort by a column, choose its header: the first press sorts low to high (oldest first for a date), the next press turns it around. Date, No. and the amount sort on every tab, and some tabs also sort by Due date, Expires or Balance. On a phone, or in a narrow window where the list shows cards, use the Sort menu in the toolbar instead.

## Opening a document

Choose a row to open its document: a draft opens in its form, a posted or void document in its read view. In a very wide window the document shows beside a narrow column of its kind's list, with the open row marked; otherwise it opens as its own page and Back returns to the list where you left it.

Beside a form with unsaved changes, a row you choose, New, and a key that opens another row or tab ask "Discard changes?" first. Choose Keep editing to stay in the form with your changes, or Discard to go on.

## The row menu

Each row ends with a More actions button. Its row menu holds Open and the actions the document's own page offers for its status, for example Receive payment, Copy, Create credit memo, View journal entry, Download PDF and Void. A draft's row menu holds Open and Delete draft. Void and Delete draft ask you to confirm first. If the server refuses an action, the reason shows in the banner above the list.

A posted invoice with a balance due has **Write off** in its row menu, directly after Receive payment, if you can edit the books. It opens the Write off dialog over the list, and the list stays. After the write-off, the invoice's status reads **Written off** on the Invoices tab and on All sales, and its Balance is $0.00. On the Invoices tab, the **Written off** chip lists the invoices that a write-off closed; Paid lists the invoices that payments paid in full. There is no batch write-off. See [Write off an invoice](help://books:write-offs).

A posted credit memo with unapplied credit has **Apply to invoices** first in its row menu, if you can edit the books. It opens the credit memo with its apply dialog open (Apply credit memo 1001). An invoice's row menu has no Apply: open the invoice and choose Apply credit. On the Credit memos tab, the status chips are Unapplied (credit is left, also when a part is applied or refunded), Applied (no credit is left, and a part of it is applied to invoices), Refunded (refund receipts paid out all of it), Draft and Void. See [Apply a credit memo to invoices](help://books:apply-credit).

## Batch actions

If you can edit the books, each row has a tick box, and the table's header box ticks or clears every loaded row. Then choose Batch actions:

- **Delete drafts** deletes the ticked drafts.
- **Void** voids the ticked posted invoices, sales receipts, payments, credit memos and refund receipts. An estimate is never voided.

The confirm dialog says how many of the ticked documents the action applies to and how many it skips, for example "Delete 3 drafts? 2 selected documents are not drafts and stay." When the action applies to none of them, the dialog says so and has no confirm button. After the action, the banner reads how many were done and how many the server refused, with the first refusal's reason. The documents that were done leave the selection; the refused ones stay ticked. In the cards layout the Batch actions menu also holds Select all and Clear selection.

## Keys

With a keyboard (on the web or with an iPad hardware keyboard), these keys work on every Sales tab. Press ⇧? to see them in the app. A key you type in the search field is text; press Esc to leave the field. The keys that tick rows and New are only there for people who can edit the books.

Beside an open document, in the narrow column of a very wide window, the list keys still work while you read or edit the document: press ↓ and ↑ to move through the column, and ↵ or O to open the focused row. There, J and K do not move the row focus: J belongs to the document (View journal entry in its read view). The tick keys X, Space and A do not work in the column. A key you type in a field of the document is text. A key that replaces a form with unsaved changes (a tab key, N, or ↵ and O on another row) asks "Discard changes?" first.

| Action | Key |
| --- | --- |
| Search | / |
| Next row | J or ↓ |
| Previous row | K or ↑ |
| Open the focused row | ↵ or O |
| Tick or clear the focused row | X or Space |
| Tick or clear all loaded rows | A |
| New (on All sales, the New menu) | N |
| All sales, Invoices, Estimates, Sales receipts, Payments, Credit memos, Refund receipts | 1, 2, 3, 4, 5, 6, 7 |

To work with one kind of document, see [Invoices](help://books:invoices), [Estimates](help://books:estimates), [Sales receipts](help://books:sales-receipts), [Receive payment](help://books:receive-payment), [Credit memos](help://books:credit-memos) and [Refund receipts](help://books:refund-receipts).
