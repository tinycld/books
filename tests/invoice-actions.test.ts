import { describe, expect, it } from 'vitest'
import { INVOICE_READ_KEYS, invoiceReadActions } from '../tinycld/books/lib/invoice-actions'

// The read view's actions by the invoice's status and the user's access (spec §3.6), and
// the keys the read view registers for them (spec §3.1 key map).
describe('invoiceReadActions', () => {
    it('offers a writer every action on a posted invoice, in bar order', () => {
        expect(invoiceReadActions('posted', true)).toEqual(['edit', 'void', 'copy', 'entry', 'pdf'])
    })

    it('offers a writer Copy, View journal entry and Download PDF on a void invoice', () => {
        expect(invoiceReadActions('void', true)).toEqual(['copy', 'entry', 'pdf'])
    })

    it('offers a reader only View journal entry and Download PDF', () => {
        expect(invoiceReadActions('posted', false)).toEqual(['entry', 'pdf'])
        expect(invoiceReadActions('void', false)).toEqual(['entry', 'pdf'])
    })
})

describe('INVOICE_READ_KEYS', () => {
    it('matches the key map: Edit E, Void V, Copy C, View journal entry J', () => {
        expect(INVOICE_READ_KEYS).toEqual({ edit: 'e', void: 'v', copy: 'c', entry: 'j' })
    })
})
