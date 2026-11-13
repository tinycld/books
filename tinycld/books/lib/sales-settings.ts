// Settings → Sales (spec §3.11): "Sales deposited to" ('' is "Ask") and "Default message
// to customer", and what the sales receipt form reads from them.

import type { SelectOption } from '@tinycld/core/ui/form'
import type { BooksSettings } from '../types'
import { accountLabel } from './account-options'
import { type DepositAccountRow, depositAccountOptions } from './deposit-accounts'

const ASK = 'Ask'

// The receipt form draws Deposit to only with "Ask"; with an account set the server
// stamps that account on every receipt. Read on every render of the form, so a settings
// change shows or hides the field at once.
export function depositShown(
    settings: Pick<BooksSettings, 'sales_deposit_account'> | undefined
): boolean {
    return (settings?.sales_deposit_account ?? '') === ''
}

// "Ask" first, then every active deposit account in chart order. A stored account the
// list no longer offers is named in `triggerLabel`, as Deposit to's own select does.
export function salesDepositSettingOptions(
    rows: readonly DepositAccountRow[],
    storedId: string
): { options: SelectOption[]; triggerLabel: string } {
    const { options, triggerLabel } = depositAccountOptions(rows, storedId)
    return { options: [{ label: ASK, value: '' }, ...options], triggerLabel }
}

// The set account's "<number> <name>", or `fallback` when the rows do not hold it.
export function setAccountLabel(
    storedId: string,
    rows: readonly DepositAccountRow[],
    fallback: string
): string {
    const account = rows.find(row => row.id === storedId)
    return account ? accountLabel(account) : fallback
}

// The read-only row: "Ask" or the set account's "<number> <name>".
export function salesDepositReadOnlyText(
    storedId: string,
    rows: readonly DepositAccountRow[]
): string {
    if (storedId === '') return ASK
    return setAccountLabel(storedId, rows, 'An account')
}

export function defaultMessageReadOnlyText(message: string): string {
    return message === '' ? 'None' : message
}
