// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentFormTitle } from '../tinycld/books/components/documents/DocumentForm'
import { ESTIMATE_KIND, INVOICE_KIND } from '../tinycld/books/lib/sales-document-kinds'

// The form's title (spec §3.3): an estimate has no draft, so it reads "New estimate"
// until the first save and "Estimate <number>" after it. The posting kinds keep their
// rule. Arguments: kind, the number of the document a correction replaces, whether the
// record is stored, and the stored record's number.
describe('documentFormTitle', () => {
    it('is "New estimate" on a new estimate', () => {
        expect(documentFormTitle(ESTIMATE_KIND, '', false, '')).toBe('New estimate')
    })

    it('is "Estimate <number>" on a stored estimate', () => {
        expect(documentFormTitle(ESTIMATE_KIND, '', true, '1001')).toBe('Estimate 1001')
    })

    it('keeps the invoice titles: the draft title once stored, "Edit <n>" for a correction', () => {
        expect(documentFormTitle(INVOICE_KIND, '', true, '')).toBe('Draft invoice')
        expect(documentFormTitle(INVOICE_KIND, '1004', true, '')).toBe('Edit 1004')
    })
})
