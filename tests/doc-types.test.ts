import { describe, expect, it } from 'vitest'
import { DOC_TYPES, docTypeLabel, nextNumberPreview } from '../tinycld/books/lib/doc-types'
import { DOC_TYPE_LABELS } from '../tinycld/books/lib/register'

describe('sales_receipt doc type', () => {
    it('names the Numbering card "Sales receipts" and the register Type "Sales receipt"', () => {
        expect(DOC_TYPES.sales_receipt).toEqual({ label: 'Sales receipts', noun: 'sales receipt' })
        expect(DOC_TYPE_LABELS.sales_receipt).toBe('Sales receipt')
    })
})

describe('estimate doc type', () => {
    it('names the Numbering card "Estimates" and previews the next estimate', () => {
        expect(DOC_TYPES.estimate).toEqual({ label: 'Estimates', noun: 'estimate' })
        expect(nextNumberPreview('estimate', '', '1001')).toBe('Next estimate: 1001')
    })
})

describe('docTypeLabel', () => {
    it('labels journal and falls back to the raw doc type', () => {
        expect(docTypeLabel('journal')).toBe('Journal entries')
        expect(docTypeLabel('quote')).toBe('quote')
    })

    it('labels transfer "Transfers"', () => {
        expect(docTypeLabel('transfer')).toBe('Transfers')
    })

    it('labels invoice "Invoices"', () => {
        expect(docTypeLabel('invoice')).toBe('Invoices')
    })
})

describe('nextNumberPreview', () => {
    it('joins prefix and number with no padding', () => {
        expect(nextNumberPreview('journal', 'JE-', '1001')).toBe('Next entry: JE-1001')
        expect(nextNumberPreview('journal', '', '1001')).toBe('Next entry: 1001')
        expect(nextNumberPreview('journal', 'JE-', '7')).toBe('Next entry: JE-7')
    })

    it('names the next transfer', () => {
        expect(nextNumberPreview('transfer', 'TR-', '4')).toBe('Next transfer: TR-4')
    })

    it('names the next invoice, which has no prefix', () => {
        expect(nextNumberPreview('invoice', '', '1001')).toBe('Next invoice: 1001')
    })

    it('uses a generic noun for an unknown doc type', () => {
        expect(nextNumberPreview('quote', 'Q-', '5')).toBe('Next number: Q-5')
    })

    it('shows no number for an invalid next number and does not throw', () => {
        for (const bad of ['', '1.5', 'abc']) {
            const preview = nextNumberPreview('journal', 'JE-', bad)
            expect(preview).toContain('Next entry')
            expect(preview).not.toMatch(/\d/)
        }
    })

    it('never prints exponent notation for a huge number', () => {
        const preview = nextNumberPreview('journal', 'JE-', '1'.padEnd(25, '0'))
        expect(preview).not.toMatch(/e\+/i)
        expect(preview).toBe('Next entry:')
    })

    it('falls back to the label only above 999999999', () => {
        expect(nextNumberPreview('journal', 'JE-', '1000000000')).toBe('Next entry:')
        expect(nextNumberPreview('journal', 'JE-', '999999999')).toBe('Next entry: JE-999999999')
    })

    it('reads leading zeros as the number', () => {
        expect(nextNumberPreview('journal', 'JE-', '007')).toBe('Next entry: JE-7')
    })
})
