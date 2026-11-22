---
title: Vendor refunds
summary: Record money a vendor sends back for a vendor credit, put it in a bank, credit card or Undeposited funds account, and lower the credit's unapplied credit.
tags: [vendor refunds, refund, "vendor credits", purchases, vendors, "accounts payable", "undeposited funds", keyboard]
order: 44
---

Record a vendor refund when the vendor sends money back for a vendor credit, by check, card or transfer.
Use it instead of applying the credit to a bill, when the vendor pays you back rather than taking the credit off what you owe. To apply a credit to a bill, see [Vendor credits](help://books:vendor-credits).

A vendor refund always places the money on the vendor's vendor credits, so record the vendor credit first, then its refund. When the vendor has no unapplied vendor credit, the form says so, for example "Pacific Power has no unapplied vendor credit. Record the vendor credit first, then its refund.", with the button New vendor credit.

To find, filter and act on your vendor refunds, choose Expenses in the sidebar, then Vendor refunds. See [Purchase lists](help://books:purchase-lists).

## Record a vendor refund

To record a vendor refund, choose New in the sidebar (the round + button on a phone) and pick Vendor refund, under Vendors. You can also open a posted vendor credit and choose **Record refund** (or press R): the form opens with the vendor chosen and that credit ticked for its unapplied credit. In a web browser, the Vendor field has focus when the form opens, so you can start to type the vendor's name at once.

1. Pick the **Vendor**. Only active vendors are in the list. The list under the form shows the vendor's vendor credits that have unapplied credit, the oldest credit date first.
2. Check the **Refund date** (today unless you change it).
3. Choose the **Payment method** (such as Check), or leave None. Type the check number or another reference in **Reference no.**, at most 40 characters.
4. Pick **Refunded to**, the account the money arrived in. Refunded to lists your active bank and credit card accounts and your Undeposited funds account. Books starts with your first bank account and shows its balance under the field.
5. Type the **Amount refunded**.
6. Check the credits: type in the Refund cell of each listed credit what the vendor refunded of it. Ticking a credit sets its Refund cell to its unapplied credit, and unticking it clears the cell.
7. Choose Post.

To keep a note for your team, type it in **Memo**. Only your team sees it, and it is saved as the memo of the journal entry.

One refund can cover several vendor credits of the same vendor: put a part of the amount in the Refund cell of each of those credits. One refund has one vendor only.

When you type Amount refunded yourself, Books places it for you: it clears the Refund cells and fills the listed credits oldest first, each up to its unapplied credit. Until you type it, Amount refunded follows the Refund cells. To refund every listed credit in full, tick the box in the table header, or press ⌥A. When the list shows cards (on a phone or a narrow window), tick **Refund all** above the cards instead. To set every Refund cell to zero, choose **Clear refunds**, or press ⌥⌫.

A refund must be on vendor credits in full: the Refund cells must add up to Amount refunded. Under the list, Books shows the sum as On vendor credits and, when it differs, the part that is Not placed, for example "$20.00 of the refund is not on a vendor credit. Put it on a credit or lower the amount." A Refund cell cannot be more than the credit's unapplied credit, and a credit dated after the refund date cannot be refunded.

## Save and post

- Save draft keeps the vendor refund without a number. A draft does not change your books or any credit's unapplied credit. To continue it later, find it with the app search, for example by its memo or vendor.
- Post gives the vendor refund the next number, such as 1001, and records it in your books. An admin can change the next number in Settings, under Numbering, on the Vendor refunds card.
- Post & new posts the vendor refund and opens a new one. On a phone, it is in the More menu.
- Cancel leaves the form. If you changed something, Books asks "Discard changes?" first.
- To remove a saved draft, choose More and then Delete draft. This cannot be undone.

When you post a vendor refund, Books posts one journal entry: the money goes into the Refunded to account (a bank or Undeposited funds balance goes up; a credit card's balance owed goes down), and Accounts payable goes up by the same amount, because the credits no longer lower what you owe the vendor. Each line of the entry names the vendor. In Journal Entries the entry has the Type Vendor refund.

Posting also lowers the unapplied credit of each credit by its Refund cell. A credit that the vendor refunds in full shows the badge Refunded and leaves the Pay bills notice of unapplied credits.

Books refuses to post into a closed period, a vendor refund whose vendor is inactive, and a Refunded to account that is inactive. The message shows on the form; the draft that you saved stays.

## Edit and void a vendor refund

A posted vendor refund opens in its read view: the vendor, the refund date, the payment (such as "Check · 20417 · refunded to 1000 Business Checking"), the vendor credits refunded and the memo.

- To change it, choose Edit. The form opens as a correction that keeps the same number and the same vendor: the vendor cannot change. When you post, the edit replaces the original under the same number, and the original becomes Void.
- Save draft on an edit keeps a draft; it replaces the original only when you post it, and until then the original stays posted.
- To cancel it, choose Void and confirm. Books posts a reversing entry in the original period. The number is kept.
- After a Void, the vendor credits it refunded are unapplied again.
- To see the entry it posted, choose View journal entry.

A saved edit draft whose original was voided or replaced since then opens with "This vendor refund cannot be edited". On "This vendor refund cannot be edited", the only action is Delete draft (⌘⌫).

## Edit a vendor credit that a refund names

An edit of a vendor credit that a posted vendor refund names cannot move the credit date after that refund's date: Books refuses it under Credit date with, for example, "Vendor refund 1003 refunds this credit on Nov 15, 2026. Date the credit on or before that day." A draft or void refund does not hold the date.

When you edit a posted vendor credit, its posted vendor refunds move to the edit, but a draft vendor refund stays on the original vendor credit, which becomes Void. Posting that draft is then refused with "Vendor credit 1002 is not open. Clear it to continue." To go on, clear that credit's row or delete the draft, then record the refund on the edited vendor credit.

## Cash basis

On the cash basis, a vendor refund counts as a payment of its vendor credits on the refund date: each refund line brings back its share of the credit's lines on that day. So a vendor credit that you never apply to a bill but the vendor refunds lowers the expense on the day the money comes back. On the accrual basis, the vendor credit counts on its credit date, as before. See [Reports](help://books:reports).

## Keyboard shortcuts

On the vendor refund form (a new vendor refund, a draft or an edit):

| Action | Key |
| --- | --- |
| Post | ⌘↵ |
| Post & new | ⌘⇧↵ |
| Save draft | ⌘S |
| Cancel (asks first if you changed something) | Esc |
| Delete draft (a saved draft only; in More) | ⌘⌫ |
| Clear refunds | ⌥⌫ |
| Refund every listed credit in full | ⌥A |

In a Refund cell, ⌥↵ refunds the credit in full when the cell is empty or zero, and sets it to zero when it holds an amount. Enter moves to the next credit's Refund cell; on the last one it moves to Clear refunds.

On a posted or void vendor refund:

- E: Edit
- V: Void
- J: View journal entry

On a posted vendor credit with unapplied credit:

- R: Record refund

The form keys also work while the cursor is in a text box. E, V, J and R do not. A key does nothing while its action is not offered. If a menu or dialog is open, Esc first closes it. To see all shortcuts, press ? when the cursor is not in a text box.

## Where the money goes

Refunded to can be a bank account, a credit card account or Undeposited funds. Use Undeposited funds when the refund check waits to go to the bank with other money, then record the trip to the bank as a [bank deposit](help://books:bank-deposits). See [Banking](help://books:banking).

## Who can do what

With bookkeeper or admin access you can record, post, edit and void vendor refunds and delete draft vendor refunds. With read-only access you can open a posted or void vendor refund and view its journal entry. Without bookkeeper access, the form says "You need bookkeeper access to record vendor refunds". To work with vendors, see [Vendors](help://books:vendors).
