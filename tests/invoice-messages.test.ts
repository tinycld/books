import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { documentTotals } from '../tinycld/books/lib/document-lines'
import { INVOICE_REFUSALS } from '../tinycld/books/lib/invoice-form-fixture'
import {
    balanceDueText,
    customerInactiveText,
    INVOICE_MESSAGES,
    invoiceRefusalTarget,
} from '../tinycld/books/lib/invoice-messages'
import { maxLineAmount, maxStoredAmount } from '../tinycld/books/lib/money-text'

// The texts the client and the server both show (plan, Decisions: Messages). `%s` is
// compared as written: the client fills it with customerInactiveText, the server with
// refuseNamed.
const SHARED = {
    dueBeforeDate: 'The due date cannot be before the invoice date',
    percentTarget: 'A percent line applies to the item or subtotal right above it',
    totalNegative: 'An invoice total cannot be below zero. Use a credit memo.',
    totalTooLarge: 'The invoice total is more than Books can store.',
    tooManyLines: 'An invoice can have at most 250 lines.',
    customerInactive: '%s is inactive. Choose an active customer.',
    customerOnInvoices: '%s is on invoices. Make it inactive instead.',
} as const

const CLIENT_ONLY = {
    needItemLine: 'Add at least one product or service line',
    quantityNotPositive: 'Enter a quantity more than 0',
    quantityDecimals: 'A quantity can have at most 2 decimals',
    rateMalformed: 'Enter a rate like 1,234.50',
    rateTooLarge: 'The rate is too large',
    percentRange: 'Enter a percent from -100 to 1000',
    percentDecimals: 'A percent can have at most 4 decimals',
    quantityTooLarge: 'A quantity can be at most 1,000,000',
    noAccess: 'You need bookkeeper access to create invoices',
    notFound: 'This invoice does not exist',
    cannotEdit: 'This invoice cannot be edited',
    loadFailed: 'Books could not load this invoice.',
    customerLoadFailed: 'Books could not load this customer.',
    pdfUnsaved: 'Save a draft to see the PDF',
    pdfStale: 'Shows the last saved version',
    voidBody: 'A reversing entry is posted in the original period. The number is kept.',
} as const

// Read inside the test, so a missing file fails the drift test only.
function serverSource() {
    return readFileSync(join(__dirname, '..', 'server', 'invoices.go'), 'utf8')
}

describe('INVOICE_MESSAGES', () => {
    it('holds every shared text under its key', () => {
        expect(INVOICE_MESSAGES).toMatchObject(SHARED)
    })

    it('holds every client text under its key', () => {
        expect(INVOICE_MESSAGES).toMatchObject(CLIENT_ONLY)
    })

    it('customerInactiveText names the customer', () => {
        expect(customerInactiveText('Old Mill Bakery')).toBe(
            'Old Mill Bakery is inactive. Choose an active customer.'
        )
    })
})

describe('server/invoices.go', () => {
    for (const [key, text] of Object.entries(SHARED)) {
        it(`holds the ${key} text verbatim as a Go string`, () => {
            expect(serverSource()).toContain(`"${text}"`)
        })
    }
})

// Server refusals carry PocketBase's final period.
describe('invoiceRefusalTarget', () => {
    it('sends an inactive customer refusal to Customer', () => {
        expect(invoiceRefusalTarget('Harborview is inactive. Choose an active customer.')).toBe(
            'customer'
        )
    })

    it('sends the due date refusal to Due date', () => {
        expect(invoiceRefusalTarget('The due date cannot be before the invoice date.')).toBe(
            'due_date'
        )
    })

    it('sends any text that starts with Tax to Tax', () => {
        expect(invoiceRefusalTarget('Tax rate Old is inactive. Choose an active rate.')).toBe(
            'tax_rate'
        )
        expect(invoiceRefusalTarget('Tax group Old combined is inactive.')).toBe('tax_rate')
    })

    it('sends a "Line n:" refusal to that line, zero-based', () => {
        expect(
            invoiceRefusalTarget(
                'Line 3: Wireless access point is inactive. Choose an active product or service.'
            )
        ).toEqual({ line: 2 })
        expect(invoiceRefusalTarget(`${INVOICE_REFUSALS.inactiveProduct}.`)).toEqual({ line: 1 })
        expect(invoiceRefusalTarget('Line 12: the amount is too large.')).toEqual({ line: 11 })
    })

    it('sends every other refusal to the form root', () => {
        expect(invoiceRefusalTarget(INVOICE_REFUSALS.closeDate)).toBe('root')
        expect(invoiceRefusalTarget(INVOICE_MESSAGES.totalTooLarge)).toBe('root')
        expect(
            invoiceRefusalTarget(
                'An invoice with a total of zero cannot be posted. Add an amount or keep it as a draft.'
            )
        ).toBe('root')
    })
})

describe('balanceDueText', () => {
    const item = (quantity: number, rate: number) => ({
        kind: 'item' as const,
        quantity,
        rate,
        percentPpm: 0,
        taxable: false,
    })

    it('is a dash while the totals are invalid', () => {
        expect(balanceDueText(null, 'USD')).toBe('—')
    })

    it('is Too large when a line is over the limit', () => {
        const totals = documentTotals([item(2, maxLineAmount)], null)
        expect(totals.isTooLarge).toBe(true)
        expect(balanceDueText(totals, 'USD')).toBe('Too large')
    })

    // Every line is under maxLineAmount, so documentTotals does not flag it; the total
    // past maxStoredAmount is still more than Books can store.
    it('is Too large when the total is over maxStoredAmount and no line is', () => {
        const totals = documentTotals([item(1, 1)], null)
        const over = { ...totals, subtotal: maxStoredAmount + 1, total: maxStoredAmount + 1 }
        expect(over.isTooLarge).toBe(false)
        expect(balanceDueText(over, 'USD')).toBe('Too large')
        const under = { ...over, total: -(maxStoredAmount + 1) }
        expect(balanceDueText(under, 'USD')).toBe('Too large')
    })

    it('is the total as money', () => {
        expect(balanceDueText(documentTotals([item(1, 24_356)], null), 'USD')).toBe('$243.56')
    })
})
