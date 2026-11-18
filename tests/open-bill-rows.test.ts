import { describe, expect, it } from 'vitest'
import { openBillRowsOf } from '../tinycld/books/hooks/useOpenBills'
import type { BooksVendors } from '../tinycld/books/types'

// The open bills' rows (vendor credit spec §4 Client reads; pay-bills spec §4.4), derived
// from the open-bills query's rows by the pure `openBillRowsOf`: a given vendor always
// filters the rows (the apply dialog and the credit's notice), no vendor lists every
// vendor's (a new Pay Bills screen), and `replaces` adds a correction's rows as Pay Bills
// does today.

type QueryBill = Parameters<typeof openBillRowsOf>[0][number]

const PACIFIC = 'vendpacific0001'
const OFFICE = 'vendoffice00001'

function vendorRow(id: string, name: string) {
    return { id, display_name: name } as BooksVendors
}

// What the open-bills query returns: posted bills with a balance, each with its vendor.
// Dates come with PocketBase's time part.
function bill(
    id: string,
    vendor: string,
    name: string,
    fields: { number: string; due: string; total: number; open: number; ref?: string }
): QueryBill {
    return {
        id,
        number: fields.number,
        date: '2026-11-10 00:00:00.000Z',
        due_date: `${fields.due} 00:00:00.000Z`,
        total: fields.total,
        open: fields.open,
        vendor,
        ref: fields.ref ?? '',
        vendorRow: vendorRow(vendor, name),
    }
}

const PACIFIC_A = bill('billpacifica001', PACIFIC, 'Pacific Power', {
    number: '1003',
    due: '2026-11-20',
    total: 8_000,
    open: 5_000,
    ref: '88412',
})
const PACIFIC_B = bill('billpacificb001', PACIFIC, 'Pacific Power', {
    number: '1005',
    due: '2026-12-01',
    total: 10_000,
    open: 10_000,
})
const OFFICE_A = bill('billofficea0001', OFFICE, 'Office Supply World', {
    number: '1004',
    due: '2026-11-25',
    total: 3_000,
    open: 3_000,
})
const BILLS = [PACIFIC_A, OFFICE_A, PACIFIC_B]

function rowOf(source: QueryBill, party: string) {
    return {
        id: source.id,
        number: source.number,
        date: source.date.slice(0, 10),
        due_date: source.due_date.slice(0, 10),
        total: source.total,
        open: source.open,
        vendor: source.vendor,
        ref: source.ref,
        party,
    }
}

describe('openBillRowsOf', () => {
    it('with a vendor and no replaces lists only that vendor’s open bills', () => {
        expect(openBillRowsOf(BILLS, { vendor: PACIFIC, replaces: null })).toEqual([
            rowOf(PACIFIC_A, 'Pacific Power'),
            rowOf(PACIFIC_B, 'Pacific Power'),
        ])
        expect(openBillRowsOf(BILLS, { vendor: OFFICE, replaces: null })).toEqual([
            rowOf(OFFICE_A, 'Office Supply World'),
        ])
    })

    it('with no vendor lists every vendor’s open bills, days cut to ISO days', () => {
        expect(openBillRowsOf(BILLS, { vendor: null, replaces: null })).toEqual([
            rowOf(PACIFIC_A, 'Pacific Power'),
            rowOf(OFFICE_A, 'Office Supply World'),
            rowOf(PACIFIC_B, 'Pacific Power'),
        ])
    })

    it('drops a bill whose vendor row is missing', () => {
        const orphan = { ...PACIFIC_B, vendorRow: undefined }
        expect(openBillRowsOf([PACIFIC_A, orphan], { vendor: null, replaces: null })).toEqual([
            rowOf(PACIFIC_A, 'Pacific Power'),
        ])
    })

    it('with replaces adds the correction rows as today: the original’s amounts back on each bill', () => {
        // The payment being corrected paid $20.00 on bill 1003 (still open) and $40.00 on
        // bill 1002, paid off since (not in the open set).
        const paidOff = {
            id: 'billpaidoff0001',
            number: '1002',
            date: '2026-11-01 00:00:00.000Z',
            due_date: '2026-11-15 00:00:00.000Z',
            total: 4_000,
            balance: 0,
            vendor: PACIFIC,
            ref_no: 'R-77',
        }
        const lines = [
            { bill: PACIFIC_A.id, amount: 2_000, billRow: undefined },
            { bill: paidOff.id, amount: 4_000, billRow: paidOff },
        ]
        const rows = openBillRowsOf(BILLS, {
            vendor: PACIFIC,
            replaces: { vendorName: 'Pacific Power', lines },
        })
        // List order: due date, then number. Every row is the payment's vendor's.
        expect(rows).toEqual([
            {
                id: paidOff.id,
                number: '1002',
                date: '2026-11-01',
                due_date: '2026-11-15',
                total: 4_000,
                open: 4_000,
                vendor: PACIFIC,
                party: 'Pacific Power',
                ref: 'R-77',
            },
            { ...rowOf(PACIFIC_A, 'Pacific Power'), open: 7_000 },
            rowOf(PACIFIC_B, 'Pacific Power'),
        ])
    })
})
