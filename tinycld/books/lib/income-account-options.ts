import { filteredAccountOptions } from './account-options'
import type { ExpenseOptionAccount } from './expense-account-options'

export type IncomeOptionAccount = ExpenseOptionAccount

// The server accepts only these types as a product's income account.
const OFFERED_TYPES: readonly IncomeOptionAccount['type'][] = ['income', 'other_income']

/**
 * The Income account choices: the active Income and Other income accounts in chart
 * order, indented by depth, with no "None" (a service or non-inventory item needs one).
 * A stored account that is not offered (it became inactive, or changed type) is named
 * by `triggerLabel`, which the select shows while no option matches its value; it is
 * kept on save.
 */
export function incomeAccountOptions(
    accounts: readonly IncomeOptionAccount[],
    storedId: string
): { options: { value: string; label: string; indent?: number }[]; triggerLabel: string } {
    return filteredAccountOptions(accounts, storedId, account =>
        OFFERED_TYPES.includes(account.type)
    )
}
