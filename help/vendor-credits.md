---
title: Vendor credits
summary: Record a credit a vendor gives you, post it, and apply it to that vendor's open bills so you pay less.
tags: [vendor credits, purchases, vendors, returns, "credit note", "accounts payable", keyboard]
order: 43
---

To record a credit that a vendor gives you, enter a vendor credit. When you post it, Books gives it a number and lowers what you owe the vendor. Then apply it to the vendor's open bills, and each bill's Balance due goes down by the part you apply.

Use a vendor credit for a return, an overcharge or a credit note that the vendor sends you.

Use a vendor credit, not a negative line on a bill, when the vendor gives money back that is not part of one bill: a bill total cannot be below zero, and a vendor credit keeps the credit on the vendor until you apply it. A discount on one bill can still be a negative account line on that bill. See [Bills](help://books:bills).

To find, filter and act on your vendor credits, choose Expenses in the sidebar, then Vendor credits. See [Purchase lists](help://books:purchase-lists).

## Enter a vendor credit

To enter a vendor credit, choose New in the sidebar (the round + button on a phone) and pick Vendor credit, under Vendors. In a web browser, the Vendor field has focus when the form opens, so you can start to type the vendor's name at once.

1. Pick the **Vendor**. Only active vendors are in the list. When the first account line has no account, Books puts the vendor's default expense account on it, if that account is active and is an expense or cost of goods account.
2. Check the **Credit date** (today unless you change it).
3. Type the **Vendor's credit no.**, the number on the vendor's credit note (at most 40 characters). It is optional.
4. Add the lines (see below).
5. For a note to your team, use **Memo**. Only your team sees it, and it is saved as the memo of the journal entry.

If another vendor credit of the same vendor already has the same vendor's credit no., Books refuses the save and shows which credit has it, for example "Pacific Power already has credit no. CM-8841 (Vendor credit 1002)." A void vendor credit does not count, and an empty credit no. is never a duplicate.

## Account lines and product lines

A vendor credit has the same two tables of lines as a bill, with up to 250 lines in all:

- Account details: account lines. Use an account line for a credit on a cost that is not a product you track, such as an overcharge on rent or a repair. Pick an expense or cost of goods account, type a description if you want one, and type the Amount as a positive number: 50.00 is $50.00 of credit. A negative account line lowers the credit.
- Product and service details: product lines. Use a product line for a product or service you return. Only active products and services with "I purchase this" turned on are in the list. Books fills the description and the Rate from the product's purchase description and cost; you can change them. Books calculates the Amount as Qty × Rate.

To add an account line, choose Add account line. To add a product line, choose Add product line. When you press Enter in the Amount of the last account line, Books adds an account line; when you press Enter in the Rate of the last product line, Books adds a product line. Each line has a menu (⋮) with Insert line above, Insert line below, Move up, Move down, Duplicate and Remove. An empty line at the end of a table is dropped when you save.

Under the lines, Books shows the Account lines and Products and services subtotals (each when its table has a line with an amount) and the Total. The big figure at the top is the Credit amount.

## Save and post

- Save draft keeps the vendor credit without a number. A draft does not change your books. To continue it later, find it with the app search, for example by its memo or vendor.
- Post gives the vendor credit the next number, such as 1001, and records it in your books. An admin can change the next number in Settings, under Numbering, on the Vendor credits card.
- Post & new posts the vendor credit and opens a new one. On a phone, it is in the More menu.
- Cancel leaves the form. If you changed something, Books asks "Discard changes?" first.
- To remove a saved draft, choose More and then Delete draft. This cannot be undone.

When you post a vendor credit, Books posts one journal entry: Accounts payable goes down by the total, and each line's account is credited by its amount (a negative line the other way). Each line of the entry names the vendor. In Journal Entries the entry has the Type Vendor credit and the credit's number.

Books refuses to post into a closed period, a vendor credit whose vendor is inactive, a line whose account or product is inactive, a product without "I purchase this", a product whose expense account is inactive, and a vendor credit whose total is zero. A vendor credit total cannot be below zero: for more money you owe, enter a bill. The message shows on the form; the draft that you saved stays.

## Apply a credit to bills

A posted vendor credit shows its **Unapplied credit**, the part that is not applied to a bill yet. When its vendor has open bills, a notice on the credit says how many, for example "Pacific Power has 2 open bills. Apply this credit to lower what you pay."

To apply it, open the vendor credit and choose **Apply to bills** (or press A). On a phone, Apply to bills is the button beside More. The dialog shows the Unapplied credit and the vendor's open bills, with each bill's due date, Open balance and a Credit to apply cell.

1. Check the **Apply date** (today unless you change it). The apply date cannot be before the credit date, and it cannot be in a closed period.
2. Check the amounts. The dialog opens with the credit spread over the oldest bills first, by due date, so you can apply it at once with ⌘↵.
3. To change it, tick or untick a bill, or type an amount in its Credit to apply cell. Ticking a bill applies the lesser of its open balance and the credit that is still free. A cell cannot be more than the bill's open balance, and all the cells together cannot be more than the unapplied credit. Choose Clear to empty every cell.
4. Choose **Apply credit**.

Under the list, Books shows what you apply, for example "Applying $50.00 to 2 bills · $0.00 stays unapplied". You can apply part of a credit: the rest stays unapplied on the vendor credit, and you can apply it later to another bill of the same vendor. After you apply, each bill's Balance due goes down, and a bill that the credit pays in full shows Paid and leaves Pay bills. See [Pay bills](help://books:pay-bills).

When the vendor has no open bill, the dialog says so, for example "Pacific Power has no open bills. The credit stays on the vendor until you post a bill or record a refund." Choose New bill to enter one, or Record refund when the vendor sends the money back (see below).

An application posts no journal entry: the credit and the bill already changed Accounts payable for the same vendor.

## Record a refund of the credit

When the vendor sends you money back for the credit instead of taking it off a bill, open the vendor credit and choose **Record refund** (or press R). On a phone, Record refund is in the More menu; Apply to bills stays the button beside More. The vendor refund form opens with the vendor chosen and this credit ticked for its unapplied credit. Record refund shows on a posted credit with unapplied credit, for bookkeepers and admins. See [Vendor refunds](help://books:vendor-refunds).

A posted vendor refund lowers the credit's unapplied credit, in the same way as an application to a bill. A credit that is refunded in full leaves the Pay bills notice of unapplied credits.

## The badge, the totals and Applied to

The badge of a posted vendor credit follows its unapplied credit. A refund counts as use of the credit, in the same way as an application:

- **Posted**: nothing is applied or refunded yet.
- **Partly applied**: part of the credit is applied or refunded, and some of it is still unapplied.
- **Applied**: nothing is left, and part of the credit is applied to bills.
- **Refunded**: nothing is left, and none of the credit is applied to a bill: the vendor refunded all of it.

Under the Total, a posted vendor credit shows the Applied part (applied to bills), the Refunded part (only when a posted vendor refund names the credit) and the Unapplied credit, in that order.

The **Applied to** section lists each bill the credit is applied to, for example "Bill 1003 · Nov 16, 2026 · $30.00", and each posted vendor refund of the credit, for example "Vendor refund 1001 · Nov 17, 2026 · $50.00", in date order. Choose one to open that bill or vendor refund. A refund row has no Remove: to undo a refund, void or edit the vendor refund on its own page.

## Remove a credit from a bill

To take a credit off a bill, choose **Remove** on the bill's row in the Applied to section of the vendor credit, or on the credit's row in the Payments section of the bill, then confirm. Remove puts the amount back: the bill's balance goes up by the amount, and the vendor credit's unapplied credit goes up by the same amount. Books refuses Remove when the apply date is in a closed period.

## Edit, void and copy a posted vendor credit

To change a posted vendor credit, open it and choose Edit. The form opens with a notice. When you post, the edit replaces the original under the same number, and the original becomes Void, with a link to the new one. The bills the credit is applied to move to the edit. Books refuses the edit when its total is below what is applied ("$30.00 of this credit is applied to bills. Its total cannot be below that.") or when it changes the vendor ("This credit is applied to bills, so its vendor cannot change.").

The posted vendor refunds of the credit move to the edit too; a draft vendor refund stays on the original. When a vendor refund names the credit, Books refuses an edit whose total is below what is applied and refunded ("$80.00 of this credit is applied or refunded. Its total cannot be below that.") or that changes the vendor ("A vendor refund is recorded on this credit, so its vendor cannot change."). The edit's credit date must be on or before the date of the earliest posted vendor refund of the credit; a later date is refused under Credit date, for example "Vendor refund 1003 refunds this credit on Nov 15, 2026. Date the credit on or before that day."

To cancel a posted vendor credit, open it and choose Void, then confirm. Books posts a reversing entry in the original period. The vendor credit keeps its number and shows Void. You cannot Void a credit that is applied to bills: Books shows "This credit is applied to bills. Remove it from those bills first." Remove it from each bill first, then void it.

You cannot Void a credit that a posted vendor refund names either: Books shows "A vendor refund is recorded on this credit. Void the refund first." Void the vendor refund first, then void the credit.

To start a new vendor credit from one that you already have, open it and choose Copy. The new draft has the same vendor, lines and memo, today's credit date, an empty vendor's credit no., and no attachments.

To see the entry a vendor credit posted, open it and choose View journal entry.

## Attach the credit note

To keep the vendor's credit note (a PDF or a photo) with the vendor credit, add it in the Attachments section under Memo, on the form or on a posted vendor credit. An edit moves the original's files to the posted edit; a copy starts with none. See [Attachments](help://books:attachments).

## The Purchase lines setting

The Purchase lines setting in Settings → Purchases decides which tables a new vendor credit shows, as it does for a new bill, a new expense and a new purchase order: Accounts and products (the default), Accounts only, or Products only. A table that the setting hides still shows on a vendor credit that already has lines in it. See [Settings](help://books:settings).

## Cash basis

On the cash basis, an unapplied vendor credit changes no figure in your reports: Books takes it out on its credit date, and each time you apply it to a bill, the applied share counts on the apply date, for the credit and as a payment of the bill. So a credit applied in full to a bill shows the bill's cost less the credit on the apply date. A vendor refund of the credit counts the refunded share on the refund date. On the accrual basis, a vendor credit counts on its credit date. See [Reports](help://books:reports).

## Keyboard shortcuts

On the vendor credit form (a new vendor credit, a draft, an edit or a copy):

| Action | Key |
| --- | --- |
| Post | ⌘↵ |
| Post & new | ⌘⇧↵ |
| Save draft | ⌘S |
| Cancel (asks first if you changed something) | Esc |
| Delete draft (a saved draft only; in More) | ⌘⌫ |
| Add an account line (while Account details shows) | ⌥↵ |
| Add a product line (while Product and service details shows) | ⌥P |
| Attach files | ⌥A |

On a posted or void vendor credit:

- A: Apply to bills (a posted credit with unapplied credit)
- R: Record refund (a posted credit with unapplied credit)
- E: Edit
- V: Void
- C: Copy to a new vendor credit
- J: View journal entry
- ⌥A: Attach files (a posted vendor credit only)

In the Apply to bills dialog:

| Action | Key |
| --- | --- |
| Apply credit | ⌘↵ |
| Cancel | Esc |
| Tick or untick the bill (in a Credit to apply cell) | ⌥↵ |

The form keys and ⌥A also work while the cursor is in a text box. A, R, E, V, C and J do not. A key does nothing while its action is not offered. If a menu or dialog is open, Esc first closes it. To see all shortcuts, press ? when the cursor is not in a text box.

## Who can do what

With bookkeeper or admin access you can create, post, edit, void, copy and delete draft vendor credits, apply them to bills, remove them from bills and record vendor refunds of them. With read-only access you can open a posted or void vendor credit and view its journal entry. To work with vendors, see [Vendors](help://books:vendors).
