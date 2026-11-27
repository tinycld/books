---
title: Purchase orders
summary: Order products and services from a vendor, and keep track of what is received and billed.
tags: [purchase orders, purchases, vendors, orders, bills, keyboard]
order: 44
---

To order products or services from a vendor before the vendor bills you, create a purchase order. A purchase order lists what you order and shows a total. It does not go into your books: a purchase order has no journal entry, and no report of your accounts counts it. When the vendor bills you, copy the order to a bill, and Books keeps count of what is received, billed and still open.

To find your purchase orders, choose Expenses in the sidebar, then Purchase orders. See [Purchase lists](help://books:purchase-lists). A vendor's purchase orders are also on the vendor's page, under the Purchase orders chip. See [Vendor pages](help://books:vendor-pages).

## Create a purchase order

To create a purchase order, choose New in the sidebar (the round + button on a phone) and pick Purchase order, under Vendors. You can also choose New purchase order on the Purchase orders tab, or New transaction, then Purchase order, on a vendor's page. In a web browser, the Vendor field has focus when the form opens.

1. Choose the vendor. Books fills the mailing address and the email from the vendor, and moves to Email. Only active vendors are in the list.
2. Check the order date and the Ship to address. A new order starts with your business name and address from Settings → Company.
3. Add the lines (see below).
4. Type a Message to vendor if you want one: it prints on the order and its PDF. The Internal memo is for your team only.
5. Choose Save (⌘S) to stay on the form, Save & close (⌘↵) to open the saved order, or Save & new (⌘⇧↵) to start another one.

The first save gives the order the next number, such as 1001, and the order is Open. An admin can change the next number in Settings, under Numbering, on the Purchase orders card. A purchase order has no draft and is never posted.

## Account lines and product lines

A purchase order has the two tables of a bill, with up to 250 lines in all. Use account lines (Account details) for a cost that is not a product you track: pick an expense or cost of goods account and type the Amount. Use product lines (Product and service details) for the products and services you buy: pick the product, and type the Qty and the Rate; Books calculates the Amount. A product with a vendor part number shows it under the product name. The Purchase lines setting decides which tables a new order shows, as for a bill; see [Bills](help://books:bills).

When you press Enter in the Amount of the last account line, Books adds an account line; when you press Enter in the Rate of the last product line, Books adds a product line.

## Open a purchase order

A saved purchase order opens read only. It shows its lines with what is ordered, received and still open, the Billed and Open totals, the bills made from it, and who created it. The badge reads Open, Partly received (a posted bill received or billed part of it) or Closed.

To change an open order, choose Edit (E). A closed order cannot be edited. To start a new order from any order, choose Copy (C): the new order has the same vendor, addresses, lines and message, and today's date. To delete an open order, choose More, then Delete purchase order, and confirm "Delete purchase order 1004? This can't be undone." Books refuses to delete an order that bills are made from: "Purchase order 1004 has bills. Close it instead."

After a bill posts, Books refuses an edit of the order that goes below what the bills hold, for example "Product line 2: 4 are received. The quantity cannot be below 4." A line that a bill names cannot be removed and keeps its product or account, and the vendor of an order with bills cannot change.

## Send and print a purchase order

To send the order by email to the vendor, open it and choose Send… (S). The dialog starts with the order's Email as To and attaches the PDF. Each send shows under the header ("Sent to …"). Send needs the outgoing email of Settings to be set up.

To print the order or keep a file, choose Download PDF (⌘P), or open the PDF view tab. The PDF shows the vendor, the Ship to address, the lines with each product's vendor part number, the total and the message. It shows no memo and no received quantities.

## Copy to bill

When the vendor bills you for the order, open the order and choose Copy to bill (B). The dialog lists every open line of the order, ticked, each at what is still open: the open quantity of a product line, or the open amount of an account line. Choose Create bill (⌘↵) to open a new bill with the order's vendor and those lines. Check the bill and post it.

To bill part of the order, untick the lines that the bill does not cover, or type a lower Qty to bill or Amount to bill on a line. The bill total shows at the foot of the dialog. A quantity or amount above what is still open is allowed, with the hint "More than the 6 still open." Space ticks or unticks the focused line, and Esc closes the dialog.

The bill shows "From purchase order 1004", which opens the order. On a bill from an order, the Vendor and each line's product or account cannot change; you can change the other fields, add lines, or remove a line from the order. For the bill itself, see [Bills](help://books:bills).

Copy to bill is offered on an open order with an open line. If the order was closed by hand before you saved the bill, Books refuses the bill: "Purchase order 1004 is closed. Reopen it to copy it to a bill."

## Received, Billed and Open

Each line of the order shows what the posted bills of the order hold. Received is the quantity of a product line on posted bills, and Billed is the amount of a line on posted bills. Open is what is still open: the quantity ordered less the quantity received on a product line, and the amount less the amount billed on an account line. The order's totals show Billed and Open for the whole order.

A draft bill changes nothing on the order until it posts. While a draft bill holds a line, the line shows "3 on a draft bill" under Open, and Copy to bill offers less of it.

The order closes by itself when every line is received: when a posted bill leaves no line open, the order becomes Closed and reads "Closed on <date>: every line is received". The order opens again by itself when a void, a delete or an edit of one of its bills leaves a line open again.

## Close and reopen

To close an order that you do not expect more of, open it and choose Close (X). Only a Books admin can Close an order. The dialog says how many lines are still open and their amount; choose Close purchase order. Nothing more can be copied to a bill.

To open an order that you closed by hand, open it and choose Reopen (U). Only a Books admin can Reopen an order. An order that closed because every line is received has no Reopen: it opens again from its bills.

## The Open Purchase Orders report

To see what is ordered and not yet received, for all vendors, open the Open Purchase Orders report: see [Reports](help://books:reports). The Purchase orders tab links it in its toolbar.

## Keyboard shortcuts

On the purchase order form (a new order, an edit or a copy):

| Action | Key |
| --- | --- |
| Save & close | ⌘↵ |
| Save & new | ⌘⇧↵ |
| Save | ⌘S |
| Cancel (asks first if you changed something) | Esc |
| Delete purchase order (a saved order only) | ⌘⌫ |
| Download PDF | ⌘P |
| Edit and PDF view tabs | ⌥1 / ⌥2 |
| Add an account line (while Account details shows) | ⌥↵ |
| Add a product line (while Product and service details shows) | ⌥P |

On a saved purchase order:

- B: Copy to bill (an open order with an open line)
- E: Edit (an open order)
- C: Copy to a new order
- S: Send…
- X: Close (a Books admin, on an open order)
- U: Reopen (a Books admin, on an order closed by hand)
- ⌘P: Download PDF

The form keys also work while the cursor is in a text box. The letter keys do not. A key does nothing while its action is not offered. In the Copy to bill dialog, ⌘↵ is Create bill and Esc is Cancel. To see all shortcuts, press ? when the cursor is not in a text box.

## Who can do what

With bookkeeper or admin access you can create, edit, copy, send, delete and copy to bill purchase orders. Only a Books admin can close and reopen them. With read-only access you can open an order and download its PDF.
