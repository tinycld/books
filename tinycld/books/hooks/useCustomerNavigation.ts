import { CUSTOMERS_PATH } from '../lib/customer-route'
import { useIsShowingRecord, useRecordNavigation } from './useRecordNavigation'

export function useCustomerNavigation() {
    const nav = useRecordNavigation(CUSTOMERS_PATH)
    return {
        open: nav.open,
        openNew: (parentId?: string) => nav.openNew(parentId ? { parent: parentId } : undefined),
        leave: nav.leave,
    }
}

export const useIsShowingCustomer = () => useIsShowingRecord(CUSTOMERS_PATH)
