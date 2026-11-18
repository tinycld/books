import { describe, expect, it } from 'vitest'
import {
    SALES_LIST_CREDIT_MEMOS,
    SALES_LIST_ESTIMATES,
    SALES_LIST_INVOICES,
    SALES_LIST_PAYMENTS,
    SALES_LIST_SALES_RECEIPTS,
    SALES_LIST_SEED_DRAFTS,
} from '../tinycld/books/lib/sales-lists-fixture'

const ALL_ROWS = [
    ...SALES_LIST_INVOICES,
    ...SALES_LIST_ESTIMATES,
    ...SALES_LIST_SALES_RECEIPTS,
    ...SALES_LIST_PAYMENTS,
    ...SALES_LIST_CREDIT_MEMOS,
]

// The day books-settings.spec.ts holds as the close date on the shared e2e database.
const CLOSE_DATE = '2026-06-30'

function datesOf(row: object): string[] {
    const days = row as { date?: string; due_date?: string; expiration_date?: string }
    return [days.date, days.due_date, days.expiration_date].filter(
        (day): day is string => day !== undefined && day !== ''
    )
}

describe('sales lists fixture', () => {
    it('gives every row a 15-character id', () => {
        for (const row of ALL_ROWS) expect(row.id).toHaveLength(15)
    })

    it('dates every row after 2026-06-30', () => {
        const early = ALL_ROWS.flatMap(row =>
            datesOf(row)
                .filter(day => day <= CLOSE_DATE)
                .map(day => `${row.id} ${day}`)
        )
        expect(early).toEqual([])
    })

    it('SALES_LIST_SEED_DRAFTS holds only the draft rows of each kind', () => {
        const drafts = <T extends { status: string }>(rows: readonly T[]) =>
            rows.filter(row => row.status === 'draft')
        expect(SALES_LIST_SEED_DRAFTS).toEqual({
            invoices: drafts(SALES_LIST_INVOICES),
            salesReceipts: drafts(SALES_LIST_SALES_RECEIPTS),
            payments: drafts(SALES_LIST_PAYMENTS),
            creditMemos: drafts(SALES_LIST_CREDIT_MEMOS),
        })
        const all = [
            ...SALES_LIST_SEED_DRAFTS.invoices,
            ...SALES_LIST_SEED_DRAFTS.salesReceipts,
            ...SALES_LIST_SEED_DRAFTS.payments,
            ...SALES_LIST_SEED_DRAFTS.creditMemos,
        ]
        expect(all.length).toBeGreaterThan(0)
        for (const row of all) expect(row.status).toBe('draft')
    })
})
