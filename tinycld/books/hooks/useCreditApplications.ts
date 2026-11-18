import { and, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

interface CreditApplicationsInput {
    // A vendor credit's applications (its Applied to block).
    credit?: string
    // A bill's applications (its Payments block).
    bill?: string
}

/**
 * The credit applications of a vendor credit or of a bill (vendor credit spec §4 Client
 * reads), oldest apply date first, then by creation: one live query on
 * `books_vendor_credit_applications` with the bill's and the credit's numbers through
 * `materialize()`. The query narrows each related row to its number, and the numbers are
 * lifted to `billNumber` / `creditNumber` here; an application whose bill or credit row
 * is missing is dropped (the useMailboxes pattern). With neither id the query is off and
 * ready with no rows. A failed read hands its `recovery` to the screen's one Retry.
 */
export function useCreditApplications({ credit, bill }: CreditApplicationsInput) {
    const [applicationsCollection, billsCollection, creditsCollection] = useStore(
        'books_vendor_credit_applications',
        'books_bills',
        'books_vendor_credits'
    )
    const creditId = credit ?? ''
    const billId = bill ?? ''
    const isEnabled = creditId !== '' || billId !== ''
    const query = useLiveQuery({
        query: q => {
            if (!isEnabled) return undefined
            return q
                .from({ a: applicationsCollection })
                .where(({ a }) => {
                    if (creditId !== '' && billId !== '') {
                        return and(eq(a.vendor_credit, creditId), eq(a.bill, billId))
                    }
                    if (creditId !== '') return eq(a.vendor_credit, creditId)
                    return eq(a.bill, billId)
                })
                .orderBy(({ a }) => a.date)
                .orderBy(({ a }) => a.created)
                .select(({ a }) => ({
                    id: a.id,
                    amount: a.amount,
                    date: a.date,
                    billId: a.bill,
                    creditId: a.vendor_credit,
                    billRow: materialize(
                        q
                            .from({ b: billsCollection })
                            .where(({ b }) => eq(b.id, a.bill))
                            .select(({ b }) => ({ number: b.number }))
                            .findOne()
                    ),
                    creditRow: materialize(
                        q
                            .from({ c: creditsCollection })
                            .where(({ c }) => eq(c.id, a.vendor_credit))
                            .select(({ c }) => ({ number: c.number }))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.creditApplications', creditId, billId],
    })
    const data = isEnabled ? query.data : undefined
    const applications = useMemo(
        () =>
            (data ?? []).flatMap(({ billRow, creditRow, ...application }) => {
                if (!billRow || !creditRow) return []
                return [
                    {
                        ...application,
                        date: application.date.slice(0, 10),
                        billNumber: billRow.number,
                        creditNumber: creditRow.number,
                    },
                ]
            }),
        [data]
    )
    const isError = isEnabled && query.isError
    const recovery: LiveRecovery =
        isError && query.collection
            ? {
                  queries: [query.collection],
                  sources: [applicationsCollection, billsCollection, creditsCollection],
              }
            : NO_RECOVERY
    return {
        applications,
        isReady: !isEnabled || query.isReady,
        isError,
        recovery,
    }
}

export type CreditApplicationRow = ReturnType<typeof useCreditApplications>['applications'][number]
