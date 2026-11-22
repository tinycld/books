---
title: Bank deposits
summary: Record one trip to the bank, moving the payments that wait in Undeposited funds, and any other money, into a bank account.
tags: [banking, deposit, "bank deposit", "undeposited funds", payments, "sales receipts", keyboard]
order: 34
---

A bank deposit records one trip to the bank. You tick the money that waits in Undeposited funds, add any other money that went in with it, and post. Books moves the total from Undeposited funds into the bank account, so the bank account shows one line that is the same as the line on your bank statement. To take the money in first, see [Receive payment](help://books:receive-payment) and [Sales receipts](help://books:sales-receipts).

## Record a deposit

To record a deposit, choose New in the sidebar (the round + button on a phone) and pick Bank deposit, under Other.

1. Check Deposit to, the bank account the money went into. Books starts with your first active bank account and shows its balance under the field. If your chart of accounts has no bank account, Deposit to says "Add a bank account to the chart of accounts".
2. Check the Deposit date (today unless you change it).
3. Tick each item that you took to the bank. Selected under the list shows how many you ticked and their sum.
4. Add other funds lines for any other money in the deposit (see "Other funds" below).
5. Choose Post.

In a web browser, Deposit to has focus when the form opens. When you post, Books gives the deposit the next number, such as 1001. An admin can change the next number in Settings, under Numbering, on the Deposits card. The header shows the Deposit total: the ticked items plus the other funds lines. Books refuses a deposit with nothing in it ("Select an item or add a line to deposit.") and a deposit whose total is not above zero ("The deposit total must be above $0.00.").

## What the list shows and why

The list shows every posted line on an Undeposited funds account that no posted deposit holds yet: payments, sales receipts and vendor refunds that you deposited to Undeposited funds, and journal entry lines on that account. When you receive money into Undeposited funds, it waits there until you deposit it, so the list is the money that you have not taken to the bank yet. A void document and its reversal are not listed. When nothing waits, the list says "Nothing waits in Undeposited funds. Payments and sales receipts that you deposit to Undeposited funds show here."

Each row shows Received from, the Transaction (for example "Payment 1004", a link that opens it), the Date, the Payment (the method and reference no., such as "Check · 98765"; a journal entry shows its line memo) and the Amount. The list starts with the oldest date. To sort by name or date, press the Received from or Date header; press it again to reverse the order. When you have more than one Undeposited funds account, each row names its account under the Transaction link.

To tick every listed item, tick the box in the list header, or press ⌥A; when every item is ticked, the same box clears them. When the list shows cards (on a phone or a narrow window), use Select all above the cards. To clear every tick, choose Clear selection, or press ⌥⌫. An item is deposited whole: you cannot deposit part of it. A deposit holds at most 500 items.

## Money out

Money out of Undeposited funds is a negative item in the list, for example "−$20.00" in red. It is a refund receipt paid from Undeposited funds, a transfer out of it, or a journal entry that credits it. When you tick it, it lowers the Deposit total by its amount.

## Other funds

Other funds are money in this deposit that is not a listed item, such as interest or a refund. To add a line, choose Add line, or press ⌥↵. Each line has an Account (required), an optional Received from and Description, and an Amount other than 0. An Account cannot be Accounts receivable, Accounts payable or the Deposit to account. To remove a line, choose its Remove button, or press ⌘⌥⌫ with the cursor in the line.

A negative amount on an Other funds line takes money out of the deposit, such as a bank fee or cash kept back from the deposit for the till. Put a fee on an expense account such as Bank charges and fees. A deposit holds at most 100 other funds lines.

## Drafts

To keep a deposit without posting it, choose Save draft, or press ⌘S. A draft has no number and does not change your books. The items it holds stay in the list of every other deposit until you post it. To remove a saved draft, choose More and Delete draft, or press ⌘⌫. This cannot be undone.

## Edit and void a deposit

A posted deposit opens in its read view: Deposit to, the date, the items deposited, the other funds lines, the totals and the memo.

To change a posted deposit, choose Edit. The form opens as "Edit deposit 1004", with its items ticked. Choose Save: the edit replaces the original under the same number, and the original becomes Void.

To cancel a posted deposit, choose Void and confirm. A reversing entry is posted in the original period. The number is kept. The items it deposited wait in Undeposited funds again, so you can deposit them again.

To see the entry it posted, choose View journal entry.

## Why a deposited payment cannot be edited

While a posted deposit holds a payment, a sales receipt, a vendor refund or a refund receipt, its read view shows "In Deposit 1002" as a link to the deposit, with the reason "To edit or void this payment, remove it from the deposit first." It does not offer Edit or Void. To change the document, open the deposit, choose Edit, untick the document and save, or void the deposit. Then edit or void the document.

A journal entry or transfer with a line in a posted deposit can still be opened. When you save an edit or confirm a void, Books refuses it, for example "Journal entry 12 is in Deposit 1002. Remove it from the deposit first."

## Find a deposit

A deposit has no list of its own. To find one, use search (type its number or a word of its memo), or open Journal Entries, where its Type is Deposit, or the bank account's register. A draft shows in search as "Draft deposit".

## Keyboard shortcuts

| Where | Action | Key |
| --- | --- | --- |
| Form | Post | ⌘↵ |
| Form | Post & new | ⌘⇧↵ |
| Form | Save draft | ⌘S |
| Form | Cancel (asks first if you changed something) | Esc |
| Form | Delete draft (a saved draft only) | ⌘⌫ |
| Form | Tick every listed item, or clear them when all are ticked | ⌥A |
| Form | Clear selection | ⌥⌫ |
| Form | Add an other funds line | ⌥↵ |
| Other funds line (cursor in it) | Remove line | ⌘⌥⌫ |
| Read view | Edit | E |
| Read view | Void | V |
| Read view | View journal entry | J |

The form keys also work while the cursor is in a text box. E, V and J do not. A key does nothing while its button is hidden or turned off. If a menu or dialog is open, Esc first closes it, and the other keys do nothing. To see all shortcuts, press ? when the cursor is not in a text box.

## Who can do what

With bookkeeper or admin access you can record, post, edit and void deposits and delete draft deposits. With read-only access you can open a posted or void deposit and view its journal entry. Without bookkeeper access, the deposit form says "You need bookkeeper access to record deposits".
