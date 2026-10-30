import { CUSTOMERS_PATH } from '../lib/customer-route'
import { useRecordNavigation } from './useRecordNavigation'

export function useCustomerNavigation() {
    const nav = useRecordNavigation(CUSTOMERS_PATH)
    return {
        open: nav.open,
        openNew: (parentId?: string) => nav.openNew(parentId ? { parent: parentId } : undefined),
        leave: nav.leave,
    }
}
