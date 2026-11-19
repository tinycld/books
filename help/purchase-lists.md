---
title: Purchase lists
summary: Find, filter, sort and act on your bills, expenses, bill payments, vendor credits and vendor refunds.
tags: [expenses, purchases, bills, "bill payments", "vendor credits", "vendor refunds", search, keyboard]
order: 39
---

To find a bill or an expense, choose Expenses in the sidebar. The Expenses area lists every bill, expense, bill payment, vendor credit and vendor refund, and you can search, filter, sort and act on them from the list.

## Tabs

The Expenses area has six tabs: All purchases lists every kind, and the Bills, Expenses, Bill payments, Vendor credits and Vendor refunds tabs each list one kind. Each tab keeps its own search, status chip, date range, vendor and sort while the app is open. A void document that a correction replaced is not listed; the correction carries its number.

To start a new transaction, choose New. On a kind tab it starts that kind ("New bill", "New expense", "Pay bills", "New vendor credit" or "New vendor refund"); on All purchases it opens a menu of the five. If you have read-only access, New is hidden.

On All purchases, a vendor credit's amount shows as a negative figure, because it lowers what you owe. On the Vendor credits tab, Total and Balance show as positive figures.

## Search

Type a document number, a reference number (the vendor's bill or credit number, or a check or reference number) or a word of the memo in the search field ("Number, reference or memo"). The list updates a moment after you stop typing. Search does not match the vendor's name; use the vendor picker for that.

## Filters

- **Status chips**: choose one chip to list only the documents with that status, for example Open, Overdue, Paid, Unapplied or Draft. All lists every status. On the Bills tab, Open also lists Partly paid and Overdue bills. On All purchases, Open lists the bills and vendor credits with a balance left, and Closed lists the rest of the posted documents.
- **Date range**: choose This month, Last month, This quarter, This fiscal year or Last fiscal year to list the documents dated in that period. All dates removes the limit.
- **Vendor picker**: choose a vendor to list only that vendor's documents. Inactive vendors are in the picker too. All vendors removes the filter.

When nothing matches, choose Clear filters to reset the search, the chip, the date range and the vendor.

## Sort

The list starts with the newest date first. To sort by a column, choose its header: the first press sorts low to high (oldest first for a date), the next press turns it around. Date, No. and the amount sort on every tab; Bills also sorts by Due date and Balance, and Vendor credits by Balance. Type, Vendor, Category, Reference no. and Status do not sort. On All purchases the amount sorts with a vendor credit as a negative figure. On a phone, or in a narrow window where the list shows cards, use the Sort menu in the toolbar instead.

## The Category column

All purchases and the Expenses tab show a Category column. For a bill, an expense or a vendor credit with one line, it shows the line's account or product. With two or more lines it reads "Split". A document with no line, a bill payment and a vendor refund show "—". To change a category, open the document: a posted document changes only through its Edit.

## Opening a document

Choose a row to open its document: a draft opens in its form, a posted or void document in its read view. In a very wide window the document shows beside a narrow column of its kind's list, with the open row marked; otherwise it opens as its own page and Back returns to the list where you left it. Pay bills, and a bill payment's Edit, always open as their own page; Back returns to the list.

Beside a form with unsaved changes, a row you choose, New, and a key that opens another row or tab ask "Discard changes?" first. Choose Keep editing to stay in the form with your changes, or Discard to go on.

## The row menu

Each row ends with a More actions button. Its row menu holds Open and the actions the document's own page offers for its status, without Edit:

- **Bill**: Pay bill (when a balance is left), Void, Copy, View journal entry.
- **Expense**: Void, Copy, View journal entry.
- **Bill payment**: Void, View journal entry.
- **Vendor credit**: Apply to bills and Record refund (when unapplied credit is left), Void, Copy, View journal entry.
- **Vendor refund**: Void, View journal entry.

A void document's row menu holds Copy (for a bill, an expense or a vendor credit) and View journal entry. A draft's row menu holds Open and Delete draft. With read-only access, the row menu holds Open and View journal entry only.

Apply to bills opens the vendor credit with its Apply dialog. Void and Delete draft ask you to confirm first; a bill payment's and a vendor refund's Void dialog says what that void changes. If the server refuses an action, the reason shows in the banner above the list.

## Batch actions

If you can edit the books, each row has a tick box, and the table's header box ticks or clears every loaded row. Then choose Batch actions:

- **Delete drafts** deletes the ticked drafts. A bill payment is never a draft.
- **Void** voids the ticked posted documents of every kind.

The confirm dialog says how many of the ticked documents the action applies to and how many it skips, for example "Delete 3 drafts? 2 selected documents are not drafts and stay." When the action applies to none of them, the dialog says so and has no confirm button. After the action, the banner reads how many were done and how many the server refused, with the first refusal's reason. The documents that were done leave the selection; the refused ones stay ticked. A change of tab, chip, search, date range or vendor clears the selection; a new sort keeps it. In the cards layout the Batch actions menu also holds Select all and Clear selection.

## Keys

With a keyboard (on the web or with an iPad hardware keyboard), these keys work on every Expenses tab. Press ⇧? to see them in the app, in the Expenses group. A key you type in the search field is text; press Esc to leave the field. The keys that tick rows and New are only there for people who can edit the books.

Beside an open document, in the narrow column of a very wide window, the list keys still work while you read or edit the document: press ↓ and ↑ to move through the column, and ↵ or O to open the focused row. There, J and K do not move the row focus: J belongs to the document (View journal entry in its read view). The tick keys X, Space and A do not work in the column. A key you type in a field of the document is text. A key that replaces a form with unsaved changes (a tab key, N, or ↵ and O on another row) asks "Discard changes?" first.

| Action | Key |
| --- | --- |
| Search | / |
| Next row | J or ↓ |
| Previous row | K or ↑ |
| Open the focused row | ↵ or O |
| Tick or clear the focused row | X or Space |
| Tick or clear all loaded rows | A |
| New (on All purchases, the New menu) | N |
| All purchases, Bills, Expenses, Bill payments, Vendor credits, Vendor refunds | 1, 2, 3, 4, 5, 6 |

To work with one kind of document, see [Bills](help://books:bills), [Expenses](help://books:expenses), [Pay bills](help://books:pay-bills), [Vendor credits](help://books:vendor-credits) and [Vendor refunds](help://books:vendor-refunds).
