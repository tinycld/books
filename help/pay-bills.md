---
title: Pay bills
summary: Pay one or more open bills from a bank or credit card account, in full or in part, with one bill payment per vendor.
tags: [pay bills, "bill payment", bills, vendors, checks, "accounts payable", keyboard]
order: 42
---

To pay the bills that your vendors sent, use Pay bills. You pick the account you paid from, tick the bills you pay, and choose Pay. Books posts one numbered bill payment for each vendor: Accounts payable goes down by the amount, and the account you paid from goes down (or, for a credit card, its balance owed goes up). Each bill you paid shows its new Balance due. To enter a bill, see [Bills](help://books:bills). To record money you paid when there is no bill, see [Expenses](help://books:expenses).

## Pay bills

To pay bills, choose New in the sidebar (the round + button on a phone) and pick Pay bills, under Vendors. You can also open a posted bill with a balance due and choose **Pay bill**, or press P: Pay bills opens with that bill's vendor and the bill paid in full.

In a web browser, the Paid from field has focus when the screen opens.

1. Pick **Paid from**: the bank or credit card account the money comes from. Only active bank and credit card accounts are in the list. Under it, Books shows the account's balance, for example "Balance $7,218.56".
2. Check the **Payment date** (today unless you change it).
3. Check the **Payment method**. When you pick Paid from, Books sets it for you: Credit card for a credit card account, Cash for a cash on hand account, and Check for any other bank account. You can change it after.
4. With the method Check, you can type a **Starting check no.**, digits only, at most 9. Each vendor's payment takes the next check number, in vendor name order. Leave it empty for payments with no check number.
5. Tick each bill you pay, or type the amount in its Payment cell.
6. Choose Pay.

The list shows every posted bill with an open balance, the earliest due date first. A bill due before today shows "Overdue".

## Select bills and pay part of a bill

Tick a bill to pay its whole open balance; untick it to clear its payment. To pay part of a bill, type the amount in its Payment cell. The bill stays open with the rest as its Balance due, and it shows Partly paid. A Payment cell cannot be more than the bill's open balance: Books shows "More than the open balance of $1,250.00" under the cell.

To pay every bill in the list in full, tick the box in the table header, or press ⌥A. When the list shows cards (on a phone or a narrow window), tick Pay all above the cards instead. When every bill in the list is already paid, the same box or Pay all clears them. To clear every payment, choose Clear payments under the list, or press ⌥⌫.

Under the list, Books shows how many bills and vendors you selected and, with a starting check number, which vendor gets which check. On the right it shows the Current balance of the account you pay from, the Total payment and the New balance after this payment.

## Filters and sort

Use the chips above the list to see fewer bills:

- **Vendor** shows the bills of one vendor. "All vendors" shows every vendor.
- **Due** shows Any time, Overdue (due before today) or Due in 7 days.

A bill that a filter hides keeps its payment, and it counts in the totals. Books then says how many selected bills are hidden by the filter. To sort the list by vendor or by due date, press the column's header; press it again to reverse the order.

## One payment per vendor

The bills you select of each vendor make one bill payment. When you select bills of three vendors, Books posts three bill payments, numbered in vendor name order, for example "Posted 3 bill payments (1004–1006)". An admin can change the next number in Settings, under Numbering, on the Bill payments card.

## Pay and Pay & new

- Pay posts the payments and goes back to the screen you came from.
- Pay & new posts the payments and keeps Pay bills open: the paid bills leave the list, and Paid from, the date and the method stay. A starting check number moves on to the number after the last one used. On a phone, Pay & new is in the More menu.
- Cancel leaves the screen. If you entered a payment, Books asks "Discard this payment? The bills stay open." first.
- Any other way out of the screen with a payment entered asks the same question first: the Back link and the browser's Back or Forward button. Choose Keep editing to stay with your payments, or Discard to go on. If you reload or close the browser tab, the browser asks.

Books posts every payment or none. It refuses a payment into a closed period, a Paid from account that is inactive, a check number that is already on another expense or bill payment from the same account, and a payment more than a bill's open balance (for example when another payment paid it first). The message shows under the bill, the field or the list, and what you typed stays.

## What a payment posts

A bill payment posts one journal entry. It debits Accounts payable for the bills it pays and credits the account you paid from for the total. Each line names the vendor. In Journal Entries the entry has the Type Bill payment and the payment's number. To see it from the payment, choose View journal entry. On the cash basis, a bill counts in your reports when you pay it and as far as you pay it. See [Reports](help://books:reports).

## Edit a bill payment

A posted bill payment opens in its read view: the vendor, the account it was paid from, the date, the payment (such as "Check · 1042"), the bills it paid with their total, and who posted it. To see what changed on the payment and who changed it, choose More → Audit history.

To change it, choose Edit. Pay bills opens as "Edit bill payment 1004", with the payment's Paid from, date, method and Check no. filled in and the bills paid as before. The vendor cannot change. You can change the header, change or clear a bill's payment, and pay more of the same vendor's open bills. A line under the balances shows the original payment ("Payment 1004 now"), so the New balance shows the change. Choose Save. The edit replaces the original under the same number, and the original becomes Void, with "Replaced by 1004 (edited)". An edit must pay at least one bill: to undo a payment, void it.

## Void a bill payment

To cancel a bill payment, open it and choose Void, then confirm. Books posts a reversing entry in the original period. The number is kept. The bills it paid are open again. A void payment shows who voided it.

While a posted bill payment pays a bill, that bill cannot be voided. Void or edit the payment first.

## Keyboard shortcuts

On Pay bills:

| Action | Key |
| --- | --- |
| Pay (Save on an edit) | ⌘↵ |
| Pay & new (not on an edit) | ⌘⇧↵ |
| Cancel (asks first if you entered a payment) | Esc |
| Pay every listed bill in full, or clear them | ⌥A |
| Clear payments | ⌥⌫ |

In a Payment cell, ⌥↵ pays the bill in full when the cell is empty or zero, and clears it when it holds an amount. Enter moves to the next bill's Payment cell; on the last one it moves to Clear payments.

On a posted or void bill payment:

- E: Edit
- V: Void
- J: View journal entry

On a posted bill with a balance due:

- P: Pay bill

The keys of Pay bills also work while the cursor is in a text box. E, V, J and P do not. A key does nothing while its button is hidden or turned off. If a menu or dialog is open, Esc first closes it, and the other keys do nothing. To see all shortcuts, press ? when the cursor is not in a text box.

## Who can do what

With bookkeeper or admin access you can pay bills, and edit and void bill payments. With read-only access you can open a bill payment and view its journal entry. Without bookkeeper access, Pay bills says "You need bookkeeper access to pay bills".
