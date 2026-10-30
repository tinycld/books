import { customerPartyRows } from '../lib/customer-tree'
import type { useCustomersQuery } from './useCustomersQuery'
import { useRecordList } from './useRecordList'

export function useCustomersList(source: ReturnType<typeof useCustomersQuery>) {
    return useRecordList(
        { records: source.customers, isReady: source.isReady, isError: source.isError },
        customerPartyRows
    )
}
