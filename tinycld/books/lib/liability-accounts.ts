import type { SelectOption } from '@tinycld/core/ui/form'
import type { FormAccount } from '../hooks/useFormAccounts'
import { filteredAccountOptions } from './account-options'

// The columns these helpers read, so a plain stored row fits as well as a live one.
export type LiabilityAccount = Pick<
    FormAccount,
    'id' | 'name' | 'number' | 'type' | 'detail_type' | 'parent' | 'inactive'
>

// The accounts an agency's tax can post to: the active Other current liability
// accounts, in chart order and depth.
export function liabilityAccountOptions(
    accounts: readonly LiabilityAccount[],
    storedId: string
): { options: SelectOption[]; triggerLabel: string } {
    return filteredAccountOptions(
        accounts,
        storedId,
        account => account.type === 'other_current_liability'
    )
}

// A new agency starts on the first offered Sales tax payable account.
export function defaultLiabilityAccount(accounts: readonly LiabilityAccount[]): string {
    const detail = new Map(accounts.map(account => [account.id, account.detail_type]))
    const { options } = liabilityAccountOptions(accounts, '')
    const found = options.find(option => detail.get(option.value) === 'sales_tax_payable')
    return found?.value ?? ''
}

// The one-tap account of a chart with no liability account. 2200 is the starter
// chart's number for it; account numbers are unique, so a taken 2200 leaves it blank.
export function newSalesTaxAccount(accounts: readonly LiabilityAccount[]): {
    name: 'Sales tax payable'
    number: string
    type: 'other_current_liability'
    detail_type: 'sales_tax_payable'
} {
    const taken = accounts.some(account => account.number === '2200')
    return {
        name: 'Sales tax payable',
        number: taken ? '' : '2200',
        type: 'other_current_liability',
        detail_type: 'sales_tax_payable',
    }
}
