// Where an expense's money comes from (spec §3.3, Paid from): the accounts the select
// offers, the label of a stored account it no longer offers, and the payment method a
// pick sets. The server applies the same rule (server/expenses.go `isPaymentAccount`).

import type { SelectOption } from '@tinycld/core/ui/form'
import { filteredAccountOptions } from './account-options'
import { PAID_FROM_TYPES } from './paid-from-method'

export { defaultMethodFor, PAID_FROM_TYPES } from './paid-from-method'

// The Paid from field's inline error when the chart has no bank or credit card account.
export const PAID_FROM_EMPTY_TEXT = 'Add a bank or credit card account to the chart of accounts'

// The fields chart order needs (filteredAccountOptions).
type PaidFromRow = {
    id: string
    name: string
    number: string
    type: string
    parent: string
    inactive: boolean
}

// An active bank or credit card account.
export function isPaidFromAccount(account: { type: string; inactive: boolean }): boolean {
    return !account.inactive && PAID_FROM_TYPES.has(account.type)
}

/**
 * Paid from's options: every active bank and credit card account in chart order and
 * depth, labelled "<number> <name>". A stored account the list does not offer (made
 * inactive since) is named in `triggerLabel` for `storedId` only, so the select still
 * shows it.
 */
export function paidFromOptions(
    accounts: readonly PaidFromRow[],
    storedId = ''
): { options: SelectOption[]; triggerLabel: string } {
    return filteredAccountOptions(accounts, storedId, isPaidFromAccount)
}
