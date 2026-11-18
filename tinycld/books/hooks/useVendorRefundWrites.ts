import { useStore } from '@tinycld/core/lib/pocketbase'
import type { PaymentHeaderWrite, PaymentWrites } from './usePaymentWrites'

/**
 * The vendor refund's writes (vendor refund spec §3.6), over `books_vendor_refunds`
 * (party `vendor`, account `refunded_to`) and `books_vendor_refund_lines` (header
 * `refund`, document `vendor_credit`).
 */
export function useVendorRefundWrites(): PaymentWrites {
    const [refundsCollection, linesCollection] = useStore(
        'books_vendor_refunds',
        'books_vendor_refund_lines'
    )
    const fieldsOf = (header: Omit<PaymentHeaderWrite, 'replaces'>) => ({
        vendor: header.party,
        date: header.date,
        payment_method: header.payment_method,
        reference_no: header.reference_no,
        refunded_to: header.account,
        amount: header.amount,
        memo: header.memo,
    })
    return {
        insertHeader: (id, header) =>
            refundsCollection.insert({
                id,
                status: 'draft',
                replaces: header.replaces,
                ...fieldsOf(header),
            }),
        updateHeader: (id, header) =>
            refundsCollection.update(id, draft => {
                Object.assign(draft, fieldsOf(header))
            }),
        postHeader: id =>
            refundsCollection.update(id, draft => {
                draft.status = 'posted'
            }),
        deleteHeader: id => refundsCollection.delete(id),
        insertLine: line =>
            linesCollection.insert({
                id: line.id,
                refund: line.header,
                vendor_credit: line.document,
                amount: line.amount,
                position: line.position,
            }),
        updateLine: (id, change) =>
            linesCollection.update(id, draft => {
                draft.amount = change.amount
                draft.position = change.position
            }),
        deleteLine: id => linesCollection.delete(id),
    }
}
