---
title: Products and services
summary: Create, edit, find, make inactive and delete the services, goods and bundles you sell and buy.
tags: [products, services, bundles, prices, inactive, delete, custom fields]
order: 32
---

Products and services are the things you sell and buy. To see them, choose Lists in the sidebar and pick the Products and services card. Books opens on the Dashboard the first time. On a phone, Books opens where you left it. To get back to Lists on a phone, choose All lists at the top of the Products and services list, or swipe in from the left edge of the screen to open the Books menu and choose Lists. A read-only user can open products and services but cannot change them. To see what you sold of each product and service in a period, press Sales report at the top of the Products and services list: it opens Sales by Product/Service. To read it, see the [sales reports](help://books:reports).

## The four types

Each product or service has one of four types:

- Service: Work you do for customers, such as consulting, repairs or lessons.
- Non-inventory: Goods you buy or sell without counting how many you have, such as parts used on a job.
- Inventory: Goods you buy and sell and count: Books tracks how many you have and what they cost. See [Inventory](help://books:inventory).
- Bundle: Products and services you sell together as one line, such as a starter kit.

A Service can become a Non-inventory item and back again. A bundle and an Inventory item keep their type, and an item cannot become a bundle or an Inventory item after you create it.

## Create a product or service

To create one, choose New product or service above the list, or choose New and pick Product or service. New is at the top of the sidebar; on a phone, New is the round + button. Then choose a type, type a name and fill in the other fields.

Names must be unique among products and services, and case is ignored, so “Cable” and “CABLE” are the same name.

To save it and go back to the list, choose Save. To save it and start the next one at once, choose Save and new. The next one starts with the same type as the item you saved.

If Books cannot load your access or the accounts, it shows an error in place of the form. To try again, choose Retry.

## Edit a product or service

To edit one, choose its row in the list, or open the menu on its row and choose Edit. Change the fields and choose Save.

If you try to leave a product that has changes that are not saved, Books asks "Discard changes?" first. Choose Keep editing to go back to the form, or Discard to leave without saving.

On a very wide window, the product opens beside the list, and the list stays in use. On a smaller window or a phone, the product opens as its own page over the list.

## Prices and accounts

Sales price is the price you usually charge. Income account is the account that a sale of this item goes to; you must choose one.

If you also buy the item, turn on I purchase this from a vendor to show Purchase description, Cost and Expense account. Cost is what you usually pay, and Expense account is the account that a purchase of this item goes to.

An Inventory item is always purchased, so it has no switch, and its Expense account is named Cost of goods sold account. It also has an Inventory asset account, a Preferred vendor, a Reorder point, opening stock and a Quantity on hand. See [Inventory](help://books:inventory).

## Taxable

Turn on Taxable to charge sales tax on the item when you sell it. A new Non-inventory item starts taxable, as a new Inventory item does, and a new Service starts with Taxable off. If you change the type of a new item, Taxable keeps its value. A bundle has no Taxable setting, because each item in it has its own. To set up the tax rates that you charge, see [Sales tax](help://books:sales-tax).

## Bundles

A bundle is a list of items that you sell together. To add an item to a bundle, choose Add row, pick a product or service and set its Qty. To change the order of the items, open the row's menu (⋮) and choose Move up or Move down. To take an item out, open the row's menu and choose Remove.

A bundle holds Services, Non-inventory items and Inventory items, so a bundle cannot contain another bundle. A bundle has no price, cost or accounts of its own.

When you pick a bundle on an invoice line, Books adds one line for each item in the bundle and a subtotal line under them. See [Invoices](help://books:invoices). An Inventory item in the bundle is taken from its own quantity on hand when the sale posts.

## Find a product or service

To find a product or service, type in the search field above the list. Search finds products by name, SKU or sales description. In the list search, `%`, `_` and `\` split the text into parts that must all appear, and the list search ignores case for the letters A to Z only, while the app search ignores all case and accents. The list loads more items as you scroll down.

To find a product or service from anywhere in the app, use the app search. It matches words that start with what you type, and it ignores case and accents. Choose a result to open that item.

## Make a product or service inactive

To hide an item that you no longer use, open the menu on its row and choose Make inactive. Inactive items do not show in the list. To see them in the list, turn on Show inactive. To use an item again, open the menu on its row and choose Make active.

An inactive item stays on the bundles that hold it, but you cannot add it to a bundle.

## Delete a product or service

To delete one, open the menu on its row and choose Delete, then choose Delete in the dialog. A deleted product cannot be restored, so the delete cannot be undone. Deleting a bundle also deletes its item list. If you delete the product that is open with changes that are not saved, the dialog tells you that those changes will be lost.

An item that is on a bundle cannot be deleted until you take it out of the bundle or make it inactive. The dialog tells you how many bundles hold it.

An item that is on a line of an invoice, a sales receipt, an estimate, a bill or an expense, in any status, cannot be deleted: make it inactive instead. The dialog tells you how many documents of that type hold it.

## Custom fields

An admin can add custom fields to a product form in Settings → Forms. Custom fields show at the end of the form on each product that uses the form they were added to. New products use the default form.
