import { inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { DocumentListRow } from '../lib/document-list'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// The ids a kind of category names, sorted and unique, so the query key is stable.
function categoryIds(rows: readonly DocumentListRow[], kind: 'account' | 'product'): string[] {
    const ids = new Set<string>()
    for (const row of rows) {
        if (row.category.kind === kind) ids.add(row.category.id)
    }
    return [...ids].sort()
}

/**
 * The names the Category column of the rows on screen reads (spec
 * docs/specs/purchase-lists-design.md §4 "Category"): one live query over `books_accounts`
 * and one over `books_products` for the ids of the rows' categories (`inArray`). A query
 * with no id returns `undefined` and sends no request. A name not loaded (yet) is absent
 * from its map, and `categoryText` draws "—" for it. `isError` is true while a read of
 * the names failed; `recovery` holds each failed read (empty while none failed) with its
 * `onError`.
 */
export function usePurchaseCategories(rows: readonly DocumentListRow[]) {
    const [accountsCollection, productsCollection] = useStore('books_accounts', 'books_products')
    const accountIds = categoryIds(rows, 'account')
    const productIds = categoryIds(rows, 'product')

    const accountsQuery = useLiveQuery({
        query: q => {
            if (accountIds.length === 0) return undefined
            return q
                .from({ account: accountsCollection })
                .where(({ account }) => inArray(account.id, accountIds))
                .select(({ account }) => ({ id: account.id, name: account.name }))
        },
        queryKey: ['books.purchase-lists.category-accounts', accountIds.join(',')],
    })
    const productsQuery = useLiveQuery({
        query: q => {
            if (productIds.length === 0) return undefined
            return q
                .from({ product: productsCollection })
                .where(({ product }) => inArray(product.id, productIds))
                .select(({ product }) => ({ id: product.id, name: product.name }))
        },
        queryKey: ['books.purchase-lists.category-products', productIds.join(',')],
    })

    const accounts = new Map((accountsQuery.data ?? []).map(row => [row.id, row.name]))
    const products = new Map((productsQuery.data ?? []).map(row => [row.id, row.name]))
    const accountsFailed = accountIds.length > 0 && accountsQuery.isError
    const productsFailed = productIds.length > 0 && productsQuery.isError
    const failed = mergeRecoveries([
        accountsFailed
            ? { queries: [accountsQuery.collection], sources: [accountsCollection] }
            : NO_RECOVERY,
        productsFailed
            ? { queries: [productsQuery.collection], sources: [productsCollection] }
            : NO_RECOVERY,
    ])
    // Whole for a `recoverLiveQueries` call of its own; a screen with other reads merges it
    // into its one call (`mergeRecoveries` reads its queries and sources).
    const recovery = {
        ...failed,
        onError: (err: unknown) => log.warn('books.purchase-lists', 'retry failed', { err }),
    }

    return { accounts, products, isError: accountsFailed || productsFailed, recovery }
}
