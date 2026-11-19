import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { materialize } from 'pbtsdb'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * One write-off by id (write-off spec §3.5, §4.4) in one live query: the row with the names
 * of the people who posted and voided it, its invoice's number, its customer's name and its
 * account (number, name), each through `materialize()`; the invoice and customer ids are
 * the row's own, so the links work before the related rows are filed. `isNotFound` is a finished
 * read with no row; a failed read hands its `recovery` to a merged Retry, and `retry`
 * recovers it alone.
 */
export function useWriteOffRecord(id: string) {
    const [
        writeOffsCollection,
        usersCollection,
        invoicesCollection,
        customersCollection,
        accountsCollection,
    ] = useStore('books_write_offs', 'users', 'books_invoices', 'books_customers', 'books_accounts')
    const isEnabled = id !== ''
    const query = useLiveQuery({
        query: q => {
            if (!isEnabled) return undefined
            return q
                .from({ w: writeOffsCollection })
                .where(({ w }) => eq(w.id, id))
                .select(({ w }) => ({
                    id: w.id,
                    number: w.number,
                    status: w.status,
                    date: w.date,
                    amount: w.amount,
                    memo: w.memo,
                    currency: w.currency,
                    entry: w.entry,
                    invoiceId: w.invoice,
                    customerId: w.customer,
                    posted_at: w.posted_at,
                    voided_at: w.voided_at,
                    postedByName: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, w.posted_by))
                            .select(({ u }) => u.name)
                            .findOne()
                    ),
                    voidedByName: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, w.voided_by))
                            .select(({ u }) => u.name)
                            .findOne()
                    ),
                    invoice: materialize(
                        q
                            .from({ i: invoicesCollection })
                            .where(({ i }) => eq(i.id, w.invoice))
                            .select(({ i }) => ({ number: i.number }))
                            .findOne()
                    ),
                    customer: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, w.customer))
                            .select(({ c }) => ({ name: c.display_name }))
                            .findOne()
                    ),
                    account: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, w.account))
                            .select(({ a }) => ({ number: a.number, name: a.name }))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.writeOff', id],
    })
    const record = isEnabled ? (query.data ?? null) : null
    const isError = isEnabled && query.isError
    const isLoading = isEnabled && !query.isReady && !isError
    const recovery: LiveRecovery =
        isError && query.collection
            ? {
                  queries: [query.collection],
                  sources: [
                      writeOffsCollection,
                      usersCollection,
                      invoicesCollection,
                      customersCollection,
                      accountsCollection,
                  ],
              }
            : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.writeOff', err, { operation: 'read' }),
        })
    }
    return {
        record,
        isLoading,
        isError,
        isNotFound: !isLoading && !isError && record === null,
        recovery,
        retry,
    }
}

export type WriteOffRecordView = NonNullable<ReturnType<typeof useWriteOffRecord>['record']>
