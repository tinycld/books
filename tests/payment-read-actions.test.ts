import { describe, expect, it } from 'vitest'
import { paymentReadActions } from '../tinycld/books/lib/payment-read-actions'

// The read view's actions (spec §3.7): a writer on a posted payment gets Edit, Void and
// View journal entry; a writer on a void payment and every reader only View journal entry.
describe('paymentReadActions', () => {
    it('gives a writer on a posted payment edit, void and entry', () => {
        expect(paymentReadActions('posted', true)).toEqual(['edit', 'void', 'entry'])
    })

    it('gives a writer on a void payment only entry', () => {
        expect(paymentReadActions('void', true)).toEqual(['entry'])
    })

    it('gives a reader only entry, posted or void', () => {
        expect(paymentReadActions('posted', false)).toEqual(['entry'])
        expect(paymentReadActions('void', false)).toEqual(['entry'])
    })

    it('gives a writer on a posted payment with no entry edit and void, not entry', () => {
        expect(paymentReadActions('posted', true, false)).toEqual(['edit', 'void'])
    })

    it('gives a reader of a posted payment with no entry no read action', () => {
        expect(paymentReadActions('posted', false, false)).toEqual([])
    })

    it('gives a draft no read action', () => {
        expect(paymentReadActions('draft', true)).toEqual([])
        expect(paymentReadActions('draft', false)).toEqual([])
    })
})
