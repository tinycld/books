---
title: Bills
summary: Record a bill a vendor sent, with account lines and product lines, and post it to Accounts payable.
tags: [bills, purchases, vendors, accounts payable, keyboard]
order: 40
---

To record what you owe a vendor, enter the vendor's bill as a bill. When you post it, Books gives it a number and records it in your books: Accounts payable goes up by the total, and each line's expense account gets its amount.

## Enter a bill

To enter a bill, choose New in the sidebar (the round + button on a phone) and pick Bill, under Vendors. In a web browser, the Vendor field has focus when the form opens, so you can start to type the vendor's name at once.

1. Pick the **Vendor**. Books fills the Mailing address and Terms from the vendor, and the Due date from the terms and the bill date. To change the address for this bill only, choose Edit address. To open the vendor, choose Edit vendor. Only active vendors are in the list.
2. Check the **Bill date** (today unless you change it) and the **Due date**. When you pick **Terms** or change the Bill date, Books sets the Due date again. A Due date that you type stays until you change Terms or the Bill date. The Due date cannot be before the Bill date.
3. Type the **Vendor's bill no.**, the number on the vendor's bill (at most 40 characters). It is optional.
4. Add the lines (see below).
5. For a note to your team, use **Memo**. Only your team sees it, and it is saved as the memo of the journal entry.

## Account lines and product lines

A bill has two tables of lines, with up to 250 lines in all:

- Account details: account lines. Use an account line for a cost that is not a product you track, such as rent, utilities or a repair. Pick an expense or cost of goods account, type a description if you want one, and type the Amount. When you pick a vendor and the first account line has no account, Books puts the vendor's default expense account on it, if that account is active and is an expense or cost of goods account; otherwise the line stays empty.
- Product and service details: product lines. Use a product line when you buy a product or service that you track, so you see what you bought. Only active products and services with "I purchase this" turned on are in the list. Books fills the description and the Rate from the product's purchase description and cost; you can change them. Books calculates the Amount as Qty × Rate, rounded to the cent. When you post, the amount goes to the product's expense account.

To record a discount the vendor gave you, add a negative account line for the discount, for example −25.00 on the account of the cost it reduces. The bill total cannot be below zero. For money a vendor owes you back, use a vendor credit.

To add an account line, choose Add account line. To add a product line, choose Add product line. When you press Enter in the Amount of the last account line, Books adds an account line; when you press Enter in the Rate of the last product line, Books adds a product line.

Each line has a menu (⋮) with Insert line above, Insert line below, Move up, Move down, Duplicate and Remove. An empty line at the end of a table is dropped when you save.

Under the lines, Books shows the Account lines and Products and services subtotals (each when its table has a line with an amount), the Total and the Balance due.

## Save and post

- Save draft keeps the bill without a number. A draft does not change your books. To continue it later, find it with the app search, for example by its memo or vendor.
- Post gives the bill the next number, such as 1001, and records it in your books. An admin can change the next number in Settings, under Numbering, on the Bills card.
- Post & new posts the bill and opens a new one. On a phone, it is in the More menu.
- Cancel leaves the form. If you changed something, Books asks "Discard changes?" first.
- To remove a saved draft, choose More and then Delete draft, at every screen width. This cannot be undone.

Books refuses to post into a closed period, a bill whose vendor is inactive, a line whose account or product is inactive, a product without "I purchase this", and a bill whose total is zero. The message shows on the form; the draft that you saved stays.

If another bill of the same vendor already has the same vendor's bill no., Books refuses the save and shows which bill has it, for example "Pacific Power already has bill no. 88412 (Bill 1003)." A void bill does not count, and an empty bill no. is never a duplicate.

## Edit, void and copy a posted bill

To change a posted bill, open it and choose Edit. The form opens as "Edit 1003" with a notice. The original stays posted until you post. When you post, the edit replaces the original under the same number, and the original becomes Void, with a link to the new one.

To cancel a posted bill, open it and choose Void, then confirm. Books posts a reversing entry in the original period. The bill keeps its number and shows Void.

To start a new bill from one that you already have, open it and choose Copy. The new draft has the same vendor, mailing address, terms, lines and memo, today's bill date, and an empty vendor's bill no.

To see the entry a bill posted, open it and choose View journal entry. A posted bill also shows in Journal Entries with the Type Bill and its number.

## The Bill lines setting

To choose which tables a new bill shows, open Settings → Purchases and set **Bill lines** on the Bills card: Accounts and products (the default), Accounts only, or Products only. Only a Books admin can change Bill lines; everyone else sees the setting.

The setting only changes what the form shows. A table that the setting hides still shows on a bill that already has lines in it (a saved draft, an edit or a copy), so you never lose lines. Once a table shows on a form, it stays until you leave the form, even after you remove its last line. A posted bill shows every table that has lines. See [Settings](help://books:settings).

## Keyboard shortcuts

On the bill form (a new bill, a draft, an edit or a copy):

| Action | Key |
| --- | --- |
| Post | ⌘↵ |
| Post & new | ⌘⇧↵ |
| Save draft | ⌘S |
| Cancel (asks first if you changed something) | Esc |
| Delete draft (a saved draft only; in More) | ⌘⌫ |
| Add an account line (while Account details shows) | ⌥↵ |
| Add a product line (while Product and service details shows) | ⌥P |

With the cursor in a line:

| Action | Key |
| --- | --- |
| Remove the line | ⌘⌥⌫ |
| Move the line up / down | ⌘⌥↑ / ⌘⌥↓ |
| Duplicate the line | ⌘⌥D |
| Open the line's menu | ⌥M |

On a posted or void bill:

- E: Edit
- V: Void
- C: Copy to a new bill
- J: View journal entry

The form keys also work while the cursor is in a text box. E, V, C and J do not. A key does nothing while its action is not offered (for example, Delete draft on a new bill). If a menu or dialog is open, Esc first closes it, and the other keys do nothing. To see all shortcuts, press ? when the cursor is not in a text box.

## Who can do what

With bookkeeper or admin access you can create, post, edit, void, copy and delete draft bills. With read-only access you can open a posted or void bill and view its journal entry. To work with vendors, see [Vendors](help://books:vendors).
