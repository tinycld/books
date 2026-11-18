// Where a vendor refund's money arrives (vendor refund spec §3.3, Q3, Refunded to): the
// accounts it may name, and its default. The server applies the same rule
// (server/vendor_refunds.go `isRefundAccount`: type `bank` or `credit_card`, or detail
// type `undeposited_funds`).

import type { SelectOption } from '@tinycld/core/ui/form'
import type { BooksAccounts } from '../types'
import { filteredAccountOptions } from './account-options'

// The fields chart order needs (filteredAccountOptions), and the detail type that marks
// an Undeposited funds account.
export type RefundAccountRow = Pick<
    BooksAccounts,
    'id' | 'number' | 'name' | 'type' | 'detail_type' | 'parent' | 'inactive'
>

const UNDEPOSITED_FUNDS = 'undeposited_funds'

// An active bank, credit card or Undeposited funds account.
export function isRefundAccountRow(account: RefundAccountRow): boolean {
    if (account.inactive) return false
    return (
        account.type === 'bank' ||
        account.type === 'credit_card' ||
        account.detail_type === UNDEPOSITED_FUNDS
    )
}

/**
 * Refunded to's options: every active refund account in chart order, labelled
 * "<number> <name>", indented by depth. A stored account the list does not offer (made
 * inactive since) is named in `triggerLabel` for `storedId` only, so the select still
 * shows the value the form mounted with.
 */
export function refundAccountOptions(
    accounts: readonly RefundAccountRow[],
    storedId: string
): { options: SelectOption[]; triggerLabel: string } {
    return filteredAccountOptions(accounts, storedId, isRefundAccountRow)
}

// The first active bank account in chart order; else the first listed account; else ''
// (the chart lists no refund account).
export function defaultRefundAccount(accounts: readonly RefundAccountRow[]): string {
    const { options } = refundAccountOptions(accounts, '')
    const byId = new Map(accounts.map(account => [account.id, account]))
    const offered = options.flatMap(option => byId.get(option.value) ?? [])
    const bank = offered.find(account => account.type === 'bank')
    return (bank ?? offered[0])?.id ?? ''
}
