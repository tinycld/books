// Where a sales receipt's money goes (spec §3.3, Deposit to): the accounts it may name,
// its default, and the read view's payment line. The server applies the same rule
// (server/sales_deposit.go `isDepositAccount`, `compareChartOrder`).

import type { SelectOption } from '@tinycld/core/ui/form'
import type { BooksAccounts } from '../types'
import { filteredAccountOptions } from './account-options'
import { paymentMethodLabel } from './payment-methods'

// The fields chart order needs (filteredAccountOptions), and the detail type that marks
// an Undeposited funds account.
export type DepositAccountRow = Pick<
    BooksAccounts,
    'id' | 'number' | 'name' | 'type' | 'detail_type' | 'parent' | 'inactive'
>

const UNDEPOSITED_FUNDS = 'undeposited_funds'

function isUndepositedFunds(account: Pick<DepositAccountRow, 'detail_type'>): boolean {
    return account.detail_type === UNDEPOSITED_FUNDS
}

// An active bank account or an active Undeposited funds account.
export function isDepositAccountRow(account: DepositAccountRow): boolean {
    return !account.inactive && (account.type === 'bank' || isUndepositedFunds(account))
}

/**
 * Deposit to's options: every active deposit account in chart order, labelled
 * "<number> <name>". A stored account the list does not offer (made inactive since) is
 * named in `triggerLabel` for `storedId` only, so the select still shows it.
 */
export function depositAccountOptions(
    accounts: readonly DepositAccountRow[],
    storedId: string
): { options: SelectOption[]; triggerLabel: string } {
    return filteredAccountOptions(accounts, storedId, isDepositAccountRow)
}

// The first active Undeposited funds account in chart order; else the first active bank
// account; else '' (the chart has no deposit account).
export function defaultDepositAccount(accounts: readonly DepositAccountRow[]): string {
    const { options } = depositAccountOptions(accounts, '')
    const byId = new Map(accounts.map(account => [account.id, account]))
    const offered = options.flatMap(option => byId.get(option.value) ?? [])
    const undeposited = offered.find(isUndepositedFunds)
    return (undeposited ?? offered[0])?.id ?? ''
}

// The read view's payment line, "Check · 43567 · deposited to 1010 Business Savings":
// the method's label, the reference and the deposit account, each left out when empty.
export function paymentText(input: {
    method: string
    reference: string
    depositLabel: string
}): string {
    const deposit = input.depositLabel ? `deposited to ${input.depositLabel}` : ''
    return [paymentMethodLabel(input.method), input.reference.trim(), deposit]
        .filter(part => part !== '')
        .join(' · ')
}
