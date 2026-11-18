import { coalesce, eq, isUndefined, not } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * A received payment by id, the record read the receive-payment screen passes to the
 * shared payment layer (another flow passes its own read of the same shape): the header
 * with its party (`customer`) and account (`deposit_to`) by role, the names of the people
 * who posted and voided it and the payment that replaced it, and its applications in
 * position order, each with its invoice's number, date, due date, total and open balance.
 * Every field is built in the queries' `.select()`. A line whose invoice is not in the
 * store yet has `isFiled` false. An empty id reads nothing and is ready. The lines are
 * ready only once every invoice they name is in the store, so a form never starts from a
 * line with no open balance.
 */
export function usePaymentRecord(id: string) {
    const [paymentsCollection, applicationsCollection, usersCollection, invoicesCollection] =
        useStore('books_payments', 'books_payment_applications', 'users', 'books_invoices')
    const paymentQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ payment: paymentsCollection })
                .where(({ payment }) => eq(payment.id, id))
                .select(({ payment }) => ({
                    id: payment.id,
                    number: payment.number,
                    status: payment.status,
                    date: payment.date,
                    payment_method: payment.payment_method,
                    reference_no: payment.reference_no,
                    amount: payment.amount,
                    memo: payment.memo,
                    entry: payment.entry,
                    replaces: payment.replaces,
                    party: payment.customer,
                    account: payment.deposit_to,
                    applied: payment.applied,
                    credited: payment.credited,
                    posted_at: payment.posted_at,
                    voided_at: payment.voided_at,
                    postedByName: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, payment.posted_by))
                            .select(({ u }) => u.name)
                            .findOne()
                    ),
                    voidedByName: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, payment.voided_by))
                            .select(({ u }) => u.name)
                            .findOne()
                    ),
                    replacement: materialize(
                        q
                            .from({ r: paymentsCollection })
                            .where(({ r }) => eq(r.id, payment.replaced_by))
                            .select(({ r }) => ({ id: r.id, number: r.number }))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.payment', id],
    })
    const applicationsQuery = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ application: applicationsCollection })
                .leftJoin({ invoice: invoicesCollection }, ({ application, invoice }) =>
                    eq(application.invoice, invoice.id)
                )
                .where(({ application }) => eq(application.payment, id))
                .orderBy(({ application }) => application.position)
                .select(({ application, invoice }) => ({
                    id: application.id,
                    document: application.invoice,
                    amount: application.amount,
                    position: application.position,
                    isFiled: not(isUndefined(invoice.id)),
                    number: coalesce(invoice.number, ''),
                    date: coalesce(invoice.date, ''),
                    dueDate: coalesce(invoice.due_date, ''),
                    total: coalesce(invoice.total, 0),
                    open: coalesce(invoice.balance, 0),
                    // An invoice has no vendor no.
                    ref: '',
                }))
        },
        queryKey: ['books.payment.applications', id],
    })
    const payment = id ? (paymentQuery.data ?? null) : null
    const lines = applicationsQuery.data ?? []
    const isError = !!id && (paymentQuery.isError || applicationsQuery.isError)
    const documentsIn = lines.every(line => line.isFiled)
    const isReady =
        !id || (paymentQuery.isReady && applicationsQuery.isReady && documentsIn) || isError
    const recovery: LiveRecovery = isError
        ? {
              queries: [paymentQuery.collection, applicationsQuery.collection],
              sources: [paymentsCollection, applicationsCollection, invoicesCollection],
          }
        : NO_RECOVERY
    return { payment, lines, isReady, isError, recovery }
}

// What a payment flow's record read gives: its header and lines, and the read's state.
export type PaymentRecordView = ReturnType<typeof usePaymentRecord>
export type PaymentRecordHeader = NonNullable<PaymentRecordView['payment']>
