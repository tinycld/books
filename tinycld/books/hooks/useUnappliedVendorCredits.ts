import { and, eq, gt } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// The credits of the given vendors (`vendor` is the vendor's id), by vendor name, then
// number (numeric order). Pure.
export function creditsOfVendors<T extends { vendor: string; vendorName: string; number: string }>(
    credits: readonly T[],
    vendorIds: ReadonlySet<string>
): T[] {
    return credits
        .filter(credit => vendorIds.has(credit.vendor))
        .sort(
            (a, b) =>
                a.vendorName.localeCompare(b.vendorName) ||
                a.number.localeCompare(b.number, undefined, { numeric: true })
        )
}

/**
 * The unapplied vendor credits of Pay Bills' notice (vendor credit spec §3.10, §4 Client
 * reads "Pay Bills notice"): one live query on `books_vendor_credits` where the status is
 * posted and the balance above zero, with the vendor's name through `materialize()`,
 * flattened in the query's `select`; then filtered to `vendorIds` (creditsOfVendors). A
 * credit whose vendor row is missing is dropped. The read reports its state and recovery,
 * which the screen merges into its one Retry.
 */
export function useUnappliedVendorCredits(vendorIds: ReadonlySet<string>) {
    const [creditsCollection, vendorsCollection] = useStore('books_vendor_credits', 'books_vendors')
    const query = useLiveQuery({
        query: q =>
            q
                .from({ credit: creditsCollection })
                .where(({ credit }) => and(eq(credit.status, 'posted'), gt(credit.balance, 0)))
                .select(({ credit }) => ({
                    id: credit.id,
                    number: credit.number,
                    vendor: credit.vendor,
                    balance: credit.balance,
                    currency: credit.currency,
                    vendorRow: materialize(
                        q
                            .from({ v: vendorsCollection })
                            .where(({ v }) => eq(v.id, credit.vendor))
                            .select(({ v }) => ({ name: v.display_name }))
                            .findOne()
                    ),
                })),
        queryKey: ['books.payBills.unappliedVendorCredits'],
    })
    const data = query.data
    const credits = useMemo(() => {
        const rows = (data ?? []).flatMap(({ vendorRow, ...credit }) =>
            vendorRow ? [{ ...credit, vendorName: vendorRow.name }] : []
        )
        return creditsOfVendors(rows, vendorIds)
    }, [data, vendorIds])
    const recovery: LiveRecovery = query.isError
        ? { queries: [query.collection], sources: [creditsCollection, vendorsCollection] }
        : NO_RECOVERY
    return { credits, isReady: query.isReady, isError: query.isError, recovery }
}

// One credit of the notice, as the query's `select` flattens it.
export type UnappliedVendorCredit = ReturnType<typeof useUnappliedVendorCredits>['credits'][number]
