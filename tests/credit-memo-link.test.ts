import { describe, expect, it } from 'vitest'
import { invoiceLinkLabel } from '../tinycld/books/lib/credit-memo-link'

describe('invoiceLinkLabel', () => {
    it('names the posted invoice the memo credits', () => {
        expect(invoiceLinkLabel({ number: '1004', status: 'posted' })).toBe('For invoice 1004')
    })

    it('marks an invoice that was voided', () => {
        expect(invoiceLinkLabel({ number: '1004', status: 'void' })).toBe('For invoice 1004 (void)')
    })
})
