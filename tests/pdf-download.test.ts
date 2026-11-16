import { describe, expect, it } from 'vitest'
import {
    isExpectedRefusal,
    PdfRefusalError,
    pdfDownloadName,
    pdfFileName,
    pdfPath,
    pdfRefusalMessage,
    publicEstimatePdfPath,
} from '../tinycld/books/lib/pdf-download'

describe('pdfPath', () => {
    it('builds the record-less and record routes', () => {
        expect(pdfPath('sample')).toBe('/api/books/pdf/sample')
        expect(pdfPath('invoice', 'abc123')).toBe('/api/books/pdf/invoice/abc123')
    })

    it('builds the invoice route', () => {
        expect(pdfPath('invoice', 'abc')).toBe('/api/books/pdf/invoice/abc')
    })

    it('encodes each segment', () => {
        expect(pdfPath('a/b', 'c d')).toBe('/api/books/pdf/a%2Fb/c%20d')
    })
})

// The route itself is in tests/estimate-link.test.ts; here, the token is one URI segment.
describe('publicEstimatePdfPath', () => {
    it('encodes the token', () => {
        expect(publicEstimatePdfPath('a/b c')).toBe('/api/books/public/estimates/a%2Fb%20c/pdf')
    })
})

describe('pdfFileName', () => {
    it.each([
        ['sample-invoice', 'sample-invoice.pdf'],
        ['invoice-1001', 'invoice-1001.pdf'],
        ['draft-invoice', 'draft-invoice.pdf'],
        ['Invoice 1042/"x"', 'invoice-1042-x.pdf'],
        ['../..', 'document.pdf'],
        ['Café Ltd', 'café-ltd.pdf'],
        ['日本', '日本.pdf'],
        ['हिन्दी', 'हिन्दी.pdf'],
        ['می‌خواهم', 'می‌خواهم.pdf'],
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

describe('pdfDownloadName', () => {
    it('takes the server name over the fallback', () => {
        expect(pdfDownloadName('attachment; filename="sample-invoice.pdf"', 'other')).toBe(
            'sample-invoice.pdf'
        )
    })

    it('uses the fallback stem when the header is absent or unusable', () => {
        expect(pdfDownloadName(null, 'Sample Invoice')).toBe('sample-invoice.pdf')
        expect(pdfDownloadName('inline', 'sample-invoice')).toBe('sample-invoice.pdf')
    })
})

describe('isExpectedRefusal', () => {
    it('is true only for a 4xx the server sent', () => {
        expect(isExpectedRefusal(new PdfRefusalError(403, null))).toBe(true)
        expect(isExpectedRefusal(new PdfRefusalError(404, null))).toBe(true)
        expect(isExpectedRefusal(new PdfRefusalError(500, null))).toBe(false)
        expect(isExpectedRefusal(new PdfRefusalError(502, null))).toBe(false)
        expect(isExpectedRefusal(new TypeError('Network request failed'))).toBe(false)
        expect(isExpectedRefusal(new Error('Sharing is not available on this device'))).toBe(false)
    })

    it('carries the server message', () => {
        expect(new PdfRefusalError(403, { message: 'No.' }).message).toBe('No.')
    })
})
