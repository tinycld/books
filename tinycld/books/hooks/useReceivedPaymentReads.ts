import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import type { LiveRecovery } from '../lib/live-recovery'
import type { StartDocument } from '../lib/payment-start'
import { useDepositAccounts } from './useDepositAccounts'
import { usePaymentRecord } from './usePaymentRecord'
import type { PaymentScreenReads } from './usePaymentScreen'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// The invoice `?invoice` names, which a new form ticks for its open balance, as the
// shared start helpers read it.
function useStartInvoice(invoiceId: string) {
    const [invoicesCollection] = useStore('books_invoices')
    const query = useLiveQuery({
        query: q => {
            if (!invoiceId) return undefined
            return q
                .from({ invoice: invoicesCollection })
                .where(({ invoice }) => eq(invoice.id, invoiceId))
                .findOne()
        },
        queryKey: ['books.payment.startInvoice', invoiceId],
    })
    const isError = !!invoiceId && query.isError
    const invoice = invoiceId ? (query.data ?? null) : null
    const document: StartDocument | null = invoice
        ? {
              id: invoice.id,
              number: invoice.number,
              date: invoice.date,
              dueDate: invoice.due_date,
              total: invoice.total,
              balance: invoice.balance,
              status: invoice.status,
              party: invoice.customer,
          }
        : null
    return {
        document,
        isReady: !invoiceId || query.isReady || isError,
        isError,
        recovery: isError
            ? { queries: [query.collection], sources: [invoicesCollection] }
            : NO_RECOVERY,
    }
}

// The customer's display name; '' while it loads or with no customer.
function useCustomerName(customerId: string) {
    const [customersCollection] = useStore('books_customers')
    const customer = useRecord(customersCollection, customerId)
    return { name: customer.record?.display_name ?? '', isLoading: customer.isLoading }
}

// The received payment's reads, which usePaymentScreen calls in a fixed order: the record
// by id, the deposit accounts, the start invoice, the customer's name.
export const RECEIVED_PAYMENT_READS: PaymentScreenReads = {
    useRecord: usePaymentRecord,
    useAccounts: useDepositAccounts,
    useStartDocument: useStartInvoice,
    usePartyName: useCustomerName,
}
