---
title: Account register
summary: See every posted transaction of one account, with a running balance.
tags: [register, transactions, ledger]
order: 25
---

The register lists the transactions of one account, oldest to newest or the other way round, with a running balance.

## Open a register

To open a register, go to [Chart of Accounts](help://books:chart-of-accounts). Open the menu on an account row and choose View register. You need bookkeeper access to see this menu. With any access level, you can press the row to open the account panel and choose the View register button. To go back, choose Chart of Accounts at the top of the register.

## Read the header

The header shows the account number (when set), the name, the type and the detail type. An inactive account also shows Inactive.

Opening balance is the balance before the first day of the range. Ending balance is the balance at the end of the range. The text under it, "through" and a date, is the last day of the range. The Ending balance can differ from the figure in the Chart of Accounts. The Chart counts every posting, including postings dated after the "through" date. The register counts only up to that date. This is true even for This month.

## Choose a date range

To change the range, use the date range menu. The choices are This month, Last month, This quarter, This fiscal year and Last fiscal year. The register opens on This month. The fiscal year and quarter start in the fiscal year start month of your books.

## Read the rows

Each row shows the Date, Ref no., Type, Memo, Account, Debit, Credit and Balance. On a phone, each row is a card. A card shows the date, the Ref no., the memo, the other account with the entry type (and Void), the amount marked Debit or Credit, and the running balance.

- **Type** is Journal entry, Reversal, Void reversal or Auto reversal. A reversal also shows the entry it reverses, for example "Reversal of JE-1046". A voided entry shows Void.
- **Account** is the other account of the entry. An entry with more than two lines shows -Split-.
- **Balance** is the running balance, signed for the normal side of the account. It shows Too large when the number is too big to store.

The Opening balance row is the earliest row. It is last when the newest entry is on top (the default). It is first when the oldest entry is on top. It shows the balance at the start of the range. It appears only when the opening balance is not zero or the range has rows.

Draft entries never appear. A voided entry and its reversal both appear, and both count in the balance.

## Sort the rows

To sort, press the Date heading. Press it again to reverse the order. The newest entry shows first by default.

## See an entry

To see an entry, press its row. A drawer opens with the entry, its status, its memo and all its lines. The line for this account is highlighted. The drawer is read only. To close it, press the close button.

## Parent accounts

A parent account shows Own transactions only. Transactions of its sub-accounts are not in its register. To see them, open the register of the sub-account.

## Add an entry

When journal entries are available and you have bookkeeper access, the New journal entry button appears next to the date range. A read-only user does not see it.

## Empty and error states

An account with no transactions shows "No transactions yet". If you can create entries and journal entries are available, the empty state also has a New journal entry button. When only the chosen range is empty, the register says so. The Show this fiscal year button appears when another range is selected. Choose it to widen the range.

If the register cannot load, choose Retry.
