import { describe, expect, it } from 'vitest'
import { pdfFileName, pdfPath, pdfRefusalMessage } from '../tinycld/books/lib/pdf-download'

describe('pdfPath', () => {
    it('builds the record-less and record routes', () => {
        expect(pdfPath('sample')).toBe('/api/books/pdf/sample')
        expect(pdfPath('invoice', 'abc123')).toBe('/api/books/pdf/invoice/abc123')
    })

    it('encodes each segment', () => {
        expect(pdfPath('a/b', 'c d')).toBe('/api/books/pdf/a%2Fb/c%20d')
    })
})

describe('pdfFileName', () => {
    it.each([
        ['sample-invoice', 'sample-invoice.pdf'],
        ['Invoice 1042/"x"', 'invoice-1042-x.pdf'],
        ['../..', 'document.pdf'],
        ['Café Ltd', 'café-ltd.pdf'],
        ['日本', '日本.pdf'],
    ])('%j → %j', (stem, name) => {
        expect(pdfFileName(stem)).toBe(name)
    })
})

describe('pdfRefusalMessage', () => {
    it('uses the server message when there is one', () => {
        expect(pdfRefusalMessage(403, { message: 'You do not have access to Books.' })).toBe(
            'You do not have access to Books.'
        )
    })

    it('falls back to the status', () => {
        expect(pdfRefusalMessage(502, null)).toBe('The server answered 502.')
        expect(pdfRefusalMessage(500, { message: 42 })).toBe('The server answered 500.')
    })
})
