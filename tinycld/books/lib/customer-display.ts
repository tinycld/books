import type { TreeCustomer } from './customer-tree'
import {
    PARTY_COLUMNS,
    PARTY_ROW_HEIGHT,
    PARTY_TABLE_MIN_WIDTH,
    type PartyListCopy,
    partyCardHeight,
} from './party-list'
import { recordTitle } from './record-display'

export { companyLine, isShownLine } from './party-list'

export function customerLabel(
    customer: Pick<TreeCustomer, 'display_name'>,
    parent?: Pick<TreeCustomer, 'display_name'>
): string {
    if (!parent) return customer.display_name
    return `${parent.display_name} : ${customer.display_name}`
}

export function customerCardHeight(customer: TreeCustomer, fontScale = 1): number {
    return partyCardHeight(customer, fontScale)
}

export const CUSTOMER_INDENT = 24

export const CUSTOMER_COLUMNS = PARTY_COLUMNS

export const CUSTOMERS_TABLE_MIN_WIDTH = PARTY_TABLE_MIN_WIDTH

export const CUSTOMER_ROW_HEIGHT = PARTY_ROW_HEIGHT

export function customersEmptyHint(canWrite: boolean): string {
    if (canWrite) return 'Add the people and companies you sell to.'
    return 'Customers appear here once a bookkeeper adds them.'
}

export function customerListCopy(canWrite: boolean): PartyListCopy {
    return {
        title: 'Customers',
        singular: 'customer',
        plural: 'customers',
        searchPlaceholder: 'Search customers',
        emptyHint: customersEmptyHint(canWrite),
    }
}

export function customerTitle({
    mode,
    isSubCustomer,
    canWrite,
}: {
    mode: 'new' | 'edit'
    isSubCustomer: boolean
    canWrite: boolean
}): string {
    if (canWrite && mode === 'new' && isSubCustomer) return 'New sub-customer'
    return recordTitle('customer', { mode, canWrite })
}

export { recordFooter as customerFooter } from './record-display'
