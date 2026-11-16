import { describe, expect, it } from 'vitest'
import {
    DOCUMENT_READ_ACTION_KEYS,
    DOCUMENT_READ_KEYS,
    DOCUMENT_TAB_KEYS,
    documentReadActions,
    receivePaymentOffered,
} from '../tinycld/books/lib/document-actions'
import {
    BILL_KIND,
    EXPENSE_KIND,
    SALES_FEATURES,
    SALES_RECEIPT_KIND,
} from '../tinycld/books/lib/sales-document-kinds'

// The read view's actions by the invoice's status and the user's access (spec §3.6), and
// the keys the read view registers for them (spec §3.1 key map).
describe('documentReadActions', () => {
    it('offers a writer every action on a posted invoice, in bar order', () => {
        expect(documentReadActions('posted', true)).toEqual([
            'edit',
            'void',
            'copy',
            'entry',
            'pdf',
        ])
    })

    it('offers a writer Copy, View journal entry and Download PDF on a void invoice', () => {
        expect(documentReadActions('void', true)).toEqual(['copy', 'entry', 'pdf'])
    })

    it('offers a reader only View journal entry and Download PDF', () => {
        expect(documentReadActions('posted', false)).toEqual(['entry', 'pdf'])
        expect(documentReadActions('void', false)).toEqual(['entry', 'pdf'])
    })
})

describe('DOCUMENT_READ_KEYS', () => {
    it('matches the key map: Edit E, Void V, Copy C, View journal entry J, Open invoice I, Receive payment R', () => {
        expect(DOCUMENT_READ_KEYS).toEqual({
            edit: 'e',
            void: 'v',
            copy: 'c',
            entry: 'j',
            invoice: 'i',
            receive_payment: 'r',
        })
    })
})

// Receive payment (receive-payment spec §3.9): a writer's action on a posted invoice with a
// balance above zero, key R, first in the bar. The read view passes `canReceivePayment`
// only for an invoice; any other kind takes the default (false).
describe('Receive payment', () => {
    const offer = { canReceivePayment: true }

    it('comes first, before Edit, for a writer on a posted invoice that can receive one', () => {
        expect(documentReadActions('posted', true, SALES_FEATURES, offer)).toEqual([
            'receive_payment',
            'edit',
            'void',
            'copy',
            'entry',
            'pdf',
        ])
    })

    it('has the key R', () => {
        expect(DOCUMENT_READ_KEYS.receive_payment).toBe('r')
        expect(DOCUMENT_READ_ACTION_KEYS.receive_payment).toBe('r')
    })

    it('is not offered without canReceivePayment', () => {
        expect(documentReadActions('posted', true)).not.toContain('receive_payment')
        expect(
            documentReadActions('posted', true, SALES_FEATURES, { canReceivePayment: false })
        ).not.toContain('receive_payment')
    })

    it('is never offered to a reader', () => {
        expect(documentReadActions('posted', false, SALES_FEATURES, offer)).toEqual([
            'entry',
            'pdf',
        ])
    })

    it('is never offered on a void invoice', () => {
        expect(documentReadActions('void', true, SALES_FEATURES, offer)).toEqual([
            'copy',
            'entry',
            'pdf',
        ])
    })

    it('is never offered on a sales receipt', () => {
        expect(documentReadActions('posted', true, SALES_RECEIPT_KIND.features)).toEqual([
            'edit',
            'void',
            'copy',
            'entry',
            'pdf',
        ])
    })
})

// When the read view offers Receive payment (spec §3.9): only on a posted invoice whose
// open balance is above zero. The read view passes the record's kind, status and balance.
describe('receivePaymentOffered', () => {
    it('is true for a posted invoice with a balance above zero', () => {
        expect(receivePaymentOffered('invoice', 'posted', 20000)).toBe(true)
    })

    it('is false for a posted invoice that is paid', () => {
        expect(receivePaymentOffered('invoice', 'posted', 0)).toBe(false)
    })

    it('is false for a void or draft invoice', () => {
        expect(receivePaymentOffered('invoice', 'void', 20000)).toBe(false)
        expect(receivePaymentOffered('invoice', 'draft', 20000)).toBe(false)
    })

    it('is false for a posted sales receipt or estimate', () => {
        expect(receivePaymentOffered('sales_receipt', 'posted', 20000)).toBe(false)
        expect(receivePaymentOffered('estimate', 'posted', 20000)).toBe(false)
    })
})

// A closed estimate's Open invoice (spec §3.2 read view keys): key I. It belongs to the
// quote lifecycle only (quoteReadActions); a posted or void document never offers it.
describe('Open invoice', () => {
    it('has the key I and is never a read action of a posting document', () => {
        expect(DOCUMENT_READ_KEYS.invoice).toBe('i')
        const posting = [
            ['posted', true],
            ['posted', false],
            ['void', true],
            ['void', false],
            ['draft', true],
        ] as const
        for (const [status, canWrite] of posting) {
            expect(documentReadActions(status, canWrite)).not.toContain('invoice')
        }
    })
})

// The sales receipt's read view (spec §3.7, §3.2): the same actions and keys as the
// invoice's, as the read actions are shared and take no kind.
describe('the sales receipt read view', () => {
    it('offers a writer Edit, Void, Copy, View journal entry and Download PDF on a posted receipt', () => {
        expect(documentReadActions('posted', true)).toEqual([
            'edit',
            'void',
            'copy',
            'entry',
            'pdf',
        ])
    })

    it('offers a writer Copy, View journal entry and Download PDF on a void receipt', () => {
        expect(documentReadActions('void', true)).toEqual(['copy', 'entry', 'pdf'])
    })

    it('offers a reader View journal entry and Download PDF', () => {
        expect(documentReadActions('posted', false)).toEqual(['entry', 'pdf'])
    })

    it('keys E, V, C, J, ⌘P and the tabs ⌥1 / ⌥2', () => {
        expect(DOCUMENT_READ_ACTION_KEYS).toEqual({
            edit: 'e',
            void: 'v',
            copy: 'c',
            entry: 'j',
            invoice: 'i',
            receive_payment: 'r',
            pdf: '$mod+p',
        })
        expect(DOCUMENT_TAB_KEYS).toEqual({ edit: 'Alt+1', pdf: 'Alt+2' })
    })
})

// The bill's read view (spec §3.6): the posting lifecycle's actions without Download PDF,
// as a bill has no PDF (`features.pdf` false, Q10). The kind's features are the third
// argument; a kind with a PDF passes SALES_FEATURES, or nothing.
describe('the bill read view', () => {
    const bill = (status: 'posted' | 'void', canWrite: boolean) =>
        documentReadActions(status, canWrite, BILL_KIND.features)

    it('has no PDF', () => {
        expect(BILL_KIND.features.pdf).toBe(false)
    })

    it('offers a writer Edit, Void, Copy and View journal entry on a posted bill', () => {
        expect(bill('posted', true)).toEqual(['edit', 'void', 'copy', 'entry'])
    })

    it('offers a writer Copy and View journal entry on a void bill', () => {
        expect(bill('void', true)).toEqual(['copy', 'entry'])
    })

    it('offers a reader View journal entry only', () => {
        expect(bill('posted', false)).toEqual(['entry'])
        expect(bill('void', false)).toEqual(['entry'])
    })

    it('never offers Download PDF', () => {
        for (const status of ['posted', 'void'] as const) {
            for (const canWrite of [true, false]) {
                expect(bill(status, canWrite)).not.toContain('pdf')
            }
        }
    })

    it('keeps Download PDF for a kind that has a PDF', () => {
        expect(documentReadActions('posted', true, SALES_FEATURES)).toContain('pdf')
    })
})

// The expense's read view (expense spec §3.8): the posting lifecycle's actions without
// Download PDF, as an expense has no PDF.
describe('the expense read view', () => {
    const expense = (status: 'posted' | 'void', canWrite: boolean) =>
        documentReadActions(status, canWrite, EXPENSE_KIND.features)

    it('offers a writer Edit, Void, Copy and View journal entry on a posted expense', () => {
        expect(expense('posted', true)).toEqual(['edit', 'void', 'copy', 'entry'])
    })

    it('offers a writer Copy and View journal entry on a void expense', () => {
        expect(expense('void', true)).toEqual(['copy', 'entry'])
    })

    it('offers a reader View journal entry only', () => {
        expect(expense('posted', false)).toEqual(['entry'])
        expect(expense('void', false)).toEqual(['entry'])
    })

    it('never offers Download PDF', () => {
        for (const status of ['posted', 'void'] as const) {
            for (const canWrite of [true, false]) {
                expect(expense(status, canWrite)).not.toContain('pdf')
            }
        }
    })
})
