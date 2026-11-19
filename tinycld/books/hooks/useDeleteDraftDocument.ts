import type { Transaction } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { TransactionKind } from '../lib/party-transactions'

/**
 * Delete of a sales document, shared by the forms and the sales lists: the kind's
 * collection `delete(id)`, one request (the server deletes the lines, and a payment's
 * applications, with the row). Returns the pbtsdb transaction for a `useMutation`
 * generator to yield.
 */
export function useDeleteDraftDocument(): (kind: TransactionKind, id: string) => Transaction {
    const [invoices, estimates, receipts, payments, memos, refunds] = useStore(
        'books_invoices',
        'books_estimates',
        'books_sales_receipts',
        'books_payments',
        'books_credit_memos',
        'books_refund_receipts'
    )
    return (kind, id) => {
        switch (kind) {
            case 'invoice':
                return invoices.delete(id)
            case 'estimate':
                return estimates.delete(id)
            case 'sales_receipt':
                return receipts.delete(id)
            case 'payment':
                return payments.delete(id)
            case 'credit_memo':
                return memos.delete(id)
            case 'refund_receipt':
                return refunds.delete(id)
        }
    }
}
