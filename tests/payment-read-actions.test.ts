import { describe, expect, it } from 'vitest'
import { useVendorRefundReadActions } from '../tinycld/books/hooks/useVendorRefundReadActions'
import {
    type PaymentReadAction,
    paymentReadActions,
    voidWriteCollection,
} from '../tinycld/books/lib/payment-read-actions'
import { PAYMENT_READ_KEYS } from '../tinycld/books/lib/payment-shortcuts'

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

// Void writes `status: 'void'` on the read view's own collection (vendor refund spec §3.7):
// a vendor refund's void must not land on another payment collection.
describe('voidWriteCollection', () => {
    it.each([
        'books_payments',
        'books_bill_payments',
        'books_vendor_refunds',
    ] as const)('voids a row of %s in that collection', collection => {
        expect(voidWriteCollection(collection)).toBe(collection)
    })
})

// The vendor refund read view's actions (vendor refund spec §3.7, §3.2). The hook takes the
// record and the role, as its model useBillPaymentReadActions takes canWrite, and returns
// what the user is offered: the read view passes `offered` straight to the shared bar, which
// shows and registers a key for exactly those actions. It reads no React state, so the test
// calls it as a plain function.
const POSTED_REFUND = {
    id: 'refundposted001',
    status: 'posted' as const,
    entry: 'entryrefund0001',
    number: '1001',
}
const VOID_REFUND = { ...POSTED_REFUND, status: 'void' as const }

describe('useVendorRefundReadActions', () => {
    it('offers a writer on a posted refund edit, void and entry, in that order', () => {
        expect(useVendorRefundReadActions(POSTED_REFUND, true).offered).toEqual([
            'edit',
            'void',
            'entry',
        ])
    })

    it('offers a writer on a void refund only entry', () => {
        expect(useVendorRefundReadActions(VOID_REFUND, true).offered).toEqual(['entry'])
    })

    it('offers a reader only entry, posted or void', () => {
        expect(useVendorRefundReadActions(POSTED_REFUND, false).offered).toEqual(['entry'])
        expect(useVendorRefundReadActions(VOID_REFUND, false).offered).toEqual(['entry'])
    })

    it('names E, V and J only for the offered actions', () => {
        const keysOf = (record: typeof POSTED_REFUND | typeof VOID_REFUND, canWrite: boolean) =>
            useVendorRefundReadActions(record, canWrite).offered.map(
                (action: PaymentReadAction) => PAYMENT_READ_KEYS[action]
            )
        expect(keysOf(POSTED_REFUND, true)).toEqual(['e', 'v', 'j'])
        expect(keysOf(VOID_REFUND, true)).toEqual(['j'])
        expect(keysOf(POSTED_REFUND, false)).toEqual(['j'])
        expect(keysOf(VOID_REFUND, false)).toEqual(['j'])
    })

    it('targets the refund: its collection, its correction form and its void texts', () => {
        expect(useVendorRefundReadActions(POSTED_REFUND, true).target).toEqual({
            collection: 'books_vendor_refunds',
            editHref: 'books/vendor-refunds/new?replaces=refundposted001',
            voidBody:
                'A reversing entry is posted in the original period. The number is kept. The vendor credits it refunded are unapplied again.',
            confirmLabel: 'Void vendor refund',
            entryNoun: 'vendor refund',
        })
    })
})
