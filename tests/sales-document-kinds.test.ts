import { describe, expect, it } from 'vitest'
import { INVOICE_KIND } from '../tinycld/books/lib/sales-document-kinds'

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
