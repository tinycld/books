import type { Transaction } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { ListKind } from '../lib/document-list'

/**
 * Void of a posted document of any list kind, shared by the read views and the lists: the
 * kind's collection writes `status: 'void'` (the server posts the reversing entry). An
 * estimate has no void, so it throws; a write-off is voided on its own page
 * (hooks/useVoidWriteOff.ts) and no list menu offers its void, so it throws too. Returns
 * the pbtsdb transaction for a `useMutation` generator to yield.
 */
export function useVoidDocument(): (kind: ListKind, id: string) => Transaction {
    const [invoices, receipts, payments, memos, refunds] = useStore(
        'books_invoices',
        'books_sales_receipts',
        'books_payments',
        'books_credit_memos',
        'books_refund_receipts'
    )
    const [bills, expenses, billPayments, vendorCredits, vendorRefunds] = useStore(
        'books_bills',
        'books_expenses',
        'books_bill_payments',
        'books_vendor_credits',
        'books_vendor_refunds'
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
            case 'bill':
                return bills.update(id, draft => {
                    draft.status = 'void'
                })
            case 'expense':
                return expenses.update(id, draft => {
                    draft.status = 'void'
                })
            case 'bill_payment':
                return billPayments.update(id, draft => {
                    draft.status = 'void'
                })
            case 'vendor_credit':
                return vendorCredits.update(id, draft => {
                    draft.status = 'void'
                })
            case 'vendor_refund':
                return vendorRefunds.update(id, draft => {
                    draft.status = 'void'
                })
            case 'estimate':
                throw new Error('an estimate never voids')
            case 'write_off':
                throw new Error('a write-off is voided on its own page')
        }
    }
}
