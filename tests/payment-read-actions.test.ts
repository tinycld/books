import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { useVendorRefundReadActions } from '../tinycld/books/hooks/useVendorRefundReadActions'
import { NOT_DEPOSITED } from '../tinycld/books/lib/deposit'
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

// A payment or vendor refund that a posted deposit holds (bank deposit spec §3.10): Edit
// and Void are not offered, View journal entry stays.
describe('paymentReadActions with isDeposited', () => {
    it('gives a writer on a deposited posted payment only entry', () => {
        expect(paymentReadActions('posted', true, true, true)).toEqual(['entry'])
    })

    it('gives a writer edit, void and entry when it is not deposited, or with no fourth argument', () => {
        expect(paymentReadActions('posted', true, true, false)).toEqual(['edit', 'void', 'entry'])
        expect(paymentReadActions('posted', true, true)).toEqual(['edit', 'void', 'entry'])
    })

    it('keeps a reader and a void payment at entry when deposited', () => {
        expect(paymentReadActions('posted', false, true, true)).toEqual(['entry'])
        expect(paymentReadActions('void', true, true, true)).toEqual(['entry'])
    })
})

// Both read bars take their actions from paymentReadActions, with the deposit read as its
// fourth argument: the customer payment's bar (PaymentFlowReadBar) and the vendor refund's
// hook. Neither keeps its own copy of the rule.
const BOOKS_SRC = join(__dirname, '..', 'tinycld', 'books')

// The arguments of the first `<name>(` call in a source text, split at its top level commas.
function callArguments(source: string, name: string): string[] {
    const start = source.search(new RegExp(`\\b${name}\\(`))
    if (start < 0) return []
    let depth = 0
    let current = ''
    const args: string[] = []
    for (const char of source.slice(start + name.length + 1)) {
        if (char === ')' && depth === 0) break
        if (char === '(' || char === '[' || char === '{') depth++
        if (char === ')' || char === ']' || char === '}') depth--
        if (char === ',' && depth === 0) {
            args.push(current.trim())
            current = ''
            continue
        }
        current += char
    }
    if (current.trim()) args.push(current.trim())
    return args
}

describe('the read bars that call paymentReadActions', () => {
    it.each([
        ['the payment bar', join('components', 'payments', 'PaymentReadActions.tsx')],
        ['the vendor refund hook', join('hooks', 'useVendorRefundReadActions.ts')],
    ])('%s passes the deposit read as the fourth argument', (_name, file) => {
        const source = readFileSync(join(BOOKS_SRC, file), 'utf8')
        expect(source).toMatch(
            /import\s*\{[^}]*\bpaymentReadActions\b[^}]*\}\s*from\s*'[^']*lib\/payment-read-actions'/
        )
        expect(source).toContain('depositedOffer')
        expect(callArguments(source, 'paymentReadActions')).toHaveLength(4)
    })
})

// The vendor refund's deposit read has no silent default (checkpoint 5 fix round 1): the hook
// takes it as a required argument, and the vendor refund read bar passes its own
// `depositRead` prop on, so a caller that forgets it does not offer Edit and Void on a
// deposited refund.
describe('the vendor refund read bar and its deposit read', () => {
    const hookSource = readFileSync(
        join(BOOKS_SRC, 'hooks', 'useVendorRefundReadActions.ts'),
        'utf8'
    )
    const barSource = readFileSync(
        join(BOOKS_SRC, 'components', 'vendor-refunds', 'VendorRefundReadActions.tsx'),
        'utf8'
    )

    it('takes the deposit read as a required last argument of the hook', () => {
        expect(hookSource).toMatch(
            /export function useVendorRefundReadActions\([^)]*\bdepositRead\s*:\s*DepositRead,?\s*\)/
        )
    })

    it('passes the bar its own depositRead prop as the third argument', () => {
        expect(barSource).toMatch(/\{[^}]*\bdepositRead\b[^}]*\}\s*:\s*PaymentReadBarProps/)
        const args = callArguments(barSource, 'useVendorRefundReadActions')
        expect(args).toEqual(['payment', 'canWrite', 'depositRead'])
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
        expect(useVendorRefundReadActions(POSTED_REFUND, true, NOT_DEPOSITED).offered).toEqual([
            'edit',
            'void',
            'entry',
        ])
    })

    it('offers a writer on a deposited posted refund only entry', () => {
        const held = {
            isReady: true,
            isError: false,
            deposit: { id: 'deposit00000001', number: '1002' },
        }
        expect(useVendorRefundReadActions(POSTED_REFUND, true, held).offered).toEqual(['entry'])
    })

    it('offers a writer on a void refund only entry', () => {
        expect(useVendorRefundReadActions(VOID_REFUND, true, NOT_DEPOSITED).offered).toEqual([
            'entry',
        ])
    })

    it('offers a reader only entry, posted or void', () => {
        expect(useVendorRefundReadActions(POSTED_REFUND, false, NOT_DEPOSITED).offered).toEqual([
            'entry',
        ])
        expect(useVendorRefundReadActions(VOID_REFUND, false, NOT_DEPOSITED).offered).toEqual([
            'entry',
        ])
    })

    it('names E, V and J only for the offered actions', () => {
        const keysOf = (record: typeof POSTED_REFUND | typeof VOID_REFUND, canWrite: boolean) =>
            useVendorRefundReadActions(record, canWrite, NOT_DEPOSITED).offered.map(
                (action: PaymentReadAction) => PAYMENT_READ_KEYS[action]
            )
        expect(keysOf(POSTED_REFUND, true)).toEqual(['e', 'v', 'j'])
        expect(keysOf(VOID_REFUND, true)).toEqual(['j'])
        expect(keysOf(POSTED_REFUND, false)).toEqual(['j'])
        expect(keysOf(VOID_REFUND, false)).toEqual(['j'])
    })

    it('targets the refund: its collection, its correction form and its void texts', () => {
        expect(useVendorRefundReadActions(POSTED_REFUND, true, NOT_DEPOSITED).target).toEqual({
            collection: 'books_vendor_refunds',
            editHref: 'books/vendor-refunds/new?replaces=refundposted001',
            voidBody:
                'A reversing entry is posted in the original period. The number is kept. The vendor credits it refunded are unapplied again.',
            confirmLabel: 'Void vendor refund',
            entryNoun: 'vendor refund',
        })
    })
})
