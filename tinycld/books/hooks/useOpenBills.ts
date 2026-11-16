import { and, eq, gt } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'
import {
    type PayBillsRow,
    type PayBillsVendorOption,
    payBillsVendorOptions,
} from '../lib/pay-bills-rows'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

export type OpenBillsRead = { isReady: boolean; isError: boolean; recovery: LiveRecovery }

export type OpenBillsInput = {
    // `?replaces`: the payment's vendor, the only vendor listed. Read only with `replaces`.
    vendor: string | null
    // `?replaces`: the payment being corrected. Always null until checkpoint 3.
    replaces: string | null
}

/**
 * The open bills of Pay Bills (spec §4.4): one query over the posted bills with a balance
 * (and, on `?replaces`, the payment's vendor), each with its vendor through
 * `materialize()`, as `PayBillsRow`s in list order (`sortPayBillsRows` sorts them for the
 * view). A bill whose vendor row is missing is dropped after the query (the useMailboxes
 * pattern). Also the Vendor filter's options (`payBillsVendorOptions`: the active vendors
 * and every vendor with an open bill). Each read reports its own state and recovery, which
 * the screen merges into one Retry.
 */
export function useOpenBills({ vendor, replaces }: OpenBillsInput) {
    const [billsCollection, vendorsCollection] = useStore('books_bills', 'books_vendors')
    // A correction lists its own vendor's bills only; a new screen lists every vendor's and
    // filters on the client (the Vendor filter is screen state).
    const vendorId = replaces === null ? null : vendor
    const billsQuery = useLiveQuery({
        query: q =>
            q
                .from({ bill: billsCollection })
                .where(({ bill }) =>
                    vendorId
                        ? and(
                              eq(bill.status, 'posted'),
                              gt(bill.balance, 0),
                              eq(bill.vendor, vendorId)
                          )
                        : and(eq(bill.status, 'posted'), gt(bill.balance, 0))
                )
                .select(({ bill }) => ({
                    id: bill.id,
                    number: bill.number,
                    date: bill.date,
                    due_date: bill.due_date,
                    total: bill.total,
                    open: bill.balance,
                    vendor: bill.vendor,
                    ref: bill.ref_no,
                    vendorRow: materialize(
                        q
                            .from({ v: vendorsCollection })
                            .where(({ v }) => eq(v.id, bill.vendor))
                            .findOne()
                    ),
                })),
        queryKey: ['books.payBills.openBills', vendorId ?? 'all'],
    })
    const vendorsQuery = useLiveQuery({
        query: q => q.from({ v: vendorsCollection }),
        queryKey: ['books.payBills.vendors'],
    })

    // What the select cannot express: the drop of a bill whose vendor row is missing, the
    // vendor's name lifted out of its row, and the ISO day cut from each date (TanStack DB
    // has no substring function).
    const billData = billsQuery.data
    const rows = useMemo<PayBillsRow[]>(
        () =>
            (billData ?? []).flatMap(({ vendorRow, ...bill }) => {
                if (!vendorRow) return []
                return [
                    {
                        ...bill,
                        date: bill.date.slice(0, 10),
                        due_date: bill.due_date.slice(0, 10),
                        party: vendorRow.display_name,
                    },
                ]
            }),
        [billData]
    )

    const vendorData = vendorsQuery.data
    const vendorOptions = useMemo<PayBillsVendorOption[]>(
        () =>
            payBillsVendorOptions(
                vendorData ?? [],
                rows.map(row => row.vendor)
            ),
        [vendorData, rows]
    )

    const bills: OpenBillsRead = {
        isReady: billsQuery.isReady,
        isError: billsQuery.isError,
        recovery: billsQuery.isError
            ? { queries: [billsQuery.collection], sources: [billsCollection, vendorsCollection] }
            : NO_RECOVERY,
    }
    const vendors: OpenBillsRead = {
        isReady: vendorsQuery.isReady,
        isError: vendorsQuery.isError,
        recovery: vendorsQuery.isError
            ? { queries: [vendorsQuery.collection], sources: [vendorsCollection] }
            : NO_RECOVERY,
    }
    return { rows, vendorOptions, reads: [bills, vendors] as const }
}

export type OpenBills = ReturnType<typeof useOpenBills>
