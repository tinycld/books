import type { Transaction } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { PaymentMethodKey } from '../lib/payment-methods'

// A payment header as a save writes it, its party and account by role (vendor refund spec
// §3.1); each flow's writes map them to its own fields. Money in cents.
export type PaymentHeaderWrite = {
    party: string
    date: string
    payment_method: PaymentMethodKey | ''
    reference_no: string
    account: string
    amount: number
    memo: string
    // The posted payment a new header corrects ('' for none). Set at insert only: a saved
    // draft keeps the `replaces` it was saved with.
    replaces: string
}

// A line as a save writes it: `header` is the payment's id.
export type PaymentLineWrite = {
    id: string
    header: string
    document: string
    amount: number
    position: number
}

export type PaymentTransaction = Transaction<Record<string, unknown>>

/**
 * The seven writes a payment save makes over one flow's collections; each returns the
 * pbtsdb Transaction, which the save's generator yields. `insertHeader` writes a draft.
 */
export interface PaymentWrites {
    insertHeader: (id: string, header: PaymentHeaderWrite) => PaymentTransaction
    updateHeader: (id: string, header: Omit<PaymentHeaderWrite, 'replaces'>) => PaymentTransaction
    postHeader: (id: string) => PaymentTransaction
    deleteHeader: (id: string) => PaymentTransaction
    insertLine: (line: PaymentLineWrite) => PaymentTransaction
    updateLine: (id: string, change: { amount: number; position: number }) => PaymentTransaction
    deleteLine: (id: string) => PaymentTransaction
}

/**
 * The received payment's writes, over `books_payments` (party `customer`, account
 * `deposit_to`) and `books_payment_applications` (document `invoice`).
 */
export function usePaymentWrites(): PaymentWrites {
    const [paymentsCollection, applicationsCollection] = useStore(
        'books_payments',
        'books_payment_applications'
    )
    const fieldsOf = (header: Omit<PaymentHeaderWrite, 'replaces'>) => ({
        customer: header.party,
        date: header.date,
        payment_method: header.payment_method,
        reference_no: header.reference_no,
        deposit_to: header.account,
        amount: header.amount,
        memo: header.memo,
    })
    return {
        insertHeader: (id, header) =>
            paymentsCollection.insert({
                id,
                status: 'draft',
                replaces: header.replaces,
                ...fieldsOf(header),
            }),
        updateHeader: (id, header) =>
            paymentsCollection.update(id, draft => {
                Object.assign(draft, fieldsOf(header))
            }),
        postHeader: id =>
            paymentsCollection.update(id, draft => {
                draft.status = 'posted'
            }),
        deleteHeader: id => paymentsCollection.delete(id),
        insertLine: line =>
            applicationsCollection.insert({
                id: line.id,
                payment: line.header,
                invoice: line.document,
                amount: line.amount,
                position: line.position,
            }),
        updateLine: (id, change) =>
            applicationsCollection.update(id, draft => {
                draft.amount = change.amount
                draft.position = change.position
            }),
        deleteLine: id => applicationsCollection.delete(id),
    }
}
