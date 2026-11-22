import type { Transaction } from '@tanstack/react-db'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useState } from 'react'
import type { ListKind } from '../lib/document-list'
import { type PaymentCollectionName, voidWriteCollection } from '../lib/payment-read-actions'
import { writeRefusalText } from '../lib/refusal'
import { useVoidDocument } from './useVoidDocument'

// The list kind of each payment collection, so a name with no kind is a type error.
const PAYMENT_LIST_KINDS: Record<PaymentCollectionName, ListKind> = {
    books_payments: 'payment',
    books_bill_payments: 'bill_payment',
    books_vendor_refunds: 'vendor_refund',
}

// Void as a write to the read view's own collection (`voidWriteCollection`):
// `status: 'void'` (the server posts the reversing entry and opens the paid documents
// again), through the write the lists share (useVoidDocument).
function useVoidWrite(collection: PaymentCollectionName) {
    const voidWrite = useVoidDocument()
    const kind = PAYMENT_LIST_KINDS[voidWriteCollection(collection)]
    return (id: string) => voidWrite(kind, id)
}

/**
 * The Void dialog of a read view, over the write the caller gives: `markVoid(id)` returns
 * the transaction that writes the void. The dialog's open state lives on the read view,
 * which stays mounted while the optimistic void changes the record under it, so a refusal
 * (the close date) stays in the dialog with its text; a success closes it.
 *
 * The update is optimistic, so the record reads `void` (and Void is no longer offered)
 * while the write runs. The dialog stays visible through its own void because the mutation
 * reports `isPending` before the optimistic write runs: React Query sets the mutation
 * pending before it calls the mutationFn, and this hook reads that state in each render.
 */
export function useVoidDialogState(markVoid: (id: string) => Transaction) {
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

// The void of a payment read view (received payment, bill payment, vendor refund): ONE
// update of `status` to `void` on the read view's collection.
export function useVoidPayment(collection: PaymentCollectionName) {
    return useVoidDialogState(useVoidWrite(collection))
}
