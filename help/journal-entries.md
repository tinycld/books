---
title: Journal entries
summary: Create, post, edit, reverse and void journal entries.
tags: [journal entries, post, reverse, void, ledger]
order: 26
---

A journal entry moves money between accounts. Each entry has a date, a memo and two or more lines. Every line has an account and an amount on the debit or credit side. Debits must equal credits before you can post.

To see all entries, choose Journal Entries in the sidebar. Use the filters above the list to narrow it by status, search or date range. A read-only user can open entries but cannot change them.

## Create an entry

To create an entry, choose New journal entry in the list, or choose New in the sidebar and pick Journal entry. Set the date and the memo. Pick an account for each line and type an amount in the Debit or Credit column. An entry can have up to 200 lines. To add a line, use the add line button under the last line.

The strip under the lines shows Debits, Credits and the balance. If the two sides differ, it shows "Out of balance by" and the difference. Fix the amounts until it shows "In balance". An entry needs an amount on at least two lines.

## Save a draft

To keep your work and come back later, choose Save draft. A draft has no number and does not change any balance. To continue, open the draft from the list. To remove it, open the menu on its row and choose Delete, or use the menu in the draft header. Deleting a draft cannot be undone.

## Post an entry

To post an entry, choose Post. The entry gets its number (for example JE-1046) and starts to count in the balances and in the registers of its accounts. Books refuses to post into a closed period, which is any day on or before the close date, unless an admin gave you a close-date override that has not expired. Without one, Books shows the close date and the date of the entry. Ask an admin for an override, or change the entry date to a day after the close date.

To post and start the next entry at once, choose Post & new. On a phone, it is in the More menu.

## Set an auto-reverse date

To have Books reverse an entry on a later day, type a date in Auto-reverse on. The date must be after the entry date. If the books are closed through a date, the auto-reverse date must also be after that close date. When that day comes, Books posts the reversing entry. The posted entry shows the date it will reverse.

## Edit a posted entry

To edit a posted entry, open it and choose Edit, or choose Edit in the menu of its row. The form opens with the posted figures and a notice. The form is a copy: the original stays posted and your books do not change until you post. Save draft keeps your changes for later. When you post, the new entry replaces the original under the same number, and the original is voided.

## Reverse an entry

To reverse a posted entry, open it and choose Reverse, or choose Reverse in the menu of its row. A dialog asks for the reversal date and a memo. The date cannot be before the entry date. It starts as the first day of the next month, or today if that is later. Choose Reverse entry. Books posts a new entry that swaps every debit and credit, and opens it. An entry that is already reversed cannot be reversed again.

## Void an entry

To void a posted entry, open it and choose Void, or choose Void in the menu of its row. Books posts a reversing entry in the original period and marks the entry as Void. The number is kept. Both entries stay in the registers, and both count in the balances.

## Who can do what

With bookkeeper access you can create, post, edit, reverse, void and delete drafts. With read-only access you can open and read entries. The menu on a row shows only the actions that fit the entry:

- A draft can be opened or deleted.
- A posted entry can be opened, edited, reversed and voided. Reverse is hidden once a reversal exists.
- A void entry can only be opened.
- A void reversal entry (the reversing entry that a void creates) can only be opened. You cannot edit, reverse or void it.

To read the account side of entries, see [Account register](help://books:account-register). To move around Books, see [Moving around Books](help://books:navigating-books).
