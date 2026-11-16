---
title: Expenses
summary: Record money you already paid, from a bank or credit card account, with account lines and product lines, and post it.
tags: [expenses, purchases, vendors, checks, credit card, paid from, keyboard]
order: 41
---

To record money that you already paid, by check, card, cash or another method, enter an expense. When you post it, Books gives it a number and records it in your books: the account you paid from goes down (or, for a credit card, its balance owed goes up) by the total, and each line's expense account gets its amount.

Use an expense when you paid now and there is no bill to pay later. When a vendor sends a bill that you pay later, enter a bill instead. See [Bills](help://books:bills). To pay that bill later, see [Pay bills](help://books:pay-bills).

## Enter an expense

To enter an expense, choose New in the sidebar (the round + button on a phone) and pick Expense, under Vendors. In a web browser, the Vendor field has focus when the form opens, so you can start to type the vendor's name at once.

1. Pick the **Vendor**, or leave it on No vendor. The vendor is optional. Only active vendors are in the list. To work with vendors, see [Vendors](help://books:vendors).
2. Pick **Paid from**: the bank or credit card account the money came from. Only active bank and credit card accounts are in the list. If the list is empty, add a bank or credit card account to the chart of accounts first.
3. Check the **Payment date** (today unless you change it).
4. Check the **Payment method**: Cash, Check, Credit card, Debit card, Bank transfer or Other. When you pick Paid from, Books sets it for you: Credit card for a credit card account, Cash for a cash on hand account, and Check for any other bank account. You can change it after.
5. Type the **Ref no.**, for example the check number or the card reference (at most 40 characters). It is optional.
6. Add the lines (see below).
7. For a note to your team, use **Memo**. Only your team sees it, and it is saved as the memo of the journal entry.

Under Paid from, the form shows the balance of the account you picked, for example "Balance $7,118.56". This is the posted balance of the account, the same figure as in the [Chart of Accounts](help://books:chart-of-accounts). It is not the balance on the payment date, and it does not show the balance after this expense. Books does not stop an expense that is larger than the balance.

If the Payment method is Check and another expense from the same Paid from account already has the same check number in Ref no., Books refuses the save and shows which expense has it, for example "Check no. 1042 from 1000 Business Checking is already on Expense 1004." A void expense does not count, and an empty Ref no. is never a duplicate. An edit of a posted expense does not clash with the expense it replaces.

## Account lines and product lines

An expense has the same two tables of lines as a bill, with up to 250 lines in all:

- Account details: account lines. Use an account line for a cost that is not a product you track, such as rent, utilities or a repair. Pick an expense or cost of goods account, type a description if you want one, and type the Amount. When you pick a vendor and the first account line has no account, Books puts the vendor's default expense account on it, if that account is active and is an expense or cost of goods account; otherwise the line stays empty.
- Product and service details: product lines. Use a product line when you buy a product or service that you track. Only active products and services with "I purchase this" turned on are in the list. Books fills the description and the Rate from the product's purchase description and cost; you can change them. Books calculates the Amount as Qty × Rate, rounded to the cent. When you post, the amount goes to the product's expense account.

To record a discount, add a negative account line, for example −25.00 on the account of the cost it reduces. The expense total cannot be below zero.

To add an account line, choose Add account line. To add a product line, choose Add product line. When you press Enter in the Amount of the last account line, Books adds an account line; when you press Enter in the Rate of the last product line, Books adds a product line.

Each line has a menu (⋮) with Insert line above, Insert line below, Move up, Move down, Duplicate and Remove. An empty line at the end of a table is dropped when you save.

Under the lines, Books shows the Account lines and Products and services subtotals (each when its table has a line with an amount) and the Total. The large figure at the top of the form, Amount paid, is the same total.

## Save and post

- Save draft keeps the expense without a number. A draft does not change your books. To continue it later, find it with the app search, for example by its memo, Ref no. or vendor.
- Post gives the expense the next number, such as 1001, and records it in your books. An admin can change the next number in Settings, under Numbering, on the Expenses card.
- Post & new posts the expense and opens a new one. On a phone, it is in the More menu.
- Cancel leaves the form. If you changed something, Books asks "Discard changes?" first.
- To remove a saved draft, choose More and then Delete draft, at every screen width. This cannot be undone.

Books refuses to post into a closed period, an expense whose vendor is inactive, an expense whose Paid from account is inactive, a line whose account or product is inactive, a product without "I purchase this", a product whose expense account is inactive, and an expense whose total is zero. The message shows on the form; the draft that you saved stays.

If another person saves a change to a draft expense while you have changes of your own in it, Books refuses your next Save draft or Post and shows "This expense changed after you opened it." What you typed stays on the screen. To see their changes, choose Load the current expense. This replaces what you typed, so copy anything you want to keep first.

## Edit, void and copy a posted expense

To change a posted expense, open it and choose Edit. The form opens as "Edit 1004" with a notice. The original stays posted until you post. When you post, the edit replaces the original under the same number, and the original becomes Void, with a link to the new one.

To cancel a posted expense, open it and choose Void, then confirm. Books posts a reversing entry in the original period. The expense keeps its number and shows Void.

To start a new expense from one that you already have, open it and choose Copy. The new draft has the same vendor, Paid from (if that account is still active), payment method, lines and memo, today's payment date, and an empty Ref no.

To see the entry an expense posted, open it and choose View journal entry. A posted expense also shows in Journal Entries with the Type Expense and its number, and each line names the vendor.

## Attach the receipt

To keep the receipt (a PDF or a photo) with the expense, add it in the Attachments section under Memo, on the form or on a posted expense. On a phone, Attach files can take a photo of a paper receipt. An edit moves the original's files to the posted edit; a copy starts with none. See [Attachments](help://books:attachments).

## The Purchase lines setting

To choose which tables a new expense shows, open Settings → Purchases and set **Purchase lines** on the Bills and expenses card: Accounts and products (the default), Accounts only, or Products only. The same setting decides the tables of a new bill. Only a Books admin can change Purchase lines; everyone else sees the setting.

A table that the setting hides still shows on an expense that already has lines in it (a saved draft, an edit or a copy), so you never lose lines. Once a table shows on a form, it stays until you leave the form, even after you remove its last line. A posted expense shows every table that has lines. See [Settings](help://books:settings).

## Keyboard shortcuts

On the expense form (a new expense, a draft, an edit or a copy):

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

With the cursor in a line:

| Action | Key |
| --- | --- |
| Remove the line | ⌘⌥⌫ |
| Move the line up / down | ⌘⌥↑ / ⌘⌥↓ |
| Duplicate the line | ⌘⌥D |
| Open the line's menu | ⌥M |

On a posted or void expense:

- E: Edit
- V: Void
- C: Copy to a new expense
- J: View journal entry
- ⌥A: Attach files (a posted expense only)

The form keys and ⌥A also work while the cursor is in a text box. E, V, C and J do not. A key does nothing while its action is not offered (for example, Delete draft on a new expense). If a menu or dialog is open, Esc first closes it, and the other keys do nothing. To see all shortcuts, press ? when the cursor is not in a text box.

## Who can do what

With bookkeeper or admin access you can create, post, edit, void, copy and delete draft expenses. With read-only access you can open a posted or void expense and view its journal entry.
