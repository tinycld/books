import type { Transaction } from '@tanstack/db'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useState } from 'react'
import { type PaymentCollectionName, voidWriteCollection } from '../lib/payment-read-actions'
import { writeRefusalText } from '../lib/refusal'
import { useVoidDocument } from './useVoidDocument'

// Void as a write to the read view's own collection (`voidWriteCollection`):
// `status: 'void'` (the server posts the reversing entry and opens the paid documents
// again). One write per collection name, so a name with no write is a type error. A
// customer payment voids through the write the sales lists share (useVoidDocument).
function useVoidWrite(collection: PaymentCollectionName) {
    const [billPaymentsCollection, vendorRefundsCollection] = useStore(
        'books_bill_payments',
        'books_vendor_refunds'
    )
    const voidSales = useVoidDocument()
    const writes: Record<PaymentCollectionName, (id: string) => Transaction> = {
        books_payments: id => voidSales('payment', id),
        books_bill_payments: id =>
            billPaymentsCollection.update(id, draft => {
                draft.status = 'void'
            }),
        books_vendor_refunds: id =>
            vendorRefundsCollection.update(id, draft => {
                draft.status = 'void'
            }),
    }
    return writes[voidWriteCollection(collection)]
}

/**
 * The void of a payment read view (received payment, bill payment, vendor refund): ONE
 * update of `status` to `void` on the read view's collection. The dialog's open state lives
 * on the read view, which stays mounted while the optimistic void changes the payment
 * under it, so a refusal (the close date) stays in the dialog with its text; a success
 * closes it.
 *
 * The update is optimistic, so the payment reads `void` (and Void is no longer offered)
 * while the write runs. The dialog stays visible through its own void because the mutation
 * reports `isPending` before the optimistic write runs: React Query sets the mutation
 * pending before it calls the mutationFn, and this hook reads that state in each render.
 */
export function useVoidPayment(collection: PaymentCollectionName) {
    const markVoid = useVoidWrite(collection)
    const [isOpen, setOpen] = useState(false)
    const mutation = useMutation({
        mutationFn: function* (id: string) {
            yield markVoid(id)
        },
        onSuccess: () => setOpen(false),
        // The dialog shows the refusal; without this core reports it again as a toast.
        onError: () => {},
    })
    const confirm = (id: string) => mutation.mutate(id)
    const open = () => {
        mutation.reset()
        setOpen(true)
    }
    const close = () => setOpen(false)
    return {
        isOpen,
        open,
        close,
        isPending: mutation.isPending,
        errorMessage: mutation.error ? writeRefusalText(mutation.error) : null,
        confirm,
    }
}
