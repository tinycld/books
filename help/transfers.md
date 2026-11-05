---
title: Transfers
summary: Move money between bank, card, asset, liability and equity accounts.
tags: [transfer, bank, savings, credit card]
order: 27
---

To move money between accounts, use a transfer. A transfer takes an amount out of one account and puts it into another account on a date. When you post it, Books records it as one balanced journal entry with two lines.

## Create a transfer

To create a transfer, choose New in the sidebar (the round + button on a phone) and pick Transfer. You can also open the register of an account and choose the Transfer button at the top. Then Transfer from starts with that account.

Pick the account the money comes from in Transfer from, and the account it goes to in Transfer to. The two accounts must be different. A transfer can use active accounts of these types:

- Bank
- Other current asset
- Fixed asset
- Other asset
- Credit card
- Other current liability
- Long-term liability
- Equity

Accounts receivable, accounts payable, income, other income, cost of goods sold, expense and other expense accounts are not in the list.

Under each account you pick, the form shows its balance, for example "Balance $1,201.00". This is the posted balance of the account, the same figure as in the [Chart of Accounts](help://books:chart-of-accounts). It is not the balance on the transfer date, and it does not show the balance after the transfer. Books does not stop a transfer that is larger than the balance.

Type the amount, for example 1,234.50. The amount must be more than 0. The date is today unless you change it. The memo is optional and can have up to 4000 characters.

## Save a draft

To keep your work and come back later, choose Save draft. A draft has no number and does not change any balance. To continue, open the draft from [Journal Entries](help://books:journal-entries). To remove a saved draft, open it, choose More and choose Delete draft. Deleting a draft cannot be undone.

## Post a transfer

To post a transfer, choose Post. The transfer gets a number of its own that starts with TR- (for example TR-3). An admin can change the prefix and the next number in Settings, under Numbering, on the Transfers card.

Books refuses to post into a closed period, which is any day on or before the close date, unless an admin gave you a close-date override that has not expired. Without one, Books shows the refusal above the form. Ask an admin for an override, or change the date to a day after the close date.

To post and start the next transfer at once, choose Post & new. On a phone, it is in the More menu. If you opened the form with a register's Transfer button and did not save it as a draft, the new transfer keeps that account in Transfer from.

## Find a transfer

A posted transfer shows in the Journal Entries list with the Type Transfer and its number. It also shows in the [Account register](help://books:account-register) of both accounts. To open a transfer from Journal Entries, press its row. In a register, press its row and choose Open entry in the drawer. To see the two lines of a posted or void transfer, open it and choose View journal entry.

## Edit a posted transfer

To edit a posted transfer, open it and choose Edit. You can also choose Edit in the menu of its row in Journal Entries, or on its journal entry. The transfer form opens with the posted figures and a notice. The original stays posted and your books do not change until you post. Save draft keeps your changes for later. When you post, the new transfer replaces the original under the same number, and the original is voided.

## Void a transfer

To void a posted transfer, open it and choose Void. Books posts a reversing entry in the original period and marks the transfer as Void. The number is kept.

A transfer cannot be reversed with one click, and it cannot reverse automatically. To correct a transfer, use Edit or Void.

## Who can do what

With bookkeeper or admin access you can create, post, edit and void transfers, and delete drafts. With read-only access you can open and read transfers. A read-only user does not see the Transfer button in a register or the New menu.
