---
title: Opening balances
summary: Enter what each account held on your starting date, and change it later.
tags: [opening balances, starting balances, equity]
order: 30
---

To enter opening balances, open [Chart of Accounts](help://books:chart-of-accounts) and choose Opening balances. Then follow these steps.

1. Choose the starting date. Pick End of last fiscal year, End of last month or Custom date, or type a date. The balances are for the end of that day.
2. Type what each account held on that day. Only accounts with an amount are written to the entry.
3. Choose Save draft to keep your work and come back later. Choose Post when the figures are right.

If the books are closed through a date, the starting date must be after it. If a Books admin gave you a close-date override, you can use a date in the closed period while the override is active.

## How the entry balances

Books balances the entry with the account Opening Balance Equity. Books creates that account the first time you save, if it does not exist. You do not need to add it first.

Accounts receivable and Accounts payable take one total. You do not enter customers or vendors here.

An opening balance entry has one line for each account. Its lines are on asset, liability and equity accounts only, and no line names a customer or a vendor. The form always writes this shape. If an entry was made in another way (for example, through the API) and has a different shape, Books refuses to post it and tells you which line is wrong.

## Negative amounts

A negative amount puts the figure on the opposite side of the normal side of the account. For example, enter accumulated depreciation under Assets as a negative amount. To make a figure negative, press the ± button at the left of the amount field, or type a minus sign before the figure, for example -250. After you type a figure, the ± button flips its sign.

## Change a posted entry

To change a posted entry, open Opening balances and choose Edit balances. The form opens with the posted figures and a notice. Posting the new figures replaces the original under the same number, and the original is voided. Nothing changes until you choose Save draft or Post. Choose Back to posted balances to return to the posted entry.

If you choose Save draft, the posted balances stay until you post the draft. Choose Discard draft to remove it. On a narrow screen, such as a phone, Discard draft is in the More menu (the ··· button).

In Journal Entries, Edit on this entry opens Opening balances in edit mode, the same as Edit balances.

## When someone else changed the draft

If another person saves a change to the opening balances draft while you have it open, Books refuses your next Save draft or Post and tells you that the opening balances changed. Nothing is posted. A refused Save draft saves nothing. Post saves your figures to the draft before it posts them, so a refusal that comes at the post leaves your figures in the draft. Open Opening balances again to see their figures, review them, then save or post.

To see the entry in an account, open the [account register](help://books:account-register). The Type column shows Opening balances.
