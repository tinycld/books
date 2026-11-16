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
import type { BooksBills } from '../types'
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

export type OpenBillsInput = {
    // `?replaces`: the payment's vendor, the only vendor listed; null until it is read.
    // Read only with `replaces`.
    vendor: string | null
    // `?replaces`: the payment being corrected, its vendor's display name, and the lines
    // whose amounts it still holds (none once it is no longer posted). null on a new screen.
    replaces: { vendorName: string; lines: readonly ReplacedLine[] } | null
}

const NO_LINES: readonly ReplacedLine[] = []

// A bill as mergeOutstanding reads it: the vendor stands in its `customer`.
function outstandingOf(bill: NonNullable<ReplacedLine['billRow']>): OutstandingInvoice {
    return {
        id: bill.id,
        number: bill.number,
        date: bill.date,
        due_date: bill.due_date,
        total: bill.total,
        balance: bill.balance,
        customer: bill.vendor,
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
    const refs = new Map<string, string>()
    const openBills = open.map(row => {
        refs.set(row.id, row.ref)
        return {
            id: row.id,
            number: row.number,
            date: row.date,
            due_date: row.due_date,
            total: row.total,
            balance: row.open,
            customer: row.vendor,
        }
    })
    const stored = lines.flatMap(line => {
        if (!line.billRow) return []
        refs.set(line.bill, refs.get(line.bill) ?? line.billRow.ref_no)
        return [outstandingOf(line.billRow)]
    })
    const extraOpen: Record<string, number> = {}
    for (const line of lines) extraOpen[line.bill] = (extraOpen[line.bill] ?? 0) + line.amount
    return mergeOutstanding(openBills, stored, vendor, extraOpen).map(row => ({
        ...row,
        vendor,
        party: vendorName,
        ref: refs.get(row.id) ?? '',
    }))
}

/**
 * The open bills of Pay Bills (spec §4.4): one query over the posted bills with a balance
 * (and, on `?replaces`, the payment's vendor), each with its vendor through
 * `materialize()`, as `PayBillsRow`s in list order (`sortPayBillsRows` sorts them for the
 * view). A bill whose vendor row is missing is dropped after the query (the useMailboxes
 * pattern). On `?replaces` the original's lines are merged in (`correctionRowsOf`). Also
 * the Vendor filter's options (`payBillsVendorOptions`: the active vendors and every
 * vendor with an open bill). Each read reports its own state and recovery, which the
 * screen merges into one Retry.
 */
export function useOpenBills({ vendor, replaces }: OpenBillsInput) {
    const [billsCollection, vendorsCollection] = useStore('books_bills', 'books_vendors')
    // A correction lists its own vendor's bills only; a new screen lists every vendor's and
    // filters on the client (the Vendor filter is screen state). A correction whose
    // payment is not read yet (or does not exist) reads nothing and is ready.
    const vendorId = replaces === null ? null : vendor
    const isWaiting = replaces !== null && !vendor
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
        queryKey: ['books.payBills.openBills', vendorId ?? 'all'],
    })
    const vendorsQuery = useLiveQuery({
        query: q => q.from({ v: vendorsCollection }),
        queryKey: ['books.payBills.vendors'],
    })

    // What the select cannot express: the drop of a bill whose vendor row is missing, the
    // vendor's name lifted out of its row, and the ISO day cut from each date (TanStack DB
    // has no substring function).
    const billData = isWaiting ? undefined : billsQuery.data
    const openRows = useMemo<PayBillsRow[]>(
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
    const replacedLines = replaces?.lines ?? NO_LINES
    const vendorName = replaces?.vendorName ?? ''
    const rows = useMemo<PayBillsRow[]>(
        () =>
            vendorId === null
                ? openRows
                : correctionRowsOf(openRows, replacedLines, vendorId, vendorName),
        [openRows, replacedLines, vendorId, vendorName]
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
