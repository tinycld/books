import { and, eq, ilike, inArray, or } from '@tanstack/db'
import { useLiveInfiniteQuery, useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import {
    type AdjustmentChip,
    type AdjustmentSort,
    adjustmentListFilter,
    BOOKS_MADE_KINDS,
} from '../lib/adjustment-list'
import { retryListQuery } from '../lib/list-query'
import { ID_ORDER, LIST_PAGE_SIZE, searchPieces } from '../lib/list-search'
import { usePagedListSource } from './useRecordList'

export type AdjustmentListSort = { key: AdjustmentSort; isAscending: boolean }

export type AdjustmentListFilters = {
    // The applied search (useListFilters' `listFilters.search`).
    search: string
    chip: AdjustmentChip
    madeByBooks: boolean
    sort: AdjustmentListSort
}

/**
 * One page of inventory adjustments at a time (inventory-adjust spec §3.5), filtered and
 * ordered by the server: the chip's statuses and the kinds (manual; with Made by Books also
 * opening and re-cost) and every piece of the search in the number or the memo, in the
 * `where`; the sort in `orderBy` (Date newest first by default; No. by the number's
 * sequence; Value change by `value_change`), then id. Each row carries its account and its
 * lines, each line with its item's name, by `materialize()`: the Items cell names the first
 * line's item and counts the others.
 */
export function useAdjustmentsQuery(filters: AdjustmentListFilters) {
    const [adjustmentsCollection, linesCollection, productsCollection, accountsCollection] =
        useStore(
            'books_inventory_adjustments',
            'books_inventory_adjustment_lines',
            'books_products',
            'books_accounts'
        )
    const { statuses, kinds } = adjustmentListFilter(filters.chip, filters.madeByBooks)
    const pieces = searchPieces(filters.search)
    const { sort } = filters
    const direction = sort.isAscending ? 'asc' : 'desc'
    const query = useLiveInfiniteQuery(
        q => {
            const filtered = q
                .from({ adjustment: adjustmentsCollection })
                .where(({ adjustment }) => {
                    const text = pieces.map(piece =>
                        or(
                            ilike(adjustment.number, `%${piece}%`),
                            ilike(adjustment.memo, `%${piece}%`)
                        )
                    )
                    return and(
                        inArray(adjustment.status, [...statuses]),
                        inArray(adjustment.kind, [...kinds]),
                        ...text
                    )
                })
            const sorted =
                sort.key === 'date'
                    ? filtered.orderBy(({ adjustment }) => adjustment.date, {
                          direction,
                          stringSort: 'lexical',
                      })
                    : filtered.orderBy(
                          ({ adjustment }) =>
                              sort.key === 'number' ? adjustment.sequence : adjustment.value_change,
                          { direction }
                      )
            return sorted
                .orderBy(({ adjustment }) => adjustment.id, ID_ORDER)
                .select(({ adjustment }) => ({
                    id: adjustment.id,
                    status: adjustment.status,
                    kind: adjustment.kind,
                    // The row menu offers Edit and Void only on an adjustment not replaced.
                    replaced_by: adjustment.replaced_by,
                    number: adjustment.number,
                    date: adjustment.date,
                    value_change: adjustment.value_change,
                    currency: adjustment.currency,
                    accountRow: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, adjustment.account))
                            .select(({ a }) => ({ number: a.number, name: a.name }))
                            .findOne()
                    ),
                    lines: materialize(
                        q
                            .from({ line: linesCollection })
                            .where(({ line }) => eq(line.adjustment, adjustment.id))
                            .select(({ line }) => ({
                                id: line.id,
                                position: line.position,
                                itemName: materialize(
                                    q
                                        .from({ p: productsCollection })
                                        .where(({ p }) => eq(p.id, line.product))
                                        .select(({ p }) => p.name)
                                        .findOne()
                                ),
                            }))
                    ),
                }))
        },
        {
            queryKey: [
                'books.inventory-adjustments.list',
                filters.search,
                filters.chip,
                filters.madeByBooks,
                sort.key,
                sort.isAscending,
            ],
            pageSize: LIST_PAGE_SIZE,
        }
    )
    const data = query.data
    // The first line by position names the Items cell; the store keeps no order of the
    // materialized lines.
    const rows = useMemo(
        () =>
            data.map(row => {
                const lines = [...(row.lines ?? [])].sort((a, b) => a.position - b.position)
                return { ...row, firstItemName: lines[0]?.itemName, lineCount: lines.length }
            }),
        [data]
    )
    // Whether any adjustment of the view's kinds exists decides "No inventory adjustments
    // yet" against no match: an opening adjustment does not count while Made by Books is
    // off. The kinds are in the key, so a toggle asks again.
    const kindsKey = kinds.join(',')
    const source = usePagedListSource(query, rows, {
        key: `books.inventory-adjustments.${kindsKey}`,
        oneRow: q =>
            q
                .from({ adjustment: adjustmentsCollection })
                .where(({ adjustment }) => inArray(adjustment.kind, [...kinds]))
                .orderBy(({ adjustment }) => adjustment.id, ID_ORDER)
                .limit(1),
    })
    // While the view is empty with Made by Books off, whether Books made an adjustment: the
    // list then keeps its toolbar, so the Made by Books chip stays reachable.
    const asksBooksMade = query.isReady && data.length === 0 && !filters.madeByBooks
    const booksMadeQuery = useLiveQuery({
        queryKey: ['books.inventory-adjustments.books-made', asksBooksMade],
        query: q =>
            asksBooksMade
                ? q
                      .from({ adjustment: adjustmentsCollection })
                      .where(({ adjustment }) => inArray(adjustment.kind, [...BOOKS_MADE_KINDS]))
                      .orderBy(({ adjustment }) => adjustment.id, ID_ORDER)
                      .limit(1)
                : undefined,
    })
    const hasBooksMade = asksBooksMade && (booksMadeQuery.data?.length ?? 0) > 0
    const retry = () => {
        source.retry()
        if (booksMadeQuery.isError) {
            retryListQuery([booksMadeQuery.collection], 'books.inventory-adjustments.books-made')
        }
    }
    return {
        ...source,
        isError: source.isError || booksMadeQuery.isError,
        hasBooksMade,
        retry,
    }
}

export type AdjustmentListRow = ReturnType<typeof useAdjustmentsQuery>['rows'][number]
