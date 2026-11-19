import { describe, expect, it } from 'vitest'
import {
    PURCHASE_LIST_BILL_LINES,
    PURCHASE_LIST_EXPENSE_LINES,
    PURCHASE_LIST_SEED,
    PURCHASE_LIST_VENDOR_CREDIT_LINES,
} from '../tinycld/books/lib/purchase-lists-fixture'
import { VENDORS } from '../tinycld/books/lib/vendor-form-fixture'

// The seed selection of the Expenses lists (checkpoint 1 "Seed decision"): the four drafts,
// the two posted bills and the posted vendor credit, for vendors no other spec totals.

const SEED_IDS = [
    'plbill00000draf',
    'plvc0000000draf',
    'plvr0000000draf',
    'plexp000000draf',
    'plbill000001057',
    'plbill000001054',
    'plvc00000000031',
]

// The day books-settings.spec.ts holds as the close date on the shared e2e database.
const CLOSE_DATE = '2026-06-30'

const vendorNamed = (name: string) => {
    const vendor = VENDORS.find(entry => entry.display_name.startsWith(name))
    if (vendor === undefined) throw new Error(`no fixture vendor ${name}`)
    return vendor.id
}

// Vendors whose documents other fixtures and specs read.
const FORBIDDEN_VENDORS = ['Willamette', 'Old Town Print Shop', 'Keystone', 'Greenline', 'Metro']

type SeedRow = {
    id: string
    vendor: string
    status: string
    number: string
    date: string
    due_date?: string
    memo?: string
    ref_no?: string
    reference_no?: string
}

// Read inside each test, so a missing seed fails that test and not the whole file.
function seededRows(): SeedRow[] {
    return [
        ...PURCHASE_LIST_SEED.bills,
        ...PURCHASE_LIST_SEED.expenses,
        ...PURCHASE_LIST_SEED.vendorCredits,
        ...PURCHASE_LIST_SEED.vendorRefunds,
    ]
}

// A line's amount: an account line's `amount`, a product line's `quantity` × `rate`.
type AmountLine = { kind: string; amount?: number; quantity?: number; rate?: number }
function lineAmount(line: AmountLine): number {
    if (line.kind === 'account') return line.amount ?? Number.NaN
    return (line.quantity ?? Number.NaN) * (line.rate ?? Number.NaN)
}

function lineSum(lines: readonly object[], parentField: string, parentId: string): number {
    return lines
        .filter(line => (line as Record<string, unknown>)[parentField] === parentId)
        .reduce((sum, line) => sum + lineAmount(line as AmountLine), 0)
}

describe('PURCHASE_LIST_SEED', () => {
    it('holds exactly the seven ids of the seed decision', () => {
        expect(
            seededRows()
                .map(row => row.id)
                .sort()
        ).toEqual([...SEED_IDS].sort())
    })

    it('holds the lines of the seeded documents only, filtered from the fixture lines', () => {
        const ids = new Set(SEED_IDS)
        expect(PURCHASE_LIST_SEED.billLines).toEqual(
            PURCHASE_LIST_BILL_LINES.filter(line => ids.has(line.bill))
        )
        expect(PURCHASE_LIST_SEED.expenseLines).toEqual(
            PURCHASE_LIST_EXPENSE_LINES.filter(line => ids.has(line.expense))
        )
        expect(PURCHASE_LIST_SEED.vendorCreditLines).toEqual(
            PURCHASE_LIST_VENDOR_CREDIT_LINES.filter(line => ids.has(line.vendor_credit))
        )
    })

    it('posts nothing for Willamette, Old Town Print Shop, Keystone, Greenline or Metro', () => {
        const forbidden = new Set(FORBIDDEN_VENDORS.map(vendorNamed))
        expect(forbidden.size).toBe(FORBIDDEN_VENDORS.length)
        expect(
            seededRows()
                .filter(row => forbidden.has(row.vendor))
                .map(row => row.id)
        ).toEqual([])
    })

    it('dates every seeded row after 2026-06-30', () => {
        const early = seededRows().flatMap(row =>
            [row.date, row.due_date ?? '']
                .filter(day => day !== '' && day <= CLOSE_DATE)
                .map(day => `${row.id} ${day}`)
        )
        expect(early).toEqual([])
    })

    it('gives every seeded row its own memo', () => {
        const memos = seededRows().map(row => row.memo ?? '')
        expect(memos.filter(memo => memo === '')).toEqual([])
        expect(new Set(memos).size).toBe(memos.length)
    })

    it('sums the lines of each seeded bill, expense and vendor credit to its total', () => {
        const sums = [
            ...PURCHASE_LIST_SEED.bills.map(row => ({
                id: row.id,
                total: row.total,
                lines: lineSum(PURCHASE_LIST_SEED.billLines, 'bill', row.id),
            })),
            ...PURCHASE_LIST_SEED.expenses.map(row => ({
                id: row.id,
                total: row.total,
                lines: lineSum(PURCHASE_LIST_SEED.expenseLines, 'expense', row.id),
            })),
            ...PURCHASE_LIST_SEED.vendorCredits.map(row => ({
                id: row.id,
                total: row.total,
                lines: lineSum(PURCHASE_LIST_SEED.vendorCreditLines, 'vendor_credit', row.id),
            })),
        ]
        expect(sums.length).toBe(6)
        for (const sum of sums) expect(sum.lines, sum.id).toBe(sum.total)
    })

    it('gives the four Northwest Paper Co. rows four different signed amounts', () => {
        const northwest = vendorNamed('Northwest Paper Co.')
        const signed = [
            ...PURCHASE_LIST_SEED.bills.map(row => ({ vendor: row.vendor, amount: row.total })),
            ...PURCHASE_LIST_SEED.expenses.map(row => ({ vendor: row.vendor, amount: row.total })),
            ...PURCHASE_LIST_SEED.vendorCredits.map(row => ({
                vendor: row.vendor,
                amount: -row.total,
            })),
            ...PURCHASE_LIST_SEED.vendorRefunds.map(row => ({
                vendor: row.vendor,
                amount: row.amount,
            })),
        ]
            .filter(row => row.vendor === northwest)
            .map(row => row.amount)
        expect(signed).toHaveLength(4)
        expect(new Set(signed).size).toBe(4)
    })

    it('puts the word "Northwest" in no number, reference or memo of a seeded row', () => {
        const texts = seededRows().flatMap(row => [
            row.number,
            row.ref_no ?? '',
            row.reference_no ?? '',
            row.memo ?? '',
        ])
        expect(texts.filter(text => text.toLowerCase().includes('northwest'))).toEqual([])
    })
})
