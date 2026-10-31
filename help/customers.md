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

To save the customer and go back to the list, choose Save. To save it and start the next customer at once, choose Save and new.

The shipping address is the same as the billing address until you clear Same as billing address.

## Edit a customer

To edit a customer, choose its row in the list, or open the menu on its row and choose Edit. Change the fields and choose Save. Only the fields you changed are written.

If you try to leave a customer that has changes that are not saved, Books asks "Discard changes?" first. Choose Keep editing to go back to the form, or Discard to leave without saving.

On a very wide window, the customer opens in a panel beside the list, and the list stays in use. On a smaller window or a phone, the customer opens as its own page over the list. If you make the window wider or narrower, the open customer moves between the two and keeps what you typed.

## Sub-customers

A sub-customer is a customer under a parent customer, for example one location of a company. Sub-customers go one level only: a sub-customer cannot have sub-customers of its own.

To add a sub-customer, open the menu on the parent's row and choose Add sub-customer. You can also set the Parent customer field on any customer. The Parent customer field lists only active top-level customers. A customer that has sub-customers cannot become a sub-customer.

## Make a customer inactive

To hide a customer that you no longer sell to, open the menu on its row and choose Make inactive. Inactive customers do not show in the list or in the Parent customer field. To see them in the list, turn on Show inactive. To use a customer again, open the menu on its row and choose Make active.

You cannot make a customer inactive while it has active sub-customers, because an active sub-customer cannot be under an inactive parent. Make its sub-customers inactive first. For the same reason, to make a sub-customer active, make its parent active first.

## Delete a customer

To delete a customer, open the menu on its row and choose Delete, then choose Delete in the dialog. A deleted customer cannot be restored.

A customer with sub-customers cannot be deleted. If all of its sub-customers are inactive, the dialog lets you make the customer inactive. If one or more sub-customers are active, make them inactive first. If you delete the customer that is open with changes that are not saved, the dialog tells you that those changes will be lost.

## Custom fields

An admin can add custom fields to a customer form in Settings → Forms. Custom fields show before Notes on each customer that uses the form they were added to. New customers use the default form.
