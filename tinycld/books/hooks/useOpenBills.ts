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
import type { BooksBills, BooksVendors } from '../types'
import { mergeOutstanding, type OutstandingInvoice } from './useOutstandingInvoices'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

export type OpenBillsRead = { isReady: boolean; isError: boolean; recovery: LiveRecovery }

// A line of the payment a correction replaces, with its bill (useBillPaymentRecord).
export type ReplacedLine = {
    bill: string
    amount: number
    billRow?: Pick<
        BooksBills,
        'id' | 'number' | 'date' | 'due_date' | 'total' | 'balance' | 'vendor' | 'ref_no'
    >
}

export type ReplacedPayment = { vendorName: string; lines: readonly ReplacedLine[] }

export type OpenBillsInput = {
    // The only vendor listed: on `?replaces` the payment's (null until it is read), in the
    // apply dialog and its notice the credit's. null lists every vendor's bills (a new Pay
    // Bills screen).
    vendor: string | null
    // `?replaces`: the payment being corrected, its vendor's display name, and the lines
    // whose amounts it still holds (none once it is no longer posted). null or absent
    // elsewhere.
    replaces?: ReplacedPayment | null
    // false reads nothing and is ready with no rows (a view that can never show them).
    isEnabled?: boolean
}

const NO_LINES: readonly ReplacedLine[] = []
const NO_BILLS: readonly OpenBillQueryRow[] = []

// A bill as mergeOutstanding reads it: the vendor is its `party`, the bill no. its `ref`.
function outstandingOf(bill: NonNullable<ReplacedLine['billRow']>): OutstandingInvoice {
    return {
        id: bill.id,
        number: bill.number,
        date: bill.date,
        due_date: bill.due_date,
        total: bill.total,
        balance: bill.balance,
        party: bill.vendor,
        ref: bill.ref_no,
    }
}

/**
 * The listed rows of a correction (spec §3.3, §4.4): the vendor's open bills, then each
 * bill the original pays that the open set no longer holds (paid off since), merged by
 * bill id through receive-payment's mergeOutstanding, so a row's open amount is its
 * balance plus what the original paid on it. Pure.
 */
export function correctionRowsOf(
    open: readonly PayBillsRow[],
    lines: readonly ReplacedLine[],
    vendor: string,
    vendorName: string
): PayBillsRow[] {
    const openBills = open.map(row => ({
        id: row.id,
        number: row.number,
        date: row.date,
        due_date: row.due_date,
        total: row.total,
        balance: row.open,
        party: row.vendor,
        ref: row.ref,
    }))
    const stored = lines.flatMap(line => (line.billRow ? [outstandingOf(line.billRow)] : []))
    const extraOpen: Record<string, number> = {}
    for (const line of lines) extraOpen[line.bill] = (extraOpen[line.bill] ?? 0) + line.amount
    return mergeOutstanding(openBills, stored, vendor, extraOpen).map(row => ({
        ...row,
        vendor,
        party: vendorName,
        ref: row.ref ?? '',
    }))
}

// A row of the open-bills query: a posted bill with a balance, with its vendor's row
// (undefined when it is missing).
export type OpenBillQueryRow = Omit<PayBillsRow, 'party'> & {
    vendorRow: Pick<BooksVendors, 'display_name'> | undefined
}

/**
 * The open bills' rows (pay-bills spec §4.4, vendor credit spec §4): what the select
 * cannot express. A bill whose vendor row is missing is dropped (the useMailboxes
 * pattern), the vendor's name is lifted out of its row, and each date is cut to its ISO
 * day (TanStack DB has no substring function). A given vendor keeps only its bills; with
 * `replaces` the original's lines are merged in (`correctionRowsOf`). Pure.
 */
export function openBillRowsOf(
    bills: readonly OpenBillQueryRow[],
    input: { vendor: string | null; replaces: ReplacedPayment | null }
): PayBillsRow[] {
    const { vendor, replaces } = input
    const open = bills.flatMap(({ vendorRow, ...bill }) => {
        if (!vendorRow) return []
        if (vendor !== null && bill.vendor !== vendor) return []
        return [
            {
                ...bill,
                date: bill.date.slice(0, 10),
                due_date: bill.due_date.slice(0, 10),
                party: vendorRow.display_name,
            },
        ]
    })
    if (replaces === null || vendor === null) return open
    return correctionRowsOf(open, replaces.lines, vendor, replaces.vendorName)
}

/**
 * The open bills of Pay Bills (spec §4.4), of the apply dialog and of its notice (vendor
 * credit spec §3.9, §4): one query over the posted bills with a balance (and, with a
 * vendor, that vendor's), each with its vendor through `materialize()`, as `PayBillsRow`s
 * in list order (`sortPayBillsRows` sorts them for the view) through `openBillRowsOf`.
 * The read reports its own state and recovery, which the screen merges into one Retry.
 */
export function useOpenBills({ vendor, replaces = null, isEnabled = true }: OpenBillsInput) {
    const [billsCollection, vendorsCollection] = useStore('books_bills', 'books_vendors')
    // A given vendor lists its own bills only; a new Pay Bills screen lists every vendor's
    // and filters on the client (the Vendor filter is screen state). A correction whose
    // payment is not read yet (or does not exist) reads nothing and is ready, as does a
    // disabled read.
    const vendorId = vendor
    const isWaiting = !isEnabled || (replaces !== null && !vendor)
    const billsQuery = useLiveQuery({
        query: q => {
            if (isWaiting) return undefined
            return q
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
                }))
        },
        queryKey: ['books.payBills.openBills', vendorId ?? 'all', isWaiting],
    })

    // The memo reads the correction's parts, not its object, which the caller builds anew
    // on each render.
    const billData = isWaiting ? undefined : billsQuery.data
    const hasReplaces = replaces !== null
    const replacedLines = replaces?.lines ?? NO_LINES
    const vendorName = replaces?.vendorName ?? ''
    const rows = useMemo<PayBillsRow[]>(() => {
        const correction = hasReplaces ? { vendorName, lines: replacedLines } : null
        return openBillRowsOf(billData ?? NO_BILLS, { vendor: vendorId, replaces: correction })
    }, [billData, vendorId, hasReplaces, vendorName, replacedLines])

    const read: OpenBillsRead = {
        isReady: isWaiting || billsQuery.isReady,
        isError: !isWaiting && billsQuery.isError,
        recovery:
            !isWaiting && billsQuery.isError
                ? {
                      queries: [billsQuery.collection],
                      sources: [billsCollection, vendorsCollection],
                  }
                : NO_RECOVERY,
    }
    return { rows, read }
}

export type OpenBills = ReturnType<typeof useOpenBills>

/**
 * Pay Bills' Vendor filter options (spec §4.4): every vendor through one query, as
 * `payBillsVendorOptions` (the active vendors and every vendor with an open bill in
 * `rows`), with the read's state and recovery for the screen's one Retry.
 */
export function usePayBillsVendors(rows: readonly PayBillsRow[]) {
    const [vendorsCollection] = useStore('books_vendors')
    const vendorsQuery = useLiveQuery({
        query: q => q.from({ v: vendorsCollection }),
        queryKey: ['books.payBills.vendors'],
    })
    const vendorData = vendorsQuery.data
    const vendorOptions = useMemo<PayBillsVendorOption[]>(
        () =>
            payBillsVendorOptions(
                vendorData ?? [],
                rows.map(row => row.vendor)
            ),
        [vendorData, rows]
    )
    const read: OpenBillsRead = {
        isReady: vendorsQuery.isReady,
        isError: vendorsQuery.isError,
        recovery: vendorsQuery.isError
            ? { queries: [vendorsQuery.collection], sources: [vendorsCollection] }
            : NO_RECOVERY,
    }
    return { vendorOptions, read }
}
