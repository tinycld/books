---
title: Customers
summary: Create, edit, find, make inactive and delete the customers you sell to.
tags: [customers, sub-customers, inactive, delete, custom fields]
order: 30
---

A customer is a person or a company that you sell to. To see your customers, choose Lists in the sidebar and pick the Customers card. On a phone, Books opens where you left it. To get back to Lists on a phone, choose All lists at the top of the Customers or Chart of Accounts list. You can also swipe in from the left edge of the screen to open the sidebar, then choose Lists. Then pick the Customers card. A read-only user can open customers but cannot change them.

## Find a customer

To find a customer in the list, type in the search field above the list. The list shows the customers whose display name, company, email or phone contains the text. In the list search, `%`, `_` and `\` split the text into parts that must all appear, and the list search ignores case for the letters A to Z only, while the app search ignores all case and accents. A sub-customer that matches keeps its parent in view. The list loads more customers as you scroll down.

To find a customer from anywhere in the app, use the app search. Search finds customers by display name, company or email. It matches words that start with what you type, so “north” finds “Northwind Traders” but “wind” does not, and it ignores case and accents. Choose a result to open that customer.

## Create a customer

To create a customer, choose New customer above the list, or choose New and pick Customer. New is at the top of the sidebar; on a phone, New is the round + button. Type a display name, which is the only field you must fill in.

A display name must be unique among the customers with the same parent, or among the top-level customers if the customer has no parent. Case is ignored, so “Acme” and “ACME” are the same name.

Choose Save to save the customer and open the customer's page. To save it and start the next customer at once, choose Save and new.

The shipping address is the same as the billing address until you clear Same as billing address.

To set when the customer must pay, choose Payment terms, such as Net 30. When you choose the customer on an invoice, the invoice takes its Terms from the Payment terms, and its Due date from the terms and the invoice date. If the customer has no payment terms, the invoice keeps the Due date it has. To bill a customer, see [Invoices](help://books:invoices).

## Edit a customer

To edit a customer, choose its row in the list, or open the menu on its row and choose Edit. The customer opens on its page, on the Transactions tab; you edit the Details and Notes tabs in place. When you change a field, Save and Cancel show in a bar at the bottom of the page, on every tab. Choose Save, or press ⌘S, to write your changes and stay on the page. Only the fields you changed are written. To select the Details tab press ⌥3, and to select the Notes tab press ⌥4. To learn what else the page shows, such as the customer's balance and contact people, see [Customer pages](help://books:customer-pages).

To throw your changes away, choose Cancel or press Esc, then choose Discard. If you try to leave a customer that has changes that are not saved, Books asks "Discard changes?" first. Choose Keep editing to go back to the page, or Discard to leave without saving. When nothing is changed, Esc goes back to the list.

On a very wide window, an open customer's page shows beside the list of names, and the list stays in use. A new customer opens in a panel beside the list. On a smaller window or a phone, the customer opens as its own page over the list. If you make the window wider or narrower, the open customer moves between the two and keeps what you typed.

## A customer's transactions

The Transactions tab lists the customer's invoices, estimates and sales receipts, newest first. To select it, press ⌥1. Each row shows the date, the type, the number, the due date (invoices only), the total and the status. An invoice is Draft, Open, Overdue (posted and due before today) or Void; an estimate is Pending, Accepted, Rejected, Closed or Expired; a sales receipt is Draft, Paid or Void. A corrected invoice or sales receipt shows once, with its number: the voided original is left out.

To see one type only, choose Invoices, Estimates or Sales receipts above the list; choose All, or Show all, to see every type again. The list starts on All each time you open the customer or select the Transactions tab again. Choose a row to open the document; go back to return to the customer's page as you left it. If the customer has no transactions yet, choose New transaction to start an invoice, an estimate or a sales receipt for the customer.

## Sub-customers

A sub-customer is a customer under a parent customer, for example one location of a company. Sub-customers go one level only: a sub-customer cannot have sub-customers of its own.

To add a sub-customer, open the menu on the parent's row, or choose More on the parent's page, and choose Add sub-customer. A sub-customer's page shows "Sub-customer of" and its parent's name; choose it to open the parent's page. You can also set the Parent customer field on any customer. The Parent customer field lists only active top-level customers. A customer that has sub-customers cannot become a sub-customer.

## Make a customer inactive

To hide a customer that you no longer sell to, open the menu on its row, or choose More on its page, and choose Make inactive. Inactive customers do not show in the list or in the Parent customer field. To see them in the list, turn on Show inactive. To use a customer again, open the menu on its row, or choose More on its page, and choose Make active.

You cannot make a customer inactive while it has active sub-customers, because an active sub-customer cannot be under an inactive parent. Make its sub-customers inactive first. For the same reason, to make a sub-customer active, make its parent active first.

## Delete a customer

To delete a customer, open the menu on its row and choose Delete, or choose More on its page and choose Delete customer. Then choose Delete in the dialog. A deleted customer cannot be restored.

A customer with sub-customers cannot be deleted. If all of its sub-customers are inactive, the dialog lets you make the customer inactive. If one or more sub-customers are active, make them inactive first. If you delete the customer that is open with changes that are not saved, the dialog tells you that those changes will be lost.

A customer that is on an invoice or a [sales receipt](help://books:sales-receipts), draft or posted, or on an [estimate](help://books:estimates), cannot be deleted. Make it inactive instead.

## Sales tax

To mark a customer that does not pay sales tax, turn on This customer is tax exempt. Then choose an Exemption reason, such as Resale, and type the Exemption certificate number, up to 100 characters. An exempt customer must have a reason: until you choose one, Books refuses the save with "Choose an exemption reason."

A customer that is not exempt can have a Default sales tax. It is the rate or group that new invoices and sales receipts for the customer start with, in place of the default for new sales. The form hides Default sales tax while the customer is exempt, and hides the reason and certificate number while the customer is not exempt. Books keeps the values of hidden fields. If Books refuses a value in a field that the form hides, the message shows at the top of the form. To fix the value, turn This customer is tax exempt on or off to show the field again, correct or clear the value, then set the toggle back and save.

If the customer's default rate or group becomes inactive, the form still shows it, marked inactive, and keeps it when you save. To set up rates and groups, see [Sales tax](help://books:sales-tax).

## Custom fields

An admin can add custom fields to a customer form in Settings → Forms. Custom fields show on the Details tab of each customer that uses the form they were added to, and before Notes on a new customer. New customers use the default form.
