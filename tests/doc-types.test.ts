import { describe, expect, it } from 'vitest'
import {
    DOC_TYPES,
    docTypeLabel,
    nextNumberPreview,
    sequenceHelper,
} from '../tinycld/books/lib/doc-types'
import { DOC_TYPE_LABELS } from '../tinycld/books/lib/register'

describe('sales_receipt doc type', () => {
    it('names the Numbering card "Sales receipts" and the register Type "Sales receipt"', () => {
        expect(DOC_TYPES.sales_receipt).toEqual({ label: 'Sales receipts', noun: 'sales receipt' })
        expect(DOC_TYPE_LABELS.sales_receipt).toBe('Sales receipt')
    })
})

describe('estimate doc type', () => {
    it('names the Numbering card "Estimates" and previews the next estimate', () => {
        expect(DOC_TYPES.estimate).toEqual({ label: 'Estimates', noun: 'estimate' })
        expect(nextNumberPreview('estimate', '', '1001')).toBe('Next estimate: 1001')
    })
})

// The Numbering card's helper names what each doc type does from now on: estimates are
// saved (they never post), every other doc type is posted.
// Settings → Numbering draws one card per sequence row, so the seeded `bill` row gets
// the "Bills" card from DOC_TYPES; registers and the ledger read "Bill" as its Type.
describe('bill doc type', () => {
    it('names the Numbering card "Bills", previews the next bill and labels the Type "Bill"', () => {
        expect(DOC_TYPES.bill).toEqual({ label: 'Bills', noun: 'bill' })
        expect(DOC_TYPE_LABELS.bill).toBe('Bill')
        expect(nextNumberPreview('bill', '', '1001')).toBe('Next bill: 1001')
        expect(sequenceHelper('bill')).toContain('applies to bills posted from now on.')
    })
})

// Settings → Numbering draws one card per sequence row, so the seeded `expense` row gets
// the "Expenses" card from DOC_TYPES; registers and the ledger read "Expense" as its Type.
describe('expense doc type', () => {
    it('names the Numbering card "Expenses" and labels the Type "Expense"', () => {
        expect(DOC_TYPES.expense).toEqual({ label: 'Expenses', noun: 'expense' })
        expect(DOC_TYPE_LABELS.expense).toBe('Expense')
    })
})

// Settings → Numbering draws one card per sequence row, so the seeded `payment` row gets
// the "Payments" card from DOC_TYPES; registers and the ledger read "Payment" as its Type.
describe('payment doc type', () => {
    it('names the Numbering card "Payments" and labels the Type "Payment"', () => {
        expect(DOC_TYPES.payment).toEqual({ label: 'Payments', noun: 'payment' })
        expect(DOC_TYPE_LABELS.payment).toBe('Payment')
        expect(nextNumberPreview('payment', '', '1001')).toBe('Next payment: 1001')
    })
})

// The seeded `bill_payment` row (booksseqbillpay) gets the "Bill payments" card; registers
// and the ledger read "Bill payment" as its Type.
describe('bill_payment doc type', () => {
    it('names the Numbering card "Bill payments" and labels the Type "Bill payment"', () => {
        expect(DOC_TYPES.bill_payment).toEqual({ label: 'Bill payments', noun: 'bill payment' })
        expect(DOC_TYPE_LABELS.bill_payment).toBe('Bill payment')
        expect(nextNumberPreview('bill_payment', '', '1001')).toBe('Next bill payment: 1001')
    })
})

// The seeded `credit_memo` row (booksseqcreditm) gets the "Credit memos" card;
// registers and the ledger read "Credit memo" as its Type.
describe('credit_memo doc type', () => {
    it('names the Numbering card "Credit memos" and labels the Type "Credit memo"', () => {
        expect(DOC_TYPES.credit_memo).toEqual({ label: 'Credit memos', noun: 'credit memo' })
        expect(DOC_TYPE_LABELS.credit_memo).toBe('Credit memo')
        expect(nextNumberPreview('credit_memo', '', '1001')).toBe('Next credit memo: 1001')
    })
})

describe('sequenceHelper', () => {
    it('says a new estimate prefix applies to estimates saved from now on', () => {
        expect(sequenceHelper('estimate')).toBe(
            'A new prefix applies to estimates saved from now on. Numbers already issued do not change. The next number can move forward only.'
        )
    })

    it('keeps the journal helper text unchanged', () => {
        expect(sequenceHelper('journal')).toBe(
            'A new prefix applies to entries posted from now on. Numbers already issued do not change. The next number can move forward only.'
        )
    })

    it('says a new invoice prefix applies to invoices posted from now on', () => {
        expect(sequenceHelper('invoice')).toContain('applies to invoices posted from now on.')
    })
})

describe('docTypeLabel', () => {
    it('labels journal and falls back to the raw doc type', () => {
        expect(docTypeLabel('journal')).toBe('Journal entries')
        expect(docTypeLabel('quote')).toBe('quote')
    })

    it('labels transfer "Transfers"', () => {
        expect(docTypeLabel('transfer')).toBe('Transfers')
    })

    it('labels invoice "Invoices"', () => {
        expect(docTypeLabel('invoice')).toBe('Invoices')
    })
})

describe('nextNumberPreview', () => {
    it('joins prefix and number with no padding', () => {
        expect(nextNumberPreview('journal', 'JE-', '1001')).toBe('Next entry: JE-1001')
        expect(nextNumberPreview('journal', '', '1001')).toBe('Next entry: 1001')
        expect(nextNumberPreview('journal', 'JE-', '7')).toBe('Next entry: JE-7')
    })

    it('names the next transfer', () => {
        expect(nextNumberPreview('transfer', 'TR-', '4')).toBe('Next transfer: TR-4')
    })

    it('names the next invoice, which has no prefix', () => {
        expect(nextNumberPreview('invoice', '', '1001')).toBe('Next invoice: 1001')
    })

    it('uses a generic noun for an unknown doc type', () => {
        expect(nextNumberPreview('quote', 'Q-', '5')).toBe('Next number: Q-5')
    })

    it('shows no number for an invalid next number and does not throw', () => {
        for (const bad of ['', '1.5', 'abc']) {
            const preview = nextNumberPreview('journal', 'JE-', bad)
            expect(preview).toContain('Next entry')
            expect(preview).not.toMatch(/\d/)
        }
    })

    it('never prints exponent notation for a huge number', () => {
        const preview = nextNumberPreview('journal', 'JE-', '1'.padEnd(25, '0'))
        expect(preview).not.toMatch(/e\+/i)
        expect(preview).toBe('Next entry:')
    })

    it('falls back to the label only above 999999999', () => {
        expect(nextNumberPreview('journal', 'JE-', '1000000000')).toBe('Next entry:')
        expect(nextNumberPreview('journal', 'JE-', '999999999')).toBe('Next entry: JE-999999999')
    })

    it('reads leading zeros as the number', () => {
        expect(nextNumberPreview('journal', 'JE-', '007')).toBe('Next entry: JE-7')
    })
})
