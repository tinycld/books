import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import type { LiveRecovery } from '../lib/live-recovery'
import type { StartDocument } from '../lib/payment-start'
import type { PaymentScreenReads } from './usePaymentScreen'
import { useRefundAccounts } from './useRefundAccounts'
import { useVendorRefundRecord } from './useVendorRefundRecord'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// The vendor credit `?credit` names, which a new form ticks for its unapplied balance, as
// the shared start helpers read it (a credit falls due on no day; `ref` is the vendor's
// credit no.).
function useStartCredit(creditId: string) {
    const [creditsCollection] = useStore('books_vendor_credits')
    const query = useLiveQuery({
        query: q => {
            if (!creditId) return undefined
            return q
                .from({ credit: creditsCollection })
                .where(({ credit }) => eq(credit.id, creditId))
                .findOne()
        },
        queryKey: ['books.vendorRefund.startCredit', creditId],
    })
    const isError = !!creditId && query.isError
    const credit = creditId ? (query.data ?? null) : null
    const document: StartDocument | null = credit
        ? {
              id: credit.id,
              number: credit.number,
              date: credit.date,
              total: credit.total,
              balance: credit.balance,
              status: credit.status,
              party: credit.vendor,
              ref: credit.ref_no,
          }
        : null
    return {
        document,
        isReady: !creditId || query.isReady || isError,
        isError,
        recovery: isError
            ? { queries: [query.collection], sources: [creditsCollection] }
            : NO_RECOVERY,
    }
}

// The vendor's display name; '' while it loads or with no vendor.
function useVendorName(vendorId: string) {
    const [vendorsCollection] = useStore('books_vendors')
    const vendor = useRecord(vendorsCollection, vendorId)
    return { name: vendor.record?.display_name ?? '', isLoading: vendor.isLoading }
}

// The vendor refund's reads, which usePaymentScreen calls in a fixed order: the refund by
// id, the refund accounts, the start credit, the vendor's name.
export const VENDOR_REFUND_READS: PaymentScreenReads = {
    useRecord: useVendorRefundRecord,
    useAccounts: useRefundAccounts,
    useStartDocument: useStartCredit,
    usePartyName: useVendorName,
}
