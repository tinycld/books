import { and, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { useEffect } from 'react'
import type { DepositRead } from '../lib/deposit'

/**
 * The posted deposit that holds a document's entry (bank deposit spec §3.10): one live query
 * on `books_deposit_items` where `entry` is the id and `posted` is true (the server sets
 * `posted` while the item's deposit is posted), with the deposit's number through
 * `materialize()`. `deposit` is `{ id, number }`, or null when no posted deposit holds the
 * entry. An item whose deposit row is not in the store yet is not ready, so the notice never
 * draws "In Deposit " with no number. With no id the query is off and ready with no deposit.
 * A failed read is logged: the read view then offers Edit and Void, and the server's
 * deposited-item guard refuses them.
 */
export function useDepositOf(entryId: string): DepositRead {
    const [itemsCollection, depositsCollection] = useStore('books_deposit_items', 'books_deposits')
    const isEnabled = entryId !== ''
    const query = useLiveQuery({
        query: q => {
            if (!isEnabled) return undefined
            return q
                .from({ item: itemsCollection })
                .where(({ item }) => and(eq(item.entry, entryId), eq(item.posted, true)))
                .select(({ item }) => ({
                    id: item.deposit,
                    number: materialize(
                        q
                            .from({ d: depositsCollection })
                            .where(({ d }) => eq(d.id, item.deposit))
                            .select(({ d }) => d.number)
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.deposit.of', entryId],
    })
    const isError = isEnabled && query.isError
    useEffect(() => {
        if (isError)
            log.warn('books.deposit', 'could not read the deposit of an entry', { entryId })
    }, [isError, entryId])
    const held = isEnabled ? query.data : undefined
    const number = held?.number
    if (!isEnabled) return { isReady: true, isError: false, deposit: null }
    if (isError) return { isReady: false, isError: true, deposit: null }
    if (!held) return { isReady: query.isReady, isError: false, deposit: null }
    if (number === undefined) return { isReady: false, isError: false, deposit: null }
    return { isReady: true, isError: false, deposit: { id: held.id, number } }
}
