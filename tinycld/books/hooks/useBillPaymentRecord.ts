import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }
// One empty list for every render with no lines, so the memos over `lines` keep.
const NO_LINES: readonly never[] = []

/**
 * A bill payment by id (pay-bills spec §4.4) with the people who posted and voided it, its
 * vendor, the account it was paid from and the payment that replaced it, and its lines in
 * position order, each with its bill. An empty id reads nothing and is ready (not
 * loading). The lines are loading until every bill they name is in the store, so neither
 * the read view nor a correction starts from a line with no bill.
 */
export function useBillPaymentRecord(id: string) {
    const [paymentsCollection, linesCollection, usersCollection, vendorsCollection] = useStore(
        'books_bill_payments',
        'books_bill_payment_lines',
        'users',
        'books_vendors'
    )
    const [accountsCollection, billsCollection] = useStore('books_accounts', 'books_bills')
    const paymentQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ payment: paymentsCollection })
                .where(({ payment }) => eq(payment.id, id))
                .select(({ payment }) => ({
                    ...payment,
                    postedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, payment.posted_by))
                            .findOne()
                    ),
                    voidedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, payment.voided_by))
                            .findOne()
                    ),
                    vendorRow: materialize(
                        q
                            .from({ v: vendorsCollection })
                            .where(({ v }) => eq(v.id, payment.vendor))
                            .findOne()
                    ),
                    paidFromRow: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, payment.paid_from))
                            .findOne()
                    ),
                    replacedBy: materialize(
                        q
                            .from({ r: paymentsCollection })
                            .where(({ r }) => eq(r.id, payment.replaced_by))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.billPayment', id],
    })
    const linesQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.payment, id))
                .orderBy(({ line }) => line.position)
                .select(({ line }) => ({
                    ...line,
                    billRow: materialize(
                        q
                            .from({ bill: billsCollection })
                            .where(({ bill }) => eq(bill.id, line.bill))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.billPayment.lines', id],
    })
    const lines = id ? (linesQuery.data ?? NO_LINES) : NO_LINES
    const isError = id !== '' && (paymentQuery.isError || linesQuery.isError)
    const billsIn = lines.every(line => line.billRow !== undefined)
    const isReady = id === '' || (paymentQuery.isReady && linesQuery.isReady && billsIn)
    const recovery: LiveRecovery = isError
        ? {
              queries: [paymentQuery.collection, linesQuery.collection],
              sources: [paymentsCollection, linesCollection, billsCollection],
          }
        : NO_RECOVERY
    return {
        payment: id ? (paymentQuery.data ?? null) : null,
        lines,
        isLoading: !isReady && !isError,
        isError,
        recovery,
    }
}

export type BillPaymentRecord = ReturnType<typeof useBillPaymentRecord>
export type BillPaymentRow = NonNullable<BillPaymentRecord['payment']>
export type BillPaymentLineRow = BillPaymentRecord['lines'][number]
