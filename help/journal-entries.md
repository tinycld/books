---
title: Journal entries
summary: Create, post, edit, reverse and void journal entries.
tags: [journal entries, post, reverse, void, ledger]
order: 26
---

A journal entry moves money between accounts. Each entry has a date, a memo and two or more lines. Every line has an account and an amount on the debit or credit side. Debits must equal credits before you can post. To move money between bank, card, asset, liability or equity accounts, use a [transfer](help://books:transfers).

To see all entries, choose Journal Entries in the sidebar. Use the filters above the list to narrow it by status, search or date range. A read-only user can open entries but cannot change them.

## Create an entry

To create an entry, choose New journal entry in the list, or choose New in the sidebar and pick Journal entry. In a web browser on a wide screen, the Date field has focus when the form opens. Set the date and the memo. Pick an account for each line and type an amount in the Debit or Credit column. An entry can have up to 200 lines. To add a line, use the add line button under the last line.

To name who a line is for, pick a customer or a vendor in its Name field (on a phone, the Name field is under the account). Name is optional, and a line can name a customer or a vendor, not both. The list shows only active customers and vendors, in two groups; type to search it, or choose None to clear the name. A posted entry and the entry panel of an account register show the name. The name stays on the line when the entry posts, a void keeps it on the reversing entry, and Edit keeps it even when the customer or vendor became inactive. A customer or vendor on journal lines cannot be deleted: make it inactive instead.

The strip under the lines shows Debits, Credits and the balance. If the two sides differ, it shows "Out of balance by" and the difference. Fix the amounts until it shows "In balance". An entry needs an amount on at least two lines.

## Save a draft

To keep your work and come back later, choose Save draft. A draft has no number and does not change any balance. To continue, open the draft from the list. To remove it, open the menu on its row and choose Delete, or use the menu in the draft header. Deleting a draft cannot be undone.

## Post an entry

To post an entry, choose Post. The entry gets its number (for example JE-1046) and starts to count in the balances and in the registers of its accounts. Books refuses to post into a closed period, which is any day on or before the close date, unless an admin gave you a close-date override that has not expired. Without one, Books shows the close date and the date of the entry. Ask an admin for an override, or change the entry date to a day after the close date.

To post and start the next entry at once, choose Post & new. On a phone, it is in the More menu.

## When someone else changed the draft

If another person saves a change to a draft while you have it open, Books refuses your next Save draft or Post and shows "This entry changed after you opened it." Nothing is posted, and what you typed stays on the screen. A refused Save draft saves nothing, and a refused Post of a saved draft saves nothing. But when you post a new entry, Books saves it as a draft before it posts it. If Books then refuses the post, that draft stays saved.

To see their changes, choose Load the current entry. This replaces what you typed, so copy anything you want to keep first. Review the entry, then save or post again. If Books cannot load the entry, it tells you and keeps what you typed. Choose Load the current entry again.

## Set an auto-reverse date

To have Books reverse an entry on a later day, type a date in Auto-reverse on. The date must be after the entry date. If the books are closed through a date, the auto-reverse date must also be after that close date. When that day comes, Books posts the reversing entry.

A posted entry shows the state of its reversal in Auto-reverse on:

- **Will reverse on** a date: Books has not reversed the entry yet. Books posts reversals each hour, so a reversal can post up to one hour after its day starts (the day starts at midnight UTC).
- **Reversed on** a date, with the number of the reversing entry.
- **The automatic reversal did not post**: its day came and Books did not post the reversal. The journal list marks the entry with "Reversal overdue". To correct it, reverse the entry yourself or void it.
- **Not reversed**, when someone voided the reversing entry. Books does not reverse the entry again.

Nobody posts an automatic reversal, so the entry shows no poster. The audit log records it as created by the system, with the entry it reverses.

## Edit a posted entry

To edit a posted entry, open it and choose Edit, or choose Edit in the menu of its row. The form opens with the posted figures and a notice. The form is a copy: the original stays posted and your books do not change until you post. Save draft keeps your changes for later. When you post, the new entry replaces the original under the same number, and the original is voided.

## Reverse an entry

To reverse a posted entry, open it and choose Reverse, or choose Reverse in the menu of its row. A dialog asks for the reversal date and a memo. The date cannot be before the entry date. It starts as the first day of the next month, or today if that is later. Choose Reverse entry. Books posts a new entry that swaps every debit and credit, and opens it. An entry that is already reversed cannot be reversed again.

A transfer cannot be reversed. To correct a transfer, edit or void it.

## Void an entry

To void a posted entry, open it and choose Void, or choose Void in the menu of its row. Books posts a reversing entry in the original period and marks the entry as Void. The number is kept. Both entries stay in the registers, and both count in the balances.

## Keyboard shortcuts

On the journal entry form (a new entry, a draft, or an edit of a posted entry):

- ⌘↵: Post
- ⌘⇧↵: Post & new
- ⌘S: Save draft
- Esc: Cancel
- ⌘⌫: Delete draft (a saved draft only)

On a posted entry:

- E: Edit
- V: Void
- R: Reverse (when the entry can be reversed)

The form keys also work while the cursor is in a text box, for example a date, an amount or the memo. E, V and R do not work while the cursor is in a text box. If a menu or dialog is open, Esc first closes it. While a dialog is open, the other keys do nothing.

To see all shortcuts, press ? when the cursor is not in a text box.

## Who can do what

With bookkeeper access you can create, post, edit, reverse, void and delete drafts. With read-only access you can open and read entries. The menu on a row shows only the actions that fit the entry:

- A draft can be opened or deleted.
- A posted entry can be opened, edited, reversed and voided. Reverse is hidden once a reversal exists.
- A posted transfer can be opened, edited and voided, but not reversed. Its Edit opens the transfer form.
- A posted reversal or auto reversal can be opened, reversed and voided, but not edited.
- A void entry can only be opened.
- A void reversal entry (the reversing entry that a void creates) can only be opened. You cannot edit, reverse or void it.

To read the account side of entries, see [Account register](help://books:account-register). To move around Books, see [Moving around Books](help://books:navigating-books).
