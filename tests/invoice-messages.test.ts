import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { customerInactiveText, INVOICE_MESSAGES } from '../tinycld/books/lib/invoice-messages'

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
    noAccess: 'You need bookkeeper access to create invoices',
    notFound: 'This invoice does not exist',
    cannotEdit: 'This invoice cannot be edited',
    loadFailed: 'Books could not load this invoice.',
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
