import { describe, expect, it } from 'vitest'
import {
    filterPayBillsRows,
    hiddenPaidCount,
    type PayBillsRow,
    payBillsVendorOptions,
    sortPayBillsRows,
} from '../tinycld/books/lib/pay-bills-rows'
import type { PaymentEntry } from '../tinycld/books/lib/payment-values'

// The open-bills list of Pay Bills (spec §3.3): the Vendor and Due filters, a row with a
// refusal never hidden, the order and the header sorts, the paid rows a filter hides, and
// the Vendor filter's options.

const USD = 'USD'
const TODAY = '2026-11-15'

const PACIFIC = 'vendpacific0001'
const OFFICE = 'vendoffice00001'
const SUMMIT = 'vendsummit00001'

function row(
    id: string,
    number: string,
    vendor: string,
    party: string,
    due_date: string
): PayBillsRow {
    return {
        id,
        number,
        date: '2026-10-01',
        due_date,
        total: 10_000,
        open: 10_000,
        vendor,
        party,
        ref: '',
    }
}

// Due dates around today: yesterday, today, today + 7, today + 8.
const OVERDUE = row('billoverdue0001', '1004', PACIFIC, 'Pacific Power', '2026-11-14')
const DUE_TODAY = row('billduetoday001', '1006', OFFICE, 'Office Supply World', TODAY)
const IN_SEVEN = row('billinseven0001', '1008', SUMMIT, 'Summit Hardware', '2026-11-22')
const IN_EIGHT = row('billineight0001', '1002', PACIFIC, 'Pacific Power', '2026-11-23')

const ROWS = [IN_EIGHT, DUE_TODAY, OVERDUE, IN_SEVEN]

function ids(rows: readonly PayBillsRow[]) {
    return rows.map(r => r.id)
}

function filter(
    rows: readonly PayBillsRow[],
    opts: Partial<{ vendor: string; due: 'any' | 'overdue' | 'week'; keep: string[] }>
) {
    return filterPayBillsRows(rows, {
        vendor: opts.vendor ?? '',
        due: opts.due ?? 'any',
        today: TODAY,
        keep: opts.keep ?? [],
    })
}

describe('filterPayBillsRows', () => {
    it('keeps every row with no filter', () => {
        expect(ids(filter(ROWS, {}))).toEqual(ids(ROWS))
    })

    it('Overdue keeps the rows due before today only', () => {
        expect(ids(filter(ROWS, { due: 'overdue' }))).toEqual([OVERDUE.id])
    })

    it('Due in 7 days keeps the rows due on or before today + 7', () => {
        expect(ids(filter(ROWS, { due: 'week' }))).toEqual([DUE_TODAY.id, OVERDUE.id, IN_SEVEN.id])
    })

    it('a vendor keeps that vendor’s rows', () => {
        expect(ids(filter(ROWS, { vendor: PACIFIC }))).toEqual([IN_EIGHT.id, OVERDUE.id])
    })

    it('never hides a row with a refusal', () => {
        expect(ids(filter(ROWS, { due: 'overdue', keep: [IN_EIGHT.id] }))).toEqual([
            IN_EIGHT.id,
            OVERDUE.id,
        ])
        expect(ids(filter(ROWS, { vendor: OFFICE, keep: [IN_SEVEN.id] }))).toEqual([
            DUE_TODAY.id,
            IN_SEVEN.id,
        ])
    })

    // No 365-day window: a bill from years ago and one due years ahead are both listed.
    it('keeps rows dated years apart under every filter but Due', () => {
        const old = row('billold00000001', '0007', PACIFIC, 'Pacific Power', '2019-03-01')
        const far = row('billfar00000001', '9001', PACIFIC, 'Pacific Power', '2031-12-31')
        const rows = [
            { ...old, date: '2019-02-01' },
            { ...far, date: '2031-11-01' },
        ]
        expect(ids(filter(rows, {}))).toEqual([old.id, far.id])
        expect(ids(filter(rows, { vendor: PACIFIC }))).toEqual([old.id, far.id])
        expect(ids(filter(rows, { due: 'overdue' }))).toEqual([old.id])
    })
})

describe('sortPayBillsRows', () => {
    it('sorts by due date ascending, then bill number, by default', () => {
        const sameDay = row('billsameday0001', '1001', SUMMIT, 'Summit Hardware', TODAY)
        const sorted = sortPayBillsRows([...ROWS, sameDay], { column: 'due', descending: false })
        expect(ids(sorted)).toEqual([
            OVERDUE.id,
            sameDay.id,
            DUE_TODAY.id,
            IN_SEVEN.id,
            IN_EIGHT.id,
        ])
    })

    it('sorts by vendor display name, then due date', () => {
        const sorted = sortPayBillsRows(ROWS, { column: 'vendor', descending: false })
        expect(ids(sorted)).toEqual([DUE_TODAY.id, OVERDUE.id, IN_EIGHT.id, IN_SEVEN.id])
    })

    it('reverses the order when descending', () => {
        expect(ids(sortPayBillsRows(ROWS, { column: 'vendor', descending: true }))).toEqual([
            IN_SEVEN.id,
            IN_EIGHT.id,
            OVERDUE.id,
            DUE_TODAY.id,
        ])
        expect(ids(sortPayBillsRows(ROWS, { column: 'due', descending: true }))).toEqual([
            IN_EIGHT.id,
            IN_SEVEN.id,
            DUE_TODAY.id,
            OVERDUE.id,
        ])
    })

    it('leaves the rows it was given unchanged', () => {
        const given = [...ROWS]
        sortPayBillsRows(given, { column: 'vendor', descending: false })
        expect(ids(given)).toEqual(ids(ROWS))
    })
})

describe('hiddenPaidCount', () => {
    function paid(amount: string): PaymentEntry {
        return { amount, open: 10_000, number: '' }
    }

    it('counts the rows with a payment that the filters hide', () => {
        const shown = filter(ROWS, { due: 'overdue' })
        const payments = {
            [OVERDUE.id]: paid('50.00'),
            [IN_SEVEN.id]: paid('100.00'),
            [IN_EIGHT.id]: paid('20.00'),
        }
        expect(hiddenPaidCount(ROWS, shown, payments, USD)).toBe(2)
    })

    it('does not count a hidden row at zero, nor a shown paid row', () => {
        const shown = filter(ROWS, { due: 'overdue' })
        const payments = { [OVERDUE.id]: paid('50.00'), [IN_SEVEN.id]: paid('0.00') }
        expect(hiddenPaidCount(ROWS, shown, payments, USD)).toBe(0)
    })
})

describe('payBillsVendorOptions', () => {
    const VENDORS = [
        { id: PACIFIC, display_name: 'Pacific Power', inactive: false },
        { id: OFFICE, display_name: 'Office Supply World', inactive: true },
        { id: SUMMIT, display_name: 'Summit Hardware', inactive: true },
    ]

    it('lists the active vendors and an inactive vendor with an open bill, marked inactive', () => {
        const options = payBillsVendorOptions(VENDORS, [OFFICE])
        expect(options.map(o => ({ id: o.id, label: o.label }))).toEqual(
            expect.arrayContaining([
                { id: PACIFIC, label: 'Pacific Power' },
                { id: OFFICE, label: 'Office Supply World (inactive)' },
            ])
        )
    })

    it('leaves out an inactive vendor with no open bill', () => {
        const options = payBillsVendorOptions(VENDORS, [OFFICE])
        expect(options.map(o => o.id)).not.toContain(SUMMIT)
    })
})
