import { eq } from '@tanstack/db'
import { useLiveInfiniteQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import { customerTreeRows } from '../lib/customer-tree'
import {
    hasListFilter,
    ID_ORDER,
    LIST_PAGE_SIZE,
    type ListFilters,
    listFilter,
    SORT_KEY_ORDER,
} from '../lib/list-search'
import { usePagedListSource } from './useRecordList'

// One page of customers at a time, filtered and ordered by the server. sort_key orders
// the tree (each customer followed by its sub-customers, server/sort_keys.go), so a page
// is a slice of the tree. A search keeps only matching customers; each row's parent is
// materialized, so a matching sub-customer shows under its parent even when the parent
// did not match.
export function useCustomersQuery(filters: ListFilters) {
    const [customersCollection] = useStore('books_customers')
    const query = useLiveInfiniteQuery(
        q => {
            const all = q.from({ customer: customersCollection })
            const shown = hasListFilter(filters)
                ? all.where(({ customer }) =>
                      listFilter(
                          {
                              isActive: eq(customer.inactive, false),
                              text: [
                                  customer.display_name,
                                  customer.company,
                                  customer.email,
                                  customer.phone,
                              ],
                          },
                          filters
                      )
                  )
                : all
            return shown
                .orderBy(({ customer }) => customer.sort_key, SORT_KEY_ORDER)
                .orderBy(({ customer }) => customer.id, ID_ORDER)
                .select(({ customer }) => ({
                    ...customer,
                    parentRow: materialize(
                        q
                            .from({ parent: customersCollection })
                            .where(({ parent }) => eq(parent.id, customer.parent))
                            .findOne()
                    ),
                }))
        },
        {
            queryKey: ['books.customers.list', filters.search, filters.showInactive],
            pageSize: LIST_PAGE_SIZE,
        }
    )
    const data = query.data
    const rows = useMemo(() => customerTreeRows(data), [data])
    return usePagedListSource(query, rows, {
        key: 'books.customers',
        oneRow: q =>
            q
                .from({ customer: customersCollection })
                .orderBy(({ customer }) => customer.id, ID_ORDER)
                .limit(1),
    })
}

export type CustomerRecord = ReturnType<typeof useCustomersQuery>['rows'][number]['party']
