import { and, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import type { CreditApplicationKind } from '../lib/credit-application-kinds'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

interface CreditApplicationsInput {
    // A credit's applications (its Applied to block).
    credit?: string
    // A document's applications (its Payments block).
    document?: string
}

/**
 * The applications of one credit or of one document (vendor credit spec §4, apply credit
 * spec §4.4), oldest apply date first, then by creation, for the kind's collection: the
 * vendor credit's applications to bills, or the credit memo's to invoices. One live query
 * for each kind; the query of the kind not read returns `undefined` (plan decision 4). Each
 * reads the document's and the credit's numbers through `materialize()` and lifts them to
 * `documentNumber` / `creditNumber`; an application whose document or credit row is missing
 * is dropped (the useMailboxes pattern). With neither id the query is off and ready with no
 * rows. A failed read hands its `recovery` to the screen's one Retry.
 */
export function useCreditApplications(
    kind: CreditApplicationKind,
    { credit, document }: CreditApplicationsInput
) {
    const [
        vendorApplications,
        memoApplications,
        billsCollection,
        vendorCreditsCollection,
        invoicesCollection,
        creditMemosCollection,
    ] = useStore(
        'books_vendor_credit_applications',
        'books_credit_memo_applications',
        'books_bills',
        'books_vendor_credits',
        'books_invoices',
        'books_credit_memos'
    )
    const creditId = credit ?? ''
    const documentId = document ?? ''
    const hasId = creditId !== '' || documentId !== ''
    const isVendor = kind.key === 'vendor_credit'
    const isVendorEnabled = hasId && isVendor
    const isMemoEnabled = hasId && !isVendor

    const vendorQuery = useLiveQuery({
        query: q => {
            if (!isVendorEnabled) return undefined
            return q
                .from({ a: vendorApplications })
                .where(({ a }) => {
                    if (creditId !== '' && documentId !== '') {
                        return and(eq(a.vendor_credit, creditId), eq(a.bill, documentId))
                    }
                    if (creditId !== '') return eq(a.vendor_credit, creditId)
                    return eq(a.bill, documentId)
                })
                .orderBy(({ a }) => a.date)
                .orderBy(({ a }) => a.created)
                .select(({ a }) => ({
                    id: a.id,
                    amount: a.amount,
                    date: a.date,
                    documentId: a.bill,
                    creditId: a.vendor_credit,
                    documentRow: materialize(
                        q
                            .from({ b: billsCollection })
                            .where(({ b }) => eq(b.id, a.bill))
                            .select(({ b }) => ({ number: b.number }))
                            .findOne()
                    ),
                    creditRow: materialize(
                        q
                            .from({ c: vendorCreditsCollection })
                            .where(({ c }) => eq(c.id, a.vendor_credit))
                            .select(({ c }) => ({ number: c.number }))
                            .findOne()
                    ),
                }))
        },
        queryKey: [
            'books.creditApplications',
            'vendor_credit',
            creditId,
            documentId,
            isVendorEnabled,
        ],
    })

    const memoQuery = useLiveQuery({
        query: q => {
            if (!isMemoEnabled) return undefined
            return q
                .from({ a: memoApplications })
                .where(({ a }) => {
                    if (creditId !== '' && documentId !== '') {
                        return and(eq(a.credit_memo, creditId), eq(a.invoice, documentId))
                    }
                    if (creditId !== '') return eq(a.credit_memo, creditId)
                    return eq(a.invoice, documentId)
                })
                .orderBy(({ a }) => a.date)
                .orderBy(({ a }) => a.created)
                .select(({ a }) => ({
                    id: a.id,
                    amount: a.amount,
                    date: a.date,
                    documentId: a.invoice,
                    creditId: a.credit_memo,
                    documentRow: materialize(
                        q
                            .from({ i: invoicesCollection })
                            .where(({ i }) => eq(i.id, a.invoice))
                            .select(({ i }) => ({ number: i.number }))
                            .findOne()
                    ),
                    creditRow: materialize(
                        q
                            .from({ c: creditMemosCollection })
                            .where(({ c }) => eq(c.id, a.credit_memo))
                            .select(({ c }) => ({ number: c.number }))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.creditApplications', 'credit_memo', creditId, documentId, isMemoEnabled],
    })

    const query = isVendor ? vendorQuery : memoQuery
    const isEnabled = isVendor ? isVendorEnabled : isMemoEnabled
    const data = isEnabled ? query.data : undefined
    const applications = useMemo(
        () =>
            (data ?? []).flatMap(({ documentRow, creditRow, ...application }) => {
                if (!documentRow || !creditRow) return []
                return [
                    {
                        ...application,
                        date: application.date.slice(0, 10),
                        documentNumber: documentRow.number,
                        creditNumber: creditRow.number,
                    },
                ]
            }),
        [data]
    )
    const isError = isEnabled && query.isError
    const sources = isVendor
        ? [vendorApplications, billsCollection, vendorCreditsCollection]
        : [memoApplications, invoicesCollection, creditMemosCollection]
    const recovery: LiveRecovery =
        isError && query.collection ? { queries: [query.collection], sources } : NO_RECOVERY
    return {
        applications,
        isReady: !isEnabled || query.isReady,
        isError,
        recovery,
    }
}

export type CreditApplicationRow = ReturnType<typeof useCreditApplications>['applications'][number]
