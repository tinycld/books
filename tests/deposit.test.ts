import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    depositReadItems,
    depositTotals,
    itemAmountText,
    itemLabel,
    itemPaymentText,
    partyNameOf,
} from '../tinycld/books/lib/deposit'
import { DOC_TYPES } from '../tinycld/books/lib/doc-types'

// The deposit's pure read helpers (bank deposit spec §3.4, §3.6, §3.8): the three totals in
// integer cents, the item's Transaction label and Payment text, an amount with money out as
// "−$20.00" (U+2212), and the Received from name. The noun cases are shared with the Go
// entry nouns (server/testdata/deposit_cases.json).

type NounCase = { docType: string; number: string; label: string }

const CASES: { nouns: NounCase[] } = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'deposit_cases.json'), 'utf8')
)

const MINUS = '−'

function payment(fields: {
    doc_type: string
    payment_method?: string
    reference_no?: string
    memo?: string
}) {
    return { payment_method: '', reference_no: '', ...fields }
}

describe('depositTotals', () => {
    it('adds the items with money in and money out, and the other funds lines with a negative fee', () => {
        const items = [{ amount: 51_250 }, { amount: 8_640 }, { amount: -2_000 }]
        const lines = [{ amount: 1_240 }, { amount: -1_500 }]
        expect(depositTotals(items, lines)).toEqual({
            itemsTotal: 57_890,
            linesTotal: -260,
            total: 57_630,
        })
    })

    it('is zero for each total with no item and no line', () => {
        expect(depositTotals([], [])).toEqual({ itemsTotal: 0, linesTotal: 0, total: 0 })
    })

    it('totals lines alone, and items alone', () => {
        expect(depositTotals([], [{ amount: 1_240 }])).toEqual({
            itemsTotal: 0,
            linesTotal: 1_240,
            total: 1_240,
        })
        expect(depositTotals([{ amount: 18_000 }], [])).toEqual({
            itemsTotal: 18_000,
            linesTotal: 0,
            total: 18_000,
        })
    })
})

describe('itemLabel', () => {
    it.each(CASES.nouns)('labels a $docType $number as "$label" (the shared noun cases)', row => {
        expect(itemLabel({ doc_type: row.docType, number: row.number })).toBe(row.label)
    })

    it('labels a journal entry "Journal entry <n>", not with its "entry" noun', () => {
        expect(itemLabel({ doc_type: 'journal', number: '12' })).toBe('Journal entry 12')
    })

    it.each(
        Object.entries(DOC_TYPES).filter(([docType]) => docType !== 'journal')
    )('labels a %s with its noun, capitalised', (docType, { noun }) => {
        const capital = `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`
        expect(itemLabel({ doc_type: docType, number: '7' })).toBe(`${capital} 7`)
    })
})

describe('itemPaymentText', () => {
    it('reads the method label and the reference no.', () => {
        expect(
            itemPaymentText(
                payment({ doc_type: 'payment', payment_method: 'check', reference_no: '98765' })
            )
        ).toBe('Check · 98765')
    })

    it('reads the method alone, and the reference alone', () => {
        expect(
            itemPaymentText(payment({ doc_type: 'sales_receipt', payment_method: 'cash' }))
        ).toBe('Cash')
        expect(itemPaymentText(payment({ doc_type: 'vendor_refund', reference_no: '7741' }))).toBe(
            '7741'
        )
    })

    it("reads a journal entry's and a transfer's line memo", () => {
        const memo = 'Cash count correction for the October farmers market float'
        expect(itemPaymentText(payment({ doc_type: 'journal', memo }))).toBe(memo)
        expect(itemPaymentText(payment({ doc_type: 'transfer', memo: 'To the float' }))).toBe(
            'To the float'
        )
    })

    it('reads nothing when the document names no method and no reference', () => {
        expect(itemPaymentText(payment({ doc_type: 'payment' }))).toBe('')
        expect(itemPaymentText(payment({ doc_type: 'journal' }))).toBe('')
    })
})

// The read view's display rows (spec §3.4, §3.8; cp2 fix round 1, item 2). An item row has
// no memo copy field: a journal entry's or a transfer's Payment text is the memo of the
// item's journal line, read through the row's `line` relation as `lineMemo`.
function readItemRow(fields: {
    id: string
    doc_type: string
    document?: string
    payment_method?: string
    reference_no?: string
    lineMemo?: string
}) {
    return {
        line: `line${fields.id}`,
        position: 0,
        entry: `entry${fields.id}`,
        amount: 18_000,
        date: '2026-11-03 00:00:00.000Z',
        number: '12',
        document: '',
        payment_method: '',
        reference_no: '',
        account: 'undepfunds00001',
        customer: '',
        vendor: '',
        customerRow: undefined,
        vendorRow: undefined,
        accountRow: undefined,
        lineMemo: undefined,
        ...fields,
    }
}

describe('depositReadItems', () => {
    it("shows a deposited journal entry's line memo as its Payment text", () => {
        const rows = depositReadItems(
            [readItemRow({ id: 'item1', doc_type: 'journal', lineMemo: 'Cash from the fair' })],
            'USD'
        )
        expect(rows.find(row => row.id === 'item1')?.payment).toBe('Cash from the fair')
    })

    it('keeps "Check · 98765" for a payment item with a method and a reference', () => {
        const rows = depositReadItems(
            [
                readItemRow({
                    id: 'item2',
                    doc_type: 'payment',
                    document: 'payment00000001',
                    payment_method: 'check',
                    reference_no: '98765',
                }),
            ],
            'USD'
        )
        expect(rows.find(row => row.id === 'item2')?.payment).toBe('Check · 98765')
    })
})

describe('itemAmountText', () => {
    it('reads money in as plain money', () => {
        expect(itemAmountText(18_000, 'USD')).toBe('$180.00')
    })

    it('reads money out with the minus sign U+2212, not a hyphen', () => {
        const text = itemAmountText(-2_000, 'USD')
        expect(text).toBe(`${MINUS}$20.00`)
        expect(text).not.toContain('-')
    })

    it('reads zero as $0.00 with no sign', () => {
        expect(itemAmountText(0, 'USD')).toBe('$0.00')
    })
})

describe('partyNameOf', () => {
    const none = { customer: '', vendor: '' }

    it("names the customer's row", () => {
        expect(
            partyNameOf({
                ...none,
                customer: 'cust_harbor_001',
                customerRow: { display_name: 'Harborview Cafe' },
            })
        ).toBe('Harborview Cafe')
    })

    it("names the vendor's row", () => {
        expect(
            partyNameOf({
                ...none,
                vendor: 'vend_office_001',
                vendorRow: { display_name: 'Office Supply Co' },
            })
        ).toBe('Office Supply Co')
    })

    it('reads "—" when the row names no party', () => {
        expect(partyNameOf(none)).toBe('—')
    })

    it('reads "—" when the party id names a row that is gone', () => {
        expect(partyNameOf({ ...none, customer: 'cust_gone_00001' })).toBe('—')
        expect(partyNameOf({ ...none, vendor: 'vend_gone_00001' })).toBe('—')
    })
})
