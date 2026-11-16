import { describe, expect, it } from 'vitest'
import { billPaymentReadActions } from '../tinycld/books/lib/bill-payment-read-actions'
import { PAYMENT_READ_KEYS } from '../tinycld/books/lib/payment-shortcuts'

// The bill payment read view's actions (pay-bills spec §3.8): a writer on a posted payment
// gets Edit, Void and View journal entry; a writer on a void payment and every reader only
// View journal entry. The keys are the receive-payment read keys (spec §3.1: E, V, J).
describe('billPaymentReadActions', () => {
    it('gives a writer on a posted payment edit, void and entry', () => {
        expect(billPaymentReadActions('posted', true)).toEqual(['edit', 'void', 'entry'])
    })

    it('gives a writer on a void payment only entry', () => {
        expect(billPaymentReadActions('void', true)).toEqual(['entry'])
    })

    it('gives a reader of a posted payment only entry', () => {
        expect(billPaymentReadActions('posted', false)).toEqual(['entry'])
    })

    it('gives a reader of a void payment only entry', () => {
        expect(billPaymentReadActions('void', false)).toEqual(['entry'])
    })

    it('names each action by a key of PAYMENT_READ_KEYS: E, V and J', () => {
        const keys = billPaymentReadActions('posted', true).map(action => PAYMENT_READ_KEYS[action])
        expect(keys).toEqual(['e', 'v', 'j'])
    })
})
