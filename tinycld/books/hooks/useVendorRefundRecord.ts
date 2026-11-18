import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'
import type { PaymentRecordView } from './usePaymentRecord'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }
// One empty list for every render with no lines, so the memos over `lines` keep.
const NO_ROWS: readonly never[] = []

/**
 * A vendor refund by id, in the record shape the shared payment layer reads
 * (`PaymentRecordView`, as usePaymentRecord gives a received payment's): the header with
 * its party (`vendor`) and account (`refunded_to`) by role, the names of the people who
 * posted and voided it and the refund that replaced it, and its lines in position order,
 * each with its vendor credit's number, date, total, unapplied balance (`open`) and the
 * vendor's credit no. (`ref`). A refund places its whole amount on credits, so `applied`
 * is the amount and `credited` 0; a credit falls due on no day, so `dueDate` is ''. A line
 * whose credit is not in the store yet has `isFiled` false. An empty id reads nothing and
 * is ready. The lines are ready only once every credit they name is in the store.
 */
export function useVendorRefundRecord(id: string): PaymentRecordView {
    const [refundsCollection, linesCollection, usersCollection, creditsCollection] = useStore(
        'books_vendor_refunds',
        'books_vendor_refund_lines',
        'users',
        'books_vendor_credits'
    )
    const refundQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ refund: refundsCollection })
                .where(({ refund }) => eq(refund.id, id))
                .select(({ refund }) => ({
                    id: refund.id,
                    number: refund.number,
                    status: refund.status,
                    date: refund.date,
                    payment_method: refund.payment_method,
                    reference_no: refund.reference_no,
                    amount: refund.amount,
                    memo: refund.memo,
                    entry: refund.entry,
                    replaces: refund.replaces,
                    party: refund.vendor,
                    account: refund.refunded_to,
                    applied: refund.amount,
                    credited: 0,
                    posted_at: refund.posted_at,
                    voided_at: refund.voided_at,
                    postedByName: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, refund.posted_by))
                            .select(({ u }) => u.name)
                            .findOne()
                    ),
                    voidedByName: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, refund.voided_by))
                            .select(({ u }) => u.name)
                            .findOne()
                    ),
                    replacement: materialize(
                        q
                            .from({ r: refundsCollection })
                            .where(({ r }) => eq(r.id, refund.replaced_by))
                            .select(({ r }) => ({ id: r.id, number: r.number }))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.vendorRefund', id],
    })
    const linesQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.refund, id))
                .orderBy(({ line }) => line.position)
                .select(({ line }) => ({
                    id: line.id,
                    document: line.vendor_credit,
                    amount: line.amount,
                    position: line.position,
                    credit: materialize(
                        q
                            .from({ c: creditsCollection })
                            .where(({ c }) => eq(c.id, line.vendor_credit))
                            .select(({ c }) => ({
                                number: c.number,
                                date: c.date,
                                total: c.total,
                                balance: c.balance,
                                ref_no: c.ref_no,
                            }))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.vendorRefund.lines', id],
    })
    const rows = id ? (linesQuery.data ?? NO_ROWS) : NO_ROWS
    // The record shape's flat line: the credit's fields beside the line's.
    const lines = useMemo(
        () =>
            rows.map(({ credit, ...line }) => ({
                ...line,
                isFiled: credit !== undefined,
                number: credit?.number ?? '',
                date: credit?.date ?? '',
                dueDate: '',
                total: credit?.total ?? 0,
                open: credit?.balance ?? 0,
                ref: credit?.ref_no ?? '',
            })),
        [rows]
    )
    const refund = id ? (refundQuery.data ?? null) : null
    const isError = !!id && (refundQuery.isError || linesQuery.isError)
    const creditsIn = lines.every(line => line.isFiled)
    const isReady = !id || (refundQuery.isReady && linesQuery.isReady && creditsIn) || isError
    const recovery: LiveRecovery = isError
        ? {
              queries: [refundQuery.collection, linesQuery.collection],
              sources: [refundsCollection, linesCollection, creditsCollection],
          }
        : NO_RECOVERY
    return { payment: refund, lines, isReady, isError, recovery }
}
