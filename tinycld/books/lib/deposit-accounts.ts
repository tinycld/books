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

// The active deposit accounts in chart order (the order of the select's options).
function offeredDepositAccounts(accounts: readonly DepositAccountRow[]): DepositAccountRow[] {
    const { options } = depositAccountOptions(accounts, '')
    const byId = new Map(accounts.map(account => [account.id, account]))
    return options.flatMap(option => byId.get(option.value) ?? [])
}

// The first active Undeposited funds account in chart order; else the first active bank
// account; else '' (the chart has no deposit account).
export function defaultDepositAccount(accounts: readonly DepositAccountRow[]): string {
    const offered = offeredDepositAccounts(accounts)
    const undeposited = offered.find(isUndepositedFunds)
    return (undeposited ?? offered[0])?.id ?? ''
}

// A refund receipt's Refund from default (refund receipt spec §3.3): the first active bank
// account in chart order; else the first active Undeposited funds account; else ''.
export function defaultRefundFromAccount(accounts: readonly DepositAccountRow[]): string {
    const offered = offeredDepositAccounts(accounts)
    const bank = offered.find(account => account.type === 'bank')
    return (bank ?? offered[0])?.id ?? ''
}

function isActiveBank(account: DepositAccountRow): boolean {
    return !account.inactive && account.type === 'bank'
}

/**
 * A bank deposit's Deposit to options (bank deposit spec §3.3, Q9): every active account
 * of type `bank` in chart order, labelled "<number> <name>" and indented by depth. A
 * stored account the list does not offer (made inactive since) is named in
 * `triggerLabel` for `storedId` only. The server applies the same rule (server/deposits.go
 * `msgDepositToRequired`, `msgDepositToInactive`).
 */
export function bankAccountOptions(
    accounts: readonly DepositAccountRow[],
    storedId: string
): { options: SelectOption[]; triggerLabel: string } {
    return filteredAccountOptions(accounts, storedId, isActiveBank)
}

// The account types an other funds line may not name (server/deposits.go
// `msgDepositLineControl`): a deposit writes no document or party balance.
export const LINE_CONTROL_TYPES: ReadonlySet<string> = new Set([
    'accounts_receivable',
    'accounts_payable',
])

/**
 * An other funds line's Account options (bank deposit spec §3.5): every active account in
 * chart order but Accounts receivable, Accounts payable and the account chosen in Deposit
 * to, labelled "<number> <name>" and indented by depth. A stored account the list does not
 * offer (made inactive since, or chosen in Deposit to since) is named in `triggerLabel`
 * for `storedId` only, so the line keeps its value and the server's refusal shows under
 * it. The server applies the same rule (server/deposits.go `msgDepositLineControl`,
 * `msgDepositLineDepositTo`, `msgDepositLineInactive`).
 */
export function otherFundsAccountOptions(
    accounts: readonly DepositAccountRow[],
    depositToId: string,
    storedId: string
): { options: SelectOption[]; triggerLabel: string } {
    return filteredAccountOptions(
        accounts,
        storedId,
        account =>
            !account.inactive && !LINE_CONTROL_TYPES.has(account.type) && account.id !== depositToId
    )
}

// A new deposit's Deposit to: the first active bank account in chart order (the vendor
// refund's Refunded to rule); '' when the chart has none.
export function defaultBankAccount(accounts: readonly DepositAccountRow[]): string {
    return bankAccountOptions(accounts, '').options[0]?.value ?? ''
}

// The word before the account in a payment line: a receipt or a received payment
// deposits, a bill payment or an expense pays from, a vendor refund is refunded to, a
// refund receipt is refunded from.
export type PaymentVerb = 'deposited to' | 'paid from' | 'refunded to' | 'refunded from'

// A read view's payment line, "Check · 43567 · deposited to 1010 Business Savings": the
// method's label, the reference and the account after its verb, each left out when empty
// (a bill payment and an expense pass no account: they show it on its own).
export function paymentText(input: {
    method: string
    reference: string
    depositLabel: string
    verb: PaymentVerb
}): string {
    const deposit = input.depositLabel ? `${input.verb} ${input.depositLabel}` : ''
    return [paymentMethodLabel(input.method), input.reference.trim(), deposit]
        .filter(part => part !== '')
        .join(' · ')
}
