import { and, eq, gt, lt } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { useMemo, useState } from 'react'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import type { RecipientRow } from '../lib/statement-recipients'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

type RecipientsInput = {
    // A real day: an invoice due before it, with an open balance, makes its customer
    // overdue. The screen passes the last real day of Statement date, so a text that is
    // no day yet (typing) does not re-key the overdue query.
    overdueDay: string
}

/**
 * The customers a run can make statements for (statements spec §4.1, Recipients): one live
 * query on `books_customers` with `materialize()` of its `books_party_balances` row (the
 * view's id is the customer's id) and of its parent, and a second on the posted invoices
 * with an open balance due before the statement date, reduced to the set of overdue
 * customers (as usePartyBalance reads overdue). The filter and the order run in JS
 * (lib/statement-recipients.ts): the balance is a view row, not a customer field.
 *
 * `isLoading` is the first load only: while a new statement date re-keys the overdue query,
 * the rows keep the overdue set of the last ready one (spec §3.10: the skeleton is the
 * first load's).
 */
export function useStatementRecipients({ overdueDay }: RecipientsInput) {
    const [customersCollection, balancesCollection, invoicesCollection] = useStore(
        'books_customers',
        'books_party_balances',
        'books_invoices'
    )
    const customersQuery = useLiveQuery({
        query: q =>
            q.from({ customer: customersCollection }).select(({ customer }) => ({
                id: customer.id,
                display_name: customer.display_name,
                parent: customer.parent,
                email: customer.email,
                inactive: customer.inactive,
                balanceRow: materialize(
                    q
                        .from({ balance: balancesCollection })
                        .where(({ balance }) => eq(balance.id, customer.id))
                        .findOne()
                ),
                parentRow: materialize(
                    q
                        .from({ parent: customersCollection })
                        .where(({ parent }) => eq(parent.id, customer.parent))
                        .findOne()
                ),
            })),
        queryKey: ['books.statements.recipients'],
    })
    const overdueQuery = useLiveQuery({
        query: q =>
            q
                .from({ invoice: invoicesCollection })
                .where(({ invoice }) =>
                    and(
                        eq(invoice.status, 'posted'),
                        gt(invoice.balance, 0),
                        lt(invoice.due_date, overdueDay)
                    )
                )
                .select(({ invoice }) => ({ id: invoice.id, customer: invoice.customer })),
        queryKey: ['books.statements.overdue', overdueDay],
    })

    // The overdue rows of the last ready query, kept from render to render (React's
    // "store information from previous renders" pattern; the snapshot is stable while
    // the query does not change, so this settles).
    const [readyOverdue, setReadyOverdue] = useState<typeof overdueQuery.data | null>(null)
    if (overdueQuery.isReady && overdueQuery.data !== readyOverdue) {
        setReadyOverdue(overdueQuery.data)
    }
    const overdue = overdueQuery.isReady ? overdueQuery.data : (readyOverdue ?? [])
    const customers = customersQuery.data

    const rows = useMemo<RecipientRow[]>(() => {
        const overdueIds = new Set((overdue ?? []).map(invoice => invoice.customer))
        return (customers ?? []).map(customer => ({
            customer: customer.id,
            name: customer.display_name,
            parentName: customer.parentRow?.display_name ?? '',
            email: customer.email,
            inactive: customer.inactive,
            balance: customer.balanceRow?.balance ?? 0,
            overdue: overdueIds.has(customer.id),
        }))
    }, [customers, overdue])

    const isError = customersQuery.isError || overdueQuery.isError
    const hasOverdue = overdueQuery.isReady || readyOverdue !== null
    const isLoading = !isError && !(customersQuery.isReady && hasOverdue)
    // Each part is non-empty only when its own query failed, so Retry restarts only it.
    const recovery = mergeRecoveries([
        customersQuery.isError
            ? {
                  queries: [customersQuery.collection],
                  sources: [customersCollection, balancesCollection],
              }
            : NO_RECOVERY,
        overdueQuery.isError
            ? { queries: [overdueQuery.collection], sources: [invoicesCollection] }
            : NO_RECOVERY,
    ])
    return { rows, isLoading, isError, recovery }
}
