import {
    and,
    type Collection,
    eq,
    gt,
    type InitialQueryBuilder,
    queryOnce,
    type UtilsRecord,
} from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useMemo } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'
import type { OutstandingRow } from '../lib/payment-allocation'
import {
    creditDatesOf,
    mergeRefundable,
    type RefundableCredit,
    type RefundStoredLine,
} from '../lib/refundable-credits'
import { VENDOR_REFUND_FLOW } from '../lib/vendor-refund-flow'
import type { BooksVendorCredits } from '../types'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// The stored lines of the vendor's own refund: a draft whose vendor changed lists only the
// new vendor's credits.
function storedOfVendor(stored: readonly RefundStoredLine[], vendorId: string) {
    return stored.filter(line => line.vendor === vendorId)
}

// The one query of a vendor's refundable credits: its posted vendor credits with an
// unapplied balance, oldest credit date first, then number. The live list and the one-time
// read of a vendor pick both run it.
function refundableCreditsQuery<K extends string | number, I extends object>(
    credits: Collection<BooksVendorCredits, K, UtilsRecord, never, I>,
    vendorId: string
) {
    return (q: InitialQueryBuilder) =>
        q
            .from({ credit: credits })
            .where(({ credit }) =>
                and(eq(credit.vendor, vendorId), eq(credit.status, 'posted'), gt(credit.balance, 0))
            )
            .orderBy(({ credit }) => credit.date)
            .orderBy(({ credit }) => credit.number)
            .select(({ credit }) => ({
                id: credit.id,
                number: credit.number,
                date: credit.date,
                total: credit.total,
                balance: credit.balance,
                ref_no: credit.ref_no,
            }))
}

/**
 * The vendor refund form's credits list (vendor refund spec §3.4): one query over the
 * vendor's posted vendor credits with an unapplied balance (`refundableCreditsQuery`, key
 * `books.vendorRefund.credits` with the vendor id), merged with the credits the stored
 * lines name (`mergeRefundable`). No vendor reads nothing and is ready. `creditDates` is
 * each listed credit's date, one object while the rows keep, for the schema's row-date
 * rule. A failed read recovers through `retry` or the screen's merged `recovery`.
 */
export function useRefundableCredits(vendorId: string, storedLines: readonly RefundStoredLine[]) {
    const [creditsCollection] = useStore('books_vendor_credits')
    const query = useLiveQuery({
        query: q => (vendorId ? refundableCreditsQuery(creditsCollection, vendorId)(q) : undefined),
        queryKey: ['books.vendorRefund.credits', vendorId],
    })
    const data = query.data
    const rows = useMemo(
        () => (vendorId ? mergeRefundable(data ?? [], storedOfVendor(storedLines, vendorId)) : []),
        [data, storedLines, vendorId]
    )
    const creditDates = useMemo(() => creditDatesOf(rows), [rows])
    const isError = !!vendorId && query.isError
    const isReady = !vendorId || query.isReady || isError
    const recovery: LiveRecovery = isError
        ? { queries: [query.collection], sources: [creditsCollection] }
        : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error(VENDOR_REFUND_FLOW.logContext, err),
        })
    }
    return { rows, creditDates, isLoading: !isReady, isReady, isError, recovery, retry }
}

/**
 * A one-time read of a vendor's credits list (useRefundableCredits' query), for the vendor
 * pick that places a typed amount in the event, not in an effect. A failed read rejects.
 */
export function useRefundableLoader(storedLines: readonly RefundStoredLine[]) {
    const [creditsCollection] = useStore('books_vendor_credits')
    return async (vendorId: string): Promise<OutstandingRow[]> => {
        const open: RefundableCredit[] = await queryOnce({
            query: refundableCreditsQuery(creditsCollection, vendorId),
        })
        return mergeRefundable(open, storedOfVendor(storedLines, vendorId))
    }
}
