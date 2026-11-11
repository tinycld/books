import { describe, expect, expectTypeOf, it } from 'vitest'
import { CUSTOMER_IDS } from '../tinycld/books/lib/customer-form-fixture'
import {
    INVOICE_LINES,
    INVOICE_SEED_IDS,
    INVOICES,
    type InvoiceLineKind,
    type InvoiceLineRecord,
    type InvoiceRecord,
    type InvoiceStatus,
    type InvoiceTaxLineRecord,
} from '../tinycld/books/lib/invoice-form-fixture'
import { INVOICE_LINE_MAPPER } from '../tinycld/books/lib/invoice-lines'
import type { BooksInvoiceLines, BooksInvoices, BooksInvoiceTaxLines } from '../tinycld/books/types'

describe('generated invoice types', () => {
    it('name the statuses and line kinds of the migration', () => {
        // tsc fails here until the migration and the generated types exist.
        const s: BooksInvoices['status'] = 'void'
        const k: BooksInvoiceLines['kind'] = 'percent'
        expect([s, k]).toEqual(['void', 'percent'])
    })

    it('the fixture types are the generated types', () => {
        expectTypeOf<InvoiceRecord>().toEqualTypeOf<BooksInvoices>()
        expectTypeOf<InvoiceLineRecord>().toEqualTypeOf<BooksInvoiceLines>()
        expectTypeOf<InvoiceTaxLineRecord>().toEqualTypeOf<BooksInvoiceTaxLines>()
        expectTypeOf<InvoiceStatus>().toEqualTypeOf<BooksInvoices['status']>()
        expectTypeOf<InvoiceLineKind>().toEqualTypeOf<BooksInvoiceLines['kind']>()
    })
})

describe('INVOICE_LINES', () => {
    it('every line names an invoice of INVOICES', () => {
        const ids = new Set(INVOICES.map(row => row.id))
        const orphans = INVOICE_LINES.filter(line => !ids.has(line.invoice)).map(line => line.id)
        expect(orphans).toEqual([])
    })

    it('positions are dense per invoice, 0 first', () => {
        for (const invoice of INVOICES) {
            const positions = INVOICE_LINES.filter(line => line.invoice === invoice.id)
                .map(line => line.position)
                .sort((a, b) => a - b)
            expect(positions, invoice.id).toEqual(positions.map((_, index) => index))
        }
    })
})

describe('INVOICE_SEED_IDS', () => {
    const rows = INVOICE_SEED_IDS.map(id => INVOICES.find(row => row.id === id))

    it('names three posted invoices', () => {
        expect(INVOICE_SEED_IDS).toHaveLength(3)
        expect(rows.map(row => row?.status)).toEqual(['posted', 'posted', 'posted'])
    })

    it('are for distinct seeded customers', () => {
        const customers = rows.map(row => row?.customer)
        const seeded = new Set<string>(Object.values(CUSTOMER_IDS))
        expect(customers.every(id => id !== undefined && seeded.has(id))).toBe(true)
        expect(new Set(customers).size).toBe(3)
    })

    it('are dated after mid-2026, after the close date the e2e book holds', () => {
        for (const row of rows) {
            expect(row?.date && row.date >= '2026-07-01', row?.id).toBe(true)
        }
    })
})

describe('INVOICE_LINE_MAPPER', () => {
    it('round-trips rate, percent and quantity of every fixture line', () => {
        for (const line of INVOICE_LINES) {
            const row = { ...INVOICE_LINE_MAPPER.toRow(line), id: line.id }
            const written = INVOICE_LINE_MAPPER.toRecord(row, line.position)
            expect(
                {
                    rate: written.rate,
                    percent_ppm: written.percent_ppm,
                    quantity: written.quantity,
                },
                line.id
            ).toEqual({ rate: line.rate, percent_ppm: line.percent_ppm, quantity: line.quantity })
        }
    })

    it('reads the position of a line', () => {
        for (const line of INVOICE_LINES) {
            expect(INVOICE_LINE_MAPPER.positionOf(line)).toBe(line.position)
        }
    })
})
