import { describe, expect, it } from 'vitest'
import { documentTotals } from '../tinycld/books/lib/document-lines'
import { bigFigureText } from '../tinycld/books/lib/document-messages'
import { maxLineAmount } from '../tinycld/books/lib/money-text'
import {
    ESTIMATE_KIND,
    INVOICE_KIND,
    SALES_RECEIPT_KIND,
} from '../tinycld/books/lib/sales-document-kinds'

// The invoice kind of the shared sales document layer (plan Decisions "TS kind names").
describe('INVOICE_KIND', () => {
    it("names the invoice's help topic", () => {
        expect(INVOICE_KIND.helpTopic).toBe('books:invoices')
    })

    it('names a posted PDF by its number and a draft PDF as a draft', () => {
        expect(INVOICE_KIND.pdfStem('1001')).toBe('invoice-1001')
        expect(INVOICE_KIND.pdfStem('')).toBe('draft-invoice')
    })
})

// The sales receipt kind (plan Decisions "TS kind names", spec §3.2, §3.3).
describe('SALES_RECEIPT_KIND', () => {
    it('groups its keys under "Sales receipt" and opens its own help topic', () => {
        expect(SALES_RECEIPT_KIND.shortcutGroup).toBe('Sales receipt')
        expect(SALES_RECEIPT_KIND.helpTopic).toBe('books:sales-receipts')
    })

    it('shows Amount received as the big figure and the last totals row', () => {
        expect(SALES_RECEIPT_KIND.figure.label).toBe('Amount received')
        expect(SALES_RECEIPT_KIND.lastTotal?.label).toBe('Amount received')
    })

    it('names a posted PDF by its number and a draft PDF as a draft', () => {
        expect(SALES_RECEIPT_KIND.pdfStem('1004')).toBe('sales-receipt-1004')
        expect(SALES_RECEIPT_KIND.pdfStem('')).toBe('draft-sales-receipt')
    })

    it('makes the customer optional and splits the band at Payment method', () => {
        expect(SALES_RECEIPT_KIND.customerRequired).toBe(false)
        expect(SALES_RECEIPT_KIND.bandSplitAt).toBe('payment_method')
    })
})

// Each kind's lifecycle (spec §3.1): the invoice and the sales receipt post; the
// estimate is a quote.
describe('lifecycle', () => {
    it('is posting on the invoice and the sales receipt', () => {
        expect(INVOICE_KIND.lifecycle).toBe('posting')
        expect(SALES_RECEIPT_KIND.lifecycle).toBe('posting')
    })
})

// The estimate kind (plan Decisions "TS names", spec §3.2, §3.3, §3.4, §3.9).
describe('ESTIMATE_KIND', () => {
    it('is a quote that groups its keys under "Estimate" and opens its own help topic', () => {
        expect(ESTIMATE_KIND.lifecycle).toBe('quote')
        expect(ESTIMATE_KIND.shortcutGroup).toBe('Estimate')
        expect(ESTIMATE_KIND.helpTopic).toBe('books:estimates')
    })

    it('shows Total as the big figure and draws no last totals row', () => {
        expect(ESTIMATE_KIND.figure.label).toBe('Total')
        expect(ESTIMATE_KIND.lastTotal).toBeNull()
    })

    it('splits the band at Status', () => {
        expect(ESTIMATE_KIND.bandSplitAt).toBe('status')
    })

    it('names its PDF by its number', () => {
        expect(ESTIMATE_KIND.pdfStem('1001')).toBe('estimate-1001')
    })
})

describe('bigFigureText with the sales receipt kind', () => {
    it('is a dash while the total is invalid and Too large past the limit', () => {
        expect(SALES_RECEIPT_KIND.figure.label).toBe('Amount received')
        expect(bigFigureText(null, 'USD')).toBe('—')
        const item = {
            kind: 'item' as const,
            quantity: 2,
            rate: maxLineAmount,
            percentPpm: 0,
            taxable: false,
        }
        expect(bigFigureText(documentTotals([item], null), 'USD')).toBe('Too large')
    })
})
