import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * A payment by id with the people who posted and voided it and the payment that replaced
 * it, and its applications in position order, each with its invoice. An empty id reads
 * nothing and is ready. The applications are ready only once every invoice they name is
 * in the store, so a form never starts from an application with no open balance.
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
                    replacedBy: materialize(
                        q
                            .from({ r: paymentsCollection })
                            .where(({ r }) => eq(r.id, payment.replaced_by))
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
                .where(({ application }) => eq(application.payment, id))
                .orderBy(({ application }) => application.position)
                .select(({ application }) => ({
                    ...application,
                    invoiceRow: materialize(
                        q
                            .from({ invoice: invoicesCollection })
                            .where(({ invoice }) => eq(invoice.id, application.invoice))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.payment.applications', id],
    })
    const applications = applicationsQuery.data ?? []
    const isError = !!id && (paymentQuery.isError || applicationsQuery.isError)
    const invoicesIn = applications.every(application => application.invoiceRow !== undefined)
    const isReady =
        !id || (paymentQuery.isReady && applicationsQuery.isReady && invoicesIn) || isError
    const recovery: LiveRecovery = isError
        ? {
              queries: [paymentQuery.collection, applicationsQuery.collection],
              sources: [paymentsCollection, applicationsCollection, invoicesCollection],
          }
        : NO_RECOVERY
    return {
        payment: id ? (paymentQuery.data ?? null) : null,
        applications,
        isReady,
        isError,
        recovery,
    }
}

export type PaymentRecordRead = ReturnType<typeof usePaymentRecord>
export type PaymentRow = NonNullable<PaymentRecordRead['payment']>
export type PaymentApplicationRow = PaymentRecordRead['applications'][number]
