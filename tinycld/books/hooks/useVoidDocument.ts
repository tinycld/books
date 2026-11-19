import type { Transaction } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { TransactionKind } from '../lib/party-transactions'

/**
 * Void of a posted sales document, shared by the read views and the sales lists: the
 * kind's collection writes `status: 'void'` (the server posts the reversing entry). An
 * estimate has no void, so it throws. Returns the pbtsdb transaction for a `useMutation`
 * generator to yield.
 */
export function useVoidDocument(): (kind: TransactionKind, id: string) => Transaction {
    const [invoices, receipts, payments, memos, refunds] = useStore(
        'books_invoices',
        'books_sales_receipts',
        'books_payments',
        'books_credit_memos',
        'books_refund_receipts'
    )
    return (kind, id) => {
        switch (kind) {
            case 'invoice':
                return invoices.update(id, draft => {
                    draft.status = 'void'
                })
            case 'sales_receipt':
                return receipts.update(id, draft => {
                    draft.status = 'void'
                })
            case 'payment':
                return payments.update(id, draft => {
                    draft.status = 'void'
                })
            case 'credit_memo':
                return memos.update(id, draft => {
                    draft.status = 'void'
                })
            case 'refund_receipt':
                return refunds.update(id, draft => {
                    draft.status = 'void'
                })
            case 'estimate':
                throw new Error('an estimate never voids')
        }
    }
}
