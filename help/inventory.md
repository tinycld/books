---
title: Inventory
summary: Count the goods you buy and sell, see what they cost, and choose FIFO or average cost.
tags: [inventory, stock, quantity on hand, cost of goods sold, FIFO, average cost, reorder point]
order: 33
---

To track the goods you buy and sell, create each one as an Inventory item. Books then counts how many you have and what they cost: a purchase adds to the quantity on hand, and a sale takes from it and posts the cost of the goods sold.

## Create an Inventory item

To create an Inventory item, choose New product or service above the list of products and services, or choose New and pick Product or service, then choose the type Inventory. Type a name and fill in the fields. For the fields that every product has, see [Products and services](help://books:products-services).

An Inventory item has these fields:

- **Inventory asset account**: the account that holds the value of the stock. It must be an Other current asset account. If you choose none, Books uses the Inventory asset account of your chart, and creates that account when the chart has none. You cannot change the account after the item has stock transactions.
- **Cost of goods sold account**: the account that the cost goes to when you sell the item. The list shows your active Cost of goods sold accounts only. A new item starts with the first active Cost of goods sold account of your chart, and you can pick another. If you choose none, Books uses the first Supplies and materials Cost of goods sold account when you save the item, and creates a Cost of goods sold account when the chart has none of that kind.
- **Preferred vendor**: the vendor you usually buy the item from.
- **Reorder point**: the quantity on hand at which you buy more.
- **Cost**: what you usually pay. A bill or an expense line starts with this rate.

An Inventory item is always purchased, so the form has no I purchase this from a vendor switch. A new Inventory item starts taxable. An item keeps its type: an Inventory item cannot become another type, and another item cannot become an Inventory item.

## Opening stock

If you already have the item when you start, enter Opening quantity, Opening value and Opening stock as of. Opening value is the total cost of the opening quantity, not the cost of one. Opening stock as of is the date the stock is counted on; it is required when you enter an opening quantity. Books posts the opening stock to the inventory asset account against Opening balance equity.

The opening stock shows in Journal Entries as an entry of the type Inventory adjustment. That entry has no Edit and no Void: to change it, change the opening fields of the item and save the item. Books then posts the entry again.

Saving an item with an opening quantity is an inventory transaction: it locks the costing method. Choose the method first: see The costing method below.

## Quantity on hand

To see how many you have, open the item. Quantity on hand shows on the form. You cannot type it: Books sets it from the transactions you post. A quantity can have up to 2 decimals.

These transactions change the quantity on hand when you post them:

- A [bill](help://books:bills) or an [expense](help://books:expenses) with the item on a product line adds to it, at the rate of the line. The line debits the inventory asset account, not an expense account.
- An [invoice](help://books:invoices) or a [sales receipt](help://books:sales-receipts) takes from it. Its journal entry also moves the cost of the goods from the inventory asset account to the cost of goods sold account.
- A [credit memo](help://books:credit-memos) or a [refund receipt](help://books:refund-receipts) puts the returned goods back. A return that comes from a sale line comes back at the cost of that sale; another return comes back at the last known cost of the item.
- A [vendor credit](help://books:vendor-credits) takes out the goods you return to the vendor.

A draft changes nothing. When you void a transaction, Books takes its stock change back.

## Bundles with Inventory items

A bundle can hold Inventory items. When you pick the bundle on an invoice or a sales receipt, Books adds one line for each item in the bundle, so the sale takes each Inventory item from its own quantity on hand.

## Selling more than you have

You can sell more of an item than its quantity on hand. The line then shows a note under the product, for example "Quantity on hand is 3. You can post this sale; the quantity on hand goes below zero." The note does not stop you: choose Post as usual. Two lines of the same item are counted together.

Books posts the cost of such a sale at the last cost it knows for the item. When you post the next receipt of the item (a bill, an expense or a return from a customer), or when you change its opening stock, Books works out the cost again and posts the difference by itself.

## The costing method

The costing method decides which cost a sale takes:

- **FIFO (first in, first out)** takes the cost of the oldest stock first.
- **Average cost** takes the average cost of the stock on hand.

You choose the method in setup, and a Books admin can change it in Settings: open Settings, choose Accounting, pick the method under Inventory and press Save. See [Settings](help://books:settings).

You can change the method only until the first inventory transaction posts. After that the method is locked, and Settings shows it as text with "The costing method cannot change after the first inventory transaction posts." Saving an item with opening stock also locks it, so choose the method before you save the first item that has an opening quantity. A change of method later would change the cost of every sale already in your books.

## When an earlier date changes

If you post, change or void a transaction with a date before other transactions of the same item, the cost of the later sales can change. Books works those costs out again and posts the difference by itself, so the inventory asset account and the cost of goods sold stay right. A change of the item's cost does the same.

Books posts the difference on the date of the sale. If the sale is in a closed period (its date is on or before the close date), Books posts the difference on the date of the transaction that changed the cost. A change of the item's cost posts it on today's date. So a sale in a closed period never stops you from receiving more of the item.

If that date is in the closed period too, Books does not post the transaction. The message names the transaction and the item whose cost would change, for example "The books are closed through 2026-06-30, so Books cannot re-cost Invoice 1001 for Widget on 2026-06-15." Post the transaction on a later date, or ask a Books admin for a close-date override.
