import {
    newRecordPath,
    type OpenRecord,
    openRecordFromPath,
    RECORD_DETAIL_SCREENS,
    type RecordRoute,
    recordPath,
} from './record-route'

export { navigationModeFor } from './record-route'

export const CUSTOMERS_PATH = 'books/customers'

export type CustomerRoute = RecordRoute

export type OpenCustomer = OpenRecord

// `params` (the page's `tab`) follow the id in the route's search params.
export function customerPath(id: string, params?: Record<string, string>): CustomerRoute {
    return recordPath(CUSTOMERS_PATH, id, params)
}

export function newCustomerPath(parentId?: string): CustomerRoute {
    return newRecordPath(CUSTOMERS_PATH, parentId ? { parent: parentId } : undefined)
}

export function openCustomerFromPath(pathname: string): OpenCustomer {
    return openRecordFromPath(CUSTOMERS_PATH, pathname)
}

export const CUSTOMER_DETAIL_SCREENS = RECORD_DETAIL_SCREENS
