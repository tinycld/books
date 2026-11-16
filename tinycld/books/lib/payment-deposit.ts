// Deposit to of a payment (spec §3.2, Q6). The sales receipt's options (active bank and
// Undeposited funds accounts in chart order), but a payment's default is never a bank:
// when the chart has no active Undeposited funds account, the list starts with an empty
// option the server fills at posting (`ensureUndepositedFunds`), and it is the default.

import type { SelectOption } from '@tinycld/core/ui/form'
import { type DepositAccountRow, depositAccountOptions } from './deposit-accounts'
import { PAYMENT_MESSAGES } from './payment-texts'

// The detail type `ensureUndepositedFunds` writes (lib/deposit-accounts.ts reads the same).
const UNDEPOSITED_FUNDS = 'undeposited_funds'

const CREATED_ON_POST: SelectOption = { value: '', label: PAYMENT_MESSAGES.createdOnPost }

function activeUndeposited(accounts: readonly DepositAccountRow[]): DepositAccountRow[] {
    return accounts.filter(
        account => !account.inactive && account.detail_type === UNDEPOSITED_FUNDS
    )
}

// The first active Undeposited funds account in chart order; else '' (created at posting).
export function paymentDefaultDeposit(accounts: readonly DepositAccountRow[]): string {
    const undeposited = new Set(activeUndeposited(accounts).map(account => account.id))
    const { options } = depositAccountOptions(accounts, '')
    return options.find(option => undeposited.has(option.value))?.value ?? ''
}

/**
 * Deposit to's options and the trigger label of a stored account the list no longer
 * offers (made inactive since). The empty created-on-post option comes first only when
 * the chart has no active Undeposited funds account.
 */
export function paymentDepositOptions(
    accounts: readonly DepositAccountRow[],
    storedId: string
): { options: SelectOption[]; triggerLabel: string } {
    const { options, triggerLabel } = depositAccountOptions(accounts, storedId)
    if (activeUndeposited(accounts).length > 0) return { options, triggerLabel }
    return { options: [CREATED_ON_POST, ...options], triggerLabel }
}
