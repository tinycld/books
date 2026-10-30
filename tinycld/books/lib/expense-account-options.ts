import type { BooksAccounts } from '../types'
import { accountOptionList } from './account-options'

export type ExpenseOptionAccount = Pick<
    BooksAccounts,
    'id' | 'name' | 'number' | 'type' | 'parent' | 'inactive'
>

// The server refuses either ledger account as a vendor's default expense account.
const REFUSED_TYPES: readonly ExpenseOptionAccount['type'][] = [
    'accounts_receivable',
    'accounts_payable',
]

/**
 * The Default expense account choices: "None", then the active accounts of the chart in
 * chart order, indented by depth, without Accounts receivable and Accounts payable.
 * A stored account that is not offered (it became inactive, or its type became A/R or
 * A/P) is named by `triggerLabel`, which the select shows while no option matches its
 * value. The list is built over every account, so names cover the refused ones too and
 * an offered child keeps its depth in the chart.
 */
export function expenseAccountOptions(
    accounts: readonly ExpenseOptionAccount[],
    storedId: string
): { options: { value: string; label: string; indent?: number }[]; triggerLabel: string } {
    const refused = new Set(
        accounts.filter(account => REFUSED_TYPES.includes(account.type)).map(account => account.id)
    )
    const { options: chart, names } = accountOptionList(accounts)
    const options = chart.filter(option => !refused.has(option.value))
    const isOffered = options.some(option => option.value === storedId)
    const triggerLabel = isOffered ? '' : (names.get(storedId) ?? '')
    return { options: [{ value: '', label: 'None' }, ...options], triggerLabel }
}
