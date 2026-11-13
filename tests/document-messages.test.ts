import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { documentTotals } from '../tinycld/books/lib/document-lines'
import {
    bigFigureText,
    customerInactiveText,
    documentRefusalTarget,
    INVOICE_MESSAGES,
    SALES_RECEIPT_MESSAGES,
} from '../tinycld/books/lib/document-messages'
import { ESTIMATE_MESSAGES } from '../tinycld/books/lib/document-texts'
import { INVOICE_REFUSALS } from '../tinycld/books/lib/invoice-form-fixture'
import { maxLineAmount, maxStoredAmount } from '../tinycld/books/lib/money-text'
import {
    ESTIMATE_KIND,
    INVOICE_KIND,
    SALES_RECEIPT_KIND,
} from '../tinycld/books/lib/sales-document-kinds'

const invoiceRefusalTarget = (message: string) => documentRefusalTarget(message, INVOICE_KIND)

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

// The sales receipt's texts the client and the server both show (plan, Decisions:
// Messages).
const RECEIPT_SHARED = {
    totalNegative: 'A sales receipt total cannot be below zero. Use a refund receipt.',
    totalTooLarge: 'The sales receipt total is more than Books can store.',
    tooManyLines: 'A sales receipt can have at most 250 lines.',
    customerInactive: '%s is inactive. Choose an active customer.',
    customerOnInvoices: '%s is on sales receipts. Make it inactive instead.',
    depositInvalid: 'Choose an active bank or Undeposited funds account',
    depositNone: 'Add a bank account or an Undeposited funds account to the chart of accounts',
} as const

const RECEIPT_CLIENT_ONLY = {
    noAccess: 'You need bookkeeper access to create sales receipts',
    notFound: 'This sales receipt does not exist',
    cannotEdit: 'This sales receipt cannot be edited',
    loadFailed: 'Books could not load this sales receipt.',
    depositLoadFailed: 'Books could not load the deposit accounts.',
    depositRequired: 'Choose where the money was deposited',
    referenceTooLong: 'Reference no. can be at most 40 characters',
    needItemLine: 'Add at least one product or service line',
    pdfUnsaved: 'Save a draft to see the PDF',
    pdfStale: 'Shows the last saved version',
    voidBody: 'A reversing entry is posted in the original period. The number is kept.',
} as const

function receiptServerSource() {
    return readFileSync(join(__dirname, '..', 'server', 'sales_receipts.go'), 'utf8')
}

describe('SALES_RECEIPT_MESSAGES', () => {
    it('holds every shared text under its key', () => {
        expect(SALES_RECEIPT_MESSAGES).toMatchObject(RECEIPT_SHARED)
    })

    it('holds every client text under its key', () => {
        expect(SALES_RECEIPT_MESSAGES).toMatchObject(RECEIPT_CLIENT_ONLY)
    })

    it('is the sales receipt kind’s texts', () => {
        expect(SALES_RECEIPT_KIND.messages).toBe(SALES_RECEIPT_MESSAGES)
    })
})

describe('server/sales_receipts.go', () => {
    for (const [key, text] of Object.entries(RECEIPT_SHARED)) {
        it(`holds the receipt's ${key} text verbatim as a Go string`, () => {
            expect(receiptServerSource()).toContain(`"${text}"`)
        })
    }
})

// The estimate's texts the client and the server both show, whose Go constants live in
// server/estimates.go (plan, Decisions: Messages). The conversion texts are checked
// against server/estimate_conversion.go once that file exists (checkpoint 3).
const ESTIMATE_SHARED = {
    totalNegative: 'An estimate total cannot be below zero.',
    totalTooLarge: 'The estimate total is more than Books can store.',
    tooManyLines: 'An estimate can have at most 250 lines.',
    customerOnInvoices: '%s is on estimates. Make it inactive instead.',
    expirationBeforeDate: "Expiration date can't be before the estimate date",
    acceptedDateRequired: 'Enter the accepted date',
} as const

const ESTIMATE_CLIENT_ONLY = {
    customerInactive: '%s is inactive. Choose an active customer.',
    noAccess: 'You need bookkeeper access to create estimates',
    notFound: 'This estimate does not exist',
    cannotEdit: 'This estimate cannot be edited',
    loadFailed: 'Books could not load this estimate.',
    pdfUnsaved: 'Save the estimate to see its PDF',
} as const

function estimateServerSource() {
    return readFileSync(join(__dirname, '..', 'server', 'estimates.go'), 'utf8')
}

describe('ESTIMATE_MESSAGES', () => {
    it('holds every shared text under its key', () => {
        expect(ESTIMATE_MESSAGES).toMatchObject(ESTIMATE_SHARED)
    })

    it('holds the client texts under their keys', () => {
        expect(ESTIMATE_MESSAGES).toMatchObject(ESTIMATE_CLIENT_ONLY)
    })

    it('is the estimate kind’s texts', () => {
        expect(ESTIMATE_MESSAGES).toBeDefined()
        expect(ESTIMATE_KIND.messages).toBe(ESTIMATE_MESSAGES)
    })
})

describe('server/estimates.go', () => {
    for (const [key, text] of Object.entries(ESTIMATE_SHARED)) {
        it(`holds the estimate's ${key} text verbatim as a Go string, as ESTIMATE_MESSAGES does`, () => {
            expect(estimateServerSource()).toContain(`"${text}"`)
            expect(ESTIMATE_MESSAGES[key as keyof typeof ESTIMATE_SHARED]).toBe(text)
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

describe('bigFigureText', () => {
    const item = (quantity: number, rate: number) => ({
        kind: 'item' as const,
        quantity,
        rate,
        percentPpm: 0,
        taxable: false,
    })

    it('is a dash while the totals are invalid', () => {
        expect(bigFigureText(null, 'USD')).toBe('—')
    })

    it('is Too large when a line is over the limit', () => {
        const totals = documentTotals([item(2, maxLineAmount)], null)
        expect(totals.isTooLarge).toBe(true)
        expect(bigFigureText(totals, 'USD')).toBe('Too large')
    })

    // Every line is under maxLineAmount, so documentTotals does not flag it; the total
    // past maxStoredAmount is still more than Books can store.
    it('is Too large when the total is over maxStoredAmount and no line is', () => {
        const totals = documentTotals([item(1, 1)], null)
        const over = { ...totals, subtotal: maxStoredAmount + 1, total: maxStoredAmount + 1 }
        expect(over.isTooLarge).toBe(false)
        expect(bigFigureText(over, 'USD')).toBe('Too large')
        const under = { ...over, total: -(maxStoredAmount + 1) }
        expect(bigFigureText(under, 'USD')).toBe('Too large')
    })

    it('is the total as money', () => {
        expect(bigFigureText(documentTotals([item(1, 24_356)], null), 'USD')).toBe('$243.56')
    })
})
