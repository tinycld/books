import { describe, expect, expectTypeOf, it } from 'vitest'
import {
    WRITE_OFF_IDS,
    WRITE_OFF_INVOICE_IDS,
    WRITE_OFF_INVOICE_PAYMENTS,
    WRITE_OFF_INVOICES,
    WRITE_OFF_SEED,
    WRITE_OFFS,
    type WriteOffInvoiceRecord,
    type WriteOffRecord,
} from '../tinycld/books/lib/write-off-fixture'
import type { BooksInvoices, BooksWriteOffs } from '../tinycld/books/types'

// Write-off spec §4: the fixture's rows hold to the rules of the data, so the reference
// route, the seed and the tests read consistent books.

const MAX_MEMO = 4000

function postedWrittenOff(invoiceId: string): number {
    return WRITE_OFFS.filter(row => row.invoice === invoiceId && row.status === 'posted').reduce(
        (sum, row) => sum + row.amount,
        0
    )
}

function paid(invoiceId: string): number {
    return WRITE_OFF_INVOICE_PAYMENTS.filter(row => row.invoice === invoiceId).reduce(
        (sum, row) => sum + row.amount,
        0
    )
}

function invoiceOf(id: string) {
    const row = WRITE_OFF_INVOICES.find(item => item.id === id)
    if (!row) throw new Error(`no fixture invoice ${id}`)
    return row
}

function writeOffOf(id: string) {
    const row = WRITE_OFFS.find(item => item.id === id)
    if (!row) throw new Error(`no fixture write-off ${id}`)
    return row
}

describe('write-off fixture: the types', () => {
    it('types the rows by the generated schema', () => {
        expectTypeOf<WriteOffRecord>().toEqualTypeOf<BooksWriteOffs>()
        expectTypeOf<WriteOffInvoiceRecord>().toEqualTypeOf<BooksInvoices>()
    })
})

describe('write-off fixture: the write-offs', () => {
    it('holds a posted write-off of a whole invoice that has no payment', () => {
        const row = writeOffOf(WRITE_OFF_IDS.whole)
        const inv = invoiceOf(row.invoice)
        expect(row.status).toBe('posted')
        expect(paid(inv.id)).toBe(0)
        expect(row.amount).toBe(inv.total)
    })

    it('holds a posted write-off of the rest of a partly paid invoice with sales tax', () => {
        const row = writeOffOf(WRITE_OFF_IDS.partly)
        const inv = invoiceOf(row.invoice)
        expect(row.status).toBe('posted')
        expect(inv.tax_total).toBeGreaterThan(0)
        expect(paid(inv.id)).toBeGreaterThan(0)
        expect(row.amount).toBe(inv.total - paid(inv.id))
    })

    it('holds a void write-off', () => {
        const row = writeOffOf(WRITE_OFF_IDS.voided)
        expect(row.status).toBe('void')
        expect(row.voided_by).not.toBe('')
        expect(row.voided_at).not.toBe('')
    })

    it('holds a write-off with a long reason, within the 4000-character limit', () => {
        const longest = Math.max(...WRITE_OFFS.map(row => row.memo.length))
        expect(longest).toBeGreaterThan(200)
        expect(longest).toBeLessThanOrEqual(MAX_MEMO)
    })
})

describe('write-off fixture: the invoices', () => {
    it.each(
        WRITE_OFF_INVOICES.map(inv => [inv.number, inv.id] as const)
    )('invoice %s: written_off is its posted write-offs, balance is total less payments less written_off', (_number, id) => {
        const inv = invoiceOf(id)
        expect(inv.written_off).toBe(postedWrittenOff(id))
        expect(inv.balance).toBe(inv.total - paid(id) - inv.written_off)
    })

    it('reopens the invoice whose only write-off is void', () => {
        const inv = invoiceOf(WRITE_OFF_INVOICE_IDS.reopened)
        expect(inv.written_off).toBe(0)
        expect(inv.balance).toBe(inv.total)
    })
})

describe('write-off fixture: the seed pair', () => {
    it('names an invoice and a write-off of the fixture, the write-off taking the whole total', () => {
        const inv = invoiceOf(WRITE_OFF_SEED.invoice)
        const row = writeOffOf(WRITE_OFF_SEED.writeOff)
        expect(row.invoice).toBe(inv.id)
        expect(row.status).toBe('posted')
        expect(row.amount).toBe(inv.total)
    })
})
